import type { AIUsageSummaryResponse } from "@macro/shared";
import { env } from "../../lib/env";
import { createId, nowIso } from "../../lib/http";
import {
  createAiUsageEventInPrisma,
  listAiUsageEventsFromPrisma,
  reserveAiUsageEventInPrisma,
  updateAiUsageEventInPrisma
} from "../../lib/prismaStore";
import type { AiUsageEvent } from "../../lib/store";
import { flushStorePersistence, saveStore, store } from "../../lib/store";

export type AiEndpoint = "meal-text-estimate" | "meal-photo-estimate" | "meal-correct" | "meal-match-saved";

export type AiReservationInput = {
  userId: string;
  endpoint: AiEndpoint;
  inputType: AiUsageEvent["inputType"];
  costUnits: number;
};

export type AiRateLimitRejection = {
  allowed: false;
  error: "rate_limited" | "daily_budget_exceeded";
  message: string;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
  resetAt: string;
};

export type AiReservationResult =
  | {
      allowed: true;
      eventId: string;
    }
  | AiRateLimitRejection;

type EndpointConfig = {
  endpoint: AiEndpoint;
  limit: number;
};

function endpointConfigs(): EndpointConfig[] {
  return [
    { endpoint: "meal-text-estimate", limit: env.aiTextEstimateLimit },
    { endpoint: "meal-photo-estimate", limit: env.aiPhotoEstimateLimit },
    { endpoint: "meal-correct", limit: env.aiCorrectionLimit },
    { endpoint: "meal-match-saved", limit: env.aiMatchSavedLimit }
  ];
}

