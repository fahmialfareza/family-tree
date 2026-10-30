// Replaces apps/frontend/src/lib/native.ts in the app (vite.config.ts): the same helpers, except those that went
// through the website's session routes, which call the API here instead.
import { sessionRequest } from "@/lib/api/client";
import { API_URL } from "../env";

export * from "@frontend/lib/native";

/** Where a browser sign-in's binding waits for the deep link back (routes/auth-complete.tsx). */
export const BINDING_KEY = "sakdulur-oauth-binding";

function randomHex(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Google (and Apple outside iPhone and Mac) sign-in in the system browser: the app sends any other site there
 * (src-tauri on_navigation). The API returns a one-time code through the app's URL scheme to /auth/<p>/complete,
 * where it is exchanged together with this binding.
 */
export async function startBrowserSignIn(provider: "google" | "apple", next: string) {
  const binding = randomHex();
  localStorage.setItem(BINDING_KEY, binding);
  const q = new URLSearchParams({ binding, next, client: "app" });
  window.location.assign(`${API_URL}/api/auth/${provider}/start?${q.toString()}`);
}

type AppleAuthorization = { identityToken: string; authorizationCode?: string; givenName?: string; familyName?: string };
type TauriInternals = { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };

/** Native Sign in with Apple (iPhone and Mac apps, through the app's plugin). Resolves once the session is saved. */
export async function signInWithAppleNative() {
  const tauri = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  if (!tauri) throw new Error("Sign in with Apple is unavailable");
  const nonce = randomHex();
  // The app hashes the nonce for Apple; the API checks the token against this raw value.
  const response = await tauri.invoke<AppleAuthorization>("plugin:sakdulur|apple_authorize", { nonce });
  const name = [response.givenName, response.familyName].filter(Boolean).join(" ");
  await sessionRequest("apple", { identityToken: response.identityToken, authorizationCode: response.authorizationCode, nonce, name });
}
