import { NextRequest } from "next/server";
import { relayAuth } from "@/lib/server/session-route";

// {name, email, password} -> {user, verificationRequired}. No session until the email is verified.
export function POST(req: NextRequest) {
  return relayAuth(req, "/api/auth/signup", () => undefined);
}
