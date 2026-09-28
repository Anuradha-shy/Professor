"""Notion — live two-way sync with the candidate's real database.

Auto-discovers the shared database when NOTION_DATABASE_ID is absent or wrong
(the search API returns every database the integration can see), mirrors entries
locally for instant filtering, and writes edits straight back to Notion.
"""

import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.db import db
from models.tracker import (
    NotionEntry,
    NotionEntryUpdate,
    NotionLog,
    NotionSchemaOut,
    NotionStatus,
    NotionSyncOut,
    NotionTestOut,
)
from routers.auth import require_auth

router = APIRouter(prefix="/notion", tags=["notion"], dependencies=[Depends(require_auth)])

NOTION_VERSION = "2022-06-28"
TITLE_PROP = "Name"


class NotionApiError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message
        super().__init__(message)


def _token() -> str:
    return os.environ.get("NOTION_TOKEN", "").strip()


async def _notion(method: str, path: str, body: dict | None = None) -> dict:
    token = _token()
    if not token:
        raise NotionApiError(400, "NOTION_TOKEN is not set in backend/.env")
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(base_url="https://api.notion.com", timeout=30) as client:
            res = await client.request(method, path, headers=headers, json=body)
    except httpx.HTTPError as exc:
        raise NotionApiError(502, f"could not reach Notion: {exc}") from exc
    if res.is_error:
        raise NotionApiError(res.status_code, res.text[:300])
    return res.json()


async def _database_id() -> str:
    """Env value if it looks like a real id, else the stored/discovered one."""
    meta = await db.app_meta.find_one({"key": "notion_db"})
    if meta and meta.get("database_id"):
        return str(meta["database_id"])
    env_id = os.environ.get("NOTION_DATABASE_ID", "").strip()
    if env_id and not env_id.startswith(("ntn_", "secret_")) and len(env_id.replace("-", "")) == 32:
        return env_id
    found = await _discover()
    if not found:
        raise NotionApiError(404, "No database is shared with this integration yet")
    return found


async def _list_databases() -> list[dict]:
    data = await _notion(
        "POST", "/v1/search", {"filter": {"property": "object", "value": "database"}, "page_size": 50}
    )
    return [
        {
            "id": str(item["id"]),
            "title": "".join(t.get("plain_text", "") for t in item.get("title", [])) or "Untitled",
        }
        for item in data.get("results", [])
        if item.get("object") == "database"
    ]


async def _remember(database_id: str, title: str) -> None:
    await db.app_meta.update_one(
        {"key": "notion_db"},
        {"$set": {"database_id": database_id, "title": title}},
        upsert=True,
    )


async def _discover() -> str | None:
    """Prefer the CA daily-log database, else the first one shared with the integration."""
    dbs = await _list_databases()
    if not dbs:
        return None
    chosen = next(
        (d for d in dbs if "daily log" in d["title"].lower() or d["title"].lower().startswith("ca ")),
        dbs[0],
    )
    await _remember(chosen["id"], chosen["title"])
    return chosen["id"]


def _plain(rich: list[dict]) -> str:
    return "".join(x.get("plain_text", "") for x in rich or [])


