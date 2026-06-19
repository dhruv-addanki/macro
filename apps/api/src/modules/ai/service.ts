import OpenAI from "openai";
import {
  MealEstimateSchema,
  type AIEstimateLog,
  type CorrectionRequest,
  type CorrectionResponse,
  type MealEstimate,
  type MealEstimateResponse,
  type PhotoMealEstimateRequest,
  type SavedMealMatch,
  type TextMealEstimateRequest,
  type UserCorrectionLog
} from "@macro/shared";
import { env } from "../../lib/env";
import { createId, nowIso } from "../../lib/http";
import {
  getAiHistoryFromPrisma,
  listUserCorrectionsFromPrisma,
  listRecipesFromPrisma,
  listSavedMealsFromPrisma,
  persistAiEstimateInPrisma,
  persistUserCorrectionInPrisma
} from "../../lib/prismaStore";
import { DEMO_USER_ID, saveStore, store, type SavedMeal } from "../../lib/store";
import { CORRECTION_PROMPT_VERSION } from "./prompts/correction.v1";
import { buildMealPhotoEstimatePrompt, MEAL_PHOTO_ESTIMATE_PROMPT_VERSION } from "./prompts/mealPhotoEstimate.v1";
import { buildMealTextEstimatePrompt, MEAL_TEXT_ESTIMATE_PROMPT_VERSION } from "./prompts/mealTextEstimate.v1";
import { SAVED_MEAL_MATCH_PROMPT_VERSION } from "./prompts/savedMealMatch.v1";

const PHOTO_MODEL = env.aiPhotoModel;
const MINI_MODEL = env.aiTextModel;
const CORRECTION_MODEL = env.aiCorrectionModel;

const openai = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

function tokensFor(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

function lexicalScore(query: string, candidate: string): number {
  const queryTokens = tokensFor(query);
  const candidateTokens = tokensFor(candidate);
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }
  return Math.min(1, overlap / Math.max(1, queryTokens.size));
}

function classifyCorrection(correctionText: string): string {
  const correction = correctionText.toLowerCase();
  if (correction.includes("no ghee") || correction.includes("no oil")) return "remove_added_fat";
  if (correction.includes("half")) return "portion_decrease";
  if (correction.includes("2 bowl") || correction.includes("two bowl") || correction.includes("double")) return "portion_increase";
  return "general";
}

function correctionContext(estimate: MealEstimate): string {
  return [
    estimate.dishName,
    estimate.portion.unit,
    ...estimate.ingredients.map((ingredient) => ingredient.name),
    ...estimate.assumptions
  ].join(" ");
}

function findRelevantCorrectionsFromList(corrections: UserCorrectionLog[], context: string, limit = 5) {
  return corrections
    .map((correction) => ({
      correction,
      score: lexicalScore(context, `${correctionContext(correction.before)} ${correction.correctionText}`)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((candidate) => candidate.correction);
}

async function getRelevantCorrections(userId: string, context: string, limit = 5): Promise<UserCorrectionLog[]> {
  const corrections = shouldPersistDirectlyToPrisma()
    ? await listUserCorrectionsFromPrisma(userId, 50)
    : store.userCorrections.filter((correction) => correction.userId === userId);
  return findRelevantCorrectionsFromList(corrections, context, limit);
}

async function correctionMemoryLines(userId: string, context: string): Promise<string[]> {
  return (await getRelevantCorrections(userId, context, 3)).map(
    (correction) => `${correction.before.dishName}: user correction was "${correction.correctionText}"`
  );
}

async function applyCorrectionMemory(userId: string, estimate: MealEstimate, context: string): Promise<MealEstimate> {
  const relevantCorrections = await getRelevantCorrections(userId, `${context} ${correctionContext(estimate)}`, 5);
  if (relevantCorrections.length === 0) return estimate;

  const rememberedNoAddedFat = relevantCorrections.some((correction) => classifyCorrection(correction.correctionText) === "remove_added_fat");
  if (!rememberedNoAddedFat) return estimate;

  const lowerContext = `${context} ${correctionContext(estimate)}`.toLowerCase();
  const likelyApplies =
    lowerContext.includes("khichdi") ||
    lowerContext.includes("dal") ||
    lowerContext.includes("lentil") ||
    lowerContext.includes("rice") ||
    lowerContext.includes("ghee") ||
    lowerContext.includes("oil");

  if (!likelyApplies) return estimate;

  const updated = structuredClone(estimate);
  updated.macros.calories = Math.max(0, Math.round((updated.macros.calories - 45) * 10) / 10);
  updated.macros.fatG = Math.max(0, Math.round((updated.macros.fatG - 5) * 10) / 10);
  updated.calorieRange = {
    min: Math.max(0, Math.round(updated.calorieRange.min - 45)),
    max: Math.max(0, Math.round(updated.calorieRange.max - 45))
  };
  updated.assumptions = updated.assumptions.filter((assumption) => {
    const lower = assumption.toLowerCase();
    return !lower.includes("ghee") && !lower.includes("oil");
  });
  if (!updated.assumptions.some((assumption) => assumption.includes("Personal correction memory"))) {
    updated.assumptions.push("Personal correction memory: similar meals are usually logged with no added oil/ghee.");
  }
  if (!updated.quickEdits.includes("Add oil/ghee")) {
    updated.quickEdits = ["Add oil/ghee", ...updated.quickEdits].slice(0, 6);
  }
  return updated;
}

async function persistAiEstimate(log: AIEstimateLog): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await persistAiEstimateInPrisma({
      estimate: log,
      user: store.authUsers.find((user) => user.id === log.userId)
    });
    return;
  }

  saveStore();
}

async function persistUserCorrection(correction: UserCorrectionLog): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await persistUserCorrectionInPrisma({
      correction,
      user: store.authUsers.find((user) => user.id === correction.userId)
    });
    return;
  }

  saveStore();
}