function limitForEndpoint(endpoint: AiEndpoint): number {
  return endpointConfigs().find((config) => config.endpoint === endpoint)?.limit ?? env.aiTextEstimateLimit;
}

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayUtcStartMs(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function tomorrowUtcStartIso(now = new Date()): string {
  return new Date(todayUtcStartMs(now) + 24 * 60 * 60 * 1000).toISOString();
}

function todayUtcStartIso(now = new Date()): string {
  return new Date(todayUtcStartMs(now)).toISOString();
}

function windowStartIso(now = new Date()): string {
  return new Date(now.getTime() - env.aiRateLimitWindowMs).toISOString();
}

async function usageEventsForUser(userId: string): Promise<AiUsageEvent[]> {
  if (env.storeDriver === "prisma" && process.env.NODE_ENV !== "test") {
    await flushStorePersistence();
    return listAiUsageEventsFromPrisma(userId);
  }
  return store.aiUsageEvents.filter((event) => event.userId === userId);
}

function rememberUsageEvent(event: AiUsageEvent): void {
  const existingIndex = store.aiUsageEvents.findIndex((candidate) => candidate.id === event.id);
  if (existingIndex >= 0) {
    store.aiUsageEvents[existingIndex] = event;
    return;
  }
  store.aiUsageEvents.push(event);
}

function nonBlockedEvents(events: AiUsageEvent[]): AiUsageEvent[] {
  return events.filter((event) => event.status !== "blocked");
}

function windowEvents(events: AiUsageEvent[], endpoint: AiEndpoint, now = new Date()): AiUsageEvent[] {
  const windowStart = now.getTime() - env.aiRateLimitWindowMs;
  return nonBlockedEvents(events).filter(
    (event) => event.endpoint === endpoint && parseTime(event.createdAt) >= windowStart
  );
}

function usedTodayUnits(events: AiUsageEvent[], now = new Date()): number {
  const dayStart = todayUtcStartMs(now);
  return nonBlockedEvents(events)
    .filter((event) => parseTime(event.createdAt) >= dayStart)
    .reduce((total, event) => total + event.costUnits, 0);
}

function nextEndpointResetAt(events: AiUsageEvent[], now = new Date()): string {
  const oldest = events
    .map((event) => parseTime(event.createdAt))
    .filter((time) => time > 0)
    .sort((a, b) => a - b)[0];
  return new Date((oldest ?? now.getTime()) + env.aiRateLimitWindowMs).toISOString();
}

function retryAfterSeconds(resetAt: string): number {
  return Math.max(1, Math.ceil((parseTime(resetAt) - Date.now()) / 1000));
}

async function persistUsageEvent(event: AiUsageEvent): Promise<void> {
  store.aiUsageEvents.push(event);
  if (env.storeDriver === "prisma" && process.env.NODE_ENV !== "test") {
    await createAiUsageEventInPrisma(event);
    return;
  }
  saveStore();
}

async function recordBlocked(input: AiReservationInput, reason: string): Promise<void> {
  await persistUsageEvent({
    id: createId("ai_usage"),
    userId: input.userId,
    endpoint: input.endpoint,
    inputType: input.inputType,
    model: "blocked",
    promptVersion: "rate-limit",
    status: "blocked",
    usedFallback: null,
    costUnits: 0,
    reason,
    createdAt: nowIso()
  });
}

export async function reserveAiRequest(input: AiReservationInput): Promise<AiReservationResult> {
  const now = new Date();
  const limit = limitForEndpoint(input.endpoint);

  if (env.storeDriver === "prisma" && process.env.NODE_ENV !== "test") {
    await flushStorePersistence();
    const reservation = await reserveAiUsageEventInPrisma({
      eventId: createId("ai_usage"),
      userId: input.userId,
      endpoint: input.endpoint,
      inputType: input.inputType,
      costUnits: input.costUnits,
      endpointLimit: limit,
      dailyBudgetUnits: env.aiDailyBudgetUnits,
      windowStartIso: windowStartIso(now),
      dayStartIso: todayUtcStartIso(now),
      createdAtIso: now.toISOString()
    });
    rememberUsageEvent(reservation.event);

    if (reservation.allowed) {
      return { allowed: true, eventId: reservation.event.id };
    }

    if (reservation.reason === "endpoint_rate_limit") {
      const resetAt = nextEndpointResetAt(reservation.usedInWindowEvents, now);
      return {
        allowed: false,
        error: "rate_limited",
        message: "AI request limit reached for this action. Try again after the window resets.",
        retryAfterSeconds: retryAfterSeconds(resetAt),
        limit,
        remaining: 0,
        resetAt
      };
    }

    const resetAt = tomorrowUtcStartIso(now);
    return {
      allowed: false,
      error: "daily_budget_exceeded",
      message: "Daily AI budget reached for this account. Try again tomorrow.",
      retryAfterSeconds: retryAfterSeconds(resetAt),
      limit: env.aiDailyBudgetUnits,
      remaining: Math.max(0, env.aiDailyBudgetUnits - reservation.usedTodayUnits),
      resetAt
    };
  }

  const events = await usageEventsForUser(input.userId);
  const usedInWindow = windowEvents(events, input.endpoint, now);
  const remainingInWindow = Math.max(0, limit - usedInWindow.length);

  if (remainingInWindow <= 0) {
    const resetAt = nextEndpointResetAt(usedInWindow, now);
    await recordBlocked(input, "endpoint_rate_limit");
    return {
      allowed: false,
      error: "rate_limited",
      message: "AI request limit reached for this action. Try again after the window resets.",
      retryAfterSeconds: retryAfterSeconds(resetAt),
      limit,
      remaining: 0,
      resetAt
    };
  }

  const usedToday = usedTodayUnits(events, now);
  if (usedToday + input.costUnits > env.aiDailyBudgetUnits) {
    const resetAt = tomorrowUtcStartIso(now);
    await recordBlocked(input, "daily_budget");
    return {
      allowed: false,
      error: "daily_budget_exceeded",
      message: "Daily AI budget reached for this account. Try again tomorrow.",
      retryAfterSeconds: retryAfterSeconds(resetAt),
      limit: env.aiDailyBudgetUnits,
      remaining: Math.max(0, env.aiDailyBudgetUnits - usedToday),
      resetAt
    };
  }

  const event: AiUsageEvent = {
    id: createId("ai_usage"),
    userId: input.userId,
    endpoint: input.endpoint,
    inputType: input.inputType,
    model: "pending",
    promptVersion: "pending",
    status: "accepted",
    usedFallback: null,
    costUnits: input.costUnits,
    reason: null,
    createdAt: nowIso()
  };
  await persistUsageEvent(event);
  return { allowed: true, eventId: event.id };
}

export async function completeAiUsageEvent(
  eventId: string,
  output: {
    model: string;
    promptVersion: string;
    usedFallback: boolean;
  }
): Promise<void> {
  const event = store.aiUsageEvents.find((candidate) => candidate.id === eventId);
  if (!event) return;
  event.model = output.model;
  event.promptVersion = output.promptVersion;
  event.usedFallback = output.usedFallback;
  event.status = "accepted";
  event.reason = null;
  if (env.storeDriver === "prisma" && process.env.NODE_ENV !== "test") {
    await updateAiUsageEventInPrisma(eventId, {
      model: event.model,
      promptVersion: event.promptVersion,
      status: event.status,
      usedFallback: event.usedFallback,
      reason: event.reason
    });
    return;
  }
  saveStore();
}

export async function failAiUsageEvent(eventId: string, reason = "request_failed"): Promise<void> {
  const event = store.aiUsageEvents.find((candidate) => candidate.id === eventId);
  if (!event) return;
  event.status = "failed";
  event.reason = reason;
  if (env.storeDriver === "prisma" && process.env.NODE_ENV !== "test") {
    await updateAiUsageEventInPrisma(eventId, {
      model: event.model,
      promptVersion: event.promptVersion,
      status: event.status,
      usedFallback: event.usedFallback,
      reason: event.reason
    });
    return;
  }
  saveStore();
}

export async function getAiUsageSummary(userId: string): Promise<AIUsageSummaryResponse> {
  const now = new Date();
  const events = await usageEventsForUser(userId);
  const usedToday = usedTodayUnits(events, now);
  const limits = endpointConfigs().map((config) => {
    const used = windowEvents(events, config.endpoint, now);
    return {
      endpoint: config.endpoint,
      limit: config.limit,
      used: used.length,
      remaining: Math.max(0, config.limit - used.length),
      resetsAt: nextEndpointResetAt(used, now)
    };
  });

  return {
    dailyBudgetUnits: env.aiDailyBudgetUnits,
    usedTodayUnits: usedToday,
    remainingTodayUnits: Math.max(0, env.aiDailyBudgetUnits - usedToday),
    windowMs: env.aiRateLimitWindowMs,
    limits,
    recentEvents: events
      .slice()
      .sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt))
      .slice(0, 20)
      .map(({ userId: _userId, ...event }) => event)
  };
}