def _flatten(page: dict) -> NotionEntry:
    """Notion page → flat, filterable row (keeps files/attachments as URLs)."""
    props: dict[str, Any] = page.get("properties", {})
    values: dict[str, Any] = {}
    title = ""
    images: list[dict] = []
    for name, p in props.items():
        t = p.get("type")
        if t == "title":
            title = _plain(p["title"])
            values[name] = title
        elif t == "rich_text":
            values[name] = _plain(p["rich_text"])
        elif t == "select":
            values[name] = (p["select"] or {}).get("name", "")
        elif t == "multi_select":
            values[name] = [o["name"] for o in p.get("multi_select") or []]
        elif t == "date":
            values[name] = (p.get("date") or {}).get("start", "")
        elif t == "url":
            values[name] = p.get("url") or ""
        elif t == "checkbox":
            values[name] = bool(p.get("checkbox"))
        elif t == "number":
            values[name] = p.get("number")
        elif t == "files":
            for f in p.get("files") or []:
                url = (f.get("file") or f.get("external") or {}).get("url", "")
                if url:
                    images.append({"name": f.get("name", "attachment"), "url": url})
            values[name] = [i["name"] for i in images]
        elif t == "relation":
            values[name] = [r["id"] for r in p.get("relation") or []]
    status = str(values.get("Status") or "")
    return NotionEntry(
        page_id=page["id"],
        title=title or "Untitled",
        url=page.get("url", ""),
        status=status,
        unread=status.lower() in ("", "new"),
        place_type=str(values.get("Place Type") or ""),
        priority=str(values.get("Revision Priority") or ""),
        continents=list(values.get("Continent") or []),
        issue_types=list(values.get("Issue Type") or []),
        country_tags=list(values.get("Country/Region Tags") or []),
        months=list(values.get("Month(s) in News") or []),
        source_link=str(values.get("Source Link") or ""),
        memory_aid=str(values.get("Memory Aid (Mnemonic)") or ""),
        pyq_history=str(values.get("PYQ History") or ""),
        last_updated=str(values.get("Last Updated") or ""),
        images=images,
        last_edited_time=page.get("last_edited_time", ""),
        values=values,
    )


@router.get("/status", response_model=NotionStatus)
async def status() -> NotionStatus:
    token = _token()
    meta = await db.app_meta.find_one({"key": "notion_db"})
    last = await db.notion_logs.find_one({"action": "pull", "ok": True}, sort=[("created_at", -1)])
    cached = await db.notion_entries.count_documents({})
    database_id = None
    if meta:
        database_id = meta.get("database_id")
    return NotionStatus(
        configured=bool(token),
        token_hint=f"••••{token[-4:]}" if token else None,
        database_id=database_id,
        database_title=(meta or {}).get("title"),
        last_synced_at=last["created_at"] if last else None,
        cached_entries=cached,
        unread_entries=await db.notion_entries.count_documents({"unread": True}),
    )


@router.post("/test", response_model=NotionTestOut)
async def test_connection() -> NotionTestOut:
    if not _token():
        msg = "NOTION_TOKEN is not set in backend/.env — add it and restart the backend."
        await db.notion_logs.insert_one(NotionLog(action="test", mode="unconfigured", ok=False, message=msg).model_dump())
        return NotionTestOut(ok=False, message=msg)
    try:
        dbid = await _database_id()
        data = await _notion("GET", f"/v1/databases/{dbid}")
    except NotionApiError as exc:
        msg = f"Notion API error {exc.status}: {exc.message}"
        if exc.status == 404:
            msg += " — open the database → ••• → Add connections → select your integration."
        await db.notion_logs.insert_one(NotionLog(action="test", mode="live", ok=False, message=msg).model_dump())
        return NotionTestOut(ok=False, message=msg)
    title = "".join(t.get("plain_text", "") for t in data.get("title", [])) or "Untitled"
    msg = f"Connected live to “{title}”."
    await db.notion_logs.insert_one(NotionLog(action="test", mode="live", ok=True, message=msg).model_dump())
    return NotionTestOut(ok=True, message=msg, database_title=title, database_id=data.get("id"))


class DatabaseOption(BaseModel):
    id: str
    title: str
    active: bool = False


class DatabaseSelectIn(BaseModel):
    database_id: str


@router.get("/databases", response_model=list[DatabaseOption])
async def databases() -> list[DatabaseOption]:
    """Every database shared with the integration, with the active one flagged."""
    try:
        dbs = await _list_databases()
        active = await _database_id()
    except NotionApiError as exc:
        raise HTTPException(status_code=exc.status if exc.status != 502 else 503, detail=exc.message)
    return [
        DatabaseOption(id=d["id"], title=d["title"], active=d["id"] == active) for d in dbs
    ]


