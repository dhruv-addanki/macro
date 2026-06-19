import {
  macrosFromPer100g,
  type CreateDiaryEntryInput,
  type FoodItem,
  type MacroNutrients,
  type ServingUnit
} from "@macro/shared";
import { env } from "../../lib/env";
import { createId } from "../../lib/http";
import {
  getFoodItemForUserFromPrisma,
  listFavoriteFoodsFromPrisma,
  listRecentFoodsFromPrisma,
  persistFoodItemInPrisma,
  searchFoodsFromPrisma,
  setFavoriteFoodInPrisma
} from "../../lib/prismaStore";
import { DEMO_USER_ID, saveStore, store } from "../../lib/store";

function favoriteKey(userId: string, foodId: string): string {
  return `${userId}:${foodId}`;
}

function isFavorite(userId: string, foodId: string): boolean {
  return store.favoriteFoodIds.has(favoriteKey(userId, foodId)) || (userId === DEMO_USER_ID && store.favoriteFoodIds.has(foodId));
}

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

async function persistFoodItem(food: FoodItem): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await persistFoodItemInPrisma({
      food,
      ownerUser: food.ownerUserId ? store.authUsers.find((user) => user.id === food.ownerUserId) : undefined
    });
    return;
  }

  saveStore();
}

async function persistFavorite(userId: string, food: FoodItem, favorited: boolean): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await setFavoriteFoodInPrisma({
      userId,
      user: store.authUsers.find((user) => user.id === userId),
      food,
      favorited
    });
    return;
  }

  saveStore();
}

