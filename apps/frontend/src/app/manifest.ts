import type { MetadataRoute } from "next";

// Installable web app (Add to Home Screen). The store apps live in apps/mobile.
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
  };
}
