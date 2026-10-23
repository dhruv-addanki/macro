import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { localProxyAddress } from "./local-proxy-address.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = resolve(root, ".macro-data");
mkdirSync(data, { recursive: true });
const pidPath = resolve(data, "voice-proxy.pid");
const action = process.argv[2] ?? "start";
const envFile = resolve(root, "apps/api/.env.voice");
if (!existsSync(envFile)) { console.error("Run npm run setup:ios first."); process.exit(1); }
const settings = dotenv.parse(readFileSync(envFile));
const { port, url: baseURL } = localProxyAddress(settings);
const url = `${baseURL}/health`;

if (action === "stop") {
  if (existsSync(pidPath)) {
    const pid = Number(readFileSync(pidPath, "utf8"));
    try { process.kill(pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    unlinkSync(pidPath);
  }
  console.log("Local voice proxy stopped.");
} else {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    const health = await response.json();
    if (health.service === "macro-voice") { console.log(`Voice proxy is already running at ${baseURL}`); process.exit(0); }
    throw new Error(`Port ${port} is occupied by a different service. Change MACRO_VOICE_PORT and the app API URL.`);
  } catch (error) {
    if (error.message?.includes("occupied")) throw error;
  }
  const log = openSync(resolve(data, "voice-proxy.log"), "a", 0o600);
  const child = spawn(process.execPath, [resolve(root, "node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/api/src/aiServer.ts")], { cwd: root, detached: true, stdio: ["ignore", log, log] });
  writeFileSync(pidPath, String(child.pid), { mode: 0o600 });
  child.unref();
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      const health = await response.json();
      if (health.service === "macro-voice") { ready = true; break; }
    } catch {}
  }
  if (!ready) { console.error("Proxy failed to start. Check .macro-data/voice-proxy.log."); process.exit(1); }
  console.log(`Voice proxy running at ${baseURL}. Logs: .macro-data/voice-proxy.log`);
}
