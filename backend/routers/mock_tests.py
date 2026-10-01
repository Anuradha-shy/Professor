"""Scheduled, code-gated UPSC mock tests with durable answer and OMR records."""

import base64
import csv
import hashlib
import hmac
import json
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from lib.ai import agent_turn, vision_completion
from lib.db import db
from routers.auth import require_auth

router = APIRouter(prefix="/training", tags=["scheduled-mocks"], dependencies=[Depends(require_auth)])
TZ = ZoneInfo("Asia/Kolkata")
SCHEDULE_FILE = Path(__file__).parent.parent / "data" / "mock_schedule_2027.csv"
TEST_DURATION_MINUTES = 120
ACCESS_LEAD_MINUTES = 2
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


class UnlockIn(BaseModel):
    code: str


class AnswersUpdate(BaseModel):
    answers: dict[str, str] | None = None
    round1_count: int | None = Field(default=None, ge=0, le=100)
    round1_seconds: int | None = Field(default=None, ge=0, le=7200)
    round2_count: int | None = Field(default=None, ge=0, le=100)
    round2_seconds: int | None = Field(default=None, ge=0, le=7200)
    question_tags: dict[str, dict[str, str]] | None = None


class AnswerKeyIn(BaseModel):
    answer_key: str


class QuestionTagsIn(BaseModel):
    question_tags: dict[str, dict[str, str]]


class CandidateAnswersIn(BaseModel):
    answers: dict[str, str]


class SubmitIn(BaseModel):
    answers: dict[str, str] | None = None
    round1_count: int | None = Field(default=None, ge=0, le=100)
    round1_seconds: int | None = Field(default=None, ge=0, le=7200)
    round2_count: int | None = Field(default=None, ge=0, le=100)
    round2_seconds: int | None = Field(default=None, ge=0, le=7200)


