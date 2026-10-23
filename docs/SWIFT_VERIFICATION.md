# Native Macro Verification

Date: 2026-10-22. Local development build, not a public release.

## Implemented Design

Compared native simulator screenshots against the accepted [Home reference](./design/dark-emerald-home.png) and [Progress/Profile reference](./design/dark-emerald-progress-profile.png).

- Opaque, dark emerald background with a minimal tonal shift and faint upper line texture. No glass page or pale mint fade.
- White slim MACRO wordmark, compact day navigation, fine calorie ring and macro bars, vertically stacked expandable meal cards.
- Native `glassEffect` meal surfaces and glass controls, with a system `TabView`. Real system rendering is deliberately used instead of painted glass highlights or a screenshot-shaped custom tab bar.
- Unframed native charts and straightforward profile rows. No workouts, accounts, marketing panels, barcode features, or photo flows were added.
- Corrected settings-row hit areas, numeric editing that retained old digits, and content showing underneath the floating plus area. Accessibility-sized summaries/target rows switch to vertical layouts rather than splitting words across narrow columns.

Current screenshots: [Home with a real AI meal](./design/implemented-home.png), [Progress](./design/implemented-progress.png), [Profile](./design/implemented-profile.png). Meals/goals shown in these captures belong to isolated test sessions, not the ordinary app diary.

## Functional Evidence

| Check | Result |
| --- | --- |
| Swift 6 simulator build with iOS 27.1 SDK | Passed |
| Native unit tests | 19 enabled checks passed on signed simulator; 20 enabled checks passed on physical phone, including hosted HTTPS/Keychain |
| iPhone 18 Pro UI suite | 5 passed, including hosted connection settings, real OpenAI logging and correction; microphone-only UI test skipped |
| iPhone 17e UI suite | 3 passed; paid live API test intentionally skipped |
| Large accessibility text | Native Home/Profile screenshots inspected; stacked layouts verified |
| TypeScript workspace typecheck | Passed |
| Current Voice API tests | 15 passed after legacy removal |
| Shared voice contract | Typecheck passed; validation exercised by Voice API tests |
| Real transcription | Generated spoken M4A sample returned the expected meal transcript |
| Real structured estimate | `gpt-6-luna`, `xhigh`, validated food components returned through the local proxy |
| Real native correction | Replaced the original card through the API; one card remained |
| Regression-test mutation | Inverting the correction revision check caused the focused test to fail; restored code passes |
| Local launcher | `npm run ios` built, installed, and launched the ordinary persistent app; empty Home verified in Device Hub |

Native coverage includes derived totals, unknown nutrients, strict date parsing, capture timezone, historical goals, submission deduplication, canceled in-flight requests, clarification without premature totals, stale correction protection, edit/delete/backdating, Undo, JSON export, and persistence across store reopen. UI coverage exercises typed logging, expansion, correction, Undo, manual edits/deletion, target saving, and all tabs.

The test runs and detailed logs are in ignored `.macro-data/`. `MacroReady.xcresult` contains the full large-device passing run; `MacroSmallVerified.xcresult` contains the small-device passing run. Debug test mode uses an in-memory store. The live API case explicitly opts out of the fake AI client. The ordinary app uses a persistent local store and never preloads these meals.

## Review And Limits

Reviewed correctness, readability, module boundaries, credential handling, and local performance. OpenAI credentials stay server-side. Request shape/size, audio limits, local-token access, correction IDs/revisions, and finite nonnegative nutrition are checked. Fastify was updated within major version 5, and the OpenAI SDK updated for the chosen models. Type resolution explicitly supports both npm workspace-local and hoisted Fastify installations so multipart augmentation remains available.

The initial implementation retained the Expo dependency tree; that app and its direct dependencies have since been removed. The standalone production package audit reported zero known vulnerabilities. The development workspace still has three transitive dependency audit findings; those are not present in the curated production package. Local development credentials are for a trusted development LAN only.

