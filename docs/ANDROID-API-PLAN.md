# Android APK and API provider implementation plan

Target repository: water1014/rifugio--community

Working branch: feature/android-api-providers

Baseline:
- Keep `main` unchanged.
- Keep the existing `gh-pages` static deployment branch unchanged.
- Build the Android APK as a separate WebView-based application first. The first APK milestone is an installable shell that loads the full Rifugio web app from a configured HTTPS server; it is not a claim that the backend is bundled or offline.
- Preserve the existing application data model and avoid destructive migrations.

## API provider requirements

The Android/Rifugio setup must support all three user-requested routes:

1. OpenCode Go subscription
   - Treat this as an OpenAI-compatible provider unless the documented Go endpoint requires a different protocol.
   - Allow a configurable HTTPS Base URL, model name, API credential, and custom request headers.
   - Do not hardcode a subscription token or ship credentials in the APK.
   - Verify the actual endpoint and required headers with a user-supplied test credential only when the user explicitly chooses to test it.

2. DeepSeek official API
   - Keep an explicit DeepSeek provider option and official Base URL support.
   - Preserve the existing OpenAI-compatible chat-completions request format where supported.
   - Test model listing and a minimal chat completion separately.

3. OpenAI-compatible APIs
   - Allow custom HTTPS Base URL, model, API key, and custom headers.
   - Keep endpoint normalization predictable so users can enter either a base URL or a full supported endpoint without duplicated path segments.

## Findings from the current main branch

- `apps/api/modules/chatroom-api.js` already recognizes `openai`, `deepseek`, and `compatible` providers, and routes both chatroom and talk requests through a shared provider proxy.
- The current chatroom proxy sends a fixed Bearer authorization header for OpenAI-compatible providers. It does not currently merge user-configured custom headers.
- `apps/web/js/05-vue-app.js` stores chatroom provider ports in browser localStorage. The current port shape includes provider, Base URL, API key, and model, but no custom-header field.
- `apps/api/modules/settings-memory-routes.js` has a separate `/api/settings/llm` configuration used by memory merging. It also uses fixed Bearer authorization and is not the primary chatroom provider configuration.
- `apps/api/modules/pet-ai.js` has its own provider configuration and fixed Bearer authorization path. It must be reviewed separately if the user expects the pet/companion AI feature to use the same providers.
- The existing provider-auth contract test verifies Bearer authentication, but does not yet cover custom headers, OpenCode Go, or DeepSeek official end-to-end behavior.

## Implementation order

1. Complete and validate the Android shell build workflow.
2. Add a shared, validated custom-header configuration path for chatroom and talk provider ports. Never expose stored API credentials in logs or public settings responses.
3. Add matching header support to model discovery and chat completion requests.
4. Add provider presets for OpenCode Go and DeepSeek official while retaining editable Base URL/model/header fields.
5. Review memory merge and companion/pet AI settings so their provider behavior is explicit rather than silently sharing or overwriting another feature's configuration.
6. Add tests for header merging, masked-key preservation, provider endpoint normalization, DeepSeek, and OpenCode Go compatibility.
7. Build and test the APK against a real HTTPS Rifugio backend before calling it ready.

## Safety and compatibility notes

- Never commit API keys, subscription tokens, private profiles, or production databases.
- Keep the existing license files and NOTICE intact.
- Do not overwrite `main` or `gh-pages`.
- Do not claim an API provider works until both model discovery (where supported) and a real chat request have been tested.


## Work completed on feature/android-api-providers

- Added an Android WebView shell project under `android-shell/` with an HTTPS-only first-run server setup screen.
- Added a GitHub Actions workflow that runs the API contract tests and builds a debug APK artifact.
- Added custom request-header support to the shared chatroom/talk provider proxy, including safe header validation, reserved hop-by-hop header blocking, size limits, and case-insensitive overrides.
- Added custom-header fields to both chatroom and Talk provider settings UI and included them in model discovery and chat requests.
- Added OpenCode Go selections in both chatroom and Talk provider settings. The legacy `https://opencode.ai/zen/go` base URL is normalized to the Go Chat Completions and model-list endpoints. The current documented `https://opencode.ai/inference/go/openai/v1` base URL is also supported.
- Added automatic stable `x-opencode-session` and Rifugio `User-Agent` headers for OpenCode Go chat requests. The current namespace is derived from the configured chatroom/talk port and model; a future per-conversation identifier should replace it when the app exposes a stable conversation ID.
- Added unit and proxy contract tests for custom headers and OpenCode Go routing.

## Not yet complete

