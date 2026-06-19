import type { FastifyInstance } from "fastify";
import {
  BarcodeLookupRequestSchema,
  BarcodeProductRequestSchema,
  BarcodeProductUpdateRequestSchema,
  BarcodeUnitSuggestionsRequestSchema
} from "@macro/shared";
import { parseBody, sendZodError } from "../lib/http";
import {
  createBarcodeProduct,
  lookupBarcode,
  persistBarcodeFood,
  suggestPracticalUnitsWithAi,
  updateBarcodeProduct
} from "../modules/barcode/service";
import { recordAnalyticsEvent } from "../modules/analytics/service";
import { resolveUserIdFromAuthHeaderAsync } from "../modules/auth/service";
import { getFoodByIdForUser } from "../modules/foods/service";

export async function registerBarcodeRoutes(app: FastifyInstance) {
  app.post("/barcode/lookup", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(BarcodeLookupRequestSchema, request.body);
      const result = await lookupBarcode(input.barcode);
      await recordAnalyticsEvent({
        userId,
        eventType: "barcode_lookup",
        status: result.found ? "success" : "failed",
        sourceType: "barcode",
        metadata: {
          barcode: input.barcode,
          source: result.source,
          servingUnitCount: result.servingUnits.length
        }
      });
      if (!result.found) {
        await recordAnalyticsEvent({
          userId,
          eventType: "scan_failure",
          status: "failed",
          sourceType: "barcode",
          metadata: {
            barcode: input.barcode,
            reason: result.message ?? "not_found"
          }
        });
      }
      return result;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/barcode/products", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(BarcodeProductRequestSchema, request.body);
      const result = await createBarcodeProduct(input);
      await recordAnalyticsEvent({
        userId,
        eventType: "barcode_lookup",
        status: "success",
        sourceType: "barcode",
        metadata: {
          barcode: input.barcode,
          source: "manual_product",
          servingUnitCount: result.servingUnits.length
        }
      });
      return result;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.patch("/barcode/products/:id", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const params = request.params as { id: string };
      const input = parseBody(BarcodeProductUpdateRequestSchema, request.body);
      const result = await updateBarcodeProduct(params.id, input);
      if (!result) {
        reply.status(404).send({ error: "barcode_product_not_found" });
        return;
      }
      await recordAnalyticsEvent({
        userId,
        eventType: "barcode_lookup",
        status: "success",
        sourceType: "barcode",
        metadata: {
          barcode: result.barcode,
          source: "manual_correction",
          servingUnitCount: result.servingUnits.length
        }
      });
      return result;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/barcode/unit-suggestions", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(BarcodeUnitSuggestionsRequestSchema, request.body);
      const food = input.foodItemId ? await getFoodByIdForUser(userId, input.foodItemId) : input.food;
      if (!food) {
        reply.status(404).send({ error: "food_not_found" });
        return;
      }
      const previousServingUnits = food.servingUnits.map((unit) => ({ ...unit }));
      const existingUnitNames = new Set(food.servingUnits.map((unit) => unit.unitName.trim().toLowerCase()));
      const suggestions = (await suggestPracticalUnitsWithAi(food)).filter((unit) => !existingUnitNames.has(unit.unitName.trim().toLowerCase()));
      food.servingUnits.push(...suggestions);
      try {
        await persistBarcodeFood(food);
      } catch (error) {
        food.servingUnits = previousServingUnits;
        throw error;
      }
      return { servingUnits: food.servingUnits };
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });
}
