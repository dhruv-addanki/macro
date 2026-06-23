import type {
  AnalyticsSummaryResponse,
  AuthLoginRequest,
  AuthResponse,
  AuthSessionResponse,
  AuthSignupRequest,
  AIUsageSummaryResponse,
  BarcodeLookupResponse,
  BarcodeProductRequest,
  BarcodeProductUpdateRequest,
  BarcodeUnitSuggestionsResponse,
  CompleteOnboardingRequest,
  CorrectionRequest,
  CorrectionResponse,
  CopyDiaryDayRequest,
  CopyDiaryDayResponse,
  CreateMealGroupRequest,
  CreateCustomFoodRequest,
  CreateRecipeRequest,
  CreateDiaryEntryInput,
  CreateWeightEntryRequest,
  DeleteMealPhotoResponse,
  DiaryDay,
  DiaryEntry,
  FoodItem,
  MeResponse,
  MealPhotosResponse,
  MealPhotoAccessResponse,
  MealEstimateResponse,
  PhotoMealEstimateRequest,
  ProgressSummaryResponse,
  Recipe,
  ReorderMealGroupsRequest,
  SavedMeal,
  SavedMealMatchResponse,
  TextMealEstimateRequest,
  UpdateDiaryEntryInput,
  UpdateGoalRequest,
  UpdateMealGroupRequest,
  UpdateRecipeRequest,
  UpdateSavedMealRequest,
  UpdateProfileRequest
} from "@macro/shared";
import { createClient, type Session as SupabaseSession, type SupabaseClient, type User as SupabaseUser } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
export const AUTH_DRIVER = process.env.EXPO_PUBLIC_AUTH_DRIVER === "supabase" ? "supabase" : "local";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SESSION_STORAGE_KEY = "macro.sessionToken";
const SUPABASE_SESSION_STORAGE_KEY = "macro.supabaseSession";

type PersistedSupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
};

function sessionStorage(): StorageLike | undefined {
  return (globalThis as { localStorage?: StorageLike }).localStorage;
}

function readStoredSessionToken(): string | undefined {
  if (Platform.OS !== "web") return undefined;
  try {
    return sessionStorage()?.getItem(SESSION_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function parseStoredSupabaseSession(raw: string | null | undefined): PersistedSupabaseSession | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSupabaseSession>;
    if (typeof parsed.access_token !== "string" || typeof parsed.refresh_token !== "string") {
      return undefined;
    }
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at: typeof parsed.expires_at === "number" ? parsed.expires_at : undefined,
      expires_in: typeof parsed.expires_in === "number" ? parsed.expires_in : undefined,
      token_type: typeof parsed.token_type === "string" ? parsed.token_type : undefined
    };
  } catch {
    return undefined;
  }
}

