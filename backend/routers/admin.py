"""Fresh-start / housekeeping endpoints for the single owner of this vault."""

from fastapi import APIRouter, Depends

from lib.db import db
from models.tracker import ResetOut
from routers.auth import require_auth

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_auth)])


@router.post("/reset-progress", response_model=ResetOut)
async def reset_progress() -> ResetOut:
    """Wipe every progress signal so the tracker reads a true 0% from day one.

    Keeps subjects, the syllabus tree, goals and the Notion mirror — only the
    *achievement* data (sessions, tests, PYQ attempts, revision cadence, topic
    ticks and goal progress) goes back to zero.
    """
    sessions = (await db.sessions.delete_many({})).deleted_count
    tests = (await db.tests.delete_many({})).deleted_count
    attempts = (await db.pyq_attempts.delete_many({})).deleted_count
    revisions = (await db.revisions.delete_many({})).deleted_count

    topics_cleared = 0
    for sub in await db.subjects.find().to_list(200):
        topics = sub.get("topics") or []
        done = [t for t in topics if t.get("done")]
        if not done:
            continue
        topics_cleared += len(done)
        for t in topics:
            t["done"] = False
        await db.subjects.update_one({"id": sub["id"]}, {"$set": {"topics": topics}})

    goals = (
        await db.goals.update_many({}, {"$set": {"progress": 0, "status": "active"}})
    ).modified_count

    return ResetOut(
        ok=True,
        sessions_deleted=sessions,
        tests_deleted=tests,
        pyq_attempts_deleted=attempts,
        revisions_deleted=revisions,
        topics_cleared=topics_cleared,
        goals_reset=goals,
        message="Fresh start — every hour, test, tick and streak is back to zero.",
    )
