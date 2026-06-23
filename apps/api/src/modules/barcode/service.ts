import type {
  BarcodeLookupResponse,
  BarcodeProductRequest,
  BarcodeProductUpdateRequest,
  FoodItem,
  MacroNutrients,
  ServingUnit
} from "@macro/shared";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "../../lib/env";
import { createId } from "../../lib/http";
import { getFoodItemByBarcodeFromPrisma, persistFoodItemInPrisma } from "../../lib/prismaStore";
import { saveStore, store } from "../../lib/store";
import { BARCODE_UNITS_PROMPT_VERSION, buildBarcodeUnitsPrompt } from "../ai/prompts/barcodeUnits.v1";

type OpenFoodFactsProduct = {
  product_name?: string;
  brands?: string;
  serving_quantity?: string | number;
  serving_quantity_unit?: string;
  nutriments?: Record<string, string | number | undefined>;
};

const openai = env.openaiApiKey && process.env.NODE_ENV !== "test" ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

const BarcodeUnitModelResponseSchema = z.object({
  servingUnits: z.array(
    z.object({
      unitName: z.string().min(1),
      gramsPerUnit: z.number().positive(),
      confidence: z.enum(["high", "medium", "low"]),
      notes: z.string()
    })
  ).max(5)
});

function numberFrom(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeOpenFoodFactsProduct(barcode: string, product: OpenFoodFactsProduct): FoodItem {
  const nutriments = product.nutriments ?? {};
  const per100g: MacroNutrients = {
    calories: numberFrom(nutriments["energy-kcal_100g"]),
    proteinG: numberFrom(nutriments.proteins_100g),
    carbsG: numberFrom(nutriments.carbohydrates_100g),
    fatG: numberFrom(nutriments.fat_100g),
    sugarG: numberFrom(nutriments.sugars_100g),
    fiberG: numberFrom(nutriments.fiber_100g),
    sodiumMg: numberFrom(nutriments.sodium_100g) * 1000
  };

  const foodId = createId("food");
  const servingQuantity = numberFrom(product.serving_quantity);
  const servingUnitName = product.serving_quantity_unit ? `${servingQuantity} ${product.serving_quantity_unit}` : "package serving";
  const servingUnits: ServingUnit[] = [
    {
      id: createId("unit"),
      foodItemId: foodId,
      unitName: "100 g",
      gramsPerUnit: 100,
      source: "label",
      confidence: "high"
    }
  ];

  if (servingQuantity > 0) {
    servingUnits.push({
      id: createId("unit"),
      foodItemId: foodId,
      unitName: servingUnitName,
      gramsPerUnit: servingQuantity,
      source: "label",
      confidence: "high"
    });
  }

  return {
    id: foodId,
    sourceType: "branded",
    name: product.product_name || `Barcode ${barcode}`,
    brand: product.brands || null,
    verified: true,
    per100g,
    servingUnits
  };
}

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

export async function persistBarcodeFood(food: FoodItem, barcode?: string, rawPayload?: unknown): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await persistFoodItemInPrisma({ food, barcode, rawPayload });
    return;
  }

  saveStore();
}

function barcodeFoodId(barcode: string): string {
  return `barcode_${barcode}`;
}

function servingUnitFromInput(foodId: string, unit: NonNullable<BarcodeProductRequest["servingUnits"]>[number]): ServingUnit {
  return {
    id: unit.id ?? createId("unit"),
    foodItemId: foodId,
    unitName: unit.unitName,
    gramsPerUnit: unit.gramsPerUnit,
    source: unit.source,
    confidence: unit.confidence,
    notes: unit.notes
  };
}

function hasServingUnit(units: ServingUnit[], unitName: string): boolean {
  const normalized = unitName.trim().toLowerCase();
  return units.some((unit) => unit.unitName.trim().toLowerCase() === normalized);
}

function normalizeServingUnits(foodId: string, units: BarcodeProductRequest["servingUnits"] = []): ServingUnit[] {
  const normalized = units.map((unit) => servingUnitFromInput(foodId, unit));
  if (!hasServingUnit(normalized, "100 g")) {
    normalized.unshift({
      id: createId("unit"),
      foodItemId: foodId,
      unitName: "100 g",
      gramsPerUnit: 100,
      source: "label",
      confidence: "high"
    });
  }
  return normalized;
}

