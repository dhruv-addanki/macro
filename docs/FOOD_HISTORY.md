# Explicit food history

“Two slices of the same garlic bread we logged last time” reuses the previous food's nutrition, scaled to two slices. “Two slices of garlic bread” gets a fresh estimate. The model recognizes natural references; users do not need a command or keyword. There are no follow-up questions, selectors, or confirmation screens. Existing edit/correct actions remain available after saving.

## Flow

1. The native client sends the transcript with `history: {phase: "initial", queries: [], matches: []}`, empty `recentLogs`, and no prior question. An explicitly selected correction also sends its target meal.
2. OpenAI either returns the completed meal or `action: "lookup_history"` with up to five food/brand search queries. Only an explicit reference to previously logged food permits lookup. A date such as “yesterday I ate bread” alone does not.
3. The phone searches all committed local meals. Names and ingredients are compared using case/diacritic folding, simple plural normalization, and lexical relevance. Ties prefer most recent **consumption**, so editing an old record does not make it the last eaten version. Deleted foods disappear; edits change the revision in the snapshot ID.
4. The phone sends a second request with `phase: "resolved"`, the queries, and at most ten food snapshots. Each includes a meal/revision/component reference, date, name, portion, nutrition, ingredients, and source. Imported daily aggregates are excluded because their nutrition cannot be attributed to individual foods. No full diary, recordings, profile or unrelated meal notes are attached.
5. OpenAI picks an appropriate food/brand and a portion ratio. The API validates that reference and multiplies the stored nutrients by the ratio, preserving unknown values as null. Omitted quantity means the previous portion; a new spoken quantity takes precedence. Unclear unit conversions get a reasonable assumption in the meal details. Unrelated foods are estimated separately. If no suitable match exists, estimate normally and record that assumption.
6. The phone saves a new meal automatically. Reuse does not edit the old meal. Explicit correction targets keep their existing identity/revision checks and may preserve unchanged historical foods without another lookup.

The resolved phase cannot request another lookup or ask a question. The new client rejects clarification responses from an incompatible server rather than showing a question. The optional history envelope keeps the API compatible with existing clients until upgraded; those clients retain the previous behavior.

## Persistence and limits

The resolved snapshot and a new request ID are saved in the existing pending submission before the second network call. Retries and app reopening resume the same snapshot and ID; they do not restart the search. Final commits remain idempotent and canceled requests cannot save. Editing a draft clears its cached request/result.

There is no new database, index, embedding service, dependency, or SwiftData migration. Search runs only after the model requests it. Ordinary logs use one interpretation call; explicit references use two and each consumes an API operation under existing quota rules. The local diary remains the only source of historical food data.

Retrieval is lexical, with a bounded candidate list. A misspelling, renamed food, or distant synonym may fail to match; this intentionally falls back to an estimate instead of blocking the log. Semantic reference detection, matching among candidates, and portion conversions are model decisions. The API validates the chosen reference and arithmetic rather than treating model-supplied reused nutrition as authoritative.

## Verification

```sh
npm ci
npm run typecheck
npm test
npm run test:ios-project
npm run test:voice-config
npm run package:voice
node scripts/test-voice-package.mjs
xcodebuild -project apps/ios/Macro.xcodeproj -scheme Macro \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' \
  -only-testing:MacroTests test
```

Native tests cover full-diary retrieval, recency, imported aggregate exclusion, edits/deletions, clean ordinary requests, hidden lookup, no-match logging, retry across reopening, cancellation, bounded lookup, and legacy draft upgrades. API tests cover request/output bounds, deterministic scaling, unknown nutrients, invalid references/ratios, correction preservation and per-phase retry deduplication. A condition-inversion mutation was caught by both schema and route tests, then restored.

Optional live checks use only a synthetic diary and the configured OpenAI model:

```sh
MACRO_TEST_LIVE_HISTORY=1 npm test -w @macro/api -- src/modules/ai/foodHistory.live.test.ts
```

Set `OPENAI_API_KEY` in the environment or ignored `apps/api/.env.voice` first. These checks incur model calls and cover ordinary entries (including a past-date entry and “usual”), explicit mixed meals, brand/recency selection, changed and omitted quantity, and an empty lookup. They do not read or write the user's diary.

## Rollout

Deploy the updated Voice API before distributing the new native build: the new client sends the history envelope that the previous API does not accept. Deploying the API alone retains legacy-client compatibility. This PR prepares the source and tests; it does not deploy Railway, install a phone build, or modify a real diary.
