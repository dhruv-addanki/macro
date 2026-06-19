import { z } from "zod";
import {
  ConfidenceSchema,
  AIEstimateLogSchema,
  DiaryDaySchema,
  DiaryEntrySchema,
  FoodItemSchema,
  MacroNutrientsSchema,
  MealPhotoSchema,
  MealEstimateSchema,
  MealGroupSchema,
  ProgressSummarySchema,
  RecipeIngredientSchema,
  RecipeSchema,
  SavedMealSchema,
  ServingUnitSchema,
  SourceTypeSchema,
  UserCorrectionLogSchema,
  UserProfileSchema,
  WeightEntrySchema
} from "./nutrition";

export const CreateDiaryEntrySchema = z.object({
  date: z.string(),
  mealGroupId: z.string(),
  foodItemId: z.string().nullable().optional(),
  displayName: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  grams: z.number().positive(),
  macros: MacroNutrientsSchema,
  sourceType: SourceTypeSchema,
  confidence: ConfidenceSchema.optional(),
  assumptions: z.array(z.string())
});
export type CreateDiaryEntryInput = z.infer<typeof CreateDiaryEntrySchema>;

export const UpdateDiaryEntrySchema = CreateDiaryEntrySchema.partial();
export type UpdateDiaryEntryInput = z.infer<typeof UpdateDiaryEntrySchema>;

export const DiaryResponseSchema = DiaryDaySchema;
export type DiaryResponse = z.infer<typeof DiaryResponseSchema>;

export const CopyDiaryDayRequestSchema = z.object({
  fromDate: z.string(),
  toDate: z.string()
});
export type CopyDiaryDayRequest = z.infer<typeof CopyDiaryDayRequestSchema>;

export const CopyDiaryDayResponseSchema = z.object({
  entries: z.array(DiaryEntrySchema)
});
export type CopyDiaryDayResponse = z.infer<typeof CopyDiaryDayResponseSchema>;

export const FoodSearchResponseSchema = z.object({
  foods: z.array(FoodItemSchema)
});
export type FoodSearchResponse = z.infer<typeof FoodSearchResponseSchema>;

export const CreateCustomFoodRequestSchema = z.object({
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  per100g: MacroNutrientsSchema,
  servingUnit: z
    .object({
      unitName: z.string().min(1),
      gramsPerUnit: z.number().positive(),
      source: z.enum(["label", "database", "estimated", "user"]),
      confidence: ConfidenceSchema,
      notes: z.string().optional()
    })
    .optional()
});
export type CreateCustomFoodRequest = z.infer<typeof CreateCustomFoodRequestSchema>;

export const BarcodeLookupRequestSchema = z.object({
  barcode: z.string().min(4)
});
export type BarcodeLookupRequest = z.infer<typeof BarcodeLookupRequestSchema>;

export const BarcodeLookupResponseSchema = z.object({
  found: z.boolean(),
  food: FoodItemSchema.nullable(),
  barcode: z.string(),
  source: z.string().nullable(),
  servingUnits: z.array(ServingUnitSchema),
  message: z.string().optional()
});
export type BarcodeLookupResponse = z.infer<typeof BarcodeLookupResponseSchema>;

const ServingUnitInputSchema = z.object({
  id: z.string().optional(),
  unitName: z.string().min(1),
  gramsPerUnit: z.number().positive(),
  source: z.enum(["label", "database", "estimated", "user"]),
  confidence: ConfidenceSchema,
  notes: z.string().optional()
});

export const BarcodeProductRequestSchema = z.object({
  barcode: z.string().min(4),
  name: z.string().min(1),
  brand: z.string().nullable().optional(),
  per100g: MacroNutrientsSchema,
  servingUnits: z.array(ServingUnitInputSchema).optional(),
  verified: z.boolean().optional()
});
export type BarcodeProductRequest = z.infer<typeof BarcodeProductRequestSchema>;

export const BarcodeProductUpdateRequestSchema = BarcodeProductRequestSchema.omit({ barcode: true }).partial();
export type BarcodeProductUpdateRequest = z.infer<typeof BarcodeProductUpdateRequestSchema>;

