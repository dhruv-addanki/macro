# Macro Product Requirements

## Product

A simple native iPhone diet diary: speak what you ate, receive a calorie and macro estimate, and see the result in the day's log. Voice should be the quickest path. Typed descriptions and manual entry remain available.

The current detailed design source is [VOICE_FIRST_V1_BRIEF.md](./docs/VOICE_FIRST_V1_BRIEF.md). This document replaces the requirements for the retired Expo app.

## Interface

Three tabs: Home, Progress, and Profile. Use a dark, mostly flat emerald background with a restrained gradient and texture, white text, compact date navigation, and genuine Apple Liquid Glass on meal cards and appropriate controls. The page background is opaque, not glass.

Home shows a swipeable day, calorie goal progress, protein/fat/carbohydrate progress, and a vertical meal timeline. Collapsed cards show prominent calories, meal title, macros, and the running daily calorie count. Expanded cards show foods, portions, ingredients, assumptions, and edit/delete actions. A prominent add control opens voice logging.

Progress shows calorie and macro trends over time. Profile holds lightweight goal inputs, editable goals, preferences, export, and API connection settings.

## Logging And Data

- Capture audio on the iPhone and send it over HTTPS to the Railway Voice API for OpenAI transcription.
- Send the transcript to the same service for a structured OpenAI nutrition estimate.
- Validate dates, nutrition values, operation type, target IDs, and revisions before changing the local diary.
- Support multiple foods, corrections, clarifying questions, draft recovery, manual edits, deletion, and Undo.
- Retain drafts on failure; never substitute fabricated results for an unavailable API.
- Keep meals, goals, profile, and recordings local. The server processes the required request context but has no cloud diary database.
- Keep OpenAI credentials on the server and device credentials in Keychain.
- Support offline diary reading, goals, charts, and manual entry; AI logging needs internet.

## Scope

The active implementation is SwiftUI/SwiftData plus Macro Voice API. The legacy Expo client, old API, and old PostgreSQL data are retired and are not import sources.

Out of scope: workouts, barcode/photo logging, recipes/saved-meal management, social features, public signup, cloud sync, background recording, and TestFlight distribution. AI nutrition remains an editable estimate.

## Acceptance

A provisioned phone can record a meal, obtain transcription and nutrition through the hosted service with its Mac offline, save the result locally, correct it, and see consistent Home/Progress totals. Failed or duplicate requests must not silently lose drafts or duplicate meals.
