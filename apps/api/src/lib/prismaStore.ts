import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  addMacros,
  type AIEstimateLog,
  type AnalyticsSummaryResponse,
  type AuthUser,
  type DiaryEntry,
  type FoodItem,
  type MealGroup,
  type MealPhoto,
  type ProgressSummary,
  type Recipe,
  type ServingUnit,
  type UserCorrectionLog,
  type UserProfile,
  type WeightEntry
} from "@macro/shared";
import { env } from "./env";
import type {
  AiUsageEvent,
  AnalyticsEvent,
  AuthSession,
  SavedMeal,
  Store,
  StoredNutritionGoal
} from "./store";

export type PrismaAiUsageReservationInput = {
  eventId: string;
  userId: string;
  endpoint: string;
  inputType: AiUsageEvent["inputType"];
  costUnits: number;
  endpointLimit: number;
  dailyBudgetUnits: number;
  windowStartIso: string;
  dayStartIso: string;
  createdAtIso: string;
};

export type PrismaAiUsageReservationResult =
  | {
      allowed: true;
      event: AiUsageEvent;
    }
  | {
      allowed: false;
      event: AiUsageEvent;
      reason: "endpoint_rate_limit";
      usedInWindowEvents: AiUsageEvent[];
    }
  | {
      allowed: false;
      event: AiUsageEvent;
      reason: "daily_budget";
      usedTodayUnits: number;
    };

export type PrismaAuthStateInput = {
  user: AuthUser;
  session?: AuthSession;
  profiles: UserProfile[];
  goals: StoredNutritionGoal[];
  mealGroups: MealGroup[];
};

export type PrismaUserStateInput = {
  userId: string;
  user?: AuthUser;
  profile?: UserProfile;
  goal?: StoredNutritionGoal;
  weightEntry?: WeightEntry;
};

export type PrismaDiaryEntriesInput = {
  entries: DiaryEntry[];
  users?: AuthUser[];
  mealGroups?: MealGroup[];
  foods?: FoodItem[];
};

export type PrismaFoodItemInput = {
  food: FoodItem;
  ownerUser?: AuthUser;
  barcode?: string;
  rawPayload?: unknown;
};

export type PrismaFavoriteFoodInput = {
  userId: string;
  user?: AuthUser;
  food: FoodItem;
  favorited: boolean;
};

export type PrismaAnalyticsEventInput = {
  event: AnalyticsEvent;
  user?: AuthUser;
};

export type PrismaSavedMealInput = {
  meal: SavedMeal;
  user?: AuthUser;
  foods?: FoodItem[];
};

export type PrismaRecipeInput = {
  recipe: Recipe;
  user?: AuthUser;
  foods?: FoodItem[];
};

export type PrismaMealPhotoInput = {
  mealPhoto: MealPhoto;
  user?: AuthUser;
};

export type PrismaAiEstimateInput = {
  estimate: AIEstimateLog;
  user?: AuthUser;
};

export type PrismaUserCorrectionInput = {
  correction: UserCorrectionLog;
  user?: AuthUser;
};

let prisma: PrismaClient | null = null;

function prismaClient(): PrismaClient {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required when MACRO_STORE_DRIVER=prisma");
  }
  prisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.databaseUrl })
  });
  return prisma;
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toDate(value?: string | null): Date {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toNullableDate(value?: string | null): Date | null {
  return value ? toDate(value) : null;
}

function toDateOnly(value: string): Date {
  return toDate(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function iso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : toDate(value).toISOString();
}

function dateOnly(value: Date | string): string {
  return iso(value).slice(0, 10);
}

function aiUsageEventFromRow(row: Awaited<ReturnType<PrismaClient["aIUsageEvent"]["findMany"]>>[number]): AiUsageEvent {
  return {
    id: row.id,
    userId: row.userId,
    endpoint: row.endpoint,
    inputType: row.inputType as AiUsageEvent["inputType"],
    model: row.model,
    promptVersion: row.promptVersion,
    status: row.status as AiUsageEvent["status"],
    usedFallback: row.usedFallback,
    costUnits: row.costUnits,
    reason: row.reason,
    createdAt: iso(row.createdAt)
  };
}

function aiUsageEventCreateData(event: AiUsageEvent) {
  return {
    id: event.id,
    userId: event.userId,
    endpoint: event.endpoint,
    inputType: event.inputType,
    model: event.model,
    promptVersion: event.promptVersion,
    status: event.status,
    usedFallback: event.usedFallback,
    costUnits: event.costUnits,
    reason: event.reason,
    createdAt: toDate(event.createdAt)
  };
}

function analyticsEventFromRow(row: Awaited<ReturnType<PrismaClient["analyticsEvent"]["findMany"]>>[number]): AnalyticsEvent {
  return {
    id: row.id,
    userId: row.userId,
    eventType: row.eventType as AnalyticsEvent["eventType"],
    status: row.status as AnalyticsEvent["status"],
    sourceType: row.sourceType as AnalyticsEvent["sourceType"],
    metadata: row.metadata as AnalyticsEvent["metadata"],
    createdAt: iso(row.createdAt)
  };
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function favoriteParts(key: string): { userId: string; foodItemId: string } | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex < 0) {
    return { userId: "user_demo", foodItemId: key };
  }
  const userId = key.slice(0, separatorIndex);
  const foodItemId = key.slice(separatorIndex + 1);
  return userId && foodItemId ? { userId, foodItemId } : null;
}

type FoodRowWithServingUnits = Prisma.FoodItemGetPayload<{ include: { servingUnits: true } }>;
type SavedMealRowWithItems = Prisma.SavedMealGetPayload<{ include: { items: true } }>;
type RecipeRowWithIngredients = Prisma.RecipeGetPayload<{ include: { ingredients: true } }>;
type MealPhotoRow = Prisma.MealPhotoGetPayload<Record<string, never>>;
type AiEstimateRow = Prisma.AIEstimateGetPayload<Record<string, never>>;
type UserCorrectionRow = Prisma.UserCorrectionGetPayload<Record<string, never>>;
type UserRow = Prisma.UserGetPayload<Record<string, never>>;
type UserProfileRow = Prisma.UserProfileGetPayload<Record<string, never>>;
type NutritionGoalRow = Prisma.NutritionGoalGetPayload<Record<string, never>>;
type MealGroupRow = Prisma.MealGroupGetPayload<Record<string, never>>;
type WeightEntryRow = Prisma.WeightEntryGetPayload<Record<string, never>>;

const sourceTypes: DiaryEntry["sourceType"][] = ["barcode", "manual", "ai_photo", "ai_text", "recipe", "saved_meal"];

function authUserFromRow(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName ?? "Macro User",
    createdAt: iso(row.createdAt),
    lastLoginAt: row.lastLoginAt ? iso(row.lastLoginAt) : null
  };
}

function userProfileFromRow(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    onboardingCompleted: row.onboardingCompleted,
    birthYear: row.birthYear ?? undefined,
    sex: row.sex as UserProfile["sex"] | undefined,
    heightCm: row.heightCm ?? undefined,
    weightKg: row.weightKg ?? undefined,
    targetWeightKg: row.targetWeightKg ?? undefined,
    goalType: row.goalType as UserProfile["goalType"],
    activityLevel: row.activityLevel as UserProfile["activityLevel"],
    unitSystem: row.unitSystem as UserProfile["unitSystem"]
  };
}

function foodFromRow(row: Awaited<ReturnType<PrismaClient["foodItem"]["findMany"]>>[number] & {
  servingUnits?: Array<Awaited<ReturnType<PrismaClient["servingUnit"]["findMany"]>>[number]>;
}): FoodItem {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    sourceType: row.sourceType as FoodItem["sourceType"],
    name: row.name,
    brand: row.brand,
    verified: row.verified,
    per100g: {
      calories: row.caloriesPer100g,
      proteinG: row.proteinPer100g,
      carbsG: row.carbsPer100g,
      fatG: row.fatPer100g,
      sugarG: row.sugarPer100g ?? 0,
      fiberG: row.fiberPer100g,
      sodiumMg: row.sodiumPer100g
    },
    servingUnits: (row.servingUnits ?? []).map((unit): ServingUnit => ({
      id: unit.id,
      foodItemId: unit.foodItemId,
      unitName: unit.unitName,
      gramsPerUnit: unit.gramsPerUnit,
      source: unit.source as ServingUnit["source"],
      confidence: unit.confidence as ServingUnit["confidence"],
      notes: unit.notes ?? undefined
    }))
  };
}

async function upsertUserForPrisma(tx: Prisma.TransactionClient, user: AuthUser): Promise<void> {
  await tx.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email,
      displayName: user.displayName ?? null,
      lastLoginAt: toNullableDate(user.lastLoginAt),
      createdAt: toDate(user.createdAt)
    },
    update: {
      email: user.email,
      displayName: user.displayName ?? null,
      lastLoginAt: toNullableDate(user.lastLoginAt)
    }
  });
}

function fallbackUser(userId: string): AuthUser {
  return {
    id: userId,
    email: `${userId}@macro.local`,
    displayName: "Macro User",
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };
}

async function upsertFoodForPrisma(tx: Prisma.TransactionClient, food: FoodItem): Promise<void> {
  await tx.foodItem.upsert({
    where: { id: food.id },
    create: {
      id: food.id,
      ownerUserId: food.ownerUserId,
      sourceType: food.sourceType,
      name: food.name,
      brand: food.brand,
      verified: food.verified,
      caloriesPer100g: food.per100g.calories,
      proteinPer100g: food.per100g.proteinG,
      carbsPer100g: food.per100g.carbsG,
      fatPer100g: food.per100g.fatG,
      sugarPer100g: food.per100g.sugarG ?? 0,
      fiberPer100g: food.per100g.fiberG,
      sodiumPer100g: food.per100g.sodiumMg
    },
    update: {
      ownerUserId: food.ownerUserId,
      sourceType: food.sourceType,
      name: food.name,
      brand: food.brand,
      verified: food.verified,
      caloriesPer100g: food.per100g.calories,
      proteinPer100g: food.per100g.proteinG,
      carbsPer100g: food.per100g.carbsG,
      fatPer100g: food.per100g.fatG,
      sugarPer100g: food.per100g.sugarG ?? 0,
      fiberPer100g: food.per100g.fiberG,
      sodiumPer100g: food.per100g.sodiumMg
    }
  });

  for (const unit of food.servingUnits) {
    await tx.servingUnit.upsert({
      where: { id: unit.id },
      create: {
        id: unit.id,
        foodItemId: food.id,
        unitName: unit.unitName,
        gramsPerUnit: unit.gramsPerUnit,
        source: unit.source,
        confidence: unit.confidence,
        notes: unit.notes
      },
      update: {
        unitName: unit.unitName,
        gramsPerUnit: unit.gramsPerUnit,
        source: unit.source,
        confidence: unit.confidence,
        notes: unit.notes
      }
    });
  }
}

