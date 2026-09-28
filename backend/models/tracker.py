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
    device_id: str | None = None


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
    daily_target_minutes: int = 600  # 10h mandatory daily target


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


# --- pyq bank ---
class PyqQuestion(BaseModel):
    id: str
    year: int
    qnum: int
    subject: str
    subtopic: str = ""
    difficulty: str = "moderate"
    format: str = "Single-answer"
    statement_count: int = 0
    negative_stem: bool = False
    current_affairs: bool = False
    answer: str = ""
    cancelled: bool = False


class PyqQuestionDetail(PyqQuestion):
    """Full read view of one PYQ — metadata plus every source trail we hold.

    The master corpus is an answer-key + taxonomy inventory (UPSC does not release
    machine-readable stems), so the reader shows the verified metadata and links
    straight to the official paper and the researched source for that question.
    """

    news_cue: bool = False
    stem_word_count: int = 0
    option_count: int = 4
    answer_valid: bool = True
    question_text: str = ""
    official_paper_url: str = ""
    analysis_source_name: str = ""
    analysis_source_url: str = ""
    primary_source: str = ""
    primary_source_url: str = ""
    source_note: str = ""


class ResetOut(BaseModel):
    ok: bool
    sessions_deleted: int
    tests_deleted: int
    pyq_attempts_deleted: int
    revisions_deleted: int
    topics_cleared: int
    goals_reset: int
    message: str


class PyqMeta(BaseModel):
    total: int
    years: list[int]
    subjects: list[str]
    per_year: dict[str, int]
    per_subject: dict[str, int]
    difficulties: list[str]


class PyqResultItem(BaseModel):
    question_id: str
    year: int
    qnum: int
    subject: str
    subtopic: str = ""
    marked: str = ""
    correct_answer: str = ""
    is_correct: bool = False


class PyqAttempt(BaseModel):
    id: str = Field(default_factory=_uuid)
    label: str
    year: int | None = None
    subject: str | None = None
    total: int
    correct: int
    wrong: int
    skipped: int
    score: float
    max_score: float
    accuracy: float
    date: str
    items: list[PyqResultItem] = Field(default_factory=list)
    weak_topics: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)


class PyqAttemptCreate(BaseModel):
    label: str | None = None
    year: int | None = None
    subject: str | None = None
    answers: dict[str, str]  # question_id -> a|b|c|d ("" = skipped)


# --- analytics ---
class WeaknessItem(BaseModel):
    topic: str
    subject: str = ""
    mock_hits: int = 0
    pyq_wrong: int = 0
    severity: int = 0
    in_revision_queue: bool = False


class WeaknessOut(BaseModel):
    items: list[WeaknessItem]
    total_topics: int
    critical: int
    not_queued: int


class HeatCell(BaseModel):
    date: str
    minutes: int
    weekday: int
    week: int


class BurnDownPoint(BaseModel):
    date: str
    remaining: int
    ideal: int


class ForecastOut(BaseModel):
    days_to_prelims: int
    avg_daily_minutes: int
    daily_target_minutes: int
    target_gap_minutes: int
    topics_remaining: int
    topics_per_week: float
    weeks_needed: float | None = None
    weeks_left: float
    on_track: bool
    projected_hours_to_exam: int


# --- professor ai ---
class AiChatIn(BaseModel):
    message: str
    session_id: str | None = None


class AiChatOut(BaseModel):
    session_id: str
    reply: str
    provider: str
    actions: list[str] = Field(default_factory=list)


class AiMessage(BaseModel):
    id: str = Field(default_factory=_uuid)
    session_id: str
    role: str  # user | assistant
    content: str
    provider: str = ""
    actions: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)


class AiSession(BaseModel):
    id: str
    title: str = ""
    provider: str = ""
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class OmrResultOut(BaseModel):
    label: str
    provider: str
    detected: dict[str, str] = Field(default_factory=dict)
    detected_count: int = 0
    evaluated: bool = False
    correct: int = 0
    wrong: int = 0
    blank: int = 0
    score: float = 0.0
    max_score: float = 0.0
    accuracy: float = 0.0
    notes: str = ""
    date: str


# --- devices ---
class DeviceOut(BaseModel):
    id: str
    label: str
    user_agent: str = ""
    approved: bool = False
    current: bool = False
    last_seen: datetime = Field(default_factory=_now)
    created_at: datetime = Field(default_factory=_now)


class DeviceUpdate(BaseModel):
    approved: bool


# --- notion sync ---
class NotionStatus(BaseModel):
    configured: bool
    token_hint: str | None = None
    database_id: str | None = None
    database_title: str | None = None
    last_synced_at: datetime | None = None
    cached_entries: int = 0
    unread_entries: int = 0


class NotionTestOut(BaseModel):
    ok: bool
    message: str
    database_title: str | None = None
    database_id: str | None = None


class NotionSchemaOut(BaseModel):
    database_id: str
    title: str
    options: dict[str, list[str]]
    property_types: dict[str, str]


class NotionEntry(BaseModel):
    page_id: str
    database_id: str = ""
    database_title: str = ""
    title: str
    url: str = ""
    status: str = ""
    unread: bool = True
    place_type: str = ""
    priority: str = ""
    continents: list[str] = Field(default_factory=list)
    issue_types: list[str] = Field(default_factory=list)
    country_tags: list[str] = Field(default_factory=list)
    months: list[str] = Field(default_factory=list)
    source_link: str = ""
    memory_aid: str = ""
    pyq_history: str = ""
    last_updated: str = ""
    images: list[dict] = Field(default_factory=list)
    last_edited_time: str = ""
    values: dict = Field(default_factory=dict)


class NotionEntryUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    priority: str | None = None
    memory_aid: str | None = None
    pyq_history: str | None = None
    unread: bool | None = None


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
