import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { VoiceEnv } from "./voiceEnv";

const hashes = z.record(z.string().regex(/^[a-z0-9_-]{1,64}$/), z.string().regex(/^[a-f0-9]{64}$/)).refine((value) => Object.keys(value).length <= 20);
const usageSchema = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), calls: z.number().int().nonnegative() }).strict();

export class VoiceAccess {
  private readonly clients: Array<[string, Buffer]>;
  private usage = { day: "", calls: 0 };

  constructor(private readonly env: VoiceEnv, private readonly now = () => new Date()) {
    this.usage.day = now().toISOString().slice(0, 10);
    const configured = hashes.parse(env.clientHashes);
    if (!Number.isInteger(env.dailyLimit) || env.dailyLimit < 1 || env.dailyLimit > 1000) throw new Error("MACRO_VOICE_DAILY_LIMIT must be between 1 and 1000");
    if (env.production && (!Object.keys(configured).length || !env.usageFile || !env.key)) {
      throw new Error("Production voice API requires client hashes, a persistent usage file, and OPENAI_API_KEY");
    }
    this.clients = Object.entries(configured).map(([id, hash]) => [id, Buffer.from(hash, "hex")]);
    if (!env.production) {
      if (env.token.length < 24) throw new Error("Run npm run setup:ios to generate the local proxy token.");
      this.clients.push(["local-development", createHash("sha256").update(env.token).digest()]);
    }
    if (env.usageFile) {
      mkdirSync(dirname(env.usageFile), { recursive: true });
      if (existsSync(env.usageFile)) this.usage = usageSchema.parse(JSON.parse(readFileSync(env.usageFile, "utf8")));
      else this.persist();
    }
  }

  authenticate(authorization: string | undefined): string | undefined {
    if (!authorization?.startsWith("Bearer ") || authorization.length > 512) return undefined;
    const digest = createHash("sha256").update(authorization.slice(7)).digest();
    return this.clients.find(([, expected]) => timingSafeEqual(digest, expected))?.[0];
  }

  reserveCall() {
    const day = this.now().toISOString().slice(0, 10);
    if (this.usage.day !== day) this.usage = { day, calls: 0 };
    if (this.usage.calls >= this.env.dailyLimit) {
      throw Object.assign(new Error("The daily AI-call limit has been reached. Try tomorrow or add this meal manually. Your draft is saved."), { statusCode: 429, code: "daily_limit" });
    }
    this.usage.calls++;
    // Persist before paid work. A corrupt/unwritable counter fails closed, not open.
    this.persist();
  }

  private persist() {
    if (!this.env.usageFile) return;
    const temporary = `${this.env.usageFile}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.usage), { mode: 0o600 });
    renameSync(temporary, this.env.usageFile);
  }
}
