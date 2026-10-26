use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{AppHandle, Manager, Runtime};

use crate::AppleAuthorization;

tauri::ios_plugin_binding!(init_plugin_sakdulur);

struct Handle<R: Runtime>(PluginHandle<R>);

pub fn register<R: Runtime>(app: &AppHandle<R>, api: PluginApi<R, ()>) -> Result<(), Box<dyn std::error::Error>> {
    let handle = api.register_ios_plugin(init_plugin_sakdulur)?;
    app.manage(Handle(handle));
    Ok(())
}

#[derive(serde::Serialize)]
struct Args {
    nonce: String,
}

pub fn authorize<R: Runtime>(app: &AppHandle<R>, nonce: String) -> Result<AppleAuthorization, String> {
    app.state::<Handle<R>>()
        .0
        .run_mobile_plugin("appleAuthorize", Args { nonce })
        .map_err(|e| e.to_string())
}
