import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, Plus, Trash2, WifiOff } from "lucide-react";
import {
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, PageHeader, StatCard } from "@/components/kit";
import { apiDelete, apiPost } from "@/lib/api";
import { KIND_LABELS, errDetail, fmtDate, fmtDayShort, todayISO } from "@/lib/format";
import { useSubjects, useTests } from "@/lib/queries";
import type { TestRecord } from "@/lib/types";

export default function Tests() {
  const qc = useQueryClient();
  const tests = useTests();
  const subjects = useSubjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("prelims_gs");
  const [subjectId, setSubjectId] = useState("none");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("200");
  const [accuracy, setAccuracy] = useState("");
  const [date, setDate] = useState(todayISO);
  const [weakTopics, setWeakTopics] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiPost<TestRecord>("/tests", {
        name: name.trim(),
        kind,
        subject_id: subjectId === "none" ? null : subjectId,
        score: Number(score) || 0,
        max_score: Number(maxScore) || 200,
        accuracy: Number(accuracy) || 0,
        date,
        weak_topics: weakTopics
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    onSuccess: (t) => {
      toast.success(`“${t.name}” recorded`);
      qc.invalidateQueries({ queryKey: ["tests"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
      setOpen(false);
      setName("");
      setScore("");
      setAccuracy("");
      setWeakTopics("");
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/tests/${id}`),
    onSuccess: () => {
      toast.success("Test removed");
      qc.invalidateQueries({ queryKey: ["tests"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const list = tests.data ?? [];
  const avgAccuracy = list.length
    ? Math.round((list.reduce((a, t) => a + t.accuracy, 0) / list.length) * 10) / 10
    : 0;
  const best = list.reduce((a, t) => Math.max(a, (t.score / t.max_score) * 100), 0);
  const trend = [...list]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({ date: t.date, accuracy: t.accuracy }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Performance"
        title="Mock Tests & Practice"
        description="Prelims full-lengths, CSAT sectionals and Mains answers — track the curve, attack the weak topics."
        actions={
          <Button
            data-testid="record-test-btn"
            onClick={() => setOpen(true)}
            className="bg-[#C8640E] text-white hover:bg-[#A85309]"
          >
            <Plus className="size-4" /> Record test
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tests recorded" value={list.length} sub="all kinds" testId="tests-count-stat" />
        <StatCard
          label="Average accuracy"
          value={list.length ? `${avgAccuracy}%` : "—"}
          sub="across every attempt"
          testId="tests-avg-stat"
          accent
        />
        <StatCard
          label="Best score"
          value={list.length ? `${best.toFixed(1)}%` : "—"}
          sub="of maximum marks"
          testId="tests-best-stat"
        />
      </div>

      {list.length > 0 && !tests.isError ? (
        <section
          data-testid="tests-trend-card"
          className="rounded-2xl border border-[#E8E3D7] bg-white p-6 shadow-[0_1px_2px_rgba(28,29,24,0.04)]"
        >
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#8C6212]">
            Accuracy trend
          </p>
          <h2 className="mt-0.5 font-serif text-xl font-medium tracking-tight text-[#1C1D18]">
            Are the mocks moving up?
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#F0EDE5" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => fmtDayShort(v)}
                  tick={{ fill: "#5E6258", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#5E6258", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip formatter={(v: number) => [`${v}%`, "Accuracy"]} />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#C8640E"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#C8640E" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      {tests.isPending ? (
        <div className="space-y-2" data-testid="tests-skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[#F0EDE5]" />
          ))}
        </div>
      ) : tests.isError ? (
        <EmptyState
          icon={<WifiOff className="size-6" />}
          title="Test log unavailable"
          hint="The backend is unreachable right now — the rest of the app stays up."
          testId="tests-error-state"
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-6" />}
          title="No tests recorded yet"
          hint="Record your first mock to start the accuracy curve."
          testId="tests-empty-state"
        />
      ) : (
        <div className="rounded-2xl border border-[#E8E3D7] bg-white shadow-[0_1px_2px_rgba(28,29,24,0.04)]">
          <Table data-testid="tests-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-28 font-mono text-[11px] uppercase tracking-[0.14em]">Date</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-[0.14em]">Test</TableHead>
                <TableHead className="w-28 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Score</TableHead>
                <TableHead className="w-24 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Accuracy</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-[0.14em]">Weak topics</TableHead>
                <TableHead className="w-14" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((t) => (
                <TableRow key={t.id} data-testid={`test-row-${t.id}`}>
                  <TableCell className="text-sm text-[#5E6258]">{fmtDate(t.date)}</TableCell>
                  <TableCell>
                    <p className="font-medium text-[#1C1D18]">{t.name}</p>
                    <Badge variant="outline" className="mt-1 border-[#E8E3D7] font-mono text-[10px] uppercase tracking-[0.12em] text-[#5E6258]">
                      {KIND_LABELS[t.kind] ?? t.kind}
                      {t.subject_name ? ` · ${t.subject_name}` : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold text-[#1C1D18]">
                    {t.score}/{t.max_score}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold text-[#1D3A2C]">
                    {t.accuracy}%
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {t.weak_topics.length === 0 ? (
                        <span className="text-xs text-[#8B8F83]">—</span>
                      ) : (
                        t.weak_topics.map((w) => (
                          <span
                            key={w}
                            className="rounded-full bg-[#F6F2E9] px-2 py-0.5 text-xs text-[#5E6258]"
                          >
                            {w}
                          </span>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      data-testid={`test-delete-${t.id}`}
                      aria-label={`Delete test ${t.name}`}
                      onClick={() => del.mutate(t.id)}
                    >
                      <Trash2 className="size-4 text-[#5E6258]" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Record a test</DialogTitle>
            <DialogDescription>Every mock is data — feed the curve.</DialogDescription>
          </DialogHeader>
          <form
            data-testid="test-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && score !== "" && accuracy !== "") create.mutate();
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="test-name">Test name</Label>
              <Input
                id="test-name"
                data-testid="test-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Vision IAS Prelims PTS #05"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="test-kind">Kind</Label>
                <Select value={kind} onValueChange={(v) => setKind(v)}>
                  <SelectTrigger data-testid="test-kind-select" className="w-full">
                    <SelectValue>{(v) => KIND_LABELS[v as string] ?? "Prelims GS"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="test-subject">Subject (optional)</Label>
                <Select value={subjectId} onValueChange={(v) => setSubjectId(v)}>
                  <SelectTrigger data-testid="test-subject-select" className="w-full">
                    <SelectValue>
                      {(v) =>
                        v === "none" || v === undefined
                          ? "No subject"
                          : (subjects.data?.find((s) => s.id === (v as string))?.short_name ?? "No subject")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No subject</SelectItem>
                    {(subjects.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="test-score">Score</Label>
                <Input
                  id="test-score"
                  data-testid="test-score-input"
                  type="number"
                  min={0}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="112"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="test-max">Max score</Label>
                <Input
                  id="test-max"
                  data-testid="test-max-input"
                  type="number"
                  min={1}
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="test-accuracy">Accuracy (%)</Label>
                <Input
                  id="test-accuracy"
                  data-testid="test-accuracy-input"
                  type="number"
                  min={0}
                  max={100}
                  value={accuracy}
                  onChange={(e) => setAccuracy(e.target.value)}
                  placeholder="56"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="test-date">Date</Label>
                <Input
                  id="test-date"
                  data-testid="test-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="test-weak">Weak topics (comma separated)</Label>
                <Input
                  id="test-weak"
                  data-testid="test-weak-input"
                  value={weakTopics}
                  onChange={(e) => setWeakTopics(e.target.value)}
                  placeholder="Polity, Map-based Geography"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" data-testid="test-cancel-button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || create.isPending}
                data-testid="test-save-button"
                className="bg-[#C8640E] text-white hover:bg-[#A85309]"
              >
                {create.isPending ? "Saving…" : "Record test"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
