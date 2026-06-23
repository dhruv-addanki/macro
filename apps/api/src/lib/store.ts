import {
  addMacros,
  EMPTY_MACROS,
  macrosFromPer100g,
  type AIEstimateLog,
  type AuthUser,
  type DiaryEntry,
  type FoodItem,
  type MealGroup,
  type MealPhoto,
  type NutritionGoal,
  type Recipe,
  type ServingUnit,
  type UserCorrectionLog,
  type UserProfile,
  type WeightEntry
} from "@macro/shared";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "./env";
import { createId, nowIso } from "./http";
import { disconnectPrismaStore, ensurePrismaReferenceData } from "./prismaStore";

export const DEMO_USER_ID = "user_demo";

export type StoredNutritionGoal = NutritionGoal & {
  userId: string;
};

export type Store = {
  authUsers: AuthUser[];
  authSessions: AuthSession[];
  profile: UserProfile;
  profiles: UserProfile[];
  goals: StoredNutritionGoal[];
  mealGroups: MealGroup[];
  foods: FoodItem[];
  diaryEntries: DiaryEntry[];
  favoriteFoodIds: Set<string>;
  savedMeals: SavedMeal[];
  recipes: Recipe[];
  weightEntries: WeightEntry[];
  mealPhotos: MealPhoto[];
  aiEstimates: AIEstimateLog[];
  userCorrections: UserCorrectionLog[];
  aiUsageEvents: AiUsageEvent[];
  analyticsEvents: AnalyticsEvent[];
};

export type AuthSession = {
  tokenHash: string;
  token?: string;
  userId: string;
  createdAt: string;
  revokedAt?: string | null;
};

export type AiUsageEvent = {
  id: string;
  userId: string;
  endpoint: string;
  inputType: "text" | "photo" | "correction" | "saved_meal_match";
  model: string;
  promptVersion: string;
  status: "accepted" | "blocked" | "failed";
  usedFallback: boolean | null;
  costUnits: number;
  reason?: string | null;
  createdAt: string;
};

