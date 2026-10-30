// Replaces apps/frontend/src/lib/offline.ts in the app (vite.config.ts). The online/offline state is the website's;
// the offline copy is different: the app's screens are on the device already, and the data the website's service
// worker keeps is kept by React Query in IndexedDB (query-client.ts).
import { keys } from "@/lib/api/hooks";
import { api } from "@/lib/api/client";
import { clearQueries, queryClient } from "../query-client";

export { isOffline, noteNetworkFailure, noteResponse, useOffline, useOnlineRole } from "@frontend/lib/offline";

/** No service worker in the app. */
export function registerServiceWorker() {}

const t = (treeId: string) => `/api/trees/${encodeURIComponent(treeId)}`;

/** Loads a tree's data into the device copy (what its tabs need offline), unless it is fresh. */
function keepTree(treeId: string, staleTime: number) {
  for (const [key, path] of [
    [keys.tree(treeId), t(treeId)],
    [keys.graph(treeId), `${t(treeId)}/graph`],
    [keys.families(treeId), `${t(treeId)}/families`],
    [keys.members(treeId), `${t(treeId)}/members`],
  ] as const) {
    void queryClient.prefetchQuery({ queryKey: key, queryFn: () => api.get(path), staleTime });
  }
}

/** Same calls as the website's app shell; here each entry is a tree (treeOfflineUrls) whose data is kept. */
export function treeOfflineUrls(treeId: string, withData: boolean) {
  return withData ? [`tree:${treeId}`] : [];
}

export function savePagesForOffline(urls: string[], maxAgeMs = 10 * 60_000) {
  if (!navigator.onLine) return;
  for (const u of urls) if (u.startsWith("tree:")) keepTree(u.slice(5), maxAgeMs);
}

const MAX_OTHER_TREES = 10;

/** The user's other trees (switching trees offline), refreshed every 6 hours. */
export function saveOtherTreesForOffline(treeIds: string[]) {
  if (!navigator.onLine) return;
  for (const id of treeIds.slice(0, MAX_OTHER_TREES)) keepTree(id, 6 * 60 * 60_000);
}

const USER_KEY = "ft-offline-user";

/** Deletes everything kept on this device (sign-out, or another account signed in). */
export async function clearOfflineData() {
  try {
    localStorage.removeItem(USER_KEY);
    await clearQueries();
  } catch {
    // storage unavailable: nothing was kept
  }
}

/** The device copy belongs to one account: when a different one signs in, start over. */
export async function claimOfflineData() {
  if (!navigator.onLine) return;
  try {
    const me = await api.get<{ user: { _id: string } }>("/api/me");
    const previous = localStorage.getItem(USER_KEY);
    if (previous && previous !== me.user._id) await clearOfflineData();
    localStorage.setItem(USER_KEY, me.user._id);
  } catch {
    // ignore
  }
}

/** The app moves between its screens without the network: nothing to do (the website loads whole pages offline). */
export function useOfflineLinks() {}

export function openAppPage(router: { push: (href: string) => void }, href: string) {
  router.push(href);
}
