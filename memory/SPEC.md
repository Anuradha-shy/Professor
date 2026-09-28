# Professor 🥼 — private UPSC CSE 2027 tracker (spec)

Rebuild of the legacy "Precision UPSC GS1 Portal" as a FastAPI + React app.
Exam anchor: **Prelims 24 May 2027 (final attempt)**. Single user, device-bound.

## Stack
FastAPI (`server.py`, one `api_router` at `/api`) + motor/Mongo; Vite + React 19 +
TS strict + TanStack Query + shadcn/ui. Theme: ivory `#FBF9F4`, ink `#1C1D18`,
saffron `#C8640E`, forest `#1D3A2C`; Lora / DM Sans / JetBrains Mono. CSS-3D ring
backdrop + paper stipple + glass panels; colour-coded nav per section.

## Auth
Password vault (**ican**, alphanumeric 4–32 chars, hash in `app_meta`) → httpOnly
JWT cookie. **Device binding**: first `device_id` to unlock is trusted; others get
403 until approved in Settings → Trusted devices (`devices` collection).
Frontend id: `lib/device.ts` (localStorage uuid, sent on unlock).

## Routers (all under /api)
auth (unlock/me/logout/pin/devices) · profile · subjects · sessions · goals ·
revisions · tests · insights · **analytics** (weakness/heatmap/burndown/forecast) ·
**pyq** (meta/questions/attempts) · **ai** (chat/sessions/omr) · **notion**
(status/test/schema/pull/entries/PATCH entry/logs/push-sessions).

## New data
- `pyq_master_2014_2026.csv` in `backend/data/` — real **1,300 questions**, 13 years
  × 100, with official answer key, subject, subtopic, difficulty, format. No stems
  (as in the source portal), so practice = mark your option vs the key.
- `pyq_attempts`: scored with UPSC marking (+2 / −⅓); mirrored into `tests` (kind `pyq`).
- `notion_entries`: local mirror of the active Notion DB (CA Tracker Pro — Daily Log, 191 rows) with `unread` flag.
- `ai_messages` / `ai_sessions`: persistent chat memory. `omr_runs`: OMR evaluations.
- Daily target = **600 min (10h mandatory)**.

## Integrations (LIVE — keys in backend/.env)
- **Notion**: token set; active DB = "CA Tracker Pro — Daily Log" (switchable on /notion via `/api/notion/databases` + `/databases/select`); discovery prefers the daily-log DB →
  `102f009c-…` "Places / Seas / Straits / Disputed Areas — UPSC Tracker".
  Pull mirrors all pages; PATCH writes title/status/priority/mnemonic/PYQ-history
  back in real time. `/notion` page has subject/paper-wise filter boxes (Place Type,
  Continent, Issue Type, Priority), search, unread-only toggle, unread column, and an
  attachment lightbox with zoom in/out + download.
- **Professor AI**: Mistral `mistral-small-latest` primary; its free tier rate-limits
  (429), so `lib/ai.py` retries with backoff then falls back to the Emergent universal
  key (`gpt-5.4`). **Both paths carry the same 5 admin tools** (log session, queue
  revision, create goal, mark topic done, set daily target) so AI can really change the
  app. Vision path (`pixtral-12b-2409` → fallback) reads OMR photos → JSON answers →
  scored vs the pasted key → saved to test history. Provider shown per message.

## Pages
`/login` (PIN keypad, demo unlock) · `/` dashboard (live ticking countdown, study
timer, target ring, streak, velocity, mastery, revisions, tests, goals) ·
`/professor` AI chat + OMR + conversation memory · `/sessions` · `/revisions` ·
`/pyq` · `/weakness` (radar + heatmap + burn-down + forecast) · `/goals` · `/tests` ·
`/subjects` · `/insights` · `/notion` · `/settings` (Notion hub, profile, PIN, devices).

## Verification (all clean, via public URL)
typecheck clean · PYQ scoring exact (3✓1✗ = 5.33/8) · Notion live pull 238 +
filtered query 50 high-priority · weakness/burndown/forecast OK · 422 negative ·
browser pass: unlock → countdown → timer ticking → PYQ scored → weak topic queued →
Notion lightbox zoom → real AI reply → devices panel → mobile. No console errors.

## Known
- Mistral free tier 429s frequently → fallback provider answers instead (by design).
- PYQ dataset has no question stems (source data limitation); practice is key-based.
