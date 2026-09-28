"""PYQ bank — the real 1,300-question UPSC Prelims master (2014–2026).

The dataset carries per-question metadata + the official answer key (no stems, as
in the source portal), so practice works exactly like the legacy OMR flow:
pick a year/subject, mark your option per question, get scored against the key.
"""

import csv
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.db import db
from lib.dates import today_iso
from models.tracker import (
    PyqAttempt,
    PyqAttemptCreate,
    PyqMeta,
    PyqQuestion,
    PyqResultItem,
)
from routers.auth import require_auth

router = APIRouter(prefix="/pyq", tags=["pyq"], dependencies=[Depends(require_auth)])

DATA_FILE = Path(__file__).parent.parent / "data" / "pyq_master_2014_2026.csv"
_CACHE: list[PyqQuestion] = []


def _load() -> list[PyqQuestion]:
    global _CACHE
    if _CACHE:
        return _CACHE
    if not DATA_FILE.exists():
        return []
    rows: list[PyqQuestion] = []
    with DATA_FILE.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            try:
                rows.append(
                    PyqQuestion(
                        id=r["id"],
                        year=int(r["year"]),
                        qnum=int(r["qnum"]),
                        subject=r["subject"],
                        subtopic=r.get("subtopic") or "",
                        difficulty=r.get("difficulty_source_tag") or "moderate",
                        format=r.get("format") or "Single-answer",
                        statement_count=int(float(r.get("statement_count") or 0)),
                        negative_stem=str(r.get("negative_stem")).lower() == "true",
                        current_affairs=str(r.get("explicit_current_affairs_tag")).lower() == "true",
                        answer=(r.get("answer") or "").strip().lower(),
                        cancelled=str(r.get("cancelled")).lower() == "true",
                    )
                )
            except (ValueError, KeyError):
                continue
    _CACHE = rows
    return rows


@router.get("/meta", response_model=PyqMeta)
async def meta() -> PyqMeta:
    qs = _load()
    years = sorted({q.year for q in qs})
    subjects = sorted({q.subject for q in qs})
    per_year = {str(y): sum(1 for q in qs if q.year == y) for y in years}
    per_subject = {s: sum(1 for q in qs if q.subject == s) for s in subjects}
    return PyqMeta(
        total=len(qs),
        years=years,
        subjects=subjects,
        per_year=per_year,
        per_subject=per_subject,
        difficulties=sorted({q.difficulty for q in qs if q.difficulty}),
    )


@router.get("/questions", response_model=list[PyqQuestion])
async def questions(
    year: int | None = None,
    subject: str | None = None,
    difficulty: str | None = None,
    limit: int = Query(default=100, le=300),
) -> list[PyqQuestion]:
    qs = _load()
    if year:
        qs = [q for q in qs if q.year == year]
    if subject:
        qs = [q for q in qs if q.subject == subject]
    if difficulty:
        qs = [q for q in qs if q.difficulty == difficulty]
    return sorted(qs, key=lambda q: (q.year, q.qnum))[:limit]


@router.get("/attempts", response_model=list[PyqAttempt])
async def list_attempts() -> list[PyqAttempt]:
    docs = await db.pyq_attempts.find().sort([("created_at", -1)]).to_list(100)
    return [PyqAttempt(**d) for d in docs]


@router.post("/attempts", response_model=PyqAttempt, status_code=201)
async def create_attempt(input: PyqAttemptCreate) -> PyqAttempt:
    """Score the marked answers against the official key and persist the attempt."""
    if not input.answers:
        raise HTTPException(status_code=422, detail="Mark at least one answer")
    by_id = {q.id: q for q in _load()}
    items: list[PyqResultItem] = []
    correct = wrong = skipped = 0
    for qid, marked in input.answers.items():
        q = by_id.get(qid)
        if not q:
            continue
        got = (marked or "").strip().lower()
        if not got:
            skipped += 1
            ok = False
        elif got == q.answer:
            correct += 1
            ok = True
        else:
            wrong += 1
            ok = False
        items.append(
            PyqResultItem(
                question_id=qid,
                year=q.year,
                qnum=q.qnum,
                subject=q.subject,
                subtopic=q.subtopic,
                marked=got,
                correct_answer=q.answer,
                is_correct=ok,
            )
        )
    if not items:
        raise HTTPException(status_code=422, detail="No known questions in this attempt")

    attempted = correct + wrong
    # UPSC Prelims marking: +2 per correct, −1/3 negative on a wrong answer.
    score = round(correct * 2 - wrong * (2 / 3), 2)
    accuracy = round(correct / attempted * 100, 1) if attempted else 0.0
    weak: dict[str, int] = {}
    for it in items:
        if not it.is_correct and it.marked:
            key = it.subtopic or it.subject
            weak[key] = weak.get(key, 0) + 1

    attempt = PyqAttempt(
        label=input.label or f"PYQ {input.year or 'mixed'} practice",
        year=input.year,
        subject=input.subject,
        total=len(items),
        correct=correct,
        wrong=wrong,
        skipped=skipped,
        score=score,
        max_score=round(len(items) * 2, 2),
        accuracy=accuracy,
        date=today_iso(),
        items=items,
        weak_topics=[k for k, _ in sorted(weak.items(), key=lambda kv: -kv[1])[:8]],
    )
    await db.pyq_attempts.insert_one(attempt.model_dump())

    # Mirror into the mock-test history so trends and insights include PYQ practice.
    from models.tracker import TestRecord

    test = TestRecord(
        name=attempt.label,
        kind="pyq",
        subject_name=input.subject or (str(input.year) if input.year else "Mixed"),
        score=attempt.score,
        max_score=attempt.max_score,
        accuracy=attempt.accuracy,
        date=attempt.date,
        weak_topics=attempt.weak_topics,
    )
    await db.tests.insert_one(test.model_dump())
    return attempt


@router.delete("/attempts/{attempt_id}", status_code=204)
async def delete_attempt(attempt_id: str) -> None:
    res = await db.pyq_attempts.delete_one({"id": attempt_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Attempt not found")