export const BarcodeUnitSuggestionsRequestSchema = z
  .object({
    foodItemId: z.string().optional(),
    food: FoodItemSchema.optional()
  })
  .refine((input) => Boolean(input.foodItemId || input.food), {
    message: "foodItemId or food is required"
  });
export type BarcodeUnitSuggestionsRequest = z.infer<typeof BarcodeUnitSuggestionsRequestSchema>;

export const BarcodeUnitSuggestionsResponseSchema = z.object({
  servingUnits: z.array(ServingUnitSchema)
});
export type BarcodeUnitSuggestionsResponse = z.infer<typeof BarcodeUnitSuggestionsResponseSchema>;

export const TextMealEstimateRequestSchema = z.object({
  text: z.string().min(2),
  mealGroupId: z.string().optional(),
  date: z.string().optional()
});
export type TextMealEstimateRequest = z.infer<typeof TextMealEstimateRequestSchema>;

export const PhotoMealEstimateRequestSchema = z.object({
  imageBase64: z.string().optional(),
  imageUrl: z.string().url().optional(),
  context: z.string(),
  mealGroupId: z.string().optional(),
  date: z.string().optional(),
  retainPhoto: z.boolean().optional(),
  photoSource: z.enum(["camera", "library", "upload", "url", "unknown"]).optional(),
  mimeType: z.string().optional()
});
export type PhotoMealEstimateRequest = z.infer<typeof PhotoMealEstimateRequestSchema>;

export const MealEstimateResponseSchema = z.object({
  estimate: MealEstimateSchema,
  estimateId: z.string().optional(),
  mealPhoto: MealPhotoSchema.optional(),
  model: z.string(),
  promptVersion: z.string(),
  usedFallback: z.boolean()
});
export type MealEstimateResponse = z.infer<typeof MealEstimateResponseSchema>;

export const MealPhotosResponseSchema = z.object({
  mealPhotos: z.array(MealPhotoSchema)
});
export type MealPhotosResponse = z.infer<typeof MealPhotosResponseSchema>;

export const DeleteMealPhotoResponseSchema = z.object({
  ok: z.boolean(),
  deletedId: z.string()
});
export type DeleteMealPhotoResponse = z.infer<typeof DeleteMealPhotoResponseSchema>;

export const MealPhotoAccessResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string()
});
export type MealPhotoAccessResponse = z.infer<typeof MealPhotoAccessResponseSchema>;

export const CorrectionRequestSchema = z.object({
  estimate: MealEstimateSchema,
  estimateId: z.string().optional(),
  correctionText: z.string().min(1)
});
export type CorrectionRequest = z.infer<typeof CorrectionRequestSchema>;

export const CorrectionResponseSchema = z.object({
  estimate: MealEstimateSchema,
  estimateId: z.string().optional(),
  model: z.string(),
  promptVersion: z.string(),
  usedFallback: z.boolean()
});
export type CorrectionResponse = z.infer<typeof CorrectionResponseSchema>;

export const SavedMealMatchRequestSchema = z.object({
  query: z.string().min(2),
  limit: z.number().int().positive().max(10).default(5)
});
export type SavedMealMatchRequest = z.infer<typeof SavedMealMatchRequestSchema>;

export const SavedMealMatchSchema = z.object({
  id: z.string(),
  type: z.enum(["saved_meal", "recipe"]),
  name: z.string(),
  score: z.number().min(0).max(1),
  reason: z.string(),
  totals: MacroNutrientsSchema
});
export type SavedMealMatch = z.infer<typeof SavedMealMatchSchema>;

export const SavedMealMatchResponseSchema = z.object({
  matches: z.array(SavedMealMatchSchema)
});
export type SavedMealMatchResponse = z.infer<typeof SavedMealMatchResponseSchema>;

export const AIHistoryResponseSchema = z.object({
  estimates: z.array(AIEstimateLogSchema),
  corrections: z.array(UserCorrectionLogSchema)
});
export type AIHistoryResponse = z.infer<typeof AIHistoryResponseSchema>;

export const LogEstimateRequestSchema = z.object({
  estimate: MealEstimateSchema,
  estimateId: z.string().optional(),
  date: z.string(),
  mealGroupId: z.string(),
  sourceType: z.enum(["ai_photo", "ai_text"]),
  assumptions: z.array(z.string())
});
export type LogEstimateRequest = z.infer<typeof LogEstimateRequestSchema>;

