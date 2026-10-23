# Macro Build Status

## Active Architecture

- Native iOS 26+ SwiftUI app in `apps/ios`, with SwiftData, Swift Charts, Apple audio recording, and native Liquid Glass.
- Authenticated Fastify Voice API in `apps/api`, hosted on Railway.
- Shared structured request/result validation in `packages/shared`.
- OpenAI transcription and nutrition interpretation both run through the hosted Voice API.
- The iPhone owns the diary. Railway's `voice-usage` volume stores only the API operation counter.

See [the technical outline](./docs/SWIFT_IMPLEMENTATION_PLAN.md) and [hosted operations](./docs/SWIFT_HOSTED_API.md).

## Implemented

- Home, Progress, Profile, day navigation, goals, expandable meal cards.
- Voice, typed, and manual logging; corrections, clarification, Undo, and recoverable drafts.
- Local persistence, JSON export, and calorie/macro charts.
- Microphone capture validation and real physical-device recording checks.
- HTTPS hosting, server-side OpenAI key, per-device Keychain credentials, request limits, persistent daily quota, and bounded retries.
- Native tests, API tests, isolated deployment smoke checks, and live synthetic transcription/estimate verification.

## Cleanup

The old Expo app, legacy API routes, Prisma schema/migrations, Docker database setup, legacy local diary data, and obsolete deployment files have been removed. Current Swift and voice code stay in their existing paths. No old-data import is planned.

Railway retirement and its verification status are recorded in [SWIFT_VERIFICATION.md](./docs/SWIFT_VERIFICATION.md).

## Next Work

1. Continue visual refinement and everyday physical-device testing.
2. Add diary import/restore before relying on JSON export as a complete backup workflow.
3. Set up durable app distribution/signing, such as TestFlight.
4. Before public signup, implement appropriate user access/provisioning and usage controls.
5. Add cloud diary sync only when requested.

Keep future changes within this diet-only product. Do not reintroduce the retired database, Expo client, photo/barcode services, or old API.
