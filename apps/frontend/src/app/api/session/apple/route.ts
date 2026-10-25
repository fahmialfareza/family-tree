import { NextRequest } from "next/server";
import { isPair, relayAuth } from "@/lib/server/session-route";

// {identityToken, nonce, authorizationCode?, name?} from native Sign in with Apple -> sets the session cookies.
export function POST(req: NextRequest) {
  return relayAuth(req, "/api/auth/apple", (data) => (isPair(data) ? data : undefined));
}
