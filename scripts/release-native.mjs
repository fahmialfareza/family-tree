// pnpm release <android|ios|macos|windows|linux> <build-number>
// Starts the platform's release workflow on GitHub Actions (see apps/native/RELEASE.md).
import { spawnSync } from "node:child_process";

const [platform, buildNumber] = process.argv.slice(2);
const env = process.env;

const workflows = {
  android: {
    file: "native-android-play-store.yml",
    inputs: { track: env.SAKDULUR_ANDROID_TRACK || "internal", status: env.SAKDULUR_ANDROID_STATUS || "completed" },
  },
  ios: {
    file: "native-ios-app-store.yml",
    inputs: { export_method: env.SAKDULUR_IOS_EXPORT_METHOD || "app-store-connect" },
  },
  macos: { file: "native-macos-app-store.yml", inputs: {} },
  windows: { file: "native-windows-msix.yml", inputs: {} },
  linux: {
    file: "native-linux-snapcraft.yml",
    inputs: { channel: env.SAKDULUR_SNAP_CHANNEL || "stable" },
  },
};

const workflow = workflows[platform];
if (!workflow) fail(`Usage: pnpm release <${Object.keys(workflows).join("|")}> <build-number>`);
if (!/^[1-9]\d*$/.test(buildNumber ?? "")) fail("Build number must be a positive integer, for example: pnpm release android 100");

const build = Number(buildNumber);
const version = `${Math.floor(build / 100)}.${Math.floor((build % 100) / 10)}.${build % 10}`;
const ref = env.SAKDULUR_RELEASE_REF || currentBranch();

run(["auth", "status"], "GitHub CLI is not signed in. Run `gh auth login` first.");
const args = ["workflow", "run", workflow.file, "--ref", ref, "-f", `build_number=${buildNumber}`];
for (const [key, value] of Object.entries(workflow.inputs)) args.push("-f", `${key}=${value}`);
run(args);

console.log(
  [
    `Started ${workflow.file}: Sakdulur ${version} (build ${buildNumber}) for ${platform} from ${ref}.`,
    `Watch it: gh run list --workflow ${workflow.file} --limit 5`,
  ].join("\n"),
);

function currentBranch() {
  const out = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" });
  return out.stdout.trim() || "main";
}

function run(args, message) {
  const result = spawnSync("gh", args, { stdio: "inherit" });
  if (result.status !== 0) fail(message || `Command failed: gh ${args.join(" ")}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
