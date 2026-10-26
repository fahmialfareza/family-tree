import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/server/env";
import { setBindingCookie } from "@/lib/server/session";
import { safeNext } from "@/lib/safe-next";

// Starts Sign in with Apple on the web, like Google (session/google/start): a random binding value stays in
// this browser's httpOnly cookie and the API only sees its hash. ?client=app (apps without the native Apple
// sheet): answers {url}; the app opens it in the system browser and Apple's answer returns via its URL scheme.
export function GET(req: NextRequest) {
  const binding = crypto.randomUUID() + crypto.randomUUID();
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const app = req.nextUrl.searchParams.get("client") === "app";
  const target = new URL(`${serverEnv.backendPublicUrl}/api/auth/apple/start`);
  target.searchParams.set("binding", binding);
  target.searchParams.set("next", next);
  if (app) target.searchParams.set("client", "app");
  const res = app ? NextResponse.json({ url: target.toString() }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.redirect(target);
  setBindingCookie(res.cookies, binding);
  return res;
}
