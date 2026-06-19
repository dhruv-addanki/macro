-- Add indexes for the direct Prisma-backed mobile API read paths.
CREATE INDEX "NutritionGoal_userId_effectiveFrom_createdAt_idx" ON "NutritionGoal"("userId", "effectiveFrom", "createdAt");
CREATE INDEX "MealGroup_userId_sortOrder_idx" ON "MealGroup"("userId", "sortOrder");

CREATE INDEX "FoodItem_ownerUserId_name_idx" ON "FoodItem"("ownerUserId", "name");
CREATE INDEX "FoodItem_verified_name_idx" ON "FoodItem"("verified", "name");
CREATE INDEX "FoodItem_sourceType_idx" ON "FoodItem"("sourceType");

CREATE INDEX "FavoriteFood_userId_createdAt_idx" ON "FavoriteFood"("userId", "createdAt");
CREATE INDEX "FavoriteFood_foodItemId_idx" ON "FavoriteFood"("foodItemId");

CREATE INDEX "BarcodeProduct_foodItemId_idx" ON "BarcodeProduct"("foodItemId");
CREATE INDEX "ServingUnit_foodItemId_idx" ON "ServingUnit"("foodItemId");

CREATE INDEX "DiaryEntry_userId_date_createdAt_idx" ON "DiaryEntry"("userId", "date", "createdAt");
CREATE INDEX "DiaryEntry_userId_foodItemId_createdAt_idx" ON "DiaryEntry"("userId", "foodItemId", "createdAt");
CREATE INDEX "DiaryEntry_userId_sourceType_idx" ON "DiaryEntry"("userId", "sourceType");
CREATE INDEX "DiaryEntry_mealGroupId_idx" ON "DiaryEntry"("mealGroupId");
CREATE INDEX "DiaryEntry_foodItemId_idx" ON "DiaryEntry"("foodItemId");

CREATE INDEX "MealPhoto_userId_retained_uploadedAt_idx" ON "MealPhoto"("userId", "retained", "uploadedAt");
CREATE INDEX "MealPhoto_retained_uploadedAt_idx" ON "MealPhoto"("retained", "uploadedAt");

CREATE INDEX "AIEstimate_userId_createdAt_idx" ON "AIEstimate"("userId", "createdAt");
CREATE INDEX "AIEstimate_userId_inputType_createdAt_idx" ON "AIEstimate"("userId", "inputType", "createdAt");
CREATE INDEX "AIEstimate_diaryEntryId_idx" ON "AIEstimate"("diaryEntryId");
CREATE INDEX "AIEstimate_mealPhotoId_idx" ON "AIEstimate"("mealPhotoId");

CREATE INDEX "UserCorrection_userId_createdAt_idx" ON "UserCorrection"("userId", "createdAt");
CREATE INDEX "UserCorrection_aiEstimateId_idx" ON "UserCorrection"("aiEstimateId");

CREATE INDEX "AIUsageEvent_userId_status_createdAt_idx" ON "AIUsageEvent"("userId", "status", "createdAt");

CREATE INDEX "SavedMeal_userId_updatedAt_createdAt_idx" ON "SavedMeal"("userId", "updatedAt", "createdAt");
CREATE INDEX "SavedMealItem_savedMealId_idx" ON "SavedMealItem"("savedMealId");
CREATE INDEX "SavedMealItem_foodItemId_idx" ON "SavedMealItem"("foodItemId");

CREATE INDEX "Recipe_userId_updatedAt_createdAt_idx" ON "Recipe"("userId", "updatedAt", "createdAt");
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");
CREATE INDEX "RecipeIngredient_foodItemId_idx" ON "RecipeIngredient"("foodItemId");

CREATE INDEX "WeightEntry_userId_date_createdAt_idx" ON "WeightEntry"("userId", "date", "createdAt");
