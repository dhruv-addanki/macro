import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { buildVoiceServer } from "../aiServer";
import { type VoiceInterpretRequest, type VoiceInterpretResult, validateVoiceResult } from "@macro/shared";

const env = { key: "", token: "test-token-long-enough-for-local-only", host: "127.0.0.1", port: 4001, model: "gpt-6-luna", transcriptionModel: "gpt-transcribe", effort: "xhigh" as const, production: false, clientHashes: {}, dailyLimit: 60, usageFile: undefined };
const food = { name: "Pesto", portion: "2 tablespoons", nutrition: { calories: 110, proteinG: 2, fatG: 10, carbsG: 3, sugarG: null, fiberG: null, sodiumMg: null }, ingredients: [], source: "user_reported" as const };
const log = { date: "2026-10-22", title: "Toast and pesto", foods: [food], assumptions: [] };
const input: VoiceInterpretRequest = { requestID: "e069b60a-1d77-4833-9215-901ee957e88c", text: "Two tablespoons of pesto, not four", selectedDate: "2026-10-22", captureDate: "2026-10-22", capturedAt: "2026-10-22T23:00:00Z", timeZone: "America/New_York", target: null, recentLogs: [], previousQuestion: null };
const response: VoiceInterpretResult = { schemaVersion: 1, action: "create", logs: [log], targetLogID: null, expectedRevision: null, question: null };
const headers = { authorization: `Bearer ${env.token}` };