async function logAiEstimate(input: {
  userId: string;
  estimate: MealEstimate;
  inputContext?: string | null;
  inputType: AIEstimateLog["inputType"];
  model: string;
  promptVersion: string;
  usedFallback: boolean;
}): Promise<string> {
  const log: AIEstimateLog = {
    id: createId("ai"),
    userId: input.userId,
    inputType: input.inputType,
    model: input.model,
    promptVersion: input.promptVersion,
    inputContext: input.inputContext ?? null,
    output: input.estimate,
    confidence: input.estimate.confidence,
    assumptions: input.estimate.assumptions,
    usedFallback: input.usedFallback,
    createdAt: nowIso()
  };
  store.aiEstimates.push(log);
  try {
    await persistAiEstimate(log);
  } catch (error) {
    store.aiEstimates = store.aiEstimates.filter((estimate) => estimate.id !== log.id);
    throw error;
  }
  return log.id;
}

async function logUserCorrection(input: {
  userId: string;
  aiEstimateId?: string;
  after: MealEstimate;
  before: MealEstimate;
  correctionText: string;
}): Promise<void> {
  const correction = {
    id: createId("correction"),
    userId: input.userId,
    aiEstimateId: input.aiEstimateId ?? null,
    correctionText: input.correctionText,
    before: input.before,
    after: input.after,
    correctionType: classifyCorrection(input.correctionText),
    createdAt: nowIso()
  };
  store.userCorrections.push(correction);
  try {
    await persistUserCorrection(correction);
  } catch (error) {
    store.userCorrections = store.userCorrections.filter((candidate) => candidate.id !== correction.id);
    throw error;
  }
}

