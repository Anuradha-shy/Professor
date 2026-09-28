// Display-only formatting helpers. The server (lib/dates.py) anchors any real
// "today" logic — these are for labels and form defaults only.

export function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function fmtHours(mins: number): string {
  return `${(mins / 60).toFixed(1)}h`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { weekday: "short" });
}

export function dueLabel(iso: string): string {
  const diff = Math.round(
    (new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86400000,
  );
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff < 0) return `Overdue by ${Math.abs(diff)}d`;
  return diff <= 7 ? `In ${diff} days` : fmtDate(iso);
}

// Pull a human-readable message out of an ApiError body ({detail: "..."} for 4xx).
export function errDetail(error: unknown): string {
  if (error instanceof Error && "body" in error) {
    const body = (error as { body?: { detail?: unknown } }).body;
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) return "Please check the entered values";
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

export const KIND_LABELS: Record<string, string> = {
  prelims_gs: "Prelims GS",
  prelims_csat: "CSAT",
  mains: "Mains",
  sectional: "Sectional",
};

export const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
