# Macro: Simple Diet Tracker

Date: 2026-10-20
Updated: 2026-10-22
Status: Proposed requirements for the next build. This document describes the new direction; it does not describe features already shipped. The existing PRD and build plan still document the broader implementation and should be reconciled when this direction enters implementation.

The current technical outline is [SWIFT_IMPLEMENTATION_PLAN.md](./SWIFT_IMPLEMENTATION_PLAN.md): a native SwiftUI client, local SwiftData storage, and a small OpenAI proxy. It supersedes the earlier server-owned diary and Postgres runtime requirements for the local version.

## Product Direction

Macro should make tracking food as easy as saying what you ate. Open the app, tap the plus button, describe one meal or several foods, and let the app estimate the nutrition and add it to your day. Home shows the selected date, a circular calorie-goal indicator, and a vertical list of expandable food logs. Each log shows calories prominently, a short food title, protein, fat, carbs, and the running daily calorie total after that log. Expanding it reveals the foods, portions, and ingredients behind the estimate. Progress shows simple nutrition charts. Profile contains the minimum information needed to set calorie and macro goals. The first version focuses entirely on diet, with voice as the primary input and typing as a fallback.

The product succeeds when someone can describe their food naturally, put their phone away, and return later to an understandable, editable diary.

## Recommended Technical Approach

The user's preferred direction is a native Swift / SwiftUI iOS client using Apple's genuine Liquid Glass APIs. Use local SwiftData for meals, profiles, and goal history. The server package now contains only the hosted OpenAI Voice API. The Expo app has been removed.

The backend already provides useful structured-estimation code and contracts, but its existing diary/history persistence is not required for the new local version. The native client owns calculations, storage, audio capture, API bindings, and UI. Accounts and synchronization come later. Validate native Liquid Glass behavior in Xcode and on a physical iPhone. Image-generated concepts approximate the appearance; they do not demonstrate the actual SDK rendering.

Use SwiftUI's `glassEffect(_:in:)` for custom glass surfaces and native system components for navigation and controls where possible. Coordinate custom effects with `GlassEffectContainer` where appropriate, avoid nested glass panes, and respect Reduce Transparency and Reduce Motion. [Apple Liquid Glass custom-view APIs](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)

This is a substantial simplification of the mobile screens and an extension of the logging model. It is not a claim that voice or conversational corrections already work.

## Navigation And Visual Design

Use exactly three tabs, in this order: **Home, Progress, Profile**.

- Put one prominent accent-colored plus button at the lower right above the tab bar. It opens voice capture, rather than becoming a fourth tab. Keep it clear of the last log and safe-area inset.
- Preserve the selected Small Ring layout: a compact ring beside the calorie totals, a short date row, simple macro goals, and individual expandable meal cards.
- Use the preferred thin, all-caps `MACRO` wordmark. Keep the rest of the interface typography compact and readable.
- Use a dark, nearly flat emerald background around `#123F34`, with only very slight tonal variation and faint line texture. It is opaque and matte, never glass, and does not brighten into pale mint, white, or gray.
- Use white text and icons throughout, with readable white-opacity variations for secondary information. Macro labels and values also use white.
- Use native Liquid Glass for the expandable cards and appropriate controls or navigation surfaces. Cards should transmit the emerald background with restrained highlights and sufficient contrast, rather than appear as opaque white panels. Use smooth native rounded shapes and avoid nested glass cards.
- Keep the calorie ring and macro progress strokes thin. The calorie total and each meal's calorie count carry the visual emphasis.
- Use familiar icons, accessible labels, at least 44 pt touch targets, and text that survives larger accessibility sizes. Expansion and recording states must remain understandable without color or animation.
- Keep the primary experience on Home. Recording and correction use a small sheet; they do not introduce a chat transcript screen.

## Home

### Date And Daily Summary

Open on today in the user's local timezone. Show the weekday and full date at the top. Horizontal swipes move one day backward or forward; previous/next buttons provide an accessible alternative. Show a Today action when viewing another date.

Under the date, show a circular indicator with calories consumed and the daily goal, plus a small remaining or over-goal value. Keep the actual consumed value visible above the goal; the ring may stop at a full circle. Under the ring, show a compact daily protein, fat, and carbs summary against their targets.

If a goal has not been configured, show the consumed total and a Set goal action. Do not invent a personalized goal or prevent food logging.

