# Sakdulur apps (macOS, Windows, Linux, iOS, Android)

A [Tauri 2](https://tauri.app) shell around the hosted site (`apps/frontend`). The site is server-rendered and keeps
the session in httpOnly cookies, so the app shows it in a native window instead of bundling a copy, and every web
release reaches the apps at once.

## How it works

| Piece | Where |
| --- | --- |
| Launcher: brand splash, offline screen with retry, then `/app?client=<platform>` | `launcher/index.html` |
| App home instead of the landing page; `/welcome` for signed-out users | `apps/frontend/src/middleware.ts` (keys off the `ft_client` cookie, `src/lib/app-client.ts`) |
| Welcome screen (swipeable on phones, three cards on desktop) | `apps/frontend/src/app/[locale]/(native)/welcome` |
| Other sites (Google sign-in, WhatsApp, mailto) open in the system browser or app | `src-tauri/src/lib.rs` (`on_navigation`, `on_new_window`) |
| Google sign-in returns via `com.fahmialfareza.sakdulur:/auth/google/complete?...` | `lib.rs` (deep link → loads the page in the window); API `MOBILE_APP_SCHEME` |
| Downloads (exports) saved to the Downloads folder | `lib.rs` (`on_download`) |
| App-only touches (share sheet, no print, `native-app` CSS classes, Android back) | `apps/frontend/src/lib/native.ts`, `components/providers/native-bridge.tsx` |

The site gets almost no IPC: a capability added at runtime in `lib.rs` lets `https://sakdulur.com/*` call only
`plugin:sakdulur|apple_authorize` (native Apple sheet, iOS/macOS) and `plugin:sakdulur|save_file` (Android downloads),
from the local plugin `src-tauri/plugins/sakdulur`. On the web nothing changes: without the cookie every page behaves
as before.

**App id / bundle id / URL scheme:** `com.fahmialfareza.sakdulur`. It can't change after the first store upload.

## Run it

Needs Rust (`rustup`), and per platform: Xcode (macOS/iOS), Visual Studio Build Tools + WebView2 (Windows),
`webkit2gtk-4.1` and friends (Linux), Android Studio + NDK (Android). See https://tauri.app/start/prerequisites/.

```bash
cd apps/native
pnpm desktop                 # against https://sakdulur.com
pnpm desktop:local           # against http://localhost:3000 (run the frontend + API first)
pnpm desktop:build           # release bundles for this OS (.app/.dmg, .msi/.exe, .deb/.rpm/.AppImage)
pnpm icons                   # regenerate icons from app-icon.png
```

`SAKDULUR_SITE_URL` is read at compile time (default `https://sakdulur.com`). Deep links only work in a built app
(macOS registers the scheme from the bundle): `SAKDULUR_SITE_URL=http://localhost:3000 pnpm tauri build --debug --bundles app`,
open the `.app`, then `open "com.fahmialfareza.sakdulur:/auth/google/complete?code=x"`.

Linux: GNOME (Wayland) takes the dock icon from an installed `.desktop` file matching the window's app id
(`sakdulur`), so a bare `target/debug/sakdulur` shows a generic icon. Test the icon with the package:
`pnpm tauri build --bundles deb`, then `sudo apt install ./src-tauri/target/release/bundle/deb/Sakdulur_*.deb`.

## Server settings

- API (Railway): `MOBILE_APP_SCHEME=com.fahmialfareza.sakdulur` (browser sign-in returning to the app) and
  `APPLE_CLIENT_IDS` including `com.fahmialfareza.sakdulur` (native Apple sheet) and the web Services ID.
- Google OAuth client: nothing extra; the app uses the web client through the system browser.

## Status

- [x] macOS, iPhone, Android, Windows and Ubuntu builds tested on real hardware against production (2026-10-27).
- [ ] Store releases (`RELEASE.md`): App Store (iOS), Mac App Store and Google Play first; Microsoft Store and
  Snap Store planned for 2026-11-01 (their workflows exist but are not verified yet).

Apple review (guideline 4.2) rejects "just a website": the review notes in `RELEASE.md` list the native parts.
