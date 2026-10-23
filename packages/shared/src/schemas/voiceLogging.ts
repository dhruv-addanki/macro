import { z } from "zod";

const number = z.number().finite().min(0).max(100000);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");

export const VoiceNutritionSchema = z.object({
  calories: number,
  proteinG: number,
  fatG: number,
  carbsG: number,
  sugarG: number.nullable(),
  fiberG: number.nullable(),
  sodiumMg: number.nullable()
}).strict();

export const VoiceFoodSchema = z.object({
  name: z.string().trim().min(1).max(200),
  portion: z.string().trim().min(1).max(200),
  nutrition: VoiceNutritionSchema,
  ingredients: z.array(z.string().min(1).max(200)).max(30),
  source: z.enum(["estimated", "user_reported", "history"])
}).strict();

export const VoiceLogSchema = z.object({
  date: dateKey,
  title: z.string().trim().min(1).max(200),
  foods: z.array(VoiceFoodSchema).min(1).max(40),
  assumptions: z.array(z.string().min(1).max(500)).max(20)
}).strict();

const VoiceContextObjectSchema = VoiceLogSchema.extend({
  id: z.string().uuid(),
  revision: z.number().int().nonnegative()
});

const contextText = (value: unknown, limit: number) => typeof value === "string" ? value.slice(0, limit) : value;
const contextNotes = (value: unknown, count: number, length: number) =>
  Array.isArray(value) ? value.slice(0, count).map((note) => contextText(note, length)) : value;

// Stored/imported diary descriptions can exceed the AI context budget. Project a
// bounded copy at the API boundary; keep nutrition, identity, and result validation strict.
export const VoiceContextSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const context = value as Record<string, unknown>;
  return {
    ...context,
    title: contextText(context.title, 200),
    assumptions: contextNotes(context.assumptions, 20, 500),
    foods: Array.isArray(context.foods) ? context.foods.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const food = value as Record<string, unknown>;
      return { ...food, name: contextText(food.name, 200), portion: contextText(food.portion, 200),
        ingredients: contextNotes(food.ingredients, 30, 200),
        source: food.source === "imported_daily_estimate" ? "history" : food.source };
    }) : context.foods
  };
}, VoiceContextObjectSchema);

export const VoiceInterpretRequestSchema = z.object({
  requestID: z.string().uuid(),
  text: z.string().trim().min(1).max(8000),
  selectedDate: dateKey,
  captureDate: dateKey,
  capturedAt: z.string().datetime({ offset: true }),
  timeZone: z.string().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Invalid timezone"),
  target: VoiceContextSchema.nullable(),
  recentLogs: z.array(VoiceContextSchema).max(8),
  previousQuestion: z.string().max(1000).nullable()
}).strict();

export const VoiceInterpretResultSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.enum(["create", "update", "clarify"]),
  logs: z.array(VoiceLogSchema).max(10),
  targetLogID: z.string().uuid().nullable(),
  expectedRevision: z.number().int().nonnegative().nullable(),
  question: z.string().min(1).max(1000).nullable()
}).strict().superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value.action === "create" && (!value.logs.length || value.targetLogID !== null || value.expectedRevision !== null || value.question !== null)) issue("Invalid create result");
  if (value.action === "update" && (value.logs.length !== 1 || !value.targetLogID || value.expectedRevision === null || value.question !== null)) issue("Invalid update result");
  if (value.action === "clarify" && (value.logs.length || !value.question || value.targetLogID !== null || value.expectedRevision !== null)) issue("Invalid clarification result");
});

export type VoiceNutrition = z.infer<typeof VoiceNutritionSchema>;
export type VoiceFood = z.infer<typeof VoiceFoodSchema>;
export type VoiceLog = z.infer<typeof VoiceLogSchema>;
export type VoiceInterpretRequest = z.infer<typeof VoiceInterpretRequestSchema>;
export type VoiceInterpretResult = z.infer<typeof VoiceInterpretResultSchema>;

export function validateVoiceResult(value: unknown, input: VoiceInterpretRequest): VoiceInterpretResult {
  const result = VoiceInterpretResultSchema.parse(value);
  if (input.target && result.action === "create") throw new Error("A correction cannot create a second meal");
  if (result.action === "update") {
    const candidates = input.target ? [input.target] : input.recentLogs;
    const target = candidates.find((candidate) => candidate.id === result.targetLogID);
    if (!target || target.revision !== result.expectedRevision) throw new Error("Unknown or stale correction target");
  }
  return result;
}

const nutritionProperties = Object.fromEntries(
  ["calories", "proteinG", "fatG", "carbsG", "sugarG", "fiberG", "sodiumMg"].map((key) => [key, {
    type: ["sugarG", "fiberG", "sodiumMg"].includes(key) ? ["number", "null"] : "number"
  }])
);

export const voiceOutputJSONSchema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "action", "logs", "targetLogID", "expectedRevision", "question"],
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    action: { type: "string", enum: ["create", "update", "clarify"] },
    targetLogID: { type: ["string", "null"] },
    expectedRevision: { type: ["integer", "null"] },
    question: { type: ["string", "null"] },
    logs: { type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["date", "title", "foods", "assumptions"],
      properties: {
        date: { type: "string" }, title: { type: "string" }, assumptions: { type: "array", items: { type: "string" } },
        foods: { type: "array", items: {
          type: "object", additionalProperties: false,
          required: ["name", "portion", "nutrition", "ingredients", "source"],
          properties: {
            name: { type: "string" }, portion: { type: "string" },
            source: { type: "string", enum: ["estimated", "user_reported", "history"] },
            ingredients: { type: "array", items: { type: "string" } },
            nutrition: { type: "object", additionalProperties: false, required: Object.keys(nutritionProperties), properties: nutritionProperties }
          }
        } }
      }
    } }
  }
};
