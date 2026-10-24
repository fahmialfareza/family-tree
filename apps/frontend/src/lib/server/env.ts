import "server-only";

// Server-side configuration. The browser never talks to the Go API directly: every call goes through
// this app's route handlers (BFF), which hold the session in httpOnly cookies.

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value.replace(/\/+$/, "");
}

/**
 * Headers that let the API see the visitor's IP. The API only trusts X-Client-IP when X-BFF-Secret matches
 * its BFF_SHARED_SECRET, so the value cannot be spoofed by browsers.
 */
export function clientIpHeaders(req?: { headers: Headers }): Record<string, string> {
  const secret = process.env.BFF_SHARED_SECRET;
  const ip = req?.headers.get("cf-connecting-ip") ?? req?.headers.get("x-real-ip") ?? req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return secret && ip ? { "X-BFF-Secret": secret, "X-Client-IP": ip } : {};
}

export const serverEnv = {
  /** Go API base URL as reachable from this server (may be an internal address). */
  get backendUrl() {
    return required("BACKEND_URL", process.env.NODE_ENV === "production" ? undefined : "http://localhost:4000");
  },
  /** Go API base URL as reachable from browsers (Google sign-in redirects there). */
  get backendPublicUrl() {
    return (process.env.BACKEND_PUBLIC_URL || this.backendUrl).replace(/\/+$/, "");
  },
  /** This app's public origin, used for same-origin checks. */
  get appUrl() {
    return required("NEXT_PUBLIC_APP_URL", process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  },
  get secureCookies() {
    return this.appUrl.startsWith("https://");
  },
};