### Food Logs

Show a single vertical timeline, ordered oldest to newest by consumption time. Do not require breakfast/lunch/dinner sections. One spoken submission normally creates one log block, even when it contains several foods or meals.

| Collapsed block | Requirement |
| --- | --- |
| Calories | Largest text, at the upper left, with a kcal label |
| Title | Short food-based title, such as Toast, eggs and coffee |
| Macros | Protein, fat, and carbs in grams, in that order |
| Running total | Small footer: 1,240 kcal so far |
| Expansion | Chevron and a full-width tappable heading |

The expanded block shows foods and portions with their calories and macros. Group foods beneath meal headings only when the user actually described separate meals. Show ingredients beneath a dish where useful; do not fabricate an exact recipe for an unknown mixed dish. Keep the transcript, important assumptions, and nutrition-source details available here, rather than crowding the collapsed block.

Provide edit, voice correction, and delete actions inside the expanded view. A delete or automatic update has an immediate Undo action.

The running total means the sum through this log in the day's chronological order. Recompute it for all affected later logs after an edit, deletion, or backdated insertion. It is not a frozen historical total. Break equal-time ties with a stable ordering key.

## Voice Logging

### Normal Flow

1. Tap plus. Request microphone permission on first use, then start recording immediately once allowed.
2. Show a recording indicator, elapsed time, Cancel, and a clear stop-and-send control. Do not submit merely because the user pauses to think.
3. On stop-and-send, transcribe the recording and estimate its food nutrition through the backend. Display a pending log while processing.
4. Validate and save a successful result, update the diary and charts, and show a small Logged confirmation with Undo. No mandatory nutrition-review screen.

Typing uses the same estimation and saving path. Allow typed input if recording is unavailable, permission is denied, or the user prefers it. Never require a database search, barcode scan, food-category selection, or serving-size form before logging.

For the initial implementation, use a completed audio recording followed by transcription. A live transcript can be added if it improves the experience, but continuous conversational audio and spoken assistant replies are outside this version.

### Natural Speech Requirements

- Resolve self-corrections: "four tablespoons, actually two" means two, not six.
- Separate several foods, quantities, drinks, and condiments from one description. Avoid counting a dish and its ingredients twice.
- Accept household units and rough portions, with visible assumptions when conversion is uncertain. Distinguish fluid ounces from weight ounces; ask when the intended quantity cannot be inferred usefully.
- Treat explicit quantities and supplied nutrition-label facts as higher priority than a generic estimate. Label facts supplied by the user remain user-reported unless independently verified.
- Resolve "the same hummus as yesterday" from that user's relevant prior food facts where a clear match exists. Begin with recent records, not a new recipe-management interface or elaborate memory system.
- Distinguish a new meal from a correction. "I also ate a banana" adds food; "the pesto was two tablespoons, not four" changes the referenced food.
- Ask one short question only when the food, action, date, or correction target is too ambiguous to apply sensibly. Ordinary portion uncertainty should usually produce an editable estimate with an assumption.

### Dates, Corrections, And Failures

Use the visible diary date as the default logging date, and show that date in the recording sheet. An explicit spoken date takes precedence. Resolve "yesterday" relative to the user's local date at capture time, not the selected diary date. Preserve capture time and timezone across midnight and retries. If one submission explicitly covers different days, create a separate log for each day and report where they were saved.

A correction from an expanded block has an explicit target. A correction spoken through the global plus button may use recent logs to find a unique target. Ask which log when there are multiple plausible targets. Apply changes to the existing record and recompute item, log, day, running, and chart totals. Do not append a second copy of the corrected meal. Provide manual editing as a fallback.

Keep an unsent draft recoverable after a network failure. Use an idempotency key for the entire submission so a timeout, retry, or repeated tap cannot duplicate saved food. Multi-item writes must succeed together. Concurrent corrections must not silently overwrite newer edits. Canceling or receiving an unusable response must not alter saved totals.

Never show a fabricated successful meal when transcription, inference, validation, or saving fails. Retain the draft and offer retry or typing. Existing canned nutrition fallbacks must not silently become production diary entries.

## Nutrition And Model Behavior