export type AnalyticsEvent = {
  id: string;
  userId: string;
  eventType:
    | "food_logged"
    | "ai_estimate_logged"
    | "ai_correction_applied"
    | "barcode_lookup"
    | "scan_failure"
    | "saved_meal_logged"
    | "recipe_logged";
  status?: "success" | "failed" | null;
  sourceType?: DiaryEntry["sourceType"] | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type SavedMeal = {
  id: string;
  userId: string;
  name: string;
  entries: DiaryEntry[];
  totals: DiaryEntry["macros"];
  createdAt: string;
  updatedAt: string;
};

type PersistedStore = Omit<Store, "favoriteFoodIds"> & {
  favoriteFoodIds: string[];
};

function createDefaultProfile(userId: string, displayName = "Macro User"): UserProfile {
  return {
    id: `profile_${userId}`,
    userId,
    displayName,
    onboardingCompleted: false,
    goalType: "maintain",
    activityLevel: "moderate",
    unitSystem: "imperial",
    heightCm: 178,
    weightKg: 82
  };
}

function createDefaultGoal(userId: string): StoredNutritionGoal {
  return {
    id: `goal_${userId}`,
    userId,
    calories: 2400,
    proteinG: 180,
    carbsG: 250,
    fatG: 70,
    sugarG: 50,
    fiberG: 30,
    sodiumMg: 2300,
    effectiveFrom: "2026-01-01"
  };
}

function createDefaultMealGroups(userId: string): MealGroup[] {
  return [
    { id: `meal_breakfast_${userId}`, userId, name: "Breakfast", sortOrder: 1, isDefault: true },
    { id: `meal_lunch_${userId}`, userId, name: "Lunch", sortOrder: 2, isDefault: true },
    { id: `meal_dinner_${userId}`, userId, name: "Dinner", sortOrder: 3, isDefault: true },
    { id: `meal_snacks_${userId}`, userId, name: "Snacks", sortOrder: 4, isDefault: true }
  ];
}

const seededFoods: FoodItem[] = [
  {
    id: "food_chicken_breast",
    sourceType: "generic",
    name: "Chicken breast, cooked",
    brand: null,
    verified: true,
    per100g: { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, sugarG: 0, fiberG: 0, sodiumMg: 74 },
    servingUnits: [
      {
        id: "unit_chicken_100g",
        foodItemId: "food_chicken_breast",
        unitName: "100 g",
        gramsPerUnit: 100,
        source: "database",
        confidence: "high"
      },
      {
        id: "unit_chicken_filet",
        foodItemId: "food_chicken_breast",
        unitName: "1 breast filet",
        gramsPerUnit: 170,
        source: "estimated",
        confidence: "medium",
        notes: "Average cooked chicken breast filet."
      },
      {
        id: "unit_chicken_cup",
        foodItemId: "food_chicken_breast",
        unitName: "1 cup chopped",
        gramsPerUnit: 140,
        source: "estimated",
        confidence: "medium"
      }
    ]
  },
  {
    id: "food_cooked_rice",
    sourceType: "generic",
    name: "White rice, cooked",
    brand: null,
    verified: true,
    per100g: { calories: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3, sugarG: 0.1, fiberG: 0.4, sodiumMg: 1 },
    servingUnits: [
      {
        id: "unit_rice_cup",
        foodItemId: "food_cooked_rice",
        unitName: "1 cup cooked",
        gramsPerUnit: 158,
        source: "database",
        confidence: "high"
      }
    ]
  },
  {
    id: "food_lentils_cooked",
    sourceType: "generic",
    name: "Lentils, cooked",
    brand: null,
    verified: true,
    per100g: { calories: 116, proteinG: 9, carbsG: 20, fatG: 0.4, sugarG: 1.6, fiberG: 7.9, sodiumMg: 2 },
    servingUnits: [
      {
        id: "unit_lentils_cup",
        foodItemId: "food_lentils_cooked",
        unitName: "1 cup cooked",
        gramsPerUnit: 198,
        source: "database",
        confidence: "high"
      }
    ]
  },
  {
    id: "food_roti",
    sourceType: "generic",
    name: "Roti / chapati",
    brand: null,
    verified: false,
    per100g: { calories: 300, proteinG: 9, carbsG: 46, fatG: 9, sugarG: 3, fiberG: 7, sodiumMg: 300 },
    servingUnits: [
      {
        id: "unit_roti_piece",
        foodItemId: "food_roti",
        unitName: "1 medium roti",
        gramsPerUnit: 45,
        source: "estimated",
        confidence: "medium"
      }
    ]
  },
  {
    id: "food_paneer",
    sourceType: "generic",
    name: "Paneer",
    brand: null,
    verified: false,
    per100g: { calories: 296, proteinG: 18, carbsG: 4, fatG: 23, sugarG: 2.6, fiberG: 0, sodiumMg: 22 },
    servingUnits: [
      {
        id: "unit_paneer_100g",
        foodItemId: "food_paneer",
        unitName: "100 g",
        gramsPerUnit: 100,
        source: "database",
        confidence: "medium"
      }
    ]
  }
];

const initialStore: Store = {
  authUsers: [
    {
      id: DEMO_USER_ID,
      email: "demo@macro.local",
      displayName: "Demo User",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: null
    }
  ],
  authSessions: [],
  profile: {
    id: "profile_demo",
    userId: DEMO_USER_ID,
    displayName: "Demo User",
    onboardingCompleted: false,
    goalType: "maintain",
    activityLevel: "moderate",
    unitSystem: "imperial",
    heightCm: 178,
    weightKg: 82
  },
  profiles: [
    {
      id: "profile_demo",
      userId: DEMO_USER_ID,
      displayName: "Demo User",
      onboardingCompleted: false,
      goalType: "maintain",
      activityLevel: "moderate",
      unitSystem: "imperial",
      heightCm: 178,
      weightKg: 82
    }
  ],
  goals: [
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
  ],
  mealGroups: [
    { id: "meal_breakfast", userId: DEMO_USER_ID, name: "Breakfast", sortOrder: 1, isDefault: true },
    { id: "meal_lunch", userId: DEMO_USER_ID, name: "Lunch", sortOrder: 2, isDefault: true },
    { id: "meal_dinner", userId: DEMO_USER_ID, name: "Dinner", sortOrder: 3, isDefault: true },
    { id: "meal_snacks", userId: DEMO_USER_ID, name: "Snacks", sortOrder: 4, isDefault: true }
  ],
  foods: seededFoods,
  diaryEntries: [],
  favoriteFoodIds: new Set(["food_chicken_breast"]),
  savedMeals: [],
  recipes: [],
  weightEntries: [],
  mealPhotos: [],
  aiEstimates: [],
  userCorrections: [],
  aiUsageEvents: [],
  analyticsEvents: []
};

const dataFile = process.env.MACRO_DATA_FILE ?? resolve(process.cwd(), "../../.macro-data/dev-store.json");

export function serializeStore(value: Store): PersistedStore {
  return {
    ...value,
    authSessions: value.authSessions.map(({ token: _token, ...session }) => session),
    favoriteFoodIds: [...value.favoriteFoodIds]
  };
}

export function deserializeStore(value: Partial<PersistedStore>): Store {
  const storedFoods = value.foods ?? [];
  const foodById = new Map<string, FoodItem>();
  for (const food of seededFoods) foodById.set(food.id, food);
  for (const food of storedFoods) foodById.set(food.id, food);
  const profile = {
    ...initialStore.profile,
    ...(value.profile ?? {}),
    onboardingCompleted: value.profile?.onboardingCompleted ?? false
  };
  const profiles = value.profiles?.length ? value.profiles : [profile];
  const goals = (value.goals?.length ? value.goals : initialStore.goals).map((goal) => ({
    ...goal,
    userId: goal.userId ?? DEMO_USER_ID
  }));

  return {
    authUsers: value.authUsers?.length ? value.authUsers : initialStore.authUsers,
    authSessions: value.authSessions ?? [],
    profile,
    profiles,
    goals,
    mealGroups: value.mealGroups?.length ? value.mealGroups : initialStore.mealGroups,
    foods: [...foodById.values()],
    diaryEntries: value.diaryEntries ?? [],
    favoriteFoodIds: new Set(value.favoriteFoodIds !== undefined ? value.favoriteFoodIds : [...initialStore.favoriteFoodIds]),
    savedMeals: value.savedMeals ?? [],
    recipes: value.recipes ?? [],
    weightEntries: value.weightEntries ?? [],
    mealPhotos: value.mealPhotos ?? [],
    aiEstimates: value.aiEstimates ?? [],
    userCorrections: value.userCorrections ?? [],
    aiUsageEvents: value.aiUsageEvents ?? [],
    analyticsEvents: value.analyticsEvents ?? []
  };
}

function loadStore(): Store {
  if (process.env.NODE_ENV === "test" || !existsSync(dataFile)) {
    return deserializeStore({});
  }

  try {
    return deserializeStore(JSON.parse(readFileSync(dataFile, "utf8")) as Partial<PersistedStore>);
  } catch {
    return deserializeStore({});
  }
}

export const store: Store = loadStore();

let prismaPersistenceError: string | null = null;

function snapshotStore(): Store {
  return deserializeStore(JSON.parse(JSON.stringify(serializeStore(store))) as Partial<PersistedStore>);
}

function prismaBootstrapStore(): Store {
  const snapshot = snapshotStore();
  if (env.seedDemoUser) return snapshot;

  snapshot.authUsers = snapshot.authUsers.filter((user) => user.id !== DEMO_USER_ID);
  snapshot.authSessions = snapshot.authSessions.filter((session) => session.userId !== DEMO_USER_ID);
  snapshot.profiles = snapshot.profiles.filter((profile) => profile.userId !== DEMO_USER_ID);
  snapshot.goals = snapshot.goals.filter((goal) => goal.userId !== DEMO_USER_ID);
  snapshot.mealGroups = snapshot.mealGroups.filter((mealGroup) => mealGroup.userId !== DEMO_USER_ID);
  snapshot.foods = snapshot.foods.filter((food) => food.ownerUserId !== DEMO_USER_ID);
  snapshot.favoriteFoodIds = new Set(
    [...snapshot.favoriteFoodIds].filter((key) => key.includes(":") && !key.startsWith(`${DEMO_USER_ID}:`))
  );
  return snapshot;
}

export async function initializeStorePersistence(): Promise<void> {
  if (process.env.NODE_ENV === "test" || env.storeDriver !== "prisma") {
    return;
  }
  try {
    await ensurePrismaReferenceData(prismaBootstrapStore());
    prismaPersistenceError = null;
  } catch (error) {
    prismaPersistenceError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

export async function flushStorePersistence(): Promise<void> {
  return Promise.resolve();
}

export async function closeStorePersistence(): Promise<void> {
  await flushStorePersistence();
  await disconnectPrismaStore();
}

export function getStorePersistenceStatus() {
  return {
    driver: env.storeDriver,
    pending: false,
    lastError: prismaPersistenceError
  };
}

export function saveStore(): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  if (env.storeDriver === "prisma") {
    throw new Error("saveStore() is disabled in Prisma mode. Use a direct Prisma persistence helper for this mutation.");
  }
  mkdirSync(dirname(dataFile), { recursive: true });
  writeFileSync(dataFile, `${JSON.stringify(serializeStore(store), null, 2)}\n`);
}

export function ensureUserState(userId = DEMO_USER_ID, displayName?: string): void {
  let profile = store.profiles.find((candidate) => candidate.userId === userId);
  if (!profile) {
    profile = createDefaultProfile(userId, displayName);
    store.profiles.push(profile);
  } else if (displayName && profile.displayName === "Macro User") {
    profile.displayName = displayName;
  }

  if (!store.goals.some((goal) => goal.userId === userId)) {
    store.goals.push(createDefaultGoal(userId));
  }

  if (!store.mealGroups.some((mealGroup) => mealGroup.userId === userId)) {
    store.mealGroups.push(...createDefaultMealGroups(userId));
  }

  if (userId === DEMO_USER_ID) {
    store.profile = profile;
  }
}

export function getProfile(userId = DEMO_USER_ID): UserProfile {
  ensureUserState(userId);
  return store.profiles.find((candidate) => candidate.userId === userId) ?? store.profile;
}

export function setProfile(userId: string, profile: UserProfile): UserProfile {
  const index = store.profiles.findIndex((candidate) => candidate.userId === userId);
  if (index >= 0) {
    store.profiles[index] = profile;
  } else {
    store.profiles.push(profile);
  }
  if (userId === DEMO_USER_ID) {
    store.profile = profile;
  }
  return profile;
}

export function getLatestGoal(userId = DEMO_USER_ID): StoredNutritionGoal {
  ensureUserState(userId);
  const userGoals = store.goals.filter((goal) => goal.userId === userId);
  return userGoals[userGoals.length - 1] ?? createDefaultGoal(userId);
}

export function getMealGroups(userId = DEMO_USER_ID): MealGroup[] {
  ensureUserState(userId);
  return store.mealGroups
    .filter((mealGroup) => mealGroup.userId === userId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function nextMealGroupSortOrder(userId: string): number {
  return Math.max(0, ...getMealGroups(userId).map((mealGroup) => mealGroup.sortOrder)) + 1;
}

function normalizeMealGroupName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function createMealGroup(userId: string, name: string): MealGroup {
  ensureUserState(userId);
  const mealGroup: MealGroup = {
    id: createId("meal"),
    userId,
    name: normalizeMealGroupName(name),
    sortOrder: nextMealGroupSortOrder(userId),
    isDefault: false
  };
  store.mealGroups.push(mealGroup);
  return mealGroup;
}

export function updateMealGroup(
  userId: string,
  id: string,
  input: { name?: string; sortOrder?: number }
): MealGroup | undefined {
  ensureUserState(userId);
  const index = store.mealGroups.findIndex((mealGroup) => mealGroup.userId === userId && mealGroup.id === id);
  if (index < 0) return undefined;
  const current = store.mealGroups[index]!;
  const updated: MealGroup = {
    ...current,
    name: input.name !== undefined ? normalizeMealGroupName(input.name) : current.name,
    sortOrder: input.sortOrder ?? current.sortOrder
  };
  store.mealGroups[index] = updated;
  return updated;
}

export function reorderMealGroups(userId: string, orderedIds: string[]): MealGroup[] | undefined {
  ensureUserState(userId);
  const current = getMealGroups(userId);
  const currentIds = new Set(current.map((mealGroup) => mealGroup.id));
  const requestedIds = new Set(orderedIds);
  if (currentIds.size !== requestedIds.size || orderedIds.length !== current.length) return undefined;
  if (orderedIds.some((id) => !currentIds.has(id))) return undefined;

  const sortById = new Map(orderedIds.map((id, index) => [id, index + 1]));
  store.mealGroups = store.mealGroups.map((mealGroup) =>
    mealGroup.userId === userId
      ? { ...mealGroup, sortOrder: sortById.get(mealGroup.id) ?? mealGroup.sortOrder }
      : mealGroup
  );
  return getMealGroups(userId);
}

export function deleteMealGroup(userId: string, id: string): { ok: true } | { ok: false; reason: "not_found" | "default" | "has_entries" } {
  ensureUserState(userId);
  const mealGroup = store.mealGroups.find((candidate) => candidate.userId === userId && candidate.id === id);
  if (!mealGroup) return { ok: false, reason: "not_found" };
  if (mealGroup.isDefault) return { ok: false, reason: "default" };
  if (store.diaryEntries.some((entry) => entry.userId === userId && entry.mealGroupId === id)) {
    return { ok: false, reason: "has_entries" };
  }
  store.mealGroups = store.mealGroups.filter((candidate) => candidate.id !== id);
  return { ok: true };
}

export function findMealGroup(userId: string, id: string): MealGroup | undefined {
  return getMealGroups(userId).find((mealGroup) => mealGroup.id === id);
}

export function getMealGroupOrDefault(userId = DEMO_USER_ID, id?: string): MealGroup {
  const mealGroups = getMealGroups(userId);
  const requested = id ? findMealGroup(userId, id) : undefined;
  return requested ?? mealGroups.find((mealGroup) => mealGroup.name === "Lunch") ?? mealGroups[0]!;
}

export function createEntryFromFood(params: {
  userId?: string;
  date: string;
  mealGroupId: string;
  food: FoodItem;
  quantity: number;
  servingUnit: ServingUnit;
  sourceType?: DiaryEntry["sourceType"];
}): DiaryEntry {
  const grams = params.quantity * params.servingUnit.gramsPerUnit;
  const now = nowIso();
  return {
    id: createId("entry"),
    userId: params.userId ?? DEMO_USER_ID,
    date: params.date,
    mealGroupId: params.mealGroupId,
    foodItemId: params.food.id,
    displayName: params.food.name,
    quantity: params.quantity,
    unit: params.servingUnit.unitName,
    grams,
    macros: macrosFromPer100g(params.food.per100g, grams),
    sourceType: params.sourceType ?? "manual",
    confidence: params.food.verified ? "high" : "medium",
    assumptions: [],
    createdAt: now,
    updatedAt: now
  };
}

export function totalsForEntries(entries: DiaryEntry[]) {
  return addMacros(entries.map((entry) => entry.macros));
}

export function remainingMacros(goal: NutritionGoal, totals = EMPTY_MACROS) {
  return {
    calories: Math.max(0, goal.calories - totals.calories),
    proteinG: Math.max(0, goal.proteinG - totals.proteinG),
    carbsG: Math.max(0, goal.carbsG - totals.carbsG),
    fatG: Math.max(0, goal.fatG - totals.fatG),
    sugarG: Math.max(0, (goal.sugarG ?? 0) - (totals.sugarG ?? 0)),
    fiberG: Math.max(0, goal.fiberG - totals.fiberG),
    sodiumMg: Math.max(0, goal.sodiumMg - totals.sodiumMg)
  };
}
