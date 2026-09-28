"""Study session log."""

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.dates import today_iso
from models.tracker import StudySession, StudySessionCreate
from routers.auth import require_auth

router = APIRouter(prefix="/sessions", tags=["sessions"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[StudySession])
async def list_sessions(limit: int = 200, subject_id: str | None = None) -> list[StudySession]:
    query = {"subject_id": subject_id} if subject_id else {}
    docs = await db.sessions.find(query).sort([("date", -1), ("created_at", -1)]).to_list(limit)
    return [StudySession(**d) for d in docs]


@router.post("", response_model=StudySession, status_code=201)
async def create_session(input: StudySessionCreate) -> StudySession:
    subject = await db.subjects.find_one({"id": input.subject_id})
    if not subject:
        raise HTTPException(status_code=404, detail="Unknown subject")
    obj = StudySession(
        subject_name=subject["short_name"],
        date=input.date or today_iso(),
        **input.model_dump(exclude={"date"}),
    )
    await db.sessions.insert_one(obj.model_dump())
    return obj


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: str) -> None:
    res = await db.sessions.delete_one({"id": session_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Session not found")
