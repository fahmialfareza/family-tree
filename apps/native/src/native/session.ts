import type { TokenPair } from "@/lib/api/types";

// The app's session: the API's access and refresh tokens (the website keeps them in httpOnly cookies instead).
// Stored in the app's own storage, which only this app can read.
const KEY = "sakdulur-session";

type Stored = { accessToken: string; accessTokenExpiresAt: string; refreshToken?: string };

export function getSession(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

export const hasSession = () => !!getSession();

/** Saves a new pair. A refresh answered within the API's grace window has no new refresh token: keep the old one. */
export function setSession(pair: Pick<TokenPair, "accessToken" | "accessTokenExpiresAt" | "refreshToken">) {
  const refreshToken = pair.refreshToken ?? getSession()?.refreshToken;
  localStorage.setItem(KEY, JSON.stringify({ accessToken: pair.accessToken, accessTokenExpiresAt: pair.accessTokenExpiresAt, refreshToken }));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

/** The access token is about to expire (30 s early, like the website's cookie). */
export function accessExpired(s: Stored) {
  const at = Date.parse(s.accessTokenExpiresAt);
  return !Number.isFinite(at) || at - 30_000 < Date.now();
}

export function isTokenPair(value: unknown): value is TokenPair {
  return !!value && typeof value === "object" && typeof (value as TokenPair).accessToken === "string";
}
