import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Flame,
  RotateCcw,
  Target,
  TrendingUp,
  WifiOff,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import {
  useGoals,
  useInsights,
  useProfile,
  useRevisions,
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
  const [logOpen, setLogOpen] = useState(false);

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

      <Countdown />
      <StudyTimer />

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
