"""Mock tests & practice records."""

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.dates import today_iso
from models.tracker import TestCreate, TestRecord
from routers.auth import require_auth

router = APIRouter(prefix="/tests", tags=["tests"], dependencies=[Depends(require_auth)])

KINDS = {"prelims_gs", "prelims_csat", "mains", "sectional"}


@router.get("", response_model=list[TestRecord])
async def list_tests() -> list[TestRecord]:
    docs = await db.tests.find().sort([("date", -1), ("created_at", -1)]).to_list(300)
    return [TestRecord(**d) for d in docs]


@router.post("", response_model=TestRecord, status_code=201)
async def create_test(input: TestCreate) -> TestRecord:
    if input.kind not in KINDS:
        raise HTTPException(status_code=422, detail="Unknown test kind")
    if input.score > input.max_score:
        raise HTTPException(status_code=422, detail="Score cannot exceed max score")
    subject_name = ""
    if input.subject_id:
        subject = await db.subjects.find_one({"id": input.subject_id})
        if not subject:
            raise HTTPException(status_code=404, detail="Unknown subject")
        subject_name = subject["short_name"]
    obj = TestRecord(
        subject_name=subject_name,
        date=input.date or today_iso(),
        **input.model_dump(exclude={"date"}),
    )
    await db.tests.insert_one(obj.model_dump())
    return obj


@router.delete("/{test_id}", status_code=204)
async def delete_test(test_id: str) -> None:
    res = await db.tests.delete_one({"id": test_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Test not found")
