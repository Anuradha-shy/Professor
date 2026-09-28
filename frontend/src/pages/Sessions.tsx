import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SessionDialog from "@/components/SessionDialog";
import { EmptyState, PageHeader, StatCard, SubjectChip } from "@/components/kit";
import { apiDelete } from "@/lib/api";
import { fmtDate, fmtMinutes } from "@/lib/format";
import { useSessions, useSubjects } from "@/lib/queries";
import { cn } from "@/lib/utils";

export default function Sessions() {
  const qc = useQueryClient();
  const sessions = useSessions();
  const subjects = useSubjects();
  const [filter, setFilter] = useState("all");
  const [logOpen, setLogOpen] = useState(false);

  const del = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/sessions/${id}`),
    onSuccess: () => {
      toast.success("Session removed");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["notion", "status"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Delete failed"),
  });

  const filtered = useMemo(() => {
    const all = sessions.data ?? [];
    return filter === "all" ? all : all.filter((s) => s.subject_id === filter);
  }, [sessions.data, filter]);

  const totalMinutes = filtered.reduce((a, s) => a + s.duration_minutes, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Logbook"
        title="Study Log"
        description="Every session you log — filter by subject, keep notes, watch the streak compound."
        actions={
          <Button
            data-testid="log-session-btn"
            onClick={() => setLogOpen(true)}
            className="bg-[#C8640E] text-white hover:bg-[#A85309]"
          >
            <Plus className="size-4" /> Log session
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Sessions shown"
          value={filtered.length}
          sub={sessions.isError ? "backend unreachable" : "in current filter"}
          testId="sessions-count-stat"
        />
        <StatCard label="Time logged" value={fmtMinutes(totalMinutes)} sub="across shown sessions" testId="sessions-time-stat" />
        <StatCard
          label="Average session"
          value={filtered.length ? fmtMinutes(Math.round(totalMinutes / filtered.length)) : "—"}
          sub="deep-work length"
          testId="sessions-avg-stat"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="session-filters">
        <button
          type="button"
          data-testid="session-filter-all"
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-full border px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-[0.12em] transition-colors",
            filter === "all"
              ? "border-[#1D3A2C] bg-[#1D3A2C] text-[#F5F8F6]"
              : "border-[#E8E3D7] text-[#5E6258] hover:border-[#1D3A2C]",
          )}
        >
          All
        </button>
        {(subjects.data ?? []).map((s) => (
          <button
            key={s.id}
            type="button"
            data-testid={`session-filter-${s.id}`}
            onClick={() => setFilter(s.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-[0.12em] transition-colors",
              filter === s.id
                ? "border-[#1D3A2C] bg-[#1D3A2C] text-[#F5F8F6]"
                : "border-[#E8E3D7] text-[#5E6258] hover:border-[#1D3A2C]",
            )}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.short_name}
          </button>
        ))}
      </div>

      {sessions.isPending ? (
        <div className="space-y-2" data-testid="sessions-skeleton">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[#F0EDE5]" />
          ))}
        </div>
      ) : sessions.isError ? (
        <EmptyState
          icon={<Clock className="size-6" />}
          title="Log unavailable"
          hint="The backend is unreachable right now — your data is safe."
          testId="sessions-error-state"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Clock className="size-6" />}
          title="No sessions in this view"
          hint="Log your first study session to start the logbook."
          testId="sessions-empty-state"
        />
      ) : (
        <div className="rounded-2xl border border-[#E8E3D7] bg-white shadow-[0_1px_2px_rgba(28,29,24,0.04)]">
          <Table data-testid="sessions-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-28 font-mono text-[11px] uppercase tracking-[0.14em]">Date</TableHead>
                <TableHead className="w-28 font-mono text-[11px] uppercase tracking-[0.14em]">Subject</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-[0.14em]">Topic & notes</TableHead>
                <TableHead className="w-24 text-right font-mono text-[11px] uppercase tracking-[0.14em]">Duration</TableHead>
                <TableHead className="w-14" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 60).map((s) => (
                <TableRow key={s.id} data-testid={`session-row-${s.id}`}>
                  <TableCell className="text-sm text-[#5E6258]">{fmtDate(s.date)}</TableCell>
                  <TableCell>
                    <SubjectChip short={s.subject_name} color={subjects.data?.find((x) => x.id === s.subject_id)?.color ?? "#1D3A2C"} />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-[#1C1D18]">{s.topic}</p>
                    {s.notes ? <p className="text-xs text-[#5E6258]">{s.notes}</p> : null}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold text-[#1C1D18]">
                    {s.duration_minutes}m
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      data-testid={`session-delete-${s.id}`}
                      aria-label={`Delete session on ${s.date}`}
                      onClick={() => del.mutate(s.id)}
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

      <SessionDialog open={logOpen} onOpenChange={setLogOpen} />
    </div>
  );
}