export const SaveMealRequestSchema = z.object({
  name: z.string().min(1),
  entryIds: z.array(z.string()).min(1)
});
export type SaveMealRequest = z.infer<typeof SaveMealRequestSchema>;

export const UpdateSavedMealRequestSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    entryIds: z.array(z.string()).min(1).optional()
  })
  .refine((input) => input.name !== undefined || input.entryIds !== undefined, {
    message: "At least one saved meal field is required."
  });
export type UpdateSavedMealRequest = z.infer<typeof UpdateSavedMealRequestSchema>;

export const SavedMealsResponseSchema = z.object({
  savedMeals: z.array(SavedMealSchema)
});
export type SavedMealsResponse = z.infer<typeof SavedMealsResponseSchema>;

export const LogSavedMealRequestSchema = z.object({
  date: z.string(),
  mealGroupId: z.string()
});
export type LogSavedMealRequest = z.infer<typeof LogSavedMealRequestSchema>;

export const CreateRecipeRequestSchema = z.object({
  name: z.string().min(1),
  servings: z.number().positive(),
  totalCookedWeightG: z.number().positive().optional(),
  ingredients: z.array(RecipeIngredientSchema).min(1)
});
export type CreateRecipeRequest = z.infer<typeof CreateRecipeRequestSchema>;

export const UpdateRecipeRequestSchema = CreateRecipeRequestSchema.partial();
export type UpdateRecipeRequest = z.infer<typeof UpdateRecipeRequestSchema>;

export const RecipesResponseSchema = z.object({
  recipes: z.array(RecipeSchema)
});
export type RecipesResponse = z.infer<typeof RecipesResponseSchema>;

export const ProgressSummaryResponseSchema = ProgressSummarySchema;
export type ProgressSummaryResponse = z.infer<typeof ProgressSummaryResponseSchema>;

export const CreateWeightEntryRequestSchema = z.object({
  date: z.string(),
  weightKg: z.number().positive()
});
export type CreateWeightEntryRequest = z.infer<typeof CreateWeightEntryRequestSchema>;

export const WeightEntryResponseSchema = WeightEntrySchema;
export type WeightEntryResponse = z.infer<typeof WeightEntryResponseSchema>;

export const MeResponseSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  profile: UserProfileSchema,
  goal: MacroNutrientsSchema.extend({
    id: z.string(),
    effectiveFrom: z.string()
  }),
  mealGroups: z.array(z.object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    sortOrder: z.number(),
    isDefault: z.boolean()
  }))
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const MealGroupsResponseSchema = z.object({
  mealGroups: z.array(MealGroupSchema)
});
export type MealGroupsResponse = z.infer<typeof MealGroupsResponseSchema>;

export const CreateMealGroupRequestSchema = z.object({
  name: z.string().trim().min(1).max(40)
});
export type CreateMealGroupRequest = z.infer<typeof CreateMealGroupRequestSchema>;

export const UpdateMealGroupRequestSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  sortOrder: z.number().int().positive().optional()
});
export type UpdateMealGroupRequest = z.infer<typeof UpdateMealGroupRequestSchema>;

export const ReorderMealGroupsRequestSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1)
});
export type ReorderMealGroupsRequest = z.infer<typeof ReorderMealGroupsRequestSchema>;

export const CompleteOnboardingRequestSchema = z.object({
  displayName: z.string().min(1).optional(),
  birthYear: z.number().int().min(1900).max(2100).optional(),
  sex: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  heightCm: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  targetWeightKg: z.number().positive().optional(),
  goalType: z.enum(["cut", "maintain", "bulk", "general_health"]),
  activityLevel: z.enum(["low", "moderate", "high"]),
  unitSystem: z.enum(["imperial", "metric"]),
  calorieTargetMode: z.enum(["calculate", "manual"]),
  macroPreference: z.enum(["balanced", "high_protein", "custom"]),
  calories: z.number().positive().optional(),
  proteinG: z.number().min(0).optional(),
  carbsG: z.number().min(0).optional(),
  fatG: z.number().min(0).optional()
});
export type CompleteOnboardingRequest = z.infer<typeof CompleteOnboardingRequestSchema>;

