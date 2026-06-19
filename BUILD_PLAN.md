# Macro Build Plan

## 1. Build Strategy

Build Macro as a mobile-first app with a reliable nutrition diary first, then layer intelligence into the logging flows.

The app should not start as an AI demo. It should start as a good calorie tracker with excellent AI-assisted entry.

Recommended build order:

1. Core app shell and auth.
2. Diary, meal groups, and manual food entries.
3. Food search, recent foods, favorites, and custom foods.
4. Barcode scanner and product normalization.
5. AI text meal logging.
6. AI photo meal logging.
7. Corrections and saved meals.
8. Personal food memory and routing.
9. Evals, analytics, and polish.

## Current Prototype Status

As of June 19, 2026, the local prototype implements the main daily-tracker loop and the first intelligence flows:

- Expo app shell with account-gated routes, diary, add-food, saved, progress, profile, and onboarding screens.
- Local passwordless email sessions for zero-config signup, login, logout, and session-gated navigation, with hashed session tokens in the persisted local store and direct Prisma user/session mutations in Prisma mode.
- Opt-in Supabase Auth mode where the Expo app signs up/logs in through Supabase email/password, stores and refreshes the Supabase session, and the API validates Supabase bearer tokens server-side before resolving the Macro user.
- Session-scoped local data for profile, goals, configurable meal groups, diary entries, custom foods, favorites, saved meals, recipes, progress, AI history, corrections, retained meal photos, AI usage events, and analytics events.
- Diary organized by configurable meal groups with manual logging, edit, duplicate, delete, copy previous day, and daily macro plus sugar/fiber/sodium totals.
- Food search, recent foods, favorites, custom foods, saved meals, and recipes with sugar/fiber/sodium preserved through shared math, API storage, and mobile edit/review forms.
- Saved meal detail/edit support for renaming a reusable meal, selecting which preserved entry snapshots remain in it, recalculating totals, and logging the edited version into any configured meal group.
- Recipe detail/edit support for loading a recipe back into the builder, changing servings, cooked weight, and ingredients, recalculating per-serving nutrition, and logging the edited recipe.
- Barcode lookup with Open Food Facts fallback behavior, mobile manual product creation/correction, and smart serving-unit support.
- Text meal estimates, photo meal estimates, correction memory, estimate review/edit, and logging into meal groups.
- Versioned AI prompt modules for text estimates, photo estimates, corrections, barcode unit suggestions, and saved-meal matching, with prompt version IDs stored where the flow has durable AI estimate records.
- Env-configurable OpenAI model routing with GPT-5.5 as the default photo model and GPT-5.4 mini as the default text/correction/barcode-unit model.
- AI request accounting with per-endpoint rate limits, a daily budget, `429` responses, a Profile usage panel, and transaction-backed direct Prisma `AIUsageEvent` reservations/persistence in Prisma mode.
- Server-side OpenAI connectivity script for validating configured text, correction, barcode-unit, and photo model routes once real credentials are supplied.
- Local analytics summary for log acceptance, correction rate, barcode scan failures, source split, and AI cost per logged AI meal.
- Optional retained meal photo storage with profile visibility and user delete.
- Prisma 7 config, Postgres Docker Compose bootstrap, committed migrations, reference-data bootstrap, direct Prisma auth/session, profile/onboarding, meal-group management, diary entry, food/favorite, saved-meal, recipe, retained-photo metadata, progress weight-entry, AI estimate/correction history, analytics event, and AI usage event persistence in Prisma mode, direct Prisma reads for auth session resolution, `/me` profile state, barcode cache/unit suggestions, and the core mobile diary, food, saved-meal, recipe, progress, analytics, AI history, retained-photo, and personal matching surfaces, targeted indexes for the Prisma-backed mobile API paths, and fail-fast protection against accidental whole-store snapshot persistence in Prisma mode.
- Retained meal photo storage provider boundary with local disk as the zero-config default, Supabase Storage as the intended private object store, preserved optional S3-compatible support through API env vars, short-lived signed/private read access, basic MIME/size validation, image byte signature validation, and a dry-run-first retained-photo cleanup script.
- Expo SecureStore-backed native session token persistence with web fallback storage and guarded route hydration.
- JSON-file local persistence, API eval fixtures, unit/integration tests, and Expo web export verification.

