import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const folder = mkdtempSync(join(tmpdir(), "macro-package-"));
const source = fileURLToPath(new URL("../.macro-data/voice-deploy/", import.meta.url));
for (const file of ["server.mjs", "package.json", "package-lock.json"]) copyFileSync(join(source, file), join(folder, file));
const install = spawnSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: folder, stdio: "inherit" });
if (install.status !== 0) { rmSync(folder, { recursive: true, force: true }); process.exit(install.status ?? 1); }
const { buildVoiceServer } = await import(pathToFileURL(join(folder, "server.mjs")).href);
const token = "package-verification-credential-not-a-real-secret";
const app = await buildVoiceServer({ env: {
  production: true, key: "test-only-key", token: "", clientHashes: { test: createHash("sha256").update(token).digest("hex") },
  dailyLimit: 1, usageFile: join(folder, "usage.json"), host: "127.0.0.1", port: 8080,
  model: "test", transcriptionModel: "test", effort: "xhigh"
} });
try {
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal((await fetch(`${url}/v1/status`)).status, 401);
  const status = await fetch(`${url}/v1/status`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).service, "macro-voice");
  console.log("Packaged production server: real HTTP health, denied anonymous access, and authenticated status passed. No OpenAI request was made.");
} finally { await app.close(); rmSync(folder, { recursive: true, force: true }); }
