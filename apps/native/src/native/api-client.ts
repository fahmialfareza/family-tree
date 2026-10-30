// The app's API client: replaces apps/frontend/src/lib/api/client.ts (same exports, see vite.config.ts). The
// website's requests go through its server (/api/proxy), which keeps the session in cookies; the app calls the API
// directly with the tokens in native/session.ts, refreshing them itself.

import { clearOfflineData, isOffline, noteNetworkFailure, noteResponse } from "@/lib/offline";
import { API_URL } from "../env";
import { currentLocale, LOCALE_KEY } from "../locale";
import { accessExpired, clearSession, getSession, isTokenPair, setSession } from "./session";
import type { TokenPair } from "@/lib/api/types";

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

const OFFLINE_MESSAGE = "You're offline. Connect to the internet to make changes.";

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

let refreshing: Promise<boolean> | null = null;

/** Exchanges the refresh token for a new pair; false when the session is gone. Concurrent callers share one call. */
function refresh(): Promise<boolean> {
  const refreshToken = getSession()?.refreshToken;
  if (!refreshToken) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && isTokenPair(json?.data)) {
        setSession(json.data);
        return true;
      }
      // Only a definite "no" ends the session; a server error keeps it for the next try.
      if (res.status === 400 || res.status === 401) clearSession();
      return false;
    } catch {
      return false; // offline: keep the session
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function headers(body: Body, auth: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json", "X-Locale": currentLocale() };
  if (body !== undefined && !(body instanceof FormData)) h["Content-Type"] = "application/json";
  const s = getSession();
  if (auth && s) h.Authorization = `Bearer ${s.accessToken}`;
  return h;
}

/** A request with the session: refreshed first when the access token expired, and once more on a 401. */
async function send(method: string, path: string, body?: Body): Promise<Response> {
  const s = getSession();
  if (s && accessExpired(s)) await refresh();
  const init = () => ({
    method,
    headers: headers(body, true),
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  let res = await fetch(`${API_URL}${path}`, init());
  if (res.status === 401 && getSession() && !path.startsWith("/api/auth/login") && (await refresh())) {
    res = await fetch(`${API_URL}${path}`, init());
  }
  return res;
}

/** The session is gone: back to the welcome screen (app clients see it instead of the website's sign-in page). */
function signedOut() {
  clearSession();
  const next = window.location.pathname + window.location.search;
  void clearOfflineData().finally(() => window.location.assign(`/welcome?next=${encodeURIComponent(next)}`));
}

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  if (method !== "GET" && isOffline()) throw new ApiError(OFFLINE, OFFLINE_MESSAGE);
  let res: Response;
  try {
    res = await send(method, path, body);
  } catch {
    noteNetworkFailure();
    throw new ApiError(OFFLINE, OFFLINE_MESSAGE);
  }
  noteResponse(res);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth/")) signedOut();
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

/** A raw API response (file downloads: exports, "download my data"). */
export function apiFetch(path: string): Promise<Response> {
  return send("GET", path);
}

// The website's session routes (apps/frontend app/api/session/*) and the API endpoints they relay to. The answer's
// session is stored here instead of in cookies.
const SESSION_PATHS: Record<string, { path: string; session: (data: Record<string, unknown>) => unknown }> = {
  login: { path: "/api/auth/login", session: (d) => d },
  signup: { path: "/api/auth/signup", session: () => undefined },
  "verify-email": { path: "/api/auth/verify-email", session: (d) => d.session },
  apple: { path: "/api/auth/apple", session: (d) => d },
};

/** Sign-in and sign-up endpoints. Signing in starts the offline copy over. */
export async function sessionRequest<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const route = SESSION_PATHS[path];
  if (!route) throw new Error(`unknown session request: ${path}`);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${route.path}`, { method: "POST", headers: headers(body ?? {}, true), body: JSON.stringify(body ?? {}) });
  } catch {
    throw new ApiError(OFFLINE, OFFLINE_MESSAGE);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.message ?? res.statusText, json);
  const data = (json?.data ?? {}) as Record<string, unknown>;
  const session = route.session(data);
  if (isTokenPair(session)) {
    await startSession(session);
    return { ...data, session: undefined, accessToken: undefined, refreshToken: undefined, user: session.user } as T;
  }
  await clearOfflineData();
  return data as T;
}

/** A new session: saved, in the account's language (the website copies it into its language cookie at sign-in). */
async function startSession(pair: TokenPair) {
  setSession(pair);
  await clearOfflineData();
  const locale = pair.user?.locale;
  if (locale && locale !== currentLocale()) {
    localStorage.setItem(LOCALE_KEY, locale);
    window.dispatchEvent(new CustomEvent("sakdulur:locale", { detail: locale }));
  }
}

/** Signs this device out at the API (best effort, like the website's logout route) and forgets the session. */
export async function endSession() {
  if (getSession()) {
    try {
      await send("POST", "/api/auth/logout").catch(() => undefined);
    } finally {
      clearSession();
    }
  }
}

/** Saves the UI language: on this device, and on the account when signed in (the website's /api/locale). */
export async function saveLocale(locale: string) {
  localStorage.setItem(LOCALE_KEY, locale);
  window.dispatchEvent(new CustomEvent("sakdulur:locale", { detail: locale }));
  if (getSession()) await api.patch("/api/me", { locale }).catch(() => undefined);
}

/** Finishes a sign-in in the system browser (Google, or Apple outside iPhone and Mac): code + this app's binding. */
export async function exchangeSignInCode(code: string, binding: string) {
  const res = await fetch(`${API_URL}/api/auth/google/exchange`, {
    method: "POST",
    headers: headers({}, false),
    body: JSON.stringify({ code, binding }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !isTokenPair(json?.data)) throw new ApiError(res.status, json?.message ?? res.statusText, json);
  await startSession(json.data);
  return json.data;
}

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError || error instanceof Error) return error.message || fallback;
  return fallback;
}
