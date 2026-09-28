"""Professor AI — Mistral-powered assistant wired into every feature.

Memory: every turn is persisted per session in Mongo, so follow-up questions work
across restarts. Admin powers: the model can call tools that actually mutate the
app (log sessions, queue revisions, set goals, tick syllabus topics, edit profile).
OMR: an uploaded answer sheet is read by the vision model and evaluated.
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from lib.ai import agent_turn, vision_completion
from lib.db import db
from lib.dates import today_iso
from models.tracker import (
    AiChatIn,
    AiChatOut,
    AiMessage,
    AiSession,
    OmrResultOut,
    Revision,
    StudySession,
)
from routers.auth import require_auth

router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[Depends(require_auth)])

SYSTEM = """You are Professor, the private AI coach inside a UPSC CSE aspirant's personal
study tracker. The candidate's LAST attempt is Prelims on 24 May 2027 — treat every answer
with that urgency. You have full admin power over this app through your tools and should use
them whenever the user asks for a change instead of telling them to do it manually.

Rules:
- Answer in English, precisely and to the point. No filler, no disclaimers, no repetition.
- Prefer short paragraphs or tight bullets. Give concrete UPSC-specific guidance
  (standard books, PYQ patterns, revision cadence, answer-writing structure).
- When you use a tool, confirm in one line exactly what you changed.
- When asked about the candidate's own numbers, use the CONTEXT block — never invent data."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "log_study_session",
            "description": "Log a completed study session for the candidate.",
            "parameters": {
                "type": "object",
                "properties": {
                    "subject_id": {
                        "type": "string",
                        "description": "One of: gs1, gs2, gs3, gs4, optional, csat",
                    },
                    "topic": {"type": "string"},
                    "duration_minutes": {"type": "integer"},
                },
                "required": ["subject_id", "topic", "duration_minutes"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_revision_topic",
            "description": "Add a topic to the spaced-revision queue, due today.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string"},
                    "subject_id": {"type": "string"},
                    "source": {"type": "string"},
                },
                "required": ["topic", "subject_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_goal",
            "description": "Create a study goal/milestone with a target date (YYYY-MM-DD).",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "target_date": {"type": "string"},
                    "priority": {"type": "string", "description": "high, medium or low"},
                },
                "required": ["title", "target_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mark_topic_done",
            "description": "Tick a syllabus topic as complete by matching its name.",
            "parameters": {
                "type": "object",
                "properties": {"topic_name": {"type": "string"}},
                "required": ["topic_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_daily_target",
            "description": "Change the mandatory daily study target, in hours.",
            "parameters": {
                "type": "object",
                "properties": {"hours": {"type": "number"}},
                "required": ["hours"],
            },
        },
    },
]


async def _context() -> str:
    """Live snapshot of the candidate's data for grounded answers."""
    profile = await db.profile.find_one({}) or {}
    subjects = await db.subjects.find().to_list(50)
    sessions = await db.sessions.find().sort([("date", -1)]).to_list(400)
    tests = await db.tests.find().sort([("date", -1)]).to_list(30)
    revisions = await db.revisions.find().to_list(300)
    goals = await db.goals.find({"status": "active"}).to_list(50)
    today = today_iso()

    total = sum(s["duration_minutes"] for s in sessions)
    mastery = ", ".join(
        f"{s['short_name']} {sum(1 for t in s.get('topics', []) if t.get('done'))}/{len(s.get('topics', []))}"
        for s in subjects
    )
    recent = "; ".join(f"{t['name']} {t['score']}/{t['max_score']} ({t['accuracy']}%)" for t in tests[:5])
    due = [r["topic"] for r in revisions if r["next_due"] <= today][:8]
    return (
        f"CONTEXT (today {today})\n"
        f"Candidate: {profile.get('name', 'aspirant')}, target {profile.get('target_exam', 'UPSC CSE 2027')}, "
        f"optional {profile.get('optional_subject', 'n/a')}, daily target "
        f"{round(profile.get('daily_target_minutes', 600) / 60, 1)}h.\n"
        f"Logged: {len(sessions)} sessions, {round(total / 60, 1)}h total, "
        f"{sum(s['duration_minutes'] for s in sessions if s['date'] == today)}m today.\n"
        f"Syllabus mastery: {mastery}.\n"
        f"Recent tests: {recent or 'none'}.\n"
        f"Revisions due now: {', '.join(due) or 'none'}.\n"
        f"Active goals: {', '.join(g['title'] for g in goals) or 'none'}.\n"
        f"Subject ids for tools: gs1=GS-I, gs2=GS-II, gs3=GS-III, gs4=GS-IV, optional=PSIR, csat=CSAT."
    )