function readStoredSupabaseSession(): PersistedSupabaseSession | undefined {
  if (Platform.OS !== "web") return undefined;
  try {
    return parseStoredSupabaseSession(sessionStorage()?.getItem(SUPABASE_SESSION_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

let sessionToken = readStoredSessionToken();
let supabaseSession = readStoredSupabaseSession();
let sessionHydrated = Platform.OS === "web";
let sessionHydrationPromise: Promise<string | undefined> | null = null;
let sessionGeneration = 0;
let supabaseClient: SupabaseClient | null = null;
let supabaseRefreshPromise: Promise<string | undefined> | null = null;

export function getSessionToken() {
  return sessionToken;
}

export function hasSessionToken() {
  return Boolean(sessionToken);
}

export function isSessionHydrated() {
  return sessionHydrated;
}

export async function hydrateSessionToken() {
  if (sessionHydrated) return sessionToken;

  if (!sessionHydrationPromise) {
    const generation = sessionGeneration;
    sessionHydrationPromise = (async () => {
      try {
        const [storedToken, storedSupabaseSession] = await Promise.all([
          SecureStore.getItemAsync(SESSION_STORAGE_KEY),
          SecureStore.getItemAsync(SUPABASE_SESSION_STORAGE_KEY)
        ]);
        if (generation === sessionGeneration) {
          sessionToken = storedToken ?? undefined;
          supabaseSession = parseStoredSupabaseSession(storedSupabaseSession);
          if (AUTH_DRIVER === "supabase" && supabaseSession?.access_token) {
            sessionToken = supabaseSession.access_token;
          }
        }
      } catch {
        if (generation === sessionGeneration) {
          sessionToken = undefined;
          supabaseSession = undefined;
        }
      } finally {
        sessionHydrated = true;
        sessionHydrationPromise = null;
      }
      return sessionToken;
    })();
  }

  return sessionHydrationPromise;
}

async function persistSessionToken(token?: string) {
  if (Platform.OS === "web") {
    if (token) {
      sessionStorage()?.setItem(SESSION_STORAGE_KEY, token);
    } else {
      sessionStorage()?.removeItem(SESSION_STORAGE_KEY);
    }
    return;
  }

  if (token) {
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
  }
}

async function persistSupabaseSession(session?: PersistedSupabaseSession) {
  if (Platform.OS === "web") {
    if (session) {
      sessionStorage()?.setItem(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage()?.removeItem(SUPABASE_SESSION_STORAGE_KEY);
    }
    return;
  }

  if (session) {
    await SecureStore.setItemAsync(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    await SecureStore.deleteItemAsync(SUPABASE_SESSION_STORAGE_KEY);
  }
}

export async function setSessionToken(token?: string | null) {
  sessionGeneration += 1;
  sessionToken = token || undefined;
  if (!sessionToken) {
    supabaseSession = undefined;
  }
  sessionHydrated = true;
  sessionHydrationPromise = null;
  try {
    await persistSessionToken(sessionToken);
    if (!sessionToken) {
      await persistSupabaseSession(undefined);
    }
  } catch {
    // If persistence fails, the in-memory session still supports the current run.
  }
}

function supabaseAuthClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to use Supabase auth.");
  }
  supabaseClient ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return supabaseClient;
}

function displayNameFromEmail(email: string): string {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Macro User";
}

function persistedSupabaseSession(session: SupabaseSession): PersistedSupabaseSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type
  };
}

async function setSupabaseSession(session: SupabaseSession): Promise<void> {
  sessionGeneration += 1;
  supabaseSession = persistedSupabaseSession(session);
  sessionToken = supabaseSession.access_token;
  sessionHydrated = true;
  sessionHydrationPromise = null;
  try {
    await Promise.all([
      persistSessionToken(sessionToken),
      persistSupabaseSession(supabaseSession)
    ]);
  } catch {
    // If persistence fails, the in-memory Supabase session still supports the current run.
  }
}

async function ensureFreshSupabaseSession(): Promise<string | undefined> {
  if (AUTH_DRIVER !== "supabase" || !supabaseSession?.refresh_token) {
    return sessionToken;
  }

  const expiresAtMs = supabaseSession.expires_at ? supabaseSession.expires_at * 1000 : 0;
  if (expiresAtMs && expiresAtMs - Date.now() > 60_000) {
    return sessionToken;
  }

  supabaseRefreshPromise ??= (async () => {
    const { data, error } = await supabaseAuthClient().auth.refreshSession({
      refresh_token: supabaseSession!.refresh_token
    });
    if (error) throw new Error(error.message);
    if (!data.session?.access_token) throw new Error("Supabase did not return a refreshed session.");
    await setSupabaseSession(data.session);
    return sessionToken;
  })().finally(() => {
    supabaseRefreshPromise = null;
  });

  return supabaseRefreshPromise;
}

function authResponseFromSupabase(user: SupabaseUser, accessToken: string): AuthResponse {
  const metadata = user.user_metadata as Record<string, unknown>;
  const explicitName = metadata.display_name ?? metadata.name ?? metadata.full_name;
  const email = user.email ?? `${user.id}@supabase.local`;
  return {
    sessionToken: accessToken,
    user: {
      id: user.id,
      email,
      displayName: typeof explicitName === "string" && explicitName.trim() ? explicitName.trim() : displayNameFromEmail(email),
      createdAt: user.created_at ?? new Date().toISOString(),
      lastLoginAt: null
    }
  };
}

export async function supabaseSignup(input: AuthSignupRequest & { password: string }): Promise<AuthResponse> {
  const { data, error } = await supabaseAuthClient().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        display_name: input.displayName?.trim() || displayNameFromEmail(input.email)
      }
    }
  });
  if (error) throw new Error(error.message);
  if (!data.session?.access_token || !data.user) {
    throw new Error("Check your email to confirm the account, then log in.");
  }
  await setSupabaseSession(data.session);
  return authResponseFromSupabase(data.user, data.session.access_token);
}