Use the requested **GPT-6 Luna with Extra High reasoning**, configured server-side as `gpt-6-luna` with `reasoning.effort: "xhigh"`. Official OpenAI documentation confirms support for that reasoning setting and Structured Outputs. It lists audio input as unsupported, which is why transcription is a separate step. Actual access and end-to-end latency still need validation with the project's API account. [GPT-6 Luna documentation](https://developers.openai.com/api/docs/models/gpt-6-luna)

For recorded audio, start with the currently documented transcription model, `gpt-transcribe`, subject to account access and installed SDK compatibility. [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text)

Return a validated structured object containing the intended action, proposed date, short title, grouped foods, portions, per-item calories/macros, assumptions, and any necessary clarification. The proxy validates the proposal; the native app assigns stable IDs, resolves local correction targets, checks revisions, calculates aggregates, and commits locally. Model output cannot authorize arbitrary writes. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

- Calories, protein, fat, and carbs are required for a completed food estimate. Show estimates as estimates, with sensible display rounding.
- Keep known sugar, fiber, and sodium available in expanded nutrition details. Missing values are unknown, not zero. Do not make micronutrient completeness a launch requirement.
- Store food nutrition snapshots and provenance: user-supplied label, retrieved source, prior user food, or model estimate. Do not claim a brand's exact nutrition was looked up when no retrieval occurred.
- Sum food components deterministically in Swift from the stored snapshots. Avoid forcing label calories to equal rounded macro-derived calories exactly. Validate plausibility and consistency without inventing precision.
- Send the current request and limited, relevant user food history to the API. The app does not automatically inherit this ChatGPT conversation or its spreadsheet.
- Retain transcripts and nutrition records needed for editing. Delete temporary recordings after successful processing or explicit cancellation; retain a failed local recording only as a recoverable draft until retry or discard.

Start with the requested model configuration. Measure completion time, failures, and estimation quality before proposing a different model or reasoning effort.

## Progress

Use a shared 7-day / 30-day selector and four vertically arranged charts: calories, protein, fat, and carbs. Show daily intake with a goal reference and a compact average for each metric. Tapping a day should expose its totals or open that day's Home diary.

Days with no food records are unlogged, not confirmed zero-intake days. Leave visible gaps and calculate averages over logged days, with the number of logged days shown. Goal references must use the target effective on each date. Do not silently redraw history against a newly changed goal.

Keep AI usage, estimated API cost, scan success, weight charts, streaks, coaching, and dashboards out of this tab.

## Profile And Goal Setup

Provide two routes: enter a calorie goal directly, or calculate a starting estimate. Manual users should not need to complete the calculator questions.

For calculated goals, collect age, formula sex selection, height, current weight, usual activity level, and lose/maintain/gain preference in one short form. Support metric and imperial inputs with consistent storage. Allow users to skip the formula and enter their own targets.

Use the Mifflin-St Jeor resting-energy equation as a documented starting point:

`REE = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + s`

