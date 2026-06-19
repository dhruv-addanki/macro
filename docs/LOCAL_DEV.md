# Local Development

## Install

```bash
npm install
```

## API

```bash
npm run dev:api
```

The API runs at:

- `http://localhost:4000`
- `GET /health`
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/session`
- `GET /diary?date=YYYY-MM-DD`
- `GET /saved-meals`
- `POST /saved-meals`
- `PATCH /saved-meals/:id`
- `POST /saved-meals/:id/log`
- `DELETE /saved-meals/:id`
- `GET /recipes`
- `POST /recipes`
- `PATCH /recipes/:id`
- `POST /recipes/:id/log`
- `DELETE /recipes/:id`
- `GET /progress/summary`
- `GET /analytics/summary`
- `GET /me`
- `POST /me/meal-groups`
- `PATCH /me/meal-groups/:id`
- `DELETE /me/meal-groups/:id`
- `POST /me/meal-groups/reorder`
- `POST /me/onboarding`
- `POST /barcode/lookup`
- `POST /barcode/products`
- `PATCH /barcode/products/:id`
- `POST /barcode/unit-suggestions`
- `GET /ai/history`
- `GET /ai/usage`
- `GET /ai/meal-photos`
- `GET /ai/meal-photos/:id/access`
- `POST /ai/meal/match-saved`
- `DELETE /ai/meal-photos/:id`
- `GET /ai/meal-photos/:id/delete-redirect` for static web Profile delete links

Local auth is passwordless and email-only for development. It creates a local session token and is useful for exercising signup, login, logout, and account-gated navigation without external credentials. Persisted API sessions store a token hash, not the raw bearer token. In Prisma mode, signup, login, and logout write users, profiles, default goals, meal groups, and auth sessions directly through Prisma. Profile edits, goal edits, onboarding writes, diary entries, custom foods, barcode cache foods, serving-unit suggestions, favorites, saved meals, recipes, retained-photo metadata, progress weight entries, AI estimate/correction history, and analytics events also persist directly through Prisma. Auth session resolution, `/me` profile state, barcode cache/unit suggestions, and core mobile reads for diary, food search/recent/favorites, saved meals, recipes, progress summary, analytics summary, AI history, retained meal photos, and personal saved-meal matching read directly from Prisma in this mode. The committed migrations include targeted indexes for these user/date, user/history, food lookup, saved-meal, recipe, photo, progress, and AI usage paths. The Expo app stores the raw local session token in Expo SecureStore on native builds and browser storage on web.

For Supabase Auth, configure the API with:

```bash
MACRO_AUTH_DRIVER=supabase
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=replace-with-supabase-anon-key
```

Then configure Expo with:

```bash
EXPO_PUBLIC_AUTH_DRIVER=supabase
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=replace-with-supabase-anon-key
```

In this mode, the mobile app signs up or logs in through Supabase email/password auth, stores the returned access/refresh session locally, refreshes the access token before API calls when it is close to expiry, and sends the access token to the API as the bearer token. The API verifies the token with Supabase before resolving or bootstrapping the Macro user. The Supabase service-role key is not used for mobile auth and must stay API-side for private storage operations only.

Local data is session-scoped for app-owned user data: profile, goals, meal groups, diary entries, custom foods, favorites, saved meals, recipes, progress, AI history, corrections, retained meal photos, AI usage events, and analytics events. Shared seed foods and external barcode products remain global reference data.

AI endpoints have local request controls:

- `MACRO_AI_RATE_LIMIT_WINDOW_MS`, default `3600000`
- `MACRO_AI_TEXT_ESTIMATE_LIMIT`, default `60`
- `MACRO_AI_PHOTO_ESTIMATE_LIMIT`, default `20`
- `MACRO_AI_CORRECTION_LIMIT`, default `60`
- `MACRO_AI_MATCH_SAVED_LIMIT`, default `120`
- `MACRO_AI_DAILY_BUDGET_UNITS`, default `200`

Over-limit AI calls return `429` with `Retry-After`, `resetAt`, and remaining-budget metadata. The Profile screen reads `/ai/usage` to show current usage. In JSON mode, usage is stored in the local JSON store. In Prisma mode, reservations run inside a serializable Prisma transaction, create the accepted or blocked `AIUsageEvent` row in that transaction, and update completion/failure rows directly through Prisma so usage survives API restarts without local JSON persistence.

Product analytics events are local and user-scoped. The Progress screen reads `/analytics/summary` to show source split, AI acceptance, correction count, barcode failure rate, and AI cost units per logged AI meal.

OpenAI-backed meal estimates use `OPENAI_API_KEY` when configured. Without that key, the API uses deterministic fallback estimates so the app remains locally usable.

AI prompt text lives in versioned modules under `apps/api/src/modules/ai/prompts`. The API stores the prompt version on each AI estimate/correction log so changes can be evaluated and debugged later.

Model routing is configurable:

- `MACRO_AI_PHOTO_MODEL`, default `gpt-5.5`
- `MACRO_AI_TEXT_MODEL`, default `gpt-5.4-mini`
- `MACRO_AI_CORRECTION_MODEL`, default `gpt-5.4-mini`

After filling real OpenAI values, run this server-side connectivity check:

```bash
npm run check:openai
```

It validates the configured text, correction, barcode-unit, and photo models with tiny Responses API calls. If a configured model is unavailable to the key or does not support the required input shape, the script exits non-zero with the API error.

OpenAI call or schema failures fall back to deterministic estimates and mark the AI usage event as fallback-backed instead of blocking the logging flow.

By default, local development data persists to:

- `.macro-data/dev-store.json`
- `.macro-data/photos/` for opted-in retained meal photos

Set `MACRO_STORE_DRIVER=json` to use this mode explicitly. Set `MACRO_DATA_FILE=/absolute/path/to/file.json` to override JSON data. Set `MACRO_PHOTO_DIR=/absolute/path/to/photos` to override retained-photo storage. Both local paths are ignored by git.

Retained meal photos use local disk by default so the app can be tested without cloud credentials:

```bash
MACRO_PHOTO_STORAGE_DRIVER=local
MACRO_PHOTO_ACCESS_TTL_SECONDS=300
MACRO_PHOTO_MAX_BYTES=8388608
```

For Supabase private object storage, create a private file bucket such as `macro-meal-photos`, then set:

```bash
MACRO_PHOTO_STORAGE_DRIVER=supabase
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-supabase-service-role-key
MACRO_SUPABASE_STORAGE_BUCKET=macro-meal-photos
MACRO_PHOTO_ACCESS_TTL_SECONDS=300
MACRO_PHOTO_MAX_BYTES=8388608
```

The Supabase service-role key must stay in the API environment only. Do not put it in `EXPO_PUBLIC_*` variables or ship it with the Expo app. Supabase object keys are scoped as `userId/photoId.ext`. The API stores, deletes, and signs retained objects; the mobile app only calls `/ai/meal-photos/:id/access`.

After filling real Supabase values, run this storage-only integration check:

```bash
MACRO_PHOTO_STORAGE_DRIVER=supabase npm run check:supabase-storage -w @macro/api
```

It uploads one small object to the configured bucket, creates a signed read URL, downloads the object, verifies the bytes, and deletes the object.

For the preserved S3-compatible private object storage path, set:

```bash
MACRO_PHOTO_STORAGE_DRIVER=s3
MACRO_S3_BUCKET=your-private-bucket
MACRO_S3_REGION=us-east-1
MACRO_S3_ENDPOINT=
MACRO_S3_ACCESS_KEY_ID=
MACRO_S3_SECRET_ACCESS_KEY=
MACRO_S3_FORCE_PATH_STYLE=false
```

`GET /ai/meal-photos/:id/access` returns a short-lived Supabase signed URL in Supabase mode, a short-lived S3 presigned GET URL in S3 mode, and a short-lived local API token URL in local mode. Retained writes allow common image MIME types only, verify the uploaded bytes match a supported image container, and enforce `MACRO_PHOTO_MAX_BYTES`.

Retained-photo cleanup is dry-run-first:

```bash
npm run cleanup:meal-photos
npm run cleanup:meal-photos -- --days=30
npm run cleanup:meal-photos -- --apply
```

The default retention window is `MACRO_RETAINED_PHOTO_RETENTION_DAYS=90`. The cleanup command deletes both storage objects and metadata when `--apply` is passed. Malware scanning and provider-native bucket lifecycle policy are still production hardening tasks.

## Postgres And Prisma

The repo includes a Prisma 7 config, a Postgres Docker Compose service, committed migrations, targeted query indexes for the direct Prisma-backed API paths, and a Prisma runtime that seeds reference data without whole-store snapshot persistence.

Copy `.env.example` to `.env`, then start local Postgres:

```bash
npm run dev:db
```

The Compose service maps Postgres to host port `5433` to avoid clashing with a developer's existing local Postgres on `5432`.

Useful database commands:

```bash
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:studio
```

`SHADOW_DATABASE_URL` points to `macro_shadow`, which the local Postgres init script creates for fresh Compose volumes. If you already have a populated Compose volume from before that init script existed, recreate the local volume or create the `macro_shadow` database manually before running migration-directory diffs.

To run the API against Postgres instead of the JSON store:

```bash
MACRO_STORE_DRIVER=prisma npm run dev:api
```

In Prisma mode, the API seeds reference foods and default demo data on startup, then relies on direct Prisma repositories for runtime state. Auth/session writes, profile/onboarding writes, diary entries, food/favorite writes, saved meals, recipes, retained-photo metadata, progress weight entries, AI estimate/correction history, analytics events, and AI usage reservations/events now use direct Prisma mutations. Auth session resolution, `/me` profile state, barcode cache/unit suggestions, and core mobile reads for diary, food search/recent/favorites, saved meals, recipes, progress summary, analytics summary, AI history, retained meal photos, and personal saved-meal matching also read directly from Prisma. Whole-store snapshot persistence is disabled in Prisma mode so missed direct-persistence paths fail fast. Remaining production hardening is focused on live Postgres integration testing, load testing, and query-plan review under real data volume.

## Mobile / Web

Expo native/web dev server:

```bash
EXPO_PUBLIC_API_URL=http://localhost:4000 npm run web -w @macro/mobile -- --port 8081
```

Native mobile starts:

```bash
EXPO_PUBLIC_API_URL=http://localhost:4000 npm run ios -w @macro/mobile
EXPO_PUBLIC_API_URL=http://localhost:4000 npm run android -w @macro/mobile
```

Use a LAN-reachable API URL for physical devices, for example `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:4000`. On iOS simulator, `localhost` points to the Mac. On Android emulator, use `http://10.0.2.2:4000` if the simulator cannot reach `localhost`.