function diaryEntryPrismaData(entry: DiaryEntry, foodItemId: string | null) {
  return {
    userId: entry.userId,
    date: toDateOnly(entry.date),
    mealGroupId: entry.mealGroupId,
    foodItemId,
    displayName: entry.displayName,
    quantity: entry.quantity,
    unit: entry.unit,
    grams: entry.grams,
    calories: entry.macros.calories,
    proteinG: entry.macros.proteinG,
    carbsG: entry.macros.carbsG,
    fatG: entry.macros.fatG,
    sugarG: entry.macros.sugarG ?? 0,
    fiberG: entry.macros.fiberG,
    sodiumMg: entry.macros.sodiumMg,
    sourceType: entry.sourceType,
    confidence: entry.confidence,
    assumptions: entry.assumptions,
    createdAt: toDate(entry.createdAt),
    updatedAt: toDate(entry.updatedAt)
  };
}

function diaryEntryFromColumns(row: {
  id: string;
  userId: string;
  date: Date;
  mealGroupId: string;
  foodItemId: string | null;
  displayName: string;
  quantity: number;
  unit: string;
  grams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG?: number;
  fiberG: number;
  sodiumMg: number;
  sourceType: string;
  confidence: string | null;
  assumptions: string[];
  createdAt: Date;
  updatedAt: Date;
}): DiaryEntry {
  return {
    id: row.id,
    userId: row.userId,
    date: dateOnly(row.date),
    mealGroupId: row.mealGroupId,
    foodItemId: row.foodItemId,
    displayName: row.displayName,
    quantity: row.quantity,
    unit: row.unit,
    grams: row.grams,
    macros: {
      calories: row.calories,
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
      sugarG: row.sugarG ?? 0,
      fiberG: row.fiberG,
      sodiumMg: row.sodiumMg
    },
    sourceType: row.sourceType as DiaryEntry["sourceType"],
    confidence: row.confidence ? row.confidence as DiaryEntry["confidence"] : undefined,
    assumptions: row.assumptions,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

function goalFromRow(row: NutritionGoalRow): StoredNutritionGoal {
  return {
    id: row.id,
    userId: row.userId,
    calories: row.calories,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    sugarG: row.sugarG ?? 0,
    fiberG: row.fiberG,
    sodiumMg: row.sodiumMg,
    effectiveFrom: dateOnly(row.effectiveFrom)
  };
}

function mealGroupFromRow(row: MealGroupRow): MealGroup {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    sortOrder: row.sortOrder,
    isDefault: row.isDefault
  };
}

function savedMealFromRow(row: SavedMealRowWithItems): SavedMeal {
  const entries = row.items.map((item) =>
    diaryEntryFromColumns({
      id: item.id,
      userId: row.userId,
      date: row.createdAt,
      mealGroupId: "",
      foodItemId: item.foodItemId,
      displayName: item.displayName,
      quantity: item.quantity,
      unit: item.unit,
      grams: item.grams,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      sugarG: item.sugarG ?? 0,
      fiberG: item.fiberG,
      sodiumMg: item.sodiumMg,
      sourceType: item.sourceType,
      confidence: item.confidence,
      assumptions: item.assumptions,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  );

  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    entries,
    totals: addMacros(entries.map((entry) => entry.macros)),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

function recipeFromRow(row: RecipeRowWithIngredients): Recipe {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    servings: row.servings,
    totalCookedWeightG: row.totalCookedWeightG ?? undefined,
    ingredients: row.ingredients.map((ingredient) => ({
      id: ingredient.id,
      foodItemId: ingredient.foodItemId,
      displayName: ingredient.displayName,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      grams: ingredient.grams,
      macros: {
        calories: ingredient.calories,
        proteinG: ingredient.proteinG,
        carbsG: ingredient.carbsG,
        fatG: ingredient.fatG,
        sugarG: ingredient.sugarG ?? 0,
        fiberG: ingredient.fiberG,
        sodiumMg: ingredient.sodiumMg
      }
    })),
    totals: {
      calories: row.calories,
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
      sugarG: row.sugarG ?? 0,
      fiberG: row.fiberG,
      sodiumMg: row.sodiumMg
    },
    perServing: {
      calories: row.perServingCalories,
      proteinG: row.perServingProteinG,
      carbsG: row.perServingCarbsG,
      fatG: row.perServingFatG,
      sugarG: row.perServingSugarG ?? 0,
      fiberG: row.perServingFiberG,
      sodiumMg: row.perServingSodiumMg
    },
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

function weightEntryFromRow(row: WeightEntryRow): WeightEntry {
  return {
    id: row.id,
    userId: row.userId,
    date: dateOnly(row.date),
    weightKg: row.weightKg,
    createdAt: iso(row.createdAt)
  };
}

function mealPhotoFromRow(row: MealPhotoRow): MealPhoto {
  return {
    id: row.id,
    userId: row.userId,
    storageKey: row.storageKey,
    thumbnailKey: row.thumbnailKey,
    retained: row.retained,
    source: row.source as MealPhoto["source"],
    mimeType: row.mimeType,
    byteLength: row.byteLength,
    uploadedAt: iso(row.uploadedAt)
  };
}

function aiEstimateFromRow(row: AiEstimateRow): AIEstimateLog {
  return {
    id: row.id,
    userId: row.userId,
    inputType: row.inputType as AIEstimateLog["inputType"],
    model: row.model,
    promptVersion: row.promptVersion,
    inputContext: row.inputContext,
    output: row.outputJson as AIEstimateLog["output"],
    confidence: row.confidence as AIEstimateLog["confidence"],
    assumptions: row.assumptions,
    usedFallback: row.usedFallback,
    createdAt: iso(row.createdAt)
  };
}

function userCorrectionFromRow(row: UserCorrectionRow): UserCorrectionLog {
  return {
    id: row.id,
    userId: row.userId,
    aiEstimateId: row.aiEstimateId,
    correctionText: row.correctionText,
    before: row.beforeJson as UserCorrectionLog["before"],
    after: row.afterJson as UserCorrectionLog["after"],
    correctionType: row.correctionType,
    createdAt: iso(row.createdAt)
  };
}

export async function loadStoreFromPrisma(fallback: Store): Promise<{ store: Store; wasEmpty: boolean }> {
  const client = prismaClient();
  const [
    users,
    sessions,
    profiles,
    goals,
    mealGroups,
    foods,
    favorites,
    diaryEntries,
    savedMeals,
    recipes,
    weightEntries,
    mealPhotos,
    aiEstimates,
    corrections,
    aiUsageEvents,
    analyticsEvents
  ] = await Promise.all([
    client.user.findMany({ orderBy: { createdAt: "asc" } }),
    client.authSession.findMany({ orderBy: { createdAt: "asc" } }),
    client.userProfile.findMany({ orderBy: { createdAt: "asc" } }),
    client.nutritionGoal.findMany({ orderBy: { effectiveFrom: "asc" } }),
    client.mealGroup.findMany({ orderBy: [{ userId: "asc" }, { sortOrder: "asc" }] }),
    client.foodItem.findMany({ include: { servingUnits: true }, orderBy: { createdAt: "asc" } }),
    client.favoriteFood.findMany(),
    client.diaryEntry.findMany({ orderBy: { createdAt: "asc" } }),
    client.savedMeal.findMany({ include: { items: true }, orderBy: { createdAt: "asc" } }),
    client.recipe.findMany({ include: { ingredients: true }, orderBy: { createdAt: "asc" } }),
    client.weightEntry.findMany({ orderBy: { date: "asc" } }),
    client.mealPhoto.findMany({ orderBy: { uploadedAt: "desc" } }),
    client.aIEstimate.findMany({ orderBy: { createdAt: "asc" } }),
    client.userCorrection.findMany({ orderBy: { createdAt: "asc" } }),
    client.aIUsageEvent.findMany({ orderBy: { createdAt: "desc" } }),
    client.analyticsEvent.findMany({ orderBy: { createdAt: "desc" } })
  ]);

  if (users.length === 0) {
    return { store: fallback, wasEmpty: true };
  }

  const loadedProfiles: UserProfile[] = profiles.map((profile) => ({
    id: profile.id,
    userId: profile.userId,
    displayName: profile.displayName,
    onboardingCompleted: profile.onboardingCompleted,
    birthYear: profile.birthYear ?? undefined,
    sex: profile.sex as UserProfile["sex"] | undefined,
    heightCm: profile.heightCm ?? undefined,
    weightKg: profile.weightKg ?? undefined,
    targetWeightKg: profile.targetWeightKg ?? undefined,
    goalType: profile.goalType as UserProfile["goalType"],
    activityLevel: profile.activityLevel as UserProfile["activityLevel"],
    unitSystem: profile.unitSystem as UserProfile["unitSystem"]
  }));

  const loadedFoods = foods.map(foodFromRow);
  const saved: SavedMeal[] = savedMeals.map((meal) => {
    const entries = meal.items.map((item) =>
      diaryEntryFromColumns({
        id: item.id,
        userId: meal.userId,
        date: meal.createdAt,
        mealGroupId: "",
        foodItemId: item.foodItemId,
        displayName: item.displayName,
        quantity: item.quantity,
        unit: item.unit,
        grams: item.grams,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        sugarG: item.sugarG ?? 0,
        fiberG: item.fiberG,
        sodiumMg: item.sodiumMg,
        sourceType: item.sourceType,
        confidence: item.confidence,
        assumptions: item.assumptions,
        createdAt: meal.createdAt,
        updatedAt: meal.updatedAt
      })
    );
    return {
      id: meal.id,
      userId: meal.userId,
      name: meal.name,
      entries,
      totals: addMacros(entries.map((entry) => entry.macros)),
      createdAt: iso(meal.createdAt),
      updatedAt: iso(meal.updatedAt)
    };
  });

  return {
    store: {
      authUsers: users.map((user): AuthUser => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? "Macro User",
        createdAt: iso(user.createdAt),
        lastLoginAt: user.lastLoginAt ? iso(user.lastLoginAt) : null
      })),
      authSessions: sessions.map((session): AuthSession => ({
        tokenHash: session.tokenHash,
        userId: session.userId,
        createdAt: iso(session.createdAt),
        revokedAt: session.revokedAt ? iso(session.revokedAt) : null
      })),
      profile: loadedProfiles.find((profile) => profile.userId === "user_demo") ?? loadedProfiles[0] ?? fallback.profile,
      profiles: loadedProfiles.length ? loadedProfiles : fallback.profiles,
      goals: goals.map((goal): StoredNutritionGoal => ({
        id: goal.id,
        userId: goal.userId,
        calories: goal.calories,
        proteinG: goal.proteinG,
        carbsG: goal.carbsG,
        fatG: goal.fatG,
        sugarG: goal.sugarG ?? 0,
        fiberG: goal.fiberG,
        sodiumMg: goal.sodiumMg,
        effectiveFrom: dateOnly(goal.effectiveFrom)
      })),
      mealGroups: mealGroups.map((mealGroup) => ({
        id: mealGroup.id,
        userId: mealGroup.userId,
        name: mealGroup.name,
        sortOrder: mealGroup.sortOrder,
        isDefault: mealGroup.isDefault
      })),
      foods: loadedFoods,
      diaryEntries: diaryEntries.map(diaryEntryFromColumns),
      favoriteFoodIds: new Set(favorites.map((favorite) => `${favorite.userId}:${favorite.foodItemId}`)),
      savedMeals: saved,
      recipes: recipes.map((recipe): Recipe => ({
        id: recipe.id,
        userId: recipe.userId,
        name: recipe.name,
        servings: recipe.servings,
        totalCookedWeightG: recipe.totalCookedWeightG ?? undefined,
        ingredients: recipe.ingredients.map((ingredient) => ({
          id: ingredient.id,
          foodItemId: ingredient.foodItemId,
          displayName: ingredient.displayName,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          grams: ingredient.grams,
          macros: {
            calories: ingredient.calories,
            proteinG: ingredient.proteinG,
            carbsG: ingredient.carbsG,
            fatG: ingredient.fatG,
            sugarG: ingredient.sugarG ?? 0,
            fiberG: ingredient.fiberG,
            sodiumMg: ingredient.sodiumMg
          }
        })),
        totals: {
          calories: recipe.calories,
          proteinG: recipe.proteinG,
          carbsG: recipe.carbsG,
          fatG: recipe.fatG,
          sugarG: recipe.sugarG ?? 0,
          fiberG: recipe.fiberG,
          sodiumMg: recipe.sodiumMg
        },
        perServing: {
          calories: recipe.perServingCalories,
          proteinG: recipe.perServingProteinG,
          carbsG: recipe.perServingCarbsG,
          fatG: recipe.perServingFatG,
          sugarG: recipe.perServingSugarG ?? 0,
          fiberG: recipe.perServingFiberG,
          sodiumMg: recipe.perServingSodiumMg
        },
        createdAt: iso(recipe.createdAt),
        updatedAt: iso(recipe.updatedAt)
      })),
      weightEntries: weightEntries.map((entry): WeightEntry => ({
        id: entry.id,
        userId: entry.userId,
        date: dateOnly(entry.date),
        weightKg: entry.weightKg,
        createdAt: iso(entry.createdAt)
      })),
      mealPhotos: mealPhotos.map((photo): MealPhoto => ({
        id: photo.id,
        userId: photo.userId,
        storageKey: photo.storageKey,
        thumbnailKey: photo.thumbnailKey,
        retained: photo.retained,
        source: photo.source as MealPhoto["source"],
        mimeType: photo.mimeType,
        byteLength: photo.byteLength,
        uploadedAt: iso(photo.uploadedAt)
      })),
      aiEstimates: aiEstimates.map((estimate): AIEstimateLog => ({
        id: estimate.id,
        userId: estimate.userId,
        inputType: estimate.inputType as AIEstimateLog["inputType"],
        model: estimate.model,
        promptVersion: estimate.promptVersion,
        inputContext: estimate.inputContext,
        output: estimate.outputJson as AIEstimateLog["output"],
        confidence: estimate.confidence as AIEstimateLog["confidence"],
        assumptions: estimate.assumptions,
        usedFallback: estimate.usedFallback,
        createdAt: iso(estimate.createdAt)
      })),
      userCorrections: corrections.map((correction): UserCorrectionLog => ({
        id: correction.id,
        userId: correction.userId,
        aiEstimateId: correction.aiEstimateId,
        correctionText: correction.correctionText,
        before: correction.beforeJson as UserCorrectionLog["before"],
        after: correction.afterJson as UserCorrectionLog["after"],
        correctionType: correction.correctionType,
        createdAt: iso(correction.createdAt)
      })),
      aiUsageEvents: aiUsageEvents.map((event): AiUsageEvent => ({
        id: event.id,
        userId: event.userId,
        endpoint: event.endpoint,
        inputType: event.inputType as AiUsageEvent["inputType"],
        model: event.model,
        promptVersion: event.promptVersion,
        status: event.status as AiUsageEvent["status"],
        usedFallback: event.usedFallback,
        costUnits: event.costUnits,
        reason: event.reason,
        createdAt: iso(event.createdAt)
      })),
      analyticsEvents: analyticsEvents.map((event): AnalyticsEvent => ({
        id: event.id,
        userId: event.userId,
        eventType: event.eventType as AnalyticsEvent["eventType"],
        status: event.status as AnalyticsEvent["status"],
        sourceType: event.sourceType as AnalyticsEvent["sourceType"],
        metadata: event.metadata as AnalyticsEvent["metadata"],
        createdAt: iso(event.createdAt)
      }))
    },
    wasEmpty: false
  };
}

export async function saveStoreToPrisma(value: Store): Promise<void> {
  const client = prismaClient();
  const users = new Map<string, AuthUser>();
  const now = new Date().toISOString();
  const foods = [...value.foods];
  const mealGroups = [...value.mealGroups];
  const mealGroupIds = new Set(mealGroups.map((mealGroup) => mealGroup.id));
  const foodIds = new Set(foods.map((food) => food.id));

  function ensureUser(userId: string, displayName = "Macro User") {
    if (!users.has(userId)) {
      users.set(userId, {
        id: userId,
        email: `${userId}@macro.local`,
        displayName,
        createdAt: now,
        lastLoginAt: null
      });
    }
  }

  for (const user of value.authUsers) users.set(user.id, user);
  for (const profile of value.profiles) ensureUser(profile.userId, profile.displayName);
  for (const goal of value.goals) ensureUser(goal.userId);
  for (const mealGroup of value.mealGroups) ensureUser(mealGroup.userId);
  for (const food of value.foods) if (food.ownerUserId) ensureUser(food.ownerUserId);
  for (const entry of value.diaryEntries) {
    ensureUser(entry.userId);
    if (!mealGroupIds.has(entry.mealGroupId)) {
      mealGroups.push({
        id: entry.mealGroupId,
        userId: entry.userId,
        name: "Imported",
        sortOrder: 999,
        isDefault: false
      });
      mealGroupIds.add(entry.mealGroupId);
    }
  }
  for (const meal of value.savedMeals) ensureUser(meal.userId);
  for (const recipe of value.recipes) ensureUser(recipe.userId);
  for (const entry of value.weightEntries) ensureUser(entry.userId);
  for (const photo of value.mealPhotos) ensureUser(photo.userId);
  for (const estimate of value.aiEstimates) ensureUser(estimate.userId);
  for (const correction of value.userCorrections) ensureUser(correction.userId);
  for (const event of value.aiUsageEvents) ensureUser(event.userId);
  for (const event of value.analyticsEvents) ensureUser(event.userId);

  const aiEstimateIds = new Set(value.aiEstimates.map((estimate) => estimate.id));

  await client.$transaction(async (tx) => {
    await tx.userCorrection.deleteMany();
    await tx.aIEstimate.deleteMany();
    await tx.aIUsageEvent.deleteMany();
    await tx.analyticsEvent.deleteMany();
    await tx.mealPhoto.deleteMany();
    await tx.savedMealItem.deleteMany();
    await tx.savedMeal.deleteMany();
    await tx.recipeIngredient.deleteMany();
    await tx.recipe.deleteMany();
    await tx.diaryEntry.deleteMany();
    await tx.servingUnit.deleteMany();
    await tx.barcodeProduct.deleteMany();
    await tx.favoriteFood.deleteMany();
    await tx.foodItem.deleteMany();
    await tx.mealGroup.deleteMany();
    await tx.nutritionGoal.deleteMany();
    await tx.userProfile.deleteMany();
    await tx.authSession.deleteMany();
    await tx.user.deleteMany();

    const userRows = [...users.values()];
    if (userRows.length) {
      await tx.user.createMany({
        data: userRows.map((user) => ({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          lastLoginAt: toNullableDate(user.lastLoginAt),
          createdAt: toDate(user.createdAt),
          updatedAt: toDate(user.lastLoginAt ?? user.createdAt)
        }))
      });
    }

    if (value.authSessions.length) {
      await tx.authSession.createMany({
        data: value.authSessions.map((session) => ({
          userId: session.userId,
          tokenHash: session.tokenHash,
          createdAt: toDate(session.createdAt),
          revokedAt: toNullableDate(session.revokedAt)
        }))
      });
    }

    if (value.profiles.length) {
      await tx.userProfile.createMany({
        data: value.profiles.map((profile) => ({
          id: profile.id,
          userId: profile.userId,
          displayName: profile.displayName,
          onboardingCompleted: profile.onboardingCompleted,
          birthYear: profile.birthYear,
          sex: profile.sex,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          targetWeightKg: profile.targetWeightKg,
          goalType: profile.goalType,
          activityLevel: profile.activityLevel,
          unitSystem: profile.unitSystem
        }))
      });
    }

    if (value.goals.length) {
      await tx.nutritionGoal.createMany({
        data: value.goals.map((goal) => ({
          id: goal.id,
          userId: goal.userId,
          calories: goal.calories,
          proteinG: goal.proteinG,
          carbsG: goal.carbsG,
          fatG: goal.fatG,
          sugarG: goal.sugarG ?? 0,
          fiberG: goal.fiberG,
          sodiumMg: goal.sodiumMg,
          effectiveFrom: toDateOnly(goal.effectiveFrom)
        }))
      });
    }

    if (mealGroups.length) {
      await tx.mealGroup.createMany({ data: mealGroups });
    }

    if (foods.length) {
      await tx.foodItem.createMany({
        data: foods.map((food) => ({
          id: food.id,
          ownerUserId: food.ownerUserId,
          sourceType: food.sourceType,
          name: food.name,
          brand: food.brand,
          verified: food.verified,
          caloriesPer100g: food.per100g.calories,
          proteinPer100g: food.per100g.proteinG,
          carbsPer100g: food.per100g.carbsG,
          fatPer100g: food.per100g.fatG,
          sugarPer100g: food.per100g.sugarG ?? 0,
          fiberPer100g: food.per100g.fiberG,
          sodiumPer100g: food.per100g.sodiumMg
        }))
      });
      await tx.servingUnit.createMany({
        data: foods.flatMap((food) =>
          food.servingUnits.map((unit) => ({
            id: unit.id,
            foodItemId: food.id,
            unitName: unit.unitName,
            gramsPerUnit: unit.gramsPerUnit,
            source: unit.source,
            confidence: unit.confidence,
            notes: unit.notes
          }))
        )
      });
    }

    const favoriteRows = [...value.favoriteFoodIds]
      .map(favoriteParts)
      .filter((favorite): favorite is { userId: string; foodItemId: string } => Boolean(favorite))
      .filter((favorite) => users.has(favorite.userId) && foodIds.has(favorite.foodItemId));
    if (favoriteRows.length) await tx.favoriteFood.createMany({ data: favoriteRows, skipDuplicates: true });

    if (value.diaryEntries.length) {
      await tx.diaryEntry.createMany({
        data: value.diaryEntries.map((entry) => ({
          id: entry.id,
          userId: entry.userId,
          date: toDateOnly(entry.date),
          mealGroupId: entry.mealGroupId,
          foodItemId: entry.foodItemId && foodIds.has(entry.foodItemId) ? entry.foodItemId : null,
          displayName: entry.displayName,
          quantity: entry.quantity,
          unit: entry.unit,
          grams: entry.grams,
          calories: entry.macros.calories,
          proteinG: entry.macros.proteinG,
          carbsG: entry.macros.carbsG,
          fatG: entry.macros.fatG,
          sugarG: entry.macros.sugarG ?? 0,
          fiberG: entry.macros.fiberG,
          sodiumMg: entry.macros.sodiumMg,
          sourceType: entry.sourceType,
          confidence: entry.confidence,
          assumptions: entry.assumptions,
          createdAt: toDate(entry.createdAt),
          updatedAt: toDate(entry.updatedAt)
        }))
      });
    }

    if (value.savedMeals.length) {
      await tx.savedMeal.createMany({
        data: value.savedMeals.map((meal) => ({
          id: meal.id,
          userId: meal.userId,
          name: meal.name,
          createdAt: toDate(meal.createdAt),
          updatedAt: toDate(meal.updatedAt)
        }))
      });
      const savedItems = value.savedMeals.flatMap((meal) =>
        meal.entries.map((entry) => ({
          id: entry.id,
          savedMealId: meal.id,
          foodItemId: entry.foodItemId && foodIds.has(entry.foodItemId) ? entry.foodItemId : null,
          displayName: entry.displayName,
          quantity: entry.quantity,
          unit: entry.unit,
          grams: entry.grams,
          calories: entry.macros.calories,
          proteinG: entry.macros.proteinG,
          carbsG: entry.macros.carbsG,
          fatG: entry.macros.fatG,
          sugarG: entry.macros.sugarG ?? 0,
          fiberG: entry.macros.fiberG,
          sodiumMg: entry.macros.sodiumMg,
          sourceType: entry.sourceType,
          confidence: entry.confidence,
          assumptions: entry.assumptions
        }))
      );
      if (savedItems.length) await tx.savedMealItem.createMany({ data: savedItems });
    }

    if (value.recipes.length) {
      await tx.recipe.createMany({
        data: value.recipes.map((recipe) => ({
          id: recipe.id,
          userId: recipe.userId,
          name: recipe.name,
          servings: recipe.servings,
          totalCookedWeightG: recipe.totalCookedWeightG,
          calories: recipe.totals.calories,
          proteinG: recipe.totals.proteinG,
          carbsG: recipe.totals.carbsG,
          fatG: recipe.totals.fatG,
          sugarG: recipe.totals.sugarG ?? 0,
          fiberG: recipe.totals.fiberG,
          sodiumMg: recipe.totals.sodiumMg,
          perServingCalories: recipe.perServing.calories,
          perServingProteinG: recipe.perServing.proteinG,
          perServingCarbsG: recipe.perServing.carbsG,
          perServingFatG: recipe.perServing.fatG,
          perServingSugarG: recipe.perServing.sugarG ?? 0,
          perServingFiberG: recipe.perServing.fiberG,
          perServingSodiumMg: recipe.perServing.sodiumMg,
          createdAt: toDate(recipe.createdAt),
          updatedAt: toDate(recipe.updatedAt)
        }))
      });
      const ingredients = value.recipes.flatMap((recipe) =>
        recipe.ingredients.map((ingredient) => ({
          id: ingredient.id,
          recipeId: recipe.id,
          foodItemId: ingredient.foodItemId && foodIds.has(ingredient.foodItemId) ? ingredient.foodItemId : null,
          displayName: ingredient.displayName,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          grams: ingredient.grams,
          calories: ingredient.macros.calories,
          proteinG: ingredient.macros.proteinG,
          carbsG: ingredient.macros.carbsG,
          fatG: ingredient.macros.fatG,
          sugarG: ingredient.macros.sugarG ?? 0,
          fiberG: ingredient.macros.fiberG,
          sodiumMg: ingredient.macros.sodiumMg
        }))
      );
      if (ingredients.length) await tx.recipeIngredient.createMany({ data: ingredients });
    }

    if (value.weightEntries.length) {
      await tx.weightEntry.createMany({
        data: value.weightEntries.map((entry) => ({
          id: entry.id,
          userId: entry.userId,
          date: toDateOnly(entry.date),
          weightKg: entry.weightKg,
          createdAt: toDate(entry.createdAt)
        }))
      });
    }

    if (value.mealPhotos.length) {
      await tx.mealPhoto.createMany({
        data: value.mealPhotos.map((photo) => ({
          id: photo.id,
          userId: photo.userId,
          storageKey: photo.storageKey,
          thumbnailKey: photo.thumbnailKey,
          retained: photo.retained,
          source: photo.source,
          mimeType: photo.mimeType,
          byteLength: photo.byteLength,
          uploadedAt: toDate(photo.uploadedAt)
        }))
      });
    }

    if (value.aiEstimates.length) {
      await tx.aIEstimate.createMany({
        data: value.aiEstimates.map((estimate) => ({
          id: estimate.id,
          userId: estimate.userId,
          inputType: estimate.inputType,
          model: estimate.model,
          promptVersion: estimate.promptVersion,
          inputContext: estimate.inputContext,
          outputJson: asInputJson(estimate.output),
          confidence: estimate.confidence,
          usedFallback: estimate.usedFallback,
          caloriesMin: estimate.output.calorieRange.min,
          caloriesMax: estimate.output.calorieRange.max,
          assumptions: estimate.assumptions,
          createdAt: toDate(estimate.createdAt)
        }))
      });
    }

    if (value.userCorrections.length) {
      await tx.userCorrection.createMany({
        data: value.userCorrections.map((correction) => ({
          id: correction.id,
          userId: correction.userId,
          aiEstimateId: correction.aiEstimateId && aiEstimateIds.has(correction.aiEstimateId) ? correction.aiEstimateId : null,
          correctionText: correction.correctionText,
          beforeJson: asInputJson(correction.before),
          afterJson: asInputJson(correction.after),
          correctionType: correction.correctionType,
          createdAt: toDate(correction.createdAt)
        }))
      });
    }

    if (value.aiUsageEvents.length) {
      await tx.aIUsageEvent.createMany({
        data: value.aiUsageEvents.map((event) => ({
          id: event.id,
          userId: event.userId,
          endpoint: event.endpoint,
          inputType: event.inputType,
          model: event.model,
          promptVersion: event.promptVersion,
          status: event.status,
          usedFallback: event.usedFallback,
          costUnits: event.costUnits,
          reason: event.reason,
          createdAt: toDate(event.createdAt)
        }))
      });
    }

    if (value.analyticsEvents.length) {
      await tx.analyticsEvent.createMany({
        data: value.analyticsEvents.map((event) => ({
          id: event.id,
          userId: event.userId,
          eventType: event.eventType,
          status: event.status,
          sourceType: event.sourceType,
          metadata: asInputJson(event.metadata),
          createdAt: toDate(event.createdAt)
        }))
      });
    }
  }, { timeout: 30_000 });
}

export async function ensurePrismaReferenceData(value: Store): Promise<void> {
  const users = new Map<string, AuthUser>();
  const now = new Date().toISOString();

  function ensureUser(userId: string, displayName = "Macro User") {
    if (!users.has(userId)) {
      users.set(userId, {
        id: userId,
        email: `${userId}@macro.local`,
        displayName,
        createdAt: now,
        lastLoginAt: null
      });
    }
  }

  for (const user of value.authUsers) users.set(user.id, user);
  for (const profile of value.profiles) ensureUser(profile.userId, profile.displayName);
  for (const goal of value.goals) ensureUser(goal.userId);
  for (const mealGroup of value.mealGroups) ensureUser(mealGroup.userId);
  for (const food of value.foods) if (food.ownerUserId) ensureUser(food.ownerUserId);

  const client = prismaClient();
  await client.$transaction(async (tx) => {
    for (const user of users.values()) {
      await upsertUserForPrisma(tx, user);
    }

    for (const profile of value.profiles) {
      await tx.userProfile.upsert({
        where: { userId: profile.userId },
        create: {
          id: profile.id,
          userId: profile.userId,
          displayName: profile.displayName,
          onboardingCompleted: profile.onboardingCompleted,
          birthYear: profile.birthYear ?? null,
          sex: profile.sex ?? null,
          heightCm: profile.heightCm ?? null,
          weightKg: profile.weightKg ?? null,
          targetWeightKg: profile.targetWeightKg ?? null,
          goalType: profile.goalType ?? null,
          activityLevel: profile.activityLevel ?? null,
          unitSystem: profile.unitSystem
        },
        update: {
          displayName: profile.displayName,
          onboardingCompleted: profile.onboardingCompleted,
          birthYear: profile.birthYear ?? null,
          sex: profile.sex ?? null,
          heightCm: profile.heightCm ?? null,
          weightKg: profile.weightKg ?? null,
          targetWeightKg: profile.targetWeightKg ?? null,
          goalType: profile.goalType ?? null,
          activityLevel: profile.activityLevel ?? null,
          unitSystem: profile.unitSystem
        }
      });
    }

    for (const goal of value.goals) {
      await tx.nutritionGoal.upsert({
        where: { id: goal.id },
        create: {
          id: goal.id,
          userId: goal.userId,
          calories: goal.calories,
          proteinG: goal.proteinG,
          carbsG: goal.carbsG,
          fatG: goal.fatG,
          sugarG: goal.sugarG ?? 0,
          fiberG: goal.fiberG,
          sodiumMg: goal.sodiumMg,
          effectiveFrom: toDateOnly(goal.effectiveFrom)
        },
        update: {
          calories: goal.calories,
          proteinG: goal.proteinG,
          carbsG: goal.carbsG,
          fatG: goal.fatG,
          sugarG: goal.sugarG ?? 0,
          fiberG: goal.fiberG,
          sodiumMg: goal.sodiumMg,
          effectiveFrom: toDateOnly(goal.effectiveFrom)
        }
      });
    }

    for (const mealGroup of value.mealGroups) {
      await tx.mealGroup.upsert({
        where: { id: mealGroup.id },
        create: mealGroup,
        update: {
          name: mealGroup.name,
          sortOrder: mealGroup.sortOrder,
          isDefault: mealGroup.isDefault
        }
      });
    }

    for (const food of value.foods) {
      await upsertFoodForPrisma(tx, food);
    }

    for (const key of value.favoriteFoodIds) {
      const [userId, foodItemId] = key.includes(":") ? key.split(":", 2) : ["user_demo", key];
      if (!userId || !foodItemId || !users.has(userId)) continue;
      await tx.favoriteFood.upsert({
        where: {
          userId_foodItemId: {
            userId,
            foodItemId
          }
        },
        create: {
          userId,
          foodItemId
        },
        update: {}
      });
    }
  }, {
    maxWait: 5_000,
    timeout: 30_000
  });
}

export async function persistAuthStateInPrisma(input: PrismaAuthStateInput): Promise<void> {
  const client = prismaClient();

  await client.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: input.user.id },
      create: {
        id: input.user.id,
        email: input.user.email,
        displayName: input.user.displayName ?? null,
        lastLoginAt: toNullableDate(input.user.lastLoginAt),
        createdAt: toDate(input.user.createdAt)
      },
      update: {
        email: input.user.email,
        displayName: input.user.displayName ?? null,
        lastLoginAt: toNullableDate(input.user.lastLoginAt)
      }
    });

    for (const profile of input.profiles) {
      await tx.userProfile.upsert({
        where: { userId: profile.userId },
        create: {
          id: profile.id,
          userId: profile.userId,
          displayName: profile.displayName,
          onboardingCompleted: profile.onboardingCompleted,
          birthYear: profile.birthYear ?? null,
          sex: profile.sex ?? null,
          heightCm: profile.heightCm ?? null,
          weightKg: profile.weightKg ?? null,
          targetWeightKg: profile.targetWeightKg ?? null,
          goalType: profile.goalType ?? null,
          activityLevel: profile.activityLevel ?? null,
          unitSystem: profile.unitSystem
        },
        update: {
          displayName: profile.displayName,
          onboardingCompleted: profile.onboardingCompleted,
          birthYear: profile.birthYear ?? null,
          sex: profile.sex ?? null,
          heightCm: profile.heightCm ?? null,
          weightKg: profile.weightKg ?? null,
          targetWeightKg: profile.targetWeightKg ?? null,
          goalType: profile.goalType ?? null,
          activityLevel: profile.activityLevel ?? null,
          unitSystem: profile.unitSystem
        }
      });
    }

    for (const goal of input.goals) {
      await tx.nutritionGoal.upsert({
        where: { id: goal.id },
        create: {
          id: goal.id,
          userId: goal.userId,
          calories: goal.calories,
          proteinG: goal.proteinG,
          carbsG: goal.carbsG,
          fatG: goal.fatG,
          sugarG: goal.sugarG ?? 0,
          fiberG: goal.fiberG,
          sodiumMg: goal.sodiumMg,
          effectiveFrom: toDateOnly(goal.effectiveFrom)
        },
        update: {
          calories: goal.calories,
          proteinG: goal.proteinG,
          carbsG: goal.carbsG,
          fatG: goal.fatG,
          sugarG: goal.sugarG ?? 0,
          fiberG: goal.fiberG,
          sodiumMg: goal.sodiumMg,
          effectiveFrom: toDateOnly(goal.effectiveFrom)
        }
      });
    }

    for (const mealGroup of input.mealGroups) {
      await tx.mealGroup.upsert({
        where: { id: mealGroup.id },
        create: mealGroup,
        update: {
          name: mealGroup.name,
          sortOrder: mealGroup.sortOrder,
          isDefault: mealGroup.isDefault
        }
      });
    }

    if (input.session) {
      await tx.authSession.upsert({
        where: { tokenHash: input.session.tokenHash },
        create: {
          userId: input.session.userId,
          tokenHash: input.session.tokenHash,
          createdAt: toDate(input.session.createdAt),
          revokedAt: toNullableDate(input.session.revokedAt)
        },
        update: {
          revokedAt: toNullableDate(input.session.revokedAt)
        }
      });
    }
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function findAuthUserByEmailFromPrisma(email: string): Promise<AuthUser | null> {
  const user = await prismaClient().user.findUnique({
    where: { email }
  });
  return user ? authUserFromRow(user) : null;
}

export async function findAuthUserBySessionTokenHashFromPrisma(tokenHash: string): Promise<AuthUser | null> {
  const session = await prismaClient().authSession.findFirst({
    where: {
      tokenHash,
      revokedAt: null
    },
    include: {
      user: true
    }
  });
  return session?.user ? authUserFromRow(session.user) : null;
}

export async function persistAuthLoginInPrisma(input: {
  user: AuthUser;
  session: AuthSession;
}): Promise<void> {
  await prismaClient().$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.user.id },
      data: {
        displayName: input.user.displayName ?? null,
        lastLoginAt: toNullableDate(input.user.lastLoginAt)
      }
    });
    await tx.authSession.upsert({
      where: { tokenHash: input.session.tokenHash },
      create: {
        userId: input.session.userId,
        tokenHash: input.session.tokenHash,
        createdAt: toDate(input.session.createdAt),
        revokedAt: toNullableDate(input.session.revokedAt)
      },
      update: {
        revokedAt: toNullableDate(input.session.revokedAt)
      }
    });
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function persistUserStateInPrisma(input: PrismaUserStateInput): Promise<void> {
  const client = prismaClient();
  const user: AuthUser = input.user ?? {
    id: input.userId,
    email: `${input.userId}@macro.local`,
    displayName: input.profile?.displayName ?? "Macro User",
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };

  await client.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? null,
        lastLoginAt: toNullableDate(user.lastLoginAt),
        createdAt: toDate(user.createdAt)
      },
      update: {
        email: user.email,
        displayName: user.displayName ?? null,
        lastLoginAt: toNullableDate(user.lastLoginAt)
      }
    });

    if (input.profile) {
      await tx.userProfile.upsert({
        where: { userId: input.profile.userId },
        create: {
          id: input.profile.id,
          userId: input.profile.userId,
          displayName: input.profile.displayName,
          onboardingCompleted: input.profile.onboardingCompleted,
          birthYear: input.profile.birthYear ?? null,
          sex: input.profile.sex ?? null,
          heightCm: input.profile.heightCm ?? null,
          weightKg: input.profile.weightKg ?? null,
          targetWeightKg: input.profile.targetWeightKg ?? null,
          goalType: input.profile.goalType ?? null,
          activityLevel: input.profile.activityLevel ?? null,
          unitSystem: input.profile.unitSystem
        },
        update: {
          displayName: input.profile.displayName,
          onboardingCompleted: input.profile.onboardingCompleted,
          birthYear: input.profile.birthYear ?? null,
          sex: input.profile.sex ?? null,
          heightCm: input.profile.heightCm ?? null,
          weightKg: input.profile.weightKg ?? null,
          targetWeightKg: input.profile.targetWeightKg ?? null,
          goalType: input.profile.goalType ?? null,
          activityLevel: input.profile.activityLevel ?? null,
          unitSystem: input.profile.unitSystem
        }
      });
    }

    if (input.goal) {
      await tx.nutritionGoal.upsert({
        where: { id: input.goal.id },
        create: {
          id: input.goal.id,
          userId: input.goal.userId,
          calories: input.goal.calories,
          proteinG: input.goal.proteinG,
          carbsG: input.goal.carbsG,
          fatG: input.goal.fatG,
          sugarG: input.goal.sugarG ?? 0,
          fiberG: input.goal.fiberG,
          sodiumMg: input.goal.sodiumMg,
          effectiveFrom: toDateOnly(input.goal.effectiveFrom)
        },
        update: {
          calories: input.goal.calories,
          proteinG: input.goal.proteinG,
          carbsG: input.goal.carbsG,
          fatG: input.goal.fatG,
          sugarG: input.goal.sugarG ?? 0,
          fiberG: input.goal.fiberG,
          sodiumMg: input.goal.sodiumMg,
          effectiveFrom: toDateOnly(input.goal.effectiveFrom)
        }
      });
    }

    if (input.weightEntry) {
      await tx.weightEntry.upsert({
        where: { id: input.weightEntry.id },
        create: {
          id: input.weightEntry.id,
          userId: input.weightEntry.userId,
          date: toDateOnly(input.weightEntry.date),
          weightKg: input.weightEntry.weightKg,
          createdAt: toDate(input.weightEntry.createdAt)
        },
        update: {
          date: toDateOnly(input.weightEntry.date),
          weightKg: input.weightEntry.weightKg,
          createdAt: toDate(input.weightEntry.createdAt)
        }
      });
    }
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function readUserStateFromPrisma(userId: string): Promise<{
  user: AuthUser | null;
  profile: UserProfile | null;
  goal: StoredNutritionGoal | null;
  mealGroups: MealGroup[];
}> {
  const [user, profile, goal, mealGroups] = await Promise.all([
    prismaClient().user.findUnique({ where: { id: userId } }),
    prismaClient().userProfile.findUnique({ where: { userId } }),
    prismaClient().nutritionGoal.findFirst({
      where: { userId },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }]
    }),
    prismaClient().mealGroup.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    })
  ]);

  return {
    user: user ? authUserFromRow(user) : null,
    profile: profile ? userProfileFromRow(profile) : null,
    goal: goal ? goalFromRow(goal) : null,
    mealGroups: mealGroups.map(mealGroupFromRow)
  };
}

