import {
  addMacros,
  type CreateDiaryEntryInput,
  type DiaryDay,
  type DiaryEntry,
  type UpdateDiaryEntryInput
} from "@macro/shared";
import { env } from "../../lib/env";
import { createId, nowIso, todayIso } from "../../lib/http";
import {
  deleteDiaryEntriesFromPrisma,
  persistDiaryEntriesInPrisma,
  readDiaryEntriesByIdsFromPrisma,
  readDiaryStateFromPrisma
} from "../../lib/prismaStore";
import { DEMO_USER_ID, getLatestGoal, getMealGroups, remainingMacros, saveStore, store, totalsForEntries } from "../../lib/store";

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function userAndDate(userIdOrDate?: string, maybeDate?: string): { userId: string; date: string } {
  if (!userIdOrDate) return { userId: DEMO_USER_ID, date: todayIso() };
  if (maybeDate !== undefined) return { userId: userIdOrDate, date: maybeDate };
  return isIsoDate(userIdOrDate) ? { userId: DEMO_USER_ID, date: userIdOrDate } : { userId: userIdOrDate, date: todayIso() };
}

function userAndInput(userIdOrInput: string | CreateDiaryEntryInput, maybeInput?: CreateDiaryEntryInput): {
  userId: string;
  input: CreateDiaryEntryInput;
} {
  if (typeof userIdOrInput === "string") {
    if (!maybeInput) throw new Error("Missing diary entry input");
    return { userId: userIdOrInput, input: maybeInput };
  }
  return { userId: DEMO_USER_ID, input: userIdOrInput };
}

function userAndId(userIdOrId: string, idOrInput?: string | UpdateDiaryEntryInput, maybeInput?: UpdateDiaryEntryInput): {
  userId: string;
  id: string;
  input?: UpdateDiaryEntryInput;
} {
  if (typeof idOrInput === "string") {
    return { userId: userIdOrId, id: idOrInput, input: maybeInput };
  }
  return { userId: DEMO_USER_ID, id: userIdOrId, input: idOrInput };
}

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

async function persistDiaryEntries(entries: DiaryEntry[]): Promise<void> {
  if (entries.length === 0) return;
  if (shouldPersistDirectlyToPrisma()) {
    const userIds = new Set(entries.map((entry) => entry.userId));
    const mealGroupIds = new Set(entries.map((entry) => entry.mealGroupId));
    const foodIds = new Set(entries.map((entry) => entry.foodItemId).filter((id): id is string => Boolean(id)));
    await persistDiaryEntriesInPrisma({
      entries,
      users: store.authUsers.filter((user) => userIds.has(user.id)),
      mealGroups: store.mealGroups.filter((mealGroup) => mealGroupIds.has(mealGroup.id)),
      foods: store.foods.filter((food) => foodIds.has(food.id))
    });
    return;
  }

  saveStore();
}

async function readDiaryEntriesByIds(userId: string, ids: string[]): Promise<DiaryEntry[]> {
  if (ids.length === 0) return [];
  if (shouldPersistDirectlyToPrisma()) {
    return readDiaryEntriesByIdsFromPrisma(userId, ids);
  }
  return ids
    .map((id) => store.diaryEntries.find((entry) => entry.userId === userId && entry.id === id))
    .filter((entry): entry is DiaryEntry => Boolean(entry));
}

async function readDiaryEntriesForDate(userId: string, date: string): Promise<DiaryEntry[]> {
  if (shouldPersistDirectlyToPrisma()) {
    return (await readDiaryStateFromPrisma(userId, date)).entries;
  }
  return store.diaryEntries.filter((entry) => entry.userId === userId && entry.date === date);
}

async function deletePersistedDiaryEntries(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  if (shouldPersistDirectlyToPrisma()) {
    return deleteDiaryEntriesFromPrisma(userId, ids);
  }

  saveStore();
  return ids.length;
}