Remaining hands-on checks from the initial implementation: human microphone quality across environments, permission denial/real interruptions, long-term diary usage, and final visual tuning. Physical installation, direct microphone capture, and a separately hosted private API were subsequently verified as described below. No TestFlight deployment, general user registration, cloud sync, background recording, or old-diary import is included. JSON export has no matching restore UI yet.

## Microphone Follow-Up

The physical phone's built-in microphone was unmuted and produced a 4.08-second file with nonzero audio in an opt-in four-second capture test. The old waveform nevertheless remained at its minimum level; a deterministic regression test using -45 dBFS input reproduced that display bug and failed before the fix.

The meter now uses a decibel-scaled peak value, resets per recording, and updates in common run-loop modes. Recording displays the actual input name and detects unavailable/muted microphone input without overriding the user's mute setting. The interruption handler now stops only for an interruption beginning, not an ending notification. Locally decoded files shorter than 0.35 seconds or containing digital silence are rejected before any upload, with recoverable draft/error behavior unchanged.

Added tests cover quiet waveform levels, interruption event classification, empty/short recordings, quiet-but-valid audio, and actual `AIClient` preflight rejection before networking. Inverting the silence check made the relevant tests fail; it was restored before the passing verification run. A separate on-device UI runner was blocked by Apple's free-development-profile app limit; no other installed apps were removed.

The final simulator regression run passed all 17 enabled tests. After the phone was unlocked, the fixed build passed all 18 tests on the physical device, including a fresh four-second microphone capture. The resulting file contained 4.08 seconds of nonzero audio, and the waveform reached 0.77 rather than remaining at its minimum. An injected interruption-ending notification did not stop the capture. This check did not upload or transcribe audio and removed its own test recording. Evidence is in ignored `MicrophoneFixedUnlocked.xcresult` and `microphone-fixed-unlocked.log`.

The normal signed device build subsequently succeeded, was installed in place, and launched without test arguments, preserving the diary and drafts. A fresh spoken-meal transcription through the ordinary app remains a hands-on check.

## Device Hub Microphone Conflict, October 22

Macro and Voice Memos both showed flat waveforms while Device Hub's physical-phone screen view was active. The normal Release app also reproduced the symptom, and saved failed drafts reported recordings too short to transcribe before any upload. Closing Device Hub restored both apps; the user confirmed that Voice Memos and Macro's normal voice flow worked afterward. This matches Apple's documented [camera and microphone access conflict](https://developer.apple.com/documentation/xcode/interacting-with-your-app-in-device-hub).

The Release app was rebuilt, installed in place, and launched without debugger/test arguments, preserving its diary and connection settings. The phone's native authenticated HTTPS/Keychain check passed, and the hosted service transcribed generated sample audio. Temporary recorder configuration probes were reverted; no audio implementation change was retained for this conflict. Device Hub must stay disconnected from the phone's screen during microphone testing. Xcode does not need to remain open to run the installed app.

## Imported History Context Compatibility, October 22

A saved failed request from the phone reproduced HTTP 422 before estimation: imported daily totals used the local `imported_daily_estimate` source label and archival ingredients/assumptions exceeded the wire contract's description limits. Transcription had succeeded; the generic food-validation message obscured that the rejection was in historical context.

The API now projects bounded context descriptions and maps the known import source to `history`. Stored diary data stays intact. Nutrition, identifiers, revisions, unknown source labels, and new model output remain strictly validated. This also accepts already-cached failed draft requests without an iOS update or a new recording.

The new-meal and correction regressions failed with 422 before the fix and passed afterward. All 18 API tests and workspace typechecks passed. The original saved phone request passed validation and an offline HTTP replay after the fix; temporary private database copies were removed. The curated production package passed its HTTP smoke check and deployment `40557e4e-400c-4550-891e-3cb09b8993fb` succeeded. Live HTTPS verification with generated audio and synthetic imported context passed transcription, a validated 205-calorie estimate, and identical cached retries. No real diary entry was created by verification.

## Hosted API Follow-Up

