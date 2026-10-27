// iOS (Swift, ios/) and Android (Kotlin, android/) halves of the plugin, reached through Tauri's mobile bridge.
use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{AppHandle, Manager, Runtime};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_sakdulur);

struct Handle<R: Runtime>(PluginHandle<R>);

pub fn register<R: Runtime>(app: &AppHandle<R>, api: PluginApi<R, ()>) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_sakdulur)?;
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.fahmialfareza.sakdulur.plugin", "SakdulurPlugin")?;
    app.manage(Handle(handle));
    Ok(())
}

fn call<R: Runtime, T: serde::de::DeserializeOwned>(
    app: &AppHandle<R>,
    method: &str,
    args: impl serde::Serialize,
) -> Result<T, String> {
    app.state::<Handle<R>>().0.run_mobile_plugin(method, args).map_err(|e| e.to_string())
}

#[cfg(target_os = "ios")]
pub fn authorize<R: Runtime>(app: &AppHandle<R>, nonce: String) -> Result<crate::AppleAuthorization, String> {
    call(app, "appleAuthorize", serde_json::json!({ "nonce": nonce }))
}

pub fn open_in_app_browser<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<(), String> {
    call::<R, serde_json::Value>(app, "openInAppBrowser", serde_json::json!({ "url": url })).map(|_| ())
}

#[cfg(target_os = "android")]
pub fn save_file<R: Runtime>(app: &AppHandle<R>, args: crate::SaveFile) -> Result<crate::SavedFile, String> {
    call(app, "saveFile", args)
}