export const UpdateProfileRequestSchema = UserProfileSchema.omit({ id: true, userId: true }).partial();
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const UpdateGoalRequestSchema = MacroNutrientsSchema.partial();
export type UpdateGoalRequest = z.infer<typeof UpdateGoalRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable().optional()
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthSignupRequestSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).optional()
});
export type AuthSignupRequest = z.infer<typeof AuthSignupRequestSchema>;

export const AuthLoginRequestSchema = z.object({
  email: z.string().email()
});
export type AuthLoginRequest = z.infer<typeof AuthLoginRequestSchema>;

export const AuthLogoutRequestSchema = z.object({
  sessionToken: z.string().optional()
});
export type AuthLogoutRequest = z.infer<typeof AuthLogoutRequestSchema>;

export const AuthResponseSchema = z.object({
  user: AuthUserSchema,
  sessionToken: z.string()
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const AuthSessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: AuthUserSchema.nullable()
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const AIUsageEventSchema = z.object({
  id: z.string(),
  endpoint: z.string(),
  inputType: z.enum(["text", "photo", "correction", "saved_meal_match"]),
  model: z.string(),
  promptVersion: z.string(),
  status: z.enum(["accepted", "blocked", "failed"]),
  usedFallback: z.boolean().nullable(),
  costUnits: z.number().min(0),
  reason: z.string().nullable().optional(),
  createdAt: z.string()
});
export type AIUsageEvent = z.infer<typeof AIUsageEventSchema>;

export const AIUsageLimitSchema = z.object({
  endpoint: z.string(),
  limit: z.number().min(0),
  used: z.number().min(0),
  remaining: z.number().min(0),
  resetsAt: z.string()
});
export type AIUsageLimit = z.infer<typeof AIUsageLimitSchema>;

export const AIUsageSummaryResponseSchema = z.object({
  dailyBudgetUnits: z.number().min(0),
  usedTodayUnits: z.number().min(0),
  remainingTodayUnits: z.number().min(0),
  windowMs: z.number().min(0),
  limits: z.array(AIUsageLimitSchema),
  recentEvents: z.array(AIUsageEventSchema)
});
export type AIUsageSummaryResponse = z.infer<typeof AIUsageSummaryResponseSchema>;

const AnalyticsMetadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const AnalyticsEventSchema = z.object({
  id: z.string(),
  eventType: z.enum([
    "food_logged",
    "ai_estimate_logged",
    "ai_correction_applied",
    "barcode_lookup",
    "scan_failure",
    "saved_meal_logged",
    "recipe_logged"
  ]),
  status: z.enum(["success", "failed"]).nullable().optional(),
  sourceType: SourceTypeSchema.nullable().optional(),
  metadata: z.record(AnalyticsMetadataValueSchema),
  createdAt: z.string()
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

export const AnalyticsSummaryResponseSchema = z.object({
  totalLoggedEntries: z.number().min(0),
  loggedEntriesBySource: z.object({
    barcode: z.number().min(0),
    manual: z.number().min(0),
    ai_photo: z.number().min(0),
    ai_text: z.number().min(0),
    recipe: z.number().min(0),
    saved_meal: z.number().min(0)
  }),
  aiMealsLogged: z.number().min(0),
  aiEstimatesGenerated: z.number().min(0),
  aiEstimateAcceptanceRate: z.number().min(0).max(1).nullable(),
  aiCorrectionsApplied: z.number().min(0),
  aiCorrectionRate: z.number().min(0).max(1).nullable(),
  barcodeLookups: z.number().min(0),
  barcodeLookupFailures: z.number().min(0),
  barcodeFailureRate: z.number().min(0).max(1).nullable(),
  scanFailures: z.number().min(0),
  aiCostUnits: z.number().min(0),
  aiCostUnitsPerLoggedAiMeal: z.number().min(0).nullable(),
  recentEvents: z.array(AnalyticsEventSchema)
});
export type AnalyticsSummaryResponse = z.infer<typeof AnalyticsSummaryResponseSchema>;
