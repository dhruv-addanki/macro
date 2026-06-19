import { z } from "zod";

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const SourceTypeSchema = z.enum([
  "barcode",
  "manual",
  "ai_photo",
  "ai_text",
  "recipe",
  "saved_meal"
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const MacroNutrientsSchema = z.object({
  calories: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
  sugarG: z.number().min(0).optional(),
  fiberG: z.number().min(0),
  sodiumMg: z.number().min(0)
});
export type MacroNutrients = z.infer<typeof MacroNutrientsSchema>;

export const NutritionGoalSchema = MacroNutrientsSchema.extend({
  id: z.string(),
  effectiveFrom: z.string()
});
export type NutritionGoal = z.infer<typeof NutritionGoalSchema>;

export const ServingUnitSchema = z.object({
  id: z.string(),
  foodItemId: z.string().optional(),
  unitName: z.string(),
  gramsPerUnit: z.number().positive(),
  source: z.enum(["label", "database", "estimated", "user"]),
  confidence: ConfidenceSchema,
  notes: z.string().optional()
});
export type ServingUnit = z.infer<typeof ServingUnitSchema>;

export const FoodItemSchema = z.object({
  id: z.string(),
  ownerUserId: z.string().nullable().optional(),
  sourceType: z.enum(["generic", "branded", "custom", "ai", "recipe"]),
  name: z.string(),
  brand: z.string().nullable().optional(),
  verified: z.boolean(),
  per100g: MacroNutrientsSchema,
  servingUnits: z.array(ServingUnitSchema)
});
export type FoodItem = z.infer<typeof FoodItemSchema>;

export const DiaryEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: z.string(),
  mealGroupId: z.string(),
  foodItemId: z.string().nullable().optional(),
  displayName: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  grams: z.number().positive(),
  macros: MacroNutrientsSchema,
  sourceType: SourceTypeSchema,
  confidence: ConfidenceSchema.optional(),
  assumptions: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type DiaryEntry = z.infer<typeof DiaryEntrySchema>;

export const MealGroupSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  sortOrder: z.number(),
  isDefault: z.boolean()
});
export type MealGroup = z.infer<typeof MealGroupSchema>;

export const DiaryMealSchema = z.object({
  mealGroup: MealGroupSchema,
  entries: z.array(DiaryEntrySchema),
  totals: MacroNutrientsSchema
});
export type DiaryMeal = z.infer<typeof DiaryMealSchema>;

export const DiaryDaySchema = z.object({
  date: z.string(),
  goal: NutritionGoalSchema,
  meals: z.array(DiaryMealSchema),
  totals: MacroNutrientsSchema,
  remaining: MacroNutrientsSchema
});
export type DiaryDay = z.infer<typeof DiaryDaySchema>;

export const IngredientEstimateSchema = z.object({
  name: z.string(),
  estimatedWeightG: z.number().min(0),
  macros: MacroNutrientsSchema,
  confidence: ConfidenceSchema.optional()
});
export type IngredientEstimate = z.infer<typeof IngredientEstimateSchema>;

export const MealEstimateSchema = z.object({
  dishName: z.string(),
  mealGroupGuess: z.string().optional(),
  portion: z.object({
    quantity: z.number().positive(),
    unit: z.string(),
    estimatedWeightG: z.number().positive()
  }),
  macros: MacroNutrientsSchema,
  calorieRange: z.object({
    min: z.number().min(0),
    max: z.number().min(0)
  }),
  confidence: ConfidenceSchema,
  ingredients: z.array(IngredientEstimateSchema),
  assumptions: z.array(z.string()),
  quickEdits: z.array(z.string()),
  clarifyingQuestion: z.string().nullable()
});
export type MealEstimate = z.infer<typeof MealEstimateSchema>;

export const MealPhotoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  storageKey: z.string(),
  thumbnailKey: z.string().nullable().optional(),
  retained: z.boolean(),
  source: z.enum(["camera", "library", "upload", "url", "unknown"]),
  mimeType: z.string().nullable().optional(),
  byteLength: z.number().int().nonnegative().nullable().optional(),
  uploadedAt: z.string()
});
export type MealPhoto = z.infer<typeof MealPhotoSchema>;

export const AIEstimateLogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  inputType: z.enum(["text", "photo", "correction", "saved_meal_match"]),
  model: z.string(),
  promptVersion: z.string(),
  inputContext: z.string().nullable().optional(),
  output: MealEstimateSchema,
  confidence: ConfidenceSchema,
  assumptions: z.array(z.string()),
  usedFallback: z.boolean(),
  createdAt: z.string()
});
export type AIEstimateLog = z.infer<typeof AIEstimateLogSchema>;

export const UserCorrectionLogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  aiEstimateId: z.string().nullable().optional(),
  correctionText: z.string(),
  before: MealEstimateSchema,
  after: MealEstimateSchema,
  correctionType: z.string(),
  createdAt: z.string()
});
export type UserCorrectionLog = z.infer<typeof UserCorrectionLogSchema>;

export const SavedMealSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  entries: z.array(DiaryEntrySchema),
  totals: MacroNutrientsSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type SavedMeal = z.infer<typeof SavedMealSchema>;

export const RecipeIngredientSchema = z.object({
  id: z.string(),
  foodItemId: z.string().nullable().optional(),
  displayName: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  grams: z.number().positive(),
  macros: MacroNutrientsSchema
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  servings: z.number().positive(),
  totalCookedWeightG: z.number().positive().optional(),
  ingredients: z.array(RecipeIngredientSchema),
  totals: MacroNutrientsSchema,
  perServing: MacroNutrientsSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const WeightEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: z.string(),
  weightKg: z.number().positive(),
  createdAt: z.string()
});
export type WeightEntry = z.infer<typeof WeightEntrySchema>;

export const UserProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  onboardingCompleted: z.boolean(),
  birthYear: z.number().int().min(1900).max(2100).optional(),
  sex: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  heightCm: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  targetWeightKg: z.number().positive().optional(),
  goalType: z.enum(["cut", "maintain", "bulk", "general_health"]),
  activityLevel: z.enum(["low", "moderate", "high"]),
  unitSystem: z.enum(["imperial", "metric"])
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const ProgressSummarySchema = z.object({
  calories7DayAverage: z.number().min(0),
  protein7DayAverage: z.number().min(0),
  loggedDaysLast7: z.number().min(0),
  weightEntries: z.array(WeightEntrySchema),
  latestWeightKg: z.number().positive().nullable(),
  dailyCalories: z.array(
    z.object({
      date: z.string(),
      calories: z.number().min(0),
      proteinG: z.number().min(0)
    })
  )
});
export type ProgressSummary = z.infer<typeof ProgressSummarySchema>;
