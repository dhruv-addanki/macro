# Native Macro: Local Development

## Run

Requirements: macOS, Xcode with the iOS 26+ SDK/runtime, Node 20+, and Ruby's `xcodeproj` gem (`gem install xcodeproj`). The checked-in Xcode project can be opened directly without the gem; the gem is used only for regeneration.

```sh
npm install
npm run ios
```

The launcher generates local configuration, starts the detached voice proxy, builds/installs the app, and opens the device viewer. Xcode 27 uses [Device Hub](https://developer.apple.com/documentation/xcode/device-hub); older versions use Simulator. Select the launched iPhone in Device Hub's sidebar if it is showing another device. The launcher does not reset the diary or load fake meals. You can instead open `apps/ios/Macro.xcodeproj`, select the Macro scheme and an iPhone simulator, then Run. Start the proxy separately with `npm run start:voice`. Stop it with `npm run stop:voice`; use `npm run dev:voice` for foreground API development.

The native app supports Home, Progress, Profile, typed/voice AI logging, manual entry, edit/delete, correction/Undo, day navigation, effective-dated goals, a starting-goal calculator, recoverable drafts, and JSON export. SwiftData stores everything on-device; reading, manual edits, targets, and charts work without the proxy. Charts average logged days only. Workouts, barcode/photo logging, accounts, and sync are deliberately out of scope.

## Local Configuration

For the separately deployed private HTTPS service, see [Hosted Voice API](./SWIFT_HOSTED_API.md). The following LAN setup remains available for local development.

`npm run setup:ios` creates these ignored files without printing secrets:

| File | Values |
| --- | --- |
| `apps/api/.env.voice` | `OPENAI_API_KEY`, generated `MACRO_DEV_API_TOKEN`, model/host/port defaults |
| `apps/ios/Config/Local.xcconfig` | Proxy URL, matching development token, bundle ID, Apple team placeholder |

Only `OPENAI_API_KEY` is an external service credential. Precedence: process environment, then `apps/api/.env.voice`. Legacy root/API `.env` files are no longer used. The native app never receives the OpenAI key.

Defaults: `gpt-6-luna`, reasoning `xhigh`, and `gpt-transcribe`. These models were verified against the local account during implementation. Set another explicitly supported model in `.env.voice` only when intentionally changing it. No fake estimate is returned if the API fails. Your draft stays recoverable.

The URL and proxy credential can also be overridden in Profile > API connection. Credentials are stored in device-only Keychain, not preferences. Its connection check verifies reachability and key presence, not model access or billing. Update the saved URL there if changing the build configuration. If rotating the server development token, update the native credential too and rebuild or update Profile. Restart the detached proxy after server/environment changes.

## Physical iPhone

1. In `apps/ios/Config/Local.xcconfig`, set `MACRO_DEVELOPMENT_TEAM` and a unique `MACRO_BUNDLE_ID` for your Apple account.
2. Change `MACRO_API_BASE_URL` to `http:/$()/YOUR_MAC_LAN_IP:4001`. Preserve `$()` so xcconfig does not treat `//` as a comment. Both devices must be on the same trusted network.
3. Set `MACRO_VOICE_HOST=YOUR_MAC_LAN_IP` in `.env.voice`, restart the proxy, and allow local network/firewall access when prompted. This binds only the selected Wi-Fi interface rather than all interfaces. The start command checks and prints that configured address.
4. Select the connected iPhone in Xcode and Run. Enable Developer Mode/signing if Xcode requests it. Allow microphone access.

Keep the LAN proxy on a trusted network only. HTTP plus a shared local token is a development arrangement, not production authentication. Release intentionally does not load `Local.xcconfig`; it contains only the separately hosted HTTPS URL and requires its own provisioned credential. The hosted private-beta setup is documented separately; TestFlight delivery has not been performed.

The phone and Mac must be on the same reachable Wi-Fi network. A physical phone cannot use `127.0.0.1` to reach the Mac; that address refers to the phone itself. After changing `Local.xcconfig`, rebuild/install without deleting the app so the diary and recording drafts remain intact. If Profile > API connection has a saved URL override, update that URL there too and keep the existing token. Tap Check connection, then retry the unfinished meal. Allow Macro's Local Network permission if prompted. If the Mac's Wi-Fi address changes, update both local files (and any saved Profile override) and restart/rebuild.

## Verification

```sh
npm run typecheck
npm test
npm run test:ios-project
npm run test:voice-config
xcodebuild -project apps/ios/Macro.xcodeproj -scheme Macro \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' \
  -derivedDataPath apps/ios/DerivedData -parallel-testing-enabled NO \
  -collect-test-diagnostics never CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= test
```

Native unit tests cover canonical totals, unknown nutrients, dates/timezones, goal history, duplicate protection, correction revision checks, canceled requests, clarification, Undo, export, and persistence across store reopen. UI tests cover typed AI fixtures, manual edit/delete, target changes, and tab navigation. `--uitesting` is a Debug test-only, in-memory mode; ordinary launches never use fixtures.

The project regression check also verifies that Run and Profile launch `Macro.app`, both in the checked-in scheme and after isolated project regeneration. This check requires Ruby's `xcodeproj` gem.

To opt into the native live OpenAI test, add `MACRO_TEST_LIVE_AI=1` to the xcodebuild command with the local proxy running. It makes a paid API request but stores the test meal only in an isolated in-memory diary. Real transcription is separately checked using a generated spoken audio sample. Human microphone quality, interruptions, and physical-device behavior still need hands-on testing.

For microphone diagnostics, use `MACRO_TEST_AUDIO=1` on an unlocked physical phone. The opt-in unit check records four seconds, verifies the built-in capture path/file frames, and checks that an interruption-ending event does not stop a fresh recording. It removes its own test recording and never uploads audio. The opt-in recording-sheet UI test uses isolated fixture nutrition, not OpenAI, but requires a separately signed UI-test runner; free Apple developer profiles may hit their installed-app limit. Never remove other apps automatically to make room for that runner.

Close Device Hub's physical-device screen view before testing microphone capture. Apple documents that an active Device Hub interaction blocks camera/microphone access and can make apps such as Voice Memos record silence. Merely having Xcode open is separate from this active screen-control session. See [Device Hub access conflicts](https://developer.apple.com/documentation/xcode/interacting-with-your-app-in-device-hub).

The recorder shows the selected microphone input and uses peak dBFS levels for the waveform, including quiet input. Microphone muting is reported, not silently overridden. Empty/silent or sub-0.35-second recordings are rejected locally before an API upload. This is an audio-validity check, not an on-device speech-recognition model; valid audio still goes to OpenAI transcription.

Add `MACRO_SIMULATOR_UDID=...` before `npm run ios` to choose a particular simulator. If adding/removing Swift source files, regenerate explicit Xcode references with `npm run setup:ios -- --regenerate-project`. This regeneration resets project-level signing customizations, so keep local settings in `Local.xcconfig`.

## Data And Failure Behavior

No nutrition is committed until a validated proposal saves successfully. Totals and running totals derive from the same food snapshots. Corrections replace the original log after a revision check. A clarification is not a meal. Submission completion and diary changes save together; retrying a completed submission cannot add it again. The proxy deduplicates requests in memory for ten minutes; a server restart can cause another API charge, but not duplicate a completed local meal.

Failed recordings/transcripts remain in drafts until retried or canceled. Successful/canceled recordings are removed. Interrupted submissions reopen as retryable drafts. One-level Undo is available for the latest diary change during the current app session. If a correction target changed, use the explicit "Use latest meal" action before retrying. Editing meals can change their date. Changing a goal affects its effective date onward, not earlier history.

JSON export includes meals, nutrition snapshots, provenance, goal history, and profile values; it excludes credentials and raw recordings. The developer transfer below can add its meal snapshots; full profile/goal restoration and user-facing import are not implemented. Clear diary & goals removes meals/goals/drafts but preserves profile preferences and API settings. The retired diary is not an import source.

Starting goals are adult estimates using Mifflin-St Jeor, an activity factor, a modest goal adjustment, and a 25/30/45 macro split. They are not individualized medical guidance; all targets are manually editable. AI nutrition is an estimate, with assumptions/provenance visible in each expanded meal.

Known local-version limits: no cloud backup/sync, no account recovery, no calorie-accuracy guarantee, no production authentication or cost accounting, no background recording. Device signing, real microphone testing, and public-release hardening are follow-up work.

The hosted private-beta variant adds HTTPS, revocable device credentials in Keychain, and persistent daily operation limits. It does not add cloud diary storage, general user registration, or currency-based cost accounting. Local development credentials are still for a trusted LAN only.

## Developer history transfer

A Debug launch with `--import-history` reads `Documents/MacroHistoryImport.json` from that installation's app data container. The JSON contains `schemaVersion: 1` and a `meals` array using the existing exported `LogSnapshot` shape, with ISO 8601 dates. The entire batch is validated before a single save; repeated IDs are skipped, including already edited imports. Meals already in the diary, goals, profile, and drafts are preserved. Only meals are imported; this is not full backup restoration.

The launch writes `Documents/MacroHistoryImportReceipt.json`, a diary export for readback verification. For an existing imported history, `--refresh-imported-history` updates only matching entries that retain the source marker and copies the goal effective today onto their dates. Copy private input and receipts through `devicectl` for a connected development phone, or the simulator data container; keep them under ignored `.macro-data` locally. Never bundle personal history in app resources. Launch normally after verification to leave transfer mode. Release builds do not process these arguments.
