# Macro PRD

## 1. Product Summary

Macro is a calorie, macro, and nutrition tracking app for people who want the familiar simplicity of MyFitnessPal but with a much smarter logging layer.

The app should make it easy to track:

- Calories.
- Protein, carbs, and fat.
- Fiber, sodium, sugar, and micronutrients where available.
- Meals split by breakfast, lunch, dinner, snacks, and custom meal groups.
- Packaged foods through barcode scanning.
- Homemade, mixed, cultural, and restaurant meals through photo and text context.

The key product difference is intelligence. Existing calorie trackers work well when the user has a barcode or when the exact food exists in a database. They break down when the user eats real meals: khichdi, dal rice, paneer sabzi, homemade bowls, meal prep, leftovers, mixed restaurant meals, or dishes where a photo plus context is enough for a human or modern model to estimate.

Macro should treat logging as an assisted estimation workflow, not only a database lookup.

## 2. Product Thesis

Most calorie trackers are database-first. Macro should be context-first.

The app should combine:

- Verified nutrition data when available.
- User context when the food is homemade or ambiguous.
- AI vision for meal recognition.
- AI reasoning for portion and unit conversion.
- Structured corrections from the user.
- Personal memory of repeated meals and usual portions.

The product should never pretend every estimate is exact. It should make uncertainty visible and make correction fast.

## 3. Target Users

### 3.1 Primary User

Fitness-focused users who already understand calories and macros and want faster, cleaner tracking.

Common traits:

- Tracks calories regularly or has done so in the past.
- Cares about protein and macro split.
- Eats a mix of packaged food, home-cooked food, restaurant food, and meal prep.
- Gets frustrated searching nutrition databases.
- Wants speed without losing control.

### 3.2 Important User Segment

Users who eat cultural or homemade meals that are underrepresented in food databases.

Examples:

- Indian meals: khichdi, dal, sabzi, roti, paneer, dosa, idli, poha, biryani.
- Mixed bowls and leftovers.
- Family-cooked foods with variable ingredients.
- Restaurant meals with customized ingredients.

### 3.3 Secondary User

Casual health users who want simple calorie awareness but do not want to manually search for every food.

The app should support them, but the MVP should optimize for the power user first because they will stress-test accuracy, correction, and workflow quality.

## 4. Problem Statement

Current macro trackers have three major issues:

1. Database search is noisy.
   Users often see many similar entries with different calories and serving sizes.

2. Meal photos are not intelligent enough.
   Simple foods may work, but mixed or cultural dishes often fail or return useless results.

3. Barcode scan is too literal.
   It reads the package serving size, but it often does not help users convert to real-world portions like cups, filets, bowls, pieces, cooked weight, or meal-prep servings.

Macro should solve these by making logging adaptive:

- If the food is packaged, use verified label data.
- If the food is homemade, use image plus context.
- If the serving unit is awkward, convert it intelligently.
- If the estimate is uncertain, show assumptions and let the user correct it.
- If the user repeats the meal, remember their version.

## 5. Product Goals

### 5.1 Functional Goals

- Let users track daily calories and macros by meal.
- Make the default diary clean, fast, and familiar.
- Support barcode logging for packaged foods.
- Support photo-based meal estimation.
- Support text-based meal estimation.
- Support manual food search and creation.
- Support saved meals, recipes, favorites, and recent foods.
- Let users edit serving size, units, ingredients, and macros.
- Store user corrections and reuse them.
- Show assumptions and confidence for AI-generated estimates.

### 5.2 Experience Goals

- Logging should take fewer taps than MyFitnessPal for common flows.
- Barcode scans should feel instant when the product exists.
- Photo logging should feel like a conversation with a smart nutrition assistant, but without becoming chat-first.
- AI results should be editable, not final.
- The UI should feel clean, dense, and practical rather than gimmicky.

### 5.3 Intelligence Goals

- Recognize mixed meals better than database-first trackers.
- Use user-provided context as a first-class signal.
- Estimate practical portion sizes.
- Convert package serving sizes into human-friendly units.
- Improve repeated meal estimates using personal food history.
- Escalate to stronger models only when needed.

## 6. Non-Goals For MVP

- Full medical nutrition coaching.
- Disease-specific recommendations.
- Allergy safety guarantees.
- Fully automated meal logging without user approval.
- Perfect micronutrient tracking for every AI-estimated meal.
- Social feed.
- Meal delivery or grocery ordering.
- Wearable integrations beyond optional later Apple Health import.
- Full MyFitnessPal data import unless technically feasible later.

