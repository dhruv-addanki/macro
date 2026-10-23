import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const paths = [resolve(root, "apps/api/.env.voice")];
const sources = [process.env, ...paths.filter(existsSync).map((path) => dotenv.parse(readFileSync(path)))];
const setting = (key: string, fallback = "") => sources.map((source) => source[key]?.trim()).find((value) => value && !/^(YOUR_|GENERATE_|MATCH_|replace-with)/i.test(value)) ?? fallback;

export function readVoiceEnv() {
  const production = setting("NODE_ENV") === "production";
  const port = Number(production ? setting("PORT", setting("MACRO_VOICE_PORT", "4001")) : setting("MACRO_VOICE_PORT", "4001"));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid MACRO_VOICE_PORT");
  const effort = setting("MACRO_VOICE_REASONING_EFFORT", "xhigh");
  if (!["none", "low", "medium", "high", "xhigh", "max"].includes(effort)) throw new Error("Invalid reasoning effort");
  return {
    key: setting("OPENAI_API_KEY"), token: setting("MACRO_DEV_API_TOKEN"),
    host: setting("MACRO_VOICE_HOST", production ? "0.0.0.0" : "127.0.0.1"), port,
    production,
    clientHashes: JSON.parse(setting("MACRO_VOICE_CLIENT_HASHES", "{}")) as Record<string, string>,
    dailyLimit: Number(setting("MACRO_VOICE_DAILY_LIMIT", "60")),
    usageFile: setting("MACRO_VOICE_USAGE_FILE") || undefined,
    model: setting("MACRO_VOICE_MODEL", "gpt-6-luna"),
    transcriptionModel: setting("MACRO_TRANSCRIPTION_MODEL", "gpt-transcribe"),
    effort: effort as "none" | "low" | "medium" | "high" | "xhigh" | "max"
  };
}

export type VoiceEnv = ReturnType<typeof readVoiceEnv>;
