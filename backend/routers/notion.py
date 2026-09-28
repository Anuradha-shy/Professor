"""Notion database sync.

Live mode when NOTION_TOKEN + NOTION_DATABASE_ID are present in backend/.env
(sessions become real Notion pages). Without credentials, sync runs in a
clearly-labelled simulated mode that mirrors rows locally only. The token never
leaves the server — the browser only ever talks to these /api endpoints.
"""

import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends

from lib.db import db
from models.tracker import (
    NotionLog,
    NotionMirrorRow,
    NotionStatus,
    NotionSyncOut,
    NotionTestOut,
)
from routers.auth import require_auth

router = APIRouter(prefix="/notion", tags=["notion"], dependencies=[Depends(require_auth)])

NOTION_VERSION = "2022-06-28"


class NotionApiError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


def _credentials() -> tuple[str, str]:
    return (
        os.environ.get("NOTION_TOKEN", "").strip(),
        os.environ.get("NOTION_DATABASE_ID", "").strip(),
    )


async def _log(action: str, mode: str, ok: bool, message: str) -> None:
    await db.notion_logs.insert_one(
        NotionLog(action=action, mode=mode, ok=ok, message=message).model_dump()
    )


async def _notion(method: str, path: str, body: dict | None = None) -> dict:
    token, _ = _credentials()
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(base_url="https://api.notion.com", timeout=20) as client:
            res = await client.request(method, path, headers=headers, json=body)
    except httpx.HTTPError as exc:
        raise NotionApiError(502, f"could not reach Notion: {exc}") from exc
    if res.is_error:
        raise NotionApiError(res.status_code, res.text[:300])
    return res.json()


@router.get("/status", response_model=NotionStatus)
async def status() -> NotionStatus:
    token, database_id = _credentials()
    last = await db.notion_logs.find_one(
        {"action": "sync", "ok": True}, sort=[("created_at", -1)]
    )
    return NotionStatus(
        configured=bool(token and database_id),
        token_hint=f"••••{token[-4:]}" if token else None,
        database_id=database_id or None,
        last_synced_at=last["created_at"] if last else None,
    )


@router.get("/logs", response_model=list[NotionLog])
async def logs() -> list[NotionLog]:
    docs = await db.notion_logs.find().sort([("created_at", -1)]).to_list(20)
    return [NotionLog(**d) for d in docs]


@router.get("/mirror", response_model=list[NotionMirrorRow])
async def mirror() -> list[NotionMirrorRow]:
    docs = await db.notion_mirror.find().sort([("created_at", -1)]).to_list(20)
    return [NotionMirrorRow(**d) for d in docs]


@router.post("/test", response_model=NotionTestOut)
async def test_connection() -> NotionTestOut:
    token, database_id = _credentials()
    if not (token and database_id):
        message = (
            "Not configured — add NOTION_TOKEN and NOTION_DATABASE_ID to backend/.env, "
            "then restart the backend. Until then, sync runs in simulated mode."
        )
        await _log("test", "simulated", False, message)
        return NotionTestOut(ok=False, message=message)
    try:
        data = await _notion("GET", f"/v1/databases/{database_id}")
    except NotionApiError as exc:
        message = f"Notion API error {exc.status}: {exc.message}"
        if exc.status == 404:
            message += " — share the database with your integration (••• → Add connections)."
        await _log("test", "live", False, message)
        return NotionTestOut(ok=False, message=message)
    title = "Untitled database"
    for t in data.get("title", []):
        title = t.get("plain_text") or title
    message = f"Connected to “{title}” — live sync is ready."
    await _log("test", "live", True, message)
    return NotionTestOut(ok=True, message=message, database_title=title)


@router.post("/sync", response_model=NotionSyncOut)
async def sync() -> NotionSyncOut:
    token, database_id = _credentials()
    configured = bool(token and database_id)
    mode = "live" if configured else "simulated"
    batch = (
        await db.sessions.find(
            {"notion_page_id": {"$exists": False}, "notion_simulated": {"$exists": False}}
        )
        .sort([("created_at", -1)])
        .to_list(10)
    )
    if not batch:
        return NotionSyncOut(
            ok=True, mode=mode, created=0, skipped=0,
            message="Nothing pending — every recent session is already mirrored.",
        )

    created = 0
    for s in batch:
        title = f"{s.get('subject_name', '')}: {s.get('topic', '')}".strip(": ") or "Study session"
        mirror_row = NotionMirrorRow(
            id=s["id"],
            title=title,
            subject=s.get("subject_name", ""),
            minutes=s["duration_minutes"],
            date=s["date"],
        )
        if configured:
            props = {
                "Name": {"title": [{"text": {"content": title}}]},
                "Hours": {"number": round(s["duration_minutes"] / 60, 2)},
                "Date": {"rich_text": [{"text": {"content": s["date"]}}]},
            }
            try:
                try:
                    page = await _notion(
                        "POST", "/v1/pages",
                        {"parent": {"database_id": database_id}, "properties": props},
                    )
                except NotionApiError as exc:
                    if exc.status != 400:
                        raise
                    # Database schema differs from our mapping — retry with the title alone.
                    page = await _notion(
                        "POST", "/v1/pages",
                        {
                            "parent": {"database_id": database_id},
                            "properties": {"Name": {"title": [{"text": {"content": title}}]}},
                        },
                    )
            except NotionApiError as exc:
                message = f"Notion API error {exc.status}: {exc.message}"
                await _log("sync", mode, False, message)
                return NotionSyncOut(
                    ok=False, mode=mode, created=created,
                    skipped=len(batch) - created, message=message,
                )
            mirror_row.page_id = page["id"]
            await db.sessions.update_one({"id": s["id"]}, {"$set": {"notion_page_id": page["id"]}})
        else:
            await db.sessions.update_one({"id": s["id"]}, {"$set": {"notion_simulated": True}})
        await db.notion_mirror.insert_one(mirror_row.model_dump())
        created += 1

    if configured:
        message = f"Synced {created} session{'' if created == 1 else 's'} to your Notion database."
    else:
        message = (
            f"Simulated sync of {created} session{'' if created == 1 else 's'} — live sync starts "
            "the moment NOTION_TOKEN and NOTION_DATABASE_ID are set in backend/.env."
        )
    await _log("sync", mode, True, message)
    return NotionSyncOut(ok=True, mode=mode, created=created, skipped=0, message=message)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