## 7. Core Product Principles

1. Verified data beats AI.
   If barcode or label data exists, use it as the source of truth.

2. AI estimates must be transparent.
   Every AI meal should include assumptions, confidence, and editable fields.

3. Corrections are part of the product.
   User edits should be easy and should improve future results.

4. The diary is the home base.
   Intelligence should improve logging, not replace the nutrition tracker.

5. Fast paths matter.
   Recent foods, favorites, saved meals, and copy-from-yesterday should be excellent.

6. Cultural foods are a core use case.
   The model and evaluation set should include Indian and other mixed home-cooked meals from the start.

## 8. MVP Feature Requirements

## 8.1 Authentication And Profile

### Requirements

- Users can create an account.
- Users can log in and out.
- Users can set profile information:
  - age range or birthdate
  - sex
  - height
  - weight
  - activity level
  - goal: cut, maintain, bulk, general health
  - target rate of change where relevant
- Users can set or override calorie and macro targets manually.

### MVP Decision

The app should support calculated recommendations, but manual override is mandatory. Fitness users often know their own targets.

For the prototype, auth can use passwordless local email sessions to validate account-gated flows without external credentials. Production can opt into Supabase Auth: the Expo app signs up/logs in through Supabase email/password, stores and refreshes the returned Supabase session, and the API verifies the bearer access token with Supabase before resolving the Macro user. The current repository includes a Prisma/Postgres schema, committed migrations, reference-data bootstrap, direct Prisma auth/session, profile/onboarding, diary entry, food/favorite, saved-meal, recipe, retained-photo metadata, progress weight-entry, AI estimate/correction history, and analytics event mutations in Prisma mode, direct Prisma reads for auth session resolution, `/me` profile state, barcode cache/unit suggestions, and the core mobile diary, food, saved-meal, recipe, progress, analytics, AI history, retained-photo, and personal matching screens, mobile manual barcode product creation/correction, model-backed barcode unit suggestions with deterministic fallback, targeted indexes for the direct Prisma mobile API paths, transaction-backed direct Prisma AI usage reservations/events, versioned AI prompt modules, fail-fast protection against whole-store snapshot persistence in Prisma mode, and local/Supabase retained-photo storage with short-lived signed/private read access; JSON and local disk remain the default local development stores. The earlier S3-compatible object storage path is preserved as an optional fallback provider, but Supabase Storage is the current target.

## 8.2 Onboarding

### Requirements

Onboarding should collect:

- Goal type.
- Current weight.
- Target weight, optional.
- Calorie target preference:
  - calculate for me
  - I know my target
- Macro target preference:
  - balanced
  - high protein
  - custom grams
- Default meal groups:
  - breakfast
  - lunch
  - dinner
  - snacks

### UX Notes

Do not make onboarding too long. Let users skip advanced fields and configure later.

## 8.3 Daily Diary

### Requirements

The daily diary is the main screen.

It should show:

- Date selector.
- Calories consumed vs target.
- Protein, carbs, and fat consumed vs target.
- Sugar, fiber, and sodium consumed vs target in the nutrition summary.
- Meal sections:
  - breakfast
  - lunch
  - dinner
  - snacks
  - custom meal groups managed from Profile
- Food entries under each meal.
- Meal-level totals.
- Daily totals.
- Floating or prominent add button.

### Food Entry Row

Each row should show:

- Food name.
- Serving amount.
- Calories.
- Protein, carbs, fat.
- Sugar/fiber/sodium on detail and edit surfaces where space allows.
- Optional confidence badge for AI estimates.

### Entry Actions

Users can:

- Edit serving.
- Edit macros.
- Move to another meal.
- Duplicate.
- Save as favorite.
- Delete.

### Meal Group Actions

Users can:

- Create custom meal groups.
- Rename meal groups.
- Reorder meal groups.
- Delete custom meal groups that do not contain entries.

## 8.4 Add Food Hub

When the user taps add, they should see focused options:

- Scan meal.
- Scan barcode.
- Search food.
- Type meal.
- Recent.
- Favorites.
- Saved meals.

The app should not hide intelligence behind menus. Camera and barcode should be first-class actions.

## 8.5 Manual Food Search

### Requirements

- Search internal cached foods.
- Search verified branded products.
- Search generic ingredients.
- Search user-created foods.
- Show recent and frequent matches first.
- Let users create a custom food if no result is right.

### Result Ranking

Rank by:

