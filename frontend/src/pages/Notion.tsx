import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  CalendarDays,
  Clock3,
  Database,
  Download,
  ExternalLink,
  LoaderCircle,
  Mail,
  MailOpen,
  Maximize2,
  Pencil,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import StudyTimer from "@/components/StudyTimer";
import { stopActiveNotionTimer } from "@/lib/notionTimerControl";
import { EmptyState, PageHeader, StatCard } from "@/components/kit";
import { apiPatch, apiPost } from "@/lib/api";
import { errDetail } from "@/lib/format";
import { useNotionDatabases, useNotionEntries, useNotionPageContent, useNotionSchema, useNotionStatus, useSessions, useSubjects } from "@/lib/queries";
import type { AiChatOut, NotionEntry, Revision } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "place_type", prop: "Place Type", label: "Place type" },
  { key: "continent", prop: "Continent", label: "Continent" },
  { key: "issue_type", prop: "Issue Type", label: "Issue type" },
  { key: "priority", prop: "Revision Priority", label: "Priority" },
] as const;

function entryDate(entry: NotionEntry): string {
  const candidates = Object.entries(entry.values)
    .filter(
      ([key, value]) =>
        /date|created|updated|published|time/i.test(key) &&
        typeof value === "string" &&
        !Number.isNaN(Date.parse(value)),
    )
    .sort(([left], [right]) => {
      const rank = (key: string) => {
        const normalized = key.toLowerCase();
        if (normalized === "date" || normalized === "study date") return 0;
        if (normalized.includes("published") || normalized.includes("event date")) return 1;
        if (normalized.includes("created")) return 2;
        if (normalized.includes("updated") || normalized.includes("edited")) return 3;
        return 4;
      };
      return rank(left) - rank(right);
    });
  const value = candidates[0]?.[1];
  const fallback =
    (typeof value === "string" ? value : "") || entry.last_updated || entry.last_edited_time;
  if (!fallback || Number.isNaN(Date.parse(fallback))) return "";
  return /^\d{4}-\d{2}-\d{2}/.test(fallback)
    ? fallback.slice(0, 10)
    : new Date(fallback).toISOString().slice(0, 10);
}

