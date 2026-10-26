// swift-tools-version:5.3
import PackageDescription

let package = Package(
  name: "tauri-plugin-sakdulur",
  platforms: [.iOS(.v13)],
  products: [
    .library(name: "tauri-plugin-sakdulur", type: .static, targets: ["tauri-plugin-sakdulur"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(name: "tauri-plugin-sakdulur", dependencies: [.byName(name: "Tauri")], path: "Sources")
  ]
)
