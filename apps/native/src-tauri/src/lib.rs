//! Sakdulur for desktop and mobile: one window showing the bundled app (apps/native: apps/frontend's screens built
//! with Vite), which calls the API directly. `window.__SAKDULUR_APP__ = { client, site }` tells it the platform.
//!
//! The app's native access is the sakdulur plugin's commands (plugins/sakdulur: Sign in with Apple on iPhone and
//! Mac, saving files on phones), granted in capabilities/default.json. The rest of the app's part is here:
//! - keeps the window on the app: other addresses (Google sign-in, WhatsApp, mailto, the API's sign-in pages) open
//!   in the system browser or app, never inside the window; the website's public pages (Privacy, Terms) open over it
//! - deep links: Google sign-in returns through com.fahmialfareza.sakdulur:/auth/google/complete?..., which the
//!   window opens as the app's own /auth/google/complete?... so the app finishes the sign-in
//! - no page zoom (pinch, double-tap, Ctrl+scroll, Ctrl/Cmd +/-), like a native app
//! - downloads (exports) are saved to the Downloads folder; the page is told when one starts and ends (a
//!   "sakdulur:download" DOM event, so it can show a toast) without the page calling into the app

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, Url, Webview, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

/// The public website, for its Privacy and Terms pages (the app links to them).
const SITE_URL: &str = match option_env!("SAKDULUR_SITE_URL") {
    Some(url) => url,
    None => "https://sakdulur.com",
};
/// Custom URL scheme (also the app identifier); the API's MOBILE_APP_SCHEME must match.
const SCHEME: &str = "com.fahmialfareza.sakdulur";
/// Paths a deep link may open in the app: one ending in "/" covers the paths under it, the others match exactly.
const DEEP_LINK_PATHS: [&str; 2] = ["/auth/", "/invite"];
/// Links handed to the system browser or app; any other scheme (file:, other apps' schemes) is ignored.
const OUTSIDE_SCHEMES: [&str; 5] = ["http", "https", "mailto", "tel", "whatsapp"];

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

/// Pages the window may show: the bundled app (and, in development, its Vite dev server).
fn is_internal(url: &Url, dev: Option<&Url>) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "about" | "blob" | "data" => true,
        // Windows and Android serve bundled files from http(s)://tauri.localhost.
        "http" | "https" => url.host_str() == Some("tauri.localhost") || dev.is_some_and(|dev| same_origin(url, dev)),
        _ => false,
    }
}

fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme() && a.host_str() == b.host_str() && a.port_or_known_default() == b.port_or_known_default()
}

/// Opens a URL in the system browser or app. Off the main thread: the window's handlers run there, and on Android
/// the opener waits for Kotlin code that needs that thread too, so calling it inline froze the app ("not responding").
fn open_outside(app: &AppHandle, url: &Url) {
    if !OUTSIDE_SCHEMES.contains(&url.scheme()) {
        eprintln!("ignored link: {url}");
        return;
    }
    let (app, url) = (app.clone(), url.clone());
    std::thread::spawn(move || open_outside_now(&app, &url));
}

fn open_outside_now(app: &AppHandle, url: &Url) {
    if let Err(err) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("could not open {url}: {err}");
    }
}

/// The website's public pages (Privacy, Terms, with or without /en and /id), which the app links to by path
/// (apps/frontend native-bridge.tsx turns those links into navigations). The app's "/" is its own start.
fn public_page(url: &Url) -> Option<&str> {
    let path = url.path().trim_end_matches('/');
    let page = path.strip_prefix("/en").or_else(|| path.strip_prefix("/id")).unwrap_or(path);
    let localized = page.len() != path.len();
    (matches!(page, "/privacy" | "/terms") || (localized && page.is_empty())).then_some(path)
}

/// Public pages open over the app, from the website: Safari's sheet on iPhone, the system browser elsewhere. Off
/// the main thread: the window's handlers run there, and the plugin call waits for Swift code that needs the main
/// thread too.
fn open_public_page(app: &AppHandle, path: &str) {
    let mut url = site();
    url.set_path(path);
    let app = app.clone();
    std::thread::spawn(move || {
        if tauri_plugin_sakdulur::open_in_app_browser(&app, url.as_str()).is_err() {
            open_outside_now(&app, &url);
        }
    });
}

/// The app path of a deep link. The API sends com.fahmialfareza.sakdulur://auth/google/complete?code=...
/// (so "auth" parses as the host); the single-slash form :/auth/google/complete is accepted too.
fn deep_link_path(link: &Url) -> Option<String> {
    if link.scheme() != SCHEME {
        return None;
    }
    let path = match link.host_str() {
        Some(host) if !host.is_empty() => format!("/{host}{}", link.path()),
        _ => link.path().to_string(),
    };
    DEEP_LINK_PATHS
        .iter()
        .any(|p| if p.ends_with('/') { path.starts_with(p) } else { path == *p })
        .then_some(path)
}

