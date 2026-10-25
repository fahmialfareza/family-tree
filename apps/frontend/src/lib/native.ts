"use client";

import { useSyncExternalStore } from "react";

/*
 * The iOS/Android apps (apps/mobile, Capacitor) load this same website in a native WebView and inject
 * window.Capacitor. Everything here is a no-op on the web, and plugins are imported lazily so the website
 * bundle does not grow.
 */

export type Platform = "web" | "ios" | "android";

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

export function nativePlatform(): Platform {
  if (typeof window === "undefined") return "web";
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.()) return "web";
  const p = cap.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
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

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Google refuses sign-in inside embedded WebViews, so the app opens it in the system browser. The binding
 * cookie is set here, in the WebView; the API sends the one-time code back through the app's URL scheme
 * and NativeBridge finishes on /auth/google/complete, where that cookie is read.
 */
export async function startGoogleSignInNative(next: string) {
  const res = await fetch(`/api/session/google/start?client=app&next=${encodeURIComponent(next)}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  const body = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!res.ok || !body?.url) throw new Error("Google sign-in is unavailable");
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: body.url, presentationStyle: "popover" });
}

/** Native Sign in with Apple (iOS). Resolves once the session cookies are set. */
export async function signInWithAppleNative() {
  const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
  const nonce = randomHex();
  // clientId/redirectURI are only used by the web implementation; iOS uses the app's bundle id.
  const { response } = await SignInWithApple.authorize({
    clientId: "native",
    redirectURI: window.location.origin,
    scopes: "email name",
    nonce: await sha256Hex(nonce),
  });
  const name = [response.givenName, response.familyName].filter(Boolean).join(" ");
  const res = await fetch("/api/session/apple", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      identityToken: response.identityToken,
      authorizationCode: response.authorizationCode,
      nonce,
      name,
    }),
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

/** Native share sheet in the app; clipboard on the web. Returns what happened. */
export async function shareLink(opts: { url: string; title?: string; text?: string }): Promise<"shared" | "copied"> {
  if (nativePlatform() !== "web") {
    const { Share } = await import("@capacitor/share");
    await Share.share({ url: opts.url, title: opts.title, text: opts.text, dialogTitle: opts.title });
    return "shared";
  }
  await navigator.clipboard.writeText(opts.url);
  return "copied";
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
 * Saves a file. WebViews ignore <a download>, so in the app the file is written to the cache and handed
 * to the share sheet ("Save to Files", Drive, email...).
 */
export async function saveFile(name: string, data: Blob | string) {
  if (nativePlatform() === "web") {
    const href = typeof data === "string" ? data : URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
    if (typeof data !== "string") setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return;
  }
  const base64 = typeof data === "string" ? data.slice(data.indexOf(",") + 1) : await blobToBase64(data);
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  const file = await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache });
  await Share.share({ files: [file.uri], title: name, dialogTitle: name });
}

/** onClick for <a href download> links: lets the browser handle them, routes them through saveFile in the app. */
export function nativeDownloadHandler(url: string, name: string, onError?: (err: unknown) => void) {
  return async (e: React.MouseEvent) => {
    if (nativePlatform() === "web") return;
    e.preventDefault();
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(res.statusText);
      await saveFile(name, await res.blob());
    } catch (err) {
      onError?.(err);
    }
  };
}
