# Nido Android Rebuild Plan

## Product target

Nido is a single-person, Android-first companion app for one companion: 宋祁. The deliverable is an installable APK that behaves as a dependable daily-use app, not a hosted website inside a WebView. The design and feature completeness should take inspiration from the user's established SullyOS/糯米机 workflow, while keeping Nido's own identity and preserving upstream license/attribution.

## Non-negotiable constraints

- Android APK is the primary product. Desktop/PWA is secondary.
- No Nido-operated backend, VPS, domain, Docker, account server, or paid hosting requirement.
- Never require a Claude subscription or Anthropic CLI.
- Text providers: OpenCode Go subscription first, DeepSeek official, and generic OpenAI-compatible endpoints with custom headers.
- Image generation: NovelAI direct API, text-to-image first; local image history and export.
- One companion only: 宋祁. No public character plaza, social network, or multi-character marketplace.
- Local-first persistence. Chat, settings, memories, generated images and app data must survive ordinary app updates.
- Never change `main`; all work stays on this rebuild branch until explicitly approved.
- Do not ask the user to uninstall or clear app data as a routine troubleshooting step.

## Rebuild strategy

Do not keep stacking patches onto the existing server-oriented web application. First establish a stable Android application shell and a small, explicit local app contract. Migrate features into that contract in controlled slices, retaining the current implementation as a reference until each replacement passes tests.

### Phase 0: Audit and stabilize the foundation

- Inventory every HTML entry, script, stylesheet, remote font/image, service-worker, and API route referenced by the current app.
- Identify startup blockers and remove server-only lock/config flows from standalone Android startup.
- Add a deterministic startup sequence with visible diagnostics that distinguish JS exceptions, missing local assets, provider/network errors, and optional media failures.
- Make startup independent of third-party font/CDN availability.
- Add Android smoke checks for required packaged files and URL resolution.
- Verify WebView safe-area, keyboard resize, back navigation, file picker, notification permission and process recreation.

### Phase 1: Native-first Android foundation

- Use a local, versioned app shell with a narrow JavaScript bridge.
- Keep secrets in Android Keystore-backed storage; never put API keys in localStorage or logs.
- Add complete backup/restore for IndexedDB, localStorage, app settings and generated image files before changing persistence schemas.
- Keep the application package/signing identity stable for in-place updates. Establish a backed-up release signing key before calling any build a production release.

### Phase 2: Core companion experience

- One-to-one chat with streaming, stop/regenerate/edit/resend, attachments and conversation management.
- Provider adapter layer with provider-specific endpoint, headers, model list, timeout, error mapping and test connection.
- OpenCode Go integration must be implemented against its supported Zen endpoint/protocol, not by assuming an unrelated OpenAI endpoint will work in WebView.
- Local memory: manual memory, pinned memories, searchable timeline, import/export, and explicit user control.
- Proactive messages: Android scheduled work plus local notifications, with quiet hours, frequency and budget limits.

### Phase 3: Companion tools

- NovelAI text-to-image with prompt helper, positive/negative prompts, presets, generation status, cancel/retry and local gallery.
- Voice input/output using Android capabilities with clear availability checks and graceful fallback.
- Journaling, moments, favorite quotes and other companion-side tools only when their local persistence and Android behavior are verified.

### Phase 4: Release validation

- Run unit, static asset, provider contract and Android build tests.
- Validate APK contents, package ID, versionCode, signing certificate continuity and upgrade path.
- Provide a single APK plus checksum and a plain-language change log.
- Never describe a build as device-tested until it has actually been installed and exercised on the user's vivo S19.

## Acceptance criteria

1. A cold start opens the companion home without any server URL, password prompt, CDN dependency or diagnostic overlay.
2. Airplane mode still opens the app and displays local chat history, memories and saved images. AI calls fail with a clear network/provider message rather than breaking the app.
3. OpenCode Go, DeepSeek and generic OpenAI-compatible chat requests can be tested independently and produce actionable errors.
4. NAI text-to-image saves generated images locally and they remain available after app restart and in-place update.
5. Proactive messages can fire through Android local notifications after the app is backgrounded, subject to Android battery and notification permissions.
6. Full local backup can be exported and restored before any schema migration.
7. An upgrade APK installs over the previous release with the same signing certificate and does not erase user data.

## Current known risks

- The existing `apps/web/index.html` is a very large legacy entry document and still contains web-oriented assumptions, remote font loading, and server-oriented lock-screen markup.
- The current standalone mode is implemented as conditional behavior inside a broader server-first app. This makes regressions and hidden backend calls likely.
- The current CI debug keystore cache is only a temporary continuity measure. It is not a permanent release signing solution.
- Voice recognition and speech synthesis availability depend on Android system services and cannot be promised as offline capabilities.