export async function persistMealGroupsForUserInPrisma(input: {
  user?: AuthUser;
  userId: string;
  mealGroups: MealGroup[];
}): Promise<void> {
  await prismaClient().$transaction(async (tx) => {
    await upsertUserForPrisma(tx, input.user ?? fallbackUser(input.userId));
    for (const mealGroup of input.mealGroups) {
      if (mealGroup.userId !== input.userId) continue;
      await tx.mealGroup.upsert({
        where: { id: mealGroup.id },
        create: mealGroup,
        update: {
          name: mealGroup.name,
          sortOrder: mealGroup.sortOrder,
          isDefault: mealGroup.isDefault
        }
      });
    }
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function deleteMealGroupFromPrisma(
  userId: string,
  id: string
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "default" | "has_entries" }> {
  const client = prismaClient();
  const mealGroup = await client.mealGroup.findFirst({
    where: { id, userId },
    select: { id: true, isDefault: true }
  });
  if (!mealGroup) return { ok: false, reason: "not_found" };
  if (mealGroup.isDefault) return { ok: false, reason: "default" };

  const entryCount = await client.diaryEntry.count({ where: { userId, mealGroupId: id } });
  if (entryCount > 0) return { ok: false, reason: "has_entries" };

  await client.mealGroup.delete({ where: { id } });
  return { ok: true };
}

export async function persistDiaryEntriesInPrisma(input: PrismaDiaryEntriesInput): Promise<void> {
  const entries = input.entries;
  if (entries.length === 0) return;

  const usersById = new Map(input.users?.map((user) => [user.id, user]));
  const mealGroupsById = new Map(input.mealGroups?.map((mealGroup) => [mealGroup.id, mealGroup]));
  const foodsById = new Map(input.foods?.map((food) => [food.id, food]));
  const client = prismaClient();

  await client.$transaction(async (tx) => {
    for (const userId of new Set(entries.map((entry) => entry.userId))) {
      await upsertUserForPrisma(tx, usersById.get(userId) ?? fallbackUser(userId));
    }

    for (const entry of entries) {
      const mealGroup = mealGroupsById.get(entry.mealGroupId) ?? {
        id: entry.mealGroupId,
        userId: entry.userId,
        name: "Imported",
        sortOrder: 999,
        isDefault: false
      };
      await tx.mealGroup.upsert({
        where: { id: mealGroup.id },
        create: mealGroup,
        update: {
          name: mealGroup.name,
          sortOrder: mealGroup.sortOrder,
          isDefault: mealGroup.isDefault
        }
      });
    }

    const referencedFoodIds = [...new Set(entries.map((entry) => entry.foodItemId).filter((id): id is string => Boolean(id)))];
    const existingFoods = referencedFoodIds.length
      ? await tx.foodItem.findMany({ where: { id: { in: referencedFoodIds } }, select: { id: true } })
      : [];
    const availableFoodIds = new Set(existingFoods.map((food) => food.id));
    for (const foodId of referencedFoodIds) {
      const food = foodsById.get(foodId);
      if (!food) continue;
      if (food.ownerUserId) {
        await upsertUserForPrisma(tx, usersById.get(food.ownerUserId) ?? fallbackUser(food.ownerUserId));
      }
      await upsertFoodForPrisma(tx, food);
      availableFoodIds.add(food.id);
    }

    for (const entry of entries) {
      const foodItemId = entry.foodItemId && availableFoodIds.has(entry.foodItemId) ? entry.foodItemId : null;
      await tx.diaryEntry.upsert({
        where: { id: entry.id },
        create: {
          id: entry.id,
          ...diaryEntryPrismaData(entry, foodItemId)
        },
        update: diaryEntryPrismaData(entry, foodItemId)
      });
    }
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function deleteDiaryEntriesFromPrisma(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await prismaClient().diaryEntry.deleteMany({
    where: {
      userId,
      id: { in: ids }
    }
  });
  return result.count;
}

export async function readDiaryStateFromPrisma(userId: string, date: string): Promise<{
  goal: StoredNutritionGoal | null;
  mealGroups: MealGroup[];
  entries: DiaryEntry[];
}> {
  const client = prismaClient();
  const [goal, mealGroups, entries] = await Promise.all([
    client.nutritionGoal.findFirst({
      where: { userId },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }]
    }),
    client.mealGroup.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    client.diaryEntry.findMany({
      where: {
        userId,
        date: toDateOnly(date)
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    })
  ]);

  return {
    goal: goal ? goalFromRow(goal) : null,
    mealGroups: mealGroups.map(mealGroupFromRow),
    entries: entries.map(diaryEntryFromColumns)
  };
}

export async function readDiaryEntriesByIdsFromPrisma(userId: string, ids: string[]): Promise<DiaryEntry[]> {
  if (ids.length === 0) return [];
  const rows = await prismaClient().diaryEntry.findMany({
    where: {
      userId,
      id: { in: ids }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const byId = new Map(rows.map((row) => [row.id, diaryEntryFromColumns(row)]));
  return ids.map((id) => byId.get(id)).filter((entry): entry is DiaryEntry => Boolean(entry));
}

export async function searchFoodsFromPrisma(userId: string, query: string, limit = 25): Promise<FoodItem[]> {
  const normalized = query.trim();
  const filters: Prisma.FoodItemWhereInput[] = [
    {
      OR: [
        { ownerUserId: null },
        { ownerUserId: userId }
      ]
    }
  ];
  if (normalized) {
    filters.push({
      OR: [
        { name: { contains: normalized, mode: Prisma.QueryMode.insensitive } },
        { brand: { contains: normalized, mode: Prisma.QueryMode.insensitive } }
      ]
    });
  }

  const rows = await prismaClient().foodItem.findMany({
    where: { AND: filters },
    include: {
      servingUnits: true,
      favoriteFoods: {
        where: { userId },
        select: { foodItemId: true }
      }
    },
    orderBy: [{ verified: "desc" }, { name: "asc" }],
    take: Math.max(limit * 4, 50)
  });

  const favoriteIds = new Set(rows.flatMap((row) => row.favoriteFoods.map((favorite) => favorite.foodItemId)));
  return rows
    .map((row) => foodFromRow(row))
    .sort((a, b) => {
      const favoriteDiff = Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id));
      if (favoriteDiff !== 0) return favoriteDiff;
      const verifiedDiff = Number(b.verified) - Number(a.verified);
      if (verifiedDiff !== 0) return verifiedDiff;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export async function listRecentFoodsFromPrisma(userId: string, limit = 15): Promise<FoodItem[]> {
  const rows = await prismaClient().diaryEntry.findMany({
    where: {
      userId,
      foodItemId: { not: null }
    },
    include: {
      foodItem: {
        include: {
          servingUnits: true
        }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.max(limit * 4, 50)
  });

  const foods: FoodItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.foodItem || seen.has(row.foodItem.id)) continue;
    if (row.foodItem.ownerUserId && row.foodItem.ownerUserId !== userId) continue;
    seen.add(row.foodItem.id);
    foods.push(foodFromRow(row.foodItem));
    if (foods.length >= limit) break;
  }
  return foods;
}

export async function listFavoriteFoodsFromPrisma(userId: string): Promise<FoodItem[]> {
  const rows = await prismaClient().favoriteFood.findMany({
    where: {
      userId,
      foodItem: {
        OR: [
          { ownerUserId: null },
          { ownerUserId: userId }
        ]
      }
    },
    include: {
      foodItem: {
        include: {
          servingUnits: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
  return rows.map((row) => foodFromRow(row.foodItem));
}

export async function getFoodItemForUserFromPrisma(userId: string, foodId: string): Promise<FoodItem | null> {
  const row = await prismaClient().foodItem.findFirst({
    where: {
      id: foodId,
      OR: [
        { ownerUserId: null },
        { ownerUserId: userId }
      ]
    },
    include: { servingUnits: true }
  });
  return row ? foodFromRow(row) : null;
}

export async function getFoodItemByBarcodeFromPrisma(barcode: string): Promise<FoodItem | null> {
  const row = await prismaClient().barcodeProduct.findUnique({
    where: { barcode },
    include: {
      foodItem: {
        include: {
          servingUnits: true
        }
      }
    }
  });
  return row?.foodItem ? foodFromRow(row.foodItem) : null;
}

export async function persistFoodItemInPrisma(input: PrismaFoodItemInput): Promise<void> {
  await prismaClient().$transaction(async (tx) => {
    const ownerUser = input.ownerUser ?? (input.food.ownerUserId ? fallbackUser(input.food.ownerUserId) : undefined);
    if (ownerUser) {
      await upsertUserForPrisma(tx, ownerUser);
    }
    await upsertFoodForPrisma(tx, input.food);

    if (input.barcode) {
      await tx.barcodeProduct.upsert({
        where: { barcode: input.barcode },
        create: {
          barcode: input.barcode,
          foodItemId: input.food.id,
          externalSource: "open_food_facts",
          externalId: input.barcode,
          rawPayload: asInputJson(input.rawPayload ?? {}),
          lastVerifiedAt: new Date()
        },
        update: {
          foodItemId: input.food.id,
          externalSource: "open_food_facts",
          externalId: input.barcode,
          rawPayload: asInputJson(input.rawPayload ?? {}),
          lastVerifiedAt: new Date()
        }
      });
    }
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function setFavoriteFoodInPrisma(input: PrismaFavoriteFoodInput): Promise<void> {
  await prismaClient().$transaction(async (tx) => {
    await upsertUserForPrisma(tx, input.user ?? fallbackUser(input.userId));
    if (input.food.ownerUserId) {
      const ownerUser = input.user?.id === input.food.ownerUserId ? input.user : fallbackUser(input.food.ownerUserId);
      await upsertUserForPrisma(tx, ownerUser);
    }
    await upsertFoodForPrisma(tx, input.food);

    if (input.favorited) {
      await tx.favoriteFood.upsert({
        where: {
          userId_foodItemId: {
            userId: input.userId,
            foodItemId: input.food.id
          }
        },
        create: {
          userId: input.userId,
          foodItemId: input.food.id
        },
        update: {}
      });
      return;
    }

    await tx.favoriteFood.deleteMany({
      where: {
        userId: input.userId,
        foodItemId: input.food.id
      }
    });
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function createAnalyticsEventInPrisma(input: PrismaAnalyticsEventInput): Promise<void> {
  await prismaClient().$transaction(async (tx) => {
    await upsertUserForPrisma(tx, input.user ?? fallbackUser(input.event.userId));
    await tx.analyticsEvent.upsert({
      where: { id: input.event.id },
      create: {
        id: input.event.id,
        userId: input.event.userId,
        eventType: input.event.eventType,
        status: input.event.status,
        sourceType: input.event.sourceType,
        metadata: asInputJson(input.event.metadata),
        createdAt: toDate(input.event.createdAt)
      },
      update: {
        eventType: input.event.eventType,
        status: input.event.status,
        sourceType: input.event.sourceType,
        metadata: asInputJson(input.event.metadata),
        createdAt: toDate(input.event.createdAt)
      }
    });
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export async function getAnalyticsSummaryFromPrisma(userId: string): Promise<AnalyticsSummaryResponse> {
  const client = prismaClient();
  const [
    diaryEntriesBySource,
    aiEstimatesGenerated,
    aiCorrectionsApplied,
    barcodeLookups,
    barcodeLookupFailures,
    scanFailures,
    aiUsageCost,
    recentEventRows
  ] = await Promise.all([
    client.diaryEntry.groupBy({
      by: ["sourceType"],
      where: { userId },
      _count: { _all: true }
    }),
    client.aIEstimate.count({
      where: {
        userId,
        inputType: { in: ["text", "photo", "saved_meal_match"] }
      }
    }),
    client.userCorrection.count({ where: { userId } }),
    client.analyticsEvent.count({
      where: {
        userId,
        eventType: "barcode_lookup"
      }
    }),
    client.analyticsEvent.count({
      where: {
        userId,
        eventType: "barcode_lookup",
        status: "failed"
      }
    }),
    client.analyticsEvent.count({
      where: {
        userId,
        eventType: "scan_failure"
      }
    }),
    client.aIUsageEvent.aggregate({
      _sum: { costUnits: true },
      where: {
        userId,
        status: { not: "blocked" }
      }
    }),
    client.analyticsEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25
    })
  ]);

  const sourceCounts = Object.fromEntries(sourceTypes.map((sourceType) => [sourceType, 0])) as AnalyticsSummaryResponse["loggedEntriesBySource"];
  for (const row of diaryEntriesBySource) {
    if (sourceTypes.includes(row.sourceType as DiaryEntry["sourceType"])) {
      sourceCounts[row.sourceType as DiaryEntry["sourceType"]] = row._count._all;
    }
  }

  const totalLoggedEntries = Object.values(sourceCounts).reduce((total, count) => total + count, 0);
  const aiMealsLogged = sourceCounts.ai_photo + sourceCounts.ai_text;
  const aiCostUnits = aiUsageCost._sum.costUnits ?? 0;
  const recentEvents = recentEventRows.map((row) => {
    const { userId: _userId, ...event } = analyticsEventFromRow(row);
    return event;
  });

  return {
    totalLoggedEntries,
    loggedEntriesBySource: sourceCounts,
    aiMealsLogged,
    aiEstimatesGenerated,
    aiEstimateAcceptanceRate: aiEstimatesGenerated > 0 ? roundRate(aiMealsLogged / aiEstimatesGenerated) : null,
    aiCorrectionsApplied,
    aiCorrectionRate: aiEstimatesGenerated > 0 ? roundRate(aiCorrectionsApplied / aiEstimatesGenerated) : null,
    barcodeLookups,
    barcodeLookupFailures,
    barcodeFailureRate: barcodeLookups > 0 ? roundRate(barcodeLookupFailures / barcodeLookups) : null,
    scanFailures,
    aiCostUnits,
    aiCostUnitsPerLoggedAiMeal: aiMealsLogged > 0 ? roundRate(aiCostUnits / aiMealsLogged) : null,
    recentEvents
  };
}

export async function persistSavedMealInPrisma(input: PrismaSavedMealInput): Promise<void> {
  const foodsById = new Map(input.foods?.map((food) => [food.id, food]));
  await prismaClient().$transaction(async (tx) => {
    await upsertUserForPrisma(tx, input.user ?? fallbackUser(input.meal.userId));

    const referencedFoodIds = [...new Set(input.meal.entries.map((entry) => entry.foodItemId).filter((id): id is string => Boolean(id)))];
    const existingFoods = referencedFoodIds.length
      ? await tx.foodItem.findMany({ where: { id: { in: referencedFoodIds } }, select: { id: true } })
      : [];
    const availableFoodIds = new Set(existingFoods.map((food) => food.id));
    for (const foodId of referencedFoodIds) {
      const food = foodsById.get(foodId);
      if (!food) continue;
      if (food.ownerUserId) {
        const ownerUser = input.user?.id === food.ownerUserId ? input.user : fallbackUser(food.ownerUserId);
        await upsertUserForPrisma(tx, ownerUser);
      }
      await upsertFoodForPrisma(tx, food);
      availableFoodIds.add(food.id);
    }

    await tx.savedMeal.upsert({
      where: { id: input.meal.id },
      create: {
        id: input.meal.id,
        userId: input.meal.userId,
        name: input.meal.name,
        createdAt: toDate(input.meal.createdAt),
        updatedAt: toDate(input.meal.updatedAt)
      },
      update: {
        name: input.meal.name,
        updatedAt: toDate(input.meal.updatedAt)
      }
    });

    await tx.savedMealItem.deleteMany({ where: { savedMealId: input.meal.id } });
    if (input.meal.entries.length) {
      await tx.savedMealItem.createMany({
        data: input.meal.entries.map((entry) => ({
          id: `${input.meal.id}_${entry.id}`,
          savedMealId: input.meal.id,
          foodItemId: entry.foodItemId && availableFoodIds.has(entry.foodItemId) ? entry.foodItemId : null,
          displayName: entry.displayName,
          quantity: entry.quantity,
          unit: entry.unit,
          grams: entry.grams,
          calories: entry.macros.calories,
          proteinG: entry.macros.proteinG,
          carbsG: entry.macros.carbsG,
          fatG: entry.macros.fatG,
          sugarG: entry.macros.sugarG ?? 0,
          fiberG: entry.macros.fiberG,
          sodiumMg: entry.macros.sodiumMg,
          sourceType: entry.sourceType,
          confidence: entry.confidence,
          assumptions: entry.assumptions
        }))
      });
    }
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function deleteSavedMealFromPrisma(userId: string, id: string): Promise<void> {
  await prismaClient().savedMeal.deleteMany({
    where: {
      userId,
      id
    }
  });
}

export async function listSavedMealsFromPrisma(userId: string): Promise<SavedMeal[]> {
  const rows = await prismaClient().savedMeal.findMany({
    where: { userId },
    include: { items: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });
  return rows.map(savedMealFromRow);
}

export async function getSavedMealFromPrisma(userId: string, id: string): Promise<SavedMeal | null> {
  const row = await prismaClient().savedMeal.findFirst({
    where: { userId, id },
    include: { items: true }
  });
  return row ? savedMealFromRow(row) : null;
}

export async function persistRecipeInPrisma(input: PrismaRecipeInput): Promise<void> {
  const foodsById = new Map(input.foods?.map((food) => [food.id, food]));
  await prismaClient().$transaction(async (tx) => {
    await upsertUserForPrisma(tx, input.user ?? fallbackUser(input.recipe.userId));

    const referencedFoodIds = [...new Set(input.recipe.ingredients.map((ingredient) => ingredient.foodItemId).filter((id): id is string => Boolean(id)))];
    const existingFoods = referencedFoodIds.length
      ? await tx.foodItem.findMany({ where: { id: { in: referencedFoodIds } }, select: { id: true } })
      : [];
    const availableFoodIds = new Set(existingFoods.map((food) => food.id));
    for (const foodId of referencedFoodIds) {
      const food = foodsById.get(foodId);
      if (!food) continue;
      if (food.ownerUserId) {
        const ownerUser = input.user?.id === food.ownerUserId ? input.user : fallbackUser(food.ownerUserId);
        await upsertUserForPrisma(tx, ownerUser);
      }
      await upsertFoodForPrisma(tx, food);
      availableFoodIds.add(food.id);
    }

    await tx.recipe.upsert({
      where: { id: input.recipe.id },
      create: {
        id: input.recipe.id,
        userId: input.recipe.userId,
        name: input.recipe.name,
        servings: input.recipe.servings,
        totalCookedWeightG: input.recipe.totalCookedWeightG,
        calories: input.recipe.totals.calories,
        proteinG: input.recipe.totals.proteinG,
        carbsG: input.recipe.totals.carbsG,
        fatG: input.recipe.totals.fatG,
        sugarG: input.recipe.totals.sugarG ?? 0,
        fiberG: input.recipe.totals.fiberG,
        sodiumMg: input.recipe.totals.sodiumMg,
        perServingCalories: input.recipe.perServing.calories,
        perServingProteinG: input.recipe.perServing.proteinG,
        perServingCarbsG: input.recipe.perServing.carbsG,
        perServingFatG: input.recipe.perServing.fatG,
        perServingSugarG: input.recipe.perServing.sugarG ?? 0,
        perServingFiberG: input.recipe.perServing.fiberG,
        perServingSodiumMg: input.recipe.perServing.sodiumMg,
        createdAt: toDate(input.recipe.createdAt),
        updatedAt: toDate(input.recipe.updatedAt)
      },
      update: {
        name: input.recipe.name,
        servings: input.recipe.servings,
        totalCookedWeightG: input.recipe.totalCookedWeightG,
        calories: input.recipe.totals.calories,
        proteinG: input.recipe.totals.proteinG,
        carbsG: input.recipe.totals.carbsG,
        fatG: input.recipe.totals.fatG,
        sugarG: input.recipe.totals.sugarG ?? 0,
        fiberG: input.recipe.totals.fiberG,
        sodiumMg: input.recipe.totals.sodiumMg,
        perServingCalories: input.recipe.perServing.calories,
        perServingProteinG: input.recipe.perServing.proteinG,
        perServingCarbsG: input.recipe.perServing.carbsG,
        perServingFatG: input.recipe.perServing.fatG,
        perServingSugarG: input.recipe.perServing.sugarG ?? 0,
        perServingFiberG: input.recipe.perServing.fiberG,
        perServingSodiumMg: input.recipe.perServing.sodiumMg,
        updatedAt: toDate(input.recipe.updatedAt)
      }
    });

    await tx.recipeIngredient.deleteMany({ where: { recipeId: input.recipe.id } });
    if (input.recipe.ingredients.length) {
      await tx.recipeIngredient.createMany({
        data: input.recipe.ingredients.map((ingredient) => ({
          id: ingredient.id,
          recipeId: input.recipe.id,
          foodItemId: ingredient.foodItemId && availableFoodIds.has(ingredient.foodItemId) ? ingredient.foodItemId : null,
          displayName: ingredient.displayName,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          grams: ingredient.grams,
          calories: ingredient.macros.calories,
          proteinG: ingredient.macros.proteinG,
          carbsG: ingredient.macros.carbsG,
          fatG: ingredient.macros.fatG,
          sugarG: ingredient.macros.sugarG ?? 0,
          fiberG: ingredient.macros.fiberG,
          sodiumMg: ingredient.macros.sodiumMg
        }))
      });
    }
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function deleteRecipeFromPrisma(userId: string, id: string): Promise<void> {
  await prismaClient().recipe.deleteMany({
    where: {
      userId,
      id
    }
  });
}

export async function listRecipesFromPrisma(userId: string): Promise<Recipe[]> {
  const rows = await prismaClient().recipe.findMany({
    where: { userId },
    include: { ingredients: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });
  return rows.map(recipeFromRow);
}

export async function getRecipeFromPrisma(userId: string, id: string): Promise<Recipe | null> {
  const row = await prismaClient().recipe.findFirst({
    where: { userId, id },
    include: { ingredients: true }
  });
  return row ? recipeFromRow(row) : null;
}

export async function persistMealPhotoInPrisma(input: PrismaMealPhotoInput): Promise<void> {
  await prismaClient().$transaction(async (tx) => {
    await upsertUserForPrisma(tx, input.user ?? fallbackUser(input.mealPhoto.userId));
    await tx.mealPhoto.upsert({
      where: { id: input.mealPhoto.id },
      create: {
        id: input.mealPhoto.id,
        userId: input.mealPhoto.userId,
        storageKey: input.mealPhoto.storageKey,
        thumbnailKey: input.mealPhoto.thumbnailKey,
        retained: input.mealPhoto.retained,
        source: input.mealPhoto.source,
        mimeType: input.mealPhoto.mimeType,
        byteLength: input.mealPhoto.byteLength,
        uploadedAt: toDate(input.mealPhoto.uploadedAt)
      },
      update: {
        storageKey: input.mealPhoto.storageKey,
        thumbnailKey: input.mealPhoto.thumbnailKey,
        retained: input.mealPhoto.retained,
        source: input.mealPhoto.source,
        mimeType: input.mealPhoto.mimeType,
        byteLength: input.mealPhoto.byteLength,
        uploadedAt: toDate(input.mealPhoto.uploadedAt)
      }
    });
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function deleteMealPhotoFromPrisma(userId: string, id: string): Promise<void> {
  await prismaClient().mealPhoto.deleteMany({
    where: {
      userId,
      id
    }
  });
}

export async function listMealPhotosFromPrisma(userId: string): Promise<MealPhoto[]> {
  const rows = await prismaClient().mealPhoto.findMany({
    where: {
      userId,
      retained: true
    },
    orderBy: { uploadedAt: "desc" }
  });
  return rows.map(mealPhotoFromRow);
}

export async function getMealPhotoFromPrisma(userId: string, id: string): Promise<MealPhoto | null> {
  const row = await prismaClient().mealPhoto.findFirst({
    where: {
      userId,
      id,
      retained: true
    }
  });
  return row ? mealPhotoFromRow(row) : null;
}

export async function listRetainedMealPhotosBeforeFromPrisma(cutoffIso: string): Promise<MealPhoto[]> {
  const rows = await prismaClient().mealPhoto.findMany({
    where: {
      retained: true,
      uploadedAt: { lt: toDate(cutoffIso) }
    },
    orderBy: { uploadedAt: "asc" }
  });
  return rows.map(mealPhotoFromRow);
}

export async function persistAiEstimateInPrisma(input: PrismaAiEstimateInput): Promise<void> {
  await prismaClient().$transaction(async (tx) => {
    await upsertUserForPrisma(tx, input.user ?? fallbackUser(input.estimate.userId));
    await tx.aIEstimate.upsert({
      where: { id: input.estimate.id },
      create: {
        id: input.estimate.id,
        userId: input.estimate.userId,
        inputType: input.estimate.inputType,
        model: input.estimate.model,
        promptVersion: input.estimate.promptVersion,
        inputContext: input.estimate.inputContext,
        outputJson: asInputJson(input.estimate.output),
        confidence: input.estimate.confidence,
        usedFallback: input.estimate.usedFallback,
        caloriesMin: input.estimate.output.calorieRange.min,
        caloriesMax: input.estimate.output.calorieRange.max,
        assumptions: input.estimate.assumptions,
        createdAt: toDate(input.estimate.createdAt)
      },
      update: {
        inputType: input.estimate.inputType,
        model: input.estimate.model,
        promptVersion: input.estimate.promptVersion,
        inputContext: input.estimate.inputContext,
        outputJson: asInputJson(input.estimate.output),
        confidence: input.estimate.confidence,
        usedFallback: input.estimate.usedFallback,
        caloriesMin: input.estimate.output.calorieRange.min,
        caloriesMax: input.estimate.output.calorieRange.max,
        assumptions: input.estimate.assumptions,
        createdAt: toDate(input.estimate.createdAt)
      }
    });
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function persistUserCorrectionInPrisma(input: PrismaUserCorrectionInput): Promise<void> {
  await prismaClient().$transaction(async (tx) => {
    await upsertUserForPrisma(tx, input.user ?? fallbackUser(input.correction.userId));
    const estimateId = input.correction.aiEstimateId
      ? await tx.aIEstimate.findUnique({ where: { id: input.correction.aiEstimateId }, select: { id: true } })
      : null;
    await tx.userCorrection.upsert({
      where: { id: input.correction.id },
      create: {
        id: input.correction.id,
        userId: input.correction.userId,
        aiEstimateId: estimateId?.id ?? null,
        correctionText: input.correction.correctionText,
        beforeJson: asInputJson(input.correction.before),
        afterJson: asInputJson(input.correction.after),
        correctionType: input.correction.correctionType,
        createdAt: toDate(input.correction.createdAt)
      },
      update: {
        aiEstimateId: estimateId?.id ?? null,
        correctionText: input.correction.correctionText,
        beforeJson: asInputJson(input.correction.before),
        afterJson: asInputJson(input.correction.after),
        correctionType: input.correction.correctionType,
        createdAt: toDate(input.correction.createdAt)
      }
    });
  }, {
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function getAiHistoryFromPrisma(userId: string): Promise<{
  estimates: AIEstimateLog[];
  corrections: UserCorrectionLog[];
}> {
  const [estimates, corrections] = await Promise.all([
    prismaClient().aIEstimate.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prismaClient().userCorrection.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50
    })
  ]);
  return {
    estimates: estimates.map(aiEstimateFromRow),
    corrections: corrections.map(userCorrectionFromRow)
  };
}

export async function listUserCorrectionsFromPrisma(userId: string, limit = 50): Promise<UserCorrectionLog[]> {
  const rows = await prismaClient().userCorrection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return rows.map(userCorrectionFromRow);
}

export async function buildProgressSummaryFromPrisma(userId: string, days: string[]): Promise<ProgressSummary> {
  const firstDay = days[0] ?? dateOnly(new Date());
  const lastDay = days[days.length - 1] ?? firstDay;
  const [entries, weightEntries] = await Promise.all([
    prismaClient().diaryEntry.findMany({
      where: {
        userId,
        date: {
          gte: toDateOnly(firstDay),
          lte: toDateOnly(lastDay)
        }
      }
    }),
    prismaClient().weightEntry.findMany({
      where: { userId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 30
    })
  ]);

  const entriesByDate = new Map<string, DiaryEntry[]>();
  for (const row of entries) {
    const entry = diaryEntryFromColumns(row);
    const current = entriesByDate.get(entry.date) ?? [];
    current.push(entry);
    entriesByDate.set(entry.date, current);
  }

  const dailyCalories = days.map((date) => {
    const totals = addMacros((entriesByDate.get(date) ?? []).map((entry) => entry.macros));
    return {
      date,
      calories: totals.calories,
      proteinG: totals.proteinG
    };
  });
  const loggedDays = dailyCalories.filter((day) => day.calories > 0).length;
  const mappedWeights = weightEntries.map(weightEntryFromRow).sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight = [...mappedWeights].sort((a, b) => b.date.localeCompare(a.date))[0];

  return {
    calories7DayAverage: Math.round((dailyCalories.reduce((sum, day) => sum + day.calories, 0) / Math.max(days.length, 1)) * 10) / 10,
    protein7DayAverage: Math.round((dailyCalories.reduce((sum, day) => sum + day.proteinG, 0) / Math.max(days.length, 1)) * 10) / 10,
    loggedDaysLast7: loggedDays,
    weightEntries: mappedWeights,
    latestWeightKg: latestWeight?.weightKg ?? null,
    dailyCalories
  };
}

export async function revokeAuthSessionInPrisma(session: AuthSession): Promise<void> {
  await prismaClient().authSession.updateMany({
    where: {
      userId: session.userId,
      tokenHash: session.tokenHash
    },
    data: {
      revokedAt: toNullableDate(session.revokedAt) ?? new Date()
    }
  });
}

export async function revokeAuthSessionTokenHashInPrisma(tokenHash: string): Promise<boolean> {
  const result = await prismaClient().authSession.updateMany({
    where: {
      tokenHash,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
  return result.count > 0;
}

export async function listAiUsageEventsFromPrisma(userId: string): Promise<AiUsageEvent[]> {
  const events = await prismaClient().aIUsageEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });
  return events.map(aiUsageEventFromRow);
}

export async function createAiUsageEventInPrisma(event: AiUsageEvent): Promise<void> {
  await prismaClient().aIUsageEvent.create({
    data: aiUsageEventCreateData(event)
  });
}

async function reserveAiUsageEventOnceInPrisma(
  input: PrismaAiUsageReservationInput
): Promise<PrismaAiUsageReservationResult> {
  const client = prismaClient();
  return client.$transaction(async (tx) => {
    const usedInWindowRows = await tx.aIUsageEvent.findMany({
      where: {
        userId: input.userId,
        endpoint: input.endpoint,
        status: { not: "blocked" },
        createdAt: { gte: toDate(input.windowStartIso) }
      },
      orderBy: { createdAt: "asc" }
    });

    if (usedInWindowRows.length >= input.endpointLimit) {
      const event: AiUsageEvent = {
        id: input.eventId,
        userId: input.userId,
        endpoint: input.endpoint,
        inputType: input.inputType,
        model: "blocked",
        promptVersion: "rate-limit",
        status: "blocked",
        usedFallback: null,
        costUnits: 0,
        reason: "endpoint_rate_limit",
        createdAt: input.createdAtIso
      };
      await tx.aIUsageEvent.create({ data: aiUsageEventCreateData(event) });
      return {
        allowed: false,
        event,
        reason: "endpoint_rate_limit",
        usedInWindowEvents: usedInWindowRows.map(aiUsageEventFromRow)
      };
    }

    const usedToday = await tx.aIUsageEvent.aggregate({
      _sum: { costUnits: true },
      where: {
        userId: input.userId,
        status: { not: "blocked" },
        createdAt: { gte: toDate(input.dayStartIso) }
      }
    });
    const usedTodayUnits = usedToday._sum.costUnits ?? 0;

    if (usedTodayUnits + input.costUnits > input.dailyBudgetUnits) {
      const event: AiUsageEvent = {
        id: input.eventId,
        userId: input.userId,
        endpoint: input.endpoint,
        inputType: input.inputType,
        model: "blocked",
        promptVersion: "rate-limit",
        status: "blocked",
        usedFallback: null,
        costUnits: 0,
        reason: "daily_budget",
        createdAt: input.createdAtIso
      };
      await tx.aIUsageEvent.create({ data: aiUsageEventCreateData(event) });
      return {
        allowed: false,
        event,
        reason: "daily_budget",
        usedTodayUnits
      };
    }

    const event: AiUsageEvent = {
      id: input.eventId,
      userId: input.userId,
      endpoint: input.endpoint,
      inputType: input.inputType,
      model: "pending",
      promptVersion: "pending",
      status: "accepted",
      usedFallback: null,
      costUnits: input.costUnits,
      reason: null,
      createdAt: input.createdAtIso
    };
    await tx.aIUsageEvent.create({ data: aiUsageEventCreateData(event) });
    return { allowed: true, event };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5_000,
    timeout: 10_000
  });
}

export async function reserveAiUsageEventInPrisma(
  input: PrismaAiUsageReservationInput
): Promise<PrismaAiUsageReservationResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await reserveAiUsageEventOnceInPrisma(input);
    } catch (error) {
      if (attempt === 2 || !isRetryableTransactionError(error)) {
        throw error;
      }
    }
  }
  return reserveAiUsageEventOnceInPrisma(input);
}

export async function updateAiUsageEventInPrisma(
  eventId: string,
  patch: Pick<AiUsageEvent, "model" | "promptVersion" | "status" | "usedFallback" | "reason">
): Promise<void> {
  await prismaClient().aIUsageEvent.updateMany({
    where: { id: eventId },
    data: patch
  });
}

export async function disconnectPrismaStore(): Promise<void> {
  await prisma?.$disconnect();
  prisma = null;
}