This is still not production-ready. The remaining platform work is production Supabase Auth configuration and native-device auth refresh testing, provider-native photo lifecycle policy and malware scanning, native-device camera verification, production OpenAI verification, load testing/tuning the transactional rate-limit path, a production analytics pipeline, deployment, and explain-plan tuning under real data volume.

## 2. Recommended Stack

### Mobile

- Expo React Native.
- TypeScript.
- Expo Router.
- React Query for server state.
- Zustand or lightweight local store for temporary UI state.
- Native camera module for barcode and meal photos.

### Backend

- Node.js with TypeScript.
- REST API first for simplicity.
- Postgres database.
- Object storage for meal photos.
- Background job queue for slow enrichment tasks.
- OpenAI Responses API for model calls.

### Database

- Postgres.
- Prisma or Drizzle ORM.
- Migrations committed to the repo.

### Storage

- Supabase Storage private bucket for retained meal images, with the existing S3-compatible provider preserved as optional fallback code.
- Store original image only if user settings allow.
- Store compressed images for AI processing where possible.

### External Data

- Open Food Facts for barcode lookup.
- USDA FoodData Central for generic and branded food data.
- Internal normalized cache.

### Deployment

- API on Vercel, Fly.io, Render, or another Node-friendly host.
- Postgres on a managed provider.
- Mobile builds through EAS.

## 3. Monorepo Structure

Recommended project structure:

```text
Macro/
  apps/
    mobile/
      app/
      src/
        components/
        features/
        screens/
        navigation/
        api/
        stores/
        utils/
    api/
      src/
        modules/
        routes/
        services/
        jobs/
        lib/
  packages/
    shared/
      src/
        schemas/
        types/
        nutrition/
  prisma/
    schema.prisma
    migrations/
  docs/
  PRD.md
  BUILD_PLAN.md
  README.md
```

Keep shared nutrition schemas in `packages/shared` so the mobile app and API agree on AI response shapes and diary entry types.

## 4. Architecture Overview

```text
Mobile App
  -> API
    -> Postgres
    -> Object Storage
    -> Open Food Facts
    -> USDA FoodData Central
    -> OpenAI Responses API
```

The mobile app should never call OpenAI directly. All model calls go through the backend so prompts, API keys, model routing, and logging stay server-side.

## 5. Core Modules

## 5.1 Auth Module

Responsibilities:

- User registration.
- Login/logout.
- Session management.
- Current user profile.

Build notes:

- Use managed auth or a proven auth library.
- Do not build custom password security from scratch.
- Add Apple/Google login after the basic flow works.
- Current prototype uses passwordless local email sessions by default to exercise signup, login, logout, and account-gated navigation without external credentials. Set `MACRO_AUTH_DRIVER=supabase` on the API and `EXPO_PUBLIC_AUTH_DRIVER=supabase` in Expo to use Supabase Auth; the mobile app then sends the Supabase access token to the API as the bearer token.

## 5.2 Profile And Goal Module

Responsibilities:

- Store user profile.
- Store calorie target.
- Store macro targets.
- Store meal group preferences.
- Store units: imperial/metric.

Important:

- Allow manual calorie and macro override.
- Do not force users into calculated targets.

## 5.3 Diary Module

Responsibilities:

- Fetch diary by date.
- Create food entries.
- Update entries.
- Delete entries.
- Move entries between meals.
- Duplicate entries.
- Calculate meal totals.
- Calculate daily totals.

Implementation rule:

- Store calories/macros on the logged `FoodEntry`.
- Do not recalculate historical logs from changing food database records unless the user explicitly updates the entry.

