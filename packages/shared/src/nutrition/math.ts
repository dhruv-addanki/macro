import type { MacroNutrients } from "../schemas/nutrition";

export const EMPTY_MACROS: MacroNutrients = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  sugarG: 0,
  fiberG: 0,
  sodiumMg: 0
};

export function roundNutrition(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
}

export function addMacros(items: MacroNutrients[]): MacroNutrients {
  return items.reduce<MacroNutrients>(
    (total, item) => ({
      calories: roundNutrition(total.calories + item.calories),
      proteinG: roundNutrition(total.proteinG + item.proteinG),
      carbsG: roundNutrition(total.carbsG + item.carbsG),
      fatG: roundNutrition(total.fatG + item.fatG),
      sugarG: roundNutrition((total.sugarG ?? 0) + (item.sugarG ?? 0)),
      fiberG: roundNutrition(total.fiberG + item.fiberG),
      sodiumMg: roundNutrition(total.sodiumMg + item.sodiumMg)
    }),
    { ...EMPTY_MACROS }
  );
}

export function scaleMacros(macros: MacroNutrients, multiplier: number): MacroNutrients {
  return {
    calories: roundNutrition(macros.calories * multiplier),
    proteinG: roundNutrition(macros.proteinG * multiplier),
    carbsG: roundNutrition(macros.carbsG * multiplier),
    fatG: roundNutrition(macros.fatG * multiplier),
    sugarG: roundNutrition((macros.sugarG ?? 0) * multiplier),
    fiberG: roundNutrition(macros.fiberG * multiplier),
    sodiumMg: roundNutrition(macros.sodiumMg * multiplier)
  };
}

export function macrosFromPer100g(per100g: MacroNutrients, grams: number): MacroNutrients {
  return scaleMacros(per100g, grams / 100);
}

export function macroCalories(macros: Pick<MacroNutrients, "proteinG" | "carbsG" | "fatG">): number {
  return roundNutrition(macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9);
}