describe("native voice proxy", () => {
  it("deduplicates each phase of a local history lookup independently", async () => {
    const lookup = { ...response, action: "lookup_history" as const, logs: [], historyQueries: ["garlic bread"] };
    const interpret = vi.fn(async (request: VoiceInterpretRequest) => request.history?.phase === "initial" ? lookup : response);
    const app = await buildVoiceServer({ env, ai: { interpret, transcribe: async () => "Hello" } });
    try {
      const initial = { ...input, text: "The same garlic bread we logged before", history: { phase: "initial", queries: [], matches: [] } };
      const resolved = { ...initial, requestID: "bb865375-11f1-4a35-867f-a4b62cff4aac", history: { phase: "resolved", queries: ["garlic bread"], matches: [{ id: "snapshot", date: "2026-01-01", food }] } };
      const send = (payload: unknown) => app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: payload as object });
      expect((await send(initial)).json().action).toBe("lookup_history");
      expect((await send(initial)).json().action).toBe("lookup_history");
      expect((await send(resolved)).json().action).toBe("create");
      expect((await send(resolved)).json().action).toBe("create");
      expect(interpret).toHaveBeenCalledTimes(2);
    } finally { await app.close(); }
  });

  it.each([false, true])("accepts bounded imported history for new meals and corrections (correction=%s)", async (correction) => {
    const imported = { ...log, id: "57a88780-d43e-45e7-b10b-e70a412bb7ab", revision: 3,
      foods: [{ ...food, source: "imported_daily_estimate", ingredients: Array.from({ length: 35 }, () => "i".repeat(300)) }],
      assumptions: Array.from({ length: 32 }, () => "a".repeat(600)) };
    const payload = { ...input, recentLogs: [imported], target: correction ? imported : null };
    const original = structuredClone(payload);
    const result = correction ? { ...response, action: "update" as const, targetLogID: imported.id, expectedRevision: imported.revision } : response;
    const interpret = vi.fn(async (_request: VoiceInterpretRequest) => result);
    const app = await buildVoiceServer({ env, ai: { interpret, transcribe: async () => "Hello" } });
    try {
      const send = () => app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload });
      expect((await send()).statusCode).toBe(200);
      expect((await send()).json()).toEqual(result);
      expect(interpret).toHaveBeenCalledTimes(1);
      const received = interpret.mock.calls[0]![0];
      const history = received.recentLogs[0]!;
      expect(history.id).toBe(imported.id);
      expect(history.revision).toBe(imported.revision);
      expect(history.foods[0]!.source).toBe("history");
      expect(history.foods[0]!.nutrition).toEqual(food.nutrition);
      expect(history.foods[0]!.ingredients).toEqual(Array(30).fill("i".repeat(200)));
      expect(history.assumptions).toEqual(Array(20).fill("a".repeat(500)));
      if (correction) expect(received.target).toEqual(history);
      expect(payload).toEqual(original);
    } finally { await app.close(); }
  });

  it("keeps imported context nutrition and model output validation strict", async () => {
    const imported = { ...log, id: "57a88780-d43e-45e7-b10b-e70a412bb7ab", revision: 3,
      foods: [{ ...food, source: "imported_daily_estimate", nutrition: { ...food.nutrition, calories: -1 } }] };
    const interpret = vi.fn(async () => response);
    const app = await buildVoiceServer({ env, ai: { interpret, transcribe: async () => "Hello" } });
    try {
      expect((await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: { ...input, recentLogs: [imported] } })).statusCode).toBe(422);
      const unknownSource = { ...imported, foods: [{ ...food, source: "unknown_source" }] };
      expect((await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: { ...input, recentLogs: [unknownSource] } })).statusCode).toBe(422);
      expect(interpret).not.toHaveBeenCalled();
      expect(() => validateVoiceResult({ ...response, logs: [{ ...log, foods: [{ ...food, source: "imported_daily_estimate" }] }] }, input)).toThrow();
      expect(() => validateVoiceResult({ ...response, logs: [{ ...log, assumptions: ["a".repeat(600)] }] }, input)).toThrow();
    } finally { await app.close(); }
  });

  it("bounds audio uploads and deduplicates a completed transcription", async () => {
    const transcribe = vi.fn(async (_data: Buffer, _filename: string, _mime: string) => "A banana");
    const app = await buildVoiceServer({ env, ai: { interpret: async () => response, transcribe } });
    const upload = (mime: string, content: string, second = false) => {
      const part = `--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="meal.wav"\r\nContent-Type: ${mime}\r\n\r\n${content}\r\n`;
      return Buffer.from(part + (second ? part : "") + "--test-boundary--\r\n");
    };
    const audioHeaders = { ...headers, "content-type": "multipart/form-data; boundary=test-boundary", "idempotency-key": input.requestID };
    const send = (payload: Buffer) => app.inject({ method: "POST", url: "/v1/audio/transcribe", headers: audioHeaders, payload });
    expect((await send(upload("text/plain", "not audio"))).statusCode).toBe(415);
    expect((await send(upload("audio/wav", "short"))).statusCode).toBe(422);
    expect((await send(upload("audio/wav", "x".repeat(64), true))).statusCode).toBe(413);
    expect((await send(upload("audio/wav", "x".repeat(64)))).statusCode).toBe(200);
    expect((await send(upload("audio/wav", "x".repeat(64)))).json()).toEqual({ text: "A banana" });
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0]?.[1]).toBe("meal.wav");
    await app.close();
  });
  it("protects AI routes and does not need a database", async () => {
    const interpret = vi.fn(async () => response);
    const app = await buildVoiceServer({ env, ai: { interpret, transcribe: async () => "Hello" } });
    expect((await app.inject({ method: "GET", url: "/health" })).json()).toEqual({ ok: true, service: "macro-voice" });
    expect((await app.inject({ method: "POST", url: "/v1/meals/interpret", payload: input })).statusCode).toBe(401);
    expect(interpret).not.toHaveBeenCalled();
    await app.close();
  });

  it("deduplicates retries and rejects changed payloads reusing an ID", async () => {
    const interpret = vi.fn(async () => response);
    const app = await buildVoiceServer({ env, ai: { interpret, transcribe: async () => "Hello" } });
    const first = await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: input });
    const second = await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: input });
    expect(first.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(interpret).toHaveBeenCalledTimes(1);
    expect((await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: { ...input, text: "changed" } })).statusCode).toBe(409);
    await app.close();
  });

  it("validates nutrition, calendar dates and correction identity", () => {
    expect(() => validateVoiceResult({ ...response, logs: [{ ...log, date: "2026-02-30" }] }, input)).toThrow();
    expect(() => validateVoiceResult({ ...response, logs: [{ ...log, foods: [{ ...food, nutrition: { ...food.nutrition, calories: -1 } }] }] }, input)).toThrow();
    const target = { ...log, id: "57a88780-d43e-45e7-b10b-e70a412bb7ab", revision: 3 };
    expect(() => validateVoiceResult(response, { ...input, target })).toThrow("correction cannot create");
    expect(() => validateVoiceResult({ ...response, action: "update", targetLogID: target.id, expectedRevision: 2 }, { ...input, target })).toThrow("stale");
  });

  it("returns a clear missing-key error rather than fake nutrition", async () => {
    const app = await buildVoiceServer({ env });
    const result = await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: input });
    expect(result.statusCode).toBe(503);
    expect(result.json().message).toContain("OPENAI_API_KEY");
    expect(result.json()).not.toHaveProperty("logs");
    await app.close();
  });

  it("allows retry after an upstream failure", async () => {
    const interpret = vi.fn().mockRejectedValueOnce(new Error("upstream failed")).mockResolvedValue(response);
    const app = await buildVoiceServer({ env, ai: { interpret, transcribe: async () => "Hello" } });
    expect((await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: input })).statusCode).toBe(502);
    expect((await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: input })).statusCode).toBe(200);
    expect(interpret).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it("does not charge quota twice for a cached retry and blocks further paid calls", async () => {
    const interpret = vi.fn(async () => response);
    const app = await buildVoiceServer({ env: { ...env, dailyLimit: 1 }, ai: { interpret, transcribe: async () => "Hello" } });
    expect((await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: input })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: input })).statusCode).toBe(200);
    const result = await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: { ...input, requestID: "bb865375-11f1-4a35-867f-a4b62cff4aac" } });
    expect(result.statusCode).toBe(429);
    expect(result.json().error).toBe("daily_limit");
    expect(interpret).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("isolates cached nutrition between authenticated clients", async () => {
    const otherToken = "another-provisioned-client-credential";
    const interpret = vi.fn(async () => response);
    const app = await buildVoiceServer({ env: { ...env, clientHashes: { other: createHash("sha256").update(otherToken).digest("hex") } }, ai: { interpret, transcribe: async () => "Hello" } });
    expect((await app.inject({ method: "POST", url: "/v1/meals/interpret", headers, payload: input })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/meals/interpret", headers: { authorization: `Bearer ${otherToken}` }, payload: input })).statusCode).toBe(200);
    expect(interpret).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it("rate-limits authenticated clients without exposing or caching configuration publicly", async () => {
    const app = await buildVoiceServer({ env, ai: { interpret: async () => response, transcribe: async () => "Hello" } });
    const health = await app.inject({ url: "/health" });
    expect(health.json()).toEqual({ ok: true, service: "macro-voice" });
    expect(health.headers["cache-control"]).toBe("no-store");
    expect((await app.inject({ url: "/v1/status" })).statusCode).toBe(401);
    for (let i = 0; i < 30; i++) expect((await app.inject({ url: "/v1/status", headers })).statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/status", headers })).statusCode).toBe(429);
    await app.close();
  });
});
