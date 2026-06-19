import type { FastifyInstance } from "fastify";
import { CreateWeightEntryRequestSchema, type ProgressSummary, type WeightEntry } from "@macro/shared";
import { env } from "../lib/env";
import { createId, nowIso, parseBody, sendZodError } from "../lib/http";
import { buildProgressSummaryFromPrisma, persistUserStateInPrisma } from "../lib/prismaStore";
import { saveStore, store, totalsForEntries } from "../lib/store";
import { resolveUserIdFromAuthHeaderAsync } from "../modules/auth/service";

function isoDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function buildProgressSummary(userId: string): ProgressSummary {
  const days = Array.from({ length: 7 }, (_item, index) => isoDaysAgo(6 - index));
  const dailyCalories = days.map((date) => {
    const totals = totalsForEntries(store.diaryEntries.filter((entry) => entry.userId === userId && entry.date === date));
    return {
      date,
      calories: totals.calories,
      proteinG: totals.proteinG
    };
  });
  const loggedDays = dailyCalories.filter((day) => day.calories > 0).length;
  const userWeightEntries = store.weightEntries.filter((entry) => entry.userId === userId);
  const latestWeight = [...userWeightEntries].sort((a, b) => b.date.localeCompare(a.date))[0];

  return {
    calories7DayAverage: Math.round((dailyCalories.reduce((sum, day) => sum + day.calories, 0) / 7) * 10) / 10,
    protein7DayAverage: Math.round((dailyCalories.reduce((sum, day) => sum + day.proteinG, 0) / 7) * 10) / 10,
    loggedDaysLast7: loggedDays,
    weightEntries: [...userWeightEntries].sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
    latestWeightKg: latestWeight?.weightKg ?? null,
    dailyCalories
  };
}

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

async function persistWeightEntry(userId: string, entry: WeightEntry): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await persistUserStateInPrisma({
      userId,
      user: store.authUsers.find((user) => user.id === userId),
      weightEntry: entry
    });
    return;
  }

  saveStore();
}

async function getProgressSummary(userId: string): Promise<ProgressSummary> {
  if (shouldPersistDirectlyToPrisma()) {
    const days = Array.from({ length: 7 }, (_item, index) => isoDaysAgo(6 - index));
    return buildProgressSummaryFromPrisma(userId, days);
  }
  return buildProgressSummary(userId);
}

export async function registerProgressRoutes(app: FastifyInstance) {
  app.get("/progress/summary", async (request) => getProgressSummary(await resolveUserIdFromAuthHeaderAsync(request.headers.authorization)));

  app.post("/progress/weight", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(CreateWeightEntryRequestSchema, request.body);
      const previousWeightEntries = store.weightEntries.map((entry) => ({ ...entry }));
      const entry: WeightEntry = {
        id: createId("weight"),
        userId,
        date: input.date,
        weightKg: input.weightKg,
        createdAt: nowIso()
      };
      store.weightEntries.push(entry);
      try {
        await persistWeightEntry(userId, entry);
      } catch (error) {
        store.weightEntries = previousWeightEntries;
        throw error;
      }
      return entry;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });
}
