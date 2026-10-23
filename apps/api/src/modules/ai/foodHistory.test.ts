import { describe, expect, it } from "vitest";
import { VoiceInterpretRequestSchema, validateVoiceResult, type VoiceInterpretRequest } from "@macro/shared";
import { resolveFoodHistory } from "./foodHistory";

const food = { name: "Garlic bread", portion: "1 slice", nutrition: { calories: 150, proteinG: 3, fatG: 7, carbsG: 18, sugarG: null, fiberG: 1, sodiumMg: 220 }, ingredients: ["bread", "garlic butter"], source: "user_reported" as const };
const match = { id: "meal-revision-food", date: "2026-01-01", food };
const initial: VoiceInterpretRequest = { requestID: "e069b60a-1d77-4833-9215-901ee957e88c", text: "Two slices of the same garlic bread we logged before, and a banana", selectedDate: "2026-10-23", captureDate: "2026-10-23", capturedAt: "2026-10-23T12:00:00Z", timeZone: "America/New_York", target: null, recentLogs: [], previousQuestion: null, history: { phase: "initial", queries: [], matches: [] } };
const resolved: VoiceInterpretRequest = { ...initial, history: { phase: "resolved", queries: ["garlic bread"], matches: [match] } };
const lookup = { schemaVersion: 1, action: "lookup_history", logs: [], targetLogID: null, expectedRevision: null, question: null, historyQueries: ["garlic bread"] };
const result = (reuse: { id: string; scale: number } | null = { id: match.id, scale: 2 }) => ({
  schemaVersion: 1, action: "create", logs: [{ date: initial.selectedDate, title: "Garlic bread and banana", foods: [{ ...food, portion: "2 slices", source: "history", reuse }, { ...food, name: "Banana", nutrition: { ...food.nutrition, calories: 105 }, source: "estimated", reuse: null }], assumptions: [] as string[] }], targetLogID: null, expectedRevision: null, question: null, historyQueries: null
});

describe("explicit local food history", () => {
  it("authorizes one bounded lookup and rejects a second lookup or follow-up question", () => {
    expect(validateVoiceResult(lookup, initial).action).toBe("lookup_history");
    expect(() => validateVoiceResult(lookup, resolved)).toThrow("phase");
    expect(() => validateVoiceResult(lookup, { ...initial, history: undefined })).toThrow("phase");
    expect(() => validateVoiceResult({ ...lookup, historyQueries: [] }, initial)).toThrow();
    expect(() => validateVoiceResult({ ...lookup, historyQueries: Array(6).fill("food") }, initial)).toThrow();
    expect(() => validateVoiceResult({ ...lookup, action: "clarify", historyQueries: null, question: "Which brand?" }, initial)).toThrow("follow-up");
  });

  it("keeps initial requests free of history and bounds resolved snapshots", () => {
    expect(VoiceInterpretRequestSchema.parse(initial).history?.matches).toEqual([]);
    expect(() => VoiceInterpretRequestSchema.parse({ ...initial, history: { ...initial.history, matches: [match] } })).toThrow();
    expect(() => VoiceInterpretRequestSchema.parse({ ...initial, recentLogs: [{ ...result().logs[0], id: initial.requestID, revision: 0 }] })).toThrow();
    expect(() => VoiceInterpretRequestSchema.parse({ ...resolved, history: { ...resolved.history, queries: [] } })).toThrow();
    expect(() => VoiceInterpretRequestSchema.parse({ ...resolved, history: { ...resolved.history, matches: Array(11).fill(match) } })).toThrow();
    expect(() => VoiceInterpretRequestSchema.parse({ ...resolved, history: { ...resolved.history, matches: [{ ...match, food: { ...food, source: "imported_daily_estimate" } }] } })).toThrow();
  });

  it("scales stored nutrition exactly, preserves unknowns, and estimates unrelated foods separately", () => {
    const before = structuredClone(resolved);
    const output = resolveFoodHistory(result(), resolved);
    expect(output.logs[0]?.foods[0]?.nutrition).toEqual({ calories: 300, proteinG: 6, fatG: 14, carbsG: 36, sugarG: null, fiberG: 2, sodiumMg: 440 });
    expect(output.logs[0]?.foods[0]?.source).toBe("history");
    expect(output.logs[0]?.foods[0]).not.toHaveProperty("reuse");
    expect(output.logs[0]?.foods[1]?.nutrition.calories).toBe(105);
    expect(resolved).toEqual(before);
    expect(resolveFoodHistory(result({ id: match.id, scale: 1 }), resolved).logs[0]?.foods[0]?.nutrition).toEqual(food.nutrition);
    expect(resolveFoodHistory(result({ id: match.id, scale: 0.5 }), resolved).logs[0]?.foods[0]?.nutrition.calories).toBe(75);
  });

  it("rejects invented references, unreferenced history, invalid ratios and overflow", () => {
    expect(() => resolveFoodHistory(result(), initial)).toThrow("reference");
    expect(() => resolveFoodHistory(result({ id: "invented", scale: 2 }), resolved)).toThrow("reference");
    expect(() => resolveFoodHistory(result(null), resolved)).toThrow("reference");
    for (const scale of [0, -1, Infinity, 1001]) expect(() => resolveFoodHistory(result({ id: match.id, scale }), resolved)).toThrow();
    expect(() => resolveFoodHistory(result({ id: match.id, scale: 1000 }), resolved)).toThrow();
  });

  it("allows an empty lookup to fall back to a fresh estimate without a question", () => {
    const estimate = result(null);
    estimate.logs[0]!.foods[0]!.source = "estimated";
    estimate.logs[0]!.assumptions.push("Prior garlic bread could not be matched; estimated a standard slice.");
    const output = resolveFoodHistory(estimate, { ...resolved, history: { ...resolved.history!, matches: [] } });
    expect(output.action).toBe("create");
    expect(output.question).toBeNull();
    expect(output.logs[0]?.foods[0]?.source).toBe("estimated");
  });

  it("never updates the referenced historical meal as a side effect", () => {
    const update = { ...result(), action: "update", targetLogID: initial.requestID, expectedRevision: 0 };
    expect(() => resolveFoodHistory(update, resolved)).toThrow();
    const target = { ...result().logs[0]!, foods: [food], id: initial.requestID, revision: 0 };
    expect(resolveFoodHistory(update, { ...resolved, target }).action).toBe("update");
    expect(() => resolveFoodHistory(result(), { ...resolved, target })).toThrow("correction cannot create");
  });

  it("preserves unchanged history components when correcting another food without lookup", () => {
    const value = result(null);
    const target: NonNullable<VoiceInterpretRequest["target"]> = { date: initial.selectedDate, title: "Garlic bread and banana", foods: [{ ...food, portion: "2 slices", source: "history" }], assumptions: [], id: initial.requestID, revision: 3 };
    value.action = "update";
    const update = { ...value, targetLogID: target.id, expectedRevision: target.revision };
    const input = { ...initial, text: "Actually I ate two bananas", target };
    expect(resolveFoodHistory(update, input).logs[0]?.foods[0]?.source).toBe("history");
    const changed = structuredClone(update);
    changed.logs[0]!.foods[0]!.nutrition.calories += 1;
    expect(() => resolveFoodHistory(changed, input)).toThrow("reference");
  });
});