@router.post("/databases/select", response_model=NotionTestOut)
async def select_database(input: DatabaseSelectIn) -> NotionTestOut:
    """Switch the active database (e.g. the CA daily log) and clear the stale mirror."""
    try:
        data = await _notion("GET", f"/v1/databases/{input.database_id}")
    except NotionApiError as exc:
        raise HTTPException(status_code=exc.status if exc.status != 502 else 503, detail=exc.message)
    title = "".join(t.get("plain_text", "") for t in data.get("title", [])) or "Untitled"
    await _remember(str(data["id"]), title)
    await db.notion_entries.delete_many({})
    return NotionTestOut(
        ok=True, message=f"Now reading “{title}”. Hit sync to pull it in.",
        database_title=title, database_id=str(data["id"]),
    )


@router.get("/schema", response_model=NotionSchemaOut)
async def schema() -> NotionSchemaOut:
    """Select/multi-select options — powers the subject/paper-wise filter boxes."""
    try:
        dbid = await _database_id()
        data = await _notion("GET", f"/v1/databases/{dbid}")
    except NotionApiError as exc:
        raise HTTPException(status_code=exc.status if exc.status != 502 else 503, detail=exc.message)
    options: dict[str, list[str]] = {}
    for name, p in data.get("properties", {}).items():
        t = p.get("type")
        if t in ("select", "multi_select"):
            options[name] = [o["name"] for o in p[t].get("options", [])]
    return NotionSchemaOut(
        database_id=str(data.get("id")),
        title="".join(t.get("plain_text", "") for t in data.get("title", [])),
        options=options,
        property_types={n: p.get("type", "") for n, p in data.get("properties", {}).items()},
    )


@router.post("/pull", response_model=NotionSyncOut)
async def pull() -> NotionSyncOut:
    """Pull every page from Notion into the local mirror (full refresh)."""
    try:
        dbid = await _database_id()
        entries: list[NotionEntry] = []
        cursor: str | None = None
        while True:
            body: dict[str, Any] = {"page_size": 100}
            if cursor:
                body["start_cursor"] = cursor
            data = await _notion("POST", f"/v1/databases/{dbid}/query", body)
            entries.extend(_flatten(p) for p in data.get("results", []) if p.get("object") == "page")
            if not data.get("has_more"):
                break
            cursor = data.get("next_cursor")
    except NotionApiError as exc:
        msg = f"Notion API error {exc.status}: {exc.message}"
        await db.notion_logs.insert_one(NotionLog(action="pull", mode="live", ok=False, message=msg).model_dump())
        return NotionSyncOut(ok=False, mode="live", created=0, skipped=0, message=msg)

    # Preserve locally-set read flags across refreshes.
    read_pages = {
        d["page_id"] for d in await db.notion_entries.find({"unread": False}).to_list(2000)
    }
    await db.notion_entries.delete_many({})
    if entries:
        docs = []
        for e in entries:
            doc = e.model_dump()
            if e.page_id in read_pages:
                doc["unread"] = False
            docs.append(doc)
        await db.notion_entries.insert_many(docs)

    msg = f"Pulled {len(entries)} entries from Notion."
    await db.notion_logs.insert_one(NotionLog(action="pull", mode="live", ok=True, message=msg).model_dump())
    return NotionSyncOut(ok=True, mode="live", created=len(entries), skipped=0, message=msg)


@router.get("/entries", response_model=list[NotionEntry])
async def entries(
    q: str | None = None,
    place_type: str | None = None,
    continent: str | None = None,
    issue_type: str | None = None,
    priority: str | None = None,
    unread_only: bool = False,
) -> list[NotionEntry]:
    query: dict[str, Any] = {}
    if q:
        query["title"] = {"$regex": q, "$options": "i"}
    if place_type:
        query["place_type"] = place_type
    if continent:
        query["continents"] = continent
    if issue_type:
        query["issue_types"] = issue_type
    if priority:
        query["priority"] = priority
    if unread_only:
        query["unread"] = True
    docs = await db.notion_entries.find(query).sort([("last_edited_time", -1)]).to_list(300)
    return [NotionEntry(**{k: v for k, v in d.items() if k != "_id"}) for d in docs]


