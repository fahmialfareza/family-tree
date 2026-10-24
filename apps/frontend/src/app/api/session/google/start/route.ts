import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/server/env";
import { setBindingCookie } from "@/lib/server/session";
import { safeNext } from "@/lib/safe-next";

// Starts Google sign-in. A random binding value stays in this browser's httpOnly cookie; the API only sees
// its hash, and the one-time login code it returns is useless without the original value.
export function GET(req: NextRequest) {
  const binding = crypto.randomUUID() + crypto.randomUUID();
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const target = new URL(`${serverEnv.backendPublicUrl}/api/auth/google/start`);
  target.searchParams.set("binding", binding);
  target.searchParams.set("next", next);
  const res = NextResponse.redirect(target);
  setBindingCookie(res.cookies, binding);
  return res;
}