Here `s` is `+5` for the male equation and `-161` for the female equation. This estimates resting expenditure, not the final daily calorie target. [Original Mifflin-St Jeor study](https://pubmed.ncbi.nlm.nih.gov/2305711/)

For a simple initial product rule, multiply REE by low/moderate/high activity factors of 1.2 / 1.5 / 1.75, then apply -250 / 0 / +250 kcal for lose/maintain/gain and round to 25 kcal. These activity factors and offsets are proposed product defaults, not findings from that study or individually validated prescriptions. Present the result as an editable starting estimate. Do not imply guaranteed weight change.

Use one editable starter macro split: 25% of calories from protein, 45% from carbs, and 30% from fat, converted to grams with 4 / 4 / 9 kcal per gram. This is a product default, not a personalized optimal diet. Users can replace all three gram targets. Show any mismatch between custom macros and the calorie target without silently overwriting their choices.

Limit automatic goal calculation to adults outside pregnancy/breastfeeding; those cases can track intake and use a manually supplied appropriate target. This scope follows the population limits used by NIDDK's calorie-planning tool, not a claim that NIDDK validates our defaults. [NIDDK Body Weight Planner scope](https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner)

Keep settings to goals, calculator inputs, units, account/session controls, and the privacy controls needed for stored data. Persist goal changes with an effective date. Require an explicit action to recalculate goals when profile information changes.

## Scope To Remove From The Main Experience

No workouts, exercise-calorie adjustments, My Diet tab, coaching, social features, meal planning, barcode/photo modes, searchable food catalog, saved-meal manager, recipe builder, or favorites screens in this version. Reusing a prior food behind the scenes does not require any of those interfaces.

Spreadsheet synchronization, importing the referenced chat's records, Apple Health, widgets, and automatic diet adaptation are outside this build. Preserve existing account data and nutrition history during the transition; avoid deleting tables or records simply because a feature leaves navigation.

## Repo Changes Required

| Area | Reuse | Change |
| --- | --- | --- |
| Mobile shell | API contracts, session semantics, existing backend identity | New SwiftUI client with native secure session storage, three tabs, and one voice action |
| Home | Nutrition API data, totals, and existing behavior as a reference | Native compact ring, swipeable dates, glass log cards, running totals, pending/error states |
| AI API | Server credentials, Responses integration, usage limits, schema validation | Transcription, requested model config, multi-food/action output, contextual corrections |
| Storage | Existing field conventions and nutrition snapshot behavior | Local SwiftData logs, components, consumption time, transcript, revisions, idempotent submissions |
| Profile | Existing goal behavior as a reference | Native local setup and documented calculator; defer accounts and remove meal-group/AI-usage controls |
| Progress | Existing aggregation behavior as a reference | Native charts from local snapshots, with accurate missing-day and historical-goal behavior |

Specific gaps verified in the current source:

- The mobile package has no recording/transcription dependency or voice flow.
- `DiaryEntry` is a flat food record associated with a meal group. It does not express the proposed submission -> meal -> food structure. Add a durable log grouping relationship; do not infer groups from identical timestamps or titles. Count nutrition at one level only.
- `applyCorrection` currently handles a few keywords for oil/ghee, half, and double portions. It does not perform general conversational edits such as replacing a pesto quantity.
- The current onboarding calculator uses weight times an activity factor plus an adjustment; it is not Mifflin-St Jeor and does not use all the proposed inputs.
- The existing three required extra nutrients need an unknown-value representation if we retain them without fabricating data.

The user has requested deletion of legacy JSON/Postgres data. Preserve only the current Swift diary and current Voice API usage state; no old-data import is planned.

## Implementation Order

1. Create the native project, local models, three tabs, and a persistent Home with manual edits and test fixtures.
2. Add the small OpenAI proxy and typed estimates saved through that same local path.
3. Add recording, transcription, recoverable drafts, and model-backed corrections. Test permissions, interruptions, and retry behavior on a physical iPhone.
4. Complete local Profile/goals, the four Progress charts, offline behavior, and native accessibility/rendering verification. Hosted distribution comes later.

Keep implementation in the current repo on a dedicated branch. `PRD.md`, `BUILD_PLAN.md`, and `README.md` now describe only the SwiftUI app and Voice API; the old Expo/API implementation has been removed.

## Acceptance Criteria

- A normal meal takes tap plus -> speak -> stop-and-send -> saved log, with no required review or food-search step.
- Several foods in one utterance produce one expandable block with distinct components and correct locally summed totals. Explicit multi-day input is split by date.
- "Four tablespoons, actually two" uses two; a later "two, not four" updates the correct original food and all dependent totals.
- Ambiguous corrections ask which record; API/model failure never reports a saved meal or silently substitutes a canned estimate.
- Retrying the same submission after a timeout creates no duplicate food. A canceled or failed submission leaves prior diary totals intact.
- Editing, deleting, undoing, and backdating recompute the ring, macros, chronological running totals, and affected charts consistently.
- Selected dates, spoken relative dates, timezone boundaries, and requests that finish after midnight resolve predictably.
- Known label values and prior user food facts remain distinguishable from estimates; missing extra nutrients remain unknown.
- Home, Progress, and Profile are the only tabs. The plus button remains accessible without covering timeline content.
- Existing source data remains intact, local history and calculated/manual goals survive relaunch, and charts distinguish unlogged days from actual values.

## Source Context

This brief combines the 2026-10-20 request, the current repository, and the accessible user turns in [Create Health Tracker](chatgpt-conversation://6ad5757c-545c-83ea-b7ea-ee3bf3c3a6a2). Those turns demonstrate multi-food descriptions, same-food references, self-corrections, and later quantity corrections. The conversation reader did not expose the assistant's visual artifact bodies or embedded image contents; visual requirements here follow the user's explicit description rather than an inspected pixel reference.
