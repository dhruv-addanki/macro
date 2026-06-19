import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { DEMO_USER_ID, store } from "../lib/store";

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("user data isolation", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    store.authUsers = [
      {
        id: DEMO_USER_ID,
        email: "demo@macro.local",
        displayName: "Demo User",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastLoginAt: null
      }
    ];
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
    store.profiles = [store.profile];
    store.goals = [
      {
        id: "goal_demo",
        userId: DEMO_USER_ID,
        calories: 2400,
        proteinG: 180,
        carbsG: 250,
        fatG: 70,
        sugarG: 50,
        fiberG: 30,
        sodiumMg: 2300,
        effectiveFrom: "2026-01-01"
      }
    ];
    store.mealGroups = [
      { id: "meal_breakfast", userId: DEMO_USER_ID, name: "Breakfast", sortOrder: 1, isDefault: true },
      { id: "meal_lunch", userId: DEMO_USER_ID, name: "Lunch", sortOrder: 2, isDefault: true },
      { id: "meal_dinner", userId: DEMO_USER_ID, name: "Dinner", sortOrder: 3, isDefault: true },
      { id: "meal_snacks", userId: DEMO_USER_ID, name: "Snacks", sortOrder: 4, isDefault: true }
    ];
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

  async function signup(email: string) {
    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email, displayName: email.split("@")[0] }
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { sessionToken: string; user: { id: string; email: string } };
  }

  it("isolates diary, custom foods, and progress by session user", async () => {
    const userA = await signup("alpha@macro.local");
    const userB = await signup("beta@macro.local");

    const meA = await app.inject({ method: "GET", url: "/me", headers: auth(userA.sessionToken) });
    const meB = await app.inject({ method: "GET", url: "/me", headers: auth(userB.sessionToken) });
    const lunchA = meA.json().mealGroups.find((mealGroup: { name: string }) => mealGroup.name === "Lunch").id;
    const lunchB = meB.json().mealGroups.find((mealGroup: { name: string }) => mealGroup.name === "Lunch").id;
    expect(lunchA).not.toBe(lunchB);

    const entryA = await app.inject({
      method: "POST",
      url: "/diary/entries",
      headers: auth(userA.sessionToken),
      payload: {
        date: "2026-06-18",
        mealGroupId: lunchA,
        displayName: "Alpha bowl",
        quantity: 1,
        unit: "bowl",
        grams: 400,
        macros: { calories: 600, proteinG: 45, carbsG: 70, fatG: 15, sugarG: 6, fiberG: 8, sodiumMg: 620 },
        sourceType: "manual",
        confidence: "high",
        assumptions: []
      }
    });
    expect(entryA.statusCode).toBe(200);

    const diaryA = await app.inject({ method: "GET", url: "/diary?date=2026-06-18", headers: auth(userA.sessionToken) });
    const diaryB = await app.inject({ method: "GET", url: "/diary?date=2026-06-18", headers: auth(userB.sessionToken) });
    expect(diaryA.json().totals.calories).toBe(600);
    expect(diaryA.json().totals.sugarG).toBe(6);
    expect(diaryB.json().totals.calories).toBe(0);
    expect(diaryB.json().totals.sugarG).toBe(0);

    const customFoodA = await app.inject({
      method: "POST",
      url: "/foods/custom",
      headers: auth(userA.sessionToken),
      payload: {
        name: "Alpha private yogurt",
        brand: null,
        per100g: { calories: 110, proteinG: 12, carbsG: 8, fatG: 2, sugarG: 5, fiberG: 0, sodiumMg: 60 }
      }
    });
    expect(customFoodA.statusCode).toBe(200);

    const foodsA = await app.inject({ method: "GET", url: "/foods/search?q=Alpha%20private", headers: auth(userA.sessionToken) });
    const foodsB = await app.inject({ method: "GET", url: "/foods/search?q=Alpha%20private", headers: auth(userB.sessionToken) });
    expect(foodsA.json().foods).toHaveLength(1);
    expect(foodsB.json().foods).toHaveLength(0);

    const weightB = await app.inject({
      method: "POST",
      url: "/progress/weight",
      headers: auth(userB.sessionToken),
      payload: { date: "2026-06-18", weightKg: 77 }
    });
    expect(weightB.statusCode).toBe(200);

    const progressA = await app.inject({ method: "GET", url: "/progress/summary", headers: auth(userA.sessionToken) });
    const progressB = await app.inject({ method: "GET", url: "/progress/summary", headers: auth(userB.sessionToken) });
    expect(progressA.json().latestWeightKg).toBe(null);
    expect(progressB.json().latestWeightKg).toBe(77);
  });
});
