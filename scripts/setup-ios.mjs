import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { localProxyAddress } from "./local-proxy-address.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const voicePath = resolve(root, "apps/api/.env.voice");
const example = resolve(root, "apps/api/.env.voice.example");
let content = existsSync(voicePath) ? readFileSync(voicePath, "utf8") : readFileSync(example, "utf8");
let settings = dotenv.parse(content);
if (!settings.MACRO_DEV_API_TOKEN || settings.MACRO_DEV_API_TOKEN.length < 24 || settings.MACRO_DEV_API_TOKEN === "GENERATE_LOCALLY") {
  const token = randomBytes(32).toString("hex");
  content = /^MACRO_DEV_API_TOKEN=.*$/m.test(content) ? content.replace(/^MACRO_DEV_API_TOKEN=.*$/m, `MACRO_DEV_API_TOKEN=${token}`) : `${content}\nMACRO_DEV_API_TOKEN=${token}\n`;
}
writeFileSync(voicePath, content, { mode: 0o600 });
chmodSync(voicePath, 0o600);
settings = dotenv.parse(content);
const config = resolve(root, "apps/ios/Config/Local.xcconfig");
mkdirSync(dirname(config), { recursive: true });
if (!existsSync(config)) {
  const apiURL = localProxyAddress(settings).url.replace("://", ":/$()/");
  writeFileSync(config, `MACRO_API_BASE_URL = ${apiURL}\nMACRO_DEV_API_TOKEN = ${settings.MACRO_DEV_API_TOKEN}\nMACRO_BUNDLE_ID = com.macro.local\n// Choose your Apple signing team for a physical device. Simulator needs none.\nMACRO_DEVELOPMENT_TEAM =\n`, { mode: 0o600 });
}
const project = resolve(root, "apps/ios/Macro.xcodeproj");
if (!existsSync(project) || process.argv.includes("--regenerate-project")) {
  const result = spawnSync("ruby", [resolve(root, "scripts/generate-ios-project.rb")], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const sources = [process.env, settings];
const configured = sources.some((source) => source.OPENAI_API_KEY && !/^(YOUR_|replace-with)/i.test(source.OPENAI_API_KEY));
console.log(`Native configuration ready. OpenAI key ${configured ? "found in local server configuration" : "needs filling in apps/api/.env.voice"}.`);
console.log("Open apps/ios/Macro.xcodeproj, choose an iOS 26+ simulator, and Run. Start the proxy with npm run start:voice.");