## 5.4 Food Module

Responsibilities:

- Generic food search.
- Custom food creation.
- Recent foods.
- Favorites.
- User-created food library.

Search ranking:

1. User-created exact match.
2. Recent/frequent foods.
3. Favorites.
4. Verified branded products.
5. Generic foods.

## 5.5 Barcode Module

Responsibilities:

- Accept barcode value.
- Lookup cached product.
- Lookup Open Food Facts.
- Lookup USDA branded foods where relevant.
- Normalize product data.
- Store barcode product.
- Return serving options.

Do not let AI override verified label nutrition.

## 5.6 AI Meal Module

Responsibilities:

- Estimate meals from text.
- Estimate meals from photo plus text context.
- Apply user corrections.
- Suggest serving units.
- Match against saved meals.
- Generate assumptions and confidence.

Every AI endpoint must:

- use a versioned prompt
- use structured output
- log model used
- log input metadata
- store output JSON
- return confidence and assumptions

## 5.7 Saved Meal And Recipe Module

Responsibilities:

- Save logged meals.
- Reuse saved meals.
- Create recipes.
- Edit recipe ingredients.
- Calculate per-serving macros.
- Support user-specific serving aliases.

This module becomes the personal nutrition memory foundation.

## 5.8 Progress Module

Responsibilities:

- Weight entries.
- Weekly average calories.
- Macro adherence.
- Basic trend charts.

Build after logging is reliable.

## 6. Database Schema Plan

## 6.1 Tables

### users

- id
- email
- display_name
- created_at
- updated_at

### user_profiles

- id
- user_id
- height_cm
- weight_kg
- goal_type
- activity_level
- unit_system
- created_at
- updated_at

### nutrition_goals

- id
- user_id
- calories
- protein_g
- carbs_g
- fat_g
- sugar_g
- fiber_g
- sodium_mg
- effective_from
- created_at

### meal_groups

- id
- user_id
- name
- sort_order
- is_default

### food_items

- id
- owner_user_id, nullable
- source_type
- name
- brand
- calories_per_100g
- protein_per_100g
- carbs_per_100g
- fat_per_100g
- sugar_per_100g
- fiber_per_100g
- sodium_per_100g
- verified
- created_at
- updated_at

### barcode_products

- id
- barcode
- food_item_id
- external_source
- external_id
- raw_payload
- last_verified_at
- created_at
- updated_at

### serving_units

- id
- food_item_id
- unit_name
- grams_per_unit
- source
- confidence
- notes

### diary_entries

- id
- user_id
- date
- meal_group_id
- food_item_id, nullable
- display_name
- quantity
- unit
- grams
- calories
- protein_g
- carbs_g
- fat_g
- sugar_g
- fiber_g
- sodium_mg
- source_type
- confidence
- created_at
- updated_at

### meal_photos

- id
- user_id
- storage_key
- thumbnail_key
- source
- mime_type
- byte_length
- uploaded_at
- retained

### ai_estimates

- id
- user_id
- diary_entry_id, nullable
- meal_photo_id, nullable
- input_type
- model
- prompt_version
- input_context
- output_json
- confidence
- calories_min
- calories_max
- assumptions
- created_at

### user_corrections

- id
- user_id
- ai_estimate_id
- correction_text
- before_json
- after_json
- correction_type
- created_at

### saved_meals

- id
- user_id
- name
- description
- default_serving_name
- total_calories
- total_protein_g
- total_carbs_g
- total_fat_g
- total_sugar_g
- total_fiber_g
- total_sodium_mg
- created_at
- updated_at

### saved_meal_items

- id
- saved_meal_id
- food_item_id, nullable
- display_name
- quantity
- unit
- grams
- calories
- protein_g
- carbs_g
- fat_g
- sugar_g
- fiber_g
- sodium_mg

### weight_entries

- id
- user_id
- date
- weight_kg
- created_at

## 7. Nutrition Calculation Rules

Rules:

