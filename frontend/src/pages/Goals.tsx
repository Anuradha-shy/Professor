import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Minus, Plus, Target, Trash2, WifiOff } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, SubjectChip } from "@/components/kit";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { PRIORITY_LABELS, errDetail, fmtDate, todayISO } from "@/lib/format";
import { useGoals, useSessions, useSubjects } from "@/lib/queries";
import type { Goal } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-[#FEF3E2] text-[#8A3D04]",
  medium: "bg-[#EDF5F0] text-[#1D4532]",
  low: "bg-[#F6F2E9] text-[#5E6258]",
};

const GOAL_PRESETS = [
  {
    title: "Prelims PYQ cycle · GS-I",
    description: "Attempt and review one previous-year GS-I set; add missed topics to revision.",
    subjectId: "gs1",
    days: 7,
  },
  {
    title: "Prelims CSAT timed practice",
    description: "Complete two timed CSAT sets and review accuracy and time spent.",
    subjectId: "csat",
    days: 7,
  },
  {
    title: "Mains answer-writing · Governance & Social Justice",
    description: "Write and self-review ten GS-II answers on governance, social justice, and constitutional institutions.",
    subjectId: "gs2",
    days: 7,
  },
  {
    title: "Prelims + Mains cycle · Agriculture & Internal Security",
    description: "Revise agriculture, food security, cyber security, and internal security with PYQs and two mains answers.",
    subjectId: "gs3",
    days: 10,
  },
  {
    title: "Mains ethics case-study practice",
    description: "Complete five GS-IV case studies and revise the ethical frameworks used.",
    subjectId: "gs4",
    days: 10,
  },
  {
    title: "Philosophy optional · Paper I & II answer cycle",
    description: "Write timed answers on one Western and one Indian philosophy topic each study day.",
    subjectId: "optional",
    days: 14,
  },
];

