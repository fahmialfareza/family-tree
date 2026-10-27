//! Native pieces of the Sakdulur app that the site (apps/frontend) calls. Only these commands are granted to the
//! site, at runtime and for its own address (see the app's lib.rs).
//!
//! The app itself also calls `open_in_app_browser` (Rust API, not a command) for the site's public pages.
//!
//! - `apple_authorize { nonce }`: Apple's sign-in sheet (iPhone and Mac). Returns the identity token, the
//!   authorization code and the name (Apple only shares it the first time); the site sends them to
//!   POST /api/session/apple. `nonce` is the raw value the site keeps; the native code hashes it (SHA-256)
//!   for Apple, so the site needs no Web Crypto (missing on plain-HTTP pages, e.g. a dev server over Wi-Fi).

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Runtime};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "ios")]
mod ios;

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
    return ios::authorize(&app, nonce);
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

/// Shows `url` in an in-app browser sheet over the app (iOS: Safari's sheet with a Done button). Called by the app
/// (not the site) for the site's public pages. Elsewhere returns Err, and the app opens the system browser.
pub fn open_in_app_browser<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    return ios::open_in_app_browser(app, url);
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, url);
        Err("no in-app browser on this platform".into())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("sakdulur")
        .invoke_handler(tauri::generate_handler![apple_authorize])
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            ios::register(_app, _api)?;
            Ok(())
        })
        .build()
}
