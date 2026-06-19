import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { DEMO_USER_ID, store } from "../lib/store";

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("barcode routes", () => {
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
    store.foods = [];
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
      payload: { email: "barcode@macro.local", displayName: "Barcode User" }
    });
    expect(response.statusCode).toBe(200);
    return response.json() as { sessionToken: string };
  }

  it("creates, updates, and looks up a manually corrected barcode product", async () => {
    const user = await signup();
    const create = await app.inject({
      method: "POST",
      url: "/barcode/products",
      headers: auth(user.sessionToken),
      payload: {
        barcode: "123456789012",
        name: "Macro chicken breast",
        brand: "Macro Test",
        per100g: { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, sugarG: 0, fiberG: 0, sodiumMg: 74 },
        servingUnits: [
          {
            unitName: "4 oz package serving",
            gramsPerUnit: 112,
            source: "label",
            confidence: "high"
          }
        ],
        verified: true
      }
    });
    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({
      found: true,
      barcode: "123456789012",
      source: "manual",
      food: {
        id: "barcode_123456789012",
        name: "Macro chicken breast",
        per100g: {
          sugarG: 0
        },
        verified: true
      }
    });
    expect(create.json().servingUnits.map((unit: { unitName: string }) => unit.unitName)).toEqual(
      expect.arrayContaining(["100 g", "4 oz package serving", "1 breast filet", "1 cup cooked chopped"])
    );

    const update = await app.inject({
      method: "PATCH",
      url: "/barcode/products/barcode_123456789012",
      headers: auth(user.sessionToken),
      payload: {
        brand: "Corrected Brand",
        servingUnits: [
          {
            unitName: "3 oz corrected serving",
            gramsPerUnit: 85,
            source: "user",
            confidence: "high"
          }
        ]
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().food.brand).toBe("Corrected Brand");
    expect(update.json().servingUnits.map((unit: { unitName: string }) => unit.unitName)).toEqual(
      expect.arrayContaining(["100 g", "3 oz corrected serving", "1 breast filet"])
    );

    const lookup = await app.inject({
      method: "POST",
      url: "/barcode/lookup",
      headers: auth(user.sessionToken),
      payload: { barcode: "123456789012" }
    });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json()).toMatchObject({
      found: true,
      source: "cache",
      food: {
        brand: "Corrected Brand"
      }
    });
  });

  it("returns typed practical unit suggestions without duplicating existing units", async () => {
    const user = await signup();
    const create = await app.inject({
      method: "POST",
      url: "/barcode/products",
      headers: auth(user.sessionToken),
      payload: {
        barcode: "223456789012",
        name: "Macro cereal",
        brand: null,
        per100g: { calories: 390, proteinG: 8, carbsG: 82, fatG: 5, sugarG: 21, fiberG: 6, sodiumMg: 350 },
        servingUnits: [
          {
            unitName: "30 g package serving",
            gramsPerUnit: 30,
            source: "label",
            confidence: "high"
          }
        ]
      }
    });
    expect(create.statusCode).toBe(200);
    const foodId = create.json().food.id as string;

    const suggestions = await app.inject({
      method: "POST",
      url: "/barcode/unit-suggestions",
      headers: auth(user.sessionToken),
      payload: { foodItemId: foodId }
    });
    expect(suggestions.statusCode).toBe(200);
    const cupUnits = suggestions.json().servingUnits.filter((unit: { unitName: string }) => unit.unitName === "1 cup");
    expect(cupUnits).toHaveLength(1);
  });
});
