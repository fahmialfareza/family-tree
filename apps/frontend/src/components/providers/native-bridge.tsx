"use client";

import { useEffect } from "react";
import { useNativePlatform } from "@/lib/native";

/**
 * Glue for the desktop/mobile app (apps/native). Renders nothing and does nothing on the website.
 * - marks <html> with native-app classes for CSS (app-like touches: no text selection on chrome, no bounce)
 * - Android back button: the app sends a "sakdulur:back" event; close an open dialog or menu first,
 *   otherwise go back
 */
export function NativeBridge() {
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
    window.addEventListener("sakdulur:back", onBack);
    return () => {
      root.classList.remove("native-app", `native-${platform}`);
      window.removeEventListener("sakdulur:back", onBack);
    };
  }, [platform]);

  return null;
}