async def _dispatch(name: str, args: dict) -> dict:
    """Execute an admin tool the model asked for."""
    if name == "log_study_session":
        subject = await db.subjects.find_one({"id": args.get("subject_id")})
        if not subject:
            return {"ok": False, "error": "unknown subject_id"}
        obj = StudySession(
            subject_id=subject["id"],
            subject_name=subject["short_name"],
            topic=str(args.get("topic", "")).strip() or "Study",
            duration_minutes=max(1, int(args.get("duration_minutes") or 0)),
            date=today_iso(),
            notes="Logged by Professor AI",
        )
        await db.sessions.insert_one(obj.model_dump())
        return {"ok": True, "logged": obj.topic, "minutes": obj.duration_minutes}

    if name == "add_revision_topic":
        subject = await db.subjects.find_one({"id": args.get("subject_id")})
        if not subject:
            return {"ok": False, "error": "unknown subject_id"}
        obj = Revision(
            topic=str(args.get("topic", "")).strip(),
            subject_id=subject["id"],
            subject_name=subject["short_name"],
            source=str(args.get("source") or "Professor AI"),
            next_due=today_iso(),
        )
        await db.revisions.insert_one(obj.model_dump())
        return {"ok": True, "queued": obj.topic}

    if name == "create_goal":
        from models.tracker import Goal

        obj = Goal(
            title=str(args.get("title", "")).strip(),
            description="Created by Professor AI",
            priority=str(args.get("priority") or "medium"),
            target_date=str(args.get("target_date") or today_iso()),
        )
        await db.goals.insert_one(obj.model_dump())
        return {"ok": True, "goal": obj.title, "target_date": obj.target_date}

    if name == "mark_topic_done":
        needle = str(args.get("topic_name", "")).strip()
        if not needle:
            return {"ok": False, "error": "topic_name required"}
        res = await db.subjects.update_one(
            {"topics.name": {"$regex": needle, "$options": "i"}},
            {"$set": {"topics.$.done": True}},
        )
        return {"ok": bool(res.modified_count), "topic": needle}

    if name == "set_daily_target":
        minutes = max(30, int(float(args.get("hours") or 10) * 60))
        await db.profile.update_one({}, {"$set": {"daily_target_minutes": minutes}}, upsert=True)
        return {"ok": True, "daily_target_minutes": minutes}

    return {"ok": False, "error": f"unknown tool {name}"}


@router.get("/sessions", response_model=list[AiSession])
async def list_sessions() -> list[AiSession]:
    docs = await db.ai_sessions.find().sort([("updated_at", -1)]).to_list(30)
    return [AiSession(**d) for d in docs]


@router.get("/sessions/{session_id}", response_model=list[AiMessage])
async def history(session_id: str) -> list[AiMessage]:
    docs = await db.ai_messages.find({"session_id": session_id}).sort([("created_at", 1)]).to_list(300)
    return [AiMessage(**d) for d in docs]


@router.delete("/sessions/{session_id}", status_code=204)
async def clear_session(session_id: str) -> None:
    await db.ai_messages.delete_many({"session_id": session_id})
    await db.ai_sessions.delete_one({"id": session_id})


