import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2, WifiOff } from "lucide-react";
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
import { EmptyState, PageHeader, SubjectChip } from "@/components/kit";
import { apiDelete, apiPost } from "@/lib/api";
import { dueLabel, errDetail, fmtDate, todayISO } from "@/lib/format";
import { useRevisions, useSubjects } from "@/lib/queries";
import type { Revision } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "due" | "upcoming" | "all";

export default function Revisions() {
  const qc = useQueryClient();
  const revisions = useRevisions();
  const subjects = useSubjects();
  const [tab, setTab] = useState<Tab>("due");
  const [addOpen, setAddOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [source, setSource] = useState("");
  const [dueDate, setDueDate] = useState(todayISO);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["revisions"] });
    qc.invalidateQueries({ queryKey: ["insights"] });
  };

  const review = useMutation({
    mutationFn: ({ id, retention }: { id: string; retention: string }) =>
      apiPost<Revision>(`/revisions/${id}/review`, { retention }),
    onSuccess: (r) => {
      toast.success(`Recalled — “${r.topic}” next due in ${r.interval_days} day${r.interval_days === 1 ? "" : "s"}`);
      invalidate();
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<Revision>("/revisions", {
        topic: topic.trim(),
        subject_id: subjectId,
        source: source.trim(),
        next_due: dueDate,
      }),
    onSuccess: (r) => {
      toast.success(`“${r.topic}” added to the queue`);
      invalidate();
      setAddOpen(false);
      setTopic("");
      setSubjectId("");
      setSource("");
      setDueDate(todayISO());
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/revisions/${id}`),
    onSuccess: () => {
      toast.success("Revision removed");
      invalidate();
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const all = revisions.data ?? [];
  const today = todayISO();
  const due = all.filter((r) => r.next_due <= today);
  const upcoming = all.filter((r) => r.next_due > today);
  const shown = tab === "due" ? due : tab === "upcoming" ? upcoming : all;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "due", label: "Due now", count: due.length },
    { key: "upcoming", label: "Upcoming", count: upcoming.length },
    { key: "all", label: "All", count: all.length },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Spaced repetition"
        title="Revision Queue"
        description="Recall beats re-reading. Review a topic and rate the recall — easy gaps stretch, hard ones reset."
        actions={
          <Button
            data-testid="add-revision-btn"
            onClick={() => setAddOpen(true)}
            className="bg-[#C8640E] text-white hover:bg-[#A85309]"
          >
            <Plus className="size-4" /> Add topic
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="revision-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            data-testid={`revision-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-[#1D3A2C] bg-[#1D3A2C] text-[#F5F8F6]"
                : "border-[#E8E3D7] text-[#5E6258] hover:border-[#1D3A2C]",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 font-mono text-[11px]",
                tab === t.key ? "bg-[#2F5E48]" : "bg-[#F0EDE5]",
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {revisions.isPending ? (
        <div className="space-y-3" data-testid="revisions-skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[#F0EDE5]" />
          ))}
        </div>
      ) : revisions.isError ? (
        <EmptyState
          icon={<WifiOff className="size-6" />}
          title="Queue unavailable"
          hint="The backend is unreachable right now — the rest of the app stays up."
          testId="revisions-error-state"
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<RotateCcw className="size-6" />}
          title={tab === "due" ? "Nothing due — the queue is clear" : "No revisions here yet"}
          hint="Add topics from Laxmikanth, Spectrum or your class notes to build the habit."
          testId="revisions-empty-state"
        />
      ) : (
        <ul className="space-y-3" data-testid="revisions-list">
          {shown.map((r) => {
            const isDue = r.next_due <= today;
            const subject = subjects.data?.find((s) => s.id === r.subject_id);
            return (
              <li
                key={r.id}
                data-testid={`revision-item-${r.id}`}
                className={cn(
                  "rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(28,29,24,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                  isDue ? "border-[#C8640E]/50" : "border-[#E8E3D7]",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-serif text-lg font-medium tracking-tight text-[#1C1D18]">
                      {r.topic}
                    </p>
                    <p className="mt-0.5 text-xs text-[#5E6258]">
                      {r.source ? `${r.source} · ` : ""}
                      last revised {r.last_revised ? fmtDate(r.last_revised) : "never"} ·{" "}
                      {r.review_count} review{r.review_count === 1 ? "" : "s"} · interval {r.interval_days}d
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SubjectChip short={r.subject_name || subject?.short_name || "—"} color={subject?.color ?? "#1D3A2C"} />
                    <Badge
                      className={
                        isDue
                          ? "border-0 bg-[#FEF3E2] text-[#8A3D04]"
                          : "border-0 bg-[#EDF5F0] text-[#1D4532]"
                      }
                    >
                      {dueLabel(r.next_due)} · {fmtDate(r.next_due)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      data-testid={`revision-delete-${r.id}`}
                      aria-label={`Delete revision ${r.topic}`}
                      onClick={() => del.mutate(r.id)}
                    >
                      <Trash2 className="size-4 text-[#5E6258]" />
                    </Button>
                  </div>
                </div>
                {isDue ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2" data-testid={`revision-actions-${r.id}`}>
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">
                      How was the recall?
                    </span>
                    <Button
                      size="xs"
                      data-testid={`revision-easy-${r.id}`}
                      onClick={() => review.mutate({ id: r.id, retention: "easy" })}
                      className="bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"
                    >
                      Easy
                    </Button>
                    <Button
                      size="xs"
                      data-testid={`revision-good-${r.id}`}
                      onClick={() => review.mutate({ id: r.id, retention: "good" })}
                      className="bg-[#C8640E] text-white hover:bg-[#A85309]"
                    >
                      Good
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      data-testid={`revision-hard-${r.id}`}
                      onClick={() => review.mutate({ id: r.id, retention: "hard" })}
                    >
                      Hard
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Add a revision topic</DialogTitle>
            <DialogDescription>It joins today's queue and spacing begins.</DialogDescription>
          </DialogHeader>
          <form
            data-testid="revision-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (topic.trim() && subjectId) create.mutate();
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="revision-topic">Topic</Label>
              <Input
                id="revision-topic"
                data-testid="revision-topic-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Directive Principles"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="revision-subject">Subject</Label>
              <Select value={subjectId} onValueChange={(v) => setSubjectId(v)}>
                <SelectTrigger data-testid="revision-subject-select" className="w-full">
                  <SelectValue>
                    {(v) =>
                      subjects.data?.find((s) => s.id === (v as string))?.short_name ?? "Choose subject"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(subjects.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="revision-source">Source (optional)</Label>
                <Input
                  id="revision-source"
                  data-testid="revision-source-input"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Laxmikanth, Spectrum…"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="revision-due">First due date</Label>
                <Input
                  id="revision-due"
                  data-testid="revision-due-input"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                data-testid="revision-cancel-button"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!topic.trim() || !subjectId || create.isPending}
                data-testid="revision-save-button"
                className="bg-[#C8640E] text-white hover:bg-[#A85309]"
              >
                {create.isPending ? "Adding…" : "Add to queue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
