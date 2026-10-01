import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Radar, RotateCcw, ShieldCheck } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/lib/recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardShell, EmptyState, PageHeader, StatCard } from "@/components/kit";
import { apiPost } from "@/lib/api";
import { errDetail, fmtMinutes } from "@/lib/format";
import { useBurndown, useForecast, useHeatmap, useSubjects, useWeakness } from "@/lib/queries";
import type { Revision } from "@/lib/types";
import { cn } from "@/lib/utils";

function heatColor(minutes: number): string {
  if (minutes === 0) return "#F0EDE5";
  if (minutes < 120) return "#FAE3C4";
  if (minutes < 300) return "#EFB273";
  if (minutes < 480) return "#D77F27";
  return "#1D3A2C";
}

export default function Weakness() {
  const qc = useQueryClient();
  const weakness = useWeakness();
  const heat = useHeatmap();
  const burn = useBurndown();
  const forecast = useForecast();
  const subjects = useSubjects();

  const queue = useMutation({
    mutationFn: ({ topic, subjectId }: { topic: string; subjectId: string }) =>
      apiPost<Revision>("/revisions", {
        topic,
        subject_id: subjectId,
        source: "Weakness radar",
      }),
    onSuccess: (r) => {
      toast.success(`“${r.topic}” queued for revision`);
      qc.invalidateQueries({ queryKey: ["revisions"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const items = weakness.data?.items ?? [];
  const chart = items.slice(0, 10).map((i) => ({
    topic: i.topic.length > 18 ? `${i.topic.slice(0, 17)}…` : i.topic,
    severity: i.severity,
  }));
  const f = forecast.data;
  const weeks = heat.data ? Math.max(...heat.data.map((c) => c.week)) + 1 : 0;
  const resolveSubjectId = (label: string) => {
    const normalized = label.trim().toLowerCase();
    if (!normalized) return null;
    const direct = subjects.data?.find((subject) =>
      [subject.id, subject.short_name, subject.name].some((name) => name.trim().toLowerCase() === normalized),
    );
    if (direct) return direct.id;
    const paper = normalized.match(/\bgs[\s-]*(iv|iii|ii|i|[1-4])\b/)?.[1];
    const paperIds: Record<string, string> = { i: "gs1", 1: "gs1", ii: "gs2", 2: "gs2", iii: "gs3", 3: "gs3", iv: "gs4", 4: "gs4" };
    const targetId = /philosophy optional|psir|optional/.test(normalized)
      ? "optional"
      : /csat|aptitude/.test(normalized)
        ? "csat"
        : paper
          ? paperIds[paper]
          : /history|geograph|culture|society/.test(normalized)
          ? "gs1"
          : /polity|governance|social justice|international relations|\bir\b/.test(normalized)
            ? "gs2"
            : /economy|agri|environment|science|technology|security|disaster/.test(normalized)
              ? "gs3"
              : /ethics|case stud/.test(normalized)
                ? "gs4"
                : null;
    return subjects.data?.find((subject) => subject.id === targetId)?.id ?? null;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Focus intelligence"
        title="Weakness Radar"
        description="Ranked from your mock-test weak tags and every PYQ you answered wrong — push a topic straight into the revision queue."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Focus topics"
          value={weakness.data?.total_topics ?? "—"}
          sub="detected from your data"
          testId="weak-total-stat"
        />
        <StatCard
          label="Critical"
          value={weakness.data?.critical ?? "—"}
          sub="severity 4 or higher"
          testId="weak-critical-stat"
          accent
        />
        <StatCard
          label="Not yet queued"
          value={weakness.data?.not_queued ?? "—"}
          sub="missing from revision"
          testId="weak-queued-stat"
        />
        <StatCard
          label="Days to Prelims"
          value={f?.days_to_prelims ?? "—"}
          sub="24 May 2027"
          testId="weak-days-stat"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <CardShell
          title="Top focus topics"
          overline="Severity = mock hits ×2 + PYQ wrongs"
          testId="weak-chart-card"
          className="lg:col-span-7"
        >
          {chart.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="size-6" />}
              title="No weak spots detected yet"
              hint="Record a mock test or attempt PYQs and the radar fills in."
              testId="weak-empty-state"
            />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} layout="vertical" margin={{ left: 40, right: 16 }}>
                  <CartesianGrid stroke="#F0EDE5" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#5E6258", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="topic"
                    width={120}
                    tick={{ fill: "#5E6258", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(200,100,14,0.06)" }}
                    formatter={(v: number) => [String(v), "Severity"]}
                  />
                  <Bar dataKey="severity" fill="#C8640E" radius={[0, 5, 5, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardShell>

        <CardShell title="Pace forecast" overline="Will you finish in time?" testId="forecast-card" className="lg:col-span-5">
          {f ? (
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
                <span className="text-[#383A34]">Verdict</span>
                <Badge
                  data-testid="forecast-verdict"
                  className={cn(
                    "border-0 font-mono text-[10px] uppercase tracking-[0.14em]",
                    f.on_track ? "bg-[#EDF5F0] text-[#1D4532]" : "bg-[#FEF3E2] text-[#8A3D04]",
                  )}
                >
                  {f.on_track ? "On track" : "Behind pace"}
                </Badge>
              </li>
              <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
                <span className="text-[#383A34]">28-day average / day</span>
                <span className="font-mono text-[#1C1D18]">
                  {fmtMinutes(f.avg_daily_minutes)} of {fmtMinutes(f.daily_target_minutes)}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
                <span className="text-[#383A34]">Daily gap</span>
                <span
                  className={cn(
                    "font-mono",
                    f.target_gap_minutes >= 0 ? "text-[#15803D]" : "text-[#B91C1C]",
                  )}
                >
                  {f.target_gap_minutes >= 0 ? "+" : "−"}
                  {fmtMinutes(Math.abs(f.target_gap_minutes))}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
                <span className="text-[#383A34]">Topics remaining</span>
                <span className="font-mono text-[#1C1D18]">
                  {f.topics_remaining} · {f.topics_per_week}/week
                </span>
              </li>
              <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
                <span className="text-[#383A34]">Weeks needed vs left</span>
                <span className="font-mono text-[#1C1D18]">
                  {f.weeks_needed ?? "—"} vs {f.weeks_left}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-xl border border-[#F0EDE5] px-4 py-3">
                <span className="text-[#383A34]">Projected hours to exam</span>
                <span className="font-mono text-[#1C1D18]">{f.projected_hours_to_exam}h</span>
              </li>
            </ul>
          ) : (
            <div className="h-56 animate-pulse rounded-xl bg-[#F0EDE5]" />
          )}
        </CardShell>

        <CardShell
          title="Study heatmap"
          overline={`last ${weeks} weeks`}
          testId="heatmap-card"
          className="lg:col-span-7"
        >
          <div className="flex gap-1 overflow-x-auto pb-2" data-testid="heatmap-grid">
            {Array.from({ length: weeks }).map((_, w) => (
              <div key={w} className="flex flex-col gap-1">
                {Array.from({ length: 7 }).map((_, d) => {
                  const cell = (heat.data ?? []).find((c) => c.week === w && c.weekday === d);
                  return (
                    <span
                      key={d}
                      title={cell ? `${cell.date}: ${fmtMinutes(cell.minutes)}` : ""}
                      className="size-3.5 rounded-sm transition-transform hover:scale-125"
                      style={{ backgroundColor: cell ? heatColor(cell.minutes) : "#F6F2E9" }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-[#5E6258]">
            <span>Less</span>
            {["#F0EDE5", "#FAE3C4", "#EFB273", "#D77F27", "#1D3A2C"].map((c) => (
              <span key={c} className="size-3 rounded-sm" style={{ backgroundColor: c }} />
            ))}
            <span>More</span>
          </div>
        </CardShell>

        <CardShell
          title="Syllabus burn-down"
          overline="Topics left vs ideal line"
          testId="burndown-card"
          className="lg:col-span-5"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={burn.data ?? []} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#F0EDE5" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => v.slice(5)}
                  tick={{ fill: "#5E6258", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fill: "#5E6258", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(v: number) => [`${v} topics`, "Remaining"]} />
                <Line type="monotone" dataKey="remaining" stroke="#C8640E" strokeWidth={2.5} dot={false} />
                <Line
                  type="monotone"
                  dataKey="ideal"
                  stroke="#1D3A2C"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardShell>
      </div>

      {items.length > 0 ? (
        <CardShell title="Focus list" overline="Act on these" testId="weak-list-card">
          <ul className="space-y-2" data-testid="weakness-list">
            {items.map((i) => {
              const subjectId = resolveSubjectId(i.subject);
              return (
                <li
                  key={`${i.subject}-${i.topic}`}
                  data-testid={`weakness-item-${subjectId ?? "unmapped"}-${i.topic.replace(/\s+/g, "-").toLowerCase()}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F0EDE5] px-4 py-3 transition-colors hover:bg-[#FBF9F4]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-medium text-[#1C1D18]">{i.topic}</p>
                    <p className="text-xs text-[#5E6258]">
                      {i.mock_hits} mock flag{i.mock_hits === 1 ? "" : "s"} · {i.pyq_wrong} PYQ wrong
                      {i.subject ? ` · ${i.subject}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        "border-0 font-mono text-[10px] uppercase tracking-[0.14em]",
                        i.severity >= 4
                          ? "bg-[#FDF0F0] text-[#B91C1C]"
                          : "bg-[#FEF3E2] text-[#8A3D04]",
                      )}
                    >
                      {i.severity >= 4 ? <AlertTriangle className="size-3" /> : <Radar className="size-3" />}
                      severity {i.severity}
                    </Badge>
                    {i.in_revision_queue ? (
                      <Badge className="border-0 bg-[#EDF5F0] text-[#1D4532]">
                        <ShieldCheck className="size-3" /> queued
                      </Badge>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        data-testid={`weakness-queue-${subjectId ?? "unmapped"}-${i.topic.replace(/\s+/g, "-").toLowerCase()}`}
                        disabled={queue.isPending || !subjectId}
                        title={subjectId ? `Queue under ${subjects.data?.find((subject) => subject.id === subjectId)?.short_name}` : "Add a clear subject tag to this mock/PYQ record before queueing."}
                        onClick={() => subjectId && queue.mutate({ topic: i.topic, subjectId })}
                      >
                        <RotateCcw className="size-3.5" /> {subjectId ? "Queue revision" : "Subject needed"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardShell>
      ) : null}
    </div>
  );
}
