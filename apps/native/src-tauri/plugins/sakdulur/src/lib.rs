//! Native pieces of the Sakdulur app that the site (apps/frontend) calls. Only these commands are granted to the
//! site, at runtime and for its own address (see the app's lib.rs).
//!
//! The app itself also calls `open_in_app_browser` (Rust API, not a command) for the site's public pages.
//!
//! - `apple_authorize { nonce }`: Apple's sign-in sheet (iPhone and Mac). Returns the identity token, the
//!   authorization code and the name (Apple only shares it the first time); the site sends them to
//!   POST /api/session/apple. `nonce` is the raw value the site keeps; the native code hashes it (SHA-256)
//!   for Apple, so the site needs no Web Crypto (missing on plain-HTTP pages, e.g. a dev server over Wi-Fi).
//! - `save_file { name, mime, data }` (phones): `data` is base64. Android: every download (its web view ignores
//!   them); pictures go to the Gallery (Pictures/Sakdulur), other files to Downloads. iPhone: pictures only, to
//!   Photos (other files are ordinary downloads, saved to Files › Sakdulur by the app). Returns the name it was
//!   saved as and `location`: "gallery", "downloads", "photos", or "device" (Android 7–9: the app's own folder).

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Runtime};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(mobile)]
mod mobile;

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppleAuthorization {
    pub identity_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authorization_code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub given_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub family_name: Option<String>,
}

#[tauri::command]
async fn apple_authorize<R: Runtime>(app: AppHandle<R>, nonce: String) -> Result<AppleAuthorization, String> {
    if nonce.is_empty() || nonce.len() > 256 {
        return Err("invalid nonce".into());
    }
    #[cfg(target_os = "ios")]
    return mobile::authorize(&app, nonce);
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        return tauri::async_runtime::spawn_blocking(move || macos::authorize(&nonce))
            .await
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    {
        let _ = (app, nonce);
        Err("Sign in with Apple is not available in this app".into())
    }
}

/// Shows `url` in an in-app browser sheet over the app (iOS: Safari's sheet with Done; Android: Chrome Custom Tab). Called by the app
/// (not the site) for the site's public pages. Elsewhere returns Err, and the app opens the system browser.
pub fn open_in_app_browser<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<(), String> {
    #[cfg(mobile)]
    return mobile::open_in_app_browser(app, url);
    #[cfg(not(mobile))]
    {
        let _ = (app, url);
        Err("no in-app browser on this platform".into())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveFile {
    pub name: String,
    pub mime: String,
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedFile {
    pub name: String,
    pub location: String,
}

#[tauri::command]
async fn save_file<R: Runtime>(app: AppHandle<R>, name: String, mime: String, data: String) -> Result<SavedFile, String> {
    if name.is_empty() || name.len() > 255 || data.len() > 100 * 1024 * 1024 {
        return Err("invalid file".into());
    }
    #[cfg(mobile)]
    return tauri::async_runtime::spawn_blocking(move || mobile::save_file(&app, SaveFile { name, mime, data }))
        .await
        .map_err(|e| e.to_string())?;
    #[cfg(not(mobile))]
    {
        let _ = (app, mime);
        Err("save_file is only needed on phones".into())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("sakdulur")
        .invoke_handler(tauri::generate_handler![apple_authorize, save_file])
        .setup(|_app, _api| {
            #[cfg(mobile)]
            mobile::register(_app, _api)?;
            Ok(())
        })
        .build()
}
