# Family Tree mobile apps (iOS and Android)

A [Capacitor 8](https://capacitorjs.com) shell around the hosted website (`apps/frontend`). The site is
server-rendered and keeps the session in httpOnly cookies, so the app loads it in a native WebView instead of
bundling a copy. The native side adds what a website can't do:

| Feature | Where |
| --- | --- |
| Sign in with Apple (iOS) | `@capacitor-community/apple-sign-in` → `POST /api/session/apple` → API `POST /api/auth/apple` |
| Google sign-in in the system browser (Google blocks WebViews) | `startGoogleSignInNative` → API returns to `com.fahmialfareza.familytree://auth/google/complete` |
| Share sheet for invite links, saving exports (PNG/JSON) | `@capacitor/share`, `@capacitor/filesystem` |
| Deep links: URL scheme + universal links / App Links | `components/providers/native-bridge.tsx` |
| Android back button closes dialogs before leaving pages | same |
| Status bar follows the theme, splash screen, offline page | `SystemBars`, `@capacitor/splash-screen`, `www/offline.html` |

All native calls live in the frontend (`src/lib/native.ts`) and do nothing on the web. Plugins are installed
in both `apps/frontend` (JavaScript side) and here (native side); keep their versions in step.

**App id / bundle id / URL scheme:** `com.fahmialfareza.familytree`. It can't change after the first store upload.
To use a different one, change `appId` in `capacitor.config.ts` before going further, then regenerate the
platforms (`rm -rf ios android && npx cap add ios --packagemanager SPM && npx cap add android`) and re-apply the
native changes listed under "Native project changes".

## Local development

Needs Xcode (iOS), Android Studio + JDK 21 (Android), and the frontend + API running locally.

```bash
cd apps/mobile
CAP_SERVER_URL=http://localhost:3000 pnpm sync   # writes www/, copies config + plugins into ios/ and android/
pnpm open:ios                                    # Xcode: pick a simulator, Run
pnpm open:android                                # Android Studio: Run on an emulator
adb reverse tcp:3000 tcp:3000                    # Android emulator: makes localhost:3000 reach your Mac
```

Run `pnpm sync` again whenever `capacitor.config.ts`, plugins or `CAP_SERVER_URL` change. Changes to the website
show up on the next app launch without a sync.

For Google sign-in in the app locally, set `MOBILE_APP_SCHEME=com.fahmialfareza.familytree` on the API. Sign in with
Apple only works on a real device or simulator signed with your team, with `APPLE_CLIENT_IDS` set on the API.

## Accounts you need

- **Apple Developer Program** ($99/year) — https://developer.apple.com/programs/
- **Google Play Console** ($25 once) — https://play.google.com/console/
- New personal Play accounts must run a **closed test with at least 12 testers for 14 days** before they can
  publish to production. Start this early.

## One-time setup

### Apple

1. Certificates, Identifiers & Profiles → Identifiers → App ID `com.fahmialfareza.familytree`. Enable
   **Sign in with Apple** and **Associated Domains**.
2. Keys → new key with **Sign in with Apple** for that App ID. Download the `.p8` (only once) and note the Key ID.
3. API env: `APPLE_CLIENT_IDS=com.fahmialfareza.familytree`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
   `APPLE_PRIVATE_KEY` (the .p8 contents, newlines as `\n`). The key lets the API revoke Apple tokens when someone
   deletes their account; App Review checks this.
4. Xcode → App target → Signing & Capabilities: choose your team. Sign in with Apple is already in
   `App/App.entitlements`. Add **Associated Domains** with `applinks:<your-domain>` and
   `webcredentials:<your-domain>`.
5. Frontend env: `IOS_APP_IDS=<TeamID>.com.fahmialfareza.familytree`, so
   `https://<your-domain>/.well-known/apple-app-site-association` is served.
6. App Store Connect → new app with the same bundle id.

### Android

1. Play Console → create the app; enroll in **Play App Signing**.
2. Create an upload key (keep it and its passwords somewhere safe, never in git):
   `keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
3. Frontend env: `ANDROID_CERT_SHA256` = the **App signing key** SHA-256 from Play Console → App integrity (add
   the upload key's too if you install builds outside Play). This serves `/.well-known/assetlinks.json`.
4. In `android/app/src/main/AndroidManifest.xml`, uncomment the App Links `intent-filter` and set your domain.

### Google sign-in

No extra Google client is needed: the app uses the same web OAuth client as the site, through the system browser.
Set `MOBILE_APP_SCHEME=com.fahmialfareza.familytree` on the API.

## Releasing

```bash
cd apps/mobile
CAP_SERVER_URL=https://<your-domain> pnpm sync
```

- **iOS:** in Xcode, raise Version/Build (App target → General), choose *Any iOS Device*, then Product → Archive →
  Distribute App → App Store Connect. Test it through TestFlight before submitting.
- **Android:** raise `versionCode` / `versionName` in `android/app/build.gradle`, then Android Studio → Build →
  Generate Signed App Bundle (upload key) → upload the `.aab` to a testing track in Play Console.

Icons and splash screens come from `assets/` (generated from the logo). After changing them, run `pnpm assets`.

## Store review checklist

- **Sign in with Apple** offered next to Google on iOS (guideline 4.8) ✔︎
- **Account deletion in the app**: Account → Delete account ✔︎ (and Apple tokens are revoked when the key is set)
- **More than a website** (guideline 4.2): native sign-in, share sheet, file saving, deep links, offline page.
  In the review notes, describe these and give a **demo account** (email + password) with a sample tree.
- **Privacy**: link the Privacy Policy (`https://<your-domain>/privacy`). App Store "App Privacy" answers:
  contact info (name, email), user content (photos, family data), identifiers (user id), all linked to the user,
  not used for tracking. Play "Data safety" form: the same; data encrypted in transit; users can request deletion.
- **Age rating**: 13+ (matches the Terms). Content is user-generated but private to invited family members.
- **Permissions**: camera and photo library texts are in `ios/App/App/Info.plist`; Android uses the system photo
  picker and needs no permission.
- **Export compliance**: `ITSAppUsesNonExemptEncryption = NO` (only standard HTTPS).

## Native project changes (re-apply if the platforms are regenerated)

- `ios/App/App/Info.plist`: `CFBundleURLTypes` (URL scheme), `NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `ITSAppUsesNonExemptEncryption`.
- `ios/App/App/App.entitlements` (Sign in with Apple), referenced by `CODE_SIGN_ENTITLEMENTS` in the project.
- `android/app/src/main/AndroidManifest.xml`: URL scheme `intent-filter`, App Links `intent-filter` (commented
  until the domain is known), `android:allowBackup="false"` (keeps session cookies out of cloud backups).
