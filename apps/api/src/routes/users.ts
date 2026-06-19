import type { FastifyInstance, FastifyReply } from "fastify";
import {
  CompleteOnboardingRequestSchema,
  CreateMealGroupRequestSchema,
  ReorderMealGroupsRequestSchema,
  UpdateGoalRequestSchema,
  UpdateMealGroupRequestSchema,
  UpdateProfileRequestSchema,
  type CompleteOnboardingRequest,
  type MacroNutrients,
  type MealGroup,
  type UserProfile,
  type WeightEntry
} from "@macro/shared";
import { env } from "../lib/env";
import { createId, nowIso, parseBody, sendZodError, todayIso } from "../lib/http";
import {
  deleteMealGroupFromPrisma,
  persistMealGroupsForUserInPrisma,
  persistUserStateInPrisma,
  readUserStateFromPrisma
} from "../lib/prismaStore";
import {
  createMealGroup,
  deleteMealGroup,
  getLatestGoal,
  getMealGroups,
  getProfile,
  reorderMealGroups,
  saveStore,
  setProfile,
  store,
  updateMealGroup,
  type Store,
  type StoredNutritionGoal
} from "../lib/store";
import { resolveUserIdFromAuthHeaderAsync } from "../modules/auth/service";

type UserMutationSnapshot = Pick<Store, "profile" | "profiles" | "goals" | "mealGroups" | "weightEntries">;

function meResponse(userId: string) {
  const profile = getProfile(userId);
  return {
    id: userId,
    displayName: profile.displayName,
    profile,
    goal: getLatestGoal(userId),
    mealGroups: getMealGroups(userId)
  };
}

async function meResponseForUser(userId: string) {
  if (!shouldPersistDirectlyToPrisma()) {
    return meResponse(userId);
  }
  const state = await readUserStateFromPrisma(userId);
  const profile = state.profile ?? getProfile(userId);
  return {
    id: userId,
    displayName: state.user?.displayName ?? profile.displayName,
    profile,
    goal: state.goal ?? getLatestGoal(userId),
    mealGroups: state.mealGroups.length ? state.mealGroups : getMealGroups(userId)
  };
}

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}

async function profileForMutation(userId: string): Promise<UserProfile> {
  if (!shouldPersistDirectlyToPrisma()) {
    return getProfile(userId);
  }
  const state = await readUserStateFromPrisma(userId);
  return state.profile ?? getProfile(userId);
}

async function goalForMutation(userId: string): Promise<StoredNutritionGoal> {
  if (!shouldPersistDirectlyToPrisma()) {
    return getLatestGoal(userId);
  }
  const state = await readUserStateFromPrisma(userId);
  return state.goal ?? getLatestGoal(userId);
}

async function mealGroupsForMutation(userId: string): Promise<MealGroup[]> {
  if (!shouldPersistDirectlyToPrisma()) {
    return getMealGroups(userId);
  }
  const state = await readUserStateFromPrisma(userId);
  return state.mealGroups.length ? state.mealGroups : getMealGroups(userId);
}

function normalizeMealGroupName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function nextSortOrder(mealGroups: MealGroup[]): number {
  return Math.max(0, ...mealGroups.map((mealGroup) => mealGroup.sortOrder)) + 1;
}

function calculateOnboardingGoal(profile: UserProfile, input: CompleteOnboardingRequest): MacroNutrients {
  const weightKg = input.weightKg ?? profile.weightKg ?? 82;
  const activityCaloriesPerKg = input.activityLevel === "low" ? 28 : input.activityLevel === "high" ? 34 : 31;
  const goalAdjustment = input.goalType === "cut" ? -450 : input.goalType === "bulk" ? 300 : 0;
  const calculatedCalories = Math.max(1400, roundTo(weightKg * activityCaloriesPerKg + goalAdjustment, 25));
  const calories = input.calorieTargetMode === "manual" && input.calories ? input.calories : calculatedCalories;

  if (
    input.macroPreference === "custom" &&
    input.proteinG !== undefined &&
    input.carbsG !== undefined &&
    input.fatG !== undefined
  ) {
    return {
      calories,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      sugarG: 50,
      fiberG: calories >= 2200 ? 30 : 25,
      sodiumMg: 2300
    };
  }

  const proteinMultiplier = input.macroPreference === "high_protein" ? 2.2 : 1.6;
  const proteinG = Math.round(weightKg * proteinMultiplier);
  const fatRatio = input.macroPreference === "high_protein" ? 0.25 : 0.3;
  const fatG = Math.round((calories * fatRatio) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  return {
    calories,
    proteinG,
    carbsG,
    fatG,
    sugarG: 50,
    fiberG: calories >= 2200 ? 30 : 25,
    sodiumMg: 2300
  };
}

function captureUserMutationSnapshot(): UserMutationSnapshot {
  return {
    profile: { ...store.profile },
    profiles: store.profiles.map((profile) => ({ ...profile })),
    goals: store.goals.map((goal) => ({ ...goal })),
    mealGroups: store.mealGroups.map((mealGroup) => ({ ...mealGroup })),
    weightEntries: store.weightEntries.map((entry) => ({ ...entry }))
  };
}

function restoreUserMutationSnapshot(snapshot: UserMutationSnapshot): void {
  store.profile = snapshot.profile;
  store.profiles = snapshot.profiles;
  store.goals = snapshot.goals;
  store.mealGroups = snapshot.mealGroups;
  store.weightEntries = snapshot.weightEntries;
}

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

async function persistUserMutation(input: {
  userId: string;
  profile?: UserProfile;
  goal?: StoredNutritionGoal;
  weightEntry?: WeightEntry;
}): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await persistUserStateInPrisma({
      userId: input.userId,
      user: store.authUsers.find((user) => user.id === input.userId),
      profile: input.profile,
      goal: input.goal,
      weightEntry: input.weightEntry
    });
    return;
  }

  saveStore();
}