function buildDiaryDay(userId: string, date: string, entries: DiaryEntry[], options?: {
  goal?: ReturnType<typeof getLatestGoal> | null;
  mealGroups?: ReturnType<typeof getMealGroups>;
}): DiaryDay {
  const goal = options?.goal ?? getLatestGoal(userId);
  const mealGroups = (options?.mealGroups?.length ? options.mealGroups : getMealGroups(userId))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const meals = mealGroups.map((mealGroup) => {
    const mealEntries = entries.filter((entry) => entry.userId === userId && entry.date === date && entry.mealGroupId === mealGroup.id);
    return {
      mealGroup,
      entries: mealEntries,
      totals: totalsForEntries(mealEntries)
    };
  });

  const totals = addMacros(meals.map((meal) => meal.totals));
  return {
    date,
    goal,
    meals,
    totals,
    remaining: remainingMacros(goal, totals)
  };
}

export function getDiary(date?: string): DiaryDay;
export function getDiary(userId: string, date?: string): DiaryDay;
export function getDiary(userIdOrDate?: string, maybeDate?: string): DiaryDay {
  const { userId, date } = userAndDate(userIdOrDate, maybeDate);
  return buildDiaryDay(userId, date, store.diaryEntries);
}

export async function getDiaryForUser(userId: string, date = todayIso()): Promise<DiaryDay> {
  if (!shouldPersistDirectlyToPrisma()) {
    return getDiary(userId, date);
  }
  const state = await readDiaryStateFromPrisma(userId, date);
  return buildDiaryDay(userId, date, state.entries, {
    goal: state.goal,
    mealGroups: state.mealGroups
  });
}

export function createDiaryEntry(input: CreateDiaryEntryInput): Promise<DiaryEntry>;
export function createDiaryEntry(userId: string, input: CreateDiaryEntryInput): Promise<DiaryEntry>;
export async function createDiaryEntry(userIdOrInput: string | CreateDiaryEntryInput, maybeInput?: CreateDiaryEntryInput): Promise<DiaryEntry> {
  const { userId, input } = userAndInput(userIdOrInput, maybeInput);
  const now = nowIso();
  const entry: DiaryEntry = {
    id: createId("entry"),
    userId,
    date: input.date,
    mealGroupId: input.mealGroupId,
    foodItemId: input.foodItemId ?? null,
    displayName: input.displayName,
    quantity: input.quantity,
    unit: input.unit,
    grams: input.grams,
    macros: input.macros,
    sourceType: input.sourceType,
    confidence: input.confidence,
    assumptions: input.assumptions ?? [],
    createdAt: now,
    updatedAt: now
  };
  store.diaryEntries.push(entry);
  try {
    await persistDiaryEntries([entry]);
  } catch (error) {
    store.diaryEntries = store.diaryEntries.filter((candidate) => candidate.id !== entry.id);
    throw error;
  }
  return entry;
}

export function updateDiaryEntry(id: string, input: UpdateDiaryEntryInput): Promise<DiaryEntry | undefined>;
export function updateDiaryEntry(userId: string, id: string, input: UpdateDiaryEntryInput): Promise<DiaryEntry | undefined>;
export async function updateDiaryEntry(
  userIdOrId: string,
  idOrInput: string | UpdateDiaryEntryInput,
  maybeInput?: UpdateDiaryEntryInput
): Promise<DiaryEntry | undefined> {
  const { userId, id, input } = userAndId(userIdOrId, idOrInput, maybeInput);
  if (!input) return undefined;
  const index = store.diaryEntries.findIndex((entry) => entry.userId === userId && entry.id === id);
  const current = index >= 0 ? store.diaryEntries[index]! : (await readDiaryEntriesByIds(userId, [id]))[0];
  if (!current) {
    return undefined;
  }

  const updated: DiaryEntry = {
    ...current,
    ...input,
    foodItemId: input.foodItemId === undefined ? current.foodItemId : input.foodItemId,
    assumptions: input.assumptions ?? current.assumptions,
    updatedAt: nowIso()
  };
  if (index >= 0) {
    store.diaryEntries[index] = updated;
  } else {
    store.diaryEntries.push(updated);
  }
  try {
    await persistDiaryEntries([updated]);
  } catch (error) {
    if (index >= 0) {
      store.diaryEntries[index] = current;
    } else {
      store.diaryEntries = store.diaryEntries.filter((entry) => entry.id !== updated.id);
    }
    throw error;
  }
  return updated;
}

