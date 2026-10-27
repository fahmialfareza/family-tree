"use client";

import { useEffect } from "react";
import { useNativePlatform } from "@/lib/native";

/**
 * Glue for the desktop/mobile app (apps/native). Does nothing on the website.
 * - marks <html> with native-app classes for CSS (app-like touches: no text selection on chrome, no bounce)
 * - Android back button: the app sends a "sakdulur:back" event; close an open dialog or menu first,
 *   otherwise go back
 * - links to the site's public pages (Privacy, Terms, landing) open over the app instead of replacing it: they
 *   become new-window requests, which the app shows in an in-app browser sheet (iPhone) or the system browser
 */
// A hook (called by Providers), not a component rendered next to the page: a sibling there shifted React's
// useId paths when its code loaded after hydration began, so menu ids differed from the server HTML.
/** The site's public pages, as the app treats them (apps/native src/lib.rs is_public_page). */
const PUBLIC_PAGE = /^(\/(en|id))?(\/(privacy|terms))?\/?$/;

export function useNativeBridge() {
  const platform = useNativePlatform();

  useEffect(() => {
    if (platform === "web") return;
    const root = document.documentElement;
    root.classList.add("native-app", `native-${platform}`);

    const onBack = () => {
      const open = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]');
      if (open) {
        // Radix layers close on Escape from the document, topmost first.
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } else {
        window.history.back();
      }
    };
    // Capture phase: runs before next/link's own click handling, which then sees defaultPrevented and stays put.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !PUBLIC_PAGE.test(url.pathname)) return;
      e.preventDefault();
      window.open(url.href, "_blank");
    };
    window.addEventListener("sakdulur:back", onBack);
    document.addEventListener("click", onClick, true);
    return () => {
      root.classList.remove("native-app", `native-${platform}`);
      window.removeEventListener("sakdulur:back", onBack);
      document.removeEventListener("click", onClick, true);
    };
  }, [platform]);
}
