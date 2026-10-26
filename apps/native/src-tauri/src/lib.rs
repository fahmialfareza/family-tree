//! Sakdulur for desktop and mobile: one window showing the hosted site (sakdulur.com), which is
//! server-rendered and keeps its session in httpOnly cookies, so it cannot be bundled.
//!
//! The site needs no access to native APIs (no IPC is granted to it). The app does its part here:
//! - starts on a bundled launcher (launcher/index.html): instant splash, offline screen, then the site's
//!   /app with ?client=<platform>, which marks the session as the app (see apps/frontend middleware.ts)
//! - keeps the window on the site: other addresses (Google sign-in, WhatsApp, mailto) open in the
//!   system browser or app, never inside the window
//! - deep links: Google sign-in returns through com.fahmialfareza.sakdulur:/auth/google/complete?...,
//!   which is loaded in the window so the site finishes the sign-in
//! - downloads (exports) are saved to the Downloads folder

use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

/// The site the app shows. Builds for local development set SAKDULUR_SITE_URL=http://localhost:3000.
const SITE_URL: &str = match option_env!("SAKDULUR_SITE_URL") {
    Some(url) => url,
    None => "https://sakdulur.com",
};
/// Custom URL scheme (also the app identifier); the API's MOBILE_APP_SCHEME must match.
const SCHEME: &str = "com.fahmialfareza.sakdulur";
/// Paths a deep link may open on the site.
const DEEP_LINK_PATHS: [&str; 2] = ["/auth/", "/invite"];

fn client() -> &'static str {
    if cfg!(target_os = "ios") {
        "ios"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

fn site() -> Url {
    Url::parse(SITE_URL).expect("SAKDULUR_SITE_URL must be a valid URL")
}

/// Pages the window may show: the site itself and the bundled launcher.
fn is_internal(url: &Url, site: &Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "about" | "blob" | "data" => true,
        "http" | "https" => {
            // Windows and Android serve bundled files from http(s)://tauri.localhost.
            url.host_str() == Some("tauri.localhost")
                || (url.scheme() == site.scheme()
                    && url.host_str() == site.host_str()
                    && url.port_or_known_default() == site.port_or_known_default())
        }
        _ => false,
    }
}

fn open_outside(app: &AppHandle, url: &Url) {
    if let Err(err) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("could not open {url}: {err}");
    }
}

/// com.fahmialfareza.sakdulur:/auth/google/complete?code=... -> https://sakdulur.com/auth/google/complete?code=...
fn open_deep_link(app: &AppHandle, link: &Url) {
    if link.scheme() != SCHEME || !DEEP_LINK_PATHS.iter().any(|p| link.path().starts_with(p)) {
        return;
    }
    let mut target = site();
    target.set_path(link.path());
    target.set_query(link.query());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(target);
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        // Must be the first plugin: a second launch (how Windows and Linux deliver deep links) focuses this one.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }
    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let site = site();
            let handle = app.handle().clone();
            let nav_handle = handle.clone();
            let nav_site = site.clone();
            let popup_handle = handle.clone();
            let popup_site = site.clone();

            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Sakdulur")
                .inner_size(1200.0, 800.0)
                .min_inner_size(360.0, 640.0)
                .zoom_hotkeys_enabled(false)
                // Read by the launcher (and visible to the site, which does not depend on it).
                .initialization_script(&format!(
                    "window.__SAKDULUR_APP__ = {{ client: {:?}, site: {:?} }};",
                    client(),
                    SITE_URL.trim_end_matches('/')
                ))
                .on_navigation(move |url| {
                    if is_internal(url, &nav_site) {
                        return true;
                    }
                    open_outside(&nav_handle, url);
                    false
                })
                // target="_blank" links: the site in this window, everything else outside.
                .on_new_window(move |url, _features| {
                    if is_internal(&url, &popup_site) {
                        if let Some(window) = popup_handle.get_webview_window("main") {
                            let _ = window.navigate(url);
                        }
                    } else {
                        open_outside(&popup_handle, &url);
                    }
                    NewWindowResponse::Deny
                })
                // Keep the default destination: the Downloads folder, without overwriting existing files.
                .on_download(|_webview, event| {
                    if let DownloadEvent::Finished { url, success: false, .. } = event {
                        eprintln!("download failed: {url}");
                    }
                    true
                })
                .build()?;

            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;
            let link_handle = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    open_deep_link(&link_handle, &url);
                }
            });
            // Started by a deep link (the app was closed when the browser handed back).
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    open_deep_link(&handle, &url);
                }
            }
            let _ = window.set_focus();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sakdulur");
}
