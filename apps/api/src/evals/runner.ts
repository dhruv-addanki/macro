import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { FoodItemSchema, MealEstimateSchema, type MealEstimate } from "@macro/shared";
import { suggestPracticalUnits } from "../modules/barcode/service";
import { applyCorrection, estimatePhotoMeal, estimateTextMeal } from "../modules/ai/service";
import { store } from "../lib/store";

const RangeSchema = z.tuple([z.number(), z.number()]);

const MacroRangeSchema = z.object({
  calories: RangeSchema,
  proteinG: RangeSchema,
  carbsG: RangeSchema,
  fatG: RangeSchema,
  sugarG: RangeSchema.optional()
});

const MealEvalCaseSchema = z.object({
  id: z.string(),
  input: z.object({
    text: z.string().optional(),
    context: z.string().optional()
  }),
  expected: z.object({
    macros: MacroRangeSchema,
    confidence: z.enum(["high", "medium", "low"]),
    assumptionsInclude: z.array(z.string())
  }),
  unacceptableErrors: z.array(z.string())
});

const CorrectionEvalCaseSchema = z.object({
  id: z.string(),
  input: z.object({
    text: z.string()
  }),
  correctionText: z.string(),
  expected: z.object({
    caloriesDelta: RangeSchema.optional(),
    fatDelta: RangeSchema.optional(),
    caloriesRatio: RangeSchema.optional(),
    fatRatio: RangeSchema.optional(),
    assumptionsInclude: z.array(z.string()),
    correctionType: z.string()
  }),
  unacceptableErrors: z.array(z.string())
});

const BarcodeEvalCaseSchema = z.object({
  id: z.string(),
  food: FoodItemSchema,
  expectedUnits: z.array(
    z.object({
      unitName: z.string(),
      grams: RangeSchema,
      confidence: z.enum(["high", "medium", "low"])
    })
  ),
  unacceptableErrors: z.array(z.string())
});

type EvalFailure = {
  actual?: unknown;
  caseId: string;
  expected?: unknown;
  message: string;
  suite: string;
};

export type EvalReport = {
  failures: EvalFailure[];
  passed: number;
  total: number;
};

const evalRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../evals");

function readJson<T>(relativePath: string, schema: z.ZodSchema<T>): T {
  const raw = JSON.parse(readFileSync(resolve(evalRoot, relativePath), "utf8")) as unknown;
  return schema.parse(raw);
}

function inRange(value: number, [min, max]: [number, number]) {
  return value >= min && value <= max;
}

function assumptionMatches(estimate: MealEstimate, expected: string) {
  const normalized = expected.toLowerCase();
  return estimate.assumptions.some((assumption) => assumption.toLowerCase().includes(normalized));
}

function resetEvalMemory() {
  store.aiEstimates = [];
  store.userCorrections = [];
  store.savedMeals = [];
  store.recipes = [];
  store.aiUsageEvents = [];
  store.analyticsEvents = [];
}

function checkMealEstimate(suite: string, caseId: string, estimate: MealEstimate, expected: z.infer<typeof MealEvalCaseSchema>["expected"]): EvalFailure[] {
  const parsed = MealEstimateSchema.safeParse(estimate);
  const failures: EvalFailure[] = [];
  if (!parsed.success) {
    failures.push({ caseId, suite, message: "Estimate is not schema-valid", actual: parsed.error.issues });
  }

  for (const macro of ["calories", "proteinG", "carbsG", "fatG", "sugarG"] as const) {
    const range = expected.macros[macro];
    if (!range) continue;
    const actual = estimate.macros[macro] ?? 0;
    if (!inRange(actual, range)) {
      failures.push({
        actual,
        caseId,
        expected: range,
        message: `${macro} outside expected range`,
        suite
      });
    }
  }

  if (estimate.confidence !== expected.confidence) {
    failures.push({
      actual: estimate.confidence,
      caseId,
      expected: expected.confidence,
      message: "Confidence mismatch",
      suite
    });
  }

  for (const assumption of expected.assumptionsInclude) {
    if (!assumptionMatches(estimate, assumption)) {
      failures.push({
        actual: estimate.assumptions,
        caseId,
        expected: assumption,
        message: "Missing expected assumption",
        suite
      });
    }
  }

  return failures;
}

async function runTextMealEvals(): Promise<EvalFailure[]> {
  resetEvalMemory();
  const cases = readJson("text-meals/indian-home-cooked.json", z.array(MealEvalCaseSchema));
  const failures: EvalFailure[] = [];
  for (const item of cases) {
    const response = await estimateTextMeal({ text: item.input.text ?? "", date: "2026-06-18", mealGroupId: "meal_lunch" });
    failures.push(...checkMealEstimate("text-meals", item.id, response.estimate, item.expected));
  }
  return failures;
}

