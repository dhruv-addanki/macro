import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { DEMO_USER_ID, store } from "../lib/store";

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("recipe routes", () => {
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
      payload: { email: "recipes@macro.local", displayName: "Recipe User" }
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { sessionToken: string };
  }

  it("updates recipe ingredients and logs recalculated servings", async () => {
    const user = await signup();
    const headers = auth(user.sessionToken);
    const ingredient = {
      id: "ingredient_rice",
      foodItemId: null,
      displayName: "Rice batch",
      quantity: 1,
      unit: "batch",
      grams: 600,
      macros: { calories: 900, proteinG: 18, carbsG: 192, fatG: 3, sugarG: 0, fiberG: 6, sodiumMg: 60 }
    };

    const created = await app.inject({
      method: "POST",
      url: "/recipes",
      headers,
      payload: {
        name: "Rice prep",
        servings: 3,
        totalCookedWeightG: 600,
        ingredients: [ingredient]
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().perServing.calories).toBe(300);

    const updated = await app.inject({
      method: "PATCH",
      url: `/recipes/${created.json().id}`,
      headers,
      payload: {
        name: "Rice and dal prep",
        servings: 2,
        ingredients: [
          ingredient,
          {
            id: "ingredient_dal",
            foodItemId: null,
            displayName: "Dal batch",
            quantity: 1,
            unit: "batch",
            grams: 400,
            macros: { calories: 500, proteinG: 32, carbsG: 72, fatG: 8, sugarG: 4, fiberG: 18, sodiumMg: 380 }
          }
        ]
      }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe("Rice and dal prep");
    expect(updated.json().ingredients).toHaveLength(2);
    expect(updated.json().totals.calories).toBe(1400);
    expect(updated.json().perServing.calories).toBe(700);

    const logged = await app.inject({
      method: "POST",
      url: `/recipes/${created.json().id}/log`,
      headers,
      payload: { date: "2026-06-20", mealGroupId: "meal_dinner", servings: 0.5 }
    });
    expect(logged.statusCode).toBe(200);
    expect(logged.json()).toMatchObject({
      date: "2026-06-20",
      mealGroupId: "meal_dinner",
      displayName: "Rice and dal prep",
      quantity: 0.5,
      unit: "servings",
      sourceType: "recipe"
    });
    expect(logged.json().macros.calories).toBe(350);
  });
});
