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
  last_synced_at: string | null;
}

export interface NotionTestOut {
  ok: boolean;
  message: string;
  database_title: string | null;
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
  id: string;
  page_id: string | null;
  title: string;
  subject: string;
  minutes: number;
  date: string;
  created_at: string;
}