1. Exact user-created match.
2. Recently used food.
3. Verified barcode/branded product.
4. Common generic food.
5. Community or imported data if added later.

## 8.6 Barcode Scanner

### Requirements

The barcode scanner should:

- Scan UPC/EAN barcodes.
- Lookup product by barcode.
- Show product name, brand, image if available, and nutrition facts.
- Use package nutrition as source of truth.
- Let user select serving quantity and unit.
- Cache products after lookup.
- Let user correct product data.
- Let user create product manually if not found.

### Data Source Priority

1. Internal cached product by barcode.
2. Open Food Facts.
3. USDA FoodData Central branded foods.
4. User-created product.
5. Future paid barcode provider if needed.

### Smart Unit Conversion

The scanner should go beyond the package serving size.

Example:

Package says chicken serving is 4 oz.

The app should offer:

- 4 oz package serving.
- 100 g.
- 1 oz.
- 1 g.
- 1 chicken breast filet, estimated 170 g.
- 1 cup cooked chopped chicken, estimated 140 g.
- Custom amount.

For cereal:

- grams.
- package serving.
- cups, if density can be reasonably estimated.

For sauces:

- grams.
- ml.
- tablespoon.
- teaspoon.

### AI Role In Barcode Flow

AI should not invent nutrition facts when label data exists.

AI can:

- Normalize messy product names.
- Infer product category.
- Suggest practical household units.
- Estimate conversion weights for units not on the label.
- Explain assumptions.

## 8.7 Photo Meal Scanner

### Requirements

The user can:

- Take a meal photo.
- Add optional context before submission.
- Submit photo plus context.
- Receive a structured nutrition estimate.
- Review assumptions.
- Edit ingredients and portions.
- Log the meal to a selected meal group.
- Save the meal for future reuse.

### Context Prompt

The context field should be simple:

> Anything we should know?

Examples:

- "Rice and squash khichdi, homemade, one bowl."
- "Chicken, rice, black beans, no cheese."
- "Paneer sabzi with two rotis."
- "Meal prep chicken, sweet potato, broccoli."

### AI Output

The model should return:

- Dish name.
- Meal type guess.
- Ingredients.
- Estimated portion size.
- Estimated total weight.
- Calories.
- Protein.
- Carbs.
- Fat.
- Fiber, if possible.
- Sodium, if possible.
- Confidence.
- Calorie range.
- Assumptions.
- Suggested quick edits.
- One clarifying question only if necessary.

### Confidence Levels

Use:

- High: product label, saved user meal, or visually simple meal with strong context.
- Medium: common mixed meal with decent context.
- Low: unclear image, unknown ingredients, hidden oils/sauces, or missing portion cues.

### Clarifying Question Rule

Ask a question only if the answer likely changes calories by at least 15-20% or protein by at least 10 g.

Bad:

- "Can you tell me more?"

Good:

- "Was this made with added ghee/oil? That could change the estimate by 50-150 calories."

## 8.8 Text Meal Logging

### Requirements

The user can type a meal in natural language:

- "One bowl rice and squash khichdi with dal and a little ghee."
- "Two eggs, one toast, half avocado."
- "Chipotle bowl with chicken, white rice, black beans, corn, cheese."

The app should parse this into loggable entries with calories and macros.

### Why This Matters

Text logging gives the app an intelligent fallback when the user does not want to use the camera. It also supports voice logging later.

## 8.9 User Corrections

### Requirements

After any AI estimate, the user can correct:

- Portion size.
- Serving unit.
- Total weight.
- Ingredients.
- Preparation method.
- Oil/ghee/butter amount.
- Protein amount.
- Calories/macros directly.

### Quick Correction Examples

- "Bigger portion."
- "Half the rice."
- "No ghee."
- "More dal."
- "Add 150 g chicken."
- "Actually 2 bowls."

The app should update the structured entry immediately.

## 8.10 Saved Meals And Recipes

### Saved Meals

Users can save a logged meal as:

- "Mom's khichdi."
- "Post-workout shake."
- "Meal prep chicken bowl."
- "Usual Chipotle bowl."

Saved meals should preserve:

- Ingredients.
- Portions.
- Macros.
- User-specific serving units.
- AI assumptions.
- Correction history.

Users should be able to open a saved meal, rename it, remove preserved entries that no longer belong, see recalculated totals, and log the edited version to any meal group.

### Recipes

Recipes should support:

- ingredient list
- total cooked weight
- number of servings
- per-serving macros
- serving aliases like bowl, scoop, piece, container
- editing the saved ingredient list and serving math after creation