- Store base food nutrition per 100 g where possible.
- Convert serving units to grams.
- Calculate macros from grams and per-100 g values.
- Snapshot final macros into diary entries at log time.
- Preserve user-edited macros.
- Never silently change historical logs.

Macro calories:

- protein: 4 kcal/g
- carbs: 4 kcal/g
- fat: 9 kcal/g

Do not force calories to exactly equal macro-derived calories because product labels and food databases often differ.

## 8. AI Workflow Details

## 8.1 Photo Meal Estimate Flow

1. User takes photo.
2. App compresses image for upload.
3. API stores image temporarily.
4. API builds context:
   - user text
   - user cuisine preferences
   - recent similar meals
   - saved meal candidates
   - current meal group
5. API calls OpenAI with image and context.
6. Model returns `MealEstimate` JSON.
7. API validates JSON.
8. API stores `ai_estimates`.
9. App shows review screen.
10. User edits or logs.
11. Final `diary_entries` row is created.

## 8.2 MealEstimate Schema

```json
{
  "dish_name": "Rice and squash khichdi",
  "meal_group_guess": "lunch",
  "portion": {
    "quantity": 1,
    "unit": "medium bowl",
    "estimated_weight_g": 350
  },
  "calories": 410,
  "macros": {
    "protein_g": 14,
    "carbs_g": 68,
    "fat_g": 10,
    "sugar_g": 3.4,
    "fiber_g": 8,
    "sodium_mg": 600
  },
  "calorie_range": {
    "min": 330,
    "max": 520
  },
  "confidence": "medium",
  "ingredients": [
    {
      "name": "cooked rice",
      "estimated_weight_g": 170,
      "calories": 220,
      "protein_g": 4,
      "carbs_g": 48,
      "fat_g": 1,
      "sugar_g": 0.1,
      "fiber_g": 0.7,
      "sodium_mg": 2
    }
  ],
  "assumptions": [
    "Assumes a rice-heavy khichdi.",
    "Assumes about 1 tsp oil or ghee."
  ],
  "quick_edits": [
    "No ghee",
    "More dal",
    "Half portion",
    "Larger bowl"
  ],
  "clarifying_question": null
}
```

## 8.3 Text Meal Estimate Flow

1. User types meal.
2. API sends text plus recent/saved context to model.
3. Model returns `MealEstimate`.
4. User reviews and logs.

Use `gpt-5.4-mini` for this unless accuracy tests show a clear need for `gpt-5.5`.

## 8.4 Correction Flow

1. User enters correction.
2. API sends original estimate plus correction.
3. Model returns updated `MealEstimate`.
4. API stores `user_corrections`.
5. App updates review screen or logged entry.

Correction prompts should be short and deterministic.

Examples:

- "No ghee."
- "This was 2 bowls."
- "More dal, less rice."
- "Add 150g chicken."

## 8.5 Barcode Unit Suggestion Flow

1. Barcode product is found.
2. API classifies product category.
3. API uses known densities or category rules where possible.
4. If needed, model suggests practical serving units.
5. Suggestions are stored with confidence.

Example output:

```json
{
  "serving_units": [
    {
      "unit_name": "package serving",
      "grams_per_unit": 112,
      "source": "label",
      "confidence": "high"
    },
    {
      "unit_name": "1 cup cooked chopped",
      "grams_per_unit": 140,
      "source": "estimated",
      "confidence": "medium"
    }
  ]
}
```

## 9. Prompt Versioning

Store prompts as versioned files:

```text
apps/api/src/modules/ai/prompts/
  mealPhotoEstimate.v1.ts
  mealTextEstimate.v1.ts
  correction.v1.ts
  barcodeUnits.v1.ts
  savedMealMatch.v1.ts
```

Each AI call stores:

- prompt name
- prompt version
- model
- schema version
- input summary
- output JSON

The current implementation stores prompt versions for meal-photo, meal-text, correction, and saved-meal-match flows, and uses `barcode-units.v1` for model-backed barcode unit suggestions when OpenAI is configured. Barcode units still keep deterministic category rules as the no-key and model-failure fallback.

