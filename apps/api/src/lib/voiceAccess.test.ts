import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VoiceAccess } from "./voiceAccess";
import type { VoiceEnv } from "./voiceEnv";

const directories: string[] = [];
const token = "test-production-device-credential-32-bytes";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function environment(): VoiceEnv {
  const folder = mkdtempSync(join(tmpdir(), "macro-voice-access-"));
  directories.push(folder);
  return { production: true, clientHashes: { iphone: digest(token) }, dailyLimit: 2, usageFile: join(folder, "usage.json"), key: "fake-test-key", token: "local-token-not-valid-in-production", host: "0.0.0.0", port: 8080, model: "test", transcriptionModel: "test", effort: "xhigh" };
}
afterEach(() => { for (const folder of directories.splice(0)) rmSync(folder, { recursive: true, force: true }); });

describe("hosted voice access", () => {
  it("accepts only provisioned hashes and supports revocation", () => {
    const env = environment();
    const access = new VoiceAccess(env);
    expect(access.authenticate(`Bearer ${token}`)).toBe("iphone");
    expect(access.authenticate(`Bearer ${env.token}`)).toBeUndefined();
    expect(access.authenticate(token)).toBeUndefined();
    expect(access.authenticate("Bearer wrong")).toBeUndefined();
    const rotated = new VoiceAccess({ ...env, clientHashes: { iphone: digest("a-new-credential") } });
    expect(rotated.authenticate(`Bearer ${token}`)).toBeUndefined();
  });

  it("fails closed without a key, client hashes, persistent counter, or valid limit", () => {
    const env = environment();
    expect(() => new VoiceAccess({ ...env, key: "" })).toThrow();
    expect(() => new VoiceAccess({ ...env, clientHashes: {} })).toThrow();
    expect(() => new VoiceAccess({ ...env, usageFile: undefined })).toThrow();
    expect(() => new VoiceAccess({ ...env, dailyLimit: NaN })).toThrow();
    expect(() => new VoiceAccess({ ...env, clientHashes: { iphone: "plaintext" } })).toThrow();
  });

  it("persists the daily cap across restarts and resets on the next UTC day", () => {
    const env = environment();
    const now = () => new Date("2026-10-22T23:59:59Z");
    const first = new VoiceAccess(env, now);
    first.reserveCall();
    const second = new VoiceAccess(env, now);
    second.reserveCall();
    expect(() => second.reserveCall()).toThrow("daily AI-call limit");
    expect(() => new VoiceAccess(env, now).reserveCall()).toThrow("daily AI-call limit");
    const nextDay = new VoiceAccess(env, () => new Date("2026-10-23T00:00:00Z"));
    expect(() => nextDay.reserveCall()).not.toThrow();
    expect(JSON.parse(readFileSync(env.usageFile!, "utf8"))).toEqual({ day: "2026-10-23", calls: 1 });
    expect(readFileSync(env.usageFile!, "utf8")).not.toContain(token);
  });

  it("does not reset a corrupt persisted counter", () => {
    const env = environment();
    writeFileSync(env.usageFile!, "not JSON");
    expect(() => new VoiceAccess(env)).toThrow();
  });
});
