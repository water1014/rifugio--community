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