function mergeServingUnits(baseUnits: ServingUnit[], extraUnits: ServingUnit[]): ServingUnit[] {
  const merged = [...baseUnits];
  for (const unit of extraUnits) {
    if (!hasServingUnit(merged, unit.unitName)) {
      merged.push(unit);
    }
  }
  return merged;
}

async function callOpenAIForBarcodeUnits(food: FoodItem): Promise<ServingUnit[]> {
  if (!openai) return [];

  try {
    const response = await (openai.responses.create as any)({
      model: env.aiBarcodeUnitModel,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildBarcodeUnitsPrompt(food)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "barcode_unit_suggestions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["servingUnits"],
            properties: {
              servingUnits: {
                type: "array",
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["unitName", "gramsPerUnit", "confidence", "notes"],
                  properties: {
                    unitName: { type: "string" },
                    gramsPerUnit: { type: "number" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    notes: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    });

    const text = response.output_text as string | undefined;
    if (!text) return [];
    const parsed = BarcodeUnitModelResponseSchema.parse(JSON.parse(text));
    return parsed.servingUnits.map((unit) => ({
      id: createId("unit"),
      foodItemId: food.id,
      unitName: unit.unitName,
      gramsPerUnit: Math.round(unit.gramsPerUnit * 10) / 10,
      source: "estimated",
      confidence: unit.confidence,
      notes: `${unit.notes} Model-estimated by ${BARCODE_UNITS_PROMPT_VERSION}.`
    }));
  } catch {
    return [];
  }
}

export async function suggestPracticalUnitsWithAi(food: FoodItem): Promise<ServingUnit[]> {
  const deterministicUnits = suggestPracticalUnits(food);
  const modelUnits = await callOpenAIForBarcodeUnits(food);
  return mergeServingUnits(deterministicUnits, modelUnits);
}

function barcodeLookupResponse(barcode: string, food: FoodItem, source: string): BarcodeLookupResponse {
  return {
    found: true,
    barcode,
    food,
    source,
    servingUnits: food.servingUnits
  };
}

export function getCachedBarcodeFood(barcodeOrFoodId: string): FoodItem | undefined {
  const id = barcodeOrFoodId.startsWith("barcode_") ? barcodeOrFoodId : barcodeFoodId(barcodeOrFoodId);
  return store.foods.find((food) => food.id === id);
}

export async function createBarcodeProduct(input: BarcodeProductRequest): Promise<BarcodeLookupResponse> {
  const foodId = barcodeFoodId(input.barcode);
  const labelUnits = normalizeServingUnits(foodId, input.servingUnits);
  const food: FoodItem = {
    id: foodId,
    sourceType: "branded",
    name: input.name,
    brand: input.brand ?? null,
    verified: input.verified ?? false,
    per100g: input.per100g,
    servingUnits: labelUnits
  };
  food.servingUnits = mergeServingUnits(food.servingUnits, (await suggestPracticalUnitsWithAi(food)).map((unit) => ({ ...unit, foodItemId: food.id })));

  const existingIndex = store.foods.findIndex((candidate) => candidate.id === food.id);
  const previous = existingIndex >= 0 ? store.foods[existingIndex] : undefined;
  if (existingIndex >= 0) {
    store.foods[existingIndex] = food;
  } else {
    store.foods.push(food);
  }

  try {
    await persistBarcodeFood(food, input.barcode, { source: "manual", ...input });
  } catch (error) {
    if (previous && existingIndex >= 0) {
      store.foods[existingIndex] = previous;
    } else {
      store.foods = store.foods.filter((candidate) => candidate.id !== food.id);
    }
    throw error;
  }

  return barcodeLookupResponse(input.barcode, food, "manual");
}

export async function updateBarcodeProduct(barcodeOrFoodId: string, input: BarcodeProductUpdateRequest): Promise<BarcodeLookupResponse | null> {
  const barcode = barcodeOrFoodId.startsWith("barcode_") ? barcodeOrFoodId.slice("barcode_".length) : barcodeOrFoodId;
  const existing = getCachedBarcodeFood(barcodeOrFoodId) ?? (shouldPersistDirectlyToPrisma() ? await getFoodItemByBarcodeFromPrisma(barcode) : null);
  if (!existing) return null;

  const updated: FoodItem = {
    ...existing,
    name: input.name ?? existing.name,
    brand: input.brand === undefined ? existing.brand : input.brand,
    verified: input.verified ?? existing.verified,
    per100g: input.per100g ?? existing.per100g,
    servingUnits: input.servingUnits
      ? normalizeServingUnits(existing.id, input.servingUnits)
      : existing.servingUnits.map((unit) => ({ ...unit, foodItemId: existing.id }))
  };
  updated.servingUnits = mergeServingUnits(updated.servingUnits, (await suggestPracticalUnitsWithAi(updated)).map((unit) => ({ ...unit, foodItemId: updated.id })));

  const existingIndex = store.foods.findIndex((candidate) => candidate.id === updated.id);
  const previous = existingIndex >= 0 ? store.foods[existingIndex] : undefined;
  if (existingIndex >= 0) {
    store.foods[existingIndex] = updated;
  } else {
    store.foods.push(updated);
  }

  try {
    await persistBarcodeFood(updated, barcode, { source: "correction", ...input });
  } catch (error) {
    if (previous && existingIndex >= 0) {
      store.foods[existingIndex] = previous;
    } else {
      store.foods = store.foods.filter((candidate) => candidate.id !== updated.id);
    }
    throw error;
  }

  return barcodeLookupResponse(barcode, updated, "manual_correction");
}

export function suggestPracticalUnits(food: FoodItem): ServingUnit[] {
  const name = `${food.name} ${food.brand ?? ""}`.toLowerCase();
  const units: ServingUnit[] = [];

  if (name.includes("chicken") || name.includes("turkey")) {
    units.push(
      {
        id: createId("unit"),
        foodItemId: food.id,
        unitName: "1 breast filet",
        gramsPerUnit: 170,
        source: "estimated",
        confidence: "medium",
        notes: "Estimated practical serving for cooked poultry."
      },
      {
        id: createId("unit"),
        foodItemId: food.id,
        unitName: "1 cup cooked chopped",
        gramsPerUnit: 140,
        source: "estimated",
        confidence: "medium"
      }
    );
  }

  if (name.includes("cereal") || name.includes("granola")) {
    units.push({
      id: createId("unit"),
      foodItemId: food.id,
      unitName: "1 cup",
      gramsPerUnit: 40,
      source: "estimated",
      confidence: "low",
      notes: "Cup weight varies heavily by product density."
    });
  }

  if (name.includes("sauce") || name.includes("dressing") || name.includes("oil")) {
    units.push(
      {
        id: createId("unit"),
        foodItemId: food.id,
        unitName: "1 tbsp",
        gramsPerUnit: 15,
        source: "estimated",
        confidence: "medium"
      },
      {
        id: createId("unit"),
        foodItemId: food.id,
        unitName: "1 tsp",
        gramsPerUnit: 5,
        source: "estimated",
        confidence: "medium"
      }
    );
  }

  return units;
}

export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResponse> {
  const cached = shouldPersistDirectlyToPrisma()
    ? await getFoodItemByBarcodeFromPrisma(barcode)
    : getCachedBarcodeFood(barcode);
  if (cached) {
    return {
      found: true,
      barcode,
      food: cached,
      source: "cache",
      servingUnits: cached.servingUnits
    };
  }

  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
    if (response.ok) {
      const payload = (await response.json()) as { status?: number; product?: OpenFoodFactsProduct };
      if (payload.status === 1 && payload.product) {
        const food = normalizeOpenFoodFactsProduct(barcode, payload.product);
        const practicalUnits = await suggestPracticalUnitsWithAi(food);
        food.servingUnits.push(...practicalUnits);
        food.id = barcodeFoodId(barcode);
        food.servingUnits = food.servingUnits.map((unit) => ({
          ...unit,
          foodItemId: food.id
        }));
        store.foods.push(food);
        try {
          await persistBarcodeFood(food, barcode, payload.product);
        } catch (error) {
          store.foods = store.foods.filter((candidate) => candidate.id !== food.id);
          throw error;
        }
        return barcodeLookupResponse(barcode, food, "open_food_facts");
      }
    }
  } catch {
    // Fall through to the not-found response. The route still stays usable offline.
  }

  return {
    found: false,
    barcode,
    food: null,
    source: null,
    servingUnits: [],
    message: "Product not found. Create it manually or try again later."
  };
}