## 10. Model Routing Plan

### MVP Routing

- Photo meal estimate: `gpt-5.5`.
- Text meal estimate: `gpt-5.4-mini`.
- Correction: `gpt-5.4-mini`.
- Barcode unit suggestions: `gpt-5.4-mini`.
- Saved meal matching: embeddings plus `gpt-5.4-mini` if needed.

### Later Routing

Add a router that considers:

- image clarity
- dish complexity
- user-provided context
- whether saved meal match exists
- whether meal includes cultural/mixed dishes
- confidence from first pass

Escalate to `gpt-5.5` when:

- first-pass confidence is low
- calorie range is too wide
- protein estimate is highly uncertain
- dish is mixed and culturally specific
- user asks for a re-estimate

## 11. Backend API Plan

## 11.1 Routes

```text
GET    /health
GET    /me
POST   /me/meal-groups
PATCH  /me/meal-groups/:id
DELETE /me/meal-groups/:id
POST   /me/meal-groups/reorder

GET    /diary
POST   /diary/entries
PATCH  /diary/entries/:id
DELETE /diary/entries/:id
POST   /diary/entries/:id/duplicate

GET    /foods/search
GET    /foods/recent
GET    /foods/favorites
POST   /foods/custom
POST   /foods/:id/favorite

POST   /barcode/lookup
POST   /barcode/unit-suggestions

POST   /ai/meal-photo/estimate
POST   /ai/meal-text/estimate
POST   /ai/meal/correct
POST   /ai/meal/save
POST   /ai/meal/match-saved
GET    /ai/usage
GET    /ai/meal-photos
DELETE /ai/meal-photos/:id

GET    /saved-meals
POST   /saved-meals
PATCH  /saved-meals/:id
POST   /saved-meals/:id/log
DELETE /saved-meals/:id

GET    /recipes
POST   /recipes
PATCH  /recipes/:id
POST   /recipes/:id/log
DELETE /recipes/:id

GET    /progress/summary
POST   /progress/weight

GET    /analytics/summary
```

## 11.2 API Standards

- Use typed request and response schemas.
- Validate every request.
- Return stable error codes.
- Log AI failures separately from user errors.
- Keep OpenAI keys server-side only.
- Add rate limits, daily request budgets, and `429` reset metadata to AI endpoints.

## 12. Mobile App Plan

## 12.1 Screens

### Onboarding

- Welcome.
- Goal setup.
- Calorie target.
- Macro target.
- Default meal groups.

### Diary

- Daily summary.
- Meal sections.
- Food entry rows.
- Add food action.

### Add Food

- Scan meal.
- Scan barcode.
- Search.
- Type.
- Recent.
- Favorites.
- Saved meals.

### Barcode Result

- Product details.
- Serving selector.
- Smart units.
- Log button.

### Photo Scan

- Camera.
- Context field.
- Retain photo toggle.
- Loading state.
- Estimate review.

### Estimate Review

- Calories/macros.
- Confidence.
- Portion.
- Assumptions.
- Ingredient breakdown.
- Quick edits.
- Log/save.

### Food Search

- Search input.
- Results.
- Recent/favorites tabs.
- Custom food creation.

### Saved Meals

- List.
- Detail.
- Edit.
- Log.

### Progress

- Weekly calories.
- Protein trend.
- Weight trend.

### Profile

- Goals.
- Units.
- Privacy.
- AI settings.

## 12.2 UI Components

Core components:

- `MacroRing` or macro bar summary.
- `MealSection`.
- `FoodEntryRow`.
- `ServingSelector`.
- `NutritionFactsPanel`.
- `ConfidenceBadge`.
- `AssumptionList`.
- `QuickEditChips`.
- `CameraCapture`.
- `BarcodeScanner`.
- `SearchResultRow`.
- `SavedMealCard`.

## 13. Milestones

