# Nido Android: Local-first implementation plan

This document records the revised product direction agreed with the owner on 2026-11-07.

## Product decision

Nido's first usable Android release is a **local-first, single-device app**. It must not require a separately deployed Nido server, a domain, a public IP, or a manually entered server URL.

The existing `feature/android-api-providers` branch remains the only development target. Do not modify `main`, `gh-pages`, or the upstream author's repository.

## First-release architecture

- Bundle the web application and its static assets inside the Android APK.
- Launch the bundled app directly from Android assets. The first-run "enter server URL" setup screen must disappear from the normal user path.
- Keep conversations, profile data, memories, settings, and generated-image metadata on-device. Prefer IndexedDB for larger records and media; keep localStorage for small preferences only.
- Keep provider credentials on-device. Never embed a user's API key in the APK, repository, build logs, or a shared backend.
- Support OpenCode Go, DeepSeek official API, and OpenAI-compatible endpoints with editable model, base URL, and custom headers.
- Make network requests through a native Android HTTP bridge where browser CORS would otherwise block a provider. Validate HTTPS by default, reject unsafe cleartext endpoints, and return sanitized errors to the web UI.
- Preserve existing data across app updates. Use the same application ID and signing key for release upgrades; provide export/backup before any storage migration.
- Local notifications may be scheduled by Android while the app is backgrounded. They are best-effort and must not be described as guaranteed instant delivery after force-stop, device reboot without rescheduling, battery restrictions, or vendor background-kill policies.

## Explicitly deferred

The following features are not part of the no-backend first milestone:

- Cross-device cloud sync.
- Remote push delivery while the app is force-stopped.
- Server-side proactive-message scheduling.
- Shared multi-user rooms and server-hosted social features.
- Server-dependent MCP tools, cloud memory services, and remote terminal features.

These features may later be offered as optional add-ons, but the app must remain useful without them. Do not silently make core chat depend on a server.

## Delivery milestones

### L0: Packaged Android app
- Copy the web app's production assets into the Android APK during CI.
- Launch the bundled `index.html` without a server setup page.
- Verify static assets, fonts, icons, navigation, safe-area insets, and WebView storage on a clean install and an app upgrade.
- Mark server-only sections unavailable rather than leaving broken loading states.

### L1: Local provider chat
- Add a native asynchronous HTTP bridge for provider requests.
- Implement OpenCode Go, DeepSeek, and OpenAI-compatible chat completion through that bridge.
- Support custom headers, model selection, cancellation/timeouts, text and image attachments where the provider supports them.
- Store provider settings securely on-device; do not log secrets.
- Add tests for endpoint normalization, auth headers, custom-header precedence, timeout, cancellation, and malformed responses.

### L2: Local data and memory
- Move durable conversations and large media to IndexedDB with migration from existing localStorage keys.
- Make export/import and backup/restore available before removing any legacy data path.
- Keep memory search and summarization local to the device's configured provider.

### L3: Local proactive messages
- Implement an Android WorkManager-based scheduler and local notifications.
- Respect user-defined quiet hours, frequency, battery/network constraints, and notification permission.
- Clearly disclose that Android/OEM background restrictions can delay work; no serverless design can guarantee instant messages after force-stop.

### L4: Optional cloud features (later, not required)
- Only revisit a backend if the owner explicitly asks for sync or reliable remote push.
- Keep any cloud service optional and never require the owner to purchase a domain just to use local chat.

## Acceptance criteria for the first usable APK

1. Fresh install opens Nido directly; no server URL, passphrase, or Claude subscription is required to enter the app.
2. User can configure OpenCode Go, DeepSeek, or an OpenAI-compatible provider in the app.
3. A text conversation succeeds without a Nido backend.
4. Conversations and settings remain after force-closing and reopening the app.
5. App upgrade preserves existing local data.
6. Android notification permission is requested in context; local notifications work while Android permits background execution.
7. The UI explains which features require a future optional cloud service instead of showing misleading success or endless loading.
8. CI builds the APK and runs the relevant web/API/native contract tests.

## Security notes

- Provider API keys are secrets. Use Android Keystore-backed encryption for stored credentials; never write raw keys to logs or crash reports.
- WebView JavaScript bridges must expose only narrow, validated methods. Do not expose arbitrary file access, shell execution, or unrestricted URL fetching.
- Restrict navigation to the bundled app and explicitly approved HTTPS provider requests.
- Treat all model output and imported data as untrusted content.
