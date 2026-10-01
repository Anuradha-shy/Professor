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
from pymongo import UpdateOne

from lib.db import db
from models.tracker import (
    NotionEntry,
    NotionContentBlock,
    NotionEntryUpdate,
    NotionLog,
    NotionPageContent,
    NotionSchemaOut,
    NotionStatus,
    NotionSyncOut,
    NotionTestOut,
)
from routers.auth import require_auth

router = APIRouter(prefix="/notion", tags=["notion"], dependencies=[Depends(require_auth)])

NOTION_VERSION = os.environ.get("NOTION_VERSION", "2025-09-03")
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
    databases: list[dict] = []
    cursor: str | None = None
    while True:
        body: dict[str, Any] = {
            "filter": {"property": "object", "value": "database"},
            "page_size": 100,
        }
        if cursor:
            body["start_cursor"] = cursor
        data = await _notion("POST", "/v1/search", body)
        databases.extend(
            {
                "id": str(item["id"]),
                "title": "".join(t.get("plain_text", "") for t in item.get("title", [])) or "Untitled",
            }
            for item in data.get("results", [])
            if item.get("object") == "database"
        )
        if not data.get("has_more"):
            return databases
        cursor = data.get("next_cursor")


async def _data_source_id(database_id: str) -> str | None:
    """Resolve a modern Notion data source, retaining compatibility with legacy databases."""
    database = await _notion("GET", f"/v1/databases/{database_id}")
    sources = database.get("data_sources") or []
    configured = os.environ.get("NOTION_DATA_SOURCE_ID", "").strip()
    if configured and any(str(source.get("id")) == configured for source in sources):
        return configured
    if sources:
        return str(sources[0].get("id") or "") or None
    if configured and database_id == await _database_id():
        return configured
    return None


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


def _property_text(value: Any) -> Any:
    if isinstance(value, list):
        return [_property_text(item) for item in value]
    if not isinstance(value, dict):
        return value
    if "plain_text" in value:
        return value.get("plain_text", "")
    if "name" in value:
        return value.get("name", "")
    if "title" in value and isinstance(value["title"], list):
        return _plain(value["title"])
    if "rich_text" in value and isinstance(value["rich_text"], list):
        return _plain(value["rich_text"])
    for key in ("string", "number", "boolean", "date", "url", "email", "phone_number"):
        if key in value:
            return _property_text(value[key])
    if "array" in value and isinstance(value["array"], list):
        return [_property_text(item) for item in value["array"]]
    if "start" in value and set(value).issubset({"start", "end", "time_zone"}):
        start = str(value.get("start") or "")
        end = str(value.get("end") or "")
        return f"{start} – {end}" if end else start
    return {key: _property_text(item) for key, item in value.items() if key not in ("id", "object")}