## Milestone 0: Project Setup

Deliverables:

- Monorepo initialized.
- Mobile app scaffolded.
- API scaffolded.
- Shared package set up.
- Database schema initialized.
- Environment variable docs.
- Basic CI checks.

Acceptance:

- Mobile app launches locally.
- API health endpoint works.
- Database migration runs.

## Milestone 1: Auth, Profile, Goals

Deliverables:

- Signup/login.
- Profile setup.
- Nutrition goals.
- Meal group defaults.

Acceptance:

- User can create account.
- User can set calorie and macro targets.
- User sees empty diary.

## Milestone 2: Diary Core

Deliverables:

- Diary by date.
- Meal sections.
- Add manual entry.
- Edit/delete entry.
- Daily totals.
- Meal totals.

Acceptance:

- User can log a full day manually.
- Totals update correctly.
- Entries persist.

## Milestone 3: Food Search And Recents

Deliverables:

- Food search.
- Custom foods.
- Recent foods.
- Favorites.

Acceptance:

- User can find or create foods.
- Recent foods appear after logging.
- Favorites are reusable.

## Milestone 4: Barcode Scanner

Deliverables:

- Camera barcode scanner.
- Barcode lookup endpoint.
- Open Food Facts integration.
- USDA fallback.
- Product normalization.
- Serving selector.

Acceptance:

- User can scan common packaged foods.
- Product is cached.
- User can log package serving or custom amount.

## Milestone 5: Barcode Intelligence

Deliverables:

- Smart serving units.
- Product category classification.
- Unit confidence.
- User correction for units.

Acceptance:

- Chicken, cereal, sauces, drinks, and snacks show practical units.
- Label nutrition remains source of truth.

## Milestone 6: Text Meal AI

Deliverables:

- Text meal estimate endpoint.
- Structured output schema.
- Estimate review screen.
- Log from estimate.

Acceptance:

- User can type a meal and log it.
- Output includes macros, confidence, assumptions.
- User can edit before logging.

## Milestone 7: Photo Meal AI

Deliverables:

- Photo capture.
- Image upload.
- Photo estimate endpoint.
- Vision model call.
- Estimate review with ingredients and assumptions.

Acceptance:

- User can photograph a meal and log estimate.
- Khichdi-style mixed meal with context produces useful estimate.
- Failed/low-confidence scans are handled gracefully.

## Milestone 8: Corrections

Deliverables:

- Natural-language correction endpoint.
- Quick edit chips.
- Manual ingredient and portion edits.
- Correction history.

Acceptance:

- User can say "no ghee" or "2 bowls" and estimate updates.
- Correction is stored.
- Final logged entry reflects corrected macros.

## Milestone 9: Saved Meals And Personal Memory

Deliverables:

- Save AI/manual meals.
- Reuse saved meals.
- Similar saved meal matching.
- User-specific defaults.

Acceptance:

- User can save "Mom's khichdi."
- Future khichdi logs can suggest the saved version.

## Milestone 10: Progress And Polish

Deliverables:

- Weekly calorie average.
- Macro trend.
- Weight entries.
- Empty states.
- Loading states.
- Error states.
- Performance cleanup.

Acceptance:

- App feels usable as a daily tracker.
- No broken core flows.

## 14. Testing Plan

## 14.1 Unit Tests

Test:

- nutrition calculations
- serving conversions
- diary totals
- schema validation
- barcode normalization
- AI response parsing

## 14.2 Integration Tests

Test:

- create diary entry
- update diary entry
- barcode lookup
- AI text estimate
- AI correction
- saved meal reuse

## 14.3 Mobile Flow Tests

Test:

- onboarding
- manual log
- barcode log
- text meal log
- photo meal log
- edit entry
- delete entry

## 14.4 AI Evals

Create fixtures:

```text
evals/
  barcode/
  text-meals/
  photo-meals/
  corrections/
```

Each eval includes:

- input
- expected macro range
- expected confidence
- expected assumptions
- unacceptable errors