Recipes can come after the first MVP but should be part of the planned data model early.

## 8.11 Recent Foods And Favorites

### Requirements

- Recent foods should be accessible from the add flow.
- Frequent foods should rise in search.
- Favorites should be manually toggleable.
- Users should be able to copy foods from yesterday or another date.

This is critical for retention because most users eat repeated meals.

## 8.12 Nutrition Dashboard

### MVP Requirements

The dashboard should show:

- Daily calorie trend.
- Protein trend.
- Macro split.
- Weight trend if user enters weight.
- Weekly average calories.
- Adherence to target.

Do not overbuild analytics before logging is excellent.

## 9. Intelligence Requirements

## 9.1 Model Routing

Use OpenAI Responses API for AI workflows.

Recommended model distribution:

- `gpt-5.5` for complex photo meal scans, low-confidence meals, mixed cultural dishes, and high-judgment estimates.
- `gpt-5.4-mini` for text meal parsing, user corrections, barcode unit conversion, saved meal matching, and ordinary structured transformations.
- No model for deterministic math when verified nutrition data is available.
- Embeddings for finding similar saved meals, prior corrections, and user-specific food memory.

MVP simplification:

- Use `gpt-5.5` for photo meal estimates.
- Use `gpt-5.4-mini` for text, corrections, and unit conversion.
- Add dynamic escalation after enough eval data exists.

## 9.2 Structured Outputs

All AI calls that affect logs must return schema-valid JSON.

The app should not parse freeform model text for nutrition data.

Required schemas:

- `MealEstimate`.
- `IngredientEstimate`.
- `ServingUnitSuggestion`.
- `CorrectionResult`.
- `ClarifyingQuestion`.
- `SavedMealMatch`.

## 9.3 Grounding Rules

The AI layer should receive grounded nutrition data whenever possible:

- barcode product facts
- USDA ingredient facts
- Open Food Facts product data
- user saved meals
- prior corrections
- recipe data

The model should reason over this data, not replace it.

## 9.4 Personal Food Memory

The app should remember:

- repeated meals
- usual serving sizes
- preferred units
- common corrections
- cuisine patterns
- household recipes

Example:

If the user logs khichdi multiple times and repeatedly removes ghee, future khichdi estimates should assume little or no ghee unless context says otherwise.

## 9.5 AI Safety And Trust

Rules:

- Never present AI food estimates as exact.
- Always store assumptions.
- Always allow manual override.
- Use verified barcode data as source of truth.
- Do not give medical advice.
- Do not guarantee allergy safety.
- Do not diagnose or recommend disease-specific diets.
- Avoid shaming language.

## 10. Data Model Requirements

Core entities:

- User.
- NutritionGoal.
- DiaryDay.
- MealGroup.
- FoodEntry.
- FoodItem.
- BrandedProduct.
- BarcodeProduct.
- GenericFood.
- ServingUnit.
- Recipe.
- SavedMeal.
- MealPhoto.
- AIEstimate.
- UserCorrection.
- AIUsageEvent.
- AnalyticsEvent.
- WeightEntry.

### FoodEntry

Represents one logged item in the diary.

Fields:

- id
- user_id
- date
- meal_group_id
- food_item_id, nullable for custom AI meals
- display_name
- quantity
- unit
- grams
- calories
- protein_g
- carbs_g
- fat_g
- fiber_g
- sodium_mg
- source_type: barcode, manual, ai_photo, ai_text, recipe, saved_meal
- confidence
- created_at
- updated_at

### AIEstimate

Fields:

- id
- user_id
- food_entry_id
- input_type: photo, text, barcode_unit_conversion, correction
- model
- prompt_version
- input_context
- output_json
- calories_min
- calories_max
- confidence
- assumptions
- source_refs
- created_at

### MealPhoto

Fields:

- id
- user_id
- storage_key
- thumbnail_key
- retained
- source: camera, library, upload, url, unknown
- mime_type
- byte_length
- uploaded_at

Raw meal photo retention should default to off. If a user opts in, retained photos must be visible from account/profile settings and deletable by the user.

### UserCorrection

Fields:

- id
- user_id
- ai_estimate_id
- correction_text
- before_json
- after_json
- correction_type
- created_at

### AIUsageEvent

Fields:

- id
- user_id
- endpoint
- input_type: photo, text, correction, saved_meal_match
- model
- prompt_version
- status: accepted, blocked, failed
- used_fallback
- cost_units
- reason
- created_at

### AnalyticsEvent

Fields:

