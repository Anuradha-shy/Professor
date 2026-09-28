import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type {
  AiMessage,
  AiSession,
  BurnDownPoint,
  DeviceOut,
  ForecastOut,
  Goal,
  HeatCell,
  InsightsOut,
  NotionDatabaseOption,
  NotionEntry,
  NotionLog,
  NotionSchemaOut,
  NotionStatus,
  OmrResultOut,
  Profile,
  PyqAttempt,
  PyqMeta,
  PyqQuestion,
  Revision,
  Subject,
  StudySession,
  TestRecord,
  WeaknessOut,
} from "@/lib/types";

// Stable query keys — invalidate these after mutations.
export const qk = {
  subjects: ["subjects"] as const,
  sessions: ["sessions"] as const,
  goals: ["goals"] as const,
  revisions: ["revisions"] as const,
  tests: ["tests"] as const,
  insights: ["insights"] as const,
  profile: ["profile"] as const,
  notionStatus: ["notion", "status"] as const,
  notionLogs: ["notion", "logs"] as const,
  notionSchema: ["notion", "schema"] as const,
  notionDatabases: ["notion", "databases"] as const,
  notionEntries: ["notion", "entries"] as const,
  pyqMeta: ["pyq", "meta"] as const,
  pyqAttempts: ["pyq", "attempts"] as const,
  weakness: ["analytics", "weakness"] as const,
  heatmap: ["analytics", "heatmap"] as const,
  burndown: ["analytics", "burndown"] as const,
  forecast: ["analytics", "forecast"] as const,
  aiSessions: ["ai", "sessions"] as const,
  omrRuns: ["ai", "omr", "runs"] as const,
  devices: ["auth", "devices"] as const,
};

export const useSubjects = () =>
  useQuery({ queryKey: qk.subjects, queryFn: () => apiGet<Subject[]>("/subjects") });

export const useSessions = () =>
  useQuery({ queryKey: qk.sessions, queryFn: () => apiGet<StudySession[]>("/sessions") });

export const useGoals = () =>
  useQuery({ queryKey: qk.goals, queryFn: () => apiGet<Goal[]>("/goals") });

export const useRevisions = () =>
  useQuery({ queryKey: qk.revisions, queryFn: () => apiGet<Revision[]>("/revisions") });

export const useTests = () =>
  useQuery({ queryKey: qk.tests, queryFn: () => apiGet<TestRecord[]>("/tests") });

export const useInsights = () =>
  useQuery({ queryKey: qk.insights, queryFn: () => apiGet<InsightsOut>("/insights") });

export const useProfile = () =>
  useQuery({ queryKey: qk.profile, queryFn: () => apiGet<Profile>("/profile") });

export const useNotionStatus = () =>
  useQuery({ queryKey: qk.notionStatus, queryFn: () => apiGet<NotionStatus>("/notion/status") });

export const useNotionLogs = () =>
  useQuery({ queryKey: qk.notionLogs, queryFn: () => apiGet<NotionLog[]>("/notion/logs") });

export const useNotionSchema = () =>
  useQuery({
    queryKey: qk.notionSchema,
    queryFn: () => apiGet<NotionSchemaOut>("/notion/schema"),
    retry: false,
  });

export const useNotionDatabases = () =>
  useQuery({
    queryKey: qk.notionDatabases,
    queryFn: () => apiGet<NotionDatabaseOption[]>("/notion/databases"),
    retry: false,
  });

export const useNotionEntries = (params: Record<string, string | boolean>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== "" && v !== false) search.set(k, String(v));
  }
  const qs = search.toString();
  return useQuery({
    queryKey: [...qk.notionEntries, qs],
    queryFn: () => apiGet<NotionEntry[]>(`/notion/entries${qs ? `?${qs}` : ""}`),
  });
};

export const usePyqMeta = () =>
  useQuery({ queryKey: qk.pyqMeta, queryFn: () => apiGet<PyqMeta>("/pyq/meta") });

export const usePyqQuestions = (year: number | null, subject: string) => {
  const search = new URLSearchParams({ limit: "100" });
  if (year) search.set("year", String(year));
  if (subject) search.set("subject", subject);
  return useQuery({
    queryKey: ["pyq", "questions", year, subject],
    queryFn: () => apiGet<PyqQuestion[]>(`/pyq/questions?${search.toString()}`),
    enabled: Boolean(year || subject),
  });
};

export const usePyqAttempts = () =>
  useQuery({ queryKey: qk.pyqAttempts, queryFn: () => apiGet<PyqAttempt[]>("/pyq/attempts") });

export const useWeakness = () =>
  useQuery({ queryKey: qk.weakness, queryFn: () => apiGet<WeaknessOut>("/analytics/weakness") });

export const useHeatmap = () =>
  useQuery({ queryKey: qk.heatmap, queryFn: () => apiGet<HeatCell[]>("/analytics/heatmap") });

export const useBurndown = () =>
  useQuery({ queryKey: qk.burndown, queryFn: () => apiGet<BurnDownPoint[]>("/analytics/burndown") });

export const useForecast = () =>
  useQuery({ queryKey: qk.forecast, queryFn: () => apiGet<ForecastOut>("/analytics/forecast") });

export const useAiSessions = () =>
  useQuery({ queryKey: qk.aiSessions, queryFn: () => apiGet<AiSession[]>("/ai/sessions") });

export const useAiHistory = (sessionId: string | null) =>
  useQuery({
    queryKey: ["ai", "history", sessionId],
    queryFn: () => apiGet<AiMessage[]>(`/ai/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });

export const useOmrRuns = () =>
  useQuery({ queryKey: qk.omrRuns, queryFn: () => apiGet<OmrResultOut[]>("/ai/omr/runs") });

export const useDevices = () =>
  useQuery({ queryKey: qk.devices, queryFn: () => apiGet<DeviceOut[]>("/auth/devices") });
