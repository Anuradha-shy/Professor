import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, Pause, Play, Square, Timer as TimerIcon } from "lucide-react";
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
import { todayISO } from "@/lib/format";
import { useGoals, useInsights, useProfile, useSubjects } from "@/lib/queries";
import { SUBJECT_AREAS } from "@/lib/subjectAreas";
import { registerNotionTimerStopper } from "@/lib/notionTimerControl";
import type { StudySession } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORE = "professor.timer";
const ALERTS_STORE = "professor.timer-alerts";
const NOTICE_TAG = "professor-study-timer";
const PRELIMS_TARGET = new Date("2027-05-24T09:30:00+05:30").getTime();

interface Persisted {
  startedAt: number | null;
  accumulated: number; // seconds banked before the current run
  studyDate: string;
  examMode: "Prelims" | "Mains";
  focusAreaId: string;
  subjectId: string;
  topic: string;
  notionPageId: string | null;
}

interface StudyTimerProps {
  notionEntry?: { pageId: string; title: string; subjectId?: string };
}

function load(storageKey: string, notionEntry?: StudyTimerProps["notionEntry"]): Persisted {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Persisted>;
      return { ...stored, studyDate: stored.studyDate ?? todayISO(), examMode: stored.examMode ?? "Mains", focusAreaId: stored.focusAreaId ?? "" } as Persisted;
    }
  } catch {
    /* ignore corrupt state */
  }
  return {
    startedAt: notionEntry ? Date.now() : null,
    accumulated: 0,
    studyDate: todayISO(),
    examMode: "Mains",
    focusAreaId: "",
    subjectId: notionEntry?.subjectId ?? "",
    topic: notionEntry?.title ?? "",
    notionPageId: notionEntry?.pageId ?? null,
  };
}

