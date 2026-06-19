import { describe, expect, it } from "vitest";
import { copyDiaryDay, createDiaryEntry, duplicateDiaryEntry, getDiary, updateDiaryEntry } from "./service";

describe("diary service", () => {
  it("creates diary entries and totals by meal/day", async () => {
    const date = "2026-06-18";
    await createDiaryEntry({
      date,
      mealGroupId: "meal_lunch",
      displayName: "Test chicken",
      quantity: 1,
      unit: "serving",
      grams: 100,
      macros: { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, sugarG: 0, fiberG: 0, sodiumMg: 74 },
      sourceType: "manual",
      confidence: "high",
      assumptions: []
    });

    const diary = getDiary(date);
    expect(diary.totals.calories).toBeGreaterThanOrEqual(165);
    expect(diary.totals.sugarG).toBeGreaterThanOrEqual(0);
    expect(diary.meals.find((meal) => meal.mealGroup.id === "meal_lunch")?.entries.length).toBeGreaterThan(0);
  });

  it("updates and duplicates diary entries", async () => {
    const date = "2026-06-19";
    const entry = await createDiaryEntry({
      date,
      mealGroupId: "meal_lunch",
      displayName: "Editable bowl",
      quantity: 1,
      unit: "bowl",
      grams: 350,
      macros: { calories: 500, proteinG: 35, carbsG: 55, fatG: 14, sugarG: 5, fiberG: 8, sodiumMg: 620 },
      sourceType: "ai_text",
      confidence: "medium",
      assumptions: ["Initial estimate."]
    });

    const updated = await updateDiaryEntry(entry.id, {
      displayName: "Edited bowl",
      mealGroupId: "meal_dinner",
      macros: { calories: 575, proteinG: 42, carbsG: 60, fatG: 15, sugarG: 7, fiberG: 9, sodiumMg: 650 }
    });
    const duplicate = await duplicateDiaryEntry(entry.id, date);
    const diary = getDiary(date);
    const dinner = diary.meals.find((meal) => meal.mealGroup.id === "meal_dinner");

    expect(updated?.displayName).toBe("Edited bowl");
    expect(updated?.mealGroupId).toBe("meal_dinner");
    expect(updated?.macros.sugarG).toBe(7);
    expect(duplicate?.id).not.toBe(entry.id);
    expect(dinner?.totals.calories).toBeGreaterThanOrEqual(1150);
  });

  it("copies a full diary day to another date", async () => {
    const fromDate = "2026-06-20";
    const toDate = "2026-06-21";
    const breakfast = await createDiaryEntry({
      date: fromDate,
      mealGroupId: "meal_breakfast",
      displayName: "Copy oats",
      quantity: 1,
      unit: "bowl",
      grams: 280,
      macros: { calories: 420, proteinG: 24, carbsG: 56, fatG: 10, sugarG: 12, fiberG: 9, sodiumMg: 210 },
      sourceType: "manual",
      confidence: "high",
      assumptions: []
    });
    const dinner = await createDiaryEntry({
      date: fromDate,
      mealGroupId: "meal_dinner",
      displayName: "Copy chicken rice",
      quantity: 1,
      unit: "plate",
      grams: 450,
      macros: { calories: 650, proteinG: 52, carbsG: 70, fatG: 14, sugarG: 4, fiberG: 6, sodiumMg: 740 },
      sourceType: "manual",
      confidence: "high",
      assumptions: []
    });

    const copied = await copyDiaryDay(fromDate, toDate);
    const diary = getDiary(toDate);

    expect(copied).toHaveLength(2);
    expect(copied.map((entry) => entry.id)).not.toContain(breakfast.id);
    expect(copied.map((entry) => entry.id)).not.toContain(dinner.id);
    expect(diary.totals.calories).toBeGreaterThanOrEqual(1070);
    expect(diary.totals.sugarG).toBeGreaterThanOrEqual(16);
    expect(diary.meals.find((meal) => meal.mealGroup.id === "meal_breakfast")?.entries.some((entry) => entry.displayName === "Copy oats")).toBe(true);
    expect(diary.meals.find((meal) => meal.mealGroup.id === "meal_dinner")?.entries.some((entry) => entry.displayName === "Copy chicken rice")).toBe(true);
  });
});