def _flatten(page: dict, database_id: str = "", database_title: str = "") -> NotionEntry:
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
        elif t == "status":
            values[name] = (p.get("status") or {}).get("name", "")
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
        elif t in ("people", "created_by", "last_edited_by"):
            people = p.get(t) or []
            if isinstance(people, dict):
                people = [people]
            values[name] = [person.get("name", "") for person in people if person.get("name")]
        elif t in ("created_time", "last_edited_time", "email", "phone_number"):
            values[name] = p.get(t) or ""
        elif t in ("formula", "rollup"):
            values[name] = _property_text(p.get(t) or {})
        elif t == "unique_id":
            unique_id = p.get(t) or {}
            values[name] = f"{unique_id.get('prefix') or ''}{unique_id.get('number', '')}"
        elif t == "verification":
            values[name] = (p.get(t) or {}).get("state", "")
        elif t == "button":
            values[name] = "Button"
    status = str(values.get("Status") or "")
    return NotionEntry(
        page_id=page["id"],
        database_id=database_id or str((page.get("parent") or {}).get("database_id") or ""),
        database_title=database_title,
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
    return NotionTestOut(
        ok=True, message=f"Writes now target “{title}”.",
        database_title=title, database_id=str(data["id"]),
    )


@router.get("/schema", response_model=NotionSchemaOut)
async def schema() -> NotionSchemaOut:
    """Select/multi-select options — powers the subject/paper-wise filter boxes."""
    try:
        dbid = await _database_id()
        data = await _notion("GET", f"/v1/databases/{dbid}")
        source_id = await _data_source_id(dbid)
        if source_id:
            data = await _notion("GET", f"/v1/data_sources/{source_id}")
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
async def pull(all_databases: bool = True) -> NotionSyncOut:
    """Pull pages into the local mirror — every shared database by default."""
    try:
        if all_databases:
            targets = await _list_databases()
        else:
            active = await _database_id()
            targets = [d for d in await _list_databases() if d["id"] == active] or [
                {"id": active, "title": ""}
            ]
        entries: list[NotionEntry] = []
        for target in targets:
            source_id = await _data_source_id(target["id"])
            query_path = f"/v1/data_sources/{source_id}/query" if source_id else f"/v1/databases/{target['id']}/query"
            cursor: str | None = None
            while True:
                body: dict[str, Any] = {"page_size": 100}
                if cursor:
                    body["start_cursor"] = cursor
                data = await _notion("POST", query_path, body)
                entries.extend(
                    _flatten(p, target["id"], target["title"])
                    for p in data.get("results", [])
                    if p.get("object") == "page"
                )
                if not data.get("has_more"):
                    break
                cursor = data.get("next_cursor")
    except NotionApiError as exc:
        msg = f"Notion API error {exc.status}: {exc.message}"
        await db.notion_logs.insert_one(NotionLog(action="pull", mode="live", ok=False, message=msg).model_dump())
        return NotionSyncOut(ok=False, mode="live", created=0, skipped=0, message=msg)

    page_ids = [entry.page_id for entry in entries]
    cached_docs = await db.notion_entries.find({"page_id": {"$in": page_ids}}).to_list(len(page_ids)) if page_ids else []
    cached_by_page = {doc["page_id"]: doc for doc in cached_docs}
    operations = []
    for entry in entries:
        doc = entry.model_dump()
        cached = cached_by_page.get(entry.page_id)
        if cached:
            doc["unread"] = cached.get("unread", doc["unread"])
            if cached.get("last_edited_time") == entry.last_edited_time:
                doc["content"] = cached.get("content", [])
                doc["content_blocks"] = cached.get("content_blocks", [])
                doc["content_last_edited_time"] = cached.get("content_last_edited_time", "")
                update = {"$set": doc}
            else:
                for field in ("content", "content_blocks", "content_last_edited_time"):
                    doc.pop(field, None)
                update = {
                    "$set": doc,
                    "$unset": {"content": "", "content_blocks": "", "content_last_edited_time": ""},
                }
        else:
            update = {"$set": doc}
        operations.append(UpdateOne({"page_id": entry.page_id}, update, upsert=True))
    if operations:
        await db.notion_entries.bulk_write(operations, ordered=False)
    for target in targets:
        current_ids = [entry.page_id for entry in entries if entry.database_id == target["id"]]
        await db.notion_entries.delete_many({"database_id": target["id"], "page_id": {"$nin": current_ids}})

    msg = f"Pulled {len(entries)} entries from Notion."
    await db.notion_logs.insert_one(NotionLog(action="pull", mode="live", ok=True, message=msg).model_dump())
    return NotionSyncOut(ok=True, mode="live", created=len(entries), skipped=0, message=msg)


@router.get("/entries", response_model=list[NotionEntry])
async def entries(
    q: str | None = None,
    database_id: str | None = None,
    place_type: str | None = None,
    continent: str | None = None,
    issue_type: str | None = None,
    priority: str | None = None,
    unread_only: bool = False,
) -> list[NotionEntry]:
    query: dict[str, Any] = {}
    if database_id and database_id != "all":
        query["database_id"] = database_id
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
    docs = await db.notion_entries.find(query).sort([("last_edited_time", -1)]).to_list(10_000)
    return [NotionEntry(**{k: v for k, v in d.items() if k != "_id"}) for d in docs]


def _block_text(block: dict) -> str:
    kind = block.get("type", "")
    data = block.get(kind) or {}
    if isinstance(data, dict):
        rich_text = data.get("rich_text") or data.get("title") or []
        text = _plain(rich_text) if isinstance(rich_text, list) else ""
        if kind == "to_do":
            return f"{'[x]' if data.get('checked') else '[ ]'} {text}".strip()
        if kind == "child_page":
            return str(data.get("title") or "")
        if kind == "bookmark":
            return str(data.get("url") or text)
        if kind == "table_row":
            return " | ".join(_plain(cell) for cell in data.get("cells", []))
        return text
    return ""


async def _read_page_blocks(block_id: str, depth: int = 0) -> tuple[list[dict[str, Any]], list[dict]]:
    if depth > 4:
        return [], []
    content: list[dict[str, Any]] = []
    images: list[dict] = []
    cursor: str | None = None
    while True:
        path = f"/v1/blocks/{block_id}/children?page_size=100"
        if cursor:
            path += f"&start_cursor={cursor}"
        data = await _notion("GET", path)
        for block in data.get("results", []):
            kind = block.get("type", "")
            line = _block_text(block)
            if line.strip():
                content.append({"type": kind, "text": line.strip(), "depth": depth})
            if kind in ("image", "file"):
                file_data = block.get(kind) or {}
                url = (file_data.get("file") or file_data.get("external") or {}).get("url", "")
                if url:
                    images.append({
                        "name": _plain(file_data.get("caption", [])) or kind.title(),
                        "url": url,
                    })
            if block.get("has_children"):
                nested_content, nested_images = await _read_page_blocks(str(block["id"]), depth + 1)
                content.extend(nested_content)
                images.extend(nested_images)
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return content, images


@router.get("/entries/{page_id}/content", response_model=NotionPageContent)
async def entry_content(page_id: str) -> NotionPageContent:
    """Fetch and cache full page-body text and attachments when an entry is opened."""
    cached = await db.notion_entries.find_one({"page_id": page_id})
    if not cached:
        raise HTTPException(status_code=404, detail="Entry not in the local mirror — pull first")
    if cached.get("content") and cached.get("content_last_edited_time") == cached.get("last_edited_time"):
        return NotionPageContent(
            content=cached.get("content", []),
            blocks=cached.get("content_blocks", []),
            images=cached.get("images", []),
        )
    try:
        blocks, block_images = await _read_page_blocks(page_id)
    except NotionApiError as exc:
        if cached.get("content") or cached.get("images"):
            return NotionPageContent(
                content=cached.get("content", []),
                blocks=cached.get("content_blocks", []),
                images=cached.get("images", []),
            )
        raise HTTPException(status_code=exc.status if exc.status != 502 else 503, detail=exc.message)
    content = [block["text"] for block in blocks]
    images = cached.get("images", []) + block_images
    unique_images = list({item.get("url"): item for item in images if item.get("url")}.values())
    await db.notion_entries.update_one(
        {"page_id": page_id}, {"$set": {"content": content, "content_blocks": blocks, "content_last_edited_time": cached.get("last_edited_time", ""), "images": unique_images}}
    )
    return NotionPageContent(content=content, blocks=blocks, images=unique_images)


@router.patch("/entries/{page_id}", response_model=NotionEntry)
async def update_entry(page_id: str, input: NotionEntryUpdate) -> NotionEntry:
    """Edit a Notion entry — writes to Notion in real time, then re-mirrors it."""
    existing = await db.notion_entries.find_one({"page_id": page_id})
    props: dict[str, Any] = {}
    if input.title is not None:
        values = (existing or {}).get("values", {})
        title_prop = next(
            (name for name in values if name.lower() in {"name", "article title"}),
            next((name for name, value in values.items() if value == (existing or {}).get("title")), TITLE_PROP),
        )
        props[title_prop] = {"title": [{"text": {"content": input.title}}]}
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
        if existing:
            doc["database_id"] = doc["database_id"] or existing.get("database_id", "")
            doc["database_title"] = existing.get("database_title", "")
            doc["content"] = existing.get("content", [])
            doc["content_blocks"] = existing.get("content_blocks", [])
            doc["content_last_edited_time"] = (
                entry.last_edited_time if existing.get("content") else ""
            )
        if input.unread is not None:
            doc["unread"] = input.unread
        elif existing is not None:
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