export async function supabaseLogin(input: AuthLoginRequest & { password: string }): Promise<AuthResponse> {
  const { data, error } = await supabaseAuthClient().auth.signInWithPassword({
    email: input.email,
    password: input.password
  });
  if (error) throw new Error(error.message);
  if (!data.session?.access_token || !data.user) {
    throw new Error("Supabase did not return a session.");
  }
  await setSupabaseSession(data.session);
  return authResponseFromSupabase(data.user, data.session.access_token);
}

export async function supabaseLogout(): Promise<void> {
  try {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
  } finally {
    await setSessionToken(null);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (AUTH_DRIVER === "supabase") {
    await ensureFreshSupabaseSession();
  }
  const authHeader = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
  const optionHeaders = (options.headers ?? {}) as Record<string, string>;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...optionHeaders
    } as unknown as HeadersInit
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed: ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === "string") {
        message = parsed.message;
      }
    } catch {
      // Keep the original response text when the server does not return JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  signup(input: AuthSignupRequest) {
    return request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  login(input: AuthLoginRequest) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  logout() {
    if (AUTH_DRIVER === "supabase") {
      return supabaseLogout().then(() => ({ ok: true }));
    }
    return request<{ ok: boolean }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ sessionToken })
    });
  },
  getAuthSession() {
    return request<AuthSessionResponse>("/auth/session");
  },
  getMe() {
    return request<MeResponse>("/me");
  },
  updateProfile(input: UpdateProfileRequest) {
    return request<MeResponse["profile"]>("/me/profile", {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  updateGoal(input: UpdateGoalRequest) {
    return request<MeResponse["goal"]>("/me/goal", {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  completeOnboarding(input: CompleteOnboardingRequest) {
    return request<MeResponse>("/me/onboarding", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  createMealGroup(input: CreateMealGroupRequest) {
    return request<MeResponse["mealGroups"][number]>("/me/meal-groups", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  updateMealGroup(id: string, input: UpdateMealGroupRequest) {
    return request<MeResponse["mealGroups"][number]>(`/me/meal-groups/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  reorderMealGroups(input: ReorderMealGroupsRequest) {
    return request<{ mealGroups: MeResponse["mealGroups"] }>("/me/meal-groups/reorder", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  deleteMealGroup(id: string) {
    return request<{ ok: boolean; deletedId: string; mealGroups: MeResponse["mealGroups"] }>(`/me/meal-groups/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },
  getDiary(date: string) {
    return request<DiaryDay>(`/diary?date=${encodeURIComponent(date)}`);
  },
  createEntry(input: CreateDiaryEntryInput) {
    return request<DiaryEntry>("/diary/entries", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  deleteEntry(id: string) {
    return request<{ ok: boolean }>(`/diary/entries/${id}`, { method: "DELETE" });
  },
  updateEntry(id: string, input: UpdateDiaryEntryInput) {
    return request<DiaryEntry>(`/diary/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  duplicateEntry(id: string, date?: string) {
    return request<DiaryEntry>(`/diary/entries/${id}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ date })
    });
  },
  copyDiaryDay(input: CopyDiaryDayRequest) {
    return request<CopyDiaryDayResponse>("/diary/copy-day", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  searchFoods(query: string) {
    return request<{ foods: FoodItem[] }>(`/foods/search?q=${encodeURIComponent(query)}`);
  },
  getRecentFoods() {
    return request<{ foods: FoodItem[] }>("/foods/recent");
  },
  getFavoriteFoods() {
    return request<{ foods: FoodItem[] }>("/foods/favorites");
  },
  createCustomFood(input: CreateCustomFoodRequest) {
    return request<FoodItem>("/foods/custom", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  toggleFavoriteFood(foodId: string) {
    return request<{ favorited: boolean }>(`/foods/${foodId}/favorite`, { method: "POST" });
  },
  logFood(input: { foodId: string; date: string; mealGroupId: string; quantity: number; unitId?: string }) {
    return request<DiaryEntry>("/foods/log", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  lookupBarcode(barcode: string) {
    return request<BarcodeLookupResponse>("/barcode/lookup", {
      method: "POST",
      body: JSON.stringify({ barcode })
    });
  },
  createBarcodeProduct(input: BarcodeProductRequest) {
    return request<BarcodeLookupResponse>("/barcode/products", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  updateBarcodeProduct(id: string, input: BarcodeProductUpdateRequest) {
    return request<BarcodeLookupResponse>(`/barcode/products/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  suggestBarcodeUnits(input: { foodItemId?: string; food?: FoodItem }) {
    return request<BarcodeUnitSuggestionsResponse>("/barcode/unit-suggestions", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  estimateTextMeal(input: TextMealEstimateRequest) {
    return request<MealEstimateResponse>("/ai/meal-text/estimate", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  estimatePhotoMeal(input: PhotoMealEstimateRequest) {
    return request<MealEstimateResponse>("/ai/meal-photo/estimate", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  getMealPhotos() {
    return request<MealPhotosResponse>("/ai/meal-photos");
  },
  getAiUsage() {
    return request<AIUsageSummaryResponse>("/ai/usage");
  },
  getAnalyticsSummary() {
    return request<AnalyticsSummaryResponse>("/analytics/summary");
  },
  deleteMealPhoto(id: string) {
    return request<DeleteMealPhotoResponse>(`/ai/meal-photos/${id}`, { method: "DELETE" });
  },
  getMealPhotoAccess(id: string) {
    return request<MealPhotoAccessResponse>(`/ai/meal-photos/${id}/access`);
  },
  correctMeal(input: CorrectionRequest) {
    return request<CorrectionResponse>("/ai/meal/correct", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  matchSavedMeals(input: { query: string; limit?: number }) {
    return request<SavedMealMatchResponse>("/ai/meal/match-saved", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  logEstimate(input: {
    estimate: MealEstimateResponse["estimate"];
    estimateId?: string;
    date: string;
    mealGroupId: string;
    sourceType: "ai_photo" | "ai_text";
    assumptions?: string[];
  }) {
    return request<DiaryEntry>("/diary/entries/from-estimate", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        assumptions: input.assumptions ?? []
      })
    });
  },
  getSavedMeals() {
    return request<{ savedMeals: SavedMeal[] }>("/saved-meals");
  },
  saveMeal(input: { name: string; entryIds: string[] }) {
    return request<SavedMeal>("/saved-meals", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  updateSavedMeal(id: string, input: UpdateSavedMealRequest) {
    return request<SavedMeal>(`/saved-meals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  logSavedMeal(input: { id: string; date: string; mealGroupId: string }) {
    return request<{ entries: DiaryEntry[] }>(`/saved-meals/${input.id}/log`, {
      method: "POST",
      body: JSON.stringify({ date: input.date, mealGroupId: input.mealGroupId })
    });
  },
  deleteSavedMeal(id: string) {
    return request<{ ok: boolean }>(`/saved-meals/${id}`, { method: "DELETE" });
  },
  getRecipes() {
    return request<{ recipes: Recipe[] }>("/recipes");
  },
  createRecipe(input: CreateRecipeRequest) {
    return request<Recipe>("/recipes", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  updateRecipe(id: string, input: UpdateRecipeRequest) {
    return request<Recipe>(`/recipes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  logRecipe(input: { id: string; date: string; mealGroupId: string; servings?: number }) {
    return request<DiaryEntry>(`/recipes/${input.id}/log`, {
      method: "POST",
      body: JSON.stringify({ date: input.date, mealGroupId: input.mealGroupId, servings: input.servings ?? 1 })
    });
  },
  deleteRecipe(id: string) {
    return request<{ ok: boolean }>(`/recipes/${id}`, { method: "DELETE" });
  },
  getProgressSummary() {
    return request<ProgressSummaryResponse>("/progress/summary");
  },
  createWeightEntry(input: CreateWeightEntryRequest) {
    return request<{ id: string; userId: string; date: string; weightKg: number; createdAt: string }>("/progress/weight", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }
};
