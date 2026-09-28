# Ashoka Academy — UPSC CSE Personal Tracker (spec)

Premium personal study-tracking web app for a UPSC CSE 2027 aspirant — the legacy
"Precision UPSC GS1 Portal" (static PWA / Cloudflare Workers) rebuilt as a modern
FastAPI + React dashboard. Legacy elements preserved: Prelims **24 May 2027**
countdown, subject-ledger study log, mock-test/OMR performance tracking.

## Stack
- Backend: FastAPI (`backend/server.py`, single `api_router` at `/api`), motor + Mongo
  (db `app`), Pydantic v2 models in `backend/models/tracker.py`, routers in
  `backend/routers/` (auth, profile, subjects, sessions, goals, revisions, tests,
  insights, notion). Indexes in `backend/lib/db.py` INDEXES, applied at startup.
- Frontend: Vite + React 19 + TS strict, TanStack Query, shadcn/ui (base-nova),
  recharts via `@/lib/recharts` alias. Warm editorial theme: ivory `#FBF9F4`,
  ink `#1C1D18`, saffron `#C8640E`, forest `#1D3A2C`; Lora headings, DM Sans body,
  JetBrains Mono metrics. Paper-stipple background + CSS-3D orbiting ring backdrop
  (`components/Backdrop3D.tsx`, transparent, pointer-events-none).

## Auth — PIN vault (no user accounts)
- One shared passcode. `POST /api/auth/unlock {pin}` → httpOnly JWT cookie (30d,
  HS256, APP_SECRET). Every tracker router depends on `require_auth`; 401 →
  frontend `ProtectedLayout` redirects to `/login`.
- Default PIN **1947** (`APP_PIN` in backend/.env). After a change (Settings →
  POST /api/auth/pin) the hash lives in Mongo `app_meta` and overrides the env default.
- Sign-out = "Lock" button → `endSession()` (POST /api/auth/logout + cache clear).

## Data model (collections)
- `subjects`: `{id, name, short_name, color, topics[{id,name,done}]}` — progress
  computed on read (`SubjectOut`: total/completed/progress_pct). Seed ids: gs1, gs2,
  gs3, gs4, optional (PSIR), csat.
- `sessions`: `{id, subject_id, subject_name, topic, duration_minutes, date,
  notes, created_at}` — POST defaults date to server-today.
- `goals`: `{id, title, description, subject_id?, priority, target_date, progress,
  status}` — progress 100 auto-sets status done.
- `revisions`: `{id, topic, subject_id, subject_name, source, interval_days,
  last_revised, next_due, review_count}` — `POST /revisions/{id}/review
  {retention: easy|good|hard}` recomputes interval (easy ≈×2, good ≈×1.4, hard → 1d)
  and next_due server-side (server-anchored dates via lib/dates.py).
- `tests`: `{id, name, kind: prelims_gs|prelims_csat|mains|sectional, subject_id?,
  score, max_score, accuracy, date, weak_topics[]}`.
- `profile` (single doc): name, target_exam, optional_subject, daily_target_minutes.
- `insights` (GET /api/insights, computed): today vs target, streak, week delta,
  daily 14d points, 24h buckets, subject balance, revision_due, goal_active,
  test stats, syllabus pct, **days_to_prelims** (fixed date 2027-05-24).
- `app_meta` (pin hash), `notion_logs`, `notion_mirror` (sync artifacts).

## Notion sync (backend/routers/notion.py)
- **Simulated mode** (current): mirrors the 10 most recent un-synced sessions into
  `notion_mirror` + writes `notion_logs`; clearly labelled in the UI.
- **Live mode** activates the moment `NOTION_TOKEN` + `NOTION_DATABASE_ID` are set in
  backend/.env and the backend restarts: sessions become real Notion pages
  (Name/Hours/Date mapping, auto-fallback to title-only on schema mismatch,
  page_id persisted to prevent duplicates). `POST /api/notion/test` pings the real
  database; token never leaves the server.

## Seed (backend/seed.py)
`cd /app/backend && python seed.py` (idempotent; `--reset` wipes + reseeds):
Aryavrat Sharma · UPSC CSE 2027 · PSIR optional · 480 min/day target · 6 subjects
(88 real syllabus topics, 68.2% done) · ~99 sessions across 70 days (29-day streak) ·
6 goals · 14 revisions (5 due now) · 12 mock tests (accuracy 48→69% trend).

## Pages
`/login` PIN gate (one-click demo unlock) · `/` dashboard (countdown, streak, target
ring, velocity chart, mastery bars, upcoming revisions, recent tests, active goals) ·
`/sessions` logbook + filters · `/revisions` spaced queue (Easy/Good/Hard) · `/goals` ·
`/tests` (trend chart + records) · `/subjects` syllabus matrix (toggle topics) ·
`/insights` · `/settings` (Notion hub, profile, PIN change, lock).

## Verification (tier 1 — all clean)
- curl smoke: 401/401/200 auth paths, subjects/insights fields, CRUD on
  sessions+goals+revisions+tests, 422 negative, notion simulated responses — pass;
  **public URL** unlock+me → 200.
- `yarn typecheck` clean. Browser pass: login → dashboard → quick-log session →
  revision review → notion test-connection → insights; no console errors.
