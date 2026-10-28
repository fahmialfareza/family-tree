import { useSyncExternalStore } from "react";

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

/** The offline copy belongs to one account: when a different one signs in, start over. */
export function claimOfflineData(userId: string) {
  try {
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
