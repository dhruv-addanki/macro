import type { AnalyticsSummaryResponse, DiaryEntry } from "@macro/shared";
import { env } from "../../lib/env";
import { createId, nowIso } from "../../lib/http";
import { createAnalyticsEventInPrisma, getAnalyticsSummaryFromPrisma } from "../../lib/prismaStore";
import type { AnalyticsEvent } from "../../lib/store";
import { saveStore, store } from "../../lib/store";

type RecordAnalyticsInput = {
  userId: string;
  eventType: AnalyticsEvent["eventType"];
  status?: AnalyticsEvent["status"];
  sourceType?: AnalyticsEvent["sourceType"];
  metadata?: AnalyticsEvent["metadata"];
};

const sourceTypes: DiaryEntry["sourceType"][] = ["barcode", "manual", "ai_photo", "ai_text", "recipe", "saved_meal"];

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function publicEvents(userId: string) {
  return store.analyticsEvents
    .filter((event) => event.userId === userId)
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 25)
    .map(({ userId: _userId, ...event }) => event);
}

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

async function persistAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await createAnalyticsEventInPrisma({
      event,
      user: store.authUsers.find((user) => user.id === event.userId)
    });
    return;
  }

  saveStore();
}

export async function recordAnalyticsEvent(input: RecordAnalyticsInput): Promise<AnalyticsEvent> {
  const event: AnalyticsEvent = {
    id: createId("event"),
    userId: input.userId,
    eventType: input.eventType,
    status: input.status ?? null,
    sourceType: input.sourceType ?? null,
    metadata: input.metadata ?? {},
    createdAt: nowIso()
  };
  store.analyticsEvents.push(event);
  try {
    await persistAnalyticsEvent(event);
  } catch (error) {
    store.analyticsEvents = store.analyticsEvents.filter((candidate) => candidate.id !== event.id);
    throw error;
  }
  return event;
}

export async function recordLoggedEntry(entry: DiaryEntry, metadata: AnalyticsEvent["metadata"] = {}): Promise<void> {
  await recordAnalyticsEvent({
    userId: entry.userId,
    eventType: "food_logged",
    status: "success",
    sourceType: entry.sourceType,
    metadata: {
      entryId: entry.id,
      calories: entry.macros.calories,
      mealGroupId: entry.mealGroupId,
      ...metadata
    }
  });
}

export function getAnalyticsSummary(userId: string): AnalyticsSummaryResponse {
  const userEntries = store.diaryEntries.filter((entry) => entry.userId === userId);
  const loggedEntriesBySource = Object.fromEntries(
    sourceTypes.map((sourceType) => [sourceType, userEntries.filter((entry) => entry.sourceType === sourceType).length])
  ) as AnalyticsSummaryResponse["loggedEntriesBySource"];

  const aiMealsLogged = loggedEntriesBySource.ai_photo + loggedEntriesBySource.ai_text;
  const aiEstimatesGenerated = store.aiEstimates.filter(
    (estimate) => estimate.userId === userId && ["text", "photo", "saved_meal_match"].includes(estimate.inputType)
  ).length;
  const aiCorrectionsApplied = store.userCorrections.filter((correction) => correction.userId === userId).length;
  const barcodeLookups = store.analyticsEvents.filter(
    (event) => event.userId === userId && event.eventType === "barcode_lookup"
  );
  const barcodeLookupFailures = barcodeLookups.filter((event) => event.status === "failed").length;
  const scanFailures = store.analyticsEvents.filter(
    (event) => event.userId === userId && event.eventType === "scan_failure"
  ).length;
  const aiCostUnits = store.aiUsageEvents
    .filter((event) => event.userId === userId && event.status !== "blocked")
    .reduce((total, event) => total + event.costUnits, 0);

  return {
    totalLoggedEntries: userEntries.length,
    loggedEntriesBySource,
    aiMealsLogged,
    aiEstimatesGenerated,
    aiEstimateAcceptanceRate: aiEstimatesGenerated > 0 ? roundRate(aiMealsLogged / aiEstimatesGenerated) : null,
    aiCorrectionsApplied,
    aiCorrectionRate: aiEstimatesGenerated > 0 ? roundRate(aiCorrectionsApplied / aiEstimatesGenerated) : null,
    barcodeLookups: barcodeLookups.length,
    barcodeLookupFailures,
    barcodeFailureRate: barcodeLookups.length > 0 ? roundRate(barcodeLookupFailures / barcodeLookups.length) : null,
    scanFailures,
    aiCostUnits,
    aiCostUnitsPerLoggedAiMeal: aiMealsLogged > 0 ? roundRate(aiCostUnits / aiMealsLogged) : null,
    recentEvents: publicEvents(userId)
  };
}

export async function getAnalyticsSummaryForUser(userId: string): Promise<AnalyticsSummaryResponse> {
  if (shouldPersistDirectlyToPrisma()) {
    return getAnalyticsSummaryFromPrisma(userId);
  }
  return getAnalyticsSummary(userId);
}