function buildPersonalMealMatches(userId: string, query: string, limit: number, savedMeals: SavedMeal[], recipes: typeof store.recipes): SavedMealMatch[] {
  const savedMealMatches: SavedMealMatch[] = savedMeals.filter((meal) => meal.userId === userId).map((meal) => {
    const candidate = [meal.name, ...meal.entries.map((entry) => entry.displayName)].join(" ");
    const score = lexicalScore(query, candidate);
    return {
      id: meal.id,
      type: "saved_meal",
      name: meal.name,
      score,
      reason: score >= 0.5 ? "Similar to a saved meal." : "Saved meal candidate.",
      totals: meal.totals
    };
  });

  const recipeMatches: SavedMealMatch[] = recipes.filter((recipe) => recipe.userId === userId).map((recipe) => {
    const candidate = [recipe.name, ...recipe.ingredients.map((ingredient) => ingredient.displayName)].join(" ");
    const score = lexicalScore(query, candidate);
    return {
      id: recipe.id,
      type: "recipe",
      name: recipe.name,
      score,
      reason: score >= 0.5 ? "Similar to a saved recipe." : "Recipe candidate.",
      totals: recipe.perServing
    };
  });

  return [...savedMealMatches, ...recipeMatches]
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function findPersonalMealMatches(query: string, limit?: number): SavedMealMatch[];
export function findPersonalMealMatches(userId: string, query: string, limit?: number): SavedMealMatch[];
export function findPersonalMealMatches(userIdOrQuery: string, queryOrLimit?: string | number, maybeLimit = 5): SavedMealMatch[] {
  const userId = typeof queryOrLimit === "string" ? userIdOrQuery : DEMO_USER_ID;
  const query = typeof queryOrLimit === "string" ? queryOrLimit : userIdOrQuery;
  const limit = typeof queryOrLimit === "number" ? queryOrLimit : maybeLimit;
  return buildPersonalMealMatches(userId, query, limit, store.savedMeals, store.recipes);
}

export async function findPersonalMealMatchesForUser(userId: string, query: string, limit = 5): Promise<SavedMealMatch[]> {
  if (shouldPersistDirectlyToPrisma()) {
    const [savedMeals, recipes] = await Promise.all([
      listSavedMealsFromPrisma(userId),
      listRecipesFromPrisma(userId)
    ]);
    return buildPersonalMealMatches(userId, query, limit, savedMeals, recipes);
  }
  return findPersonalMealMatches(userId, query, limit);
}

function estimateFromPersonalMatch(match: SavedMealMatch): MealEstimate {
  return {
    dishName: match.name,
    mealGroupGuess: "lunch",
    portion: {
      quantity: 1,
      unit: match.type === "recipe" ? "serving" : "saved meal",
      estimatedWeightG: 350
    },
    macros: match.totals,
    calorieRange: {
      min: Math.max(0, Math.round(match.totals.calories * 0.95)),
      max: Math.round(match.totals.calories * 1.05)
    },
    confidence: match.score >= 0.75 ? "high" : "medium",
    ingredients: [
      {
        name: match.name,
        estimatedWeightG: 350,
        macros: match.totals,
        confidence: match.score >= 0.75 ? "high" : "medium"
      }
    ],
    assumptions: [
      `Matched from personal ${match.type === "recipe" ? "recipe" : "saved meal"} memory.`,
      "Uses the user's saved macros instead of estimating from scratch."
    ],
    quickEdits: ["Half portion", "Double portion", "More protein", "Less carbs"],
    clarifyingQuestion: null
  };
}

function inferDishName(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Estimated meal";
  return trimmed
    .split(/[,.]/)[0]
    ?.replace(/\b(one|two|three|a|an|with|and)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "Estimated meal";
}

function fallbackEstimate(text: string, mode: "text" | "photo"): MealEstimate {
  const lower = text.toLowerCase();
  const isKhichdi = lower.includes("khichdi") || lower.includes("rice") || lower.includes("dal") || lower.includes("lentil");
  const isChicken = lower.includes("chicken");
  const isPaneer = lower.includes("paneer");
  const isRoti = lower.includes("roti") || lower.includes("chapati");

  let estimate: MealEstimate = {
    dishName: inferDishName(text),
    mealGroupGuess: "lunch",
    portion: {
      quantity: 1,
      unit: lower.includes("bowl") ? "medium bowl" : "serving",
      estimatedWeightG: 350
    },
    macros: {
      calories: 520,
      proteinG: 28,
      carbsG: 58,
      fatG: 18,
      sugarG: 6,
      fiberG: 8,
      sodiumMg: 650
    },
    calorieRange: { min: 420, max: 680 },
    confidence: mode === "photo" ? "low" : "medium",
    ingredients: [
      {
        name: "mixed meal estimate",
        estimatedWeightG: 350,
        macros: {
          calories: 520,
          proteinG: 28,
          carbsG: 58,
          fatG: 18,
          sugarG: 6,
          fiberG: 8,
          sodiumMg: 650
        },
        confidence: "low"
      }
    ],
    assumptions: [
      "Fallback estimate used because OpenAI is not configured.",
      "Assumes a moderate single serving and typical cooking fat."
    ],
    quickEdits: ["Half portion", "Larger portion", "No oil/ghee", "More protein"],
    clarifyingQuestion: null
  };

  if (isKhichdi) {
    estimate = {
      ...estimate,
      dishName: "Rice and dal khichdi",
      portion: { quantity: 1, unit: "medium bowl", estimatedWeightG: 350 },
      macros: { calories: 410, proteinG: 14, carbsG: 68, fatG: 10, sugarG: 3.4, fiberG: 8, sodiumMg: 600 },
      calorieRange: { min: 330, max: 520 },
      confidence: text.length > 20 ? "medium" : "low",
      ingredients: [
        {
          name: "cooked rice",
          estimatedWeightG: 170,
          macros: { calories: 221, proteinG: 4.6, carbsG: 47.9, fatG: 0.5, sugarG: 0.1, fiberG: 0.7, sodiumMg: 2 },
          confidence: "medium"
        },
        {
          name: "cooked lentils/dal",
          estimatedWeightG: 110,
          macros: { calories: 128, proteinG: 9.9, carbsG: 22, fatG: 0.4, sugarG: 1.8, fiberG: 8.7, sodiumMg: 2 },
          confidence: "medium"
        },
        {
          name: "squash and cooking fat",
          estimatedWeightG: 70,
          macros: { calories: 61, proteinG: 0.5, carbsG: 3, fatG: 9.1, sugarG: 1.5, fiberG: 1.5, sodiumMg: 596 },
          confidence: "low"
        }
      ],
      assumptions: [
        "Assumes a rice-heavy khichdi with dal and squash.",
        "Assumes about 1 tsp oil or ghee.",
        "Homemade recipes vary, so the estimate is intentionally editable."
      ],
      quickEdits: ["No ghee", "More dal", "More rice", "Half bowl", "Two bowls"]
    };
  }

  if (isChicken) {
    estimate.macros.proteinG += 25;
    estimate.macros.calories += 160;
    estimate.ingredients.push({
      name: "chicken",
      estimatedWeightG: 120,
      macros: { calories: 198, proteinG: 37.2, carbsG: 0, fatG: 4.3, sugarG: 0, fiberG: 0, sodiumMg: 89 },
      confidence: "medium"
    });
  }

  if (isPaneer) {
    estimate.macros.proteinG += 16;
    estimate.macros.fatG += 20;
    estimate.macros.calories += 260;
  }

  if (isRoti) {
    estimate.macros.carbsG += 20;
    estimate.macros.calories += 135;
  }

  return estimate;
}

async function callOpenAIForEstimate(params: {
  userId: string;
  model: string;
  input: string;
  imageUrl?: string;
  imageBase64?: string;
  mode: "text" | "photo";
}): Promise<MealEstimate | null> {
  if (!openai) return null;
  const correctionMemory = await correctionMemoryLines(params.userId, params.input);
  const promptText = params.mode === "photo"
    ? buildMealPhotoEstimatePrompt(params.input, correctionMemory)
    : buildMealTextEstimatePrompt(params.input, correctionMemory);

  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: promptText
    }
  ];

  if (params.imageUrl) {
    content.push({ type: "input_image", image_url: params.imageUrl });
  } else if (params.imageBase64) {
    content.push({ type: "input_image", image_url: `data:image/jpeg;base64,${params.imageBase64}` });
  }

  try {
    const response = await (openai.responses.create as any)({
      model: params.model,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "meal_estimate",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "dishName",
              "portion",
              "macros",
              "calorieRange",
              "confidence",
              "ingredients",
              "assumptions",
              "quickEdits",
              "clarifyingQuestion"
            ],
            properties: {
              dishName: { type: "string" },
              mealGroupGuess: { type: "string" },
              portion: {
                type: "object",
                additionalProperties: false,
                required: ["quantity", "unit", "estimatedWeightG"],
                properties: {
                  quantity: { type: "number" },
                  unit: { type: "string" },
                  estimatedWeightG: { type: "number" }
                }
              },
              macros: {
                type: "object",
                additionalProperties: false,
                required: ["calories", "proteinG", "carbsG", "fatG", "sugarG", "fiberG", "sodiumMg"],
                properties: {
                  calories: { type: "number" },
                  proteinG: { type: "number" },
                  carbsG: { type: "number" },
                  fatG: { type: "number" },
                  sugarG: { type: "number" },
                  fiberG: { type: "number" },
                  sodiumMg: { type: "number" }
                }
              },
              calorieRange: {
                type: "object",
                additionalProperties: false,
                required: ["min", "max"],
                properties: {
                  min: { type: "number" },
                  max: { type: "number" }
                }
              },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              ingredients: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "estimatedWeightG", "macros"],
                  properties: {
                    name: { type: "string" },
                    estimatedWeightG: { type: "number" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    macros: {
                      type: "object",
                      additionalProperties: false,
                      required: ["calories", "proteinG", "carbsG", "fatG", "sugarG", "fiberG", "sodiumMg"],
                      properties: {
                        calories: { type: "number" },
                        proteinG: { type: "number" },
                        carbsG: { type: "number" },
                        fatG: { type: "number" },
                        sugarG: { type: "number" },
                        fiberG: { type: "number" },
                        sodiumMg: { type: "number" }
                      }
                    }
                  }
                }
              },
              assumptions: { type: "array", items: { type: "string" } },
              quickEdits: { type: "array", items: { type: "string" } },
              clarifyingQuestion: { anyOf: [{ type: "string" }, { type: "null" }] }
            }
          }
        }
      }
    });

    const text = response.output_text as string | undefined;
    if (!text) return null;
    return MealEstimateSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

