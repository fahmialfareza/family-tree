// Stamps a store release into the app's version files (run by the release workflows, not committed).
//   node set-release-version.mjs <build-number> [version]
// Build number 100 → version 1.0.0, 123 → 1.2.3, unless a version is given (e.g. build 101 still as 1.0.0 while
// 1.0.0 is in review); the build number itself is the store build (Android versionCode, iOS/macOS CFBundleVersion).
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [buildNumber, versionArg] = process.argv.slice(2);
if (!/^[1-9]\d*$/.test(buildNumber ?? "")) {
  throw new Error("Build number must be a positive integer, for example 100.");
}

const build = Number(buildNumber);
if (versionArg && !/^\d+\.\d+\.\d+$/.test(versionArg)) throw new Error("Version must look like 1.2.3.");
const version = versionArg || `${Math.floor(build / 100)}.${Math.floor((build % 100) / 10)}.${build % 10}`;

const repoRoot = resolve(import.meta.dirname, "../../..");
const nativeDir = resolve(repoRoot, "apps/native");

function updateJson(path, update) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  update(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceIn(path, pattern, replacement) {
  const source = readFileSync(path, "utf8");
  if (!pattern.test(source)) throw new Error(`No version line in ${path}`);
  writeFileSync(path, source.replace(pattern, replacement));
}

updateJson(resolve(nativeDir, "package.json"), (pkg) => {
  pkg.version = version;
});

updateJson(resolve(nativeDir, "src-tauri/tauri.conf.json"), (config) => {
  config.version = version;
  config.bundle ??= {};
  config.bundle.android = { ...config.bundle.android, versionCode: build };
  config.bundle.iOS = { ...config.bundle.iOS, bundleVersion: buildNumber };
  config.bundle.macOS = { ...config.bundle.macOS, bundleVersion: buildNumber };
});

replaceIn(resolve(nativeDir, "src-tauri/Cargo.toml"), /^version = ".*"$/m, `version = "${version}"`);
replaceIn(resolve(repoRoot, "snap/snapcraft.yaml"), /^version: .*$/m, `version: "${version}"`);

if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, `RELEASE_VERSION=${version}\n`);
}

console.log(`Prepared Sakdulur ${version} (build ${buildNumber}).`);
