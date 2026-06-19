import { describe, expect, it } from "vitest";
import { addMacros, macroCalories, macrosFromPer100g } from "./math";

describe("nutrition math", () => {
  it("scales per-100g values by grams", () => {
    expect(
      macrosFromPer100g(
        { calories: 200, proteinG: 10, carbsG: 20, fatG: 5, sugarG: 8, fiberG: 2, sodiumMg: 100 },
        50
      )
    ).toEqual({ calories: 100, proteinG: 5, carbsG: 10, fatG: 2.5, sugarG: 4, fiberG: 1, sodiumMg: 50 });
  });

  it("adds macro totals", () => {
    expect(
      addMacros([
        { calories: 100, proteinG: 10, carbsG: 5, fatG: 2, sugarG: 3, fiberG: 1, sodiumMg: 50 },
        { calories: 50, proteinG: 5, carbsG: 10, fatG: 1, sugarG: 4, fiberG: 2, sodiumMg: 20 }
      ])
    ).toEqual({ calories: 150, proteinG: 15, carbsG: 15, fatG: 3, sugarG: 7, fiberG: 3, sodiumMg: 70 });
  });

  it("computes macro-derived calories", () => {
    expect(macroCalories({ proteinG: 25, carbsG: 50, fatG: 10 })).toBe(390);
  });
});
