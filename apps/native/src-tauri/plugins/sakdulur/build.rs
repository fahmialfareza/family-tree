const COMMANDS: &[&str] = &["apple_authorize", "save_file"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").android_path("android").build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        compile_macos_apple_sign_in();
    }
}

/// macOS has no Tauri plugin bridge for Swift: compile macos/AppleSignIn.swift into a static library that
/// src/macos.rs calls through C (the approach Malanghub uses).
fn compile_macos_apple_sign_in() {
    use std::process::Command;
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    // macOS 13+: older targets make swiftc reference back-deployment libraries that newer SDKs lack.
    let target = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("x86_64") => "x86_64-apple-macos13.0",
        _ => "arm64-apple-macos13.0",
    };
    println!("cargo:rerun-if-changed=macos/AppleSignIn.swift");
    let status = Command::new("xcrun")
        .args(["swiftc", "-parse-as-library", "-emit-library", "-static", "-target", target,
            "-module-name", "SakdulurAppleSignIn", "-o", &format!("{out_dir}/libSakdulurAppleSignIn.a"),
            &format!("{manifest_dir}/macos/AppleSignIn.swift")])
        .status()
        .expect("xcrun swiftc failed (is Xcode installed?)");
    assert!(status.success(), "compiling macos/AppleSignIn.swift failed");
    if let Ok(out) = Command::new("xcrun").args(["--find", "swiftc"]).output() {
        if let Some(usr) = String::from_utf8_lossy(&out.stdout).trim().strip_suffix("/bin/swiftc") {
            println!("cargo:rustc-link-search={usr}/lib/swift/macosx");
        }
    }
    println!("cargo:rustc-link-search=native={out_dir}");
    println!("cargo:rustc-link-lib=static=SakdulurAppleSignIn");
    println!("cargo:rustc-link-lib=framework=AuthenticationServices");
}
