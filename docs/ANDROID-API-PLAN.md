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
- Added a custom-header field to the chatroom provider settings UI and included it in model discovery and chat requests.
- Added an OpenCode Go provider preset. The legacy `https://opencode.ai/zen/go` base URL is normalized to the Go Chat Completions and model-list endpoints. The current documented `https://opencode.ai/inference/go/openai/v1` base URL is also supported.
- Added automatic stable `x-opencode-session` and Rifugio `User-Agent` headers for OpenCode Go chat requests. The current namespace is derived from the configured chatroom/talk port and model; a future per-conversation identifier should replace it when the app exposes a stable conversation ID.
- Added unit and proxy contract tests for custom headers and OpenCode Go routing.

## Not yet complete

- The Android shell is not a bundled/offline Rifugio app. It requires an HTTPS deployment of the web/API server.
- The APK has not yet passed a successful build; the first CI attempt failed because the Android SDK setup action tried to install the retired `tools` package. The workflow was updated to install explicit SDK packages and is being rechecked.
- Custom headers and the OpenCode Go preset are currently wired into the chatroom/talk shared provider proxy. Memory import, pet AI, image, voice, and other feature-specific API routes still need separate review and alignment.
- DeepSeek official and generic OpenAI-compatible chatroom calls use the existing shared proxy, but a full end-to-end live test with user credentials has not been run.
- The app has not been deployed to a server or installed on a physical Android device.
