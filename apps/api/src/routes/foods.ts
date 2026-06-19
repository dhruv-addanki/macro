import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CreateCustomFoodRequestSchema } from "@macro/shared";
import { parseBody, sendZodError } from "../lib/http";
import {
  createCustomFood,
  createEntryInputFromFood,
  getFavoriteFoodsForUser,
  getFoodByIdForUser,
  getRecentFoodsForUser,
  searchFoodsForUser,
  toggleFavorite
} from "../modules/foods/service";
import { createDiaryEntry } from "../modules/diary/service";
import { resolveUserIdFromAuthHeaderAsync } from "../modules/auth/service";
import { recordLoggedEntry } from "../modules/analytics/service";

const LogFoodSchema = z.object({
  foodId: z.string(),
  date: z.string(),
  mealGroupId: z.string(),
  quantity: z.number().positive(),
  unitId: z.string().optional()
});

export async function registerFoodRoutes(app: FastifyInstance) {
  app.get("/foods/search", async (request) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    const query = request.query as { q?: string };
    return { foods: await searchFoodsForUser(userId, query.q ?? "") };
  });

  app.get("/foods/recent", async (request) => ({ foods: await getRecentFoodsForUser(await resolveUserIdFromAuthHeaderAsync(request.headers.authorization)) }));

  app.get("/foods/favorites", async (request) => ({ foods: await getFavoriteFoodsForUser(await resolveUserIdFromAuthHeaderAsync(request.headers.authorization)) }));

  app.post("/foods/custom", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(CreateCustomFoodRequestSchema, request.body);
      return await createCustomFood(userId, input);
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/foods/:id/favorite", async (request) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    const params = request.params as { id: string };
    const favorited = await toggleFavorite(userId, params.id);
    return { favorited };
  });

  app.post("/foods/log", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(LogFoodSchema, request.body);
      const food = await getFoodByIdForUser(userId, input.foodId);
      if (!food) {
        reply.status(404).send({ error: "food_not_found" });
        return;
      }
      const entryInput = createEntryInputFromFood(input.unitId ? { ...input, food, unitId: input.unitId } : { ...input, food });
      const entry = await createDiaryEntry(userId, entryInput);
      await recordLoggedEntry(entry, { foodId: food.id, route: "foods" });
      return entry;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });
}
