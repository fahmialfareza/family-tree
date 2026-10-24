// Browser-side API client. Requests go to this app's /api/proxy/* route, which attaches the session
// from httpOnly cookies and refreshes it when needed; page code never sees a token.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(`/api/proxy${path}`, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      const next = window.location.pathname + window.location.search;
      window.location.assign(`/auth/login?next=${encodeURIComponent(next)}`);
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

/** Session endpoints handled by this app (they set/clear the cookies). */
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
  return json?.data as T;
}

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError || error instanceof Error) return error.message || fallback;
  return fallback;
}
