"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "subjects": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("name", ASCENDING)], name="name_asc"),
    ],
    "sessions": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("date", DESCENDING), ("created_at", DESCENDING)], name="date_created_desc"),
        IndexModel([("subject_id", ASCENDING)], name="subject_id_asc"),
    ],
    "goals": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("target_date", ASCENDING)], name="status_target"),
    ],
    "revisions": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("next_due", ASCENDING)], name="next_due_asc"),
    ],
    "tests": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("date", DESCENDING)], name="date_desc"),
    ],
    "notion_logs": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "notion_mirror": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "notion_entries": [
        IndexModel([("page_id", ASCENDING)], name="page_id", unique=True),
        IndexModel([("last_edited_time", DESCENDING)], name="edited_desc"),
        IndexModel([("unread", ASCENDING)], name="unread_asc"),
        IndexModel([("place_type", ASCENDING)], name="place_type_asc"),
        IndexModel([("priority", ASCENDING)], name="priority_asc"),
    ],
    "pyq_attempts": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "ai_messages": [
        IndexModel([("session_id", ASCENDING), ("created_at", ASCENDING)], name="session_created"),
    ],
    "ai_sessions": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("updated_at", DESCENDING)], name="updated_desc"),
    ],
    "omr_runs": [IndexModel([("date", DESCENDING)], name="date_desc")],
    "mock_attempts": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("test_code", ASCENDING)], name="test_code", unique=True),
        IndexModel([("test_date", ASCENDING)], name="test_date_asc"),
    ],
    "mock_test_files": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("attempt_id", ASCENDING), ("created_at", DESCENDING)], name="attempt_created_desc"),
    ],
    "devices": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "app_meta": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
