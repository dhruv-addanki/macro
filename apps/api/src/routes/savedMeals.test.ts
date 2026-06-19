import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { DEMO_USER_ID, store } from "../lib/store";

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("saved meal routes", () => {
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
      payload: { email: "saved@macro.local", displayName: "Saved Meal User" }
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { sessionToken: string };
  }

  async function createDiaryEntry(sessionToken: string, displayName: string, calories: number) {
    const response = await app.inject({
      method: "POST",
      url: "/diary/entries",
      headers: auth(sessionToken),
      payload: {
        date: "2026-06-19",
        mealGroupId: "meal_lunch",
        displayName,
        quantity: 1,
        unit: "serving",
        grams: 100,
        macros: {
          calories,
          proteinG: calories / 20,
          carbsG: calories / 10,
          fatG: calories / 40,
          sugarG: calories / 100,
          fiberG: 2,
          sodiumMg: 180
        },
        sourceType: "manual",
        confidence: "high",
        assumptions: []
      }
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { id: string; displayName: string };
  }

  it("edits saved meal names and item selections before logging", async () => {
    const user = await signup();
    const rice = await createDiaryEntry(user.sessionToken, "Rice", 210);
    const dal = await createDiaryEntry(user.sessionToken, "Dal", 180);

    const saved = await app.inject({
      method: "POST",
      url: "/saved-meals",
      headers: auth(user.sessionToken),
      payload: { name: "Khichdi plate", entryIds: [rice.id, dal.id] }
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().totals.calories).toBe(390);

    const updated = await app.inject({
      method: "PATCH",
      url: `/saved-meals/${saved.json().id}`,
      headers: auth(user.sessionToken),
      payload: { name: "Rice side", entryIds: [rice.id] }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe("Rice side");
    expect(updated.json().entries).toHaveLength(1);
    expect(updated.json().entries[0].displayName).toBe("Rice");
    expect(updated.json().totals.calories).toBe(210);

    const logged = await app.inject({
      method: "POST",
      url: `/saved-meals/${saved.json().id}/log`,
      headers: auth(user.sessionToken),
      payload: { date: "2026-06-20", mealGroupId: "meal_dinner" }
    });
    expect(logged.statusCode).toBe(200);
    expect(logged.json().entries).toHaveLength(1);
    expect(logged.json().entries[0]).toMatchObject({
      date: "2026-06-20",
      mealGroupId: "meal_dinner",
      displayName: "Rice"
    });

    const invalidUnknown = await app.inject({
      method: "PATCH",
      url: `/saved-meals/${saved.json().id}`,
      headers: auth(user.sessionToken),
      payload: { entryIds: [rice.id, dal.id] }
    });
    expect(invalidUnknown.statusCode).toBe(400);
    expect(invalidUnknown.json().error).toBe("unknown_saved_meal_entry");

    const invalidEmpty = await app.inject({
      method: "PATCH",
      url: `/saved-meals/${saved.json().id}`,
      headers: auth(user.sessionToken),
      payload: { entryIds: [] }
    });
    expect(invalidEmpty.statusCode).toBe(400);
    expect(invalidEmpty.json().error).toBe("validation_error");
  });
});
