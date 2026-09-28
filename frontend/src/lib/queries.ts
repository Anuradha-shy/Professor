import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type {
  Goal,
  InsightsOut,
  NotionLog,
  NotionMirrorRow,
  NotionStatus,
  Profile,
  Revision,
  Subject,
  StudySession,
  TestRecord,
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
  notionMirror: ["notion", "mirror"] as const,
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

export const useNotionMirror = () =>
  useQuery({ queryKey: qk.notionMirror, queryFn: () => apiGet<NotionMirrorRow[]>("/notion/mirror") });
