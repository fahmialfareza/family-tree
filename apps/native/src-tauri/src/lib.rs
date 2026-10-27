//! Sakdulur for desktop and mobile: one window showing the hosted site (sakdulur.com), which is
//! server-rendered and keeps its session in httpOnly cookies, so it cannot be bundled.
//!
//! The site gets no native access except the sakdulur plugin's commands (plugins/sakdulur: Sign in with Apple
//! on iPhone and Mac), granted at runtime for the site's own address. The rest of the app's part is here:
//! - starts on a bundled launcher (launcher/index.html): instant splash, offline screen, then the site's
//!   /app with ?client=<platform>, which marks the session as the app (see apps/frontend middleware.ts)
//! - keeps the window on the site: other addresses (Google sign-in, WhatsApp, mailto) open in the
//!   system browser or app, never inside the window
//! - deep links: Google sign-in returns through com.fahmialfareza.sakdulur:/auth/google/complete?...,
//!   which is loaded in the window so the site finishes the sign-in
//! - downloads (exports) are saved to the Downloads folder; the page is told when one starts and ends (a
//!   "sakdulur:download" DOM event, so it can show a toast) without the page calling into the app

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Manager, Url, Webview, WebviewUrl, WebviewWindowBuilder};
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

/// The site's public pages (landing, Privacy, Terms, with or without /en and /id): marketing pages that don't
/// belong inside the app window.
fn is_public_page(url: &Url) -> bool {
    let path = url.path().trim_end_matches('/');
    let path = path.strip_prefix("/en").or_else(|| path.strip_prefix("/id")).unwrap_or(path);
    matches!(path, "" | "/privacy" | "/terms")
}

/// Public pages open over the app: Safari's sheet on iPhone, the system browser elsewhere. Off the main thread:
/// the window's handlers run there, and the plugin call waits for Swift code that needs the main thread too.
fn open_public_page(app: &AppHandle, url: &Url) {
    let (app, url) = (app.clone(), url.clone());
    std::thread::spawn(move || {
        if tauri_plugin_sakdulur::open_in_app_browser(&app, url.as_str()).is_err() {
            open_outside(&app, &url);
        }
    });
}

/// The site path of a deep link. The API sends com.fahmialfareza.sakdulur://auth/google/complete?code=...
/// (so "auth" parses as the host); the single-slash form :/auth/google/complete is accepted too.
fn deep_link_path(link: &Url) -> Option<String> {
    if link.scheme() != SCHEME {
        return None;
    }
    let path = match link.host_str() {
        Some(host) if !host.is_empty() => format!("/{host}{}", link.path()),
        _ => link.path().to_string(),
    };
    DEEP_LINK_PATHS.iter().any(|p| path.starts_with(p)).then_some(path)
}

/// Loads a deep link in the window: ...://auth/google/complete?code=... -> https://sakdulur.com/auth/google/complete?code=...
fn open_deep_link(app: &AppHandle, link: &Url) {
    let Some(path) = deep_link_path(link) else {
        eprintln!("ignored deep link: {link}");
        return;
    };
    let mut target = site();
    target.set_path(&path);
    target.set_query(link.query());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(target);
        #[cfg(desktop)]
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// dir/name, or dir/"name (1).ext", ... if it exists.
#[cfg(target_os = "ios")]
fn unique_path(dir: std::path::PathBuf, name: &str) -> std::path::PathBuf {
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), format!(".{ext}")),
        _ => (name.to_string(), String::new()),
    };
    let mut path = dir.join(name);
    let mut n = 1;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    path
}

