import type { MetadataRoute } from "next";
import { ANDROID_PACKAGE, APP_STORE_ID, storeUrl, isLive } from "@/lib/stores";

// Installable web app (Add to Home Screen). The store apps live in apps/native; they are listed as related apps
// (once their store has them), while the web app stays the one browsers offer to install.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sakdulur — silsilah keluarga",
    short_name: "Sakdulur",
    description: "Build your family tree together. Susun silsilah keluarga bersama.",
    lang: "id",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f9f6ef",
    theme_color: "#3f7a52",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    prefer_related_applications: false,
    related_applications: [
      ...(isLive("googlePlay") ? [{ platform: "play", id: ANDROID_PACKAGE, url: storeUrl("googlePlay") }] : []),
      ...(isLive("appStore") ? [{ platform: "itunes", id: APP_STORE_ID, url: storeUrl("appStore") }] : []),
    ],
  };
}
