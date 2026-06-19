import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { DEMO_USER_ID, store } from "../lib/store";

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("analytics routes", () => {
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
    store.diaryEntries = [];
    store.aiEstimates = [];
    store.userCorrections = [];
    store.aiUsageEvents = [];
    store.analyticsEvents = [];
    app = await buildServer();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  async function signup() {
    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "analytics@macro.local", displayName: "Analytics User" }
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { sessionToken: string; user: { id: string } };
  }

  it("summarizes accepted AI logs, corrections, barcode failures, and AI cost", async () => {
    const user = await signup();
    const me = await app.inject({ method: "GET", url: "/me", headers: auth(user.sessionToken) });
    const lunch = me.json().mealGroups.find((mealGroup: { name: string }) => mealGroup.name === "Lunch").id;

    const estimateResponse = await app.inject({
      method: "POST",
      url: "/ai/meal-text/estimate",
      headers: auth(user.sessionToken),
      payload: {
        text: "rice and squash khichdi, homemade, one bowl",
        date: "2026-06-18",
        mealGroupId: lunch
      }
    });
    expect(estimateResponse.statusCode).toBe(200);
    const estimateBody = estimateResponse.json();

    const logResponse = await app.inject({
      method: "POST",
      url: "/diary/entries/from-estimate",
      headers: auth(user.sessionToken),
      payload: {
        estimate: estimateBody.estimate,
        estimateId: estimateBody.estimateId,
        date: "2026-06-18",
        mealGroupId: lunch,
        sourceType: "ai_text",
        assumptions: []
      }
    });
    expect(logResponse.statusCode).toBe(200);

    const correctionResponse = await app.inject({
      method: "POST",
      url: "/ai/meal/correct",
      headers: auth(user.sessionToken),
      payload: {
        estimate: estimateBody.estimate,
        estimateId: estimateBody.estimateId,
        correctionText: "no ghee"
      }
    });
    expect(correctionResponse.statusCode).toBe(200);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: 0 })
      }))
    );
    const barcodeResponse = await app.inject({
      method: "POST",
      url: "/barcode/lookup",
      headers: auth(user.sessionToken),
      payload: { barcode: "0000000000000" }
    });
    expect(barcodeResponse.statusCode).toBe(200);
    expect(barcodeResponse.json().found).toBe(false);

    const summary = await app.inject({
      method: "GET",
      url: "/analytics/summary",
      headers: auth(user.sessionToken)
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      totalLoggedEntries: 1,
      loggedEntriesBySource: {
        ai_text: 1,
        ai_photo: 0,
        barcode: 0,
        manual: 0,
        recipe: 0,
        saved_meal: 0
      },
      aiMealsLogged: 1,
      aiEstimatesGenerated: 1,
      aiEstimateAcceptanceRate: 1,
      aiCorrectionsApplied: 1,
      aiCorrectionRate: 1,
      barcodeLookups: 1,
      barcodeLookupFailures: 1,
      barcodeFailureRate: 1,
      scanFailures: 1,
      aiCostUnits: 2,
      aiCostUnitsPerLoggedAiMeal: 2
    });
    expect(summary.json().recentEvents.map((event: { eventType: string }) => event.eventType)).toContain("ai_estimate_logged");
    expect(summary.json().recentEvents.map((event: { eventType: string }) => event.eventType)).toContain("scan_failure");
  });
});