- The Android app is currently a WebView shell, not a fully bundled/offline native app. It still requires an HTTPS deployment of the web/API server and the first-run setup screen still asks the user to enter that server URL. This conflicts with the final product requirement and must be removed by supplying a stable, preconfigured service endpoint.
- A debug APK build has now succeeded in GitHub Actions run `42359545224` (commit `40853b12875ee5e8acb108cc16791a8c1c77e5ea`). The `nido-android-debug-apk` artifact was uploaded (4,402,987 bytes; 14-day retention at upload time). This proves CI compilation and packaging only, not runtime readiness or release signing.
- Custom headers and the OpenCode Go preset are currently wired into the chatroom/talk shared provider proxy. Memory import, pet AI, image, voice, and other feature-specific API routes still need separate review and alignment.
- DeepSeek official and generic OpenAI-compatible chatroom calls use the existing shared proxy, but a full end-to-end live test with user credentials has not been run.
- Native notification plumbing now exists in the Android source: notification permission/channel, FCM message service, UnifiedPush service, notification intents carrying conversation/message IDs, and backend Android-token registration plus FCM send support. However, no Firebase project configuration/service account has been supplied, FCM is therefore inactive in the current APK, UnifiedPush distributor registration and delivery have not been tested on a physical phone, and click-through navigation has not been device-verified.
- UnifiedPush support is not yet proof of reliable background delivery on every Android device. A compatible distributor must be installed/configured, and vendor battery restrictions may still affect delivery.
- The app has not been deployed to a server or installed on a physical Android device. The APK application ID remains `app.rifugio.shell`; changing it now could break upgrade continuity and should be treated as a deliberate migration.


## Latest verified CI and remaining product blockers

- Latest verified workflow run: `42359545224`, success. API contract tests, web tests, Gradle `assembleDebug`, and artifact upload all succeeded.
- Artifact: `nido-android-debug-apk`, 4.4 MB, expires 2026-11-21 based on the upload metadata.
- This is a debug validation artifact, not a release APK and not a user-ready app.
- Highest-priority next work: remove manual server URL setup by configuring a stable HTTPS service origin; deploy and harden the backend; finish provider alignment for every AI feature; wire device registration from the Android bridge to authenticated API calls; configure a real push delivery path; and run installation, process-death, background delivery, notification tap, and upgrade/data-retention tests on a physical Android device.


## Native push integration audit (2026-11-07)

- The Android project compiled successfully in an earlier workflow run and produced a debug APK artifact. That artifact predates subsequent source changes and is not the latest build.
- The Talk module already owns native push registration. On mount and after the `refuge-authed` event it reads the native FCM token / UnifiedPush subscription, registers them through the same-origin authenticated endpoints, and listens for token/subscription refresh events. A separate duplicate bootstrap file was briefly added during audit, then removed to avoid duplicate registration requests.
- Android notification taps are persisted by `MainActivity` as a pending conversation/message payload and emitted as `nido:open-conversation`. The Talk module has a consumer that looks up the conversation, loads it from the API if needed, calls `selectTalk(id)`, and clears the pending payload after success. This is code-path coverage only; cold-start and warm-start navigation still require physical-device testing.
- FCM is optional and inactive until a Firebase `google-services.json` and server-side `FCM_SERVICE_ACCOUNT_JSON` are provisioned. UnifiedPush requires a compatible distributor installed/configured on the device. No live push delivery has been verified on hardware.
- The first-run manual server URL screen remains. A stable production backend/domain and deployment configuration are required before a ready-to-use consumer APK can be produced.
- Push registration and notification tap navigation must be verified end-to-end with the actual authenticated owner session. Do not treat successful Gradle compilation as push-delivery acceptance.


## Latest build verification (2026-11-07, run 143)

- Workflow run `42361622886` for commit `f336013cd3d8c537601fc6568d49dcf353696e5e` completed successfully after the duplicate push bootstrap was removed.
- API contract tests: passed. Web tests: passed. Gradle `assembleDebug`: passed. Artifact upload: passed.
- Artifact `nido-android-debug-apk`: 4,403,282 bytes, SHA-256 `872df79e9bb84c577d3a508c2bed931b9fcbd2535d8e2bfb3db08350ba374b6c`, expires 2026-11-21.
- This is still a debug APK. No backend host, production domain, signing key, Firebase project, or physical-device acceptance test is configured. The app still requires manual server URL setup. Do not distribute this as the final Nido app.
- Existing deployment architecture is Docker Compose with a persistent `./data` directory and `./private` secrets/profile directory. A public HTTPS domain, persistent-volume host, reverse proxy/TLS, strong generated secrets, and backup policy are prerequisites. Static GitHub Pages cannot host the API and database.
- UnifiedPush registration is user-initiated from Talk settings using the server VAPID public key; the app asks Android to select a compatible distributor. It is not automatic on first launch and cannot guarantee delivery if no distributor is installed or device battery policy blocks it.
