import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { readVoiceEnv } from "../apps/api/src/lib/voiceEnv.ts";
import { validateVoiceResult } from "../packages/shared/src/schemas/voiceLogging.ts";

const url = "https://macro-voice-api-production.up.railway.app";
const credentials = JSON.parse(readFileSync(".macro-data/voice-private.json", "utf8"));
const headers = { authorization: `Bearer ${credentials.tokens.verification}` };
const request = (path, options = {}) => fetch(url + path, { ...options, signal: AbortSignal.timeout(180000) });
const health = await request("/health");
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true, service: "macro-voice" });
assert.equal((await request("/v1/status")).status, 401);
assert.equal((await request("/v1/status", { headers: { authorization: `Bearer ${readVoiceEnv().token}` } })).status, 401);
const statusResponse = await request("/v1/status", { headers });
assert.equal(statusResponse.status, 200);
const status = await statusResponse.json();
assert.equal(status.openaiConfigured, true);
console.log("Hosted health and credential isolation passed.");

const form = new FormData();
form.append("file", new Blob([readFileSync(".macro-data/hosted-voice-probe.m4a")], { type: "audio/mp4" }), "meal.m4a");
const audioHeaders = { ...headers, "Idempotency-Key": randomUUID() };
const transcription = await request("/v1/audio/transcribe", { method: "POST", headers: audioHeaders, body: form });
assert.equal(transcription.status, 200, "Hosted transcription failed");
const transcript = await transcription.json();
assert.match(transcript.text.toLowerCase(), /banana/);
const audioRetry = await request("/v1/audio/transcribe", { method: "POST", headers: audioHeaders, body: form });
assert.equal(audioRetry.status, 200);
assert.deepEqual(await audioRetry.json(), transcript);
console.log("Synthetic audio transcribed over HTTPS; cached retry matched.");

const capturedAt = new Date().toISOString();
const day = capturedAt.slice(0, 10);
// Synthetic imported context exercises the installed client's saved-draft payload,
// including archival descriptions that exceed the estimator's context limits.
const imported = { id: randomUUID(), revision: 0, date: day, title: "Imported daily total",
  foods: [{ name: "Daily total", portion: "1 day", source: "imported_daily_estimate",
    nutrition: { calories: 200, proteinG: 5, fatG: 10, carbsG: 25, sugarG: null, fiberG: null, sodiumMg: null },
    ingredients: ["Archival ingredient description. ".repeat(8)] }],
  assumptions: Array.from({ length: 21 }, (_, i) => i === 0 ? "Archived note. ".repeat(45) : "Imported archival note.") };
const input = { requestID: randomUUID(), text: transcript.text, selectedDate: day, captureDate: day, capturedAt, timeZone: "UTC", target: null, recentLogs: [imported], previousQuestion: null };
const interpretation = await request("/v1/meals/interpret", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(input) });
assert.equal(interpretation.status, 200, "Hosted meal estimate failed");
const result = validateVoiceResult(await interpretation.json(), input);
assert.equal(result.action, "create");
const calories = result.logs.flatMap((log) => log.foods).reduce((total, food) => total + food.nutrition.calories, 0);
assert.ok(calories > 0 && calories < 1000);
const retry = await request("/v1/meals/interpret", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(input) });
assert.equal(retry.status, 200);
assert.deepEqual(await retry.json(), result);
writeFileSync(".macro-data/hosted-probe-result.json", JSON.stringify({ url, status, transcript, result, calories, verifiedAt: new Date().toISOString() }, null, 2) + "\n");
console.log(`Hosted end-to-end check passed: synthetic speech -> transcript -> validated estimate (${calories} kcal). No real diary was modified.`);