/// Tells the page about a download: window event "sakdulur:download" with {state, id, name}, where state is
/// "started", "finished" or "failed" (handled by apps/frontend components/native/download-toasts.tsx).
fn notify_download(webview: &Webview, state: &str, url: &Url, name: &str) {
    let detail = serde_json::json!({ "state": state, "id": url.as_str(), "name": name });
    let _ = webview.eval(format!(
        "window.dispatchEvent(new CustomEvent('sakdulur:download', {{ detail: {detail} }}))"
    ));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg_attr(mobile, allow(unused_mut))]
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
        .plugin(tauri_plugin_sakdulur::init())
        // Used from Rust only. Its default page script intercepts link clicks and asks the plugin from the page,
        // which the site may not do (no IPC), so external links did nothing; on_navigation handles them instead.
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .setup(|app| {
            let site = site();
            // The only IPC the site gets: the plugin's commands, for pages on the site's own address.
            app.add_capability(
                tauri::ipc::CapabilityBuilder::new("site")
                    .remote(format!("{}/*", SITE_URL.trim_end_matches('/')))
                    .window("main")
                    .permission("sakdulur:allow-apple-authorize"),
            )?;
            let handle = app.handle().clone();
            let nav_handle = handle.clone();
            let nav_site = site.clone();
            let popup_handle = handle.clone();
            let popup_site = site.clone();
            // File names by download URL: macOS does not report the path when a download finishes.
            let downloads: Arc<Mutex<HashMap<String, String>>> = Arc::default();

            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()));
            // Window size is desktop-only: on phones the window is the screen (a fixed size there made the
            // page render its desktop layout, cut off, above a black strip).
            #[cfg(desktop)]
            let builder = builder
                .title("Sakdulur")
                .inner_size(1200.0, 800.0)
                .min_inner_size(360.0, 640.0)
                .zoom_hotkeys_enabled(false);
            let window = builder
                // Read by the launcher (and visible to the site, which does not depend on it).
                .initialization_script(&format!(
                    "window.__SAKDULUR_APP__ = {{ client: {:?}, site: {:?} }};",
                    client(),
                    SITE_URL.trim_end_matches('/')
                ))
                .on_navigation(move |url| {
                    // The site's public pages open over the app (the site turns those links into navigations).
                    if is_internal(url, &nav_site) && is_public_page(url) && url.scheme().starts_with("http") {
                        open_public_page(&nav_handle, url);
                        return false;
                    }
                    if is_internal(url, &nav_site) {
                        return true;
                    }
                    open_outside(&nav_handle, url);
                    false
                })
                // target="_blank" links: the site in this window, its public pages and other sites outside (the site
                // opens Privacy/Terms links this way in the app, see apps/frontend native-bridge.tsx).
                .on_new_window(move |url, _features| {
                    if is_internal(&url, &popup_site) && is_public_page(&url) {
                        open_public_page(&popup_handle, &url);
                    } else if is_internal(&url, &popup_site) {
                        if let Some(window) = popup_handle.get_webview_window("main") {
                            let _ = window.navigate(url);
                        }
                    } else {
                        open_outside(&popup_handle, &url);
                    }
                    NewWindowResponse::Deny
                })
                // Keep the default destination: the Downloads folder, without overwriting existing files.
                .on_download(move |webview, event| {
                    match event {
                        DownloadEvent::Requested { url, destination } => {
                            // iOS has no Downloads folder: save to the app's Documents, shown in Files › Sakdulur
                            // (UIFileSharingEnabled). Same "name (1).ext" rule as the desktop default.
                            #[cfg(target_os = "ios")]
                            if let (Ok(dir), Some(file)) = (webview.path().document_dir(), destination.file_name()) {
                                *destination = unique_path(dir, &file.to_string_lossy());
                            }
                            let name = destination
                                .file_name()
                                .map(|n| n.to_string_lossy().into_owned())
                                .unwrap_or_default();
                            downloads.lock().unwrap().insert(url.to_string(), name.clone());
                            notify_download(&webview, "started", &url, &name);
                        }
                        DownloadEvent::Finished { url, success, .. } => {
                            let name = downloads.lock().unwrap().remove(url.as_str()).unwrap_or_default();
                            notify_download(&webview, if success { "finished" } else { "failed" }, &url, &name);
                        }
                        _ => {}
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

#[cfg(test)]
mod tests {
    use super::*;

    fn path(raw: &str) -> Option<String> {
        deep_link_path(&Url::parse(raw).unwrap())
    }

    #[test]
    fn public_pages() {
        let public = |raw: &str| is_public_page(&Url::parse(raw).unwrap());
        for p in ["https://sakdulur.com/", "https://sakdulur.com/privacy", "https://sakdulur.com/id/terms", "https://sakdulur.com/en", "https://sakdulur.com/en/privacy/"] {
            assert!(public(p), "{p}");
        }
        for p in ["https://sakdulur.com/app", "https://sakdulur.com/auth/login", "https://sakdulur.com/welcome", "https://sakdulur.com/entries", "https://sakdulur.com/privacy-old"] {
            assert!(!public(p), "{p}");
        }
    }

    #[test]
    fn deep_link_paths() {
        // What the API sends (oauth_google.go redirectToMobileApp: scheme + ":/" + "/auth/...").
        assert_eq!(path("com.fahmialfareza.sakdulur://auth/google/complete?code=x").as_deref(), Some("/auth/google/complete"));
        assert_eq!(path("com.fahmialfareza.sakdulur://auth/login?error=google_state").as_deref(), Some("/auth/login"));
        assert_eq!(path("com.fahmialfareza.sakdulur:/auth/google/complete?code=x").as_deref(), Some("/auth/google/complete"));
        assert_eq!(path("com.fahmialfareza.sakdulur://invite?token=t").as_deref(), Some("/invite"));
        assert_eq!(path("com.fahmialfareza.sakdulur://admin/evil"), None);
        assert_eq!(path("https://evil.example/auth/google/complete"), None);
    }
}