function userAndTextInput(userIdOrInput: string | TextMealEstimateRequest, maybeInput?: TextMealEstimateRequest): {
  userId: string;
  input: TextMealEstimateRequest;
} {
  if (typeof userIdOrInput === "string") {
    if (!maybeInput) throw new Error("Missing text meal input");
    return { userId: userIdOrInput, input: maybeInput };
  }
  return { userId: DEMO_USER_ID, input: userIdOrInput };
}

function userAndPhotoInput(userIdOrInput: string | PhotoMealEstimateRequest, maybeInput?: PhotoMealEstimateRequest): {
  userId: string;
  input: PhotoMealEstimateRequest;
} {
  if (typeof userIdOrInput === "string") {
    if (!maybeInput) throw new Error("Missing photo meal input");
    return { userId: userIdOrInput, input: maybeInput };
  }
  return { userId: DEMO_USER_ID, input: userIdOrInput };
}

function userAndCorrectionInput(userIdOrInput: string | CorrectionRequest, maybeInput?: CorrectionRequest): {
  userId: string;
  input: CorrectionRequest;
} {
  if (typeof userIdOrInput === "string") {
    if (!maybeInput) throw new Error("Missing correction input");
    return { userId: userIdOrInput, input: maybeInput };
  }
  return { userId: DEMO_USER_ID, input: userIdOrInput };
}