@router.post("/chat", response_model=AiChatOut)
async def chat(input: AiChatIn) -> AiChatOut:
    text = input.message.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Message cannot be empty")
    session_id = input.session_id or str(uuid.uuid4())

    prior = (
        await db.ai_messages.find({"session_id": session_id})
        .sort([("created_at", 1)])
        .to_list(40)
    )
    messages = [{"role": m["role"], "content": m["content"]} for m in prior[-20:]]
    messages.append({"role": "user", "content": text})

    system = f"{SYSTEM}\n\n{await _context()}"
    reply, actions, provider = await agent_turn(messages, system, TOOLS, _dispatch)

    now = datetime.now(timezone.utc)
    await db.ai_messages.insert_many(
        [
            AiMessage(session_id=session_id, role="user", content=text, created_at=now).model_dump(),
            AiMessage(
                session_id=session_id,
                role="assistant",
                content=reply or "(no reply)",
                provider=provider,
                actions=actions,
                created_at=now,
            ).model_dump(),
        ]
    )
    await db.ai_sessions.update_one(
        {"id": session_id},
        {
            "$set": {"id": session_id, "updated_at": now, "provider": provider},
            "$setOnInsert": {"title": text[:60], "created_at": now},
        },
        upsert=True,
    )
    return AiChatOut(
        session_id=session_id,
        reply=reply or "(no reply)",
        provider=provider,
        actions=actions,
    )


@router.post("/omr", response_model=OmrResultOut)
async def omr(
    file: UploadFile = File(...),
    answer_key: str = Form(default=""),
    label: str = Form(default="OMR evaluation"),
) -> OmrResultOut:
    """Read a photographed OMR sheet, extract marked options, evaluate vs the key."""
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="Empty file")
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Image must be under 8 MB")

    prompt = (
        "This is a photograph of a UPSC-style OMR answer sheet. Identify every question "
        "number and the option the candidate darkened (a, b, c or d). Respond with ONLY a "
        'JSON object of the form {"answers": {"1": "a", "2": "c"}, "notes": "short note about '
        'legibility"}. Use an empty string for questions left blank or unreadable.'
    )
    content, provider = await vision_completion(
        raw, prompt, "You are a precise OMR sheet reader. Output strict JSON only."
    )

    detected: dict[str, str] = {}
    notes = ""
    try:
        start, end = content.find("{"), content.rfind("}")
        parsed = json.loads(content[start : end + 1]) if start >= 0 else {}
        raw_answers = parsed.get("answers", {}) if isinstance(parsed, dict) else {}
        detected = {str(k): str(v).strip().lower()[:1] for k, v in raw_answers.items()}
        notes = str(parsed.get("notes", ""))[:300]
    except (json.JSONDecodeError, AttributeError, TypeError):
        notes = "Could not parse the model output as JSON."

    key: dict[str, str] = {}
    for pair in answer_key.replace("\n", ",").split(","):
        if ":" in pair:
            q, a = pair.split(":", 1)
            key[q.strip()] = a.strip().lower()[:1]

    correct = wrong = blank = 0
    for q, marked in detected.items():
        expected = key.get(q)
        if not marked:
            blank += 1
        elif expected and marked == expected:
            correct += 1
        elif expected:
            wrong += 1
    scored = correct + wrong
    score = round(correct * 2 - wrong * (2 / 3), 2) if scored else 0.0
    accuracy = round(correct / scored * 100, 1) if scored else 0.0

    result = OmrResultOut(
        label=label,
        provider=provider,
        detected=detected,
        detected_count=len(detected),
        evaluated=bool(key),
        correct=correct,
        wrong=wrong,
        blank=blank,
        score=score,
        max_score=round(len(key) * 2, 2) if key else 0.0,
        accuracy=accuracy,
        notes=notes,
        date=today_iso(),
    )
    await db.omr_runs.insert_one(result.model_dump() | {"id": str(uuid.uuid4())})

    if key:  # a real evaluation belongs in the test history
        from models.tracker import TestRecord

        await db.tests.insert_one(
            TestRecord(
                name=label,
                kind="omr",
                score=score,
                max_score=result.max_score,
                accuracy=accuracy,
                date=result.date,
            ).model_dump()
        )
    return result


@router.get("/omr/runs", response_model=list[OmrResultOut])
async def omr_runs() -> list[OmrResultOut]:
    docs = await db.omr_runs.find().sort([("date", -1)]).to_list(30)
    return [OmrResultOut(**{k: v for k, v in d.items() if k != "id" and k != "_id"}) for d in docs]
