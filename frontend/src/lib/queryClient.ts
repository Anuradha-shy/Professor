import { QueryClient } from "@tanstack/react-query";

// Exported so lib/session can wipe it at session boundaries — cached data outlives logout.
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 20_000,
			gcTime: 10 * 60_000,
			refetchOnWindowFocus: true,
			refetchOnReconnect: true,
			retry: 1,
			retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 4_000),
		},
	},
});
