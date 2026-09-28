"""Subjects & syllabus topics with computed progress."""

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from lib.db import db
from models.tracker import (
    Subject,
    SubjectCreate,
    SubjectOut,
    Topic,
    TopicCreate,
    TopicUpdate,
)
from routers.auth import require_auth

router = APIRouter(prefix="/subjects", tags=["subjects"], dependencies=[Depends(require_auth)])


def _out(doc: dict) -> SubjectOut:
    subject = Subject(**doc)
    total = len(subject.topics)
    done = sum(1 for t in subject.topics if t.done)
    pct = round(done / total * 100, 1) if total else 0.0
    return SubjectOut(**subject.model_dump(), total_topics=total, completed_topics=done, progress_pct=pct)


@router.get("", response_model=list[SubjectOut])
async def list_subjects() -> list[SubjectOut]:
    docs = await db.subjects.find().sort([("name", 1)]).to_list(200)
    return [_out(d) for d in docs]


@router.post("", response_model=SubjectOut, status_code=201)
async def create_subject(input: SubjectCreate) -> SubjectOut:
    subject = Subject(**input.model_dump())
    await db.subjects.insert_one(subject.model_dump())
    return _out(subject.model_dump())


@router.post("/{sid}/topics", response_model=SubjectOut)
async def add_topic(sid: str, input: TopicCreate) -> SubjectOut:
    res = await db.subjects.find_one_and_update(
        {"id": sid},
        {"$push": {"topics": Topic(name=input.name.strip()).model_dump()}},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Subject not found")
    return _out(res)


@router.patch("/{sid}/topics/{tid}", response_model=SubjectOut)
async def update_topic(sid: str, tid: str, input: TopicUpdate) -> SubjectOut:
    updates = {f"topics.$.{k}": v for k, v in input.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    res = await db.subjects.find_one_and_update(
        {"id": sid, "topics.id": tid},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Topic not found")
    return _out(res)


@router.delete("/{sid}/topics/{tid}", response_model=SubjectOut)
async def delete_topic(sid: str, tid: str) -> SubjectOut:
    res = await db.subjects.find_one_and_update(
        {"id": sid},
        {"$pull": {"topics": {"id": tid}}},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Topic not found")
    return _out(res)
