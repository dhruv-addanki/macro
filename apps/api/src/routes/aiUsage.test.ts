import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { DEMO_USER_ID, store, type AiUsageEvent } from "../lib/store";

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("AI usage controls", () => {
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
    store.aiEstimates = [];
    store.userCorrections = [];
    store.savedMeals = [];
    store.recipes = [];
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
      payload: { email: "usage@macro.local", displayName: "Usage User" }
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { sessionToken: string; user: { id: string } };
  }

  it("records accepted AI requests in the per-user usage summary", async () => {
    const user = await signup();

    const estimate = await app.inject({
      method: "POST",
      url: "/ai/meal-text/estimate",
      headers: auth(user.sessionToken),
      payload: {
        text: "rice and squash khichdi, homemade, one bowl",
        date: "2026-06-18",
        mealGroupId: "meal_lunch"
      }
    });
    expect(estimate.statusCode).toBe(200);

    const usage = await app.inject({
      method: "GET",
      url: "/ai/usage",
      headers: auth(user.sessionToken)
    });
    expect(usage.statusCode).toBe(200);
    expect(usage.json()).toMatchObject({
      usedTodayUnits: 1,
      remainingTodayUnits: 199
    });
    expect(usage.json().limits.find((limit: { endpoint: string }) => limit.endpoint === "meal-text-estimate")).toMatchObject({
      used: 1,
      remaining: 59
    });
    expect(usage.json().recentEvents[0]).toMatchObject({
      endpoint: "meal-text-estimate",
      inputType: "text",
      model: "gpt-5.4-mini",
      promptVersion: "meal-text-estimate.v1",
      status: "accepted",
      usedFallback: true,
      costUnits: 1
    });
  });

  it("accepts compressed phone photo payloads above the default parser limit", async () => {
    const user = await signup();

    const estimate = await app.inject({
      method: "POST",
      url: "/ai/meal-photo/estimate",
      headers: auth(user.sessionToken),
      payload: {
        context: "packaged granola bar",
        date: "2026-06-23",
        imageBase64: "a".repeat(1_500_000),
        mealGroupId: "meal_snack",
        mimeType: "image/jpeg",
        retainPhoto: false
      }
    });

    expect(estimate.statusCode).toBe(200);
    expect(estimate.json()).toMatchObject({
      promptVersion: "meal-photo-estimate.v1",
      usedFallback: true
    });
    expect(store.aiUsageEvents.at(-1)).toMatchObject({
      endpoint: "meal-photo-estimate",
      status: "accepted"
    });
  });

  it("blocks AI requests after the endpoint window limit is reached", async () => {
    const user = await signup();
    const now = new Date().toISOString();
    store.aiUsageEvents = Array.from({ length: 60 }, (_, index): AiUsageEvent => ({
      id: `usage_seed_${index}`,
      userId: user.user.id,
      endpoint: "meal-text-estimate",
      inputType: "text",
      model: "gpt-5.4-mini",
      promptVersion: "meal-text-estimate.v1",
      status: "accepted",
      usedFallback: true,
      costUnits: 1,
      reason: null,
      createdAt: now
    }));

    const blocked = await app.inject({
      method: "POST",
      url: "/ai/meal-text/estimate",
      headers: auth(user.sessionToken),
      payload: {
        text: "khichdi bowl",
        date: "2026-06-18",
        mealGroupId: "meal_lunch"
      }
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeTruthy();
    expect(blocked.json()).toMatchObject({
      error: "rate_limited",
      limit: 60,
      remaining: 0
    });
    expect(store.aiEstimates).toHaveLength(0);
    expect(store.aiUsageEvents.at(-1)).toMatchObject({
      userId: user.user.id,
      endpoint: "meal-text-estimate",
      status: "blocked",
      reason: "endpoint_rate_limit"
    });
  });

  it("blocks AI requests after the daily budget is reached", async () => {
    const user = await signup();
    const now = new Date().toISOString();
    store.aiUsageEvents = [
      {
        id: "usage_seed_daily_budget",
        userId: user.user.id,
        endpoint: "meal-text-estimate",
        inputType: "text",
        model: "gpt-5.4-mini",
        promptVersion: "meal-text-estimate.v1",
        status: "accepted",
        usedFallback: true,
        costUnits: 198,
        reason: null,
        createdAt: now
      }
    ];

    const blocked = await app.inject({
      method: "POST",
      url: "/ai/meal-photo/estimate",
      headers: auth(user.sessionToken),
      payload: {
        context: "one bowl homemade khichdi",
        imageBase64: Buffer.from("fake-image").toString("base64"),
        retainPhoto: false
      }
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({
      error: "daily_budget_exceeded",
      limit: 200,
      remaining: 2
    });
    expect(store.aiEstimates).toHaveLength(0);
    expect(store.aiUsageEvents.at(-1)).toMatchObject({
      userId: user.user.id,
      endpoint: "meal-photo-estimate",
      status: "blocked",
      reason: "daily_budget"
    });
  });
});
