# Sakdulur apps (macOS, Windows, Linux, iOS and Android)

A [Tauri 2](https://tauri.app) app with the website's screens bundled: `apps/frontend`'s components, built with Vite
in this folder, call the Go API directly. The app opens without the network (trees seen before are kept on the
device), and app changes ship with store releases, not with website deploys.

## How it works

| Piece | Where |
| --- | --- |
| Entry, routes (the website's paths without `/en`, `/id`), providers | `src/main.tsx`, `src/pages/*` |
| The website's components and messages, imported as `@/…` | `vite.config.ts` (aliases), `../frontend/src`, `../frontend/messages` |
| `next/link`, `next/navigation`, `next-intl` stand-ins (react-router, use-intl) | `src/shims/*` |
| API client with the session in the app (bearer tokens, refresh) instead of the website's cookies and `/api/proxy` | `src/native/api-client.ts`, `src/native/session.ts` (replaces `frontend/src/lib/api/client.ts`) |
| Sign-in in the system browser (Google; Apple outside iPhone/Mac), returned through `com.fahmialfareza.sakdulur:/auth/<p>/complete?code=` | `src/native/native.ts`, `src/pages/auth.tsx` (`AuthComplete`), deep links in `src-tauri/src/lib.rs` |
| Offline: trees seen before, kept in IndexedDB (React Query persister) | `src/query-client.ts`, `src/native/offline.ts` (replaces `frontend/src/lib/offline.ts`) |
| Sentry: errors, traces, replays on error (masked), logs | `src/sentry.ts`, source maps in `vite.config.ts` |
| Other sites (Google sign-in, WhatsApp, mailto) and the website's Privacy/Terms open outside the window | `src-tauri/src/lib.rs` (`on_navigation`, `on_new_window`) |
| Downloads (exports) saved to the Downloads folder | `lib.rs` (`on_download`) |
| Native touches (share sheet, Android back, `native-app` CSS classes, Apple sheet, saving on phones) | `frontend/src/lib/native.ts`, `components/providers/native-bridge.tsx`, `src-tauri/plugins/sakdulur` |

`src-tauri/src/lib.rs` sets `window.__SAKDULUR_APP__ = { client, site }` on every page, which is how the app (and
`nativePlatform()`) knows the platform. The app's only IPC is the local plugin's `apple_authorize` and `save_file`
(`capabilities/default.json`).

Three `apps/frontend` modules talk to the website's server, and the app replaces them (a Vite resolve plugin in
`vite.config.ts`, so `./client` imports are caught too): `lib/api/client.ts`, `lib/native.ts`, `lib/offline.ts`.
Keep their exports in step with `src/native/*` when changing them. Everything else is shared as is; a component that
needs the website's server (`/api/session`, `/api/proxy`) should go through those three modules.

**App id / bundle id / URL scheme:** `com.fahmialfareza.sakdulur`. It can't change after the first store upload.

## Run it

Needs Rust (`rustup`), and per platform: Xcode (macOS/iOS), Visual Studio Build Tools + WebView2 (Windows),
`webkit2gtk-4.1` and friends (Linux), Android Studio + NDK (Android). See https://tauri.app/start/prerequisites/.
Settings are build-time Vite variables: copy `.env.example` to `.env` (`VITE_API_URL` is required for builds).

```bash
cd apps/native
pnpm desktop:local           # vite + tauri dev against the local API (http://localhost:4000)
pnpm desktop                 # against VITE_API_URL from .env
pnpm dev                     # the screens alone in a browser at http://localhost:1420 (no native parts)
pnpm check-types && pnpm build
pnpm desktop:build           # release bundles for this OS (.app/.dmg, .msi/.exe, .deb/.rpm/.AppImage)
pnpm icons                   # regenerate icons from app-icon.png
```

The local API must allow the app's origins: `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:1420,tauri://localhost,http://tauri.localhost`.
Deep links only work in a built app (macOS registers the scheme from the bundle): `pnpm tauri build --debug --bundles app`,
open the `.app`, then `open "com.fahmialfareza.sakdulur:/auth/google/complete?code=x"`.

Linux: GNOME (Wayland) takes the dock icon from an installed `.desktop` file matching the window's app id
(`sakdulur`), so a bare `target/debug/sakdulur` shows a generic icon. Test the icon with the package:
`pnpm tauri build --bundles deb`, then `sudo apt install ./src-tauri/target/release/bundle/deb/Sakdulur_*.deb`.

## Server settings

- API (Railway): `ALLOWED_ORIGINS` including `tauri://localhost` and `http://tauri.localhost` (the app calls the API
  from them), `MOBILE_APP_SCHEME=com.fahmialfareza.sakdulur` (browser sign-in returning to the app) and
  `APPLE_CLIENT_IDS` including `com.fahmialfareza.sakdulur` (native Apple sheet) and the web Services ID.
- Google OAuth client: nothing extra; the app uses the web client through the system browser.

## Status

- [x] macOS, iPhone, Android, Windows and Ubuntu builds of the website shell tested on real hardware against
  production (2026-10-27).
- [ ] The bundled app (2026-10-30): its screens tested in headless Chrome against a local API (sign-up, sign-in,
  tree, tabs, token refresh, downloads, language, offline reopen, sign-out) and built as a macOS debug `.app`; not
  yet run on devices (deep-link sign-in, the Apple sheet, Android back and `save_file`, the CSP on each platform).
- [ ] Store releases (`RELEASE.md`): App Store (iOS), Mac App Store and Google Play first; Microsoft Store and
  Snap Store planned for 2026-11-01 (their workflows exist but are not verified yet).

Apple review (guideline 4.2) rejects "just a website": the review notes in `RELEASE.md` list the native parts.

Until every store has a bundled release, older installs still show the website: keep its app-mode code (the
`ft_client` cookie in `apps/frontend` `middleware.ts`, `/welcome`, the `/api/session/<p>/start?client=app` JSON
answer) until then.