def _schedule() -> list[dict[str, str]]:
    with SCHEDULE_FILE.open(newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


def _test(test_code: str) -> dict[str, str]:
    row = next((item for item in _schedule() if item["test_code"] == test_code), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Scheduled mock not found")
    return row


def _times(row: dict[str, str]) -> tuple[datetime, datetime, datetime]:
    starts = datetime.combine(date.fromisoformat(row["date"]), time(9, 30), TZ)
    ends = starts + timedelta(minutes=TEST_DURATION_MINUTES)
    return starts - timedelta(minutes=ACCESS_LEAD_MINUTES), starts, ends


def _parse_key(text: str) -> dict[str, str]:
    answers: dict[str, str] = {}
    for line in text.replace(";", "\n").replace(",", "\n").splitlines():
        parts = line.strip().replace(".", " ").replace(":", " ").replace("-", " ").split()
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].lower()[:1] in "abcd":
            number = int(parts[0])
            if 1 <= number <= 100:
                answers[str(number)] = parts[1].lower()[:1]
    return answers


def _score_answers(
    answers: dict[str, str],
    key: dict[str, str],
    tags: dict[str, dict[str, str]] | None = None,
) -> dict[str, Any]:
    rows = []
    correct = wrong = blank = 0
    tags = tags or {}
    for number in range(1, 101):
        question = str(number)
        selected = (answers.get(question) or "").lower()
        expected = (key.get(question) or "").lower()
        result = "blank" if not selected else "correct" if selected == expected else "wrong"
        correct += result == "correct"
        wrong += result == "wrong"
        blank += result == "blank"
        rows.append({"question": number, "selected": selected, "correct_answer": expected, "result": result, **(tags.get(question) or {})})
    attempted = correct + wrong
    score = round(correct * 2 - wrong * (2 / 3), 2)
    accuracy = round(correct / attempted * 100, 1) if attempted else 0.0
    return {"total": 100, "correct": correct, "wrong": wrong, "blank": blank, "score": score, "max_score": 200, "accuracy": accuracy, "question_results": rows}


def _safe_attempt(doc: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in doc.items() if key not in {"_id", "access_hash"}}


async def _attempt(attempt_id: str) -> dict[str, Any]:
    doc = await db.mock_attempts.find_one({"id": attempt_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Mock attempt not found")
    return doc


async def _file_list(attempt_id: str) -> list[dict[str, Any]]:
    docs = await db.mock_test_files.find({"attempt_id": attempt_id}).to_list(30)
    return [
        {key: item.get(key) for key in ("id", "kind", "filename", "content_type", "size", "created_at")}
        for item in docs
    ]


@router.get("/schedule")
async def schedule() -> list[dict[str, Any]]:
    now = datetime.now(TZ)
    rows = []
    for row in _schedule():
        access, starts, ends = _times(row)
        existing = await db.mock_attempts.find_one({"test_code": row["test_code"]})
        if existing and now >= ends and not existing.get("submitted_at"):
            await db.mock_attempts.update_one(
                {"id": existing["id"]},
                {"$set": {"submitted_at": ends, "state": "submitted", "updated_at": now}},
            )
            existing["submitted_at"] = ends
            existing["state"] = "submitted"
        state = (
            "evaluated" if existing and existing.get("evaluation")
            else "submitted" if existing and existing.get("submitted_at")
            else "active" if existing and starts <= now < ends
            else "unlocked" if existing
            else "scheduled" if now < access
            else "available" if now < ends
            else "missed"
        )
        rows.append({
            **{key: value for key, value in row.items() if key != "access_code"},
            "access_at": access.isoformat(),
            "start_at": starts.isoformat(),
            "end_at": ends.isoformat(),
            "duration_minutes": TEST_DURATION_MINUTES,
            "question_count": 100,
            "state": state,
            "attempt_id": existing.get("id") if existing else None,
        })
    return rows


@router.post("/{test_code}/unlock")
async def unlock(test_code: str, input: UnlockIn) -> dict[str, Any]:
    row = _test(test_code)
    access, starts, ends = _times(row)
    now = datetime.now(TZ)
    expected = row["access_code"].strip().upper()
    supplied = input.code.strip().upper()
    matches = hmac.compare_digest(hashlib.sha256(supplied.encode()).digest(), hashlib.sha256(expected.encode()).digest())
    if not matches:
        raise HTTPException(status_code=401, detail="Incorrect test access code")
    if not access <= now < ends:
        raise HTTPException(status_code=423, detail="This mock opens at 09:28 IST and locks at 11:30 IST on its scheduled date")

    attempt = await db.mock_attempts.find_one({"test_code": test_code})
    if attempt is None:
        attempt = {
            "id": str(uuid.uuid4()),
            "test_code": test_code,
            "test_date": row["date"],
            "name": f"{row['series']} · {row['subject']}",
            "answers": {str(number): "" for number in range(1, 101)},
            "detected_answers": {},
            "official_key": {},
            "question_tags": {},
            "round1_count": 0,
            "round1_seconds": 0,
            "round2_count": 0,
            "round2_seconds": 0,
            "state": "unlocked",
            "created_at": now,
            "submitted_at": None,
            "evaluated_at": None,
        }
        try:
            await db.mock_attempts.insert_one(attempt)
        except DuplicateKeyError:
            attempt = await db.mock_attempts.find_one({"test_code": test_code})
    return {
        "attempt": _safe_attempt(attempt),
        "schedule": {"access_at": access.isoformat(), "start_at": starts.isoformat(), "end_at": ends.isoformat(), "subject": row["subject"], "scope": row["scope"]},
        "files": await _file_list(attempt["id"]),
    }


@router.get("/attempts/{attempt_id}")
async def get_attempt(attempt_id: str) -> dict[str, Any]:
    attempt = await _attempt(attempt_id)
    row = _test(attempt["test_code"])
    access, starts, ends = _times(row)
    now = datetime.now(TZ)
    if now >= ends and not attempt.get("submitted_at"):
        await db.mock_attempts.update_one(
            {"id": attempt_id},
            {"$set": {"submitted_at": ends, "state": "submitted", "updated_at": now}},
        )
        attempt["submitted_at"] = ends
        attempt["state"] = "submitted"
    return {
        "attempt": _safe_attempt(attempt),
        "schedule": {"access_at": access.isoformat(), "start_at": starts.isoformat(), "end_at": ends.isoformat(), "subject": row["subject"], "scope": row["scope"]},
        "files": await _file_list(attempt_id),
        "editable": starts <= now < ends and attempt.get("submitted_at") is None,
    }


@router.patch("/attempts/{attempt_id}")
async def update_attempt(attempt_id: str, input: AnswersUpdate) -> dict[str, Any]:
    attempt = await _attempt(attempt_id)
    _, starts, ends = _times(_test(attempt["test_code"]))
    now = datetime.now(TZ)
    if now < starts or now >= ends or attempt.get("submitted_at"):
        raise HTTPException(status_code=423, detail="Answers are editable only from 09:30 to 11:30 IST")
    updates: dict[str, Any] = {"updated_at": now}
    if input.answers is not None:
        normalized: dict[str, str] = {}
        for question, answer in input.answers.items():
            if question.isdigit() and 1 <= int(question) <= 100:
                option = answer.strip().lower()[:1]
                normalized[str(int(question))] = option if option in {"a", "b", "c", "d"} else ""
        updates["answers"] = normalized
    for field in ("round1_count", "round1_seconds", "round2_count", "round2_seconds", "question_tags"):
        value = getattr(input, field)
        if value is not None:
            updates[field] = value
    round_seconds = sum(
        int(updates.get(field, attempt.get(field, 0)) or 0)
        for field in ("round1_seconds", "round2_seconds")
    )
    if round_seconds > TEST_DURATION_MINUTES * 60:
        raise HTTPException(status_code=422, detail="Combined round time cannot exceed the 120-minute test")
    await db.mock_attempts.update_one({"id": attempt_id}, {"$set": updates})
    return _safe_attempt(await _attempt(attempt_id))


@router.post("/attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: str, input: SubmitIn | None = None) -> dict[str, Any]:
    attempt = await _attempt(attempt_id)
    _, starts, ends = _times(_test(attempt["test_code"]))
    now = datetime.now(TZ)
    if now < starts:
        raise HTTPException(status_code=423, detail="The scheduled test has not started")
    if attempt.get("submitted_at"):
        return _safe_attempt(attempt)
    updates: dict[str, Any] = {"submitted_at": min(now, ends), "state": "submitted", "updated_at": now}
    if input is not None:
        if input.answers is not None:
            updates["answers"] = {
                str(int(question)): (str(answer).strip().lower()[:1] if str(answer).strip().lower()[:1] in {"a", "b", "c", "d"} else "")
                for question, answer in input.answers.items()
                if str(question).isdigit() and 1 <= int(question) <= 100
            }
        for field in ("round1_count", "round1_seconds", "round2_count", "round2_seconds"):
            value = getattr(input, field)
            if value is not None:
                updates[field] = value
    round_seconds = sum(int(updates.get(field, attempt.get(field, 0)) or 0) for field in ("round1_seconds", "round2_seconds"))
    if round_seconds > TEST_DURATION_MINUTES * 60:
        raise HTTPException(status_code=422, detail="Combined round time cannot exceed the 120-minute test")
    await db.mock_attempts.update_one({"id": attempt_id}, {"$set": updates})
    return _safe_attempt(await _attempt(attempt_id))


@router.put("/attempts/{attempt_id}/candidate-answers")
async def save_candidate_answers(attempt_id: str, input: CandidateAnswersIn) -> dict[str, Any]:
    """Save post-test OMR transcription/manual review without reopening the timed exam."""
    attempt = await _attempt(attempt_id)
    if not attempt.get("submitted_at"):
        raise HTTPException(status_code=423, detail="Candidate answer transcription opens after the test is submitted")
    if attempt.get("evaluation"):
        raise HTTPException(status_code=423, detail="This attempt has been evaluated and is locked")
    answers: dict[str, str] = {}
    for question, answer in input.answers.items():
        if not str(question).isdigit() or not 1 <= int(question) <= 100:
            continue
        option = str(answer).strip().lower()[:1]
        answers[str(int(question))] = option if option in {"a", "b", "c", "d"} else ""
    await db.mock_attempts.update_one(
        {"id": attempt_id},
        {"$set": {"answers": answers, "answer_source": "post-test transcription", "updated_at": datetime.now(TZ)}},
    )
    return _safe_attempt(await _attempt(attempt_id))


@router.post("/attempts/{attempt_id}/files")
async def upload_file(attempt_id: str, kind: str = Form(...), file: UploadFile = File(...)) -> dict[str, Any]:
    await _attempt(attempt_id)
    if kind not in {"question-paper", "omr-sheet", "official-key"}:
        raise HTTPException(status_code=422, detail="Unknown mock file type")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Choose a non-empty file smaller than 8 MB")
    content_type = file.content_type or "application/octet-stream"
    image_types = {"image/jpeg", "image/png", "image/webp"}
    if kind == "question-paper" and content_type not in image_types | {"application/pdf"}:
        raise HTTPException(status_code=415, detail="Question papers must be PDF or image files")
    if kind != "question-paper" and content_type not in image_types:
        raise HTTPException(status_code=415, detail="OMR and answer-key scans must be JPG, PNG or WebP images")
    doc = {
        "id": str(uuid.uuid4()), "attempt_id": attempt_id, "kind": kind,
        "filename": file.filename or "upload", "content_type": content_type,
        "size": len(content), "data": base64.b64encode(content).decode("ascii"),
        "created_at": datetime.now(TZ),
    }
    await db.mock_test_files.insert_one(doc)
    return {key: doc[key] for key in ("id", "kind", "filename", "content_type", "size", "created_at")}


@router.get("/attempts/{attempt_id}/files/{file_id}")
async def download_file(attempt_id: str, file_id: str) -> Response:
    doc = await db.mock_test_files.find_one({"id": file_id, "attempt_id": attempt_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Mock upload not found")
    filename = (doc["filename"] or "upload").replace('"', "")
    return Response(
        content=base64.b64decode(doc["data"]), media_type=doc["content_type"],
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


async def _scan(file_doc: dict[str, Any], purpose: str) -> tuple[dict[str, str], str, str]:
    if not file_doc["content_type"].startswith("image/"):
        raise HTTPException(status_code=415, detail="AI scan currently reads image files; uploaded PDFs remain saved for review")
    if purpose == "omr":
        prompt = (
            "Read this 100-question UPSC OMR response sheet. Return only JSON: "
            '{"answers":{"1":"a|b|c|d|"},"notes":"..."}. Use empty strings for blank or unreadable bubbles. '
            "Do not guess ambiguous marks; identify uncertain question numbers in notes."
        )
    else:
        prompt = (
            "Transcribe the official answer key for questions 1 to 100. Return only JSON: "
            '{"answers":{"1":"a|b|c|d"},"notes":"..."}. Include only clearly printed options; '
            "list any ambiguous numbers in notes."
        )
    try:
        text, provider = await vision_completion(
            base64.b64decode(file_doc["data"]), prompt,
            "You transcribe exam answer documents conservatively. Never guess obscured or uncertain answers.",
            file_doc["content_type"],
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Answer scan could not be processed: {exc}") from exc
    try:
        start, end = text.find("{"), text.rfind("}")
        parsed = json.loads(text[start : end + 1]) if start >= 0 else {}
        raw_answers = parsed.get("answers", {})
        answers = {
            str(int(number)): str(answer).strip().lower()[:1]
            for number, answer in raw_answers.items()
            if str(number).isdigit() and 1 <= int(number) <= 100
            and str(answer).strip().lower()[:1] in {"a", "b", "c", "d", ""}
        }
        notes = str(parsed.get("notes", ""))[:1000]
    except (json.JSONDecodeError, AttributeError, TypeError, ValueError):
        answers, notes = {}, "Could not validate extraction; enter the answers manually."
    return answers, notes, provider


@router.post("/attempts/{attempt_id}/scan/{kind}")
async def scan_upload(attempt_id: str, kind: str) -> dict[str, Any]:
    await _attempt(attempt_id)
    expected_kind = {"omr": "omr-sheet", "key": "official-key"}.get(kind)
    if expected_kind is None:
        raise HTTPException(status_code=404, detail="Unknown scan kind")
    file_doc = await db.mock_test_files.find_one({"attempt_id": attempt_id, "kind": expected_kind}, sort=[("created_at", -1)])
    if not file_doc:
        raise HTTPException(status_code=404, detail=f"Upload an {expected_kind} image first")
    answers, notes, provider = await _scan(file_doc, kind)
    field = "detected_answers" if kind == "omr" else "detected_key"
    await db.mock_attempts.update_one({"id": attempt_id}, {"$set": {field: answers, f"{field}_notes": notes, f"{field}_provider": provider}})
    return {"answers": answers, "notes": notes, "provider": provider, "requires_review": True}


@router.post("/attempts/{attempt_id}/analyze-paper")
async def analyze_question_paper(attempt_id: str) -> dict[str, Any]:
    attempt = await _attempt(attempt_id)
    paper = await db.mock_test_files.find_one(
        {"attempt_id": attempt_id, "kind": "question-paper"}, sort=[("created_at", -1)]
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Upload a question-paper image first")
    if not paper["content_type"].startswith("image/"):
        raise HTTPException(status_code=415, detail="PDF is saved for review; upload page images to run per-question AI analysis")
    prompt = (
        "Read the visible UPSC Prelims question-paper page. Return strict JSON only: "
        '{"questions":{"1":{"subject":"...","topic":"..."}},"notes":"..."}. '
        "Use only visible question numbers. Give concise syllabus topic labels, never invent unreadable text, "
        "and list uncertain/question numbers in notes. This may be one page from a larger paper."
    )
    try:
        text, provider = await vision_completion(
            base64.b64decode(paper["data"]), prompt,
            "You extract question taxonomy from exam paper images conservatively. Do not guess obscured text.",
            paper["content_type"],
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Question-paper analysis unavailable: {exc}") from exc
    try:
        start, end = text.find("{"), text.rfind("}")
        parsed = json.loads(text[start : end + 1]) if start >= 0 else {}
        raw = parsed.get("questions", {})
        tags = {
            str(int(number)): {
                key: str(fields.get(key, "")).strip()[:120]
                for key in ("subject", "topic")
                if str(fields.get(key, "")).strip()
            }
            for number, fields in raw.items()
            if str(number).isdigit() and 1 <= int(number) <= 100 and isinstance(fields, dict)
        }
        notes = str(parsed.get("notes", ""))[:1000]
    except (json.JSONDecodeError, AttributeError, TypeError, ValueError):
        tags, notes = {}, "Could not validate extraction; enter question labels manually."
    merged = {**(attempt.get("question_tags") or {}), **tags}
    await db.mock_attempts.update_one(
        {"id": attempt_id},
        {"$set": {"question_tags": merged, "paper_analysis_notes": notes, "paper_analysis_provider": provider}},
    )
    return {"question_tags": tags, "notes": notes, "provider": provider, "requires_review": True}


@router.put("/attempts/{attempt_id}/answer-key")
async def save_answer_key(attempt_id: str, input: AnswerKeyIn) -> dict[str, Any]:
    await _attempt(attempt_id)
    parsed = _parse_key(input.answer_key)
    if not parsed:
        raise HTTPException(status_code=422, detail="Enter answers as 1:A, 2:C (one per line)")
    await db.mock_attempts.update_one({"id": attempt_id}, {"$set": {"official_key": parsed, "key_saved_at": datetime.now(TZ), "key_confirmed_by_user": True}})
    return {"saved": len(parsed), "attempt": _safe_attempt(await _attempt(attempt_id))}


@router.put("/attempts/{attempt_id}/confirmed-key")
async def confirm_extracted_key(attempt_id: str, input: AnswerKeyIn) -> dict[str, Any]:
    return await save_answer_key(attempt_id, input)


@router.post("/attempts/{attempt_id}/evaluate")
async def evaluate(attempt_id: str) -> dict[str, Any]:
    attempt = await _attempt(attempt_id)
    key = attempt.get("official_key") or {}
    if len(key) != 100:
        raise HTTPException(status_code=422, detail=f"Review a complete 100-question answer key first ({len(key)}/100 detected)")
    answers = attempt.get("answers") or {}
    tags = attempt.get("question_tags") or {}
    summary = _score_answers(answers, key, tags)
    correct, wrong, blank = summary["correct"], summary["wrong"], summary["blank"]
    score, accuracy = summary["score"], summary["accuracy"]
    rows = summary["question_results"]
    now = datetime.now(TZ)
    await db.mock_attempts.update_one({"id": attempt_id}, {"$set": {"evaluation": summary, "evaluated_at": now, "submitted_at": attempt.get("submitted_at") or now, "state": "evaluated"}})

    from models.tracker import PyqAttempt, PyqResultItem, TestRecord

    row = _test(attempt["test_code"])
    weak_topics = sorted({str((tags.get(str(item["question"])) or {}).get("topic", "")) for item in rows if item["result"] == "wrong" and (tags.get(str(item["question"])) or {}).get("topic")})
    existing_test = await db.tests.find_one({"mock_attempt_id": attempt_id}) or {}
    test_record = TestRecord(
        id=existing_test.get("id", str(uuid.uuid4())),
        name=attempt["name"],
        kind="prelims_gs",
        subject_name=row["subject"],
        score=score,
        max_score=200,
        accuracy=accuracy,
        date=attempt["test_date"],
        weak_topics=weak_topics,
        created_at=existing_test.get("created_at", now),
    )
    record = test_record.model_dump() | {"mock_attempt_id": attempt_id, "test_code": attempt["test_code"]}
    await db.tests.update_one({"mock_attempt_id": attempt_id}, {"$set": record}, upsert=True)

    existing_pyq = await db.pyq_attempts.find_one({"mock_attempt_id": attempt_id}) or {}
    pyq_attempt = PyqAttempt(
        id=existing_pyq.get("id", str(uuid.uuid4())),
        label=attempt["name"],
        total=100,
        correct=correct,
        wrong=wrong,
        skipped=blank,
        score=score,
        max_score=200,
        accuracy=accuracy,
        date=attempt["test_date"],
        items=[
            PyqResultItem(
                question_id=f"{attempt['test_code']}-Q{item['question']}",
                year=int(attempt["test_date"][:4]),
                qnum=item["question"],
                subject=str((tags.get(str(item["question"])) or {}).get("subject") or row["subject"]),
                subtopic=str((tags.get(str(item["question"])) or {}).get("topic", "")),
                marked=item["selected"],
                correct_answer=item["correct_answer"],
                is_correct=item["result"] == "correct",
            )
            for item in rows
        ],
        weak_topics=weak_topics,
        created_at=existing_pyq.get("created_at", now),
    )
    await db.pyq_attempts.update_one(
        {"mock_attempt_id": attempt_id},
        {"$set": pyq_attempt.model_dump() | {"mock_attempt_id": attempt_id, "test_code": attempt["test_code"]}},
        upsert=True,
    )
    return {"evaluation": summary, "test_record": record}


@router.put("/attempts/{attempt_id}/question-tags")
async def save_question_tags(attempt_id: str, input: QuestionTagsIn) -> dict[str, Any]:
    await _attempt(attempt_id)
    normalized = {
        str(int(question)): {
            key: str(value).strip()[:120]
            for key, value in fields.items()
            if key in {"subject", "topic"} and str(value).strip()
        }
        for question, fields in input.question_tags.items()
        if str(question).isdigit() and 1 <= int(question) <= 100 and isinstance(fields, dict)
    }
    await db.mock_attempts.update_one(
        {"id": attempt_id}, {"$set": {"question_tags": normalized, "tags_updated_at": datetime.now(TZ)}}
    )
    return {"saved": len(normalized), "question_tags": normalized}


@router.post("/attempts/{attempt_id}/analysis")
async def generate_analysis(attempt_id: str) -> dict[str, Any]:
    attempt = await _attempt(attempt_id)
    evaluation = attempt.get("evaluation")
    if not evaluation:
        raise HTTPException(status_code=409, detail="Evaluate against a confirmed official key before generating analysis")
    row = _test(attempt["test_code"])
    evidence = {
        "test": {"name": attempt["name"], "date": attempt["test_date"], "schedule_subject": row["subject"], "scope": row["scope"]},
        "evaluation": evaluation,
        "question_tags": attempt.get("question_tags") or {},
        "rounds": {
            "round_1": {"questions": attempt.get("round1_count", 0), "minutes": round(attempt.get("round1_seconds", 0) / 60, 1)},
            "round_2": {"questions": attempt.get("round2_count", 0), "minutes": round(attempt.get("round2_seconds", 0) / 60, 1)},
        },
    }
    prompt = (
        "Analyze this completed UPSC Prelims mock using only the supplied data. Give a concise report with: "
        "(1) score and accuracy interpretation, (2) subject/topic accuracy only where question_tags provide enough evidence, "
        "(3) incorrect and blank question numbers, (4) round-wise time/attempt observations, "
        "(5) 3 specific next actions linked to syllabus/revision, and (6) limitations. "
        "Never invent question wording, subject labels, time-per-question, or current-affairs facts. "
        "If tags or round data are missing, state that clearly.\n\nDATA:\n"
        + json.dumps(evidence, ensure_ascii=False)
    )

    async def no_tools(_name: str, _args: dict) -> dict:
        return {"ok": False, "error": "No tools are available for mock analysis"}

    try:
        report, _, provider = await agent_turn(
            [{"role": "user", "content": prompt}],
            "You are Professor, a rigorous UPSC Prelims performance analyst. Separate measured facts from recommendations.",
            [],
            no_tools,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AI analysis unavailable: {exc}") from exc
    saved = {"report": report, "provider": provider, "created_at": datetime.now(TZ)}
    await db.mock_attempts.update_one({"id": attempt_id}, {"$set": {"analysis": saved}})
    return saved


@router.get("/attempts")
async def attempts() -> list[dict[str, Any]]:
    docs = await db.mock_attempts.find().sort([("test_date", 1)]).to_list(100)
    return [_safe_attempt(doc) for doc in docs]