"""Spaced-repetition revision queue (SuperMemo-inspired intervals)."""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from lib.db import db
from lib.dates import today_iso
from models.tracker import Revision, RevisionCreate, RevisionReview
from routers.auth import require_auth

router = APIRouter(prefix="/revisions", tags=["revisions"], dependencies=[Depends(require_auth)])


def _next_interval(retention: str, current: int) -> int:
    if retention == "easy":
        return max(current + 2, int(current * 2))
    if retention == "good":
        return max(current + 1, int(current * 1.4))
    return 1  # hard: relearn tomorrow


@router.get("", response_model=list[Revision])
async def list_revisions() -> list[Revision]:
    docs = await db.revisions.find().sort([("next_due", 1)]).to_list(300)
    return [Revision(**d) for d in docs]


@router.post("", response_model=Revision, status_code=201)
async def create_revision(input: RevisionCreate) -> Revision:
    subject = await db.subjects.find_one({"id": input.subject_id})
    if not subject:
        raise HTTPException(status_code=404, detail="Unknown subject")
    obj = Revision(
        subject_name=subject["short_name"],
        next_due=input.next_due or today_iso(),
        **input.model_dump(exclude={"next_due"}),
    )
    await db.revisions.insert_one(obj.model_dump())
    return obj


@router.post("/{rid}/review", response_model=Revision)
async def review_revision(rid: str, input: RevisionReview) -> Revision:
    if input.retention not in {"easy", "good", "hard"}:
        raise HTTPException(status_code=422, detail="Retention must be easy, good or hard")
    doc = await db.revisions.find_one({"id": rid})
    if not doc:
        raise HTTPException(status_code=404, detail="Revision not found")
    interval = _next_interval(input.retention, int(doc.get("interval_days", 1)))
    next_due = (dt.date.fromisoformat(today_iso()) + dt.timedelta(days=interval)).isoformat()
    updated = await db.revisions.find_one_and_update(
        {"id": rid},
        {
            "$set": {"interval_days": interval, "next_due": next_due, "last_revised": today_iso()},
            "$inc": {"review_count": 1},
        },
        return_document=ReturnDocument.AFTER,
    )
    return Revision(**updated)


@router.delete("/{rid}", status_code=204)
async def delete_revision(rid: str) -> None:
    res = await db.revisions.delete_one({"id": rid})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Revision not found")
