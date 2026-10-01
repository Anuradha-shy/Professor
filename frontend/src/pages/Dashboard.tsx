import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  FileText,
  Flame,
  Library,
  ListChecks,
  Play,
  Radar,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  WifiOff,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/lib/recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Countdown from "@/components/Countdown";
import ProgressRing from "@/components/ProgressRing";
import SessionDialog from "@/components/SessionDialog";
import StudyTimer from "@/components/StudyTimer";
import { CardShell, EmptyState, PageHeader, StatCard, SubjectChip } from "@/components/kit";
import {
  KIND_LABELS,
  dueLabel,
  fmtDate,
  fmtDayShort,
  fmtHours,
  fmtMinutes,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useGoals,
  useInsights,
  usePyqAttempts,
  useProfile,
  useRevisions,
  useSessions,
  useSubjects,
  useTests,
} from "@/lib/queries";

function Region({
  pending,
  error,
  empty,
  children,
}: {
  pending: boolean;
  error: boolean;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (pending) {
    return (
      <div className="space-y-2.5" data-testid="region-skeleton">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-[#F0EDE5]" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        icon={<WifiOff className="size-6" />}
        title="Data unavailable"
        hint="The backend is unreachable right now — the shell stays up."
      />
    );
  }
  if (empty) {
    return (
      <EmptyState
        icon={<TrendingUp className="size-6" />}
        title="Nothing here yet"
        hint="Log your first entry and this fills up."
      />
    );
  }
  return <>{children}</>;
}

export default function Dashboard() {
  const insights = useInsights();
  const profile = useProfile();
  const subjects = useSubjects();
  const goals = useGoals();
  const revisions = useRevisions();
  const tests = useTests();
  const sessions = useSessions(10_000);
  const pyqAttempts = usePyqAttempts();
  const [logOpen, setLogOpen] = useState(false);
  const [activityRange, setActivityRange] = useState<7 | 14 | 30 | 90 | 0>(14);

  const ins = insights.data;
  const prof = profile.data;
  const target = ins?.daily_target_minutes ?? 480;
  const todayPct = ins ? Math.min(100, Math.round((ins.today_minutes / target) * 100)) : 0;
  const week = (ins?.daily ?? []).slice(-7).map((d) => ({ ...d, hours: +(d.minutes / 60).toFixed(1) }));
  const horizon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const upcoming = (revisions.data ?? [])
    .filter((r) => r.next_due <= horizon)
    .slice(0, 5);
  const recentTests = (tests.data ?? []).slice(0, 4);
  const activeGoals = (goals.data ?? []).filter((g) => g.status === "active").slice(0, 3);
  const totalTopics = (subjects.data ?? []).reduce((a, s) => a + s.total_topics, 0);
  const doneTopics = (subjects.data ?? []).reduce((a, s) => a + s.completed_topics, 0);
  const today = new Date();
  const dateKey = (date: Date) => date.toISOString().slice(0, 10);
  const todayKey = dateKey(today);
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = dateKey(yesterdayDate);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  const allSessions = sessions.data ?? [];
  const todaySessions = allSessions.filter((session) => session.date === todayKey);
  const minutesFor = (rows: typeof allSessions) => rows.reduce((total, row) => total + row.duration_minutes, 0);
  const yesterdayMinutes = minutesFor(allSessions.filter((session) => session.date === yesterdayKey));
  const monthMinutes = minutesFor(allSessions.filter((session) => session.date >= monthStart && session.date <= todayKey));
  const firstSessionDate = allSessions.reduce((first, session) => session.date < first ? session.date : first, todayKey);
  const daysTracked = Math.max(1, Math.floor((today.getTime() - new Date(`${firstSessionDate}T00:00:00`).getTime()) / 86400000) + 1);
  const dailyAverage = allSessions.length ? Math.round(minutesFor(allSessions) / daysTracked) : 0;
  const longestSession = Math.max(0, ...allSessions.map((session) => session.duration_minutes));
  const subjectStudy = (subjects.data ?? []).map((subject) => ({
    ...subject,
    studyMinutes: minutesFor(allSessions.filter((session) => session.subject_id === subject.id)),
  })).sort((left, right) => right.studyMinutes - left.studyMinutes);
  const chartDays = activityRange || Math.min(365, Math.max(14, daysTracked));
  const activity = Array.from({ length: chartDays }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (chartDays - 1) + index);
    const key = dateKey(date);
    const dayTests = (tests.data ?? []).filter((test) => test.date === key);
    const dayAttempts = (pyqAttempts.data ?? []).filter((attempt) => attempt.date === key);
    const dayRevisions = (revisions.data ?? []).filter((revision) =>
      (revision.last_revised ?? revision.created_at.slice(0, 10)) === key,
    );
    return {
      date: key,
      minutes: minutesFor(allSessions.filter((session) => session.date === key)),
      tests: dayTests.length,
      accuracy: dayTests.length
        ? Math.round(dayTests.reduce((total, test) => total + test.accuracy, 0) / dayTests.length)
        : null,
      questions: dayAttempts.reduce((total, attempt) => total + attempt.total, 0),
      revisions: dayRevisions.length,
    };
  });
  const hasActivity = activity.some((day) => day.minutes || day.tests || day.questions || day.revisions);

  const scrollToTimer = () => document.querySelector('[data-testid="study-timer"]')?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline={prof?.target_exam ?? "UPSC Civil Services Examination 2027"}
        title={`Namaste, ${prof?.name ?? "Professor"}`}
        description="Your command centre for syllabus mastery, revision cadence and mock performance."
        actions={
          <>
            <Badge
              data-testid="prelims-countdown-badge"
              className="gap-1.5 border-[#E8E3D7] bg-white px-3 py-1.5 text-[#383A34]"
            >
              <Target className="size-3.5 text-[#1D3A2C]" />
              {ins ? `${ins.days_to_prelims} days to Prelims · 24 May 2027` : "Prelims · 24 May 2027"}
            </Badge>
            <Badge
              data-testid="streak-badge"
              className="gap-1.5 border-[#E8E3D7] bg-white px-3 py-1.5 text-[#383A34]"
            >
              <Flame className="size-3.5 text-[#C8640E]" />
              {ins ? `${ins.streak_days}-day streak` : "—"}
            </Badge>
            <Button
              data-testid="dashboard-log-session-btn"
              onClick={() => setLogOpen(true)}
              className="bg-[#C8640E] text-white hover:bg-[#A85309]"
            >
              Log Session
            </Button>
          </>
        }
      />

      <div className="grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Countdown />
        <section className="flex min-w-48 flex-col justify-center gap-2 rounded-2xl border border-[#0F5B78]/30 bg-[#0F5B78] p-4 text-white shadow-[0_8px_24px_rgba(15,91,120,0.14)]" data-testid="uppsc-countdown-card">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/70">Also on your calendar</p>
          <p className="font-serif text-lg font-semibold">UPPSC · 6 Dec 2026</p>
          <Countdown exam="uppsc" compact />
        </section>
      </div>
      <StudyTimer />

      <section className="grid gap-3 rounded-2xl border border-white/70 bg-white/55 p-4 shadow-[0_10px_28px_rgba(28,29,24,0.05)] backdrop-blur-2xl sm:grid-cols-2 lg:grid-cols-4" data-testid="dashboard-quick-access">
        <button type="button" onClick={scrollToTimer} className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-left transition-colors hover:bg-white">
          <Play className="size-4 text-[#1D3A2C]" /><span className="text-sm font-medium">Start studying</span>
        </button>
        <button type="button" onClick={() => setLogOpen(true)} className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-left transition-colors hover:bg-white">
          <CalendarDays className="size-4 text-[#C8640E]" /><span className="text-sm font-medium">Schedule session</span>
        </button>
        <Link to="/tests" className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-sm font-medium transition-colors hover:bg-white"><ListChecks className="size-4 text-[#0F5B78]" />Mock tests</Link>
        <Link to="/professor" className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-sm font-medium transition-colors hover:bg-white"><Sparkles className="size-4 text-[#6247AA]" />AI command center · OMR</Link>
        <Link to="/pyq" className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-sm font-medium transition-colors hover:bg-white"><Library className="size-4 text-[#1D3A2C]" />PYQ explorer</Link>
        <Link to="/weakness" className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-sm font-medium transition-colors hover:bg-white"><Radar className="size-4 text-[#B91C1C]" />Weak areas</Link>
        <Link to="/revisions" className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-sm font-medium transition-colors hover:bg-white"><RotateCcw className="size-4 text-[#B8860B]" />Revision queue</Link>
        <Link to="/sessions" className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-sm font-medium transition-colors hover:bg-white"><BookOpen className="size-4 text-[#843B62]" />Study calendar & log</Link>
        <Link to="/insights" className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-sm font-medium transition-colors hover:bg-white"><FileText className="size-4 text-[#0F5B78]" />Reports & intelligence</Link>
      </section>

      {/* Stat band */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div
          data-testid="today-progress-card"
          className="flex items-center gap-4 rounded-xl border border-[#E2DCCE] bg-[#FEF3E2] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
        >
          <ProgressRing value={todayPct} size={84} label={ins ? fmtHours(ins.today_minutes) : "—"} />
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#8C6212]">
              Today's target
            </p>
            <p className="mt-1 font-serif text-xl font-semibold text-[#1C1D18]">
              {ins ? `${fmtMinutes(ins.today_minutes)} / ${fmtMinutes(target)}` : "—"}
            </p>
            <p className="mt-0.5 text-sm text-[#5E6258]">{todayPct}% of your daily goal</p>
          </div>
        </div>
        <StatCard
          label="Current streak"
          value={ins ? `${ins.streak_days} days` : "—"}
          sub={ins ? `${ins.sessions_count} sessions logged` : "—"}
          testId="stat-streak"
        />
        <StatCard
          label="This week"
          value={ins ? fmtHours(ins.this_week_minutes) : "—"}
          sub={
            ins
              ? `${ins.week_delta_pct >= 0 ? "▲" : "▼"} ${Math.abs(ins.week_delta_pct)}% vs last week`
              : "—"
          }
          testId="stat-week"
        />
        <StatCard
          label="Syllabus progress"
          value={ins ? `${ins.syllabus_progress_pct}%` : "—"}
          sub={subjects.data ? `${doneTopics} of ${totalTopics} topics` : "—"}
          testId="stat-syllabus"
        />
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]" data-testid="dashboard-study-summary">
        <CardShell title="Study time, at a glance" overline="Real logged sessions" testId="dashboard-study-periods">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Today", fmtMinutes(minutesFor(todaySessions))],
              ["Yesterday", fmtMinutes(yesterdayMinutes)],
              ["This week", fmtHours(ins?.this_week_minutes ?? minutesFor(allSessions.filter((session) => session.date >= dateKey(weekStart) && session.date <= todayKey)))],
              ["This month", fmtHours(monthMinutes)],
              ["All time", fmtHours(minutesFor(allSessions))],
              ["Daily average", fmtMinutes(dailyAverage)],
              ["Longest session", fmtMinutes(longestSession)],
              ["Tests logged", String(tests.data?.length ?? 0)],
              ["Average accuracy", tests.data?.length ? `${Math.round(tests.data.reduce((total, test) => total + test.accuracy, 0) / tests.data.length)}%` : "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/80 bg-white/55 p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#77796F]">{label}</p>
                <p className="mt-1 font-serif text-xl font-semibold text-[#1C1D18]">{sessions.isPending ? "…" : value}</p>
              </div>
            ))}
          </div>
          {subjectStudy.length ? (
            <div className="mt-5 space-y-2.5" data-testid="dashboard-subject-study-time">
              {subjectStudy.filter((subject) => subject.studyMinutes > 0).slice(0, 6).map((subject) => (
                <div key={subject.id} className="grid grid-cols-[5rem_minmax(0,1fr)_4rem] items-center gap-2 text-xs">
                  <span className="font-mono text-[#5E6258]">{subject.short_name}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-[#E8E3D7]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, subjectStudy[0].studyMinutes ? subject.studyMinutes / subjectStudy[0].studyMinutes * 100 : 0)}%`, backgroundColor: subject.color }} /></div>
                  <span className="text-right font-mono text-[#5E6258]">{fmtHours(subject.studyMinutes)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CardShell>

        <CardShell
          title={`${activityRange || "All"}-day activity`}
          overline="Actual portal activity"
          testId="dashboard-14-day-activity"
          action={
            <div className="flex flex-wrap gap-1" aria-label="Activity date range">
              {([7, 14, 30, 90, 0] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  data-testid={`activity-range-${range || "all"}`}
                  aria-pressed={activityRange === range}
                  onClick={() => setActivityRange(range)}
                  className={cn(
                    "rounded-md px-2 py-1 font-mono text-[10px] transition-colors",
                    activityRange === range ? "bg-[#1D3A2C] text-white" : "text-[#5E6258] hover:bg-white/80",
                  )}
                >
                  {range || "All"}
                  {range ? "D" : ""}
                </button>
              ))}
            </div>
          }
        >
          {!hasActivity ? (
            <EmptyState icon={<BarChart3 className="size-6" />} title="No activity in this period" hint="Study sessions, tests, PYQs, and revisions will appear here after they are recorded." testId="dashboard-activity-empty" />
          ) : (
            <div className="h-64" data-testid="dashboard-activity-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={activity} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#E8E3D7" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} tick={{ fill: "#5E6258", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="effort" tick={{ fill: "#5E6258", fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
                  <YAxis yAxisId="quality" orientation="right" domain={[0, 100]} tick={{ fill: "#5E6258", fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip formatter={(value: number, name: string) => [name === "Study minutes" ? fmtMinutes(value) : name === "Accuracy" ? `${value}%` : value, name]} />
                  <Bar yAxisId="effort" dataKey="minutes" name="Study minutes" fill="#0F5B78" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Line yAxisId="quality" type="monotone" dataKey="accuracy" name="Accuracy" stroke="#C8640E" strokeWidth={2} dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          {hasActivity ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#5E6258]" data-testid="dashboard-activity-totals"><span>{activity.reduce((total, day) => total + day.tests, 0)} tests</span><span>{activity.reduce((total, day) => total + day.questions, 0)} PYQs attempted</span><span>{activity.reduce((total, day) => total + day.revisions, 0)} revision events</span><span>{ins?.streak_days ?? 0}-day streak</span><span>Accuracy line uses test dates only</span></div> : null}
        </CardShell>
      </section>

      <CardShell title="Study allocation by subject" overline="All recorded sessions" testId="dashboard-study-subjects">
        {subjectStudy.filter((subject) => subject.studyMinutes > 0).length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {subjectStudy.filter((subject) => subject.studyMinutes > 0).map((subject) => (
              <div key={subject.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/55 p-3">
                <SubjectChip short={subject.short_name} color={subject.color} />
                <span className="font-mono text-xs text-[#5E6258]">{fmtHours(subject.studyMinutes)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-[#5E6258]">Study time by subject appears after sessions are logged.</p>}
      </CardShell>

      {/* Main asymmetric grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <CardShell title="Study velocity — last 7 days" overline="Daily hours" testId="velocity-card">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={week} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#F0EDE5" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => fmtDayShort(v)}
                    tick={{ fill: "#5E6258", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#5E6258", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(200,100,14,0.06)" }}
                    formatter={(v: number) => [`${v}h`, "Studied"]}
                  />
                  <Bar dataKey="hours" fill="#C8640E" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardShell>

          <CardShell
            title="Upcoming revisions"
            overline="Spaced repetition"
            testId="dashboard-revisions-card"
            action={
              <Link
                to="/revisions"
                className="inline-flex items-center gap-1 text-sm font-medium text-[#9B4E08] hover:text-[#7A3D06]"
              >
                Open queue <ArrowRight className="size-4" />
              </Link>
            }
          >
            <Region
              pending={revisions.isPending}
              error={revisions.isError}
              empty={upcoming.length === 0}
            >
              <ul className="space-y-2">
                {upcoming.map((r) => (
                  <li
                    key={r.id}
                    data-testid={`dashboard-revision-${r.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F0EDE5] px-4 py-3 transition-colors hover:bg-[#FBF9F4]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-serif text-base font-medium text-[#1C1D18]">
                        {r.topic}
                      </p>
                      <p className="text-xs text-[#5E6258]">
                        {r.source ? `${r.source} · ` : ""}
                        {r.review_count} revisions so far
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <SubjectChip short={r.subject_name} color="#1D3A2C" />
                      <Badge
                        className={
                          r.next_due <= (ins?.daily?.at(-1)?.date ?? "")
                            ? "bg-[#FEF3E2] text-[#8A3D04]"
                            : "bg-[#EDF5F0] text-[#1D4532]"
                        }
                      >
                        <RotateCcw className="size-3" />
                        {dueLabel(r.next_due)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Region>
          </CardShell>

          <CardShell
            title="Recent mock tests"
            overline="Performance"
            testId="dashboard-tests-card"
            action={
              <Link
                to="/tests"
                className="inline-flex items-center gap-1 text-sm font-medium text-[#9B4E08] hover:text-[#7A3D06]"
              >
                All tests <ArrowRight className="size-4" />
              </Link>
            }
          >
            <Region pending={tests.isPending} error={tests.isError} empty={recentTests.length === 0}>
              <ul className="space-y-2">
                {recentTests.map((t) => (
                  <li
                    key={t.id}
                    data-testid={`dashboard-test-${t.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F0EDE5] px-4 py-3 transition-colors hover:bg-[#FBF9F4]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1C1D18]">{t.name}</p>
                      <p className="text-xs text-[#5E6258]">
                        {fmtDate(t.date)} · {KIND_LABELS[t.kind] ?? t.kind}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-[#1C1D18]">
                        {t.score}/{t.max_score}
                      </p>
                      <p className="text-xs text-[#5E6258]">{t.accuracy}% accuracy</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Region>
          </CardShell>
        </div>

        {/* Right rail */}
        <div className="space-y-6 lg:col-span-4">
          <CardShell title="Subject mastery" overline="Syllabus" testId="dashboard-subjects-card">
            <Region pending={subjects.isPending} error={subjects.isError}>
              <div className="space-y-4">
                {(subjects.data ?? []).map((s) => (
                  <div key={s.id} data-testid={`mastery-${s.id}`} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <SubjectChip short={s.short_name} color={s.color} />
                      <span className="font-mono text-xs text-[#5E6258]">
                        {s.completed_topics}/{s.total_topics} · {s.progress_pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#F0EDE5]">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${s.progress_pct}%`, backgroundColor: s.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Region>
          </CardShell>

          <CardShell
            title="Active goals"
            overline="Milestones"
            testId="dashboard-goals-card"
            action={
              <Link
                to="/goals"
                className="inline-flex items-center gap-1 text-sm font-medium text-[#9B4E08] hover:text-[#7A3D06]"
              >
                <Target className="size-4" /> All goals
              </Link>
            }
          >
            <Region pending={goals.isPending} error={goals.isError} empty={activeGoals.length === 0}>
              <div className="space-y-2.5">
                {activeGoals.map((g) => (
                  <Link
                    key={g.id}
                    to="/goals"
                    data-testid={`dashboard-goal-${g.id}`}
                    className="block rounded-lg border border-[#F0EDE5] p-3 transition-colors hover:bg-[#FBF9F4]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-[#1C1D18]">{g.title}</p>
                      <span className="font-mono text-xs text-[#5E6258]">{g.progress}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F0EDE5]">
                      <div
                        className="h-full rounded-full bg-[#1D3A2C] transition-all duration-700"
                        style={{ width: `${g.progress}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </Region>
          </CardShell>
        </div>
      </div>

      <SessionDialog open={logOpen} onOpenChange={setLogOpen} />
    </div>
  );
}
