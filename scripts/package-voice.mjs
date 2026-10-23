import { buildSync } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, ".macro-data/voice-deploy");
const require = createRequire(resolve(root, "apps/api/package.json"));
const dependencies = {};
for (const name of ["fastify", "@fastify/multipart", "openai", "zod", "dotenv"]) {
  let folder = dirname(require.resolve(name));
  while (folder !== dirname(folder)) {
    const file = resolve(folder, "package.json");
    if (existsSync(file)) {
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      if (manifest.name === name) { dependencies[name] = manifest.version; break; }
    }
    folder = dirname(folder);
  }
  if (!dependencies[name]) throw new Error(`Cannot resolve installed version of ${name}`);
}
mkdirSync(output, { recursive: true });
const allowed = new Set(["server.mjs", "package.json", "package-lock.json", "Dockerfile", "railway.json"]);
if (readdirSync(output).some((file) => !allowed.has(file))) throw new Error("Unexpected file in the deployment folder; refusing to package it");
buildSync({ entryPoints: [resolve(root, "apps/api/src/aiServer.ts")], outfile: resolve(output, "server.mjs"), bundle: true, platform: "node", format: "esm", target: "node22", external: Object.keys(dependencies), logLevel: "warning" });
writeFileSync(resolve(output, "package.json"), JSON.stringify({ name: "macro-voice-api", version: "0.1.0", private: true, type: "module", engines: { node: ">=22" }, scripts: { start: "node server.mjs" }, dependencies }, null, 2) + "\n");
for (const file of ["Dockerfile", "railway.json"]) copyFileSync(resolve(root, "deploy/voice", file), resolve(output, file));
const result = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: output, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Voice-only upload prepared at ${output}. No environment files, credentials, or iOS data included.`);
