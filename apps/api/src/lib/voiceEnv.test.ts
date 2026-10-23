import { afterEach, expect, it, vi } from "vitest";
import { readVoiceEnv } from "./voiceEnv";

afterEach(() => vi.unstubAllEnvs());

it("keeps the LAN voice port independent of the old API's PORT", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("PORT", "4000");
  vi.stubEnv("MACRO_VOICE_PORT", "4411");
  expect(readVoiceEnv().port).toBe(4411);
});

it("uses the hosting provider's PORT in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PORT", "8080");
  vi.stubEnv("MACRO_VOICE_PORT", "4411");
  expect(readVoiceEnv().port).toBe(8080);
});
