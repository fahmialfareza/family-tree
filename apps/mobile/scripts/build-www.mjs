// Writes www/: the offline page (shown by Capacitor when the site cannot be loaded) with a retry button
// pointing at CAP_SERVER_URL, and the index.html Capacitor requires. Run by `pnpm sync`.
import { mkdirSync, writeFileSync } from "node:fs";

const serverUrl = (process.env.CAP_SERVER_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const url = new URL(serverUrl);
if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
  console.error(`CAP_SERVER_URL must be https (got ${serverUrl})`);
  process.exit(1);
}

const page = (body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sakdulur</title>
<style>
  :root { color-scheme: light dark; --bg: #f9f6ef; --fg: #3a3128; --muted: #75695c; --primary: #3f7a52; --on-primary: #fbf7ee; }
  @media (prefers-color-scheme: dark) { :root { --bg: #221d18; --fg: #f2ede4; --muted: #b9ad9c; --primary: #7cc893; --on-primary: #10261a; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center;
    padding: calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px);
    background: var(--bg); color: var(--fg); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 22rem; }
  svg { width: 64px; height: 64px; }
  h1 { font-size: 1.35rem; margin: 20px 0 6px; }
  p { margin: 0 0 24px; color: var(--muted); }
  a { display: inline-block; min-width: 10rem; padding: 12px 20px; border-radius: 12px; background: var(--primary); color: var(--on-primary);
    font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<main>
<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#3f7a52"/><circle cx="16" cy="11" r="4" fill="#fbf7ee"/><circle cx="9.5" cy="21" r="3.2" fill="#fbf7ee" opacity=".85"/><circle cx="22.5" cy="21" r="3.2" fill="#fbf7ee" opacity=".85"/><path d="M16 15v3.5M16 18.5l-5 1.5M16 18.5l5 1.5" stroke="#fbf7ee" stroke-width="1.6" stroke-linecap="round" fill="none"/><rect x="13" y="25.5" width="6" height="2" rx="1" fill="#c9714a"/></svg>
${body}
</main>
<script>
  // The site hides the splash screen itself; this page has to do it when the site is unreachable.
  try { window.Capacitor && window.Capacitor.Plugins.SplashScreen && window.Capacitor.Plugins.SplashScreen.hide(); } catch (e) {}
</script>
</body>
</html>
`;

const offline = page(`<h1 id="t">You're offline</h1>
<p id="d">Sakdulur needs an internet connection. Check your connection and try again.</p>
<a id="r" href="${serverUrl}/app">Try again</a>
<script>
  if ((navigator.language || "").toLowerCase().startsWith("id")) {
    document.getElementById("t").textContent = "Anda sedang offline";
    document.getElementById("d").textContent = "Sakdulur membutuhkan koneksi internet. Periksa koneksi Anda lalu coba lagi.";
    document.getElementById("r").textContent = "Coba lagi";
  }
</script>`);

const index = page(`<p><a href="${serverUrl}/app">Open Sakdulur</a></p>`);

mkdirSync(new URL("../www", import.meta.url), { recursive: true });
writeFileSync(new URL("../www/offline.html", import.meta.url), offline);
writeFileSync(new URL("../www/index.html", import.meta.url), index);
console.log(`www/ written for ${serverUrl}`);
