import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pause, Play, Square, Timer as TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api";
import { errDetail } from "@/lib/format";
import { useSubjects } from "@/lib/queries";
import type { StudySession } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORE = "professor.timer";

interface Persisted {
  startedAt: number | null;
  accumulated: number; // seconds banked before the current run
  subjectId: string;
  topic: string;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch {
    /* ignore corrupt state */
  }
  return { startedAt: null, accumulated: 0, subjectId: "", topic: "" };
}

/** Live study timer. Wall-clock based, so backgrounding the tab never loses time. */
export default function StudyTimer() {
  const qc = useQueryClient();
  const subjects = useSubjects();
  const [state, setState] = useState<Persisted>(load);
  const [now, setNow] = useState(() => Date.now());
  const tick = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (state.startedAt === null) {
      if (tick.current) window.clearInterval(tick.current);
      return;
    }
    tick.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
  }, [state.startedAt]);

  const elapsed =
    state.accumulated + (state.startedAt ? Math.floor((now - state.startedAt) / 1000) : 0);
  const minutes = Math.floor(elapsed / 60);
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const running = state.startedAt !== null;

  const save = useMutation({
    mutationFn: () =>
      apiPost<StudySession>("/sessions", {
        subject_id: state.subjectId,
        topic: state.topic.trim() || "Timed study block",
        duration_minutes: Math.max(1, minutes),
        notes: "Logged by the live timer",
      }),
    onSuccess: (s) => {
      toast.success(`Saved ${s.duration_minutes}m on ${s.topic}`);
      setState({ startedAt: null, accumulated: 0, subjectId: state.subjectId, topic: "" });
      for (const key of [["sessions"], ["insights"], ["analytics"], ["notion", "status"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  return (
    <section
      data-testid="study-timer"
      className="rounded-2xl border border-[#E8E3D7] bg-white/70 p-6 shadow-[0_1px_2px_rgba(28,29,24,0.04)] backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "grid size-11 place-items-center rounded-xl border transition-colors",
              running
                ? "border-[#C8640E] bg-[#FEF3E2] text-[#8A3D04]"
                : "border-[#E8E3D7] bg-[#F6F2E9] text-[#5E6258]",
            )}
          >
            <TimerIcon className={cn("size-5", running && "animate-pulse")} />
          </span>
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#8C6212]">
              Live study timer
            </p>
            <p
              data-testid="timer-display"
              className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-[#1C1D18]"
            >
              {hh}:{mm}:{ss}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button
              variant="outline"
              data-testid="timer-pause-btn"
              onClick={() =>
                setState({ ...state, startedAt: null, accumulated: elapsed })
              }
            >
              <Pause className="size-4" /> Pause
            </Button>
          ) : (
            <Button
              data-testid="timer-start-btn"
              disabled={!state.subjectId}
              onClick={() => {
                setNow(Date.now());
                setState({ ...state, startedAt: Date.now() });
              }}
              className="bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"
            >
              <Play className="size-4" /> {elapsed > 0 ? "Resume" : "Start"}
            </Button>
          )}
          <Button
            data-testid="timer-save-btn"
            disabled={minutes < 1 || !state.subjectId || save.isPending}
            onClick={() => save.mutate()}
            className="bg-[#C8640E] text-white hover:bg-[#A85309]"
          >
            <Square className="size-4" /> {save.isPending ? "Saving…" : "Stop & log"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select value={state.subjectId} onValueChange={(v) => setState({ ...state, subjectId: v })}>
          <SelectTrigger data-testid="timer-subject-select" className="w-full">
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
        <Input
          data-testid="timer-topic-input"
          value={state.topic}
          onChange={(e) => setState({ ...state, topic: e.target.value })}
          placeholder="What are you studying right now?"
        />
      </div>
      {minutes < 1 && elapsed > 0 ? (
        <p className="mt-2 text-xs text-[#8B8F83]">Log becomes available after one full minute.</p>
      ) : null}
    </section>
  );
}
