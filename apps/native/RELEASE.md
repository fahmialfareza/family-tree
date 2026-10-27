# Releasing the Sakdulur apps

Store builds run on GitHub Actions (GitHub-hosted runners, free for this public repo), one workflow per store,
started from your terminal. Like Malanghub, a release goes to testers first: iPhone and Mac builds land in
**TestFlight**, Android builds in Play's **Internal testing**. Promote a tested build to the stores from App Store
Connect and Play Console.

| Store | Workflow | Status |
| --- | --- | --- |
| Google Play | `native-android-play-store.yml` | first release |
| App Store (iPhone) | `native-ios-app-store.yml` | first release |
| Mac App Store | `native-macos-app-store.yml` | first release |
| Microsoft Store | `native-windows-msix.yml` | planned for 2026-11-01, not verified yet |
| Snap Store | `native-linux-snapcraft.yml` + `snap/snapcraft.yaml` | planned for 2026-11-01, not verified yet |

## Commands

```bash
pnpm release android 100   # build 100 = version 1.0.0; 101 = 1.0.1, 110 = 1.1.0
pnpm release ios 100
pnpm release macos 100
pnpm release windows 100
pnpm release linux 100
```

The build number is the store build (Android `versionCode`, Apple `CFBundleVersion`) and must go up with every
upload; the version is derived from it (`scripts/set-release-version.mjs`, applied in CI only, so the repo stays at
0.1.0). Watch a run with `gh run list --workflow <file> --limit 5`.

Overrides:

```bash
SAKDULUR_RELEASE_REF=main pnpm release ios 101          # branch to build (default: current branch)
SAKDULUR_ANDROID_TRACK=alpha pnpm release android 101           # Closed testing instead of Internal testing
SAKDULUR_IOS_EXPORT_METHOD=release-testing pnpm release ios 101   # IPA artifact only, no upload
SAKDULUR_SNAP_CHANNEL=edge pnpm release linux 101
```

Android goes to Internal testing and is rolled out to its testers at once. While the app is still a draft in Play
Console (nothing rolled out on any track yet), Play only accepts draft releases: use
`SAKDULUR_ANDROID_STATUS=draft` and roll it out in Play Console.

## GitHub secrets

`Settings > Secrets and variables > Actions`, or `gh secret set NAME < file`. Base64 a file with
`base64 < file | tr -d '\n'`.

Android (Google Play):

| Name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | base64 of `sakdulur-upload-key.jks` (iCloud `Reza/Projects/Sakdulur/Credentials`) |
| `ANDROID_KEYSTORE_PASSWORD` | from `sakdulur-upload-key.txt` next to it |
| `ANDROID_KEY_ALIAS` | `sakdulur-upload` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Play Console service account key (JSON) with release access to the app |

Apple (App Store and Mac App Store):

