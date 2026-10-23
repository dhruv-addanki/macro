# Macro: Native Swift Implementation

Date: 2026-10-22
Status: Native implementation added. See [local development and testing](./SWIFT_LOCAL_DEV.md) for the implemented entry point, configuration, verification, and remaining device checks. The outline below records the accepted technical design; small helpers were consolidated into `StoredModels.swift`, `MacroTheme.swift`, and `DiaryCalendar.swift` rather than separate files.

## Decision

Build a new Swift / SwiftUI iPhone app in `apps/ios`. Use SwiftData for the local diary and settings. Retain a small TypeScript / Fastify service in `apps/api` only to call OpenAI. The installed tools are Xcode 27.1 with the iOS 27.1 SDK and an available iOS 27.0 simulator runtime.

The entire iPhone client will be Swift, without Expo, React Native, or a web view. Reusing the existing server package avoids rewriting API plumbing solely to change its language. The OpenAI key stays on the server, as required by [OpenAI's API authentication guidance](https://developers.openai.com/api/reference/overview#authentication).

The Expo client and legacy database files have been retired at the user's request. The current app has no PostgreSQL dependency. Local development uses the voice server; provisioned phones use its hosted Railway deployment.

This plan supersedes the server-owned diary and database-migration portions of the earlier build plan and voice-first brief. The product behavior in [VOICE_FIRST_V1_BRIEF.md](./VOICE_FIRST_V1_BRIEF.md) still applies, with local Swift code now owning persistence and totals.

## Architecture

| Component | Technology | Responsibility |
| --- | --- | --- |
| Native interface | SwiftUI, Observation, SF Symbols | Home, Progress, Profile, voice sheet, editing |
| Local database | SwiftData, explicit local-only configuration | Meals, food components, profile, goal history, recoverable submissions |
| Nutrition logic | Pure Swift functions | Goal calculation, units, date grouping, daily/running totals, chart series |
| Audio | AVAudioRecorder and AVAudioSession | Microphone permission, bounded recording, meter/waveform, interruption handling |
| Networking | URLSession with async/await and Codable | Audio upload, estimates, structured errors, cancellation |
| AI proxy | Existing Fastify/OpenAI/Zod dependencies | Transcription, interpretation/corrections, response validation |

Reading history, editing meals, setting goals, and viewing charts work offline. New AI estimates require network access and the proxy running on the Mac for now. There is no multi-device synchronization in this version.

## Native Project And Files

Create a normal Xcode app project with an iOS 26 minimum deployment target, built using the installed iOS 27.1 SDK. This gives us native Liquid Glass without an older-iOS imitation layer. Start with Apple frameworks only.

```text
apps/ios/
  Macro.xcodeproj
  Macro/
    App/
      MacroApp.swift                 # SwiftData container and dependency setup
      AppRootView.swift              # Native three-tab navigation
    Design/
      MacroTheme.swift               # Dark emerald, white text, spacing, typography
      EmeraldBackground.swift        # Opaque, nearly flat green; faint line texture
      GlassSurface.swift             # Shared native glass treatment
    Models/
      MealLog.swift                  # Submission, date, title, transcript, revision
      FoodComponent.swift            # Food/ingredient nutrition snapshots
      UserProfile.swift              # Local profile and unit preferences
      NutritionGoal.swift            # Targets with an effective date
      PendingSubmission.swift        # Durable request state and submission ID
      AIContracts.swift              # Codable API request/response values
    Persistence/
      LocalStore.swift               # Versioned schema and atomic data mutations
    Services/
      AIClient.swift                 # Proxy networking, decoding, timeouts
      AudioRecorder.swift            # Recording lifecycle and file cleanup
      LoggingController.swift        # Submission/correction orchestration
      NutritionCalculator.swift      # Deterministic totals and goal calculation
      DiaryCalendar.swift            # Local dates, timezone, ordering
    Features/
      Home/HomeView.swift
      Home/MealLogCard.swift
      Logging/VoiceLogSheet.swift
      Progress/ProgressView.swift
      Profile/ProfileView.swift
      Profile/GoalSetupView.swift
    Config/
      AppConfiguration.swift
      Debug.xcconfig.example
  MacroTests/
  MacroUITests/
```

These are proposed files, not files already present. Keep small view helpers in their feature files until extracting them removes actual duplication. Use a few observable controllers and explicit dependencies, not a routing framework or large architecture library.

## Local Data And Calculations

One `MealLog` represents one spoken or typed submission for one day. It owns its food components. Optional section labels let one log contain breakfast and lunch without bringing back mandatory meal groups. Ingredient rows must not be counted again when their parent food already represents their nutrition.

- Store stable UUIDs, captured timestamp/timezone, an explicit local date key, revision, transcript, assumptions, and nutrition provenance.
- Store nutrient snapshots per counted food component. Unknown sugar/fiber/sodium remain optional; they are not fabricated zeros.
- Derive log totals, daily totals, running totals, and chart values in Swift from those same snapshots. Do not maintain separate mutable counters for each screen.
- Persist goal changes as effective-dated records. Use the goal applicable to each historical day.
- Keep metric values internally; convert units at input/display boundaries. Implement the documented starting-goal formula as a pure Swift function, with manual overrides.
- Use explicit SwiftData saves for mutations, handling failure/rollback before reporting success. Persist a completed submission ID in the same save as its meal changes.
- Start with a versioned local schema and explicitly disable CloudKit sync. Add a small JSON export path for backup/future migration; do not build cloud synchronization now.

SwiftData provides local model persistence and change observation without an external database service. [Apple SwiftData documentation](https://developer.apple.com/documentation/swiftdata)

## Native UI And Liquid Glass

Use the latest dark, flat-green designs as the visual references: [Home, expansion, voice](./design/dark-emerald-home.png) and [Progress, Profile](./design/dark-emerald-progress-profile.png).

- Background: opaque dark emerald around `#123F34`, with only a very small tonal variation and faint line texture. It is never glass and does not fade into pale mint.
- Foreground: white typography, thin progress strokes, slim uppercase `MACRO` wordmark, compact dates, and individual expandable meal cards.
- Apply genuine SwiftUI `glassEffect(_:in:)` to meal surfaces and appropriate controls. Use `GlassEffectContainer` where it improves rendering/transition coordination, avoiding merged neighboring cards or nested glass panes.
- Use native `TabView` for Home / Progress / Profile so the system supplies the actual tab material and accessibility behavior. Verify its appearance in the simulator and on a device; do not hard-code a fake screenshot-shaped tab bar.
- Use Swift Charts for the four nutrition charts. Unlogged days stay gaps, and averages identify their logged-day basis.
- Keep forms and charts on the ordinary background. Adapt glass/transitions to Reduce Transparency and Reduce Motion; check Dynamic Type and small-screen layouts.

Liquid Glass is part of SwiftUI and the platform SDK, not a separate third-party kit. The generated images are visual targets; actual refraction, tint, and movement will be tuned against the native rendering. [Apple custom-view Liquid Glass APIs](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)

## Small OpenAI Proxy

Add an AI-only entry point in the existing server package. The current `server.ts` initializes the full persistence system, and `modules/ai/service.ts` imports diary/history storage, so the new client should not depend on those startup paths just to estimate food.

| Proposed file | Purpose |
| --- | --- |
| `apps/api/src/aiServer.ts` | Minimal health check and AI routes; no store initialization |
| `apps/api/src/lib/voiceEnv.ts` | Only key, model, port, host, and local proxy-token configuration |
| `apps/api/src/routes/voiceLogging.ts` | Bounded audio transcription and meal interpretation endpoints |
| `apps/api/src/modules/ai/transcription.ts` | OpenAI audio call and temporary-upload cleanup |
| `apps/api/src/modules/ai/voiceLogging.ts` | Stateless interpretation/correction calls |
| `apps/api/src/modules/ai/prompts/voiceLogging.v1.ts` | Focused prompt and version |
| `packages/shared/src/schemas/voiceLogging.ts` | Versioned Zod request/response contract |
| `evals/voice-logging/` | Spoken self-corrections, mixed meals, quantities, and dates |

Reuse the existing SDK dependencies, prompt ideas, and nutrition conventions. The native client mirrors the small wire contract with Codable; shared JSON fixtures check both decoders. Existing single-meal schemas and keyword correction behavior need extending, not direct reuse as the finished product.

Expose two proposed endpoints:

1. `POST /v1/audio/transcribe`: accepts a bounded recording using a maintained multipart parser; returns the transcript. Use `gpt-transcribe` initially, subject to account/SDK validation. [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text)
2. `POST /v1/meals/interpret`: accepts transcript/text, selected date, capture time/timezone, optional correction target/revision, and a few relevant prior food records. Returns a validated `create`, `update`, or `clarify` result with grouped food nutrition. Use `gpt-6-luna` with reasoning effort `xhigh`, preserving the requested model. [GPT-6 Luna documentation](https://developers.openai.com/api/docs/models/gpt-6-luna)

The proxy never writes a diary, accepts database credentials, or sends back a canned meal as a successful fallback. It validates response shape, finite/nonnegative nutrients, allowed correction targets, and request limits. Verify the installed OpenAI SDK supports the chosen calls, upgrading only if required. Add a simple development access token and request/upload limits; keep the service loopback-only by default, enabling LAN access explicitly for phone testing.

The phone validates the returned proposal, resolves IDs against its own local records, checks the revision, and commits. A clarification or failure does not alter the diary.

## Logging And Correction Flow

`Tap plus -> record -> stop/send -> transcribe -> interpret -> validate -> save locally -> update Home and charts`

Create a durable submission ID before sending. Typed input skips the audio stage. Keep the transcript after successful transcription so an estimation retry does not require recording or uploading again.

`LoggingController` owns explicit recording/transcribing/estimating/clarifying/saving/failed states. A pending card does not count toward nutrition totals until the local save succeeds. Cancellation marks the submission canceled and ignores any late network result.

For a correction, send the selected log and revision, request replacement food values, and update the original log atomically. Preserve enough previous values for Undo. Recompute all downstream totals after edit/delete/backdating. If the target is unclear, show one short question in the same sheet.

Persistently deduplicate completed submission IDs on the phone. Cache recent in-flight/results by request ID in the local proxy to reduce repeated model calls. Proxy restarts can cause a repeated API charge, but must never cause duplicated local food records. Test the crash window between save and UI confirmation.

Use `AVAudioRecorder` for a completed audio file and a small live waveform from metering. Add microphone usage text and handle permission denial, interruptions, empty recordings, and recording limits. Keep failed recordings as recoverable drafts; remove them after success or discard. [Apple AVAudioRecorder documentation](https://developer.apple.com/documentation/avfaudio/avaudiorecorder)

## Configuration And What You Supply

Proposed dedicated server example, `apps/api/.env.voice.example`:

```dotenv
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
MACRO_VOICE_HOST=127.0.0.1
MACRO_VOICE_PORT=4001
MACRO_VOICE_MODEL=gpt-6-luna
MACRO_VOICE_REASONING_EFFORT=xhigh
MACRO_TRANSCRIPTION_MODEL=gpt-transcribe
MACRO_DEV_API_TOKEN=GENERATE_LOCALLY
```

Only the OpenAI key is an external service credential to provide, or reuse if already configured. Model IDs and port have defaults; generate the development token locally rather than asking the user to obtain one. This token is for a controlled local proxy, not a substitute for production user authentication.

Proposed native config example, `apps/ios/Macro/Config/Debug.xcconfig.example`:

```xcconfig
MACRO_API_BASE_URL = http:/$()/127.0.0.1:4001
MACRO_DEV_API_TOKEN = MATCH_LOCAL_PROXY_TOKEN
PRODUCT_BUNDLE_IDENTIFIER = com.yourcompany.macro
DEVELOPMENT_TEAM = YOUR_APPLE_TEAM_ID
```

The `$()` spelling preserves `//` in an xcconfig URL. The native app gets the proxy URL and development token, never the OpenAI key. Keep real local config files ignored by Git.

Simulator uses the Mac loopback URL. A physical iPhone uses the Mac's LAN address, an explicitly LAN-bound proxy, and Debug-only local-network/transport configuration. Simulator builds do not need an Apple signing team; device installation/TestFlight needs a selected team and unique bundle identifier. No database or other vendor API keys are needed now.

## Implementation Slices

| Slice | Deliverable |
| --- | --- |
| Native foundation | Xcode project, three tabs, dark theme, native glass, local models, persistent Home with test fixtures/manual edits |
| Typed AI logging | Minimal proxy, versioned contract, real text-to-food result saved into SwiftData |
| Voice and corrections | Audio capture, transcription, clarification, recoverable drafts, correction/Undo, durable duplicate protection |
| Complete daily use | Goal calculator/manual targets, four charts, date navigation, offline behavior, accessibility, physical-device verification |

The first end-to-end milestone is a typed meal becoming an editable, persistent native meal card. Then add voice to that exact same path. UI polish can continue after the core flow works.

## Verification And Scope

Use Swift Testing for calculations, dates, Codable fixtures, correction targeting, and local persistence/deduplication. Use XCTest UI tests for tab navigation and the critical log/edit/Undo flow with a stub AI client. Run focused API contract tests and real-model examples separately; do not treat mocked responses as proof of model quality.

Build/test with `xcodebuild` against an installed simulator, inspect rendered screens at small/large sizes, then test microphone behavior, connectivity, and native glass on a physical iPhone. Verify history survives relaunch and failures never produce phantom calories. This planning pass did not run application tests or make live OpenAI calls.

The legacy JSON/Postgres data is being removed at the user's request; do not build an old-data importer. Preserve the current Swift diary. Defer accounts, cloud sync, database hosting, workouts, barcode/photo modes, saved-meal management, and public distribution. The provisioned-device beta now has hosted HTTPS, Keychain credentials, and durable usage limits; see the hosted operations guide.
