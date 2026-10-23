# Macro

Macro is a native SwiftUI iPhone app for low-friction calorie and macro tracking. Meals, goals, profile settings, and drafts are stored locally with SwiftData.

The only backend is **Macro Voice API**, hosted at `https://macro-voice-api-production.up.railway.app`. It handles both steps of voice logging:

1. The iPhone uploads a recording to `POST /v1/audio/transcribe`. Railway calls OpenAI transcription and returns the transcript.
2. The iPhone sends the transcript to `POST /v1/meals/interpret`. Railway calls OpenAI for a validated nutrition estimate or correction.
3. The iPhone applies the result to its local diary.

Typed logging starts at step 2. The OpenAI key stays on Railway. A Mac server is not needed for the configured phone.

Explicit references such as “the same garlic bread we logged last time” trigger a hidden lookup across the phone's local diary. Only matching food snapshots go to the API, which reuses their macros at the newly spoken quantity. Ordinary logs send no history. Logging never asks follow-up questions; unmatched foods are estimated and can be edited afterward. See [food history](./docs/FOOD_HISTORY.md) for the protocol, tests, and rollout order.

## Repository

- `apps/ios`: SwiftUI app, SwiftData persistence, Apple audio capture, native tests.
- `apps/api`: authenticated Voice API and its tests.
- `packages/shared`: voice request/response schema and validation.
- `deploy/voice`: Docker and Railway deployment configuration.
- `scripts`: local setup, Xcode project generation, packaging, credentials, and verification.
- `docs`: current product/design, implementation, and operating instructions.

The legacy Expo app, server-owned diary, database migrations, photo/barcode services, and old deployment files have been removed.

## Development

Use Node 22+ and Xcode with iOS 26+ support.

```sh
npm ci
npm run setup:ios
npm run ios
```

These commands run the local development variant. Put the server-side OpenAI key in ignored `apps/api/.env.voice`. For the hosted service, configure its HTTPS URL and a provisioned device credential in Profile > API connection. Credentials are stored in Keychain.

```sh
npm test
npm run typecheck
npm run test:voice-config
npm run test:ios-project
npm run package:voice
node scripts/test-voice-package.mjs
```

## Documentation

- [Product requirements](./PRD.md)
- [Build status and next work](./BUILD_PLAN.md)
- [Voice-first design brief](./docs/VOICE_FIRST_V1_BRIEF.md)
- [Swift implementation outline](./docs/SWIFT_IMPLEMENTATION_PLAN.md)
- [Local development](./docs/SWIFT_LOCAL_DEV.md)
- [Hosted API and deployment](./docs/SWIFT_HOSTED_API.md)
- [Verification evidence](./docs/SWIFT_VERIFICATION.md)

The hosted API currently serves provisioned devices. TestFlight, public accounts, cloud diary backup/sync, and user-facing import/restore are not implemented. A developer-only meal-history transfer is available in Debug builds; see the local development guide.
