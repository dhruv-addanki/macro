import type { FastifyInstance } from "fastify";
import {
  addMacros,
  CreateRecipeRequestSchema,
  UpdateRecipeRequestSchema,
  type Recipe
} from "@macro/shared";
import { env } from "../lib/env";
import { createId, nowIso, parseBody, sendZodError } from "../lib/http";
import { deleteRecipeFromPrisma, getRecipeFromPrisma, listRecipesFromPrisma, persistRecipeInPrisma } from "../lib/prismaStore";
import { saveStore, store } from "../lib/store";
import { createDiaryEntry } from "../modules/diary/service";
import { resolveUserIdFromAuthHeaderAsync } from "../modules/auth/service";
import { recordAnalyticsEvent, recordLoggedEntry } from "../modules/analytics/service";

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

async function persistRecipe(recipe: Recipe): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    const foodIds = new Set(recipe.ingredients.map((ingredient) => ingredient.foodItemId).filter((id): id is string => Boolean(id)));
    await persistRecipeInPrisma({
      recipe,
      user: store.authUsers.find((user) => user.id === recipe.userId),
      foods: store.foods.filter((food) => foodIds.has(food.id))
    });
    return;
  }

  saveStore();
}

async function deletePersistedRecipe(userId: string, id: string): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await deleteRecipeFromPrisma(userId, id);
    return;
  }

  saveStore();
}

async function listRecipes(userId: string): Promise<Recipe[]> {
  if (shouldPersistDirectlyToPrisma()) {
    return listRecipesFromPrisma(userId);
  }
  return store.recipes.filter((recipe) => recipe.userId === userId);
}

async function getRecipe(userId: string, id: string): Promise<Recipe | undefined> {
  if (shouldPersistDirectlyToPrisma()) {
    return (await getRecipeFromPrisma(userId, id)) ?? undefined;
  }
  return store.recipes.find((recipe) => recipe.userId === userId && recipe.id === id);
}

function buildRecipe(input: {
  userId: string;
  id?: string;
  name: string;
  servings: number;
  totalCookedWeightG?: number;
  ingredients: Recipe["ingredients"];
  createdAt?: string;
}): Recipe {
  const now = nowIso();
  const totals = addMacros(input.ingredients.map((ingredient) => ingredient.macros));
  return {
    id: input.id ?? createId("recipe"),
    userId: input.userId,
    name: input.name,
    servings: input.servings,
    totalCookedWeightG: input.totalCookedWeightG,
    ingredients: input.ingredients,
    totals,
    perServing: {
      calories: Math.round((totals.calories / input.servings) * 10) / 10,
      proteinG: Math.round((totals.proteinG / input.servings) * 10) / 10,
      carbsG: Math.round((totals.carbsG / input.servings) * 10) / 10,
      fatG: Math.round((totals.fatG / input.servings) * 10) / 10,
      sugarG: Math.round(((totals.sugarG ?? 0) / input.servings) * 10) / 10,
      fiberG: Math.round((totals.fiberG / input.servings) * 10) / 10,
      sodiumMg: Math.round((totals.sodiumMg / input.servings) * 10) / 10
    },
    createdAt: input.createdAt ?? now,
    updatedAt: now
  };
}

export async function registerRecipeRoutes(app: FastifyInstance) {
  app.get("/recipes", async (request) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    return { recipes: await listRecipes(userId) };
  });

  app.post("/recipes", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(CreateRecipeRequestSchema, request.body);
      const recipe = buildRecipe({ ...input, userId });
      store.recipes.push(recipe);
      try {
        await persistRecipe(recipe);
      } catch (error) {
        store.recipes = store.recipes.filter((candidate) => candidate.id !== recipe.id);
        throw error;
      }
      return recipe;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.patch("/recipes/:id", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const params = request.params as { id: string };
      const input = parseBody(UpdateRecipeRequestSchema, request.body);
      const current = await getRecipe(userId, params.id);
      if (!current) {
        reply.status(404).send({ error: "not_found" });
        return;
      }
      const updated = buildRecipe({
        userId,
        id: current.id,
        name: input.name ?? current.name,
        servings: input.servings ?? current.servings,
        totalCookedWeightG: input.totalCookedWeightG ?? current.totalCookedWeightG,
        ingredients: input.ingredients ?? current.ingredients,
        createdAt: current.createdAt
      });
      const index = store.recipes.findIndex((recipe) => recipe.userId === userId && recipe.id === params.id);
      if (index >= 0) {
        store.recipes[index] = updated;
      } else {
        store.recipes.push(updated);
      }
      try {
        await persistRecipe(updated);
      } catch (error) {
        if (index >= 0) {
          store.recipes[index] = current;
        } else {
          store.recipes = store.recipes.filter((recipe) => recipe.id !== updated.id);
        }
        throw error;
      }
      return updated;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/recipes/:id/log", async (request, reply) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    const params = request.params as { id: string };
    const body = request.body as { date?: string; mealGroupId?: string; servings?: number };
    const recipe = await getRecipe(userId, params.id);
    if (!recipe || !body.date || !body.mealGroupId) {
      reply.status(recipe ? 400 : 404).send({ error: recipe ? "invalid_log_request" : "not_found" });
      return;
    }
    const servings = body.servings ?? 1;
    const entry = await createDiaryEntry(userId, {
      date: body.date,
      mealGroupId: body.mealGroupId,
      displayName: recipe.name,
      quantity: servings,
      unit: servings === 1 ? "serving" : "servings",
      grams: recipe.totalCookedWeightG ? (recipe.totalCookedWeightG / recipe.servings) * servings : 100 * servings,
      macros: {
        calories: Math.round(recipe.perServing.calories * servings * 10) / 10,
        proteinG: Math.round(recipe.perServing.proteinG * servings * 10) / 10,
        carbsG: Math.round(recipe.perServing.carbsG * servings * 10) / 10,
        fatG: Math.round(recipe.perServing.fatG * servings * 10) / 10,
        sugarG: Math.round((recipe.perServing.sugarG ?? 0) * servings * 10) / 10,
        fiberG: Math.round(recipe.perServing.fiberG * servings * 10) / 10,
        sodiumMg: Math.round(recipe.perServing.sodiumMg * servings * 10) / 10
      },
      sourceType: "recipe",
      confidence: "high",
      assumptions: ["Recipe macros are calculated from saved ingredients."]
    });
    await recordLoggedEntry(entry, { recipeId: recipe.id, route: "recipe" });
    await recordAnalyticsEvent({
      userId,
      eventType: "recipe_logged",
      status: "success",
      sourceType: "recipe",
      metadata: {
        recipeId: recipe.id,
        servings
      }
    });
    return entry;
  });

  app.delete("/recipes/:id", async (request, reply) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    const params = request.params as { id: string };
    const existing = await getRecipe(userId, params.id);
    if (!existing) {
      reply.status(404).send({ error: "not_found" });
      return;
    }
    const previousRecipes = store.recipes;
    store.recipes = store.recipes.filter((recipe) => recipe.userId !== userId || recipe.id !== params.id);
    try {
      await deletePersistedRecipe(userId, params.id);
    } catch (error) {
      store.recipes = previousRecipes;
      throw error;
    }
    return { ok: true };
  });
}
