import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Database,
  Download,
  ExternalLink,
  Mail,
  MailOpen,
  RefreshCw,
  Save,
  X,
  ZoomIn,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { EmptyState, PageHeader, StatCard } from "@/components/kit";
import { apiPatch, apiPost } from "@/lib/api";
import { errDetail } from "@/lib/format";
import { useNotionDatabases, useNotionEntries, useNotionSchema, useNotionStatus } from "@/lib/queries";
import type { NotionEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "place_type", prop: "Place Type", label: "Place type" },
  { key: "continent", prop: "Continent", label: "Continent" },
  { key: "issue_type", prop: "Issue Type", label: "Issue type" },
  { key: "priority", prop: "Revision Priority", label: "Priority" },
] as const;

export default function Notion() {
  const qc = useQueryClient();
  const status = useNotionStatus();
  const schema = useNotionSchema();
  const dbs = useNotionDatabases();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [open, setOpen] = useState<NotionEntry | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [edit, setEdit] = useState({ title: "", memory_aid: "", pyq_history: "", priority: "" });

  const entries = useNotionEntries({ ...filters, q: search, unread_only: unreadOnly });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notion"] });

  const pull = useMutation({
    mutationFn: () => apiPost<{ message: string; ok: boolean }>("/notion/pull"),
    onSuccess: (r) => {
      r.ok ? toast.success(r.message) : toast.error(r.message);
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

  const list = entries.data ?? [];
  const activeDb = dbs.data?.find((d) => d.active)?.id ?? "";

  const switchDb = useMutation({
    mutationFn: (database_id: string) =>
      apiPost<{ message: string }>("/notion/databases/select", { database_id }),
    onSuccess: (r) => {
      toast.success(r.message);
      invalidate();
      pull.mutate();
    },
    onError: (e) => toast.error(errDetail(e)),
  });

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
        <StatCard label="Showing" value={list.length} sub="after filters" testId="notion-showing-stat" />
        <StatCard
          label="Connection"
          value={status.data?.configured ? "Live" : "Off"}
          sub={status.data?.token_hint ?? "no token"}
          testId="notion-conn-stat"
        />
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#E8E3D7] bg-white/70 p-5 backdrop-blur-xl">
        <div className="grid gap-1.5">
          <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8C6212]">
            Database
          </Label>
          <Select value={activeDb} onValueChange={(v) => switchDb.mutate(v)}>
            <SelectTrigger data-testid="notion-database-select" className="w-64">
              <SelectValue>
                {(v) =>
                  dbs.data?.find((d) => d.id === v)?.title ?? status.data?.database_title ?? "Choose"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(dbs.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.title}
                </SelectItem>
              ))}
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
        <Button
          variant={unreadOnly ? "default" : "outline"}
          data-testid="notion-unread-toggle"
          onClick={() => setUnreadOnly(!unreadOnly)}
          className={unreadOnly ? "bg-[#C8640E] text-white hover:bg-[#A85309]" : ""}
        >
          <Mail className="size-4" /> Unread only
        </Button>
        {Object.values(filters).some(Boolean) || search || unreadOnly ? (
          <Button
            variant="ghost"
            data-testid="notion-clear-filters"
            onClick={() => {
              setFilters({});
              setSearch("");
              setUnreadOnly(false);
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
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Database className="size-6" />}
          title="No entries match"
          hint="Clear the filters, or hit “Sync from Notion” to pull the latest."
          testId="notion-empty-state"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="notion-entry-grid">
          {list.map((e) => (
            <article
              key={e.page_id}
              data-testid={`notion-entry-${e.page_id}`}
              className={cn(
                "group flex flex-col rounded-2xl border bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                e.unread ? "border-[#C8640E]/50 bg-[#FFFDF8]" : "border-[#E8E3D7]",
              )}
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
                        e.priority === "High"
                          ? "bg-[#FDF0F0] text-[#B91C1C]"
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
              {e.continents.length || e.issue_types.length ? (
                <p className="mt-1 text-xs text-[#5E6258]">
                  {[...e.continents, ...e.issue_types.slice(0, 2)].join(" · ")}
                </p>
              ) : null}
              {e.memory_aid ? (
                <p className="mt-2 line-clamp-2 text-sm text-[#383A34]">{e.memory_aid}</p>
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
                        setZoom(img.url);
                        setScale(1);
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

              <div className="mt-4 flex items-center gap-2">
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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#1C1D18]/90 p-4 backdrop-blur-sm"
          onClick={() => setZoom(null)}
        >
          <div className="mb-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" data-testid="lightbox-zoom-out" onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}>
              −
            </Button>
            <span className="min-w-16 text-center font-mono text-sm text-white">{Math.round(scale * 100)}%</span>
            <Button size="sm" variant="outline" data-testid="lightbox-zoom-in" onClick={() => setScale((s) => Math.min(4, s + 0.25))}>
              +
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
            <img
              src={zoom}
              alt="Notion attachment"
              style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
              className="rounded-lg transition-transform duration-200"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
