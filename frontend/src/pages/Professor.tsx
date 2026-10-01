import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, CheckCircle2, ScanLine, Send, Sparkles, Trash2, Upload, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CardShell, PageHeader } from "@/components/kit";
import { apiDelete, apiPost } from "@/lib/api";
import { errDetail, fmtDate } from "@/lib/format";
import { useAiHistory, useAiSessions, useOmrRuns } from "@/lib/queries";
import type { AiChatOut, OmrResultOut } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROMPTS = [
  "What should I revise today and why?",
  "Am I on pace for Prelims 2027? Be blunt.",
  "Build me a 7-day plan for my weakest subject",
  "Log 90 minutes of GS-III Economy for me",
];
const LETTERS = ["a", "b", "c", "d"];

export default function Professor() {
  const qc = useQueryClient();
  const sessions = useAiSessions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const history = useAiHistory(sessionId);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  const omrRuns = useOmrRuns();
  const [omrFile, setOmrFile] = useState<File | null>(null);
  const [omrKey, setOmrKey] = useState("");
  const [omrLabel, setOmrLabel] = useState("OMR evaluation");
  const [omrResult, setOmrResult] = useState<OmrResultOut | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [history.data, pending]);

  const send = useMutation({
    mutationFn: (message: string) =>
      apiPost<AiChatOut>("/ai/chat", { message, session_id: sessionId }),
    onSuccess: (res) => {
      setSessionId(res.session_id);
      setPending(null);
      if (res.actions.length) toast.success(`Professor ran: ${res.actions.join(", ")}`);
      qc.invalidateQueries({ queryKey: ["ai"] });
      // admin tools may have mutated app data
      for (const k of [["sessions"], ["insights"], ["revisions"], ["goals"], ["subjects"], ["profile"], ["analytics"]]) {
        qc.invalidateQueries({ queryKey: k });
      }
    },
    onError: (error) => {
      setPending(null);
      toast.error(errDetail(error));
    },
  });

  const clear = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/ai/sessions/${id}`),
    onSuccess: () => {
      setSessionId(null);
      qc.invalidateQueries({ queryKey: ["ai"] });
      toast.success("Conversation cleared");
    },
  });

  const omr = useMutation({
    mutationFn: async () => {
      if (!omrFile) throw new Error("Choose an OMR image first");
      const body = new FormData();
      body.append("file", omrFile);
      body.append("answer_key", omrKey);
      body.append("label", omrLabel || "OMR evaluation");
      const res = await fetch("/api/ai/omr", { method: "POST", body });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `Upload failed (${res.status})`);
      }
      return (await res.json()) as OmrResultOut;
    },
    onSuccess: (res) => {
      setOmrResult(res);
      setOmrLabel(res.label);
      toast.success(
        res.evaluated
          ? `Provisional AI read: ${res.correct} correct, ${res.wrong} wrong (${res.accuracy}%). Review before saving.`
          : `Read ${res.detected_count} marked answers`,
      );
      qc.invalidateQueries({ queryKey: ["ai", "omr", "runs"] });
      qc.invalidateQueries({ queryKey: ["tests"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const reviewOmr = useMutation({
    mutationFn: async () => {
      if (!omrResult) throw new Error("Scan an OMR sheet first");
      const response = await fetch(`/api/ai/omr/runs/${omrResult.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: omrResult.detected, answer_key: omrKey }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail ?? `Review save failed (${response.status})`);
      return result as OmrResultOut;
    },
    onSuccess: (result) => {
      setOmrResult(result);
      toast.success(result.evaluated ? `Reviewed score saved · ${result.score}/${result.max_score}` : "Reviewed answers saved. Add an answer key to score.");
      for (const key of [["ai", "omr", "runs"], ["tests"], ["insights"], ["analytics"], ["ai"]]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const selectOmrRun = (run: OmrResultOut) => {
    setOmrResult(run);
    setOmrLabel(run.label);
    setOmrKey(Object.entries(run.answer_key ?? {}).map(([number, answer]) => `${number}:${answer.toUpperCase()}`).join(", "));
  };

  const submit = (text: string) => {
    const message = text.trim();
    if (!message || send.isPending) return;
    setPending(message);
    setDraft("");
    send.mutate(message);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Mistral Small · full admin powers"
        title="Professor AI"
        description="Your private coach. It reads your live tracker data, answers precisely, and can actually change the app — log sessions, queue revisions, set goals, tick syllabus topics."
        actions={
          sessionId ? (
            <Button
              variant="outline"
              data-testid="ai-clear-btn"
              onClick={() => clear.mutate(sessionId)}
            >
              <Trash2 className="size-4" /> Clear chat
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-8">
          <div className="flex h-[32rem] flex-col rounded-2xl border border-[#E8E3D7] bg-white/70 backdrop-blur-xl">
            <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-6" data-testid="ai-transcript">
              {(history.data ?? []).length === 0 && !pending ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <Sparkles className="size-8 text-[#C8640E]" />
                  <p className="font-serif text-xl text-[#1C1D18]">Ask Professor anything</p>
                  <p className="max-w-sm text-sm text-[#5E6258]">
                    It knows your streak, syllabus, mocks and revision queue — and your exam is
                    24 May 2027.
                  </p>
                </div>
              ) : null}
              {(history.data ?? []).map((m) => (
                <div
                  key={m.id}
                  data-testid={`ai-msg-${m.role}`}
                  className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg",
                      m.role === "user" ? "bg-[#F6F2E9] text-[#5E6258]" : "bg-[#1D3A2C] text-white",
                    )}
                  >
                    {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                  </span>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-[#FEF3E2] text-[#1C1D18]"
                        : "border border-[#E8E3D7] bg-white text-[#383A34]",
                    )}
                  >
                    {m.content}
                    {m.actions.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.actions.map((a) => (
                          <Badge key={a} className="border-0 bg-[#EDF5F0] font-mono text-[10px] text-[#1D4532]">
                            {a}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {pending ? (
                <>
                  <div className="flex flex-row-reverse gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#F6F2E9] text-[#5E6258]">
                      <User className="size-4" />
                    </span>
                    <div className="max-w-[80%] rounded-2xl bg-[#FEF3E2] px-4 py-2.5 text-sm text-[#1C1D18]">
                      {pending}
                    </div>
                  </div>
                  <div className="flex gap-3" data-testid="ai-thinking">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#1D3A2C] text-white">
                      <Bot className="size-4 animate-pulse" />
                    </span>
                    <div className="rounded-2xl border border-[#E8E3D7] bg-white px-4 py-2.5 text-sm text-[#5E6258]">
                      Thinking…
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <form
              data-testid="ai-form"
              onSubmit={(e) => {
                e.preventDefault();
                submit(draft);
              }}
              className="flex items-end gap-2 border-t border-[#E8E3D7] p-4"
            >
              <Textarea
                data-testid="ai-input"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(draft);
                  }
                }}
                placeholder="Ask about your plan, or tell Professor to change something…"
                className="min-h-0 resize-none"
              />
              <Button
                type="submit"
                data-testid="ai-send-btn"
                disabled={!draft.trim() || send.isPending}
                className="bg-[#C8640E] text-white hover:bg-[#A85309]"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`ai-prompt-${p.slice(0, 12).replace(/\s+/g, "-").toLowerCase()}`}
                onClick={() => submit(p)}
                disabled={send.isPending}
                className="rounded-full border border-[#E8E3D7] bg-white px-3.5 py-1.5 text-xs text-[#5E6258] transition-colors hover:border-[#C8640E] hover:text-[#1C1D18]"
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        <div className="space-y-6 lg:col-span-4">
          <CardShell title="OMR AI evaluation" overline="Photo → score" testId="omr-card">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="omr-file">OMR sheet photo</Label>
                <Input
                  id="omr-file"
                  data-testid="omr-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setOmrFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="omr-label">Label</Label>
                <Input
                  id="omr-label"
                  data-testid="omr-label-input"
                  value={omrLabel}
                  onChange={(e) => setOmrLabel(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="omr-key">Answer key (optional)</Label>
                <Textarea
                  id="omr-key"
                  data-testid="omr-key-input"
                  rows={2}
                  value={omrKey}
                  onChange={(e) => setOmrKey(e.target.value)}
                  placeholder="1:a, 2:c, 3:b …"
                />
              </div>
              <Button
                data-testid="omr-evaluate-btn"
                disabled={!omrFile || omr.isPending}
                onClick={() => omr.mutate()}
                className="bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"
              >
                {omr.isPending ? (
                  <>
                    <ScanLine className="size-4 animate-pulse" /> Reading sheet…
                  </>
                ) : (
                  <>
                    <Upload className="size-4" /> Evaluate with AI
                  </>
                )}
              </Button>
              {omrResult ? (
                <div data-testid="omr-result" className="grid gap-3 rounded-xl bg-[#FEF3E2] p-3 text-xs text-[#8A3D04]">
                  <div>
                    <p className="font-mono font-semibold">{omrResult.detected_count} answers read{omrResult.evaluated ? ` · ${omrResult.correct}✓ ${omrResult.wrong}✗ · ${omrResult.accuracy}%${omrResult.reviewed ? " · reviewed" : " · provisional"}` : " · add a key to score"}</p>
                    {omrResult.notes ? <p className="mt-1">{omrResult.notes}</p> : null}
                  </div>
                  <p className="font-medium">Review detected answers (blank means unanswered)</p>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5" data-testid="omr-answer-review">
                    {Array.from({ length: 100 }, (_, index) => index + 1).map((question) => {
                      const number = String(question);
                      return (
                        <label key={question} className="flex min-w-0 items-center gap-1 rounded border border-[#E8D9BE] bg-white px-1.5 py-1">
                          <span className="font-mono text-[10px]">{number.padStart(2, "0")}</span>
                          <select
                            aria-label={`Answer for question ${question}`}
                            data-testid={`omr-answer-${question}`}
                            value={omrResult.detected[number] ?? ""}
                            onChange={(event) => setOmrResult((current) => current ? {
                              ...current,
                              detected: { ...current.detected, [number]: event.target.value },
                            } : current)}
                            className="min-w-0 flex-1 bg-transparent text-xs text-[#1C1D18]"
                          >
                            <option value="">–</option>
                            {LETTERS.map((answer) => <option key={answer} value={answer}>{answer.toUpperCase()}</option>)}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                  <Button size="sm" disabled={reviewOmr.isPending} onClick={() => reviewOmr.mutate()} className="bg-[#1D3A2C] text-white hover:bg-[#2F5E48]">
                    <CheckCircle2 className="size-4" /> {reviewOmr.isPending ? "Saving review…" : omrKey.trim() ? "Save reviewed answers & score" : "Save reviewed answers"}
                  </Button>
                </div>
              ) : null}
              {(omrRuns.data ?? []).length > 0 ? (
                <ul className="space-y-1.5 text-xs" data-testid="omr-runs">
                  {(omrRuns.data ?? []).slice(0, 4).map((r, i) => (
                    <li key={r.id || `${r.label}-${i}`}>
                      <button type="button" onClick={() => selectOmrRun(r)} className="flex w-full justify-between gap-2 rounded-lg border border-[#F0EDE5] px-3 py-2 text-left hover:bg-[#FBF9F4]">
                        <span className="truncate text-[#383A34]">{r.label}</span>
                        <span className="shrink-0 font-mono text-[#5E6258]">{r.evaluated ? `${r.accuracy}%` : `${r.detected_count} read`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </CardShell>

          <CardShell title="Conversations" overline="Memory" testId="ai-sessions-card">
            <ul className="space-y-1.5" data-testid="ai-sessions">
              {(sessions.data ?? []).length === 0 ? (
                <li className="rounded-lg border border-dashed border-[#E8E3D7] px-3 py-3 text-center text-xs text-[#8B8F83]">
                  No saved conversations yet.
                </li>
              ) : (
                (sessions.data ?? []).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      data-testid={`ai-session-${s.id}`}
                      onClick={() => setSessionId(s.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                        sessionId === s.id
                          ? "border-[#C8640E] bg-[#FEF3E2] text-[#8A3D04]"
                          : "border-[#F0EDE5] text-[#383A34] hover:bg-[#FBF9F4]",
                      )}
                    >
                      <span className="line-clamp-2 font-medium">{s.title || "Conversation"}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-[#8B8F83]">
                        {fmtDate(s.updated_at.slice(0, 10))} · {s.provider}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </CardShell>
        </div>
      </div>
    </div>
  );
}
