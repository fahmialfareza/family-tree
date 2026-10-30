// Browser-side API client. Requests go to this app's /api/proxy/* route, which attaches the session
// from httpOnly cookies and refreshes it when needed; page code never sees a token.
// The desktop and mobile apps (apps/native) replace this module with one that calls the API directly: keep its
// exports in step with apps/native/src/native/api-client.ts.
//
// Offline (see lib/offline.ts and public/sw.js) reads come from the saved copy; changes need the network, so they
// fail at once with status 0 and an "offline" message instead of a bare network error.

import { clearOfflineData, isOffline, noteNetworkFailure, noteResponse } from "@/lib/offline";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

/** Status of an ApiError for a request that couldn't reach the server (offline). */
export const OFFLINE = 0;
export const isOfflineError = (err: unknown) => err instanceof ApiError && err.status === OFFLINE;

// Shown by toasts and forms; the UI translates it via isOfflineError where it says more.
const OFFLINE_MESSAGE = "You're offline. Connect to the internet to make changes.";

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (method !== "GET" && isOffline()) throw new ApiError(OFFLINE, OFFLINE_MESSAGE);
  let res: Response;
  try {
    res = await fetch(`/api/proxy${path}`, {
      method,
      headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    noteNetworkFailure();
    throw new ApiError(OFFLINE, OFFLINE_MESSAGE);
  }
  noteResponse(res);
  const json = await res.json().catch(() => null);
  if (res.status === 503 && json?.message === "offline") throw new ApiError(OFFLINE, OFFLINE_MESSAGE);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      const next = window.location.pathname + window.location.search;
      // The session is gone: so is this account's offline copy.
      void clearOfflineData().finally(() => window.location.assign(`/auth/login?next=${encodeURIComponent(next)}`));
    }
    throw new ApiError(res.status, json?.message ?? res.statusText, json);
  }
  return json?.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body),
  put: <T>(path: string, body?: Body) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: Body) => request<T>("PATCH", path, body),
  delete: <T>(path: string, body?: Body) => request<T>("DELETE", path, body),
};

/** Session endpoints handled by this app (they set/clear the cookies). Signing in starts the offline copy over. */
export async function sessionRequest<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/session/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, json?.message ?? res.statusText, json);
  }
  await clearOfflineData();
  return json?.data as T;
}

/** A raw API response (file downloads: exports, "download my data"). */
export function apiFetch(path: string): Promise<Response> {
  return fetch(`/api/proxy${path}`, { credentials: "same-origin" });
}

/** Ends this device's session (clears the session cookies). */
export async function endSession() {
  await fetch("/api/session/logout", { method: "POST" });
}

/** Saves the UI language (cookie, and the account when signed in). */
export async function saveLocale(locale: string) {
  await fetch("/api/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) });
}

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError || error instanceof Error) return error.message || fallback;
  return fallback;
}
