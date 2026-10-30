import { fileURLToPath } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import pkg from "./package.json" with { type: "json" };

// The app's screens are apps/frontend's components (imported through "@/"). Next.js-only modules are swapped for
// small shims (src/shims), and the three modules that talk to the website's server (BFF) for app versions that
// call the API directly (src/native). See README.md.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const frontend = here("../frontend/src");
const host = process.env.TAURI_DEV_HOST;

// apps/frontend modules the app replaces, however they are imported ("@/lib/...", or "./client" from hooks.ts).
// A replacement still reaches its own original (imported as "@frontend/lib/...").
const overrides: Record<string, string> = {
  [`${frontend}/lib/api/client.ts`]: here("src/native/api-client.ts"),
  [`${frontend}/lib/native.ts`]: here("src/native/native.ts"),
  [`${frontend}/lib/offline.ts`]: here("src/native/offline.ts"),
};

function appOverrides(): Plugin {
  return {
    name: "sakdulur-app-overrides",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const target = resolved && overrides[resolved.id];
      // A replacement importing its own original gets the original.
      return target && target !== importer ? target : null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here("."), "");
  const siteUrl = (env.VITE_SITE_URL || "https://sakdulur.com").replace(/\/+$/, "");
  const release = `sakdulur-app@${pkg.version}`;
  const uploadSourceMaps = !!env.SENTRY_AUTH_TOKEN;
  return {
    plugins: [
      appOverrides(),
      react(),
      tailwindcss(),
      ...(uploadSourceMaps
        ? [
            sentryVitePlugin({
              org: env.SENTRY_ORG,
              project: env.SENTRY_NATIVE_PROJECT || env.SENTRY_PROJECT,
              authToken: env.SENTRY_AUTH_TOKEN,
              release: { name: release },
              sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
              telemetry: false,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: [
        { find: /^@frontend\//, replacement: `${frontend}/` },
        { find: /^@\//, replacement: `${frontend}/` },
        { find: /^next\/link$/, replacement: here("src/shims/link.tsx") },
        { find: /^next\/navigation$/, replacement: here("src/shims/navigation.ts") },
        { find: /^next-intl$/, replacement: here("src/shims/intl.tsx") },
      ],
      // One copy of each library that holds React state or context, whichever app's file imports it.
      dedupe: ["react", "react-dom", "@tanstack/react-query", "next-themes", "sonner", "use-intl"],
    },
    define: {
      // apps/frontend code reads these (lib/brand.ts, lib/sentry.ts): the public site, for links people share.
      "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
      "process.env.NEXT_PUBLIC_APP_URL": JSON.stringify(siteUrl),
      "process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT": JSON.stringify(""),
      "process.env.NEXT_PUBLIC_SENTRY_DSN": JSON.stringify(""),
      "process.env.NEXT_PUBLIC_ENABLE_SW": JSON.stringify(""),
      "process.env.NEXT_PUBLIC_CONTACT_EMAIL": JSON.stringify(env.NEXT_PUBLIC_CONTACT_EMAIL || ""),
      "process.env.NEXT_PUBLIC_OPERATOR_NAME": JSON.stringify(env.NEXT_PUBLIC_OPERATOR_NAME || ""),
      __APP_RELEASE__: JSON.stringify(release),
    },
    build: {
      // Uploaded to Sentry, then deleted (never shipped in the app).
      sourcemap: uploadSourceMaps ? "hidden" : false,
      target: ["es2021", "safari15"],
    },
    // Nothing of the website's public/ (its service worker and email images) belongs in the app.
    publicDir: false,
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
      watch: { ignored: ["**/src-tauri/**"] },
      fs: { allow: [here(".."), here("../../node_modules")] },
    },
    envPrefix: ["VITE_", "TAURI_"],
  };
});
