import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { DEMO_USER_ID, store } from "../lib/store";

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("meal group routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    store.authUsers = [];
    store.authSessions = [];
    store.profile = {
      id: "profile_demo",
      userId: DEMO_USER_ID,
      displayName: "Demo User",
      onboardingCompleted: false,
      goalType: "maintain",
      activityLevel: "moderate",
      unitSystem: "imperial",
      heightCm: 178,
      weightKg: 82
    };
    store.profiles = [];
    store.goals = [];
    store.mealGroups = [];
    store.foods = [];
    store.diaryEntries = [];
    store.favoriteFoodIds = new Set();
    store.savedMeals = [];
    store.recipes = [];
    store.weightEntries = [];
    store.mealPhotos = [];
    store.aiEstimates = [];
    store.userCorrections = [];
    store.aiUsageEvents = [];
    store.analyticsEvents = [];
    app = await buildServer();
  });

  afterEach(async () => {
    await app.close();
  });

  async function signup() {
    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "groups@macro.local", displayName: "Meal Groups User" }
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { sessionToken: string };
  }

  it("creates, renames, reorders, and safely deletes custom meal groups", async () => {
    const user = await signup();

    const create = await app.inject({
      method: "POST",
      url: "/me/meal-groups",
      headers: auth(user.sessionToken),
      payload: { name: "  Pre   workout  " }
    });
    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({
      name: "Pre workout",
      isDefault: false,
      sortOrder: 5
    });
    const customId = create.json().id as string;

    const update = await app.inject({
      method: "PATCH",
      url: `/me/meal-groups/${customId}`,
      headers: auth(user.sessionToken),
      payload: { name: "Training" }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe("Training");

    const meBeforeReorder = await app.inject({ method: "GET", url: "/me", headers: auth(user.sessionToken) });
    const orderedIds = [customId, ...meBeforeReorder.json().mealGroups.filter((mealGroup: { id: string }) => mealGroup.id !== customId).map((mealGroup: { id: string }) => mealGroup.id)];
    const reorder = await app.inject({
      method: "POST",
      url: "/me/meal-groups/reorder",
      headers: auth(user.sessionToken),
      payload: { orderedIds }
    });
    expect(reorder.statusCode).toBe(200);
    expect(reorder.json().mealGroups[0].id).toBe(customId);

    const diary = await app.inject({ method: "GET", url: "/diary?date=2026-06-19", headers: auth(user.sessionToken) });
    expect(diary.statusCode).toBe(200);
    expect(diary.json().meals[0].mealGroup.id).toBe(customId);

    const defaultMealGroup = reorder.json().mealGroups.find((mealGroup: { isDefault: boolean }) => mealGroup.isDefault);
    const deleteDefault = await app.inject({
      method: "DELETE",
      url: `/me/meal-groups/${defaultMealGroup.id}`,
      headers: auth(user.sessionToken)
    });
    expect(deleteDefault.statusCode).toBe(400);
    expect(deleteDefault.json().error).toBe("default_meal_group");

    const createEmpty = await app.inject({
      method: "POST",
      url: "/me/meal-groups",
      headers: auth(user.sessionToken),
      payload: { name: "Empty custom" }
    });
    expect(createEmpty.statusCode).toBe(200);
    const deleteEmpty = await app.inject({
      method: "DELETE",
      url: `/me/meal-groups/${createEmpty.json().id}`,
      headers: auth(user.sessionToken)
    });
    expect(deleteEmpty.statusCode).toBe(200);
    expect(deleteEmpty.json().deletedId).toBe(createEmpty.json().id);

    const createWithEntries = await app.inject({
      method: "POST",
      url: "/me/meal-groups",
      headers: auth(user.sessionToken),
      payload: { name: "With entries" }
    });
    expect(createWithEntries.statusCode).toBe(200);
    const withEntriesId = createWithEntries.json().id as string;
    const entry = await app.inject({
      method: "POST",
      url: "/diary/entries",
      headers: auth(user.sessionToken),
      payload: {
        date: "2026-06-19",
        mealGroupId: withEntriesId,
        displayName: "Protein snack",
        quantity: 1,
        unit: "serving",
        grams: 100,
        macros: { calories: 220, proteinG: 30, carbsG: 8, fatG: 6, sugarG: 2, fiberG: 1, sodiumMg: 180 },
        sourceType: "manual",
        confidence: "high",
        assumptions: []
      }
    });
    expect(entry.statusCode).toBe(200);

    const deleteWithEntries = await app.inject({
      method: "DELETE",
      url: `/me/meal-groups/${withEntriesId}`,
      headers: auth(user.sessionToken)
    });
    expect(deleteWithEntries.statusCode).toBe(400);
    expect(deleteWithEntries.json().error).toBe("meal_group_has_entries");
  });
});
