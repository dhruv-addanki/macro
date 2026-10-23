# Macro Hosted Voice API

The Swift app uses `Macro Voice API` in the Railway `Macro` project at `https://macro-voice-api-production.up.railway.app`. It has no dependency on the retired API or PostgreSQL. See the verification log for Railway resource cleanup status.

Both OpenAI steps are hosted in this service: `POST /v1/audio/transcribe` uploads audio to OpenAI and returns text; `POST /v1/meals/interpret` sends that text and bounded diary context to OpenAI and returns a validated nutrition proposal. The iPhone orchestrates these requests and saves the result locally. Typed descriptions use the second endpoint directly.

This is a private, provisioned-device beta, not an open registration service. TestFlight distribution is separate and is not part of this deployment.

## Runtime And Data

- One always-on Node 22 container, one replica in `us-west2`, limited to one CPU and 500 MB RAM. HTTPS terminates at Railway.
- The OpenAI key stays in the new service's environment. No OpenAI credential goes into the iPhone app or upload package.
- The iPhone uses a random 256-bit credential scoped to this API URL in device-only Keychain storage. The server stores its SHA-256 hash, not the credential. Production never accepts the LAN development token.
- All meal data, goals, and drafts remain in SwiftData on the phone. There is no new cloud diary database or sync. OpenAI receives the text/audio needed to process a request; this is not a claim of provider-side zero retention.
- The `voice-usage` volume at `/data` contains only a daily operation counter. It does not contain food logs or recordings. Do not delete it to reset a quota.
- Application request/body logging is off. In-flight/completed request deduplication is per credential in memory for ten minutes; it is not a durable job queue.

The phone no longer depends on the Mac or the same Wi-Fi after its API connection is switched to the hosted URL. Internet is still required for AI estimates/transcription. Reading, manual entry, goals, and charts work offline. Background recording/submission and automatic sync are not implemented.

## Access And Limits

`MACRO_VOICE_CLIENT_HASHES` is a JSON object mapping device labels to SHA-256 credential hashes. Remove/replace one entry and redeploy to revoke/rotate that device's access. The separate `verification` identity is for isolated test runs, not an embedded app-wide secret. Neither raw credential is committed.

The service allows 30 authenticated HTTP requests per minute per credential, at most three concurrent AI operations, 8 MB audio uploads, and 60 AI operations per UTC day across the service. A transcription and an estimate count separately. Failed operations consume quota; a completed cached retry does not. The daily counter survives restarts and resets on the next UTC date. Invalid/missing state fails closed.

This is an operation cap, not a hard dollar spending cap. Model usage varies and the OpenAI SDK can retry upstream requests. Review provider usage separately. Do not increase replicas without replacing the single-process file counter with a concurrency-safe shared store.

Required production variables: `NODE_ENV=production`, `OPENAI_API_KEY`, `MACRO_VOICE_CLIENT_HASHES`, `MACRO_VOICE_USAGE_FILE=/data/usage.json`, `MACRO_VOICE_DAILY_LIMIT=60`, `MACRO_VOICE_HOST=0.0.0.0`, `PORT=8080`, and the existing model/reasoning settings. Startup refuses missing production credentials, missing usage storage configuration, or invalid limits.

## Rebuild And Deploy

```sh
npm run package:voice
node scripts/test-voice-package.mjs
railway up .macro-data/voice-deploy --path-as-root --no-gitignore \
  --project fa53f77d-cdde-41d2-81f5-fb80fbfdc63f \
  --environment 102e491e-4e99-45b1-ad08-eeab8ea89190 \
  --service 4bab0415-0dba-4b5f-8a9f-5807fee3e789 --detach --json
```

The packager bundles only the voice server/shared schema and writes a five-file upload directory. External dependencies are pinned to locally installed versions with a generated lockfile. It refuses unexpected files in that directory. The isolated package smoke test installs those dependencies and checks actual HTTP health/auth without calling OpenAI. Local environment files, credentials, and iOS data are excluded.

The current deployment is a local-source upload, not a GitHub autodeploy. Future source edits need an explicit package/test/upload. Deploy only the curated package; no database migration command is required.

## Device Provisioning

`node scripts/voice-credentials.mjs` creates independent `iphone` and `verification` credentials in ignored, owner-readable `.macro-data/voice-private.json`; subsequent runs preserve them. Keep that file private. Hashes are configured only on the new voice service.

Running the script with the HTTPS URL additionally creates private `api-connection-iphone.json` and `api-connection-verification.json` files. In a Debug build, copying the appropriate file to the app's `Library/Application Support/api-connection.json` over the developer connection provisions Keychain on the next launch, saves the public URL, and deletes that provisioning file. Production credentials are never put in build settings or the app bundle. Release builds do not accept this Debug-only file; enter a separately issued credential through Profile > API connection instead.

The Release configuration contains only the public HTTPS URL. A new installation still needs its own credential. Existing plaintext preference credentials are migrated to Keychain and removed from preferences after a successful write. Keep the bundle ID and install in place; do not delete the app and its diary to update the API connection.

## Verification

Native Keychain tests require a signed simulator host. Use `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=` for local simulator tests rather than disabling code signing. `MACRO_TEST_HOSTED_API=1` enables the real native HTTPS connection check after provisioning; it does not submit a meal or audio. Live meal tests use an isolated in-memory diary.

Before treating a deployment as ready, verify Railway success, public health, anonymous/invalid-token rejection, authenticated status, synthetic-audio transcription, a structured meal estimate, and the native client's connection. The ordinary phone should be relaunched without test arguments after testing.
