#!/usr/bin/env bash
# Builds the iOS app signed with the development profile and installs it on a connected iPhone.
#   scripts/ios-device.sh [device-udid]        (default: the first paired physical iPhone)
# SAKDULUR_SITE_URL picks the site (default https://sakdulur.com). Needs the "iOS App Development" profile
# for com.fahmialfareza.sakdulur installed in Xcode's profiles folder (see README) and the device unlocked.
# Uses `tauri ios build --open` only to host the CLI session Xcode's Rust build step talks to, then builds
# with xcodebuild and manual signing (no Xcode account needed).
set -euo pipefail
cd "$(dirname "$0")/.."
PROFILE_NAME="${IOS_PROFILE_NAME:-*[tauri] com.fahmialfareza.sakdulur iOSDev 2026-10}"
IDENTITY="${IOS_SIGNING_IDENTITY:-Apple Development: Fahmi Alfareza (WR98G4JTHQ)}"
DEVICE="${1:-$(xcrun devicectl list devices 2>/dev/null | awk '/physical/ && /iPhone/ {for (i=1;i<=NF;i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$/) {print $i; exit}}')}"
[ -n "$DEVICE" ] || { echo "No paired iPhone found (xcrun devicectl list devices)"; exit 1; }
DERIVED="${TMPDIR:-/tmp}/sakdulur-ios-dd"

pnpm tauri ios build --target aarch64 --debug --open >/tmp/sakdulur-ios-open.log 2>&1 &
CLI=$!
trap 'kill $CLI 2>/dev/null || true' EXIT
for _ in $(seq 1 120); do grep -q "Opening Xcode" /tmp/sakdulur-ios-open.log && break; sleep 1; done

(cd src-tauri/gen/apple && xcodebuild -project sakdulur.xcodeproj -scheme sakdulur_iOS -configuration debug -sdk iphoneos \
  -destination 'generic/platform=iOS' -derivedDataPath "$DERIVED" ARCHS=arm64 DEVELOPMENT_TEAM=7FCMB3QMK7 \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$IDENTITY" PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME" build -quiet)

APP="$DERIVED/Build/Products/debug-iphoneos/Sakdulur.app"
xcrun devicectl device install app --device "$DEVICE" "$APP"
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing com.fahmialfareza.sakdulur
