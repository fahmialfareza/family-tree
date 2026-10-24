import "server-only";

import { serverEnv } from "./env";
import { getAccessToken } from "./session";

export class BackendError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the Go API from a server component with the current session. Throws BackendError on failure. */
export async function backendGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${serverEnv.backendUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new BackendError(res.status, body?.message ?? res.statusText);
  }
  return body?.data as T;
}