async function persistMealGroupsMutation(userId: string, mealGroups: MealGroup[]): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await persistMealGroupsForUserInPrisma({
      userId,
      user: store.authUsers.find((user) => user.id === userId),
      mealGroups
    });
    return;
  }
  saveStore();
}

function mealGroupDeleteError(
  reply: FastifyReply,
  reason: "not_found" | "default" | "has_entries"
) {
  if (reason === "not_found") {
    return reply.status(404).send({ error: "meal_group_not_found", message: "Meal group not found." });
  }
  if (reason === "default") {
    return reply.status(400).send({ error: "default_meal_group", message: "Default meal groups cannot be deleted." });
  }
  return reply.status(400).send({
    error: "meal_group_has_entries",
    message: "Move or delete existing entries before deleting this meal group."
  });
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/me", async (request) => meResponseForUser(await resolveUserIdFromAuthHeaderAsync(request.headers.authorization)));

  app.patch("/me/profile", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(UpdateProfileRequestSchema, request.body);
      const currentProfile = await profileForMutation(userId);
      const snapshot = captureUserMutationSnapshot();
      const profile = setProfile(userId, {
        ...currentProfile,
        ...input
      });
      try {
        await persistUserMutation({ userId, profile });
      } catch (error) {
        restoreUserMutationSnapshot(snapshot);
        throw error;
      }
      return profile;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.patch("/me/goal", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(UpdateGoalRequestSchema, request.body);
      const current = await goalForMutation(userId);
      const snapshot = captureUserMutationSnapshot();
      const goal: StoredNutritionGoal = {
        ...current,
        ...input,
        id: createId("goal"),
        userId,
        effectiveFrom: nowIso().slice(0, 10)
      };
      store.goals.push(goal);
      try {
        await persistUserMutation({ userId, goal });
      } catch (error) {
        restoreUserMutationSnapshot(snapshot);
        throw error;
      }
      return goal;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/me/meal-groups", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(CreateMealGroupRequestSchema, request.body);
      if (shouldPersistDirectlyToPrisma()) {
        const current = await mealGroupsForMutation(userId);
        const mealGroup: MealGroup = {
          id: createId("meal"),
          userId,
          name: normalizeMealGroupName(input.name),
          sortOrder: nextSortOrder(current),
          isDefault: false
        };
        await persistMealGroupsMutation(userId, [...current, mealGroup]);
        return mealGroup;
      }

      const snapshot = captureUserMutationSnapshot();
      const mealGroup = createMealGroup(userId, input.name);
      try {
        await persistMealGroupsMutation(userId, getMealGroups(userId));
      } catch (error) {
        restoreUserMutationSnapshot(snapshot);
        throw error;
      }
      return mealGroup;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.patch("/me/meal-groups/:id", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const { id } = request.params as { id: string };
      const input = parseBody(UpdateMealGroupRequestSchema, request.body);

      if (shouldPersistDirectlyToPrisma()) {
        const current = await mealGroupsForMutation(userId);
        const target = current.find((mealGroup) => mealGroup.id === id);
        if (!target) {
          return reply.status(404).send({ error: "meal_group_not_found", message: "Meal group not found." });
        }
        const updated: MealGroup = {
          ...target,
          name: input.name !== undefined ? normalizeMealGroupName(input.name) : target.name,
          sortOrder: input.sortOrder ?? target.sortOrder
        };
        await persistMealGroupsMutation(userId, current.map((mealGroup) => (mealGroup.id === id ? updated : mealGroup)));
        return updated;
      }

      const snapshot = captureUserMutationSnapshot();
      const updated = updateMealGroup(userId, id, input);
      if (!updated) {
        restoreUserMutationSnapshot(snapshot);
        return reply.status(404).send({ error: "meal_group_not_found", message: "Meal group not found." });
      }
      try {
        await persistMealGroupsMutation(userId, getMealGroups(userId));
      } catch (error) {
        restoreUserMutationSnapshot(snapshot);
        throw error;
      }
      return updated;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/me/meal-groups/reorder", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(ReorderMealGroupsRequestSchema, request.body);

      if (shouldPersistDirectlyToPrisma()) {
        const current = await mealGroupsForMutation(userId);
        const currentIds = new Set(current.map((mealGroup) => mealGroup.id));
        const requestedIds = new Set(input.orderedIds);
        if (
          input.orderedIds.length !== current.length ||
          requestedIds.size !== currentIds.size ||
          input.orderedIds.some((id) => !currentIds.has(id))
        ) {
          return reply.status(400).send({ error: "invalid_meal_group_order", message: "Ordered IDs must include each meal group exactly once." });
        }
        const sortById = new Map(input.orderedIds.map((id, index) => [id, index + 1]));
        const mealGroups = current.map((mealGroup) => ({
          ...mealGroup,
          sortOrder: sortById.get(mealGroup.id) ?? mealGroup.sortOrder
        }));
        await persistMealGroupsMutation(userId, mealGroups);
        return { mealGroups: mealGroups.sort((a, b) => a.sortOrder - b.sortOrder) };
      }

      const snapshot = captureUserMutationSnapshot();
      const mealGroups = reorderMealGroups(userId, input.orderedIds);
      if (!mealGroups) {
        restoreUserMutationSnapshot(snapshot);
        return reply.status(400).send({ error: "invalid_meal_group_order", message: "Ordered IDs must include each meal group exactly once." });
      }
      try {
        await persistMealGroupsMutation(userId, mealGroups);
      } catch (error) {
        restoreUserMutationSnapshot(snapshot);
        throw error;
      }
      return { mealGroups };
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.delete("/me/meal-groups/:id", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const { id } = request.params as { id: string };

      if (shouldPersistDirectlyToPrisma()) {
        const result = await deleteMealGroupFromPrisma(userId, id);
        if (!result.ok) return mealGroupDeleteError(reply, result.reason);
        const state = await readUserStateFromPrisma(userId);
        return { ok: true, deletedId: id, mealGroups: state.mealGroups };
      }

      const snapshot = captureUserMutationSnapshot();
      const result = deleteMealGroup(userId, id);
      if (!result.ok) {
        restoreUserMutationSnapshot(snapshot);
        return mealGroupDeleteError(reply, result.reason);
      }
      try {
        await persistMealGroupsMutation(userId, getMealGroups(userId));
      } catch (error) {
        restoreUserMutationSnapshot(snapshot);
        throw error;
      }
      return { ok: true, deletedId: id, mealGroups: getMealGroups(userId) };
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/me/onboarding", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(CompleteOnboardingRequestSchema, request.body);
      const currentProfile = await profileForMutation(userId);
      const snapshot = captureUserMutationSnapshot();
      const profile = setProfile(userId, {
        ...currentProfile,
        displayName: input.displayName?.trim() || currentProfile.displayName,
        onboardingCompleted: true,
        birthYear: input.birthYear ?? currentProfile.birthYear,
        sex: input.sex ?? currentProfile.sex,
        heightCm: input.heightCm ?? currentProfile.heightCm,
        weightKg: input.weightKg ?? currentProfile.weightKg,
        targetWeightKg: input.targetWeightKg ?? currentProfile.targetWeightKg,
        goalType: input.goalType,
        activityLevel: input.activityLevel,
        unitSystem: input.unitSystem
      });

      const goal: StoredNutritionGoal = {
        ...calculateOnboardingGoal(currentProfile, input),
        id: createId("goal"),
        userId,
        effectiveFrom: todayIso()
      };
      store.goals.push(goal);

      let weightEntry: WeightEntry | undefined;
      if (input.weightKg) {
        weightEntry = {
          id: createId("weight"),
          userId,
          date: todayIso(),
          weightKg: input.weightKg,
          createdAt: nowIso()
        };
        store.weightEntries.push(weightEntry);
      }

      try {
        await persistUserMutation({ userId, profile, goal, weightEntry });
      } catch (error) {
        restoreUserMutationSnapshot(snapshot);
        throw error;
      }
      return meResponseForUser(userId);
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });
}
