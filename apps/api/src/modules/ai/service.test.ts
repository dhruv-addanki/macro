import { beforeEach, describe, expect, it } from "vitest";
import { store } from "../../lib/store";
import { applyCorrection, estimateTextMeal, getAiHistory } from "./service";

describe("ai service", () => {
  beforeEach(() => {
    store.aiEstimates = [];
    store.userCorrections = [];
    store.savedMeals = [];
    store.recipes = [];
    store.aiUsageEvents = [];
    store.analyticsEvents = [];
  });

  it("logs AI estimates and reuses correction memory for similar meals", async () => {
    const first = await estimateTextMeal({
      text: "rice and squash khichdi, homemade, one bowl",
      date: "2026-06-18",
      mealGroupId: "meal_lunch"
    });

    expect(first.estimateId).toBeTruthy();
    expect(first.estimate.assumptions.some((assumption) => assumption.toLowerCase().includes("ghee"))).toBe(true);

    const corrected = await applyCorrection({
      estimate: first.estimate,
      estimateId: first.estimateId,
      correctionText: "no ghee"
    });

    expect(corrected.estimate.macros.calories).toBe(first.estimate.macros.calories - 45);
    expect(store.userCorrections).toHaveLength(1);

    const second = await estimateTextMeal({
      text: "rice and squash khichdi, homemade, one bowl",
      date: "2026-06-19",
      mealGroupId: "meal_lunch"
    });
    const history = getAiHistory();

    expect(second.estimate.assumptions).toContain("Personal correction memory: similar meals are usually logged with no added oil/ghee.");
    expect(second.estimate.assumptions.some((assumption) => assumption.toLowerCase().includes("1 tsp oil"))).toBe(false);
    expect(history.estimates.length).toBeGreaterThanOrEqual(3);
    expect(history.corrections[0]?.correctionType).toBe("remove_added_fat");
  });

  it("scales sugar when applying portion corrections", async () => {
    const estimate = await estimateTextMeal({
      text: "rice and squash khichdi, homemade, one bowl",
      date: "2026-06-18",
      mealGroupId: "meal_lunch"
    });

    const corrected = await applyCorrection({
      estimate: estimate.estimate,
      estimateId: estimate.estimateId,
      correctionText: "half portion"
    });

    expect(corrected.estimate.macros.sugarG).toBe(Math.round(((estimate.estimate.macros.sugarG ?? 0) / 2) * 10) / 10);
  });
});
