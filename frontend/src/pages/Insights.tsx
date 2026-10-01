import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/lib/recharts";
import { Badge } from "@/components/ui/badge";
import { CardShell, PageHeader, StatCard, SubjectChip } from "@/components/kit";
import { fmtHours, fmtMinutes } from "@/lib/format";
import { useInsights } from "@/lib/queries";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";

export default function Insights() {
  const insights = useInsights();
  const ins = insights.data;

  const daily = (ins?.daily ?? []).map((d) => ({
    ...d,
    hours: Math.round((d.minutes / 60) * 10) / 10,
  }));
  const hourly = (ins?.hourly ?? [])
    .filter((h) => h.hour >= 4)
    .map((h) => ({ label: `${h.hour}:00`, minutes: h.minutes }));
  const balance = ins?.subject_balance ?? [];
  const pieData = balance.map((b) => ({ name: b.short_name, value: b.minutes, color: b.color }));
  const peakHour = [...(ins?.hourly ?? [])].sort((a, b) => b.minutes - a.minutes)[0];
  const delta = ins?.week_delta_pct ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Intelligence"
        title="Productivity Insights"
        description="When you study, what you study, and how the effort compounds — computed fresh from your own log."
        actions={<Button render={<Link to="/analysis" data-testid="open-exam-analysis" />} variant="outline"><TrendingUp className="size-4" /> Exam trend atlas</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hours logged"
          value={ins ? fmtHours(ins.total_minutes) : "—"}
          sub={ins ? `${ins.sessions_count} sessions` : "—"}
          testId="insights-total-stat"
        />
        <StatCard
          label="Average session"
          value={ins ? fmtMinutes(ins.avg_session_minutes) : "—"}
          sub="deep-work length"
          testId="insights-avg-stat"
        />
        <StatCard
          label="Best study day"
          value={ins?.best_weekday ?? "—"}
          sub="most minutes logged"
          testId="insights-weekday-stat"
          accent
        />
        <StatCard
          label="Peak hour"
          value={peakHour && peakHour.minutes > 0 ? `${peakHour.hour}:00` : "—"}
          sub="your natural focus window"
          testId="insights-peak-stat"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <CardShell
          title="Study rhythm — last 14 days"
          overline="Daily hours"
          testId="insights-daily-card"
          className="lg:col-span-7"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#F0EDE5" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => v.slice(5)}
                  tick={{ fill: "#5E6258", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fill: "#5E6258", fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: "rgba(200,100,14,0.06)" }}
                  formatter={(v: number) => [`${v}h`, "Studied"]}
                />
                <Bar dataKey="hours" fill="#1D3A2C" radius={[5, 5, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardShell>

        <CardShell
          title="Subject balance"
          overline="Where the hours go"
          testId="insights-balance-card"
          className="lg:col-span-5"
        >
          {balance.length === 0 ? (
            <p className="py-16 text-center text-sm text-[#5E6258]">
              Log a few sessions and the balance chart appears.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <div className="h-44 w-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${fmtHours(v)}`, "Logged"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2" data-testid="balance-legend">
                {balance.map((b) => (
                  <li key={b.subject_id} className="flex items-center justify-between gap-3 text-sm">
                    <SubjectChip short={b.short_name} color={b.color} />
                    <span className="font-mono text-xs text-[#5E6258]">
                      {fmtHours(b.minutes)} · {b.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardShell>

        <CardShell
          title="When you study"
          overline="Time-of-day distribution"
          testId="insights-hourly-card"
          className="lg:col-span-7"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#F0EDE5" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#5E6258", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis tick={{ fill: "#5E6258", fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: "rgba(15,91,120,0.06)" }}
                  formatter={(v: number) => [`${fmtMinutes(v)}`, "Logged"]}
                />
                <Bar dataKey="minutes" fill="#0F5B78" radius={[5, 5, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardShell>

        <CardShell title="Focus quality" overline="Signal checks" testId="insights-quality-card" className="lg:col-span-5">
          <ul className="space-y-3" data-testid="quality-list">
            <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
              <span className="text-sm text-[#383A34]">Revisions due</span>
              <Badge
                data-testid="quality-revision-due"
                className={
                  (ins?.revision_due ?? 0) > 0
                    ? "border-0 bg-[#FEF3E2] text-[#8A3D04]"
                    : "border-0 bg-[#EDF5F0] text-[#1D4532]"
                }
              >
                {ins?.revision_due ?? "—"}
              </Badge>
            </li>
            <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
              <span className="text-sm text-[#383A34]">Active goals</span>
              <Badge className="border-0 bg-[#F6F2E9] text-[#383A34]" data-testid="quality-goal-active">
                {ins?.goal_active ?? "—"}
              </Badge>
            </li>
            <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
              <span className="text-sm text-[#383A34]">Mock tests recorded</span>
              <Badge className="border-0 bg-[#F6F2E9] text-[#383A34]" data-testid="quality-test-count">
                {ins?.test_count ?? "—"}
              </Badge>
            </li>
            <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
              <span className="text-sm text-[#383A34]">Average test accuracy</span>
              <Badge
                data-testid="quality-accuracy"
                className="border-0 bg-[#FEF3E2] font-mono text-[#8A3D04]"
              >
                {ins ? `${ins.test_avg_accuracy}%` : "—"}
              </Badge>
            </li>
            <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
              <span className="text-sm text-[#383A34]">Weekly velocity</span>
              <Badge
                data-testid="quality-velocity"
                className={
                  delta >= 0
                    ? "border-0 bg-[#EDF5F0] font-mono text-[#1D4532]"
                    : "border-0 bg-[#FEF3E2] font-mono text-[#8A3D04]"
                }
              >
                {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
              </Badge>
            </li>
          </ul>
        </CardShell>
      </div>
    </div>
  );
}
