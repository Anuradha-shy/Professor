// Hand-written mirrors of the Pydantic models in backend/models/tracker.py —
// nothing infers across the HTTP boundary; keep both sides in sync in the same edit.

export interface MeOut {
  authenticated: boolean;
}

export interface Profile {
  name: string;
  target_exam: string;
  optional_subject: string;
  daily_target_minutes: number;
}

export interface Topic {
  id: string;
  name: string;
  done: boolean;
}

export interface Subject {
  id: string;
  name: string;
  short_name: string;
  color: string;
  topics: Topic[];
  total_topics: number;
  completed_topics: number;
  progress_pct: number;
}

export interface StudySession {
  id: string;
  subject_id: string;
  subject_name: string;
  topic: string;
  duration_minutes: number;
  date: string; // YYYY-MM-DD
  notes: string;
  created_at: string; // ISO datetime
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  subject_id: string | null;
  priority: string; // high | medium | low
  target_date: string;
  progress: number; // 0-100
  status: string; // active | done
  created_at: string;
}

export interface Revision {
  id: string;
  topic: string;
  subject_id: string;
  subject_name: string;
  source: string;
  interval_days: number;
  last_revised: string | null;
  next_due: string;
  review_count: number;
  created_at: string;
}

export interface TestRecord {
  id: string;
  name: string;
  kind: string; // prelims_gs | prelims_csat | mains | sectional
  subject_id: string | null;
  subject_name: string;
  score: number;
  max_score: number;
  accuracy: number;
  date: string;
  weak_topics: string[];
  created_at: string;
}

export interface DayPoint {
  date: string;
  minutes: number;
}

export interface SubjectPoint {
  subject_id: string;
  name: string;
  short_name: string;
  color: string;
  minutes: number;
  pct: number;
}

export interface HourPoint {
  hour: number;
  minutes: number;
}

export interface InsightsOut {
  today_minutes: number;
  daily_target_minutes: number;
  days_to_prelims: number;
  total_minutes: number;
  this_week_minutes: number;
  last_week_minutes: number;
  week_delta_pct: number;
  streak_days: number;
  avg_session_minutes: number;
  sessions_count: number;
  best_weekday: string;
  daily: DayPoint[]; // last 14 days
  subject_balance: SubjectPoint[];
  hourly: HourPoint[]; // 24 buckets
  revision_due: number;
  goal_active: number;
  test_count: number;
  test_avg_accuracy: number;
  syllabus_progress_pct: number;
}

export interface NotionStatus {
  configured: boolean;
  token_hint: string | null;
  database_id: string | null;
  database_title: string | null;
  last_synced_at: string | null;
  cached_entries: number;
  unread_entries: number;
}

export interface NotionTestOut {
  ok: boolean;
  message: string;
  database_title: string | null;
  database_id: string | null;
}

export interface NotionSchemaOut {
  database_id: string;
  title: string;
  options: Record<string, string[]>;
  property_types: Record<string, string>;
}

export interface NotionImage {
  name: string;
  url: string;
}

export interface NotionDatabaseOption {
  id: string;
  title: string;
  active: boolean;
}

export interface NotionEntry {
  page_id: string;
  title: string;
  url: string;
  status: string;
  unread: boolean;
  place_type: string;
  priority: string;
  continents: string[];
  issue_types: string[];
  country_tags: string[];
  months: string[];
  source_link: string;
  memory_aid: string;
  pyq_history: string;
  last_updated: string;
  images: NotionImage[];
  last_edited_time: string;
  values: Record<string, unknown>;
}

// --- pyq bank ---
export interface PyqQuestion {
  id: string;
  year: number;
  qnum: number;
  subject: string;
  subtopic: string;
  difficulty: string;
  format: string;
  statement_count: number;
  negative_stem: boolean;
  current_affairs: boolean;
  answer: string;
  cancelled: boolean;
}

export interface PyqMeta {
  total: number;
  years: number[];
  subjects: string[];
  per_year: Record<string, number>;
  per_subject: Record<string, number>;
  difficulties: string[];
}

export interface PyqResultItem {
  question_id: string;
  year: number;
  qnum: number;
  subject: string;
  subtopic: string;
  marked: string;
  correct_answer: string;
  is_correct: boolean;
}

export interface PyqAttempt {
  id: string;
  label: string;
  year: number | null;
  subject: string | null;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  max_score: number;
  accuracy: number;
  date: string;
  items: PyqResultItem[];
  weak_topics: string[];
  created_at: string;
}

// --- analytics ---
export interface WeaknessItem {
  topic: string;
  subject: string;
  mock_hits: number;
  pyq_wrong: number;
  severity: number;
  in_revision_queue: boolean;
}

export interface WeaknessOut {
  items: WeaknessItem[];
  total_topics: number;
  critical: number;
  not_queued: number;
}

export interface HeatCell {
  date: string;
  minutes: number;
  weekday: number;
  week: number;
}

export interface BurnDownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export interface ForecastOut {
  days_to_prelims: number;
  avg_daily_minutes: number;
  daily_target_minutes: number;
  target_gap_minutes: number;
  topics_remaining: number;
  topics_per_week: number;
  weeks_needed: number | null;
  weeks_left: number;
  on_track: boolean;
  projected_hours_to_exam: number;
}

// --- professor ai ---
export interface AiChatOut {
  session_id: string;
  reply: string;
  provider: string;
  actions: string[];
}

export interface AiMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  provider: string;
  actions: string[];
  created_at: string;
}

export interface AiSession {
  id: string;
  title: string;
  provider: string;
  created_at: string;
  updated_at: string;
}

export interface OmrResultOut {
  label: string;
  provider: string;
  detected: Record<string, string>;
  detected_count: number;
  evaluated: boolean;
  correct: number;
  wrong: number;
  blank: number;
  score: number;
  max_score: number;
  accuracy: number;
  notes: string;
  date: string;
}

export interface DeviceOut {
  id: string;
  label: string;
  user_agent: string;
  approved: boolean;
  current: boolean;
  last_seen: string;
  created_at: string;
}

export interface NotionSyncOut {
  ok: boolean;
  mode: string; // live | simulated
  created: number;
  skipped: number;
  message: string;
}

export interface NotionLog {
  id: string;
  action: string; // test | sync
  mode: string; // live | simulated
  ok: boolean;
  message: string;
  created_at: string;
}

export interface NotionMirrorRow {
  page_id: string | null;
  title: string;
  subject: string;
  minutes: number;
  date: string;
  created_at: string;
}
