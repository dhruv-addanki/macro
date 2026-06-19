import type { FoodItem } from "@macro/shared";

export const BARCODE_UNITS_PROMPT_VERSION = "barcode-units.v1";

export function buildBarcodeUnitsPrompt(food: FoodItem): string {
  const labelUnits = food.servingUnits
    .map((unit) => `${unit.unitName}: ${unit.gramsPerUnit}g (${unit.source}, ${unit.confidence})`)
    .join("; ");

  return [
    "Suggest practical serving-unit conversions for a packaged food.",
    "Return schema-valid JSON only.",
    "Use the product name, brand, label units, and common culinary density knowledge.",
    "Only suggest units a user would naturally log with, such as cup, tbsp, tsp, slice, piece, filet, patty, pouch, scoop, or bottle.",
    "Do not repeat an existing label unit.",
    "Use grams per unit, not nutrition values.",
    "Prefer 2 to 4 useful units. Use conservative confidence when density varies.",
    `Product: ${food.name}`,
    `Brand: ${food.brand ?? "unknown"}`,
    `Per 100g: ${JSON.stringify(food.per100g)}`,
    `Existing units: ${labelUnits || "none"}`
  ].join("\n");
}
