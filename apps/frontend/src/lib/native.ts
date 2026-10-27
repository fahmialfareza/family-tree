"use client";

import { useSyncExternalStore } from "react";
import { type AppClient, CLIENT_COOKIE, isAppClient } from "@/lib/app-client";

/*
 * The desktop and mobile apps (apps/native, Tauri) show this same website in a native window. The app marks
 * itself with the CLIENT_COOKIE (lib/app-client.ts). Its native work is done by the app itself, not through
 * an API the page calls: it opens other sites (Google sign-in, WhatsApp, mailto) in the system browser when
 * the page navigates there, saves downloads to the Downloads folder, and loads sign-in deep links back into
 * the window. Everything here behaves as before on the web.
 */

export type Platform = "web" | AppClient;

export function nativePlatform(): Platform {
  if (typeof document === "undefined") return "web";
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CLIENT_COOKIE}=([^;]+)`));
  return match && isAppClient(match[1]) ? match[1] : "web";
}

const noopSubscribe = () => () => {};

/** "web" during server rendering and hydration, then the real platform. */
export function useNativePlatform(): Platform {
  return useSyncExternalStore(noopSubscribe, nativePlatform, () => "web");
}

function randomHex(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Google (and Apple, where the app has no native Apple sheet) sign-in runs in the system browser: Google refuses
 * app windows, and navigating there is enough, because the app sends other sites to the browser. The binding
 * cookie is set here, in the app; the API sends the one-time code back through the app's URL scheme and the app
 * loads /auth/<provider>/complete, where that cookie is read.
 */
export async function startBrowserSignIn(provider: "google" | "apple", next: string) {
  const res = await fetch(`/api/session/${provider}/start?client=app&next=${encodeURIComponent(next)}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  const body = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!res.ok || !body?.url) throw new Error("Sign-in is unavailable");
  window.location.assign(body.url);
}

type AppleAuthorization = { identityToken: string; authorizationCode?: string; givenName?: string; familyName?: string };
type TauriInternals = { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };

/** Platforms whose app shows Apple's own sign-in sheet (the sign-in-with-apple plugin in apps/native). */
export function hasNativeAppleSignIn(platform: Platform) {
  return platform === "ios" || platform === "macos";
}

/** Native Sign in with Apple (iPhone and Mac apps, through the app's plugin). Resolves once the session cookies are set. */
export async function signInWithAppleNative() {
  const tauri = tauriInternals();
  if (!tauri) throw new Error("Sign in with Apple is unavailable");
  const nonce = randomHex();
  // The app hashes the nonce for Apple; the API checks the token against this raw value.
  const response = await tauri.invoke<AppleAuthorization>("plugin:sakdulur|apple_authorize", { nonce });
  const name = [response.givenName, response.familyName].filter(Boolean).join(" ");
  const res = await fetch("/api/session/apple", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ identityToken: response.identityToken, authorizationCode: response.authorizationCode, nonce, name }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message || "Sign in with Apple failed");
  }
}

/** The user closed Apple's sheet: not an error worth showing. */
export function isUserCancel(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /cancel|1001/i.test(msg);
}

/** The system share sheet in the app (where the window supports it); the clipboard otherwise. */
export async function shareLink(opts: { url: string; title?: string; text?: string }): Promise<"shared" | "copied"> {
  if (nativePlatform() !== "web" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url: opts.url, title: opts.title, text: opts.text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }
  await navigator.clipboard.writeText(opts.url);
  return "copied";
}

function tauriInternals() {
  return (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Android web views ignore downloads, so the Android app saves files natively (plugin save_file, to the phone's
 * Downloads) and reports them with the same "sakdulur:download" events the other apps send (download toasts).
 */
async function saveFileAndroid(name: string, blob: Blob) {
  const id = `android-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const report = (state: "started" | "finished" | "failed", file: string) =>
    window.dispatchEvent(new CustomEvent("sakdulur:download", { detail: { state, id, name: file } }));
  report("started", name);
  try {
    const tauri = tauriInternals();
    if (!tauri) throw new Error("unavailable");
    const saved = await tauri.invoke<{ name: string }>("plugin:sakdulur|save_file", {
      name,
      mime: blob.type || "application/octet-stream",
      data: await blobToBase64(blob),
    });
    report("finished", saved.name);
  } catch {
    report("failed", name);
  }
}

/** Downloads a same-site file link (e.g. "download my data") inside the Android app. */
export async function downloadLinkAndroid(href: string, name: string) {
  const res = await fetch(href, { credentials: "same-origin" });
  if (!res.ok) throw new Error(res.statusText);
  await saveFileAndroid(name, await res.blob());
}

/** Saves a file through the browser's download (desktop and iPhone apps save it natively; Android via the plugin). */
export async function saveFile(name: string, data: Blob | string) {
  if (nativePlatform() === "android") {
    return saveFileAndroid(name, typeof data === "string" ? await (await fetch(data)).blob() : data);
  }
  const href = typeof data === "string" ? data : URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  if (typeof data !== "string") setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
