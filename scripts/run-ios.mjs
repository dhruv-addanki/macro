import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed. Check Xcode is installed and selected with xcode-select.`);
  return result.stdout;
}

try {
  run(process.execPath, [resolve(root, "scripts/setup-ios.mjs")]);
  run(process.execPath, [resolve(root, "scripts/voice-proxy.mjs"), "start"]);
  const inventory = JSON.parse(run("xcrun", ["simctl", "list", "devices", "available", "--json"], true));
  const devices = Object.entries(inventory.devices).filter(([runtime]) => Number(runtime.match(/iOS-(\d+)/)?.[1] ?? 0) >= 26)
    .flatMap(([, devices]) => devices).filter((device) => device.name.startsWith("iPhone"));
  const device = process.env.MACRO_SIMULATOR_UDID ? devices.find((item) => item.udid === process.env.MACRO_SIMULATOR_UDID) :
    devices.find((item) => item.state === "Booted") ?? devices.find((item) => item.name === "iPhone 18 Pro") ?? devices[0];
  if (!device) throw new Error("Install an iOS 26+ iPhone simulator in Xcode > Settings > Components.");
  if (device.state !== "Booted") run("xcrun", ["simctl", "boot", device.udid]);
  run("xcrun", ["simctl", "bootstatus", device.udid, "-b"]);
  const developerDirectory = run("xcode-select", ["-p"], true).trim();
  const simulator = resolve(developerDirectory, "Applications/Simulator.app");
  const deviceHub = resolve(developerDirectory, "../Applications/DeviceHub.app");
  if (existsSync(simulator)) run("open", ["-a", simulator, "--args", "-CurrentDeviceUDID", device.udid]);
  else if (existsSync(deviceHub)) run("open", ["-a", deviceHub]);
  else console.warn("No device viewer found. Open Xcode > Open Developer Tool > Device Hub after installation.");
  mkdirSync(resolve(root, ".macro-data"), { recursive: true });
  run("xcodebuild", ["-project", "apps/ios/Macro.xcodeproj", "-scheme", "Macro", "-configuration", "Debug",
    "-destination", `platform=iOS Simulator,id=${device.udid}`, "-derivedDataPath", "apps/ios/DerivedData", "CODE_SIGNING_ALLOWED=NO", "build"]);
  run("xcrun", ["simctl", "install", device.udid, "apps/ios/DerivedData/Build/Products/Debug-iphonesimulator/Macro.app"]);
  const info = "apps/ios/DerivedData/Build/Products/Debug-iphonesimulator/Macro.app/Info.plist";
  const bundleID = run("/usr/libexec/PlistBuddy", ["-c", "Print CFBundleIdentifier", info], true).trim();
  spawnSync("xcrun", ["simctl", "terminate", device.udid, bundleID], { cwd: root, stdio: "ignore" });
  run("xcrun", ["simctl", "launch", device.udid, bundleID]);
  console.log(`Macro is open on ${device.name}. Your diary is local; the AI proxy is running on port 4001 by default.`);
  if (!existsSync(simulator)) console.log(`In Device Hub, select ${device.name} in the sidebar if another device is selected.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