@router.patch("/entries/{page_id}", response_model=NotionEntry)
async def update_entry(page_id: str, input: NotionEntryUpdate) -> NotionEntry:
    """Edit a Notion entry — writes to Notion in real time, then re-mirrors it."""
    props: dict[str, Any] = {}
    if input.title is not None:
        props[TITLE_PROP] = {"title": [{"text": {"content": input.title}}]}
    if input.status is not None:
        props["Status"] = {"select": {"name": input.status}}
    if input.priority is not None:
        props["Revision Priority"] = {"select": {"name": input.priority}}
    if input.memory_aid is not None:
        props["Memory Aid (Mnemonic)"] = {"rich_text": [{"text": {"content": input.memory_aid}}]}
    if input.pyq_history is not None:
        props["PYQ History"] = {"rich_text": [{"text": {"content": input.pyq_history}}]}

    if props:
        try:
            page = await _notion("PATCH", f"/v1/pages/{page_id}", {"properties": props})
        except NotionApiError as exc:
            raise HTTPException(status_code=exc.status if exc.status != 502 else 503, detail=exc.message)
        entry = _flatten(page)
        doc = entry.model_dump()
        if input.unread is not None:
            doc["unread"] = input.unread
        else:
            existing = await db.notion_entries.find_one({"page_id": page_id})
            if existing is not None:
                doc["unread"] = existing.get("unread", entry.unread)
        await db.notion_entries.update_one({"page_id": page_id}, {"$set": doc}, upsert=True)
        return NotionEntry(**doc)

    if input.unread is not None:  # read/unread is local-only, no Notion write needed
        await db.notion_entries.update_one({"page_id": page_id}, {"$set": {"unread": input.unread}})
    doc = await db.notion_entries.find_one({"page_id": page_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not in the local mirror — pull first")
    return NotionEntry(**{k: v for k, v in doc.items() if k != "_id"})


@router.get("/logs", response_model=list[NotionLog])
async def logs() -> list[NotionLog]:
    docs = await db.notion_logs.find().sort([("created_at", -1)]).to_list(20)
    return [NotionLog(**{k: v for k, v in d.items() if k != "_id"}) for d in docs]


@router.post("/push-sessions", response_model=NotionSyncOut)
async def push_sessions() -> NotionSyncOut:
    """Push recent study sessions into the Notion database as new pages."""
    try:
        dbid = await _database_id()
    except NotionApiError as exc:
        return NotionSyncOut(ok=False, mode="live", created=0, skipped=0, message=exc.message)
    batch = (
        await db.sessions.find({"notion_page_id": {"$exists": False}})
        .sort([("created_at", -1)])
        .to_list(10)
    )
    if not batch:
        return NotionSyncOut(ok=True, mode="live", created=0, skipped=0, message="Nothing pending — all sessions are pushed.")
    created = 0
    for s in batch:
        title = f"{s.get('subject_name', '')}: {s.get('topic', '')}".strip(": ") or "Study session"
        try:
            page = await _notion(
                "POST",
                "/v1/pages",
                {"parent": {"database_id": dbid}, "properties": {TITLE_PROP: {"title": [{"text": {"content": title}}]}}},
            )
        except NotionApiError as exc:
            msg = f"Notion API error {exc.status}: {exc.message}"
            await db.notion_logs.insert_one(NotionLog(action="push", mode="live", ok=False, message=msg).model_dump())
            return NotionSyncOut(ok=False, mode="live", created=created, skipped=len(batch) - created, message=msg)
        await db.sessions.update_one({"id": s["id"]}, {"$set": {"notion_page_id": page["id"]}})
        created += 1
    msg = f"Pushed {created} session{'' if created == 1 else 's'} to Notion."
    await db.notion_logs.insert_one(NotionLog(action="push", mode="live", ok=True, message=msg).model_dump())
    return NotionSyncOut(ok=True, mode="live", created=created, skipped=0, message=msg)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