| Name | Value |
| --- | --- |
| `APPLE_TEAM_ID` | `7FCMB3QMK7` |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` / `_PASSWORD` | "Apple Distribution: Fahmi Alfareza" exported from Keychain as `.p12` |
| `APPLE_KEYCHAIN_PASSWORD` | any strong value (temporary CI keychain) |
| `IOS_PROVISIONING_PROFILE_BASE64` | iOS **App Store** profile for `com.fahmialfareza.sakdulur` (`.mobileprovision`) |
| `MACOS_PROVISIONING_PROFILE_BASE64` | **Mac App Store** profile for `com.fahmialfareza.sakdulur` (`.provisionprofile`) |
| `MACOS_APP_SIGNING_IDENTITY` | `Apple Distribution: Fahmi Alfareza (7FCMB3QMK7)` |
| `MACOS_INSTALLER_CERTIFICATE_BASE64` / `_PASSWORD` | "3rd Party Mac Developer Installer: Fahmi Alfareza" as `.p12` |
| `MACOS_INSTALLER_SIGNING_IDENTITY` | `3rd Party Mac Developer Installer: Fahmi Alfareza (7FCMB3QMK7)` |
| `APP_STORE_CONNECT_KEY_ID` / `_ISSUER_ID` | App Store Connect API key (`Users and Access > Integrations`) |
| `APP_STORE_CONNECT_PRIVATE_KEY_BASE64` | base64 of its `AuthKey_<KEY_ID>.p8` |
| `APP_STORE_CONNECT_APPLE_ID` | numeric Apple ID of the Sakdulur app record (iPhone and Mac share one record) |

Windows (2026-11-01): `SAKDULUR_WINDOWS_IDENTITY_NAME`, `SAKDULUR_WINDOWS_PUBLISHER`,
`SAKDULUR_WINDOWS_PUBLISHER_DISPLAY_NAME` (Partner Center > Product identity); optional `WINDOWS_PFX_BASE64` /
`WINDOWS_PFX_PASSWORD` to sign the artifact for sideload tests.

Linux (2026-11-01): `SNAPCRAFT_STORE_CREDENTIALS` from
`snapcraft export-login --snaps sakdulur --acls package_upload,package_release -`.

## First release, store by store

### Google Play

1. Play Console: create the app "Sakdulur" (default language Indonesian, app, free). Package name comes from the
   first upload: `com.fahmialfareza.sakdulur`.
2. Upload the first AAB by hand (Play doesn't accept API uploads before that): Testing > Internal testing > create a
   release, upload `Sakdulur-1.0.0-100.aab` (iCloud `Reza/Projects/Sakdulur/Builds`), and roll it out to a tester
   list. Let Play manage the app signing key (Play App Signing).
3. New personal developer accounts need **12 testers opted in for 14 days of Closed testing** before production
   access; Internal testing doesn't count toward it. Start a Closed testing track early (promote the same build
   there, or `SAKDULUR_ANDROID_TRACK=alpha`), add the testers' Google accounts and share the opt-in link.
4. Fill in the store listing, content rating, target audience (13+), and Data safety (below).
5. Setup > API access: link a Google Cloud service account, grant it release permission for the app, and save its
   JSON key as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. If an upload fails with "Android Developer API has not been used",
   enable the Google Play Android Developer API in that Cloud project.
6. Later builds: `pnpm release android 101`.

### App Store and Mac App Store

1. Certificates (already in this Mac's keychain): Apple Distribution, and 3rd Party Mac Developer Installer.
2. Apple Developer > Profiles: create an **App Store Connect** profile for iOS and a **Mac App Store Connect**
   profile for macOS, both for `com.fahmialfareza.sakdulur` (Sign in with Apple is already on the App ID).
3. App Store Connect > Apps > New app: platforms iOS and macOS, bundle ID `com.fahmialfareza.sakdulur`, SKU
   `sakdulur`. Copy its numeric Apple ID into `APP_STORE_CONNECT_APPLE_ID`.
4. Create an API key (role App Manager) for the upload secrets.
5. TestFlight > Internal Testing: create a group, add yourself (and other team members), and turn on automatic
   distribution so every processed build reaches them.
6. `pnpm release ios 100` and `pnpm release macos 100`. Builds show up in TestFlight after processing (~10–30 min).
7. When a build is ready: fill in the listing, App Privacy (below), age rating and review notes (below), pick the
   build, and submit for review.

The Mac App Store build is sandboxed (`src-tauri/Entitlements.appstore.plist`: network, Downloads folder, Sign in with
Apple) and built for Apple silicon and Intel. Its minimum is macOS 13, because the Sign in with Apple code is built
for macOS 13.

## App review notes (Apple guideline 4.2)

> Sakdulur is a private family tree app. Besides showing the family tree service, the app uses native features:
> Sign in with Apple through the system sheet (Face ID / Touch ID), Google sign-in in the system browser with the
> result returned to the app through its URL scheme, exports (PNG, Excel, GEDCOM, account data) saved to Files /
> Downloads with native progress notices, the share sheet for invitation links, an offline launch screen with retry,
> and its own start screen instead of the website's landing page.
>
> Demo account: `<email>` / `<password>` (has a sample tree with several generations).

Create the demo account before submitting, with a small sample tree, and keep it signed out of other devices.

## Privacy answers (from the privacy policy)

No tracking, no advertising, no data sold. Data is encrypted in transit. Users can delete their account in the app
(Account page) or request deletion by email; deletion is described at https://sakdulur.com/privacy (section 6).

App Store "App Privacy", all **linked to the user**, used for **App Functionality** only, no tracking:

- Contact info: name, email address; phone number and physical address (entered for relatives).
- User content: photos, other user content (family tree details, notes).
- Identifiers: user ID.
- Diagnostics: crash data, performance data (server monitoring).

Plus, **not linked**: usage data (product interaction), from Cloudflare's cookieless visit statistics.

Google Play "Data safety", collected (none shared), required for the app to work, encrypted in transit, deletable:

- Personal info: name, email address, user IDs, address, phone number.
- Photos and videos: photos.
- App activity: other user-generated content; app interactions (anonymous visit statistics).
- App info and performance: crash logs, diagnostics.

## Icons

`pnpm icons` regenerates every icon from `app-icon.png` and then strips the alpha channel from the iOS icons
(`scripts/ios-icons-opaque.swift`); App Store rejects icons with one, and the iOS workflow checks it. It also rewrites
`icons/icon.icns` with identical images; discard that change if the images didn't change.