function entryDateLabel(entry: NotionEntry): string {
  const date = entryDate(entry);
  if (!date) return "No date";
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

type EntryAiMessage = { role: "user" | "assistant"; content: string };
type ImageMark =
  | { kind: "stroke"; points: Array<{ x: number; y: number }> }
  | { kind: "text"; x: number; y: number; text: string };

function entryBriefPrompt(entry: NotionEntry): string {
  const source = JSON.stringify(
    {
      title: entry.title,
      date: entryDate(entry),
      database: entry.database_title,
      place_type: entry.place_type,
      priority: entry.priority,
      continents: entry.continents,
      issue_types: entry.issue_types,
      country_tags: entry.country_tags,
      memory_aid: entry.memory_aid,
      pyq_history: entry.pyq_history,
      source_link: entry.source_link,
      properties: entry.values,
    },
    null,
    2,
  ).slice(0, 12000);
  return `Create a concise UPSC CSE study brief for this Notion entry. Use only the supplied entry details. Include: (1) a 2-3 sentence explanation, (2) relevant GS paper/topic, (3) likely exam angles and one PYQ-style question, and (4) one recall prompt. Flag missing facts instead of inventing them.\n\nEntry:\n${source}`;
}

export default function Notion() {
  const qc = useQueryClient();
  const status = useNotionStatus();
  const schema = useNotionSchema();
  const dbs = useNotionDatabases();
  const sessions = useSessions(10_000);
  const subjects = useSubjects();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [dbFilter, setDbFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [open, setOpen] = useState<NotionEntry | null>(null);
  const [reading, setReading] = useState<NotionEntry | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [enhanceEdges, setEnhanceEdges] = useState(false);
  const [imageMarks, setImageMarks] = useState<ImageMark[]>([]);
  const [markTool, setMarkTool] = useState<"pencil" | "text" | null>(null);
  const strokeIndex = useRef<number | null>(null);
  const [aiEntry, setAiEntry] = useState<NotionEntry | null>(null);
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<EntryAiMessage[]>([]);
  const [aiFollowup, setAiFollowup] = useState("");
  const [revisionSubject, setRevisionSubject] = useState("");
  const [edit, setEdit] = useState({ title: "", memory_aid: "", pyq_history: "", priority: "" });

  const entries = useNotionEntries({ ...filters, q: search, unread_only: unreadOnly, database_id: dbFilter });
  const pageContent = useNotionPageContent(reading?.page_id ?? null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notion"] });

  useEffect(() => {
    if (!status.data?.configured) return;
    const syncId = window.setInterval(() => {
      void apiPost<{ ok: boolean }>("/notion/pull")
        .then((result) => {
          if (result.ok) {
            void qc.invalidateQueries({ queryKey: ["notion"] });
            void qc.invalidateQueries({ queryKey: ["sessions"] });
          }
        })
        .catch(() => undefined);
    }, 5 * 60_000);
    return () => window.clearInterval(syncId);
  }, [qc, status.data?.configured]);

  useEffect(() => {
    if (!revisionSubject && subjects.data?.length) setRevisionSubject(subjects.data[0].id);
  }, [revisionSubject, subjects.data]);

  const pull = useMutation({
    mutationFn: () => apiPost<{ message: string; ok: boolean }>("/notion/pull"),
    onSuccess: (r) => {
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      invalidate();
    },
    onError: (e) => toast.error(errDetail(e)),
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPatch<NotionEntry>(`/notion/entries/${open?.page_id}`, payload),
    onSuccess: (e) => {
      toast.success("Saved to Notion");
      setOpen(e);
      invalidate();
    },
    onError: (e) => toast.error(errDetail(e)),
  });

  const toggleRead = useMutation({
    mutationFn: ({ id, unread }: { id: string; unread: boolean }) =>
      apiPatch<NotionEntry>(`/notion/entries/${id}`, { unread }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(errDetail(e)),
  });

  const queueRevision = useMutation({
    mutationFn: ({ entry, subjectId }: { entry: NotionEntry; subjectId: string }) =>
      apiPost<Revision>("/revisions", {
        topic: entry.title,
        subject_id: subjectId,
        source: `Notion: ${entry.database_title || "Study entry"}`,
      }),
    onSuccess: (revision) => {
      toast.success(`Added “${revision.topic}” to revisions`);
      void qc.invalidateQueries({ queryKey: ["revisions"] });
      void qc.invalidateQueries({ queryKey: ["insights"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const entryAi = useMutation({
    mutationFn: ({ message, sessionId }: { message: string; sessionId?: string }) =>
      apiPost<AiChatOut>("/ai/notion-entry", {
        message,
        ...(sessionId ? { session_id: sessionId } : {}),
      }),
    onSuccess: (result) => {
      setAiSessionId(result.session_id);
      setAiMessages((messages) => [...messages, { role: "assistant", content: result.reply }]);
      qc.invalidateQueries({ queryKey: ["ai", "sessions"] });
    },
    onError: (error) => toast.error(errDetail(error)),
  });

  const list = entries.data ?? [];
  const coverageMinutes = (pageId: string) =>
    (sessions.data ?? [])
      .filter((session) => session.notes.includes(`Notion page: ${pageId}`))
      .reduce((total, session) => total + session.duration_minutes, 0);
  const visibleList = list
    .filter((entry) => {
      const date = entryDate(entry);
      if (dateFrom && (!date || date < dateFrom)) return false;
      if (dateTo && (!date || date > dateTo)) return false;
      if (mediaFilter === "with-images" && entry.images.length === 0) return false;
      if (mediaFilter === "without-images" && entry.images.length > 0) return false;
      return true;
    })
    .sort((left, right) => {
      if (sortOrder === "title") {
        return left.title.localeCompare(right.title) || left.page_id.localeCompare(right.page_id);
      }
      const leftDate = entryDate(left);
      const rightDate = entryDate(right);
      if (!leftDate || !rightDate) {
        if (!leftDate && !rightDate) return left.title.localeCompare(right.title);
        return leftDate ? -1 : 1;
      }
      const dateOrder = sortOrder === "oldest"
        ? leftDate.localeCompare(rightDate)
        : rightDate.localeCompare(leftDate);
      return dateOrder || left.title.localeCompare(right.title) || left.page_id.localeCompare(right.page_id);
    });
  const databaseCoverage = visibleList.reduce<Record<string, { total: number; read: number }>>(
    (coverage, entry) => {
      const title = entry.database_title || "Untitled database";
      coverage[title] ??= { total: 0, read: 0 };
      coverage[title].total += 1;
      if (!entry.unread) coverage[title].read += 1;
      return coverage;
    },
    {},
  );

  const startEntryAi = (entry: NotionEntry) => {
    setAiEntry(entry);
    setAiSessionId(null);
    setAiMessages([{ role: "user", content: "Create a UPSC study brief for this entry." }]);
    setAiFollowup("");
    entryAi.mutate({ message: entryBriefPrompt(entry) });
  };

  const sendAiFollowup = () => {
    const message = aiFollowup.trim();
    if (!message || entryAi.isPending) return;
    setAiMessages((messages) => [...messages, { role: "user", content: message }]);
    setAiFollowup("");
    entryAi.mutate({ message, sessionId: aiSessionId ?? undefined });
  };

  const openReader = (entry: NotionEntry) => {
    setReading(entry);
    if (entry.unread) toggleRead.mutate({ id: entry.page_id, unread: false });
  };

  const closeReader = () => {
    stopActiveNotionTimer();
    setReading(null);
  };

  const openImage = (url: string) => {
    setZoom(url);
    setScale(1);
    setImageDimensions({ width: 0, height: 0 });
    setEnhanceEdges(false);
    setMarkTool(null);
    try {
      const saved = localStorage.getItem(`professor.notion.marks.${url}`);
      setImageMarks(saved ? (JSON.parse(saved) as ImageMark[]) : []);
    } catch {
      setImageMarks([]);
    }
  };

  useEffect(() => {
    if (!zoom) return;
    localStorage.setItem(`professor.notion.marks.${zoom}`, JSON.stringify(imageMarks));
  }, [imageMarks, zoom]);

  // Fields worth showing for any database shape (the CA daily log has its own props).
  const extras = (e: NotionEntry) =>
    Object.entries(e.values)
      .filter(
        ([k, v]) =>
          k !== "Name" &&
          (typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) && v.length > 0),
      )
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  const crux = (entry: NotionEntry) =>
    Object.entries(entry.values).find(
      ([key, value]) => /crux|core|summary|gist/i.test(key) && typeof value === "string" && value.trim(),
    );

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Live two-way sync"
        title="Notion Database"
        description={
          status.data?.database_title
            ? `Connected to “${status.data.database_title}” — edits here write straight back to Notion.`
            : "Your Notion workspace, mirrored for instant filtering."
        }
        actions={
          <Button
            data-testid="notion-pull-btn"
            onClick={() => pull.mutate()}
            disabled={pull.isPending}
            className="bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"
          >
            <RefreshCw className={cn("size-4", pull.isPending && "animate-spin")} />
            {pull.isPending ? "Pulling…" : "Sync from Notion"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Entries" value={status.data?.cached_entries ?? "—"} sub="mirrored locally" testId="notion-count-stat" />
        <StatCard label="Unread" value={status.data?.unread_entries ?? "—"} sub="new or unreviewed" testId="notion-unread-stat" accent />
        <StatCard label="Showing" value={visibleList.length} sub="after filters" testId="notion-showing-stat" />
        <StatCard
          label="Connection"
          value={status.data?.configured ? "Live" : "Off"}
          sub={status.data?.token_hint ?? "no token"}
          testId="notion-conn-stat"
        />
      </div>

      {Object.keys(databaseCoverage).length > 1 ? (
        <section className="glass-surface rounded-2xl border border-white/70 bg-white/65 p-5 backdrop-blur-2xl sm:p-6" data-testid="notion-database-coverage">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#0F5B78]">All synced databases</p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-[#1C1D18]">Reading coverage</h2>
            </div>
            <span className="font-mono text-xs text-[#5E6258]">{visibleList.length} entries in view</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(databaseCoverage).map(([title, coverage]) => {
              const pct = coverage.total ? Math.round((coverage.read / coverage.total) * 100) : 0;
              return (
                <article key={title} className="rounded-xl border border-white/80 bg-white/55 p-4">
                  <h3 className="truncate text-sm font-medium text-[#1C1D18]" title={title}>{title}</h3>
                  <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] text-[#5E6258]">
                    <span>{coverage.read} read</span><span>{coverage.total - coverage.read} remaining</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E8E3D7]">
                    <div className="h-full rounded-full bg-[#0F5B78] transition-[width] duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-right font-mono text-[10px] text-[#77796F]">{pct}%</p>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#E8E3D7] bg-white/70 p-5 backdrop-blur-xl">
        <div className="grid gap-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">
            Database
          </Label>
          <Select value={dbFilter} onValueChange={(v) => setDbFilter(v)}>
            <SelectTrigger data-testid="notion-database-select" className="w-64">
              <SelectValue>
                {(v) =>
                  !v || v === "all"
                    ? "All databases"
                    : (dbs.data?.find((d) => d.id === v)?.title ?? "Database")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All databases</SelectItem>
              {(dbs.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">
            Order
          </Label>
          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger data-testid="notion-sort-order" className="w-44">
              <SelectValue>{(v) => ({ newest: "Newest date", oldest: "Oldest date", title: "Title A-Z" }[String(v)] ?? "Newest date")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest date</SelectItem>
              <SelectItem value="oldest">Oldest date</SelectItem>
              <SelectItem value="title">Title A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="notion-search" className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">
            Search
          </Label>
          <Input
            id="notion-search"
            data-testid="notion-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Place, strait, country…"
            className="w-52"
          />
        </div>
        {FILTERS.filter((f) => (schema.data?.options[f.prop] ?? []).length > 0).map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">{f.label}</Label>
            <Select
              value={filters[f.key] ?? ""}
              onValueChange={(v) => setFilters({ ...filters, [f.key]: v === "all" ? "" : v })}
            >
              <SelectTrigger data-testid={`notion-filter-${f.key}`} className="w-44">
                <SelectValue>{(v) => (!v || v === "all" ? "All" : String(v))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(schema.data?.options[f.prop] ?? []).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label htmlFor="notion-date-from" className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">
            From date
          </Label>
          <Input
            id="notion-date-from"
            data-testid="notion-date-from"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="notion-date-to" className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">
            To date
          </Label>
          <Input
            id="notion-date-to"
            data-testid="notion-date-to"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">
            Attachments
          </Label>
          <Select value={mediaFilter} onValueChange={setMediaFilter}>
            <SelectTrigger data-testid="notion-media-filter" className="w-44">
              <SelectValue>{(v) => ({ all: "Any entry", "with-images": "With images", "without-images": "No images" }[String(v)] ?? "Any entry")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any entry</SelectItem>
              <SelectItem value="with-images">With images</SelectItem>
              <SelectItem value="without-images">No images</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant={unreadOnly ? "default" : "outline"}
          data-testid="notion-unread-toggle"
          onClick={() => setUnreadOnly(!unreadOnly)}
          className={unreadOnly ? "bg-[#C8640E] text-white hover:bg-[#A85309]" : ""}
        >
          <Mail className="size-4" /> Unread only
        </Button>
        {Object.values(filters).some(Boolean) || search || unreadOnly || dbFilter !== "all" || dateFrom || dateTo || mediaFilter !== "all" ? (
          <Button
            variant="ghost"
            data-testid="notion-clear-filters"
            onClick={() => {
              setFilters({});
              setSearch("");
              setUnreadOnly(false);
              setDbFilter("all");
              setDateFrom("");
              setDateTo("");
              setMediaFilter("all");
            }}
          >
            Clear
          </Button>
        ) : null}
      </section>

      {entries.isPending ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="notion-skeleton">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-[#F0EDE5]" />
          ))}
        </div>
      ) : visibleList.length === 0 ? (
        <EmptyState
          icon={<Database className="size-6" />}
          title="No entries match"
          hint="Clear the filters, or hit “Sync from Notion” to pull the latest."
          testId="notion-empty-state"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="notion-entry-grid">
          {visibleList.map((e) => (
            <article
              key={e.page_id}
              data-testid={`notion-entry-${e.page_id}`}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a, input, textarea, [role='combobox']")) return;
                openReader(e);
              }}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
                  event.preventDefault();
                  openReader(e);
                }
              }}
              className={cn(
                "group flex cursor-pointer flex-col rounded-2xl border bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F5B78]",
                e.unread ? "border-[#C8640E]/50 bg-[#FFFDF8]" : "border-[#E8E3D7]",
              )}
              style={{
                borderLeftWidth: 4,
                borderLeftColor: e.priority.toLowerCase() === "high" ? "#B91C1C" : e.priority.toLowerCase() === "medium" ? "#C8640E" : e.priority ? "#1D7657" : e.unread ? "#C8640E" : "#0F5B78",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {e.unread ? (
                    <Badge className="border-0 bg-[#FEF3E2] font-mono text-[10px] uppercase tracking-[0.12em] text-[#8A3D04]">
                      unread
                    </Badge>
                  ) : null}
                  {e.place_type ? (
                    <Badge variant="outline" className="border-[#E8E3D7] font-mono text-[10px] uppercase tracking-[0.1em] text-[#5E6258]">
                      {e.place_type}
                    </Badge>
                  ) : null}
                  {e.priority ? (
                    <Badge
                      className={cn(
                        "border-0 font-mono text-[10px] uppercase tracking-[0.12em]",
                        e.priority.toLowerCase() === "high"
                          ? "bg-[#FDF0F0] text-[#B91C1C]"
                          : e.priority.toLowerCase() === "medium"
                            ? "bg-[#FEF3E2] text-[#8A3D04]"
                            : "bg-[#EDF5F0] text-[#1D4532]",
                      )}
                    >
                      {e.priority}
                    </Badge>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  data-testid={`notion-read-${e.page_id}`}
                  aria-label={e.unread ? "Mark as read" : "Mark as unread"}
                  onClick={() => toggleRead.mutate({ id: e.page_id, unread: !e.unread })}
                >
                  {e.unread ? <MailOpen className="size-4 text-[#5E6258]" /> : <Mail className="size-4 text-[#5E6258]" />}
                </Button>
              </div>

              <h3 className="mt-2 font-serif text-lg font-medium leading-snug text-[#1C1D18]">{e.title}</h3>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#77796F]">
                <CalendarDays className="size-3.5" /> {entryDateLabel(e)}
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-[#0F5B78]">
                <Clock3 className="size-3.5" /> {coverageMinutes(e.page_id)}m studied
              </p>
              {e.continents.length || e.issue_types.length ? (
                <p className="mt-1 text-xs text-[#5E6258]">
                  {[...e.continents, ...e.issue_types.slice(0, 2)].join(" · ")}
                </p>
              ) : null}
              {e.memory_aid ? (
                <p className="mt-2 line-clamp-2 text-sm text-[#383A34]">{e.memory_aid}</p>
              ) : null}
              {crux(e) ? (
                <p className="mt-2 line-clamp-3 border-l-2 border-[#C8640E]/50 pl-2 text-sm leading-relaxed text-[#383A34]">
                  {crux(e)?.[1] as string}
                </p>
              ) : null}
              {extras(e).length ? (
                <ul
                  data-testid={`notion-fields-${e.page_id}`}
                  className="mt-2 space-y-1 text-xs leading-relaxed text-[#5E6258]"
                >
                  {extras(e).map((line) => (
                    <li key={line} className="line-clamp-2">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}

              {e.images.length > 0 ? (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {e.images.slice(0, 3).map((img) => (
                    <button
                      key={img.url}
                      type="button"
                      data-testid={`notion-image-${e.page_id}`}
                      onClick={() => {
                        openImage(img.url);
                      }}
                      className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-[#E8E3D7]"
                    >
                      <img src={img.url} alt={img.name} className="size-full object-cover" />
                      <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                        <ZoomIn className="size-4" />
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  size="xs"
                  data-testid={`notion-read-open-${e.page_id}`}
                  onClick={() => openReader(e)}
                  className="bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"
                >
                  <BookOpen className="size-3.5" /> Read
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  data-testid={`notion-ai-${e.page_id}`}
                  onClick={() => startEntryAi(e)}
                >
                  <Sparkles className="size-3.5" /> AI brief
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  data-testid={`notion-edit-${e.page_id}`}
                  onClick={() => {
                    setOpen(e);
                    setEdit({
                      title: e.title,
                      memory_aid: e.memory_aid,
                      pyq_history: e.pyq_history,
                      priority: e.priority,
                    });
                  }}
                >
                  Edit
                </Button>
                {e.url ? (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`notion-open-${e.page_id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#9B4E08] hover:text-[#7A3D06]"
                  >
                    Open in Notion <ExternalLink className="size-3" />
                  </a>
                ) : null}
                {e.source_link ? (
                  <a
                    href={e.source_link}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-xs text-[#5E6258] hover:text-[#1C1D18]"
                  >
                    Source
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Reading view — full entry with a read tick */}
      <Dialog open={reading !== null} onOpenChange={(o) => !o && closeReader()}>
        <DialogContent
          showCloseButton={false}
          className="!fixed !inset-0 !left-0 !top-0 !h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 !overflow-y-auto !rounded-none !border-0 !bg-[#080909] !p-0 !text-white !ring-0"
          data-testid="notion-reader"
        >
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <DialogHeader className="min-w-0 gap-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
                  {reading ? entryDateLabel(reading) : "Notion entry"}
                </p>
                <DialogTitle className="pr-2 font-serif text-2xl leading-snug text-white sm:text-3xl">
                  {reading?.title}
                </DialogTitle>
              </DialogHeader>
              <Button
                variant="outline"
                size="icon"
                data-testid="notion-reader-close"
                aria-label="Close full-screen entry"
                onClick={closeReader}
                className="sticky top-0 shrink-0 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </div>
          {reading ? (
            <div className="grid content-start gap-5">
              <div className="flex flex-wrap items-center gap-2">
                {reading.database_title ? (
                  <Badge variant="outline" className="border-white/15 bg-white/5 font-mono text-[10px] uppercase tracking-[0.1em] text-white/70">
                    {reading.database_title}
                  </Badge>
                ) : null}
                <Button
                  size="xs"
                  variant={reading.unread ? "outline" : "default"}
                  data-testid="notion-reader-read-tick"
                  onClick={() => {
                    const next = !reading.unread;
                    toggleRead.mutate({ id: reading.page_id, unread: next });
                    setReading({ ...reading, unread: next });
                  }}
                  className={reading.unread ? "border-white/20 bg-white/5 text-white hover:bg-white/10" : "bg-[#1D4532] text-white hover:bg-[#2F5E48]"}
                >
                  <Check className="size-3.5" /> {reading.unread ? "Mark as read" : "Read"}
                </Button>
                <Button size="xs" variant="outline" onClick={() => startEntryAi(reading)}>
                  <Sparkles className="size-3.5" /> Ask Professor AI
                </Button>
                <Select value={revisionSubject} onValueChange={setRevisionSubject}>
                  <SelectTrigger data-testid="notion-revision-subject" className="w-44 border-white/20 bg-white/5 text-white">
                    <SelectValue>
                      {(value) => subjects.data?.find((subject) => subject.id === value)?.short_name ?? "Choose subject"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(subjects.data ?? []).map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="xs"
                  variant="outline"
                  data-testid="notion-queue-revision"
                  disabled={!revisionSubject || queueRevision.isPending}
                  onClick={() => queueRevision.mutate({ entry: reading, subjectId: revisionSubject })}
                  className="border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                >
                  <Clock3 className="size-3.5" /> {queueRevision.isPending ? "Adding…" : "Queue revision"}
                </Button>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-white/60">
                  <Clock3 className="size-3.5" /> {coverageMinutes(reading.page_id)}m studied
                </span>
              </div>

              <StudyTimer notionEntry={{ pageId: reading.page_id, title: reading.title, subjectId: revisionSubject }} />

              {Object.entries(reading.values)
                .filter(
                  ([k, v]) =>
                    k !== "Name" &&
                    (typeof v === "string"
                      ? v.trim().length > 0
                      : Array.isArray(v)
                        ? v.length > 0
                        : v !== null && v !== undefined && v !== false),
                )
                .map(([k, v]) => (
                  <div key={k} className="border-b border-white/10 pb-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#E8C79A]">{k}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/85">
                      {Array.isArray(v) ? v.join(", ") : String(v)}
                    </p>
                  </div>
                ))}

              {pageContent.isPending ? (
                <div className="h-20 animate-pulse rounded-xl bg-white/5" aria-label="Loading entry details" />
              ) : pageContent.data?.content.length ? (
                <section className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4" data-testid="notion-page-content">
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#E8C79A]">Page notes and crux</h3>
                  {pageContent.data.blocks?.length ? pageContent.data.blocks.map((block, index) => {
                    const indent = { paddingLeft: Math.min(block.depth, 4) * 16 };
                    if (block.type.startsWith("heading_")) {
                      const headingClass = block.type === "heading_1" ? "text-xl font-semibold" : block.type === "heading_2" ? "text-lg font-semibold" : "text-base font-semibold";
                      return <h4 key={`${index}-${block.text}`} style={indent} className={`pt-3 text-[#F2D4A8] ${headingClass}`}>{block.text}</h4>;
                    }
                    if (block.type === "quote") return <blockquote key={`${index}-${block.text}`} style={indent} className="border-l-2 border-[#C8640E] pl-3 text-sm italic leading-relaxed text-white/75">{block.text}</blockquote>;
                    if (block.type === "code") return <pre key={`${index}-${block.text}`} style={indent} className="overflow-x-auto rounded-md bg-black/30 p-3 font-mono text-xs text-[#DCE8DF]">{block.text}</pre>;
                    if (block.type === "callout") return <div key={`${index}-${block.text}`} style={indent} className="rounded-md border-l-2 border-[#E8C79A] bg-white/[0.06] px-3 py-2 text-sm leading-relaxed text-white/85">{block.text}</div>;
                    if (block.type === "bullet_list_item" || block.type === "numbered_list_item" || block.type === "to_do") {
                      const marker = block.type === "bullet_list_item" ? "•" : block.type === "numbered_list_item" ? `${index + 1}.` : "□";
                      return <p key={`${index}-${block.text}`} style={indent} className="flex gap-2 text-sm leading-relaxed text-white/85"><span className="text-[#E8C79A]">{marker}</span><span className="whitespace-pre-wrap">{block.text}</span></p>;
                    }
                    return <p key={`${index}-${block.text}`} style={indent} className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{block.text}</p>;
                  }) : pageContent.data.content.map((line, index) => (
                    <p key={`${index}-${line}`} className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{line}</p>
                  ))}
                </section>
              ) : pageContent.isError ? (
                <p className="text-xs text-white/50">Page body is unavailable offline; cached properties above remain available.</p>
              ) : null}

              {(pageContent.data?.images ?? reading.images).length ? (
                <div className="grid gap-3 sm:grid-cols-2" data-testid="notion-reader-images">
                  {(pageContent.data?.images ?? reading.images).map((img) => (
                    <button
                      key={img.url}
                      type="button"
                      aria-label={`Zoom ${img.name}`}
                      onClick={() => {
                        openImage(img.url);
                      }}
                      className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/15 bg-white/5"
                    >
                      <img src={img.url} alt={img.name} className="size-full object-contain" />
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/65 py-2 text-xs text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
                        <ZoomIn className="size-3.5" /> {img.name}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {reading.url ? (
                <a
                  href={reading.url}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="notion-reader-open-notion"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E8C79A] hover:text-white"
                >
                  Open the full page in Notion <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
          ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={aiEntry !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setAiEntry(null);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl" data-testid="notion-ai-dialog">
          <DialogHeader>
            <DialogTitle className="pr-8 font-serif text-2xl">Professor AI study brief</DialogTitle>
            <DialogDescription>
              {aiEntry ? `Entry: ${aiEntry.title}. Ask follow-up questions about this entry.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[48svh] space-y-3 overflow-y-auto rounded-lg border border-[#E8E3D7] bg-[#FBF9F4] p-4">
            {aiMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  "whitespace-pre-wrap rounded-lg px-3 py-2.5 text-sm leading-relaxed",
                  message.role === "assistant"
                    ? "border border-[#E8E3D7] bg-white text-[#383A34]"
                    : "ml-6 bg-[#EDF5F0] text-[#1D4532]",
                )}
              >
                {message.content}
              </div>
            ))}
            {entryAi.isPending ? (
              <p className="inline-flex items-center gap-2 text-sm text-[#5E6258]">
                <LoaderCircle className="size-4 animate-spin" /> Professor is preparing the brief…
              </p>
            ) : null}
          </div>
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              sendAiFollowup();
            }}
          >
            <Textarea
              data-testid="notion-ai-followup"
              rows={2}
              value={aiFollowup}
              onChange={(event) => setAiFollowup(event.target.value)}
              placeholder="Ask for a simpler explanation, a quiz, or a revision plan…"
              disabled={entryAi.isPending}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                data-testid="notion-ai-send"
                disabled={!aiFollowup.trim() || entryAi.isPending}
                className="bg-[#1D3A2C] text-white hover:bg-[#2F5E48]"
              >
                <Send className="size-4" /> Send follow-up
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog — writes back to Notion */}
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Edit Notion entry</DialogTitle>
          </DialogHeader>
          <form
            data-testid="notion-edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(edit);
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="ne-title">Name</Label>
              <Input
                id="ne-title"
                data-testid="notion-edit-title"
                value={edit.title}
                onChange={(ev) => setEdit({ ...edit, title: ev.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ne-priority">Revision priority</Label>
              <Select value={edit.priority} onValueChange={(v) => setEdit({ ...edit, priority: v })}>
                <SelectTrigger data-testid="notion-edit-priority" className="w-full">
                  <SelectValue>{(v) => (v ? String(v) : "Choose")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(schema.data?.options["Revision Priority"] ?? ["High", "Medium", "Low"]).map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ne-mnemonic">Memory aid (mnemonic)</Label>
              <Textarea
                id="ne-mnemonic"
                data-testid="notion-edit-mnemonic"
                rows={2}
                value={edit.memory_aid}
                onChange={(ev) => setEdit({ ...edit, memory_aid: ev.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ne-pyq">PYQ history</Label>
              <Textarea
                id="ne-pyq"
                data-testid="notion-edit-pyq"
                rows={2}
                value={edit.pyq_history}
                onChange={(ev) => setEdit({ ...edit, pyq_history: ev.target.value })}
              />
            </div>
            <Button
              type="submit"
              data-testid="notion-edit-save"
              disabled={save.isPending}
              className="bg-[#C8640E] text-white hover:bg-[#A85309]"
            >
              <Save className="size-4" /> {save.isPending ? "Saving to Notion…" : "Save to Notion"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Attachment lightbox — zoom in/out + download */}
      {zoom ? (
        <div
          data-testid="notion-lightbox"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4 backdrop-blur-sm"
          onClick={() => setZoom(null)}
        >
          <svg aria-hidden className="pointer-events-none absolute size-0">
            <filter id="notion-edge-enhance">
              <feConvolveMatrix order="3" kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" />
            </filter>
          </svg>
          <div className="mb-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" data-testid="lightbox-zoom-out" aria-label="Zoom out" onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}>
              <ZoomOut className="size-4" />
            </Button>
            <span className="min-w-16 text-center font-mono text-sm text-white">{Math.round(scale * 100)}%</span>
            <Button size="sm" variant="outline" data-testid="lightbox-zoom-in" aria-label="Zoom in" onClick={() => setScale((s) => Math.min(4, s + 0.25))}>
              <ZoomIn className="size-4" />
            </Button>
            <Button size="sm" variant="outline" data-testid="lightbox-fit" aria-label="Fit image" onClick={() => setScale(1)}>
              <Maximize2 className="size-4" /> Fit
            </Button>
            <Button
              size="sm"
              variant={enhanceEdges ? "default" : "outline"}
              data-testid="lightbox-edge-enhance"
              aria-pressed={enhanceEdges}
              onClick={() => setEnhanceEdges((enabled) => !enabled)}
              className={enhanceEdges ? "bg-[#1D3A2C] text-white" : "border-white/20 bg-white/5 text-white"}
            >
              <Sparkles className="size-4" /> Edges
            </Button>
            <Button
              size="sm"
              variant={markTool === "pencil" ? "default" : "outline"}
              data-testid="lightbox-pencil"
              aria-pressed={markTool === "pencil"}
              onClick={() => setMarkTool((tool) => tool === "pencil" ? null : "pencil")}
              title="Draw a saved highlight"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="sm"
              variant={markTool === "text" ? "default" : "outline"}
              data-testid="lightbox-text"
              aria-pressed={markTool === "text"}
              onClick={() => setMarkTool((tool) => tool === "text" ? null : "text")}
              title="Place a saved text note"
            >
              <Type className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid="lightbox-clear-marks"
              aria-label="Clear image annotations"
              disabled={imageMarks.length === 0}
              onClick={() => setImageMarks([])}
            >
              <Trash2 className="size-4" />
            </Button>
            <a
              href={zoom}
              download
              target="_blank"
              rel="noreferrer"
              data-testid="lightbox-download"
              className="inline-flex items-center gap-1 rounded-lg bg-[#C8640E] px-3 py-1.5 text-sm text-white hover:bg-[#A85309]"
            >
              <Download className="size-4" /> Download
            </a>
            <Button size="sm" variant="outline" data-testid="lightbox-close" onClick={() => setZoom(null)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="max-h-[80svh] max-w-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div
              className="relative inline-block align-top"
              style={{
                width: imageDimensions.width ? imageDimensions.width * scale : undefined,
                height: imageDimensions.height ? imageDimensions.height * scale : undefined,
              }}
            >
              <img
                src={zoom}
                alt="Notion attachment"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  const fit = Math.min((window.innerWidth * 0.9) / image.naturalWidth, (window.innerHeight * 0.78) / image.naturalHeight, 1);
                  setImageDimensions({ width: Math.round(image.naturalWidth * fit), height: Math.round(image.naturalHeight * fit) });
                }}
                style={{
                  width: imageDimensions.width ? imageDimensions.width * scale : undefined,
                  height: imageDimensions.height ? imageDimensions.height * scale : undefined,
                  filter: enhanceEdges ? "url(#notion-edge-enhance) contrast(1.08)" : undefined,
                }}
                className="block rounded-lg object-fill"
              />
              <svg
                viewBox="0 0 1000 700"
                preserveAspectRatio="none"
                className={cn(
                  "absolute inset-0 size-full touch-none",
                  markTool === "pencil" ? "cursor-crosshair" : markTool === "text" ? "cursor-text" : "pointer-events-none",
                )}
                onPointerDown={(event) => {
                  if (markTool !== "pencil") return;
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const point = {
                    x: ((event.clientX - rect.left) / rect.width) * 1000,
                    y: ((event.clientY - rect.top) / rect.height) * 700,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setImageMarks((marks) => {
                    strokeIndex.current = marks.length;
                    return [...marks, { kind: "stroke", points: [point] }];
                  });
                }}
                onPointerMove={(event) => {
                  if (markTool !== "pencil" || strokeIndex.current === null || event.buttons !== 1) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const point = {
                    x: ((event.clientX - rect.left) / rect.width) * 1000,
                    y: ((event.clientY - rect.top) / rect.height) * 700,
                  };
                  setImageMarks((marks) => marks.map((mark, index) =>
                    index === strokeIndex.current && mark.kind === "stroke"
                      ? { ...mark, points: [...mark.points, point] }
                      : mark,
                  ));
                }}
                onPointerUp={() => { strokeIndex.current = null; }}
                onPointerCancel={() => { strokeIndex.current = null; }}
                onClick={(event) => {
                  if (markTool !== "text") return;
                  const note = window.prompt("Write a note for this image");
                  if (!note?.trim()) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setImageMarks((marks) => [...marks, {
                    kind: "text",
                    x: ((event.clientX - rect.left) / rect.width) * 1000,
                    y: ((event.clientY - rect.top) / rect.height) * 700,
                    text: note.trim(),
                  }]);
                }}
              >
                {imageMarks.map((mark, index) => mark.kind === "stroke" ? (
                  <polyline
                    key={`stroke-${index}`}
                    points={mark.points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke="#FFE16B"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <g key={`note-${index}`}>
                    <rect x={mark.x - 5} y={mark.y - 26} width={Math.max(120, mark.text.length * 9)} height="34" rx="5" fill="#FFE16B" fillOpacity="0.92" />
                    <text x={mark.x} y={mark.y - 4} fill="#1C1D18" fontSize="19">{mark.text}</text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
