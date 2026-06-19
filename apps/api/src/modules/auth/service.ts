import type {
  AuthLoginRequest,
  AuthResponse,
  AuthSessionResponse,
  AuthSignupRequest,
  AuthUser
} from "@macro/shared";
import { createClient, type SupabaseClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../../lib/env";
import { createId, nowIso } from "../../lib/http";
import {
  findAuthUserByEmailFromPrisma,
  findAuthUserBySessionTokenHashFromPrisma,
  isPrismaUniqueConstraintError,
  persistAuthLoginInPrisma,
  persistAuthStateInPrisma,
  revokeAuthSessionInPrisma,
  revokeAuthSessionTokenHashInPrisma
} from "../../lib/prismaStore";
import type { AuthSession, Store } from "../../lib/store";
import { DEMO_USER_ID, ensureUserState, saveStore, store } from "../../lib/store";

type AuthMutationSnapshot = Pick<Store, "authUsers" | "authSessions" | "profile" | "profiles" | "goals" | "mealGroups">;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function displayNameFromEmail(email: string): string {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Macro User";
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeHashEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionMatchesToken(session: AuthSession, token: string): boolean {
  const tokenHash = hashSessionToken(token);
  if (session.tokenHash) {
    return safeHashEqual(session.tokenHash, tokenHash);
  }
  return session.token === token;
}

function activeSessionForToken(sessionToken?: string): AuthSession | undefined {
  if (!sessionToken) return undefined;
  return store.authSessions.find((candidate) => !candidate.revokedAt && sessionMatchesToken(candidate, sessionToken));
}

function cacheAuthUser(user: AuthUser): void {
  const index = store.authUsers.findIndex((candidate) => candidate.id === user.id);
  if (index >= 0) {
    store.authUsers[index] = user;
  } else {
    store.authUsers.push(user);
  }
}

function captureAuthMutationSnapshot(): AuthMutationSnapshot {
  return {
    authUsers: store.authUsers.map((user) => ({ ...user })),
    authSessions: store.authSessions.map((session) => ({ ...session })),
    profile: { ...store.profile },
    profiles: store.profiles.map((profile) => ({ ...profile })),
    goals: store.goals.map((goal) => ({ ...goal })),
    mealGroups: store.mealGroups.map((mealGroup) => ({ ...mealGroup }))
  };
}

function restoreAuthMutationSnapshot(snapshot: AuthMutationSnapshot): void {
  store.authUsers = snapshot.authUsers;
  store.authSessions = snapshot.authSessions;
  store.profile = snapshot.profile;
  store.profiles = snapshot.profiles;
  store.goals = snapshot.goals;
  store.mealGroups = snapshot.mealGroups;
}

let supabaseAuthClient: SupabaseClient | null = null;

function shouldUseSupabaseAuth(): boolean {
  return env.authDriver === "supabase";
}

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

function supabaseClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required when MACRO_AUTH_DRIVER=supabase");
  }
  supabaseAuthClient ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return supabaseAuthClient;
}

function displayNameFromSupabaseUser(user: SupabaseUser): string {
  const metadata = user.user_metadata as Record<string, unknown>;
  const explicitName = metadata.display_name ?? metadata.name ?? metadata.full_name;
  return typeof explicitName === "string" && explicitName.trim()
    ? explicitName.trim()
    : displayNameFromEmail(user.email ?? `${user.id}@supabase.local`);
}

async function verifySupabaseToken(sessionToken?: string): Promise<AuthUser | null> {
  if (!sessionToken) return null;
  const { data, error } = await supabaseClient().auth.getUser(sessionToken);
  if (error || !data.user) return null;
  const user: AuthUser = {
    id: data.user.id,
    email: normalizeEmail(data.user.email ?? `${data.user.id}@supabase.local`),
    displayName: displayNameFromSupabaseUser(data.user),
    createdAt: data.user.created_at ?? nowIso(),
    lastLoginAt: nowIso()
  };

  cacheAuthUser(user);
  ensureUserState(user.id, user.displayName);

  if (shouldPersistDirectlyToPrisma()) {
    await persistAuthStateInPrisma({
      user,
      profiles: store.profiles.filter((profile) => profile.userId === user.id),
      goals: store.goals.filter((goal) => goal.userId === user.id),
      mealGroups: store.mealGroups.filter((mealGroup) => mealGroup.userId === user.id)
    });
  } else {
    saveStore();
  }

  return user;
}

async function persistAuthMutation(user: AuthUser, session?: AuthSession): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await persistAuthStateInPrisma({
      user,
      session,
      profiles: store.profiles.filter((profile) => profile.userId === user.id),
      goals: store.goals.filter((goal) => goal.userId === user.id),
      mealGroups: store.mealGroups.filter((mealGroup) => mealGroup.userId === user.id)
    });
    return;
  }

  saveStore();
}

async function persistSessionRevocation(session: AuthSession): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await revokeAuthSessionInPrisma(session);
    return;
  }

  saveStore();
}

async function persistLoginMutation(user: AuthUser, session: AuthSession): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await persistAuthLoginInPrisma({ user, session });
    return;
  }

  await persistAuthMutation(user, session);
}

function newSession(userId: string): { token: string; session: AuthSession } {
  const token = createId("session");
  const session: AuthSession = {
    tokenHash: hashSessionToken(token),
    userId,
    createdAt: nowIso(),
    revokedAt: null
  };
  store.authSessions.push(session);
  return { token, session };
}

function touchLogin(user: AuthUser): void {
  user.lastLoginAt = nowIso();
}

export function getSessionTokenFromHeader(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase().startsWith("bearer ") ? trimmed.slice(7).trim() : trimmed;
}

