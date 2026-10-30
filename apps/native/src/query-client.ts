import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";
import { ApiError, isOfflineError } from "@/lib/api/client";

// The app's React Query client, as in apps/frontend components/providers/app-providers.tsx, plus a copy on the
// device (IndexedDB): the app opens with the trees seen before, also offline. The website's service worker does
// this there.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !isOfflineError(error) && !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

const STORE_KEY = "sakdulur-queries";

export const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  key: STORE_KEY,
  throttleTime: 2_000,
});

export const persistOptions = {
  persister,
  maxAge: 30 * 24 * 60 * 60_000,
  // A new app version may change what the screens expect: start over.
  buster: __APP_RELEASE__,
  dehydrateOptions: {
    // The account and its trees (what the website keeps offline), nothing else (sessions, the assistant, admin).
    shouldDehydrateQuery: (q: { queryKey: readonly unknown[]; state: { status: string } }) =>
      q.state.status === "success" && (q.queryKey[0] === "me" || q.queryKey[0] === "tree"),
  },
};

/** Forgets everything kept on the device (sign-out, another account). */
export async function clearQueries() {
  queryClient.clear();
  await del(STORE_KEY);
}
