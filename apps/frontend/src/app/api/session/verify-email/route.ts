import { NextRequest } from "next/server";
import { isPair, relayAuth } from "@/lib/server/session-route";

// {token, password?}. Completing a signup returns a session (stored in cookies); confirming an email
// change needs the current session, which is forwarded when present.
export function POST(req: NextRequest) {
  return relayAuth(req, "/api/auth/verify-email", (data) => (isPair(data.session) ? data.session : undefined), {
    withAccess: true,
  });
}