/** Live study timer. Wall-clock based, so backgrounding the tab never loses time. */
export default function StudyTimer({ notionEntry }: StudyTimerProps = {}) {
  const qc = useQueryClient();
  const storageKey = notionEntry ? `${STORE}:notion:${notionEntry.pageId}` : STORE;
  const subjects = useSubjects();
  const profile = useProfile();
  const goals = useGoals();
  const insights = useInsights();
  const [state, setState] = useState<Persisted>(() => load(storageKey, notionEntry));
  const [now, setNow] = useState(() => Date.now());
  const [alertsEnabled, setAlertsEnabled] = useState(
    () => localStorage.getItem(ALERTS_STORE) === "true",
  );
  const tick = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);

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
  const todayMinutes = insights.data?.today_minutes ?? 0;
  const revisionDue = insights.data?.revision_due ?? 0;
  const totalTodayMinutes = todayMinutes + Math.floor(elapsed / 60);
  const dailyTarget = profile.data?.daily_target_minutes ?? 600;
  const dailyProgress = Math.min(100, Math.round((totalTodayMinutes / dailyTarget) * 100));
  const totalWeekMinutes = (insights.data?.this_week_minutes ?? 0) + Math.floor(elapsed / 60);
  const entryPageId = notionEntry?.pageId;
  const entryTitle = notionEntry?.title;

  useEffect(() => {
    if (!entryPageId || !entryTitle || !state.subjectId) return;
    if (state.startedAt !== null && state.notionPageId === entryPageId) return;
    setState((current) => ({
      ...current,
      startedAt: Date.now(),
      topic: entryTitle,
      notionPageId: entryPageId,
    }));
  }, [entryPageId, entryTitle, state.startedAt, state.notionPageId, state.subjectId]);

  useEffect(() => {
    if (!entryPageId) return;
    const stop = () => {
      const current = stateRef.current;
      if (current.notionPageId !== entryPageId) return;
      const totalSeconds = current.accumulated + (current.startedAt ? Math.floor((Date.now() - current.startedAt) / 1000) : 0);
      const stopped = { ...current, startedAt: null, accumulated: totalSeconds };
      stateRef.current = stopped;
      localStorage.setItem(storageKey, JSON.stringify(stopped));
      setState(stopped);
      if (totalSeconds < 60 || !current.subjectId) return;
      void apiPost<StudySession>("/sessions", {
        subject_id: current.subjectId,
        topic: current.topic || entryTitle || "Notion study entry",
        duration_minutes: Math.max(1, Math.floor(totalSeconds / 60)),
        date: current.studyDate,
        notes: `Logged by the entry timer. Notion page: ${entryPageId}`,
      }).then((session) => {
        toast.success(`Saved ${session.duration_minutes}m on ${session.topic}`);
        void qc.invalidateQueries({ queryKey: ["sessions"] });
        void qc.invalidateQueries({ queryKey: ["insights"] });
        void qc.invalidateQueries({ queryKey: ["goals"] });
        void qc.invalidateQueries({ queryKey: ["notion"] });
      }).catch((error: unknown) => toast.error(errDetail(error)));
    };
    return registerNotionTimerStopper(stop);
  }, [entryPageId, entryTitle, qc, storageKey]);

  useEffect(() => {
    if (!entryPageId || state.subjectId || !subjects.data?.length) return;
    setState((current) => ({ ...current, subjectId: subjects.data![0].id }));
  }, [entryPageId, state.subjectId, subjects.data]);

  const save = useMutation({
    mutationFn: () =>
      apiPost<StudySession>("/sessions", {
        subject_id: state.subjectId,
        topic: state.topic.trim() || "Timed study block",
        duration_minutes: Math.max(1, minutes),
        date: state.studyDate,
        notes: state.notionPageId
          ? `Logged by the live timer. Notion page: ${state.notionPageId}`
          : "Logged by the live timer",
      }),
    onSuccess: (s) => {
      toast.success(`Saved ${s.duration_minutes}m on ${s.topic}`);
      setState({ startedAt: null, accumulated: 0, studyDate: todayISO(), examMode: state.examMode, focusAreaId: state.focusAreaId, subjectId: state.subjectId, topic: "", notionPageId: null });
      for (const key of [["sessions"], ["insights"], ["analytics"], ["goals"], ["notion", "status"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const applyNotificationAction = (action: string) => {
    const current = stateRef.current;
    const currentElapsed =
      current.accumulated + (current.startedAt ? Math.floor((Date.now() - current.startedAt) / 1000) : 0);
    if (action === "pause" && current.startedAt !== null) {
      setState({ ...current, startedAt: null, accumulated: currentElapsed });
    } else if (action === "resume" && current.startedAt === null && currentElapsed > 0) {
      setState({ ...current, startedAt: Date.now() });
    } else if (action === "stop") {
      if (currentElapsed < 60) {
        setState({ ...current, startedAt: null, accumulated: currentElapsed });
        toast.error("Study blocks need at least one minute to log.");
      } else {
        save.mutate();
      }
    }
  };

  const actionRef = useRef(applyNotificationAction);
  actionRef.current = applyNotificationAction;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent<{ type?: string; action?: string }>) => {
      if (event.data?.type === "timer-notification-action" && event.data.action) {
        actionRef.current(event.data.action);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    const action = new URLSearchParams(window.location.search).get("timerAction");
    if (action) {
      window.history.replaceState({}, "", window.location.pathname);
      actionRef.current(action);
    }
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const currentElapsed =
      state.accumulated + (state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0);
    const isRunning = state.startedAt !== null;
    const closeNotice = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const notices = await registration.getNotifications({ tag: NOTICE_TAG });
        notices.forEach((notice) => notice.close());
      } catch {
        // Notifications may be unavailable in private browsing or unsupported browsers.
      }
    };

    if (!alertsEnabled || !("Notification" in window) || Notification.permission !== "granted") {
      void closeNotice();
      return;
    }
    if (!isRunning && currentElapsed === 0) {
      void closeNotice();
      return;
    }

    const publishNotice = async () => {
      const tick =
        state.accumulated + (state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0);
      const totalToday = todayMinutes + Math.floor(tick / 60);
      const target = profile.data?.daily_target_minutes ?? 600;
      const progress = Math.min(100, Math.round((totalToday / target) * 100));
      const filled = Math.round(progress / 10);
      const progressBar = `${"🟩".repeat(Math.min(filled, 6))}${"🟨".repeat(Math.max(0, filled - 6))}${"⬜".repeat(10 - filled)}`;
      const daysToPrelims = Math.max(0, Math.ceil((PRELIMS_TARGET - Date.now()) / 86_400_000));
      const title = `UPSC ${daysToPrelims}d · ${isRunning ? "Studying" : "Timer paused"} · ${String(Math.floor(tick / 3600)).padStart(2, "0")}:${String(Math.floor((tick % 3600) / 60)).padStart(2, "0")}:${String(tick % 60).padStart(2, "0")}`;
      const weekHours = Math.floor((insights.data?.this_week_minutes ?? 0) / 60);
      const weekMins = (insights.data?.this_week_minutes ?? 0) % 60;
      const focus = SUBJECT_AREAS.find((area) => area.id === state.focusAreaId)?.name ?? subjects.data?.find((subject) => subject.id === state.subjectId)?.short_name ?? "No subject";
      const body = `${progressBar} Today ${Math.floor(totalToday / 60)}h ${totalToday % 60}m / ${Math.floor(target / 60)}h (${progress}%) · Week ${weekHours}h ${weekMins}m · ${insights.data?.streak_days ?? 0}d streak · ${revisionDue} revisions due · ${focus}${state.topic ? ` / ${state.topic}` : ""}`;
      try {
        const registration = await navigator.serviceWorker.ready;
        const options = {
          body,
          tag: NOTICE_TAG,
          actions: [
            { action: isRunning ? "pause" : "resume", title: isRunning ? "Pause" : "Resume" },
            { action: "stop", title: "Stop & log" },
          ],
        } as NotificationOptions;
        await registration.showNotification(title, options);
      } catch {
        if (Notification.permission === "granted") {
          new Notification(title, { body, tag: NOTICE_TAG });
        }
      }
    };
    void publishNotice();
    const refreshId = window.setInterval(() => void publishNotice(), 15_000);
    return () => window.clearInterval(refreshId);
  }, [alertsEnabled, insights.data?.streak_days, insights.data?.this_week_minutes, profile.data?.daily_target_minutes, revisionDue, state.accumulated, state.examMode, state.focusAreaId, state.startedAt, state.subjectId, state.topic, subjects.data, todayMinutes]);

  const toggleAlerts = async () => {
    if (alertsEnabled) {
      localStorage.removeItem(ALERTS_STORE);
      setAlertsEnabled(false);
      toast.success("Timer notifications turned off");
      return;
    }
    if (!("Notification" in window)) {
      toast.error("This browser does not support study notifications");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      localStorage.setItem(ALERTS_STORE, "true");
      setAlertsEnabled(true);
      toast.success("Timer notifications enabled");
    } else {
      toast.error("Allow notifications in browser settings to enable timer alerts");
    }
  };

  return (
    <section
      data-testid="study-timer"
      className="glass-surface rounded-2xl border border-[#E8E3D7] bg-white/70 p-6 shadow-[0_1px_2px_rgba(28,29,24,0.04)] backdrop-blur-xl"
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
          <Button
            variant="outline"
            data-testid="timer-notification-toggle"
            aria-pressed={alertsEnabled}
            onClick={() => void toggleAlerts()}
            title={alertsEnabled ? "Turn off background timer notifications" : "Enable background timer notifications"}
          >
            {alertsEnabled ? <BellOff className="size-4" /> : <Bell className="size-4" />}
            <span className="hidden sm:inline">{alertsEnabled ? "Alerts on" : "Enable alerts"}</span>
          </Button>
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
                setState({ ...state, studyDate: state.accumulated === 0 ? todayISO() : state.studyDate, startedAt: Date.now() });
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

      <div className="mt-3 space-y-2" data-testid="live-study-scoreboard">
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-[#5E6258]">
          <span data-testid="timer-daily-total">Today {Math.floor(totalTodayMinutes / 60)}h {totalTodayMinutes % 60}m / {Math.floor(dailyTarget / 60)}h</span>
          <span data-testid="timer-week-total">Week {Math.floor(totalWeekMinutes / 60)}h {totalWeekMinutes % 60}m</span>
          <span data-testid="timer-streak">{insights.data?.streak_days ?? 0}-day streak</span>
          <span data-testid="timer-revisions-due">{revisionDue} revisions due</span>
          {notionEntry ? <span className="truncate">Focus: {notionEntry.title}</span> : null}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#E8E3D7]" role="progressbar" aria-label="Daily study target" aria-valuenow={dailyProgress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[#1D7657] transition-[width] duration-500" style={{ width: `${dailyProgress}%` }} />
        </div>
      </div>

      <div className="mt-3 inline-flex rounded-lg border border-[#E8E3D7] bg-white p-1" role="group" aria-label="Syllabus exam mode">
        {(["Prelims", "Mains"] as const).map((mode) => (
          <Button key={mode} type="button" size="sm" variant={state.examMode === mode ? "default" : "ghost"} aria-pressed={state.examMode === mode} onClick={() => setState({ ...state, examMode: mode })} className={state.examMode === mode ? "bg-[#1D3A2C] text-white" : ""}>{mode}</Button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select
          value={state.focusAreaId ? `area:${state.focusAreaId}` : state.subjectId ? `paper:${state.subjectId}` : ""}
          onValueChange={(value) => {
            if (value.startsWith("area:")) {
              const area = SUBJECT_AREAS.find((item) => item.id === value.slice(5));
              if (!area) return;
              setState({ ...state, focusAreaId: area.id, subjectId: area.subjectId, examMode: area.mode === "Both" ? state.examMode : area.mode });
            } else {
              setState({ ...state, focusAreaId: "", subjectId: value.slice(6) });
            }
          }}
        >
          <SelectTrigger data-testid="timer-subject-select" className="w-full"><SelectValue>{() => SUBJECT_AREAS.find((area) => area.id === state.focusAreaId)?.name ?? subjects.data?.find((subject) => subject.id === state.subjectId)?.short_name ?? "Choose subject"}</SelectValue></SelectTrigger>
          <SelectContent>
            {(subjects.data ?? []).map((subject) => <SelectItem key={`paper-${subject.id}`} value={`paper:${subject.id}`}>{subject.short_name} · all areas</SelectItem>)}
            {SUBJECT_AREAS.map((area) => <SelectItem key={area.id} value={`area:${area.id}`}>{area.name} · {subjects.data?.find((subject) => subject.id === area.subjectId)?.short_name ?? area.subjectId}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          data-testid="timer-topic-input"
          list="timer-topic-suggestions"
          value={state.topic}
          onChange={(e) => setState({ ...state, topic: e.target.value })}
          placeholder="What are you studying right now?"
        />
        <datalist id="timer-topic-suggestions">
          {[
            ...(subjects.data?.find((subject) => subject.id === state.subjectId)?.topics ?? []).filter((item) => {
            const mode = item.name.startsWith("Prelims · ") ? "Prelims" : item.name.startsWith("Mains · ") ? "Mains" : null;
            return mode === null || mode === state.examMode;
            }).map((item) => item.name),
            ...(goals.data ?? []).filter((goal) => goal.subject_id === state.subjectId).map((goal) => goal.title),
            ...(state.focusAreaId ? [SUBJECT_AREAS.find((area) => area.id === state.focusAreaId)?.name ?? ""] : []),
          ].filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).map((item) => <option key={item} value={item} />)}
        </datalist>
      </div>
      {minutes < 1 && elapsed > 0 ? (
        <p className="mt-2 text-xs text-[#8B8F83]">Log becomes available after one full minute.</p>
      ) : null}
    </section>
  );
}