export function findAuthUserByEmail(email: string): AuthUser | undefined {
  const normalized = normalizeEmail(email);
  return store.authUsers.find((user) => user.email === normalized);
}

async function findAuthUserByEmailForAuth(email: string): Promise<AuthUser | undefined> {
  const normalized = normalizeEmail(email);
  const local = store.authUsers.find((user) => user.email === normalized);
  if (local || !shouldPersistDirectlyToPrisma()) return local;
  const user = await findAuthUserByEmailFromPrisma(normalized);
  if (user) cacheAuthUser(user);
  return user ?? undefined;
}

export async function signup(input: AuthSignupRequest): Promise<AuthResponse | { error: "email_exists" }> {
  const email = normalizeEmail(input.email);
  if (await findAuthUserByEmailForAuth(email)) {
    return { error: "email_exists" };
  }

  const snapshot = captureAuthMutationSnapshot();
  const user: AuthUser = {
    id: shouldPersistDirectlyToPrisma() ? createId("user") : store.authUsers.length === 0 ? DEMO_USER_ID : createId("user"),
    email,
    displayName: input.displayName?.trim() || displayNameFromEmail(email),
    createdAt: nowIso(),
    lastLoginAt: nowIso()
  };
  store.authUsers.push(user);
  ensureUserState(user.id, user.displayName);

  const { token: sessionToken, session } = newSession(user.id);
  try {
    await persistAuthMutation(user, session);
    return { user, sessionToken };
  } catch (error) {
    restoreAuthMutationSnapshot(snapshot);
    if (isPrismaUniqueConstraintError(error)) {
      return { error: "email_exists" };
    }
    throw error;
  }
}

export async function login(input: AuthLoginRequest): Promise<AuthResponse | { error: "not_found" }> {
  const user = await findAuthUserByEmailForAuth(input.email);
  if (!user) return { error: "not_found" };
  const snapshot = captureAuthMutationSnapshot();
  touchLogin(user);
  cacheAuthUser(user);
  if (!shouldPersistDirectlyToPrisma()) {
    ensureUserState(user.id, user.displayName);
  }
  const { token: sessionToken, session } = newSession(user.id);
  try {
    await persistLoginMutation(user, session);
    return { user, sessionToken };
  } catch (error) {
    restoreAuthMutationSnapshot(snapshot);
    throw error;
  }
}

export async function logout(sessionToken?: string): Promise<boolean> {
  if (shouldUseSupabaseAuth()) {
    return Boolean(await verifySupabaseToken(sessionToken));
  }

  const session = activeSessionForToken(sessionToken);
  if (!session) {
    if (shouldPersistDirectlyToPrisma() && sessionToken) {
      return revokeAuthSessionTokenHashInPrisma(hashSessionToken(sessionToken));
    }
    return false;
  }
  const previousRevokedAt = session.revokedAt;
  session.revokedAt = nowIso();
  try {
    await persistSessionRevocation(session);
    return true;
  } catch (error) {
    session.revokedAt = previousRevokedAt;
    throw error;
  }
}

export function sessionForToken(sessionToken?: string): AuthSessionResponse {
  const session = activeSessionForToken(sessionToken);
  const user = session ? store.authUsers.find((candidate) => candidate.id === session.userId) : undefined;
  return user ? { authenticated: true, user } : { authenticated: false, user: null };
}

export async function sessionForTokenAsync(sessionToken?: string): Promise<AuthSessionResponse> {
  if (shouldUseSupabaseAuth()) {
    const user = await verifySupabaseToken(sessionToken);
    return user ? { authenticated: true, user } : { authenticated: false, user: null };
  }

  const localSession = sessionForToken(sessionToken);
  if (localSession.authenticated || !shouldPersistDirectlyToPrisma() || !sessionToken) {
    return localSession;
  }
  const user = await findAuthUserBySessionTokenHashFromPrisma(hashSessionToken(sessionToken));
  if (!user) return { authenticated: false, user: null };
  cacheAuthUser(user);
  return { authenticated: true, user };
}

export function userIdForSessionToken(sessionToken?: string): string | undefined {
  const session = activeSessionForToken(sessionToken);
  return session?.userId;
}

export async function userIdForSessionTokenAsync(sessionToken?: string): Promise<string | undefined> {
  if (shouldUseSupabaseAuth()) {
    return (await verifySupabaseToken(sessionToken))?.id;
  }

  const localUserId = userIdForSessionToken(sessionToken);
  if (localUserId || !shouldPersistDirectlyToPrisma() || !sessionToken) return localUserId;
  const user = await findAuthUserBySessionTokenHashFromPrisma(hashSessionToken(sessionToken));
  if (!user) return undefined;
  cacheAuthUser(user);
  return user.id;
}

export function resolveUserIdFromAuthHeader(value: unknown): string {
  return userIdForSessionToken(getSessionTokenFromHeader(value)) ?? DEMO_USER_ID;
}

export async function resolveUserIdFromAuthHeaderAsync(value: unknown): Promise<string> {
  return (await userIdForSessionTokenAsync(getSessionTokenFromHeader(value))) ?? DEMO_USER_ID;
}

export function ensureDemoAuthUser(): AuthUser {
  let user = store.authUsers.find((candidate) => candidate.id === DEMO_USER_ID);
  if (!user) {
    user = {
      id: DEMO_USER_ID,
      email: "demo@macro.local",
      displayName: store.profile.displayName || "Demo User",
      createdAt: nowIso(),
      lastLoginAt: null
    };
    store.authUsers.unshift(user);
    saveStore();
  }
  return user;
}
