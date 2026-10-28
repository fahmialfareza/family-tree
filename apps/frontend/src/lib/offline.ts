import { useEffect, useSyncExternalStore } from "react";

// Read-only offline mode (public/sw.js keeps the last copy of what was opened). This module tracks whether the app
// is offline — no network, or the data on screen came from that copy — and clears the copy on sign-out.

type State = { offline: boolean; savedAt: string | null };

let fromCopy = false; // the last API answer came from the offline copy
let savedAt: string | null = null;
let state: State = { offline: false, savedAt: null };
const listeners = new Set<() => void>();

function update() {
  const offline = (typeof navigator !== "undefined" && !navigator.onLine) || fromCopy;
  if (offline !== state.offline || savedAt !== state.savedAt) {
    state = { offline, savedAt };
    listeners.forEach((l) => l());
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
  return () => {
    listeners.delete(listener);
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}

const serverState: State = { offline: false, savedAt: null };

/** Offline (no network, or showing saved data), and when that data was saved. */
export function useOffline(): State {
  return useSyncExternalStore(subscribe, () => state, () => serverState);
}

export const isOffline = () => state.offline || (typeof navigator !== "undefined" && !navigator.onLine);

/** Called for every API answer: X-Sakdulur-Offline marks the saved copy and carries when it was saved. */
export function noteResponse(res: Response) {
  const mark = res.headers.get("X-Sakdulur-Offline");
  fromCopy = mark !== null;
  if (mark) savedAt = !savedAt || mark < savedAt ? mark : savedAt; // the oldest data on screen
  if (!fromCopy) savedAt = null;
  update();
}

/** The request never reached the server. */
export function noteNetworkFailure() {
  fromCopy = true;
  update();
}

// Service workers in development would keep stale code between reloads; on for production builds, or with
// NEXT_PUBLIC_ENABLE_SW=1 to try it locally.
const SW_ENABLED = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";

export function registerServiceWorker() {
  if (!SW_ENABLED || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => console.warn("offline copy unavailable", err));
}

/**
 * Asks the service worker to keep a copy of these app pages (the current one first). Tab switches fetch only parts
 * of a page, so pages reached that way would otherwise have no offline copy.
 */
export function savePagesForOffline(urls: string[], maxAgeMs = 10 * 60_000, current = true) {
  if (typeof navigator === "undefined" || !navigator.onLine || urls.length === 0) return;
  // The code this page has loaded, including parts loaded on demand (not named in its HTML), so it can run offline.
  const assets = current
    ? performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.includes("/_next/static/"))
    : undefined;
  navigator.serviceWorker?.controller?.postMessage({ type: "warm", urls, maxAge: maxAgeMs, current, assets });
}

// The tree's tabs, and its offline page (shown, with the app around it, for pages that weren't saved).
const TREE_TABS = ["", "/people", "/families", "/members", "/offline"];
const MAX_OTHER_TREES = 10;

/** A tree's pages, and the data its pages need offline (the tree, families, members). */
export function treeOfflineUrls(treeId: string, withData: boolean) {
  const pages = TREE_TABS.map((p) => `/app/t/${treeId}${p}`);
  const api = `/api/proxy/api/trees/${encodeURIComponent(treeId)}`;
  return withData ? [...pages, `${api}/graph`, `${api}/families`, `${api}/members`] : pages;
}

/** The user's other trees (switching trees offline), refreshed every 6 hours. */
export function saveOtherTreesForOffline(treeIds: string[]) {
  savePagesForOffline(treeIds.slice(0, MAX_OTHER_TREES).flatMap((id) => treeOfflineUrls(id, true)), 6 * 60 * 60_000, false);
}

const USER_KEY = "ft-offline-user";

/** Deletes everything kept for offline use on this device (sign-out, or another account signed in). */
export async function clearOfflineData() {
  try {
    localStorage.removeItem(USER_KEY);
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("sakdulur-")).map((n) => caches.delete(n)));
    }
  } catch {
    // Storage unavailable (private mode): nothing was kept.
  }
}

/**
 * The offline copy belongs to one account: when a different one signs in, start over. The account is asked of the
 * server (public/sw.js never keeps /api/me), not taken from the page, which may itself be a saved copy.
 */
export async function claimOfflineData() {
  if (isOffline()) return;
  try {
    const res = await fetch("/api/proxy/api/me", { credentials: "same-origin", cache: "no-store" });
    const userId = res.ok && !res.headers.has("X-Sakdulur-Offline") ? (await res.json())?.data?.user?._id : null;
    if (typeof userId !== "string" || !userId) return;
    const previous = localStorage.getItem(USER_KEY);
    if (previous && previous !== userId) void clearOfflineData();
    localStorage.setItem(USER_KEY, userId);
  } catch {
    // ignore
  }
}

/** The tree role for what the UI offers: read-only ("viewer") while offline, since changes need the network. */
export function useOnlineRole<R extends string>(role: R): R | "viewer" {
  return useOffline().offline ? "viewer" : role;
}

const isAppPath = (url: URL) => url.origin === window.location.origin && (url.pathname === "/app" || url.pathname.startsWith("/app/"));

/**
 * Moving between app pages normally fetches only page parts from the server; offline that request can't succeed and
 * Next.js keeps waiting. Offline, app links therefore load the whole page, which the service worker answers from its
 * copy.
 */
export function useOfflineLinks() {
  useEffect(() => {
    // Capture phase: before next/link, which leaves a click alone once it is defaultPrevented.
    const onClick = (e: MouseEvent) => {
      if (!isOffline() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (!isAppPath(url)) return;
      e.preventDefault();
      window.location.assign(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

/** router.push, or a whole page load while offline (see useOfflineLinks). */
export function openAppPage(router: { push: (href: string) => void }, href: string) {
  if (isOffline()) window.location.assign(href);
  else router.push(href);
}
