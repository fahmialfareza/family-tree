import { NextRequest } from "next/server";
import { isPair, relayAuth } from "@/lib/server/session-route";

// {identifier, password} -> sets the session cookies and returns {user}.
export function POST(req: NextRequest) {
  return relayAuth(req, "/api/auth/login", (data) => (isPair(data) ? data : undefined));
}
