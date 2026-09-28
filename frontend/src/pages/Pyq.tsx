import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Library, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader, StatCard } from "@/components/kit";
import { apiPost } from "@/lib/api";
import { errDetail, fmtDate } from "@/lib/format";
import { usePyqAttempts, usePyqMeta, usePyqQuestion, usePyqQuestions } from "@/lib/queries";
import type { PyqAttempt } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONS = ["a", "b", "c", "d"];

export default function Pyq() {
  const qc = useQueryClient();
  const meta = usePyqMeta();
  const attempts = usePyqAttempts();
  const [year, setYear] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PyqAttempt | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = usePyqQuestion(openId);
  const questions = usePyqQuestions(year, subject);

  const list = questions.data ?? [];
  const answered = useMemo(
    () => Object.values(marks).filter(Boolean).length,
    [marks],
  );

  const submit = useMutation({
    mutationFn: () =>
      apiPost<PyqAttempt>("/pyq/attempts", {
        label: `PYQ ${year ?? "mixed"}${subject ? ` · ${subject}` : ""} practice`,
        year,
        subject: subject || null,
        answers: marks,
      }),
    onSuccess: (a) => {
      setResult(a);
      toast.success(`Scored ${a.score}/${a.max_score} · ${a.accuracy}% accuracy`);
      qc.invalidateQueries({ queryKey: ["pyq", "attempts"] });
      qc.invalidateQueries({ queryKey: ["tests"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const resultById = new Map((result?.items ?? []).map((i) => [i.question_id, i]));

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Previous year questions · 2014–2026"
        title="PYQ Bank"
        description="Your real 1,300-question Prelims master. Pick a year or subject, mark your option per question, and get scored against the official key with UPSC negative marking."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Questions" value={meta.data?.total ?? "—"} sub="2014 → 2026" testId="pyq-total-stat" />
        <StatCard label="Years covered" value={meta.data?.years.length ?? "—"} sub="100 per year" testId="pyq-years-stat" />
        <StatCard label="In this set" value={list.length} sub="ready to attempt" testId="pyq-set-stat" accent />
        <StatCard label="Marked" value={answered} sub="answers entered" testId="pyq-marked-stat" />
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#E8E3D7] bg-white/70 p-5 backdrop-blur-xl">
        <div className="grid gap-1.5">
          <label className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">Year</label>
          <Select
            value={year ? String(year) : ""}
            onValueChange={(v) => {
              setYear(Number(v));
              setMarks({});
              setResult(null);
            }}
          >
            <SelectTrigger data-testid="pyq-year-select" className="w-40">
              <SelectValue>{(v) => (v ? String(v) : "Choose year")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(meta.data?.years ?? []).map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y} ({meta.data?.per_year[String(y)] ?? 0} Qs)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">Subject</label>
          <Select
            value={subject}
            onValueChange={(v) => {
              setSubject(v === "all" ? "" : v);
              setMarks({});
              setResult(null);
            }}
          >
            <SelectTrigger data-testid="pyq-subject-select" className="w-64">
              <SelectValue>{(v) => (!v || v === "all" ? "All subjects" : String(v))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {(meta.data?.subjects ?? []).map((s) => (
                <SelectItem key={s} value={s}>
                  {s} ({meta.data?.per_subject[s] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          data-testid="pyq-submit-btn"
          disabled={answered === 0 || submit.isPending}
          onClick={() => submit.mutate()}
          className="bg-[#C8640E] text-white hover:bg-[#A85309]"
        >
          {submit.isPending ? "Scoring…" : `Score ${answered} answer${answered === 1 ? "" : "s"}`}
        </Button>
        {result ? (
          <Button
            variant="outline"
            data-testid="pyq-reset-btn"
            onClick={() => {
              setMarks({});
              setResult(null);
            }}
          >
            New attempt
          </Button>
        ) : null}
      </section>

      {result ? (
        <section
          data-testid="pyq-result-card"
          className="grid gap-4 rounded-2xl border border-[#C8640E]/40 bg-[#FEF3E2] p-6 sm:grid-cols-4"
        >
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#8C6212]">Score</p>
            <p className="font-serif text-3xl font-semibold text-[#1C1D18]">
              {result.score}
              <span className="text-lg text-[#8A3D04]">/{result.max_score}</span>
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#8C6212]">Accuracy</p>
            <p className="font-serif text-3xl font-semibold text-[#1C1D18]">{result.accuracy}%</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#8C6212]">Correct / wrong</p>
            <p className="font-serif text-3xl font-semibold text-[#1C1D18]">
              {result.correct} / {result.wrong}
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#8C6212]">Weak topics</p>
            <p className="mt-1 text-sm text-[#383A34]">
              {result.weak_topics.slice(0, 3).join(", ") || "none — clean sweep"}
            </p>
          </div>
        </section>
      ) : null}

      {!year && !subject ? (
        <EmptyState
          icon={<Library className="size-6" />}
          title="Choose a year or subject to begin"
          hint="Every question carries its official answer key, subject, subtopic, difficulty and format."
          testId="pyq-empty-state"
        />
      ) : questions.isPending ? (
        <div className="space-y-2" data-testid="pyq-skeleton">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-[#F0EDE5]" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2" data-testid="pyq-question-list">
          {list.map((q) => {
            const res = resultById.get(q.id);
            return (
              <li
                key={q.id}
                data-testid={`pyq-q-${q.id}`}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3 transition-colors",
                  res
                    ? res.is_correct
                      ? "border-[#15803D]/40 bg-[#F2F9F4]"
                      : res.marked
                        ? "border-[#B91C1C]/40 bg-[#FDF4F4]"
                        : "border-[#E8E3D7]"
                    : "border-[#E8E3D7] hover:bg-[#FBF9F4]",
                )}
              >
                <span className="w-16 font-mono text-sm font-semibold text-[#5E6258]">
                  {q.year}·{q.qnum}
                </span>
                <button
                  type="button"
                  data-testid={`pyq-open-${q.id}`}
                  onClick={() => setOpenId(q.id)}
                  className="min-w-0 flex-1 text-left transition-colors hover:text-[#9B4E08]"
                >
                  <p className="truncate text-sm font-medium text-[#1C1D18] underline decoration-[#E8E3D7] decoration-dotted underline-offset-4">
                    {q.subtopic || q.subject}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="border-[#E8E3D7] font-mono text-[10px] uppercase tracking-[0.1em] text-[#5E6258]">
                      {q.subject}
                    </Badge>
                    <Badge variant="outline" className="border-[#E8E3D7] font-mono text-[10px] uppercase tracking-[0.1em] text-[#5E6258]">
                      {q.difficulty}
                    </Badge>
                    {q.current_affairs ? (
                      <Badge className="border-0 bg-[#FEF3E2] font-mono text-[10px] uppercase tracking-[0.1em] text-[#8A3D04]">
                        CA
                      </Badge>
                    ) : null}
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  {OPTIONS.map((opt) => {
                    const selected = marks[q.id] === opt;
                    const isKey = res && res.correct_answer === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        data-testid={`pyq-opt-${q.id}-${opt}`}
                        disabled={Boolean(result)}
                        onClick={() =>
                          setMarks((m) => ({ ...m, [q.id]: m[q.id] === opt ? "" : opt }))
                        }
                        className={cn(
                          "size-9 rounded-lg border font-mono text-sm font-semibold uppercase transition-all active:scale-95",
                          isKey
                            ? "border-[#15803D] bg-[#15803D] text-white"
                            : selected
                              ? "border-[#C8640E] bg-[#C8640E] text-white"
                              : "border-[#E8E3D7] text-[#5E6258] hover:border-[#C8640E]",
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {res ? (
                  res.is_correct ? (
                    <CheckCircle2 className="size-5 text-[#15803D]" />
                  ) : res.marked ? (
                    <XCircle className="size-5 text-[#B91C1C]" />
                  ) : null
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Question reader — full metadata + source trail */}
      <Dialog open={openId !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg" data-testid="pyq-detail-dialog">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {detail.data ? `UPSC ${detail.data.year} · Q${detail.data.qnum}` : "Loading…"}
            </DialogTitle>
          </DialogHeader>
          {detail.isPending ? (
            <div className="h-40 animate-pulse rounded-xl bg-[#F0EDE5]" />
          ) : detail.data ? (
            <div className="grid gap-4 text-sm text-[#383A34]" data-testid="pyq-detail-body">
              <div className="flex flex-wrap gap-1.5">
                <Badge className="border-0 bg-[#EDF5F0] font-mono text-[10px] uppercase tracking-[0.12em] text-[#1D4532]">
                  {detail.data.subject}
                </Badge>
                <Badge variant="outline" className="border-[#E8E3D7] font-mono text-[10px] uppercase tracking-[0.12em]">
                  {detail.data.difficulty}
                </Badge>
                <Badge variant="outline" className="border-[#E8E3D7] font-mono text-[10px] uppercase tracking-[0.12em]">
                  {detail.data.format}
                </Badge>
                {detail.data.cancelled ? (
                  <Badge className="border-0 bg-[#FDF0F0] font-mono text-[10px] uppercase text-[#B91C1C]">
                    cancelled by UPSC
                  </Badge>
                ) : null}
              </div>
              <p className="font-serif text-lg leading-snug text-[#1C1D18]">
                {detail.data.subtopic || detail.data.subject}
              </p>
              <div className="rounded-xl border border-[#E8E3D7] bg-[#FBF9F4] p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">
                  Official answer key
                </p>
                <p className="mt-1 font-serif text-3xl font-semibold uppercase text-[#1D3A2C]">
                  {detail.data.answer || "—"}
                </p>
                <p className="mt-1 text-xs text-[#5E6258]">
                  {detail.data.option_count} options · {detail.data.statement_count || "no"} statements ·{" "}
                  {detail.data.negative_stem ? "negative stem" : "direct stem"} ·{" "}
                  {detail.data.stem_word_count} words in the original stem
                </p>
              </div>
              <p className="text-xs leading-relaxed text-[#5E6258]">
                UPSC does not publish machine-readable question stems, so this bank stores the
                verified key, taxonomy and source trail. Read the exact wording in the official
                paper linked below.
              </p>
              <div className="grid gap-2">
                {detail.data.official_paper_url ? (
                  <a
                    href={detail.data.official_paper_url}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="pyq-detail-official-link"
                    className="inline-flex items-center gap-1.5 font-medium text-[#9B4E08] hover:text-[#7A3D06]"
                  >
                    Official UPSC paper archive <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
                {detail.data.analysis_source_url ? (
                  <a
                    href={detail.data.analysis_source_url}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="pyq-detail-analysis-link"
                    className="inline-flex items-center gap-1.5 text-[#5E6258] hover:text-[#1C1D18]"
                  >
                    {detail.data.analysis_source_name || "Year analysis"} <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
                {detail.data.primary_source ? (
                  <p className="text-xs text-[#5E6258]">
                    Researched source: {detail.data.primary_source}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#B91C1C]">Could not load this question.</p>
          )}
        </DialogContent>
      </Dialog>

      {(attempts.data ?? []).length > 0 ? (
        <section data-testid="pyq-history" className="rounded-2xl border border-[#E8E3D7] bg-white p-6">
          <h2 className="font-serif text-xl font-medium text-[#1C1D18]">Past PYQ attempts</h2>
          <ul className="mt-3 space-y-2">
            {(attempts.data ?? []).slice(0, 8).map((a) => (
              <li
                key={a.id}
                data-testid={`pyq-attempt-${a.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F0EDE5] px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-[#1C1D18]">{a.label}</span>
                <span className="text-xs text-[#5E6258]">{fmtDate(a.date)}</span>
                <span className="font-mono text-sm font-semibold text-[#1C1D18]">
                  {a.score}/{a.max_score} · {a.accuracy}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