export async function estimateTextMeal(input: TextMealEstimateRequest): Promise<MealEstimateResponse>;
export async function estimateTextMeal(userId: string, input: TextMealEstimateRequest): Promise<MealEstimateResponse>;
export async function estimateTextMeal(
  userIdOrInput: string | TextMealEstimateRequest,
  maybeInput?: TextMealEstimateRequest
): Promise<MealEstimateResponse> {
  const { userId, input } = userAndTextInput(userIdOrInput, maybeInput);
  const personalMatch = (await findPersonalMealMatchesForUser(userId, input.text, 1))[0];
  if (personalMatch && personalMatch.score >= 0.75) {
    const estimate = estimateFromPersonalMatch(personalMatch);
    const estimateId = await logAiEstimate({
      userId,
      estimate,
      inputContext: input.text,
      inputType: "saved_meal_match",
      model: "personal-memory",
      promptVersion: SAVED_MEAL_MATCH_PROMPT_VERSION,
      usedFallback: true
    });
    return {
      estimate,
      estimateId,
      model: "personal-memory",
      promptVersion: SAVED_MEAL_MATCH_PROMPT_VERSION,
      usedFallback: true
    };
  }

  const model = MINI_MODEL;
  const estimate = await callOpenAIForEstimate({
    userId,
    model,
    input: input.text,
    mode: "text"
  });
  const finalEstimate = await applyCorrectionMemory(userId, estimate ?? fallbackEstimate(input.text, "text"), input.text);
  const estimateId = await logAiEstimate({
    userId,
    estimate: finalEstimate,
    inputContext: input.text,
    inputType: "text",
    model,
    promptVersion: MEAL_TEXT_ESTIMATE_PROMPT_VERSION,
    usedFallback: !estimate
  });

  return {
    estimate: finalEstimate,
    estimateId,
    model,
    promptVersion: MEAL_TEXT_ESTIMATE_PROMPT_VERSION,
    usedFallback: !estimate
  };
}

