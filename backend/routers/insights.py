"""Server-computed productivity insights — all 'today' anchoring is server-side."""

import datetime as dt

from fastapi import APIRouter, Depends

from lib.db import db
from lib.dates import today_iso
from models.tracker import DayPoint, HourPoint, InsightsOut, SubjectPoint
from routers.auth import require_auth

router = APIRouter(prefix="/insights", tags=["insights"], dependencies=[Depends(require_auth)])

# UPSC Prelims 2027 — the fixed date the countdown anchors to (carried over from the legacy portal).
PRELIMS_DATE = dt.date(2027, 5, 24)



@router.get("", response_model=InsightsOut)
async def get_insights() -> InsightsOut:
    today = today_iso()
    d0 = dt.date.fromisoformat(today)
    sessions = await db.sessions.find().to_list(10000)
    subjects = {s["id"]: s for s in await db.subjects.find().to_list(200)}
    profile = await db.profile.find_one({})
    daily_target = int(profile["daily_target_minutes"]) if profile else 480

    def minutes_in(lo: dt.date, hi: dt.date) -> int:
        lo_s, hi_s = lo.isoformat(), hi.isoformat()
        return sum(s["duration_minutes"] for s in sessions if lo_s <= s["date"] <= hi_s)

    today_minutes = sum(s["duration_minutes"] for s in sessions if s["date"] == today)
    total_minutes = sum(s["duration_minutes"] for s in sessions)
    this_week = minutes_in(d0 - dt.timedelta(days=6), d0)
    last_week = minutes_in(d0 - dt.timedelta(days=13), d0 - dt.timedelta(days=7))
    delta = (
        round((this_week - last_week) / last_week * 100, 1)
        if last_week
        else (100.0 if this_week else 0.0)
    )

    study_dates = {s["date"] for s in sessions}
    streak = 0
    cursor = d0 if today in study_dates else d0 - dt.timedelta(days=1)
    while cursor.isoformat() in study_dates:
        streak += 1
        cursor -= dt.timedelta(days=1)

    daily = []
    for i in range(13, -1, -1):
        day_iso = (d0 - dt.timedelta(days=i)).isoformat()
        daily.append(
            DayPoint(date=day_iso, minutes=sum(s["duration_minutes"] for s in sessions if s["date"] == day_iso))
        )

    per_subject: dict[str, int] = {}
    for s in sessions:
        per_subject[s["subject_id"]] = per_subject.get(s["subject_id"], 0) + s["duration_minutes"]
    balance = []
    for sid, mins in sorted(per_subject.items(), key=lambda kv: -kv[1]):
        sub = subjects.get(sid)
        if not sub:
            continue
        balance.append(
            SubjectPoint(
                subject_id=sid,
                name=sub["name"],
                short_name=sub["short_name"],
                color=sub["color"],
                minutes=mins,
                pct=round(mins / total_minutes * 100, 1) if total_minutes else 0.0,
            )
        )

    hourly = [0] * 24
    for s in sessions:
        created = s.get("created_at")
        if isinstance(created, dt.datetime):
            hourly[created.hour % 24] += s["duration_minutes"]

    weekday_minutes: dict[str, int] = {}
    for s in sessions:
        try:
            wd = dt.date.fromisoformat(s["date"]).strftime("%A")
        except (ValueError, TypeError):
            continue
        weekday_minutes[wd] = weekday_minutes.get(wd, 0) + s["duration_minutes"]
    best_weekday = (
        max(weekday_minutes, key=lambda k: weekday_minutes[k]) if weekday_minutes else "—"
    )

    revision_due = await db.revisions.count_documents({"next_due": {"$lte": today}})
    goal_active = await db.goals.count_documents({"status": "active"})
    tests = await db.tests.find().to_list(1000)

    total_topics = sum(len(s.get("topics", [])) for s in subjects.values())
    done_topics = sum(
        1 for s in subjects.values() for t in s.get("topics", []) if t.get("done")
    )

    return InsightsOut(
        today_minutes=today_minutes,
        daily_target_minutes=daily_target,
        days_to_prelims=max(0, (PRELIMS_DATE - d0).days),
        total_minutes=total_minutes,
        this_week_minutes=this_week,
        last_week_minutes=last_week,
        week_delta_pct=delta,
        streak_days=streak,
        avg_session_minutes=round(total_minutes / len(sessions)) if sessions else 0,
        sessions_count=len(sessions),
        best_weekday=best_weekday,
        daily=daily,
        subject_balance=balance,
        hourly=[HourPoint(hour=h, minutes=hourly[h]) for h in range(24)],
        revision_due=revision_due,
        goal_active=goal_active,
        test_count=len(tests),
        test_avg_accuracy=round(sum(t["accuracy"] for t in tests) / len(tests), 1) if tests else 0.0,
        syllabus_progress_pct=round(done_topics / total_topics * 100, 1) if total_topics else 0.0,
    )
