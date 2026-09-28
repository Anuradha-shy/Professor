import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, ChevronDown, Plus, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import ProgressRing from "@/components/ProgressRing";
import { EmptyState, PageHeader, SubjectChip } from "@/components/kit";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { errDetail } from "@/lib/format";
import { useSubjects } from "@/lib/queries";
import type { Subject } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Subjects() {
  const qc = useQueryClient();
  const subjects = useSubjects();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newTopic, setNewTopic] = useState<Record<string, string>>({});

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["subjects"] });
    qc.invalidateQueries({ queryKey: ["insights"] });
  };

  const toggleTopic = useMutation({
    mutationFn: ({ sid, tid, done }: { sid: string; tid: string; done: boolean }) =>
      apiPatch(`/subjects/${sid}/topics/${tid}`, { done }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(errDetail(error)),
  });

  const addTopic = useMutation({
    mutationFn: ({ sid, name }: { sid: string; name: string }) =>
      apiPost(`/subjects/${sid}/topics`, { name }),
    onSuccess: () => {
      toast.success("Topic added to the syllabus");
      invalidate();
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const delTopic = useMutation({
    mutationFn: ({ sid, tid }: { sid: string; tid: string }) =>
      apiDelete(`/subjects/${sid}/topics/${tid}`),
    onSuccess: () => {
      toast.success("Topic removed");
      invalidate();
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const list = subjects.data ?? [];
  const totalTopics = list.reduce((a, s) => a + s.total_topics, 0);
  const doneTopics = list.reduce((a, s) => a + s.completed_topics, 0);
  const overall = totalTopics ? Math.round((doneTopics / totalTopics) * 1000) / 10 : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Syllabus matrix"
        title="Subject Mastery"
        description="Every GS paper, your optional and CSAT — tick topics off as you finish them and watch mastery build."
      />

      <section
        data-testid="overall-progress-card"
        className="flex flex-wrap items-center gap-6 rounded-2xl border border-[#E8E3D7] bg-white p-6 shadow-[0_1px_2px_rgba(28,29,24,0.04)]"
      >
        <ProgressRing value={overall} size={88} testId="overall-progress-ring" />
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#8C6212]">
            Whole syllabus
          </p>
          <p className="mt-1 font-serif text-2xl font-semibold text-[#1C1D18]">
            {doneTopics} of {totalTopics} topics complete
          </p>
          <div className="mt-3 h-2.5 w-64 max-w-full overflow-hidden rounded-full bg-[#F0EDE5]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#1D3A2C] to-[#C8640E] transition-all duration-700"
              style={{ width: `${overall}%` }}
            />
          </div>
        </div>
      </section>

      {subjects.isPending ? (
        <div className="grid gap-4 md:grid-cols-2" data-testid="subjects-skeleton">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-[#F0EDE5]" />
          ))}
        </div>
      ) : subjects.isError ? (
        <EmptyState
          icon={<WifiOff className="size-6" />}
          title="Syllabus unavailable"
          hint="The backend is unreachable right now — the rest of the app stays up."
          testId="subjects-error-state"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((s: Subject) => {
            const isOpen = expanded[s.id] ?? false;
            return (
              <article
                key={s.id}
                data-testid={`subject-card-${s.id}`}
                className="self-start rounded-2xl border border-[#E8E3D7] bg-white shadow-[0_1px_2px_rgba(28,29,24,0.04)] transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-center gap-4 p-5">
                  <ProgressRing value={s.progress_pct} size={64} stroke={6} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <SubjectChip short={s.short_name} color={s.color} />
                      <span className="font-mono text-xs text-[#5E6258]">
                        {s.completed_topics}/{s.total_topics}
                      </span>
                    </div>
                    <h2 className="mt-1.5 truncate font-serif text-lg font-medium tracking-tight text-[#1C1D18]">
                      {s.name}
                    </h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    data-testid={`subject-expand-${s.id}`}
                    aria-label={isOpen ? "Collapse topics" : "Expand topics"}
                    onClick={() => setExpanded({ ...expanded, [s.id]: !isOpen })}
                  >
                    <ChevronDown
                      className={cn("size-4 text-[#5E6258] transition-transform", isOpen && "rotate-180")}
                    />
                  </Button>
                </div>

                {isOpen ? (
                  <div className="border-t border-[#F0EDE5] px-5 pb-5 pt-4">
                    <ul className="space-y-1" data-testid={`topic-list-${s.id}`}>
                      {s.topics.map((t) => (
                        <li
                          key={t.id}
                          data-testid={`topic-row-${t.id}`}
                          className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#FBF9F4]"
                        >
                          <Checkbox
                            checked={t.done}
                            data-testid={`topic-check-${t.id}`}
                            aria-label={t.done ? `Mark ${t.name} pending` : `Mark ${t.name} complete`}
                            onCheckedChange={(c) =>
                              toggleTopic.mutate({ sid: s.id, tid: t.id, done: Boolean(c) })
                            }
                          />
                          <span
                            className={cn(
                              "flex-1 text-sm",
                              t.done ? "text-[#8B8F83] line-through" : "text-[#383A34]",
                            )}
                          >
                            {t.name}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            data-testid={`topic-delete-${t.id}`}
                            aria-label={`Delete topic ${t.name}`}
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => delTopic.mutate({ sid: s.id, tid: t.id })}
                          >
                            <Trash2 className="size-3.5 text-[#5E6258]" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <form
                      data-testid={`topic-add-form-${s.id}`}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = (newTopic[s.id] ?? "").trim();
                        if (name) {
                          addTopic.mutate({ sid: s.id, name });
                          setNewTopic({ ...newTopic, [s.id]: "" });
                        }
                      }}
                      className="mt-3 flex gap-2"
                    >
                      <Input
                        data-testid={`topic-add-input-${s.id}`}
                        value={newTopic[s.id] ?? ""}
                        onChange={(e) => setNewTopic({ ...newTopic, [s.id]: e.target.value })}
                        placeholder="Add a syllabus topic…"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        data-testid={`topic-add-button-${s.id}`}
                        variant="outline"
                        disabled={addTopic.isPending}
                      >
                        <Plus className="size-4" /> Add
                      </Button>
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
