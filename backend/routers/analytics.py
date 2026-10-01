"""Analytics: weakness radar, study heatmap, syllabus burn-down, pace forecast."""

import datetime as dt

from fastapi import APIRouter, Depends

from lib.db import db
from lib.dates import today_iso
from models.tracker import (
    BurnDownPoint,
    ForecastOut,
    HeatCell,
    WeaknessItem,
    WeaknessOut,
)
from routers.auth import require_auth
from routers.insights import PRELIMS_DATE

router = APIRouter(prefix="/analytics", tags=["analytics"], dependencies=[Depends(require_auth)])


@router.get("/weakness", response_model=WeaknessOut)
async def weakness() -> WeaknessOut:
    """Rank focus topics from mock-test weak tags + PYQ wrong answers."""
    scores: dict[str, dict] = {}

    def bump(topic: str, weight: int, source: str, subject: str = "") -> None:
        key = topic.strip()
        if not key:
            return
        group_key = f"{key.casefold()}::{subject.strip().casefold()}"
        row = scores.setdefault(
            group_key, {"topic": key, "subject": subject, "mock_hits": 0, "pyq_wrong": 0}
        )
        row[source] += weight
        if subject and not row["subject"]:
            row["subject"] = subject

    for t in await db.tests.find().to_list(500):
        for topic in t.get("weak_topics", []):
            bump(topic, 1, "mock_hits", t.get("subject_name", ""))

    for a in await db.pyq_attempts.find().to_list(300):
        for it in a.get("items", []):
            if not it.get("is_correct") and it.get("marked"):
                bump(it.get("subtopic") or it.get("subject", ""), 1, "pyq_wrong", it.get("subject", ""))

    revisions = {r["topic"].lower() for r in await db.revisions.find().to_list(500)}
    items = []
    for row in scores.values():
        total = row["mock_hits"] * 2 + row["pyq_wrong"]
        items.append(
            WeaknessItem(
                topic=row["topic"],
                subject=row["subject"],
                mock_hits=row["mock_hits"],
                pyq_wrong=row["pyq_wrong"],
                severity=total,
                in_revision_queue=row["topic"].lower() in revisions,
            )
        )
    items.sort(key=lambda i: (-i.severity, i.topic))
    return WeaknessOut(
        items=items[:40],
        total_topics=len(items),
        critical=sum(1 for i in items if i.severity >= 4),
        not_queued=sum(1 for i in items if not i.in_revision_queue),
    )


@router.get("/heatmap", response_model=list[HeatCell])
async def heatmap(weeks: int = 18) -> list[HeatCell]:
    """Daily study minutes for the trailing N weeks (GitHub-style grid)."""
    d0 = dt.date.fromisoformat(today_iso())
    start = d0 - dt.timedelta(days=weeks * 7 - 1)
    sessions = await db.sessions.find().to_list(10000)
    per_day: dict[str, int] = {}
    for s in sessions:
        per_day[s["date"]] = per_day.get(s["date"], 0) + s["duration_minutes"]
    cells = []
    for i in range((d0 - start).days + 1):
        day = start + dt.timedelta(days=i)
        iso = day.isoformat()
        cells.append(
            HeatCell(
                date=iso,
                minutes=per_day.get(iso, 0),
                weekday=day.isoweekday() % 7,
                week=i // 7,
            )
        )
    return cells


@router.get("/burndown", response_model=list[BurnDownPoint])
async def burndown() -> list[BurnDownPoint]:
    """Topics remaining vs the ideal line to finish before Prelims."""
    subjects = await db.subjects.find().to_list(200)
    total = sum(len(s.get("topics", [])) for s in subjects)
    done = sum(1 for s in subjects for t in s.get("topics", []) if t.get("done"))
    remaining = total - done
    d0 = dt.date.fromisoformat(today_iso())
    days_left = max(1, (PRELIMS_DATE - d0).days)
    per_day = remaining / days_left if days_left else 0

    points = []
    for w in range(0, 13):
        day = d0 + dt.timedelta(weeks=w)
        if day > PRELIMS_DATE:
            break
        projected = max(0, round(remaining - per_day * (day - d0).days))
        ideal = max(0, round(remaining * (1 - (day - d0).days / days_left)))
        points.append(BurnDownPoint(date=day.isoformat(), remaining=projected, ideal=ideal))
    return points


@router.get("/forecast", response_model=ForecastOut)
async def forecast() -> ForecastOut:
    """Pace projection: will the syllabus and hour target land before Prelims?"""
    d0 = dt.date.fromisoformat(today_iso())
    days_left = max(0, (PRELIMS_DATE - d0).days)
    sessions = await db.sessions.find().to_list(10000)
    last28 = [
        s for s in sessions if s["date"] >= (d0 - dt.timedelta(days=27)).isoformat()
    ]
    avg_daily = round(sum(s["duration_minutes"] for s in last28) / 28) if last28 else 0

    subjects = await db.subjects.find().to_list(200)
    total_topics = sum(len(s.get("topics", [])) for s in subjects)
    done_topics = sum(1 for s in subjects for t in s.get("topics", []) if t.get("done"))
    remaining = total_topics - done_topics

    # Topic velocity from the last 28 days of sessions (1 session ≈ 1 topic touch).
    topics_per_week = round(len(last28) / 4, 1) if last28 else 0.0
    weeks_needed = round(remaining / topics_per_week, 1) if topics_per_week else None
    weeks_left = round(days_left / 7, 1)
    profile = await db.profile.find_one({})
    target = int(profile["daily_target_minutes"]) if profile else 600

    return ForecastOut(
        days_to_prelims=days_left,
        avg_daily_minutes=avg_daily,
        daily_target_minutes=target,
        target_gap_minutes=avg_daily - target,
        topics_remaining=remaining,
        topics_per_week=topics_per_week,
        weeks_needed=weeks_needed,
        weeks_left=weeks_left,
        on_track=bool(weeks_needed is not None and weeks_needed <= weeks_left),
        projected_hours_to_exam=round(avg_daily * days_left / 60),
    )
