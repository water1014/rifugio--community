# Nido Android product architecture

Status: implementation plan for the real Android product. The current Android shell is a temporary prototype and is not the target deliverable.

## Product contract

- Product name: Nido.
- Deliver a real Android application suitable for daily use, not a WebView wrapper that asks the user to enter a server URL.
- Do not require a Claude subscription. Claude Code / Terminal execution is not an acceptable dependency for ordinary chat, proactive messages, memory work, or other core features.
- Preserve existing conversations, images, memory data, and settings during upgrades. Keep the current Android application ID until a deliberate migration is planned.
- Never ship API keys, subscription tokens, Firebase service-account credentials, or backend secrets inside the APK.

## AI provider contract

Core AI features must use an explicit provider configuration rather than silently falling back to Claude:

1. OpenCode Go subscription: OpenAI-compatible chat-completions route for compatible models, canonical Go base URL `https://opencode.ai/inference/go/openai/v1`, and stable `x-opencode-session` on every request. Go model-list endpoint is `https://opencode.ai/inference/go/v1/models`.
2. DeepSeek official API: `https://api.deepseek.com/v1` where the selected model supports chat completions.
3. Generic OpenAI-compatible API: editable HTTPS base URL, model, credential, and custom headers.

Provider coverage must be audited separately for ordinary chat, Talk, proactive generation, memory summarization/merge, companion tools, image/vision, speech, and any scheduled/background AI task. A provider selector in one screen does not prove that another feature uses it.

## Proactive messages and Android notifications

The existing server already runs a background proactive scheduler and can send browser Web Push. The active-message generation path has now been changed to call the selected API provider directly, using encrypted server-side credentials and the current conversation context. This implementation is committed on the feature branch but remains subject to CI and integration testing.

The current Web Push subscription is a browser Service Worker subscription. It is not sufficient evidence that notifications will work in the Android WebView app after the app process is killed.

Target Android delivery:

- Native Android notification channels and Android 13+ notification permission.
- A native UnifiedPush connector and service now receive encrypted Web Push payloads from a user-selected distributor, render high-importance notifications, persist endpoint/key material, and forward notification-tap conversation IDs into the Talk UI.
- UnifiedPush registrations reuse the existing Web Push/VAPID backend route. Endpoint registration is authenticated and public-HTTPS validated to block private-network SSRF; the sender revalidates endpoints before each delivery.
- An optional native Firebase Messaging service and FCM HTTP v1 sender are also implemented for devices with Google Play services, using encrypted registration tokens and a server-side service-account JSON secret.
- The proactive scheduler fans out to existing browser Web Push subscriptions, UnifiedPush devices, and optional FCM devices.
- UnifiedPush requires a compatible distributor app to be installed and selected. FCM remains unconfigured until an app-specific `google-services.json` is supplied to the Android build and `FCM_SERVICE_ACCOUNT_JSON` (raw JSON or base64 JSON) is configured on the server.
- Backend stores per-install push tokens securely and sends notifications when the proactive scheduler creates a message.
- Notification payload contains a conversation ID and message ID; tapping it opens that exact conversation in Nido.
- Deduplicate notifications and messages, remove expired device tokens, and never put private message bodies in logs.
- Keep Web Push for ordinary browser/PWA users; native FCM is a separate Android transport.

FCM needs an app-specific Firebase project configuration and server-side credentials. These are deployment inputs, not values to guess or commit. The Android build must remain reproducible without those secrets, while clearly reporting that native push is not configured until valid Firebase settings are supplied. Firebase's official Android setup requires Google Play services on the target device; devices without Google Play services need a separately implemented transport and must not be promised FCM delivery.

## Android application requirements

- Bundle the web UI assets where practical; do not show a first-run server URL form.
- Use a single configured backend endpoint supplied by the release build/deployment environment.
- Native deep links for conversation notifications.
- Safe-area / status-bar / navigation-bar handling on modern Android devices.
- Durable app data and non-destructive migrations.
- Stable release signing key and upgrade path; debug APKs are not release upgrades.
- File/image selection, downloads, camera/microphone permissions, and share intents need explicit native handling.
- Background restrictions and vendor battery management must be tested on a physical device. Do not claim guaranteed delivery based only on a timer or a foreground WebView.

## Existing implementation findings

- `apps/api/modules/talk-proactive.js` runs on the server and calculates quiet windows / due times. This is a useful scheduler foundation.
- Proactive generation has been moved off `/api/terminal-chat/send` and onto the configured provider API. OpenCode Go, DeepSeek, and compatible providers use the shared endpoint/header/session helpers; provider credentials are encrypted in the server settings store and masked in settings responses.
- Tests now cover OpenCode Go proactive request routing, conversation context, session headers, and encrypted/masked provider credentials. CI still needs to pass before this change is considered verified.
- `apps/api/modules/push-routes.js` currently stores Web Push subscriptions and sends VAPID notifications.
- The Talk UI currently asks for browser Notification permission and subscribes a Service Worker. Android native push needs a separate token-registration and delivery path.
- The current Android shell asks the user to enter an HTTPS server URL. That setup screen is explicitly temporary and must be removed from the final product.

## Delivery gates

1. Finish the API-provider audit and make CI green; the Talk default and proactive-generation path have been moved to API mode, with tests added but not yet verified by a successful run.
2. Complete the remaining Claude-dependency audit across memory, pet AI, image/vision, voice, and any terminal-only features.
3. Implement native Android push registration, backend delivery, notification channels, and conversation deep-link routing.
4. Bundle the frontend, configure the backend endpoint without a user-facing URL prompt, and preserve local data.
5. Configure Firebase project credentials outside the repository and verify native push delivery.
6. Build a signed release APK, test install/upgrade, and verify push while foregrounded, backgrounded, and after process termination on a physical Android device.