/// A deep link that arrived before the app's page loaded (it started the app): opened once it has.
#[derive(Default)]
struct PendingLink(Mutex<Option<String>>);

/// Whether the app's page has loaded, kept by on_page_load (read instead of window.url(): on Android the deep link
/// arrives on the main thread, which window.url() then blocks until it times out, and wry panics answering it late).
#[derive(Default)]
struct Loaded(AtomicBool);

/// Opens a deep link in the app: ...://auth/google/complete?code=... -> /auth/google/complete?code=...
fn open_deep_link(app: &AppHandle, link: &Url) {
    let Some(path) = deep_link_path(link) else {
        eprintln!("ignored deep link: {link}");
        return;
    };
    let target = match link.query() {
        Some(q) => format!("{path}?{q}"),
        None => path,
    };
    if !app.state::<Loaded>().0.load(Ordering::SeqCst) {
        *app.state::<PendingLink>().0.lock().unwrap() = Some(target);
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        // A whole load of the app at that path (it serves index.html for every path).
        let target = serde_json::to_string(&target).unwrap_or_default();
        let _ = window.eval(format!("location.assign({target});"));
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
        .manage(PendingLink::default())
        .manage(Loaded::default())
        .setup(|app| {
            // `tauri dev` shows the Vite dev server (devUrl) instead of the bundled files.
            let dev = if cfg!(debug_assertions) { app.config().build.dev_url.clone() } else { None };
            let handle = app.handle().clone();
            let nav_handle = handle.clone();
            let nav_dev = dev.clone();
            let popup_handle = handle.clone();
            let popup_dev = dev.clone();
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
                // The platform, for the app (apps/frontend lib/native.ts nativePlatform).
                .initialization_script(&format!(
                    "window.__SAKDULUR_APP__ = {{ client: {:?}, site: {:?} }};",
                    client(),
                    SITE_URL.trim_end_matches('/')
                ))
                // No page zoom in the app (pinch, double-tap, Ctrl+scroll); see src/no_zoom.js.
                .initialization_script(include_str!("no_zoom.js"))
                .on_navigation(move |url| {
                    if is_internal(url, nav_dev.as_ref()) {
                        // The website's public pages open over the app.
                        if let Some(path) = public_page(url) {
                            open_public_page(&nav_handle, path);
                            return false;
                        }
                        return true;
                    }
                    open_outside(&nav_handle, url);
                    false
                })
                // target="_blank" links: the app's own paths in this window, public pages over it, other sites outside.
                .on_new_window(move |url, _features| {
                    if !is_internal(&url, popup_dev.as_ref()) {
                        open_outside(&popup_handle, &url);
                    } else if let Some(path) = public_page(&url) {
                        open_public_page(&popup_handle, path);
                    } else if let Some(window) = popup_handle.get_webview_window("main") {
                        let _ = window.navigate(url);
                    }
                    NewWindowResponse::Deny
                })
                // The app has loaded: open a deep link that arrived before (it started the app).
                .on_page_load(move |webview, payload| {
                    if payload.event() == PageLoadEvent::Finished {
                        webview.state::<Loaded>().0.store(true, Ordering::SeqCst);
                        let pending = webview.state::<PendingLink>().0.lock().unwrap().take();
                        if let Some(target) = pending {
                            let target = serde_json::to_string(&target).unwrap_or_default();
                            let _ = webview.eval(format!("location.replace({target});"));
                        }
                    }
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
    fn internal_pages() {
        let url = |raw: &str| Url::parse(raw).unwrap();
        let dev = url("http://localhost:1420");
        for app in ["http://tauri.localhost/app", "https://tauri.localhost/index.html", "tauri://localhost/app/t/x"] {
            assert!(is_internal(&url(app), None), "{app}");
        }
        assert!(is_internal(&url("http://localhost:1420/app"), Some(&dev)));
        for outside in ["https://sakdulur.com/app", "http://localhost:4000/api/auth/google/start", "https://accounts.google.com/"] {
            assert!(!is_internal(&url(outside), Some(&dev)), "{outside}");
        }
    }

    #[test]
    fn public_pages() {
        let public = |raw: &str| public_page(&Url::parse(raw).unwrap()).map(str::to_string);
        assert_eq!(public("tauri://localhost/privacy").as_deref(), Some("/privacy"));
        assert_eq!(public("http://tauri.localhost/id/terms/").as_deref(), Some("/id/terms"));
        assert_eq!(public("tauri://localhost/en").as_deref(), Some("/en"));
        for p in ["tauri://localhost/", "tauri://localhost/app", "tauri://localhost/auth/login", "tauri://localhost/welcome", "tauri://localhost/entries", "tauri://localhost/privacy-old"] {
            assert_eq!(public(p), None, "{p}");
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
        assert_eq!(path("com.fahmialfareza.sakdulur://invite/../app/t/x"), None);
        assert_eq!(path("com.fahmialfareza.sakdulur://invitee"), None);
        assert_eq!(path("https://evil.example/auth/google/complete"), None);
    }
}
