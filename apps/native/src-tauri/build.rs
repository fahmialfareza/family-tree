fn main() {
    // Android 15+ devices (and Google Play for new apps) need native code aligned to 16 KB memory pages. Set here
    // rather than in .cargo/config.toml, because the Tauri CLI passes its own RUSTFLAGS, which override that file.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-cdylib-link-arg=-Wl,-z,max-page-size=16384");
    }
    tauri_build::build()
}