Deployed a separate `Macro Voice API` in the existing Railway project at `https://macro-voice-api-production.up.railway.app`. The original API deployment and Postgres were left unchanged. Deployment `50f3f608-418b-4006-822b-e72fe0afb4eb` succeeded. Source was uploaded from an isolated five-file package; no Git commit/push, old database migration, or repository-root deployment was performed.

Production rejects the LAN development token, accepts separately provisioned credential hashes, hides configuration from anonymous health checks, and applies per-credential rate limits, bounded concurrency/uploads, and a 60-operation UTC daily cap persisted on a dedicated volume. Inverting the daily-cap condition caused its persistence/reset regression test to fail; it was restored before verification. A separate red test caught the old API's `PORT` leaking into local voice development; the production/local port distinction is now covered.

The iPhone credential is stored in device-only Keychain, scoped to its server URL, with plaintext preference migration. Public HTTP URLs and misleading private-address variants are rejected. The normal built app was checked for its public HTTPS URL and an empty bundled credential field. Its one-time Debug provisioning file was consumed and removed from the phone. The phone's real native HTTPS/Keychain check passed without recording audio or modifying meals (`HostedIPhoneConnection.xcresult`).

The generated sample audio completed real HTTPS transcription and a schema-validated estimate; retries returned matching cached results. Native live logging and correction passed against the hosted API with the local Mac proxy stopped. The initial simulator default tap missed the keyboard-resized submission button; targeting its visible center fixed the test without changing meal-logging behavior. The complete subsequent UI run passed five tests, with only the microphone opt-in skipped (`HostedNativeVerified.xcresult`). See [hosted connection](./design/hosted-api-connection.png) and [real hosted estimate](./design/hosted-live-meal.png); these use isolated test data, not the phone's ordinary diary.

The production package's runtime-only npm audit reported zero known vulnerabilities at verification. This does not constitute a security certification. The hosted service is a provisioned-device private beta, not a public multi-user release. See [hosted setup and maintenance](./SWIFT_HOSTED_API.md). TestFlight remains separate; the current device provisioning profile expires October 29, 2026 at 12:11 PM America/New_York.

Only duration and sample-level statistics were inspected from two saved recordings, without playback or upload. Temporary local debugging copies were removed; the original phone drafts were not deleted.

## Legacy Cleanup

At the user's request, removed 96 legacy tracked source/configuration files: the Expo client, old API routes/services, Prisma schema/migrations, database Docker setup, old shared schemas, evaluation fixtures, and obsolete deployment documentation. Removed generated Expo builds, the local legacy JSON diary, empty legacy photo storage, and old environment files. The effective local OpenAI key was first preserved privately in `apps/api/.env.voice`; no secret was printed or committed. Swift source, phone data, current device credentials, and the Voice API usage volume were preserved.

Replaced the root README/PRD/build plan with the active Swift/Voice API scope. Removed obsolete commands/dependencies and rebuilt the npm lockfile without the retired workspace. A fresh `npm ci` succeeded. Current checks: 15 API tests, 5 local configuration tests, 3 Xcode-project tests with 33 assertions, workspace typechecking, and the isolated production package HTTP smoke check passed. No native code changed in this cleanup. The cleaned Voice API package was deployed successfully as `ca1250a6-ec89-4584-81ff-6261d33d7112`; both OpenAI endpoints remain in that single service.

The hosted pipeline test submitted generated audio, received an OpenAI transcript, sent it for interpretation, and validated a 205-calorie result. Both retry checks returned identical cached results. No real phone recording or diary was used.

Railway deletion is blocked: the connector's automatic approval check rejected removal of `Macro API`, `Postgres`, and `postgres-volume` with "the user did not approve this action." The user explicitly confirmed all three deletions, but the retry received the same rejection. Those resources still exist. Remove those three resources in the Railway dashboard while preserving `Macro Voice API` and `voice-usage`, then verify the environment inventory. No alternative deletion path was attempted after the rejection.