Run evals before changing prompts or models.

## 15. Privacy And Security

Requirements:

- Do not expose OpenAI keys to mobile app.
- Store meal photos securely.
- Let users delete meal photos.
- Default raw photo retention to off unless the user opts in.
- Encrypt sensitive tokens.
- Hash local development session tokens before persisting them.
- Rate-limit AI endpoints.
- Avoid storing unnecessary prompt data.
- Make it clear that AI estimates are not medical advice.

## 16. Performance Requirements

Targets:

- Diary load under 500 ms after auth on normal connection.
- Barcode result under 2 seconds when cached.
- Barcode result under 5 seconds when external lookup is needed.
- Text meal estimate under 5 seconds.
- Photo meal estimate ideally under 10 seconds.

Use loading states that show progress:

- Uploading photo.
- Analyzing meal.
- Estimating macros.

## 17. Error Handling

Barcode failures:

- Product not found.
- External API unavailable.
- Bad barcode.
- Missing nutrition data.

Photo failures:

- Upload failed.
- Image too blurry.
- No food detected.
- Model returned invalid output.
- Estimate confidence too low.

Recovery:

- Let user type context.
- Let user create manual entry.
- Let user retry photo.
- Let user save corrected food.

## 18. Cost Control

Controls:

- Use model routing.
- Compress images before model calls.
- Cache barcode products.
- Cache serving suggestions.
- Reuse saved meals.
- Use embeddings for candidate retrieval.
- Escalate to `gpt-5.5` only when needed after MVP.
- Rate-limit repeated photo scans.

Track:

- AI cost per active user.
- AI cost per logged meal.
- Photo estimate acceptance rate.
- Correction rate.
- Barcode scan failure rate.
- Escalation rate.

## 19. First Demo Scope

The first demo should prove the core wedge.

Demo flows:

1. User opens diary.
2. User scans barcode for a packaged food.
3. App shows verified nutrition and smart serving units.
4. User logs the barcode food.
5. User scans a homemade khichdi photo.
6. User adds context: "rice and squash khichdi, homemade, one bowl."
7. App returns macros, assumptions, and confidence.
8. User taps "No ghee" correction.
9. App updates estimate.
10. User logs meal.
11. Diary totals update.
12. User saves meal as "Mom's khichdi."

If this flow feels clean, the product direction is validated.

## 20. Implementation Risks

### Risk: AI Estimates Feel Untrustworthy

Mitigation:

- confidence labels
- calorie ranges
- assumptions
- quick correction
- saved meals
- eval set

### Risk: Barcode Coverage Is Weak

Mitigation:

- use multiple sources
- cache products
- manual product creation
- consider paid barcode data later

### Risk: Logging Is Slower Than MyFitnessPal

Mitigation:

- recent foods
- favorites
- copy yesterday
- saved meals
- fast serving selector
- do not make every flow chat-based

### Risk: AI Costs Are Too High

Mitigation:

- route models by task
- cache results
- use mini model for simple transformations
- use photo model only when needed

## 21. Immediate Next Steps

1. Configure Supabase Auth in a real project, test email confirmation and the implemented access-token refresh path on native devices, and decide whether Apple/Google login should be added before beta.
2. Run Prisma-mode integration tests against a live Postgres database, then load-test the direct repository paths and review query plans under real data volume.
3. Add provider-native retained-photo lifecycle policy, malware scanning, and stricter production object-storage policies.
4. Load-test and tune the transaction-backed Prisma AI rate-limit path under concurrent multi-instance traffic; move to a dedicated rate-limit backend only if Postgres contention becomes too high.
5. Run the OpenAI connectivity script against live credentials and expand eval coverage before tuning prompts.
6. Run native-device camera checks for barcode and meal-photo capture.
7. Move local analytics events into a production analytics pipeline and dashboard.
8. Prepare deployment: hosted API, managed database, Supabase Storage bucket, environment variables, and EAS mobile builds.