- id
- user_id
- event_type: food_logged, ai_estimate_logged, ai_correction_applied, barcode_lookup, scan_failure, saved_meal_logged, recipe_logged
- status: success, failed
- source_type
- metadata_json
- created_at

## 11. API Requirements

### Auth

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /me`

### Diary

- `GET /diary?date=YYYY-MM-DD`
- `POST /diary/entries`
- `PATCH /diary/entries/:id`
- `DELETE /diary/entries/:id`
- `POST /diary/entries/:id/duplicate`

### Food Search

- `GET /foods/search?q=`
- `POST /foods/custom`
- `GET /foods/recent`
- `GET /foods/favorites`
- `POST /foods/:id/favorite`

### Barcode

- `POST /barcode/lookup`
- `POST /barcode/products`
- `PATCH /barcode/products/:id`
- `POST /barcode/unit-suggestions`

### AI Meal Logging

- `POST /ai/meal-photo/estimate`
- `POST /ai/meal-text/estimate`
- `POST /ai/meal/correct`
- `POST /ai/meal/save`
- `POST /ai/meal/match-saved`
- `GET /ai/usage`
- `GET /ai/meal-photos`
- `DELETE /ai/meal-photos/:id`

### Analytics

- `GET /analytics/summary`

### Recipes

- `GET /recipes`
- `POST /recipes`
- `PATCH /recipes/:id`
- `POST /recipes/:id/log`
- `DELETE /recipes/:id`

### Progress

- `GET /progress/summary`
- `POST /progress/weight`

## 12. UX Requirements

## 12.1 Design Direction

The UI should be:

- clean
- fast
- dense but readable
- utilitarian
- premium
- not playful
- not overly illustrated

Avoid turning the app into a chat app. AI should appear as smart input and editable results.

## 12.2 Main Navigation

Recommended tabs:

- Diary
- Search/Add
- Progress
- Saved
- Profile

The add action should be prominent from Diary.

## 12.3 Diary Screen

Top:

- Date.
- Calories remaining or consumed.
- Macro bars.

Middle:

- Meal sections.
- Each section has add button.
- Each section has calories/macros subtotal.

Bottom:

- Quick add button.

## 12.4 AI Estimate Review Screen

Must show:

- Estimated meal name.
- Calories and macros.
- Portion estimate.
- Confidence.
- Assumptions.
- Ingredient breakdown.
- Quick edits.
- Log button.

The user should be able to log without reading a wall of text, but details should be one tap away.

## 13. Success Metrics

### Activation

- User logs first food.
- User logs first barcode item.
- User logs first AI meal.

### Retention

- Day 1 retention.
- Day 7 retention.
- Days logged per week.
- Average logs per active day.

### Logging Quality

- Median time to log barcode food.
- Median time to log photo meal.
- Percent of AI estimates accepted without edits.
- Percent of AI estimates edited.
- Average number of correction taps.
- Reuse rate of saved meals.
- Barcode scan failure rate.
- AI cost units per logged AI meal.

### Accuracy

- Calorie error vs benchmark meals.
- Protein error vs benchmark meals.
- Confidence calibration.
- Percent of low-confidence meals that ask useful clarifying questions.

## 14. Evaluation Plan

Create an internal test set:

- 50 packaged barcode foods.
- 50 simple whole-food meals.
- 50 Indian/home-cooked meals.
- 50 restaurant/customized meals.
- 50 meal-prep bowls.

Each item should have:

- image, if applicable
- user context
- known or best-estimate calories
- known or best-estimate macros
- expected confidence
- notes on ambiguity

Run evals for:

- photo only
- photo plus context
- text only
- barcode only
- barcode plus smart units

## 15. Launch Criteria

MVP is launchable when:

- A user can complete onboarding.
- A user can log a full day by meal.
- Barcode scanner works for common products.
- Photo scanner works for at least common meals and targeted cultural examples.
- User can edit any AI estimate.
- Saved meals work.
- Recent foods work.
- Daily totals are correct.
- Data persists reliably in the selected launch database.
- AI outputs are schema-valid.
- The app handles failed scans gracefully.

## 16. Key Open Questions

- Should the first version be iOS-only or cross-platform from day one?
- Should auth be email/password first or Apple/Google first?
- Should users be able to import MyFitnessPal history later?
- Should the first release include voice logging?
- Should community/shared foods exist, or should the app avoid community data at first?
- What is the acceptable monthly AI cost per active user?
- What should the default retention policy be for AI meal photos when private object storage is enabled?
