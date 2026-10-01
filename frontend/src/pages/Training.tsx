import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { BookOpenCheck, Check, FileText, KeyRound, LockKeyhole, Printer, ScanLine, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, StatCard } from "@/components/kit";
import { apiGet } from "@/lib/api";
import { errDetail, fmtDate } from "@/lib/format";
import type { MockAttempt, MockEvaluation, MockStoredFile, ScheduledMock } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AttemptResponse {
  attempt: MockAttempt;
  schedule: { access_at: string; start_at: string; end_at: string; subject: string; scope: string };
  files: MockStoredFile[];
  editable: boolean;
}

const LETTERS = ["a", "b", "c", "d"];

function PrintableOmr() {
  return (
    <main className="mx-auto max-w-4xl p-6 text-black print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="font-serif text-2xl">UPSC Prelims · 100-question response sheet</h1>
        <Button onClick={() => window.print()}><Printer className="size-4" /> Print OMR</Button>
      </div>
      <header className="mb-4 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-bold">PRECISION UPSC PRELIMS GS-I · OMR RESPONSE SHEET</h1>
        <p className="mt-1 text-sm">Candidate: ____________________  Test code: __________  Date: __________</p>
        <p className="mt-1 text-xs">Fill one circle fully for each answer. Use this sheet for offline practice; verify marks manually after scanning.</p>
      </header>
      <div className="grid grid-cols-2 gap-x-8">
        {[0, 1].map((column) => (
          <table key={column} className="w-full border-collapse text-sm">
            <thead><tr className="border-b border-black"><th className="w-12 py-1 text-left">Q</th>{LETTERS.map((letter) => <th key={letter} className="py-1 text-center uppercase">{letter}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: 50 }, (_, index) => column * 50 + index + 1).map((question) => (
                <tr key={question} className="h-5 border-b border-gray-300 print:h-3">
                  <td className="font-mono">{String(question).padStart(2, "0")}</td>
                  {LETTERS.map((letter) => <td key={letter} className="text-center"><span className="inline-block size-3 rounded-full border border-black align-middle print:size-2.5" /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <style>{"@media print { @page { size: A4 portrait; margin: 10mm; } body { background: white !important; } }"}</style>
    </main>
  );
}

export function TrainingOmrSheet() {
  return <PrintableOmr />;
}

export default function Training() {
  const qc = useQueryClient();
  const schedule = useQuery({
    queryKey: ["training", "schedule"],
    queryFn: () => apiGet<ScheduledMock[]>("/training/schedule"),
    refetchInterval: 15_000,
  });
  const attempts = useQuery({ queryKey: ["training", "attempts"], queryFn: () => apiGet<MockAttempt[]>("/training/attempts") });
  const [selectedTest, setSelectedTest] = useState<ScheduledMock | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [officialKeyText, setOfficialKeyText] = useState("");
  const [round1Count, setRound1Count] = useState(0);
  const [round1Minutes, setRound1Minutes] = useState(0);
  const [round2Count, setRound2Count] = useState(0);
  const [round2Minutes, setRound2Minutes] = useState(0);
  const [tagText, setTagText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [evaluation, setEvaluation] = useState<MockEvaluation | null>(null);
  const [busyScan, setBusyScan] = useState<"omr" | "key" | "paper" | null>(null);
  const [busyUpload, setBusyUpload] = useState<string | null>(null);
  const hydratedAttempt = useRef<string | null>(null);
  const dirty = useRef(false);

  const attemptQuery = useQuery({
    queryKey: ["training", "attempt", attemptId],
    queryFn: () => apiGet<AttemptResponse>(`/training/attempts/${attemptId}`),
    enabled: Boolean(attemptId),
    refetchInterval: 15_000,
  });
  const attempt = attemptQuery.data?.attempt;
  const files = attemptQuery.data?.files ?? [];
  const testSchedule = attemptQuery.data?.schedule;
  const isEditable = Boolean(testSchedule && now >= Date.parse(testSchedule.start_at) && now < Date.parse(testSchedule.end_at) && !attempt?.submitted_at);
  const canTranscribe = Boolean(attempt?.submitted_at && !attempt.evaluation);
  const canSaveAnswers = isEditable || canTranscribe;
  const untilStart = testSchedule ? Math.max(0, Math.ceil((Date.parse(testSchedule.start_at) - now) / 1000)) : 0;
  const untilStartLabel = `${String(Math.floor(untilStart / 60)).padStart(2, "0")}:${String(untilStart % 60).padStart(2, "0")}`;
  const remainingSeconds = testSchedule ? Math.max(0, Math.ceil((Date.parse(testSchedule.end_at) - now) / 1000)) : 0;
  const hours = String(Math.floor(remainingSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(remainingSeconds % 60).padStart(2, "0");

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!attempt || hydratedAttempt.current === attempt.id) return;
    hydratedAttempt.current = attempt.id;
    setAnswers(attempt.answers ?? {});
    setRound1Count(attempt.round1_count ?? 0);
    setRound1Minutes(Math.round((attempt.round1_seconds ?? 0) / 60));
    setRound2Count(attempt.round2_count ?? 0);
    setRound2Minutes(Math.round((attempt.round2_seconds ?? 0) / 60));
    setTagText(Object.entries(attempt.question_tags ?? {}).map(([number, tags]) => `${number}: ${tags.subject ?? ""}${tags.subject && tags.topic ? "/" : ""}${tags.topic ?? ""}`).join("\n"));
    setOfficialKeyText(Object.entries(attempt.detected_key ?? attempt.official_key ?? {}).map(([number, answer]) => `${number}:${answer.toUpperCase()}`).join(", "));
    setEvaluation(attempt.evaluation ?? null);
  }, [attempt]);

  const unlock = useMutation({
    mutationFn: async () => {
      if (!selectedTest) throw new Error("Choose a scheduled test first");
      const response = await fetch(`/api/training/${selectedTest.test_code}/unlock`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: accessCode }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? `Unlock failed (${response.status})`);
      return body as AttemptResponse;
    },
    onSuccess: (result) => {
      setAttemptId(result.attempt.id);
      hydratedAttempt.current = null;
      setAccessCode("");
      setSelectedTest(null);
      void qc.invalidateQueries({ queryKey: ["training"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const saveAttempt = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const postTest = Boolean(attempt?.submitted_at && !attempt.evaluation);
      const response = await fetch(`/api/training/attempts/${attemptId}${postTest ? "/candidate-answers" : ""}`, {
        method: postTest ? "PUT" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postTest ? { answers: payload.answers } : payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? `Save failed (${response.status})`);
      return body as MockAttempt;
    },
    onSuccess: () => { dirty.current = false; },
    onError: (error) => toast.error(errDetail(error)),
  });
  const saveAttemptRef = useRef(saveAttempt);
  saveAttemptRef.current = saveAttempt;

  useEffect(() => {
    if (!attemptId || !canSaveAnswers || !dirty.current) return;
    const timeout = window.setTimeout(() => saveAttemptRef.current.mutate({
      answers,
      round1_count: round1Count,
      round1_seconds: round1Minutes * 60,
      round2_count: round2Count,
      round2_seconds: round2Minutes * 60,
    }), 700);
    return () => window.clearTimeout(timeout);
  }, [answers, attemptId, canSaveAnswers, isEditable, round1Count, round1Minutes, round2Count, round2Minutes]);

  const updateAnswer = (question: number, answer: string) => {
    if (!canSaveAnswers) return;
    dirty.current = true;
    setAnswers((current) => ({ ...current, [String(question)]: answer }));
  };

  const saveTags = async () => {
    if (!attemptId) return;
    const questionTags: Record<string, Record<string, string>> = {};
    for (const line of tagText.split(/[\n;]/)) {
      const match = line.trim().match(/^(\d{1,3})\s*[:=]\s*(.+)$/);
      if (!match) continue;
      const [subject, topic = ""] = match[2].split("/").map((part) => part.trim());
      questionTags[match[1]] = { ...(subject ? { subject } : {}), ...(topic ? { topic } : {}) };
    }
    const response = await fetch(`/api/training/attempts/${attemptId}/question-tags`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question_tags: questionTags }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail ?? `Tags failed to save (${response.status})`);
    toast.success(`Saved syllabus labels for ${result.saved} questions`);
    void qc.invalidateQueries({ queryKey: ["training", "attempt", attemptId] });
  };

  const createAnalysis = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/training/attempts/${attemptId}/analysis`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail ?? `Analysis failed (${response.status})`);
      return result as NonNullable<MockAttempt["analysis"]>;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["training", "attempt", attemptId] }); toast.success("Research-backed mock report saved"); },
    onError: (error) => toast.error(errDetail(error)),
  });

  const uploadFile = async (kind: string, file: File | undefined) => {
    if (!attemptId || !file) return;
    setBusyUpload(kind);
    const body = new FormData();
    body.append("kind", kind);
    body.append("file", file);
    try {
      const response = await fetch(`/api/training/attempts/${attemptId}/files`, { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail ?? `Upload failed (${response.status})`);
      toast.success(`${file.name} saved permanently to this mock attempt`);
      void qc.invalidateQueries({ queryKey: ["training", "attempt", attemptId] });
    } catch (error) {
      toast.error(errDetail(error));
    } finally {
      setBusyUpload(null);
    }
  };

  const scan = async (kind: "omr" | "key") => {
    if (!attemptId) return;
    setBusyScan(kind);
    try {
      const response = await fetch(`/api/training/attempts/${attemptId}/scan/${kind}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? `Scan failed (${response.status})`);
      if (kind === "omr") {
        setAnswers((current) => ({ ...current, ...result.answers }));
        dirty.current = true;
        toast.success(`Detected ${Object.keys(result.answers).length} bubbles with ${result.provider}; review the answer grid.`);
      } else {
        setOfficialKeyText(Object.entries(result.answers as Record<string, string>).map(([number, answer]) => `${number}:${answer.toUpperCase()}`).join(", "));
        toast.success(`Read ${Object.keys(result.answers).length} key entries with ${result.provider}; correct and confirm them below.`);
      }
      if (result.notes) toast.message(result.notes);
      void qc.invalidateQueries({ queryKey: ["training", "attempt", attemptId] });
    } catch (error) {
      toast.error(errDetail(error));
    } finally {
      setBusyScan(null);
    }
  };

  const analyzePaper = async () => {
    if (!attemptId) return;
    setBusyScan("paper");
    try {
      const response = await fetch(`/api/training/attempts/${attemptId}/analyze-paper`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? `Paper analysis failed (${response.status})`);
      const extracted = Object.entries(result.question_tags as Record<string, Record<string, string>>)
        .map(([number, tags]) => `${number}: ${tags.subject ?? ""}${tags.subject && tags.topic ? "/" : ""}${tags.topic ?? ""}`)
        .join("\n");
      if (extracted) setTagText((current) => [current.trim(), extracted].filter(Boolean).join("\n"));
      toast.success(`Mapped ${Object.keys(result.question_tags).length} visible questions with ${result.provider}; review the labels.`);
      if (result.notes) toast.message(result.notes);
      void qc.invalidateQueries({ queryKey: ["training", "attempt", attemptId] });
    } catch (error) {
      toast.error(errDetail(error));
    } finally {
      setBusyScan(null);
    }
  };

  const saveKey = async () => {
    if (!attemptId) return;
    const response = await fetch(`/api/training/attempts/${attemptId}/answer-key`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer_key: officialKeyText }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail ?? `Save key failed (${response.status})`);
    toast.success(`Confirmed ${result.saved}/100 official answers`);
    void qc.invalidateQueries({ queryKey: ["training", "attempt", attemptId] });
  };

  const evaluate = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/training/attempts/${attemptId}/evaluate`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail ?? `Evaluation failed (${response.status})`);
      return result.evaluation as MockEvaluation;
    },
    onSuccess: (result) => {
      setEvaluation(result);
      void qc.invalidateQueries({ queryKey: ["training"] });
      void qc.invalidateQueries({ queryKey: ["tests"] });
      void qc.invalidateQueries({ queryKey: ["pyq"] });
      void qc.invalidateQueries({ queryKey: ["analytics"] });
      void qc.invalidateQueries({ queryKey: ["insights"] });
      toast.success(`Evaluation saved · ${result.score}/200 · ${result.accuracy}% accuracy`);
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const submitAttempt = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/training/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          round1_count: round1Count,
          round1_seconds: round1Minutes * 60,
          round2_count: round2Count,
          round2_seconds: round2Minutes * 60,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail ?? `Submit failed (${response.status})`);
      return result as MockAttempt;
    },
    onSuccess: () => { toast.success("Mock answers locked. You can now evaluate against the official key."); void qc.invalidateQueries({ queryKey: ["training", "attempt", attemptId] }); },
    onError: (error) => toast.error(errDetail(error)),
  });
  const submitAttemptRef = useRef(submitAttempt);
  submitAttemptRef.current = submitAttempt;

  useEffect(() => {
    if (!attemptId || !testSchedule || remainingSeconds > 0 || attempt?.submitted_at) return;
    submitAttemptRef.current.mutate();
  }, [attemptId, testSchedule, remainingSeconds, attempt?.submitted_at]);

  const groupedSchedule = useMemo(() => {
    const groups = new Map<string, ScheduledMock[]>();
    for (const item of schedule.data ?? []) {
      const month = format(new Date(`${item.date}T12:00:00`), "MMMM yyyy");
      groups.set(month, [...(groups.get(month) ?? []), item]);
    }
    return [...groups.entries()];
  }, [schedule.data]);

  if (new URLSearchParams(window.location.search).has("print-omr")) return <PrintableOmr />;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Training G · 46 scheduled mocks · IST"
        title="UPSC Prelims Test Series"
        description="100 questions · 2 marks each · one-third negative marking. The protected test window opens at 09:28, answers unlock at 09:30, and submissions freeze at 11:30 IST."
        actions={<Button variant="outline" onClick={() => window.open(`${window.location.pathname}?print-omr`, "_blank", "noopener,noreferrer")}><Printer className="size-4" /> Print blank OMR</Button>}
      />
      {!attemptId ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Scheduled mocks" value={schedule.data?.length ?? "—"} sub="October 2026 – May 2027" />
            <StatCard label="Evaluated" value={attempts.data?.filter((item) => item.evaluation).length ?? 0} sub="results saved" accent />
            <StatCard label="Question format" value="100 × 2" sub="−⅓ for each wrong answer" />
          </div>
          {schedule.isError ? <EmptyState icon={<X className="size-6" />} title="Schedule unavailable" hint="The training service did not respond. Refresh after the API reconnects." /> : null}
          {groupedSchedule.map(([month, tests]) => (
            <section key={month} className="space-y-3">
              <h2 className="font-serif text-xl font-semibold text-[#1C1D18]">{month}</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {tests.map((test) => {
                  const start = Date.parse(test.start_at);
                  const access = Date.parse(test.access_at);
                  const end = Date.parse(test.end_at);
                  const state = now < access ? "scheduled" : now < start ? "code window open" : now < end ? "test window" : test.state;
                  const statusColor = test.state === "evaluated" ? "bg-[#E8F3EC] text-[#1D4532]" : test.state === "missed" ? "bg-[#FCEBE9] text-[#9F3025]" : state === "test window" ? "bg-[#FFF2DB] text-[#8A4B08]" : "bg-[#EFF2F7] text-[#48566B]";
                  return (
                    <article key={test.test_code} className="glass-surface grid gap-3 rounded-2xl border border-white/70 bg-white/65 p-4 shadow-sm sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="font-mono text-xs text-[#0F5B78]">{test.test_code} · {test.series}</p><h3 className="mt-1 font-serif text-lg font-semibold text-[#1C1D18]">{test.subject}</h3></div>
                        <Badge className={cn("shrink-0 border-0", statusColor)}>{state}</Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-[#5E6258]">{test.scope}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5E6258]">
                        <span>{fmtDate(test.date)} · opens {format(new Date(test.access_at), "HH:mm")} IST</span>
                        <span>09:30–11:30</span>
                      </div>
                      <Button
                        variant={test.attempt_id ? "outline" : "default"}
                        disabled={test.attempt_id ? false : test.state === "missed" || now < access || now >= end}
                        onClick={() => {
                          if (test.attempt_id) {
                            setAttemptId(test.attempt_id);
                            hydratedAttempt.current = null;
                          } else {
                            setSelectedTest(test);
                            setAccessCode("");
                          }
                        }}
                        className={test.attempt_id ? "" : "bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"}
                      >
                        {test.state === "evaluated" ? "Open analysis" : test.attempt_id ? "Resume test" : now < access ? "Opens at 09:28 IST" : "Enter access code"}
                      </Button>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
          <Dialog open={Boolean(selectedTest)} onOpenChange={(open) => !open && setSelectedTest(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Unlock scheduled mock</DialogTitle><DialogDescription>{selectedTest ? `${selectedTest.series} · ${selectedTest.subject} · ${fmtDate(selectedTest.date)}` : ""}</DialogDescription></DialogHeader>
              <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); unlock.mutate(); }}>
                <div className="grid gap-2"><Label htmlFor="mock-code">Test access code</Label><Input id="mock-code" data-testid="mock-access-code" value={accessCode} onChange={(event) => setAccessCode(event.target.value.toUpperCase())} autoComplete="off" maxLength={6} placeholder="6-character code" /></div>
                <p className="text-xs text-[#5E6258]">Access is limited to the scheduled date. The question timer starts at 09:30 IST.</p>
                <DialogFooter><Button type="submit" disabled={accessCode.trim().length !== 6 || unlock.isPending} className="bg-[#1D3A2C] text-white"><KeyRound className="size-4" /> {unlock.isPending ? "Checking…" : "Unlock mock"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          <section className="glass-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/70 bg-white/65 p-5 backdrop-blur-xl">
            <div><p className="font-mono text-xs uppercase tracking-wider text-[#0F5B78]">{attempt?.test_code} · {attempt?.name}</p><h2 className="mt-1 font-serif text-xl font-semibold">{testSchedule?.subject}</h2><p className="mt-1 text-xs text-[#5E6258]">{testSchedule?.scope}</p></div>
            <div className="text-right"><p className="font-mono text-xs uppercase text-[#8C6212]">{now < Date.parse(testSchedule?.start_at ?? "") ? "Starts in" : isEditable ? "Time remaining" : "Test window closed"}</p><p data-testid="mock-timer" className="font-mono text-3xl font-bold tabular-nums text-[#1C1D18]">{now < Date.parse(testSchedule?.start_at ?? "") ? untilStartLabel : isEditable ? `${hours}:${minutes}:${seconds}` : "00:00:00"}</p><p className="text-xs text-[#5E6258]">{isEditable ? "Autosaving · 2 marks / −⅓" : "Answers are read-only outside 09:30–11:30 IST"}</p></div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              <section className="rounded-2xl border border-[#E8E3D7] bg-white p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-serif text-lg font-semibold">Round tracking</h3><p className="text-xs text-[#5E6258]">Record how many questions you attempted and time spent in each pass.</p></div><Badge variant="outline">{Object.values(answers).filter(Boolean).length}/100 answered</Badge></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <fieldset className="grid grid-cols-2 gap-2 rounded-xl border border-[#E8E3D7] p-3"><legend className="px-1 text-xs font-medium">Round 1</legend><Label className="grid gap-1 text-xs">Questions<Input type="number" min={0} max={100} value={round1Count} disabled={!isEditable} onChange={(e) => { dirty.current = true; setRound1Count(Number(e.target.value)); }} /></Label><Label className="grid gap-1 text-xs">Minutes<Input type="number" min={0} max={120} value={round1Minutes} disabled={!isEditable} onChange={(e) => { dirty.current = true; setRound1Minutes(Number(e.target.value)); }} /></Label></fieldset>
                  <fieldset className="grid grid-cols-2 gap-2 rounded-xl border border-[#E8E3D7] p-3"><legend className="px-1 text-xs font-medium">Round 2</legend><Label className="grid gap-1 text-xs">Questions<Input type="number" min={0} max={100} value={round2Count} disabled={!isEditable} onChange={(e) => { dirty.current = true; setRound2Count(Number(e.target.value)); }} /></Label><Label className="grid gap-1 text-xs">Minutes<Input type="number" min={0} max={120} value={round2Minutes} disabled={!isEditable} onChange={(e) => { dirty.current = true; setRound2Minutes(Number(e.target.value)); }} /></Label></fieldset>
                </div>
              </section>

              <section className="rounded-2xl border border-[#E8E3D7] bg-white p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-serif text-lg font-semibold">Answer sheet</h3><p className="text-xs text-[#5E6258]">{isEditable ? "Autosaves while the scheduled test is open." : canTranscribe ? "Post-test transcription: enter answers from your physical OMR before evaluation." : "Read-only after evaluation."}</p></div>{saveAttempt.isPending ? <span className="text-xs text-[#5E6258]">Saving…</span> : null}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 100 }, (_, index) => index + 1).map((question) => (
                    <div key={question} className="flex items-center justify-between gap-2 rounded-lg border border-[#F0EDE5] px-2 py-1.5">
                      <span className="w-7 font-mono text-xs">{String(question).padStart(2, "0")}</span>
                      <div className="flex gap-1">{LETTERS.map((letter) => <button key={letter} type="button" disabled={!canSaveAnswers} onClick={() => updateAnswer(question, answers[String(question)] === letter ? "" : letter)} className={cn("grid size-7 place-items-center rounded-full border font-mono text-[11px] uppercase", answers[String(question)] === letter ? "border-[#1D3A2C] bg-[#1D3A2C] text-white" : "border-[#E8E3D7] text-[#5E6258]", !canSaveAnswers && "cursor-not-allowed opacity-60")}>{letter}</button>)}</div>
                    </div>
                  ))}
                </div>
                {isEditable ? <Button className="mt-4 bg-[#9F3025] text-white" onClick={() => submitAttempt.mutate()} disabled={submitAttempt.isPending}><LockKeyhole className="size-4" /> Submit and freeze answers</Button> : null}
              </section>
            </div>

            <aside className="space-y-4">
              <section className="grid gap-3 rounded-2xl border border-[#E8E3D7] bg-white p-4">
                <h3 className="font-serif text-lg font-semibold">Paper & scans</h3>
                {([
                  ["question-paper", "Question paper", "application/pdf,image/jpeg,image/png,image/webp"],
                  ["omr-sheet", "OMR sheet", "image/jpeg,image/png,image/webp"],
                  ["official-key", "Official answer key", "image/jpeg,image/png,image/webp"],
                ] as const).map(([kind, label, accept]) => <Label key={kind} className="grid gap-1.5 text-xs">{label}<Input type="file" accept={accept} disabled={!attemptId || busyUpload === kind} onChange={(event) => void uploadFile(kind, event.target.files?.[0])} />{busyUpload === kind ? <span>Uploading…</span> : null}</Label>)}
                <p className="text-[11px] leading-relaxed text-[#77796F]">Question-paper PDFs remain saved and downloadable. For automatic per-question analysis, upload clear photographed page images.</p>
                <div className="grid gap-2">{files.map((file) => <a key={file.id} href={`/api/training/attempts/${attemptId}/files/${file.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 truncate text-xs text-[#0F5B78]"><FileText className="size-4 shrink-0" />{file.filename}</a>)}</div>
                <Button variant="outline" disabled={!files.some((file) => file.kind === "question-paper" && file.content_type.startsWith("image/")) || busyScan !== null} onClick={() => void analyzePaper()}><ScanLine className={cn("size-4", busyScan === "paper" && "animate-pulse")} /> {busyScan === "paper" ? "Analysing paper…" : "Map paper questions to syllabus"}</Button>
                <Button variant="outline" disabled={!files.some((file) => file.kind === "omr-sheet") || busyScan !== null} onClick={() => void scan("omr")}><ScanLine className={cn("size-4", busyScan === "omr" && "animate-pulse")} /> {busyScan === "omr" ? "Reading OMR…" : "Detect OMR answers"}</Button>
                <Button variant="outline" disabled={!files.some((file) => file.kind === "official-key") || busyScan !== null} onClick={() => void scan("key")}><ScanLine className={cn("size-4", busyScan === "key" && "animate-pulse")} /> {busyScan === "key" ? "Reading key…" : "Detect official key"}</Button>
              </section>

              <section className="grid gap-3 rounded-2xl border border-[#E8E3D7] bg-white p-4">
                <div><h3 className="font-serif text-lg font-semibold">Review official key</h3><p className="text-xs text-[#5E6258]">Correct AI-detected options before confirming. Format: 1:A, 2:C …</p></div>
                <Textarea rows={6} value={officialKeyText} onChange={(event) => setOfficialKeyText(event.target.value)} placeholder="1:A, 2:C, 3:B …" />
                <Button variant="outline" onClick={() => void saveKey().catch((error: unknown) => toast.error(errDetail(error)))}><Check className="size-4" /> Save confirmed key</Button>
                <Button disabled={Object.keys(attempt?.official_key ?? {}).length !== 100 || evaluate.isPending} onClick={() => evaluate.mutate()} className="bg-[#1D3A2C] text-white"><BookOpenCheck className="size-4" /> {evaluate.isPending ? "Evaluating…" : "Evaluate mock"}</Button>
              </section>
              <section className="grid gap-3 rounded-2xl border border-[#E8E3D7] bg-white p-4">
                <div><h3 className="font-serif text-lg font-semibold">Question-to-syllabus mapping</h3><p className="text-xs text-[#5E6258]">Optional labels enable subject/topic-level analytics. One per line: 1:Polity/Federalism</p></div>
                <Textarea rows={5} value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder={"1:Geography/Climatology\n2:Polity/Parliament"} />
                <Button variant="outline" onClick={() => void saveTags().catch((error: unknown) => toast.error(errDetail(error)))}><BookOpenCheck className="size-4" /> Save question labels</Button>
              </section>
              {evaluation ? <section className="grid grid-cols-2 gap-3 rounded-2xl border border-[#1D3A2C]/20 bg-[#EDF5F0] p-4"><StatCard label="Score" value={`${evaluation.score}/200`} /><StatCard label="Accuracy" value={`${evaluation.accuracy}%`} /><StatCard label="Correct / wrong" value={`${evaluation.correct} / ${evaluation.wrong}`} /><StatCard label="Blank" value={evaluation.blank} /></section> : null}
              {evaluation ? <section className="grid gap-3 rounded-2xl border border-[#E8E3D7] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-serif text-lg font-semibold">Professor mock analysis</h3><p className="text-xs text-[#5E6258]">Mistral first, Gemini if configured, then the existing fallback. Saved to this attempt.</p></div><Button onClick={() => createAnalysis.mutate()} disabled={createAnalysis.isPending} className="bg-[#1D3A2C] text-white"><BookOpenCheck className="size-4" />{createAnalysis.isPending ? "Analysing…" : attempt?.analysis ? "Refresh analysis" : "Generate analysis"}</Button></div>
                {attempt?.analysis ? <div data-testid="mock-ai-analysis" className="whitespace-pre-wrap rounded-xl border border-[#E8E3D7] bg-[#FBF9F4] p-4 text-sm leading-relaxed">{attempt.analysis.report}<p className="mt-3 border-t border-[#E8E3D7] pt-2 font-mono text-[10px] text-[#77796F]">{attempt.analysis.provider} · saved {new Date(attempt.analysis.created_at).toLocaleString()}</p></div> : null}
              </section> : null}
            </aside>
          </section>
          {evaluation ? <section className="rounded-2xl border border-[#E8E3D7] bg-white p-4 sm:p-5"><h3 className="font-serif text-lg font-semibold">Question-by-question review</h3><div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">{evaluation.question_results.map((item) => <div key={item.question} title={`Q${item.question}: marked ${item.selected || "blank"}, key ${item.correct_answer}`} className={cn("rounded-lg border p-2 text-center text-xs", item.result === "correct" ? "border-green-300 bg-green-50 text-green-800" : item.result === "wrong" ? "border-red-300 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-600")}><b>{item.question}</b><p>{item.selected || "–"}/{item.correct_answer}</p></div>)}</div></section> : null}
          <div className="flex justify-end"><Button variant="outline" onClick={() => { setAttemptId(null); setEvaluation(null); hydratedAttempt.current = null; void qc.invalidateQueries({ queryKey: ["training"] }); }}>Back to schedule</Button></div>
        </>
      )}
    </div>
  );
}
