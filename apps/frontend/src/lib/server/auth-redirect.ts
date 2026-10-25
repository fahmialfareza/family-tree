import "server-only";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { getAccessToken } from "./session";

/** Auth pages bounce signed-in visitors to where they were going. */
export async function redirectIfSignedIn(next?: string | string[]) {
  if (await getAccessToken()) {
    redirect(safeNext(typeof next === "string" ? next : undefined, "/app"));
  }
}

/** Which social sign-in providers the API has configured. */
export async function authProviders(): Promise<{ google: boolean; apple: boolean }> {
  const { serverEnv } = await import("./env");
  try {
    const res = await fetch(`${serverEnv.backendUrl}/api/auth/providers`, { next: { revalidate: 300 } });
    const body = await res.json();
    return { google: !!body?.data?.google, apple: !!body?.data?.apple };
  } catch {
    return { google: false, apple: false };
  }
}
