"""Pydantic v2 models for the UPSC tracker. Each model here has a hand-written TS
mirror in frontend/src/lib/types.ts — keep the pair in sync in the same edit."""

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- auth (PIN gate) ---
class UnlockIn(BaseModel):
    pin: str


class MeOut(BaseModel):
    authenticated: bool


class PinChangeIn(BaseModel):
    current_pin: str
    new_pin: str


# --- profile ---
class Profile(BaseModel):
    name: str = "UPSC Aspirant"
    target_exam: str = "UPSC Civil Services Examination 2027"
    optional_subject: str = ""
    daily_target_minutes: int = 480


class ProfileUpdate(BaseModel):
    name: str | None = None
    target_exam: str | None = None
    optional_subject: str | None = None
    daily_target_minutes: int | None = None


# --- subjects / syllabus ---
class Topic(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    done: bool = False


class Subject(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    short_name: str
    color: str = "#C8640E"
    topics: list[Topic] = Field(default_factory=list)


class SubjectOut(Subject):
    total_topics: int = 0
    completed_topics: int = 0
    progress_pct: float = 0.0


class SubjectCreate(BaseModel):
    name: str
    short_name: str
    color: str = "#C8640E"


class TopicCreate(BaseModel):
    name: str


class TopicUpdate(BaseModel):
    name: str | None = None
    done: bool | None = None


# --- study sessions ---
class StudySession(BaseModel):
    id: str = Field(default_factory=_uuid)
    subject_id: str
    subject_name: str = ""
    topic: str
    duration_minutes: int
    date: str  # YYYY-MM-DD study date (server-anchored default)
    notes: str = ""
    created_at: datetime = Field(default_factory=_now)


class StudySessionCreate(BaseModel):
    subject_id: str
    topic: str
    duration_minutes: int
    date: str | None = None
    notes: str = ""


# --- goals ---
class Goal(BaseModel):
    id: str = Field(default_factory=_uuid)
    title: str
    description: str = ""
    subject_id: str | None = None
    priority: str = "medium"  # high | medium | low
    target_date: str  # YYYY-MM-DD
    progress: int = 0  # 0-100
    status: str = "active"  # active | done
    created_at: datetime = Field(default_factory=_now)


class GoalCreate(BaseModel):
    title: str
    description: str = ""
    subject_id: str | None = None
    priority: str = "medium"
    target_date: str
    progress: int = 0


class GoalUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    target_date: str | None = None
    progress: int | None = None
    status: str | None = None


# --- revisions (spaced repetition) ---
class Revision(BaseModel):
    id: str = Field(default_factory=_uuid)
    topic: str
    subject_id: str
    subject_name: str = ""
    source: str = ""  # e.g. "Laxmikanth"
    interval_days: int = 1
    last_revised: str | None = None
    next_due: str  # YYYY-MM-DD
    review_count: int = 0
    created_at: datetime = Field(default_factory=_now)


class RevisionCreate(BaseModel):
    topic: str
    subject_id: str
    source: str = ""
    next_due: str | None = None  # default: today, server-anchored


class RevisionReview(BaseModel):
    retention: str  # easy | good | hard


# --- mock tests ---
class TestRecord(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    kind: str = "prelims_gs"  # prelims_gs | prelims_csat | mains | sectional
    subject_id: str | None = None
    subject_name: str = ""
    score: float
    max_score: float = 200
    accuracy: float  # 0-100
    date: str  # YYYY-MM-DD
    weak_topics: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)


class TestCreate(BaseModel):
    name: str
    kind: str = "prelims_gs"
    subject_id: str | None = None
    score: float
    max_score: float = 200
    accuracy: float
    date: str | None = None
    weak_topics: list[str] = Field(default_factory=list)


# --- insights ---
class DayPoint(BaseModel):
    date: str
    minutes: int


class SubjectPoint(BaseModel):
    subject_id: str
    name: str
    short_name: str
    color: str
    minutes: int
    pct: float


class HourPoint(BaseModel):
    hour: int
    minutes: int


class InsightsOut(BaseModel):
    today_minutes: int
    daily_target_minutes: int
    days_to_prelims: int
    total_minutes: int
    this_week_minutes: int
    last_week_minutes: int
    week_delta_pct: float
    streak_days: int
    avg_session_minutes: int
    sessions_count: int
    best_weekday: str
    daily: list[DayPoint]  # last 14 days
    subject_balance: list[SubjectPoint]
    hourly: list[HourPoint]  # 24 buckets
    revision_due: int
    goal_active: int
    test_count: int
    test_avg_accuracy: float
    syllabus_progress_pct: float


# --- notion sync ---
class NotionStatus(BaseModel):
    configured: bool
    token_hint: str | None = None
    database_id: str | None = None
    last_synced_at: datetime | None = None


class NotionTestOut(BaseModel):
    ok: bool
    message: str
    database_title: str | None = None


class NotionSyncOut(BaseModel):
    ok: bool
    mode: str  # live | simulated
    created: int
    skipped: int
    message: str


class NotionLog(BaseModel):
    id: str = Field(default_factory=_uuid)
    action: str  # test | sync
    mode: str  # live | simulated
    ok: bool
    message: str
    created_at: datetime = Field(default_factory=_now)


class NotionMirrorRow(BaseModel):
    id: str
    page_id: str | None = None
    title: str
    subject: str = ""
    minutes: int = 0
    date: str = ""
    created_at: datetime = Field(default_factory=_now)