export function searchFoods(query?: string): FoodItem[];
export function searchFoods(userId: string, query?: string): FoodItem[];
export function searchFoods(userIdOrQuery = DEMO_USER_ID, maybeQuery?: string): FoodItem[] {
  const userId = maybeQuery === undefined ? DEMO_USER_ID : userIdOrQuery;
  const query = maybeQuery === undefined ? userIdOrQuery : maybeQuery;
  const normalized = query.trim().toLowerCase();
  const foods = normalized
    ? store.foods.filter(
        (food) =>
          (!food.ownerUserId || food.ownerUserId === userId) &&
          `${food.name} ${food.brand ?? ""}`.toLowerCase().includes(normalized)
      )
    : store.foods.filter((food) => !food.ownerUserId || food.ownerUserId === userId);

  return foods
    .slice()
    .sort((a, b) => {
      const favoriteDiff = Number(isFavorite(userId, b.id)) - Number(isFavorite(userId, a.id));
      if (favoriteDiff !== 0) return favoriteDiff;
      const verifiedDiff = Number(b.verified) - Number(a.verified);
      if (verifiedDiff !== 0) return verifiedDiff;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 25);
}

export function getRecentFoods(userId = DEMO_USER_ID): FoodItem[] {
  const ids = [...store.diaryEntries]
    .filter((entry) => entry.userId === userId)
    .reverse()
    .map((entry) => entry.foodItemId)
    .filter((id): id is string => Boolean(id));
  const uniqueIds = [...new Set(ids)].slice(0, 15);
  return uniqueIds.map((id) => store.foods.find((food) => food.id === id)).filter((food): food is FoodItem => Boolean(food));
}

export function getFavoriteFoods(userId = DEMO_USER_ID): FoodItem[] {
  return store.foods.filter((food) => (!food.ownerUserId || food.ownerUserId === userId) && isFavorite(userId, food.id));
}

export async function searchFoodsForUser(userId: string, query = ""): Promise<FoodItem[]> {
  if (shouldPersistDirectlyToPrisma()) {
    return searchFoodsFromPrisma(userId, query);
  }
  return searchFoods(userId, query);
}

export async function getRecentFoodsForUser(userId: string): Promise<FoodItem[]> {
  if (shouldPersistDirectlyToPrisma()) {
    return listRecentFoodsFromPrisma(userId);
  }
  return getRecentFoods(userId);
}

export async function getFavoriteFoodsForUser(userId: string): Promise<FoodItem[]> {
  if (shouldPersistDirectlyToPrisma()) {
    return listFavoriteFoodsFromPrisma(userId);
  }
  return getFavoriteFoods(userId);
}

export async function getFoodByIdForUser(userId: string, foodId: string): Promise<FoodItem | undefined> {
  if (shouldPersistDirectlyToPrisma()) {
    return (await getFoodItemForUserFromPrisma(userId, foodId)) ?? undefined;
  }
  return store.foods.find((candidate) => candidate.id === foodId && (!candidate.ownerUserId || candidate.ownerUserId === userId));
}

export async function toggleFavorite(userId: string, foodId: string): Promise<boolean> {
  const key = favoriteKey(userId, foodId);
  const food = await getFoodByIdForUser(userId, foodId);
  if (!food) return false;
  const currentlyFavorited = shouldPersistDirectlyToPrisma()
    ? (await listFavoriteFoodsFromPrisma(userId)).some((candidate) => candidate.id === foodId)
    : isFavorite(userId, foodId);
  const previousFavorites = new Set(store.favoriteFoodIds);
  if (currentlyFavorited) {
    store.favoriteFoodIds.delete(key);
    if (userId === DEMO_USER_ID) store.favoriteFoodIds.delete(foodId);
    try {
      await persistFavorite(userId, food, false);
    } catch (error) {
      store.favoriteFoodIds = previousFavorites;
      throw error;
    }
    return false;
  }
  store.favoriteFoodIds.add(key);
  try {
    await persistFavorite(userId, food, true);
  } catch (error) {
    store.favoriteFoodIds = previousFavorites;
    throw error;
  }
  return true;
}

export async function createCustomFood(userId: string, input: {
  name: string;
  brand?: string | null;
  per100g: MacroNutrients;
  servingUnit?: Omit<ServingUnit, "id" | "foodItemId">;
}): Promise<FoodItem> {
  const id = createId("food");
  const servingUnits: ServingUnit[] = [
    {
      id: createId("unit"),
      foodItemId: id,
      unitName: "100 g",
      gramsPerUnit: 100,
      source: "user",
      confidence: "high"
    }
  ];

  if (input.servingUnit) {
    servingUnits.push({
      id: createId("unit"),
      foodItemId: id,
      ...input.servingUnit
    });
  }

  const food: FoodItem = {
    id,
    ownerUserId: userId,
    sourceType: "custom",
    name: input.name,
    brand: input.brand ?? null,
    verified: false,
    per100g: input.per100g,
    servingUnits
  };
  store.foods.push(food);
  try {
    await persistFoodItem(food);
  } catch (error) {
    store.foods = store.foods.filter((candidate) => candidate.id !== food.id);
    throw error;
  }
  return food;
}

export function createEntryInputFromFood(params: {
  food: FoodItem;
  date: string;
  mealGroupId: string;
  quantity: number;
  unitId?: string;
  sourceType?: CreateDiaryEntryInput["sourceType"];
}): CreateDiaryEntryInput {
  const unit = params.food.servingUnits.find((servingUnit) => servingUnit.id === params.unitId) ?? params.food.servingUnits[0];
  if (!unit) {
    throw new Error("Food has no serving units");
  }
  const grams = params.quantity * unit.gramsPerUnit;
  return {
    date: params.date,
    mealGroupId: params.mealGroupId,
    foodItemId: params.food.id,
    displayName: params.food.name,
    quantity: params.quantity,
    unit: unit.unitName,
    grams,
    macros: macrosFromPer100g(params.food.per100g, grams),
    sourceType: params.sourceType ?? (params.food.id.startsWith("barcode_") ? "barcode" : "manual"),
    confidence: params.food.verified ? "high" : "medium",
    assumptions: []
  };
}
