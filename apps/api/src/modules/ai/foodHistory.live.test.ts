import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type VoiceInterpretRequest } from "@macro/shared";
import { readVoiceEnv } from "../../lib/voiceEnv";
import { createVoiceAI } from "./voiceLogging";

// Synthetic diary only. Opt in with MACRO_TEST_LIVE_HISTORY=1 and an API key.
// No real local diary, recording or running production service is used.
describe.runIf(process.env.MACRO_TEST_LIVE_HISTORY === "1")("live explicit food history", () => {
  const ai = createVoiceAI(readVoiceEnv());
  const request = (text: string): VoiceInterpretRequest => ({ requestID: randomUUID(), text, selectedDate: "2026-10-23", captureDate: "2026-10-23", capturedAt: "2026-10-23T12:00:00Z", timeZone: "America/New_York", target: null, recentLogs: [], previousQuestion: null, history: { phase: "initial", queries: [], matches: [] } });
  it.each([
    "I ate two slices of garlic bread.",
    "Yesterday I ate two slices of garlic bread.",
    "I ate my usual garlic bread."
  ])("logs an ordinary entry without lookup: %s", async (text) => {
    const result = await ai.interpret(request(text));
    expect(result.action).toBe("create");
    expect(result.question).toBeNull();
    expect(result.logs[0]?.foods[0]?.source).toBe("estimated");
  }, 180000);

  it.each([
    ["I ate two slices of Costco garlic bread, the same one we logged last time, and one medium banana.", 330],
    ["I ate the Costco garlic bread we logged before.", 165]
  ])("looks up and reuses the most recent matching food: %s", async (text, calories) => {
    const input = request(text as string);
    const lookup = await ai.interpret(input);
    expect(lookup.action).toBe("lookup_history");
    expect(lookup.historyQueries?.join(" ").toLowerCase()).toContain("garlic");
    const food = { name: "Costco garlic bread", portion: "1 slice", nutrition: { calories: 165, proteinG: 4, fatG: 8, carbsG: 20, sugarG: null, fiberG: null, sodiumMg: null }, ingredients: ["garlic butter", "bread"], source: "user_reported" as const };
    const result = await ai.interpret({ ...input, requestID: randomUUID(), history: { phase: "resolved", queries: lookup.historyQueries!, matches: [
      { id: "new-costco", date: "2026-10-20", food },
      { id: "old-costco", date: "2026-01-01", food: { ...food, nutrition: { ...food.nutrition, calories: 150 } } },
      { id: "other-brand", date: "2026-10-22", food: { ...food, name: "Texas Toast garlic bread", nutrition: { ...food.nutrition, calories: 200 } } }
    ] } });
    expect(result.action).toBe("create");
    expect(result.question).toBeNull();
    const reused = result.logs.flatMap((log) => log.foods).filter((food) => food.source === "history");
    expect(reused).toHaveLength(1);
    expect(reused[0]?.nutrition.calories).toBe(calories);
    expect(reused[0]?.nutrition.sugarG).toBeNull();
    if (text.includes("banana")) expect(result.logs[0]?.foods.some((food) => /banana/i.test(food.name) && food.source === "estimated")).toBe(true);
  }, 240000);

  it("estimates automatically after an empty lookup", async () => {
    const input = request("Two slices of the same garlic bread we logged last time");
    const result = await ai.interpret({ ...input, history: { phase: "resolved", queries: ["garlic bread"], matches: [] } });
    expect(result.action).toBe("create");
    expect(result.question).toBeNull();
    expect(result.logs[0]?.foods[0]?.source).toBe("estimated");
    expect(result.logs[0]?.assumptions.length).toBeGreaterThan(0);
  }, 180000);

  it("preserves historical foods when correcting another food without a new lookup", async () => {
    const input = request("Actually I ate two bananas.");
    const garlic = { name: "Costco garlic bread", portion: "1 slice", nutrition: { calories: 165, proteinG: 4, fatG: 8, carbsG: 20, sugarG: null, fiberG: null, sodiumMg: null }, ingredients: ["bread", "garlic butter"], source: "history" as const };
    const banana = { name: "Banana", portion: "1 medium banana", nutrition: { calories: 105, proteinG: 1, fatG: 0, carbsG: 27, sugarG: null, fiberG: null, sodiumMg: null }, ingredients: [], source: "estimated" as const };
    const target = { id: randomUUID(), revision: 2, date: input.selectedDate, title: "Garlic bread and banana", foods: [garlic, banana], assumptions: [] };
    const result = await ai.interpret({ ...input, target });
    expect(result.action).toBe("update");
    expect(result.targetLogID).toBe(target.id);
    expect(result.expectedRevision).toBe(target.revision);
    expect(result.logs[0]?.foods.find((food) => /garlic/i.test(food.name))?.nutrition).toEqual(garlic.nutrition);
    expect(result.logs[0]?.foods.find((food) => /garlic/i.test(food.name))?.source).toBe("history");
    expect(result.logs[0]?.foods.find((food) => /banana/i.test(food.name))?.nutrition.calories).toBe(210);
  }, 180000);
});
