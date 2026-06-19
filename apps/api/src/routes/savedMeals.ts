import type { FastifyInstance } from "fastify";
import { LogSavedMealRequestSchema, SaveMealRequestSchema, UpdateSavedMealRequestSchema } from "@macro/shared";
import { env } from "../lib/env";
import { parseBody, sendZodError } from "../lib/http";
import { createId, nowIso } from "../lib/http";
import {
  deleteSavedMealFromPrisma,
  getSavedMealFromPrisma,
  listSavedMealsFromPrisma,
  persistSavedMealInPrisma,
  readDiaryEntriesByIdsFromPrisma
} from "../lib/prismaStore";
import { saveStore, store, totalsForEntries, type SavedMeal } from "../lib/store";
import { createDiaryEntry } from "../modules/diary/service";
import { resolveUserIdFromAuthHeaderAsync } from "../modules/auth/service";
import { recordAnalyticsEvent, recordLoggedEntry } from "../modules/analytics/service";

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

async function persistSavedMeal(savedMeal: SavedMeal): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    const foodIds = new Set(savedMeal.entries.map((entry) => entry.foodItemId).filter((id): id is string => Boolean(id)));
    await persistSavedMealInPrisma({
      meal: savedMeal,
      user: store.authUsers.find((user) => user.id === savedMeal.userId),
      foods: store.foods.filter((food) => foodIds.has(food.id))
    });
    return;
  }

  saveStore();
}

async function deletePersistedSavedMeal(userId: string, id: string): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await deleteSavedMealFromPrisma(userId, id);
    return;
  }

  saveStore();
}

async function listSavedMeals(userId: string): Promise<SavedMeal[]> {
  if (shouldPersistDirectlyToPrisma()) {
    return listSavedMealsFromPrisma(userId);
  }
  return store.savedMeals.filter((meal) => meal.userId === userId);
}

async function getSavedMeal(userId: string, id: string): Promise<SavedMeal | undefined> {
  if (shouldPersistDirectlyToPrisma()) {
    return (await getSavedMealFromPrisma(userId, id)) ?? undefined;
  }
  return store.savedMeals.find((meal) => meal.userId === userId && meal.id === id);
}

async function getEntriesForSavedMeal(userId: string, ids: string[]) {
  if (shouldPersistDirectlyToPrisma()) {
    return readDiaryEntriesByIdsFromPrisma(userId, ids);
  }
  return store.diaryEntries.filter((entry) => entry.userId === userId && ids.includes(entry.id));
}

export async function registerSavedMealRoutes(app: FastifyInstance) {
  app.get("/saved-meals", async (request) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    return { savedMeals: await listSavedMeals(userId) };
  });

  app.post("/saved-meals", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(SaveMealRequestSchema, request.body);
      const entries = await getEntriesForSavedMeal(userId, input.entryIds);
      if (entries.length === 0) {
        reply.status(400).send({ error: "no_entries_to_save" });
        return;
      }
      const now = nowIso();
      const savedMeal: SavedMeal = {
        id: createId("saved"),
        userId,
        name: input.name,
        entries,
        totals: totalsForEntries(entries),
        createdAt: now,
        updatedAt: now
      };
      store.savedMeals.push(savedMeal);
      try {
        await persistSavedMeal(savedMeal);
      } catch (error) {
        store.savedMeals = store.savedMeals.filter((meal) => meal.id !== savedMeal.id);
        throw error;
      }
      return savedMeal;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/saved-meals/:id/log", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const params = request.params as { id: string };
      const input = parseBody(LogSavedMealRequestSchema, request.body);
      const savedMeal = await getSavedMeal(userId, params.id);
      if (!savedMeal) {
        reply.status(404).send({ error: "not_found" });
        return;
      }

      const entries = await Promise.all(
        savedMeal.entries.map((entry) =>
          createDiaryEntry(userId, {
            date: input.date,
            mealGroupId: input.mealGroupId,
            foodItemId: entry.foodItemId ?? null,
            displayName: entry.displayName,
            quantity: entry.quantity,
            unit: entry.unit,
            grams: entry.grams,
            macros: entry.macros,
            sourceType: "saved_meal",
            confidence: entry.confidence,
            assumptions: entry.assumptions
          })
        )
      );

      for (const entry of entries) {
        await recordLoggedEntry(entry, { savedMealId: savedMeal.id, route: "saved_meal" });
      }
      await recordAnalyticsEvent({
        userId,
        eventType: "saved_meal_logged",
        status: "success",
        sourceType: "saved_meal",
        metadata: {
          savedMealId: savedMeal.id,
          entryCount: entries.length
        }
      });

      return { entries };
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.patch("/saved-meals/:id", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const params = request.params as { id: string };
      const input = parseBody(UpdateSavedMealRequestSchema, request.body);
      const existing = await getSavedMeal(userId, params.id);
      if (!existing) {
        reply.status(404).send({ error: "not_found" });
        return;
      }

      let entries = existing.entries;
      if (input.entryIds) {
        const uniqueIds = new Set(input.entryIds);
        if (uniqueIds.size !== input.entryIds.length) {
          reply.status(400).send({ error: "duplicate_saved_meal_entry" });
          return;
        }

        const entriesById = new Map(existing.entries.map((entry) => [entry.id, entry]));
        const selectedEntries = input.entryIds.map((id) => entriesById.get(id));
        if (selectedEntries.some((entry) => !entry)) {
          reply.status(400).send({ error: "unknown_saved_meal_entry" });
          return;
        }
        entries = selectedEntries as typeof existing.entries;
      }

      const updated: SavedMeal = {
        ...existing,
        name: input.name?.trim() ?? existing.name,
        entries,
        totals: totalsForEntries(entries),
        updatedAt: nowIso()
      };

      const previousSavedMeals = store.savedMeals;
      store.savedMeals = store.savedMeals.map((meal) => (meal.userId === userId && meal.id === params.id ? updated : meal));
      try {
        await persistSavedMeal(updated);
      } catch (error) {
        store.savedMeals = previousSavedMeals;
        throw error;
      }

      return updated;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.delete("/saved-meals/:id", async (request, reply) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    const params = request.params as { id: string };
    const existing = await getSavedMeal(userId, params.id);
    if (!existing) {
      reply.status(404).send({ error: "not_found" });
      return;
    }
    const previousSavedMeals = store.savedMeals;
    store.savedMeals = store.savedMeals.filter((meal) => meal.userId !== userId || meal.id !== params.id);
    try {
      await deletePersistedSavedMeal(userId, params.id);
    } catch (error) {
      store.savedMeals = previousSavedMeals;
      throw error;
    }
    return { ok: true };
  });
}
