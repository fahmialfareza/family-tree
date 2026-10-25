"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import { nativePlatform, useNativePlatform } from "@/lib/native";

// Paths the API may send back through the app's URL scheme after Google sign-in.
const SCHEME_PATHS = new Set(["/auth/google/complete", "/auth/login"]);

/**
 * Glue for the iOS/Android app (apps/mobile). Renders nothing and does nothing on the website.
 * - marks <html> with native-app classes for CSS
 * - matches the status bar to the theme and hides the splash screen once the page is up
 * - routes deep links: the app's URL scheme (Google sign-in) and universal/app links to this site
 * - Android back button: closes an open dialog, otherwise goes back, otherwise leaves the app
 */
export function NativeBridge() {
  const platform = useNativePlatform();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (platform === "web") return;
    const root = document.documentElement;
    root.classList.add("native-app", `native-${platform}`);
    import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide()).catch(() => {});

    const cleanups: Array<() => void> = [];
    import("@capacitor/app").then(({ App }) => {
      App.addListener("appUrlOpen", async ({ url }) => {
        const target = deepLinkPath(url);
        if (!target) return;
        if (!/^https?:/i.test(url)) {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close().catch(() => {});
        }
        window.location.assign(target);
      }).then((h) => cleanups.push(() => h.remove()));

      if (nativePlatform() === "android") {
        App.addListener("backButton", ({ canGoBack }) => {
          const open = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]');
          if (open) {
            // Radix layers close on Escape from the document, topmost first.
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          } else if (canGoBack) {
            window.history.back();
          } else {
            App.exitApp();
          }
        }).then((h) => cleanups.push(() => h.remove()));
      }
    });
    return () => {
      root.classList.remove("native-app", `native-${platform}`);
      cleanups.forEach((fn) => fn());
    };
  }, [platform]);

  useEffect(() => {
    if (platform === "web" || !resolvedTheme) return;
    import("@capacitor/core")
      .then(({ SystemBars, SystemBarsStyle }) =>
        // Dark = light text, for the dark theme.
        SystemBars.setStyle({ style: resolvedTheme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light }),
      )
      .catch(() => {});
  }, [platform, resolvedTheme]);

  return null;
}

/** Maps a deep link to a local path, or null if it is not ours. */
function deepLinkPath(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol === "https:" || url.protocol === "http:") {
    // Universal links / App Links: only for this site.
    return url.host === window.location.host ? url.pathname + url.search : null;
  }
  // Custom scheme: scheme://auth/google/complete?code=... -> host "auth", path "/google/complete".
  const path = `/${url.host}${url.pathname}`.replace(/\/+$/, "");
  return SCHEME_PATHS.has(path) ? path + url.search : null;
}