async function runPhotoMealEvals(): Promise<EvalFailure[]> {
  resetEvalMemory();
  const cases = readJson("photo-meals/contextual-cultural-meals.json", z.array(MealEvalCaseSchema));
  const failures: EvalFailure[] = [];
  for (const item of cases) {
    const response = await estimatePhotoMeal({ context: item.input.context ?? "", date: "2026-06-18", mealGroupId: "meal_lunch" });
    failures.push(...checkMealEstimate("photo-meals", item.id, response.estimate, item.expected));
  }
  return failures;
}

async function runCorrectionEvals(): Promise<EvalFailure[]> {
  resetEvalMemory();
  const cases = readJson("corrections/quick-corrections.json", z.array(CorrectionEvalCaseSchema));
  const failures: EvalFailure[] = [];

  for (const item of cases) {
    const original = await estimateTextMeal({ text: item.input.text, date: "2026-06-18", mealGroupId: "meal_lunch" });
    const corrected = await applyCorrection({
      estimate: original.estimate,
      estimateId: original.estimateId,
      correctionText: item.correctionText
    });

    if (item.expected.caloriesDelta) {
      const delta = Math.round((corrected.estimate.macros.calories - original.estimate.macros.calories) * 10) / 10;
      if (!inRange(delta, item.expected.caloriesDelta)) {
        failures.push({ actual: delta, caseId: item.id, expected: item.expected.caloriesDelta, message: "Calories delta mismatch", suite: "corrections" });
      }
    }
    if (item.expected.fatDelta) {
      const delta = Math.round((corrected.estimate.macros.fatG - original.estimate.macros.fatG) * 10) / 10;
      if (!inRange(delta, item.expected.fatDelta)) {
        failures.push({ actual: delta, caseId: item.id, expected: item.expected.fatDelta, message: "Fat delta mismatch", suite: "corrections" });
      }
    }
    if (item.expected.caloriesRatio) {
      const ratio = corrected.estimate.macros.calories / original.estimate.macros.calories;
      if (!inRange(ratio, item.expected.caloriesRatio)) {
        failures.push({ actual: ratio, caseId: item.id, expected: item.expected.caloriesRatio, message: "Calories ratio mismatch", suite: "corrections" });
      }
    }
    if (item.expected.fatRatio) {
      const ratio = corrected.estimate.macros.fatG / original.estimate.macros.fatG;
      if (!inRange(ratio, item.expected.fatRatio)) {
        failures.push({ actual: ratio, caseId: item.id, expected: item.expected.fatRatio, message: "Fat ratio mismatch", suite: "corrections" });
      }
    }

    for (const assumption of item.expected.assumptionsInclude) {
      if (!assumptionMatches(corrected.estimate, assumption)) {
        failures.push({
          actual: corrected.estimate.assumptions,
          caseId: item.id,
          expected: assumption,
          message: "Missing correction assumption",
          suite: "corrections"
        });
      }
    }

    const latestCorrection = store.userCorrections.at(-1);
    if (latestCorrection?.correctionType !== item.expected.correctionType) {
      failures.push({
        actual: latestCorrection?.correctionType,
        caseId: item.id,
        expected: item.expected.correctionType,
        message: "Correction type mismatch",
        suite: "corrections"
      });
    }
  }

  return failures;
}

function runBarcodeEvals(): EvalFailure[] {
  const cases = readJson("barcode/smart-units.json", z.array(BarcodeEvalCaseSchema));
  const failures: EvalFailure[] = [];

  for (const item of cases) {
    const units = suggestPracticalUnits(item.food);
    for (const expectedUnit of item.expectedUnits) {
      const actual = units.find((unit) => unit.unitName === expectedUnit.unitName);
      if (!actual) {
        failures.push({ caseId: item.id, expected: expectedUnit.unitName, message: "Missing expected serving unit", suite: "barcode" });
        continue;
      }
      if (!inRange(actual.gramsPerUnit, expectedUnit.grams)) {
        failures.push({
          actual: actual.gramsPerUnit,
          caseId: item.id,
          expected: expectedUnit.grams,
          message: "Serving unit grams outside expected range",
          suite: "barcode"
        });
      }
      if (actual.confidence !== expectedUnit.confidence) {
        failures.push({
          actual: actual.confidence,
          caseId: item.id,
          expected: expectedUnit.confidence,
          message: "Serving unit confidence mismatch",
          suite: "barcode"
        });
      }
    }
  }

  return failures;
}

export async function runMacroEvals(): Promise<EvalReport> {
  const failures = [
    ...(await runTextMealEvals()),
    ...(await runPhotoMealEvals()),
    ...(await runCorrectionEvals()),
    ...runBarcodeEvals()
  ];

  const total =
    readJson("text-meals/indian-home-cooked.json", z.array(MealEvalCaseSchema)).length +
    readJson("photo-meals/contextual-cultural-meals.json", z.array(MealEvalCaseSchema)).length +
    readJson("corrections/quick-corrections.json", z.array(CorrectionEvalCaseSchema)).length +
    readJson("barcode/smart-units.json", z.array(BarcodeEvalCaseSchema)).length;

  return {
    failures,
    passed: total - new Set(failures.map((failure) => `${failure.suite}:${failure.caseId}`)).size,
    total
  };
}
