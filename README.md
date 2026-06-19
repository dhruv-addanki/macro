# Macro

Macro is a mobile-first calorie, macro, and nutrition tracker designed to keep the clean daily logging experience of apps like MyFitnessPal while making food entry substantially more intelligent.

The product focus is:

- Clean daily tracking organized by configurable meal groups.
- Daily calorie, macro, sugar, fiber, and sodium targets with editable logged nutrition.
- Fast manual, recent, favorite, and editable saved-meal logging.
- Reliable barcode scanning for packaged foods, including mobile manual product creation/correction and smart serving-unit suggestions.
- AI-assisted photo meal estimation for homemade, mixed, cultural, and restaurant meals.
- Transparent assumptions, confidence, and quick corrections instead of fake precision.
- Per-user AI usage tracking with local request limits, daily budgets, and transaction-backed Prisma reservations in Prisma mode.
- Local logging-quality analytics for source split, correction rate, scan failures, and AI cost per logged meal.
- A committed Prisma/Postgres schema, migrations, and opt-in Prisma-backed API runtime.
- Direct Prisma-backed auth/session, profile/onboarding, meal-group management, diary entry, food/favorite, saved-meal, recipe, retained-photo metadata, progress weight-entry, AI estimate/correction history, analytics event, and AI usage event persistence when `MACRO_STORE_DRIVER=prisma`.
- Direct Prisma-backed read paths for the core mobile screens: auth session resolution, `/me` profile state, diary, food search/recent/favorites, barcode cache/unit suggestions, saved meals, recipes, progress summary, analytics summary, AI history, retained meal photos, and personal saved-meal matching.
- Targeted Prisma indexes for the user/date, food lookup, saved-meal, recipe, retained-photo, AI history/usage, and progress paths used by the mobile API.
- Local passwordless auth for zero-config development, plus opt-in Supabase Auth where the Expo app signs up/logs in with Supabase, securely stores and refreshes the Supabase session, and the API verifies bearer tokens server-side.
- Local retained-photo storage for zero-config development, Supabase Storage as the intended private object store, optional legacy S3-compatible storage behind env config, short-lived signed/private read access, basic image byte validation, and a dry-run-first retained-photo cleanup script.
- Env-configurable OpenAI model routing for photo, text, correction, and barcode-unit intelligence.
- Versioned prompt modules for text meal estimates, photo meal estimates, corrections, barcode units, and saved-meal matching.
- Native session-token persistence with Expo SecureStore and web fallback storage.

Planning docs:

- [PRD.md](./PRD.md) - product requirements and feature scope.
- [BUILD_PLAN.md](./BUILD_PLAN.md) - technical architecture, milestones, and implementation plan.

Local runtime note: the API defaults to the JSON development store for fast local work. Set `MACRO_STORE_DRIVER=prisma` with `DATABASE_URL` to apply the committed migrations, seed reference foods/user defaults, write auth/session, profile/onboarding, meal groups, diary entries, food/favorites, saved meals, recipes, retained-photo metadata, progress weight entries, AI estimate/correction history, analytics events, and AI usage events directly through Prisma, and read the core mobile/auth/barcode screens directly from Prisma. Whole-store snapshot persistence is disabled in Prisma mode so missing repository paths fail fast.

Mobile runtime note: the Expo app is the primary client. It supports iOS, Android, and web for development, with native camera/photo-library and barcode flows wired through the backend. Local auth session tokens or Supabase access/refresh session data persist through Expo SecureStore on native builds and browser storage on web. API keys, OpenAI credentials, and Supabase service-role credentials stay server-side; only the Supabase anon key is exposed through `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Credential checks: after filling real OpenAI values, run `npm run check:openai` to validate the configured text, correction, barcode-unit, and photo model routes. After filling real Supabase Storage values, run `MACRO_PHOTO_STORAGE_DRIVER=supabase npm run check:supabase-storage -w @macro/api`.

Photo lifecycle: run `npm run cleanup:meal-photos` to preview retained meal photos older than `MACRO_RETAINED_PHOTO_RETENTION_DAYS`; add `-- --apply` to delete matching objects and metadata.