export async function estimatePhotoMeal(input: PhotoMealEstimateRequest): Promise<MealEstimateResponse>;
export async function estimatePhotoMeal(userId: string, input: PhotoMealEstimateRequest): Promise<MealEstimateResponse>;
export async function estimatePhotoMeal(
  userIdOrInput: string | PhotoMealEstimateRequest,
  maybeInput?: PhotoMealEstimateRequest
): Promise<MealEstimateResponse> {
  const { userId, input } = userAndPhotoInput(userIdOrInput, maybeInput);
  const model = PHOTO_MODEL;
  const estimate = await callOpenAIForEstimate({
    userId,
    model,
    input: input.context,
    imageUrl: input.imageUrl,
    imageBase64: input.imageBase64,
    mode: "photo"
  });
  const finalEstimate = await applyCorrectionMemory(userId, estimate ?? fallbackEstimate(input.context, "photo"), input.context);
  const estimateId = await logAiEstimate({
    userId,
    estimate: finalEstimate,
    inputContext: input.context,
    inputType: "photo",
    model,
    promptVersion: MEAL_PHOTO_ESTIMATE_PROMPT_VERSION,
    usedFallback: !estimate
  });

  return {
    estimate: finalEstimate,
    estimateId,
    model,
    promptVersion: MEAL_PHOTO_ESTIMATE_PROMPT_VERSION,
    usedFallback: !estimate
  };
}

export async function applyCorrection(input: CorrectionRequest): Promise<CorrectionResponse>;
export async function applyCorrection(userId: string, input: CorrectionRequest): Promise<CorrectionResponse>;
export async function applyCorrection(
  userIdOrInput: string | CorrectionRequest,
  maybeInput?: CorrectionRequest
): Promise<CorrectionResponse> {
  const { userId, input } = userAndCorrectionInput(userIdOrInput, maybeInput);
  const correction = input.correctionText.toLowerCase();
  const estimate = structuredClone(input.estimate);

  if (correction.includes("no ghee") || correction.includes("no oil")) {
    estimate.macros.calories = Math.max(0, estimate.macros.calories - 45);
    estimate.macros.fatG = Math.max(0, estimate.macros.fatG - 5);
    estimate.assumptions = estimate.assumptions.filter(
      (assumption) => !assumption.toLowerCase().includes("ghee") && !assumption.toLowerCase().includes("oil")
    );
    estimate.assumptions.push("User corrected this to no added oil/ghee.");
  }

  if (correction.includes("half")) {
    estimate.portion.quantity = estimate.portion.quantity / 2;
    estimate.portion.estimatedWeightG = estimate.portion.estimatedWeightG / 2;
    for (const key of ["calories", "proteinG", "carbsG", "fatG", "sugarG", "fiberG", "sodiumMg"] as const) {
      estimate.macros[key] = Math.round(((estimate.macros[key] ?? 0) / 2) * 10) / 10;
    }
    estimate.calorieRange.min = Math.round(estimate.calorieRange.min / 2);
    estimate.calorieRange.max = Math.round(estimate.calorieRange.max / 2);
    estimate.assumptions.push("User corrected this to a half portion.");
  }

  if (correction.includes("2 bowl") || correction.includes("two bowl") || correction.includes("double")) {
    estimate.portion.quantity = estimate.portion.quantity * 2;
    estimate.portion.estimatedWeightG = estimate.portion.estimatedWeightG * 2;
    for (const key of ["calories", "proteinG", "carbsG", "fatG", "sugarG", "fiberG", "sodiumMg"] as const) {
      estimate.macros[key] = Math.round((estimate.macros[key] ?? 0) * 2 * 10) / 10;
    }
    estimate.calorieRange.min = Math.round(estimate.calorieRange.min * 2);
    estimate.calorieRange.max = Math.round(estimate.calorieRange.max * 2);
    estimate.assumptions.push("User corrected this to a double portion.");
  }

  const estimateId = await logAiEstimate({
    userId,
    estimate,
    inputContext: input.correctionText,
    inputType: "correction",
    model: CORRECTION_MODEL,
    promptVersion: CORRECTION_PROMPT_VERSION,
    usedFallback: true
  });
  await logUserCorrection({
    userId,
    aiEstimateId: input.estimateId ?? estimateId,
    before: input.estimate,
    after: estimate,
    correctionText: input.correctionText
  });

  return {
    estimate,
    estimateId,
    model: CORRECTION_MODEL,
    promptVersion: CORRECTION_PROMPT_VERSION,
    usedFallback: true
  };
}

export function getAiHistory(userId = DEMO_USER_ID) {
  return {
    estimates: store.aiEstimates.filter((estimate) => estimate.userId === userId).slice().reverse().slice(0, 50),
    corrections: store.userCorrections.filter((correction) => correction.userId === userId).slice().reverse().slice(0, 50)
  };
}

export async function getAiHistoryForUser(userId: string) {
  if (shouldPersistDirectlyToPrisma()) {
    return getAiHistoryFromPrisma(userId);
  }
  return getAiHistory(userId);
}
