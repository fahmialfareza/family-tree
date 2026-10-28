"use client";

import { useReactFlow } from "@xyflow/react";
import { useEffect } from "react";
import { useNativePlatform } from "@/lib/native";

// Safari's GestureEvent: a trackpad pinch, with the scale since the pinch began.
type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };

/**
 * Smooth trackpad pinch in the Mac app. Its web view reports a pinch mainly as gesture events (a continuous
 * scale), while the canvas zooms on Ctrl+scroll, which arrives there in coarse steps: zooming felt jumpy compared
 * with browsers and iOS. Here the gesture's scale drives the zoom directly, around the fingers, once per frame;
 * Ctrl+scroll during a pinch is ignored so it doesn't zoom twice. Browsers and other apps are unchanged.
 */
export function useMacTrackpadZoom(minZoom: number, maxZoom: number) {
  const platform = useNativePlatform();
  const { getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    if (platform !== "macos") return;
    let canvas: HTMLElement | null = null;
    // The zoom when the pinch began, and the tree point under the fingers then (it stays under them).
    let start: { zoom: number; fx: number; fy: number } | null = null;
    let latest: GestureEvent | null = null;
    let frame = 0;

    const apply = () => {
      frame = 0;
      if (!start || !latest || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const zoom = Math.min(maxZoom, Math.max(minZoom, start.zoom * latest.scale));
      const px = latest.clientX - rect.left;
      const py = latest.clientY - rect.top;
      void setViewport({ zoom, x: px - start.fx * zoom, y: py - start.fy * zoom });
    };
    const onStart = (e: Event) => {
      const g = e as GestureEvent;
      canvas = (g.target as Element | null)?.closest?.(".react-flow") as HTMLElement | null;
      if (!canvas) return;
      g.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const vp = getViewport();
      const px = g.clientX - rect.left;
      const py = g.clientY - rect.top;
      start = { zoom: vp.zoom, fx: (px - vp.x) / vp.zoom, fy: (py - vp.y) / vp.zoom };
    };
    const onChange = (e: Event) => {
      if (!start) return;
      e.preventDefault();
      latest = e as GestureEvent;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onEnd = () => {
      start = null;
      latest = null;
    };
    // Capture phase on the document: before the canvas's own Ctrl+scroll zoom.
    const onWheel = (e: WheelEvent) => {
      if (start && e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("gesturestart", onStart, { passive: false });
    document.addEventListener("gesturechange", onChange, { passive: false });
    document.addEventListener("gestureend", onEnd);
    document.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("gesturestart", onStart);
      document.removeEventListener("gesturechange", onChange);
      document.removeEventListener("gestureend", onEnd);
      document.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [platform, minZoom, maxZoom, getViewport, setViewport]);
}