export function deleteDiaryEntry(id: string): Promise<boolean>;
export function deleteDiaryEntry(userId: string, id: string): Promise<boolean>;
export async function deleteDiaryEntry(userIdOrId: string, maybeId?: string): Promise<boolean> {
  const userId = maybeId ? userIdOrId : DEMO_USER_ID;
  const id = maybeId ?? userIdOrId;
  const previousEntries = store.diaryEntries;
  store.diaryEntries = store.diaryEntries.filter((entry) => entry.userId !== userId || entry.id !== id);
  const deletedFromMemory = store.diaryEntries.length !== previousEntries.length;
  if (deletedFromMemory || shouldPersistDirectlyToPrisma()) {
    try {
      const deletedFromPersistence = await deletePersistedDiaryEntries(userId, [id]);
      return deletedFromMemory || deletedFromPersistence > 0;
    } catch (error) {
      store.diaryEntries = previousEntries;
      throw error;
    }
  }
  return false;
}

export function duplicateDiaryEntry(id: string, date?: string): Promise<DiaryEntry | undefined>;
export function duplicateDiaryEntry(userId: string, id: string, date?: string): Promise<DiaryEntry | undefined>;
export async function duplicateDiaryEntry(userIdOrId: string, idOrDate?: string, maybeDate?: string): Promise<DiaryEntry | undefined> {
  const userId = maybeDate !== undefined ? userIdOrId : DEMO_USER_ID;
  const id = maybeDate !== undefined ? idOrDate : userIdOrId;
  const date = maybeDate !== undefined ? maybeDate : idOrDate;
  if (!id) return undefined;
  const entry = store.diaryEntries.find((item) => item.userId === userId && item.id === id) ?? (await readDiaryEntriesByIds(userId, [id]))[0];
  if (!entry) {
    return undefined;
  }
  const now = nowIso();
  const duplicate: DiaryEntry = {
    ...entry,
    id: createId("entry"),
    date: date ?? entry.date,
    createdAt: now,
    updatedAt: now
  };
  store.diaryEntries.push(duplicate);
  try {
    await persistDiaryEntries([duplicate]);
  } catch (error) {
    store.diaryEntries = store.diaryEntries.filter((candidate) => candidate.id !== duplicate.id);
    throw error;
  }
  return duplicate;
}

export function copyDiaryDay(fromDate: string, toDate: string): Promise<DiaryEntry[]>;
export function copyDiaryDay(userId: string, fromDate: string, toDate: string): Promise<DiaryEntry[]>;
export async function copyDiaryDay(userIdOrFromDate: string, fromDateOrToDate: string, maybeToDate?: string): Promise<DiaryEntry[]> {
  const userId = maybeToDate ? userIdOrFromDate : DEMO_USER_ID;
  const fromDate = maybeToDate ? fromDateOrToDate : userIdOrFromDate;
  const toDate = maybeToDate ?? fromDateOrToDate;
  if (fromDate === toDate) {
    return [];
  }

  const sourceEntries = await readDiaryEntriesForDate(userId, fromDate);
  const now = nowIso();
  const copiedEntries = sourceEntries.map((entry) => ({
    ...entry,
    id: createId("entry"),
    date: toDate,
    createdAt: now,
    updatedAt: now
  }));

  if (copiedEntries.length > 0) {
    store.diaryEntries.push(...copiedEntries);
    try {
      await persistDiaryEntries(copiedEntries);
    } catch (error) {
      const copiedIds = new Set(copiedEntries.map((entry) => entry.id));
      store.diaryEntries = store.diaryEntries.filter((entry) => !copiedIds.has(entry.id));
      throw error;
    }
  }

  return copiedEntries;
}
