import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const folder = resolve(dirname(fileURLToPath(import.meta.url)), "../.macro-data");
const file = resolve(folder, "voice-private.json");
mkdirSync(folder, { recursive: true });
if (!existsSync(file)) {
  const tokens = Object.fromEntries(["iphone", "verification"].map((id) => [id, randomBytes(32).toString("base64url")]));
  const hashes = Object.fromEntries(Object.entries(tokens).map(([id, token]) => [id, createHash("sha256").update(token).digest("hex")]));
  writeFileSync(file, JSON.stringify({ tokens, hashes }, null, 2) + "\n", { mode: 0o600 });
}
chmodSync(file, 0o600);
const credentials = JSON.parse(readFileSync(file, "utf8"));
const url = process.argv[2];
if (url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("Use an HTTPS API URL without credentials or a query");
  for (const [id, token] of Object.entries(credentials.tokens)) {
    const destination = resolve(folder, `api-connection-${id}.json`);
    writeFileSync(destination, JSON.stringify({ url: parsed.origin, token }) + "\n", { mode: 0o600 });
    chmodSync(destination, 0o600);
  }
}
console.log("Private credentials ready in ignored .macro-data/voice-private.json. No credential was printed; existing credentials were preserved.");