export default function Goals() {
  const qc = useQueryClient();
  const goals = useGoals();
  const subjects = useSubjects();
  const sessions = useSessions(10_000);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("none");
  const [priority, setPriority] = useState("medium");
  const [targetDate, setTargetDate] = useState(todayISO);
  const [progress, setProgress] = useState("0");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["insights"] });
  };

  const create = useMutation({
    mutationFn: (preset?: (typeof GOAL_PRESETS)[number]) =>
      apiPost<Goal>("/goals", {
        title: preset?.title ?? title.trim(),
        description: preset?.description ?? description.trim(),
        subject_id: preset
          ? subjects.data?.find((subject) => subject.id === preset.subjectId)?.id ?? null
          : subjectId === "none"
            ? null
            : subjectId,
        priority: preset ? "high" : priority,
        target_date: preset
          ? new Date(Date.now() + preset.days * 86400000).toISOString().slice(0, 10)
          : targetDate,
        progress: preset ? 0 : Number(progress) || 0,
      }),
    onSuccess: (goal) => {
      toast.success(`Goal “${goal.title}” created`);
      invalidate();
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      setSubjectId("none");
      setPriority("medium");
      setProgress("0");
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const bump = useMutation({
    mutationFn: ({ goal, delta }: { goal: Goal; delta: number }) =>
      apiPatch<Goal>(`/goals/${goal.id}`, {
        progress: Math.max(0, Math.min(100, goal.progress + delta)),
      }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(errDetail(error)),
  });

  const complete = useMutation({
    mutationFn: (id: string) => apiPatch<Goal>(`/goals/${id}`, { progress: 100 }),
    onSuccess: () => {
      toast.success("Goal completed — brilliant");
      invalidate();
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const reopen = useMutation({
    mutationFn: (id: string) => apiPatch<Goal>(`/goals/${id}`, { status: "active" }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(errDetail(error)),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/goals/${id}`),
    onSuccess: () => {
      toast.success("Goal removed");
      invalidate();
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const roadmap = useMutation({
    mutationFn: () => apiPost<Goal[]>("/goals/syllabus-roadmap"),
    onSuccess: (created) => {
      toast.success(created.length ? `Created ${created.length} syllabus goals` : "Syllabus roadmap is already up to date");
      invalidate();
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const list = goals.data ?? [];
  const today = todayISO();

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Milestones"
        title="Goals & Roadmap"
        description="Strategic targets across GS papers, optional and prelims — nudge progress as you climb."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" data-testid="create-syllabus-roadmap-btn" disabled={roadmap.isPending || !subjects.data?.length} onClick={() => roadmap.mutate()}>
              <Target className="size-4" /> {roadmap.isPending ? "Building…" : "Build syllabus roadmap"}
            </Button>
            <Button
              data-testid="create-goal-btn"
              onClick={() => setCreateOpen(true)}
              className="bg-[#C8640E] text-white hover:bg-[#A85309]"
            >
              <Plus className="size-4" /> New goal
            </Button>
          </div>
        }
      />

      <section className="glass-surface rounded-2xl border border-white/70 bg-white/65 p-5 shadow-[0_12px_36px_rgba(28,29,24,0.06)] backdrop-blur-2xl sm:p-6">
        <div className="mb-4">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#0F5B78]">
            Prelims + Mains
          </p>
          <h2 className="mt-1 font-serif text-xl font-semibold text-[#1C1D18]">Start a focused cycle</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {GOAL_PRESETS.map((preset) => (
            <article key={preset.title} className="flex flex-col rounded-xl border border-white/80 bg-white/55 p-4">
              <h3 className="font-medium text-[#1C1D18]">{preset.title}</h3>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-[#5E6258]">{preset.description}</p>
              <Button
                size="sm"
                data-testid={`goal-preset-${preset.subjectId}`}
                disabled={create.isPending || !subjects.data}
                onClick={() => create.mutate(preset)}
                className="mt-3 bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"
              >
                <Plus className="size-3.5" /> Add {preset.days}-day goal
              </Button>
            </article>
          ))}
        </div>
      </section>

      {goals.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="goals-skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl bg-[#F0EDE5]" />
          ))}
        </div>
      ) : goals.isError ? (
        <EmptyState
          icon={<WifiOff className="size-6" />}
          title="Goals unavailable"
          hint="The backend is unreachable right now — the rest of the app stays up."
          testId="goals-error-state"
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Target className="size-6" />}
          title="No goals yet"
          hint="Set your first milestone — a book revision, a mock schedule, an answer-writing streak."
          testId="goals-empty-state"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((g) => {
            const overdue = g.status === "active" && g.target_date < today;
            const subject = subjects.data?.find((s) => s.id === g.subject_id);
            const timerMinutes = (sessions.data ?? []).filter((session) => session.subject_id === g.subject_id && session.topic === g.title).reduce((total, session) => total + session.duration_minutes, 0);
            return (
              <article
                key={g.id}
                data-testid={`goal-card-${g.id}`}
                className={cn(
                  "flex flex-col rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(28,29,24,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                  overdue ? "border-[#C8640E]/50" : "border-[#E8E3D7]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <Badge
                    className={cn(
                      "border-0 font-mono text-[10px] uppercase tracking-[0.14em]",
                      PRIORITY_STYLES[g.priority] ?? PRIORITY_STYLES.low,
                    )}
                  >
                    {PRIORITY_LABELS[g.priority] ?? g.priority} priority
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    data-testid={`goal-delete-${g.id}`}
                    aria-label={`Delete goal ${g.title}`}
                    onClick={() => del.mutate(g.id)}
                  >
                    <Trash2 className="size-4 text-[#5E6258]" />
                  </Button>
                </div>
                <h3 className="mt-3 font-serif text-xl font-medium tracking-tight text-[#1C1D18]">
                  {g.title}
                </h3>
                {g.description ? (
                  <p className="mt-1 text-sm leading-relaxed text-[#5E6258]">{g.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#5E6258]">
                  <span className={cn("font-mono", overdue && "font-semibold text-[#B91C1C]")}>
                    Target: {fmtDate(g.target_date)}
                    {overdue ? " · overdue" : ""}
                  </span>
                  {subject ? <SubjectChip short={subject.short_name} color={subject.color} /> : null}
                </div>
                {timerMinutes > 0 ? <p className="mt-2 font-mono text-[11px] text-[#0F5B78]">Live timer · {Math.floor(timerMinutes / 60)}h {timerMinutes % 60}m logged on this exact topic</p> : null}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-medium uppercase tracking-[0.14em] text-[#8C6212]">
                      {g.progress}% complete
                    </span>
                    <span className="text-[#5E6258]">
                      {g.status === "done" ? "Completed" : overdue ? "Behind schedule" : "On track"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#F0EDE5]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700",
                        g.status === "done" ? "bg-[#15803D]" : "bg-[#1D3A2C]",
                      )}
                      style={{ width: `${g.progress}%` }}
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    data-testid={`goal-minus-${g.id}`}
                    aria-label="Decrease progress"
                    onClick={() => bump.mutate({ goal: g, delta: -10 })}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    data-testid={`goal-plus-${g.id}`}
                    aria-label="Increase progress"
                    onClick={() => bump.mutate({ goal: g, delta: 10 })}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                  {g.status === "done" ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      data-testid={`goal-reopen-${g.id}`}
                      onClick={() => reopen.mutate(g.id)}
                    >
                      Reopen
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      data-testid={`goal-complete-${g.id}`}
                      onClick={() => complete.mutate(g.id)}
                      className="bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"
                    >
                      <Check className="size-3.5" /> Mark complete
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Set a new goal</DialogTitle>
            <DialogDescription>Milestones keep the long game honest.</DialogDescription>
          </DialogHeader>
          <form
            data-testid="goal-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) create.mutate(undefined);
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="goal-title">Title</Label>
              <Input
                id="goal-title"
                data-testid="goal-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Finish Laxmikanth Polity revision"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="goal-description">Description (optional)</Label>
              <Textarea
                id="goal-description"
                data-testid="goal-description-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="goal-subject">Subject (optional)</Label>
                <Select value={subjectId} onValueChange={(v) => setSubjectId(v)}>
                  <SelectTrigger data-testid="goal-subject-select" className="w-full">
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
              <div className="grid gap-2">
                <Label htmlFor="goal-priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v)}>
                  <SelectTrigger data-testid="goal-priority-select" className="w-full">
                    <SelectValue>{(v) => PRIORITY_LABELS[v as string] ?? "Medium"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="goal-target">Target date</Label>
                <Input
                  id="goal-target"
                  data-testid="goal-target-input"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="goal-progress">Starting progress (%)</Label>
                <Input
                  id="goal-progress"
                  data-testid="goal-progress-input"
                  type="number"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                data-testid="goal-cancel-button"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!title.trim() || create.isPending}
                data-testid="goal-save-button"
                className="bg-[#C8640E] text-white hover:bg-[#A85309]"
              >
                {create.isPending ? "Saving…" : "Create goal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