If Expo web reports that Metro is listening but HTTP requests hang locally, use a static web export:

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=http://localhost:4000 CI=1 npx expo export -p web --output-dir dist-web --clear
npx serve dist-web -l 8082
```

Then open:

- `http://localhost:8082`

For this static export setup, start from the root URL and navigate inside the app. Directly loading nested routes such as `/add` or `/saved` can return the static server's 404 page.

## Verification

```bash
DATABASE_URL=postgresql://macro:macro@localhost:5433/macro SHADOW_DATABASE_URL=postgresql://macro:macro@localhost:5433/macro_shadow npm run db:validate
npm run typecheck
npm test
npm run eval:api
```

Current verified flows:

- API health check.
- Local passwordless signup, login, session read, and logout.
- Optional Supabase Auth signup/login mode with secure session persistence, client-side access-token refresh, and server-side Supabase bearer-token verification.
- Hashed local session token persistence.
- Direct Prisma-backed auth/session, profile/onboarding, diary entry, food/favorite, saved-meal, recipe, retained-photo metadata, progress weight-entry, AI estimate/correction history, and analytics event writes in Prisma mode, with JSON mode preserved for fast local development.
- Direct Prisma-backed auth session resolution, `/me` profile state, barcode cache/unit suggestions, and core mobile reads for diary, food search/recent/favorites, saved meals, recipes, progress summary, analytics summary, AI history, retained meal photos, and personal saved-meal matching.
- Targeted Prisma query indexes for direct mobile API reads, retained-photo cleanup, AI history/usage, diary/date lookups, saved meals, recipes, favorites, and progress summaries.
- Auth screen routes unauthenticated users before diary access.
- Native session-token hydration and persistence through Expo SecureStore, with web fallback storage.
- Session-scoped isolation for diary entries, custom foods, progress, profile, goals, meal groups, saved meals, recipes, AI history, corrections, retained meal photos, AI usage events, and analytics events.
- AI usage summary, per-endpoint rate-limit blocking, daily-budget blocking, transaction-backed Prisma reservations, and Profile usage panel.
- Direct Prisma-backed `AIUsageEvent` operations in Prisma mode, with JSON mode preserved for fast local development.
- Analytics summary for accepted AI logs, corrections, barcode failures, source split, and AI cost units per logged AI meal.
- OpenAI live connectivity script for configured text, correction, barcode-unit, and photo model routes.
- Prisma 7 schema validation, client generation, and initial Postgres migration SQL generation.
- Opt-in Prisma runtime typecheck with `@prisma/adapter-pg`.
- First-run onboarding with profile, goal, unit, weight, and target setup.
- Diary load by date.
- Copy previous day into the current diary date.
- Text meal estimate for khichdi-style mixed meal.
- Photo meal estimate with explicit retain-photo opt-in.
- Retained meal photo list/delete API and exported web Profile delete link.
- Local retained-photo provider, Supabase retained-photo provider boundary, preserved S3-compatible provider path, and short-lived signed/private photo access route.
- Basic retained-photo image byte validation and dry-run-first retained-photo cleanup.
- AI estimate audit history and correction-memory reuse.
- Versioned prompt modules for text meal estimates, photo meal estimates, corrections, barcode units, and saved-meal matching.
- Initial eval set for text meals, photo-context meals, corrections, and barcode smart units.
- Log AI estimate into meal-split diary.
- Barcode lookup through Open Food Facts.
- Mobile manual barcode product creation/correction and typed barcode unit suggestions with model-backed generation when OpenAI is configured.
- Manual food search with per-food serving selection and quantity.
- Recent foods and favorites in the Add search flow.
- Custom food creation through the Add search flow.
- Save a meal section and log the saved meal later.
- Create and log a recipe through the API and exported app.
- Match text meal input against saved meals and recipes.
- Log a personal-memory match from the Add screen into the diary.
- Edit an AI estimate's name, serving, grams, and macros before logging.
- Edit a logged diary entry's meal group, serving, grams, and macros.
- Duplicate a logged diary entry from the diary.
- Add weight and read progress summary.
- Update profile display name and macro targets.
- Reopen setup from the Profile screen.
- Persist diary, saved meals, recipes, weight, profile, and goals across API restart.
- Exported Expo web bundle.
- Browser check of diary and text-estimate-to-log flow through the exported app.
