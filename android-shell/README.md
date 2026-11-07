# Nido Android app

Nido is a **standalone, local-first Android app**. It does not require a self-hosted Rifugio backend, VPS, domain, Docker, or account server.

## How it works

- The complete web UI is bundled into the APK and loaded from Android's local WebViewAssetLoader origin.
- Chat requests go directly from Android to the API provider selected by the user. OpenCode Go, DeepSeek, and OpenAI-compatible providers use the Android native HTTPS bridge, avoiding WebView CORS limitations.
- NovelAI image generation also goes directly from Android to the selected NovelAI endpoint. Generated images are stored in app-private storage.
- Chat history and app settings stay on the device (IndexedDB / localStorage). Provider secrets are stored using Android Keystore-backed encrypted preferences.
- Proactive messages can run locally through Android WorkManager and the configured text API. Android notifications are generated on-device.
- Internet access is needed for AI provider requests, but **there is no Nido-owned backend to deploy or pay for**.

## What does not require a server

Chat, local conversation history, local memories (including Feel, manual edits, pin/archive/delete and keyword search), favorite quotes, moments/comments, AI sticker library, NovelAI generation, and scheduled proactive messages are designed to work without a Nido backend. Structured JSON memory files can be selected from Android's system file picker and imported locally.

Standalone voice input uses the device/WebView speech-recognition capability when available, and spoken AI replies use Android's system speech synthesis. It does not call the hosted `/api/speech-to-text` or `/api/voice/synthesize` endpoints. Availability and voice quality depend on the speech services installed on the phone; this is not a bundled offline speech engine. Server-dependent community features such as account login, cross-device sync, cloud backup, vector Embedding, automatic Dream/AI memory extraction, remote social feeds, and remote push-distributor registration are not part of the standalone Android flow yet. Local notifications do not require those services. Local keyword search does not upload memory content.

## Build

The workflow `.github/workflows/android-apk.yml` validates the complete Vue template, web scripts, and tests before building a debug APK on pushes to `feature/android-api-providers` and `feature/nido-android-rebuild`.

After a successful run, open the workflow's **Artifacts** section and download nido-android-debug-apk.

The debug APK is for testing only. A daily-use release must be signed with a stable private release key. Keep the same signing key for future upgrades so Android can update the app without uninstalling it or clearing local data.

## Privacy and storage

- API keys are not embedded in the APK or sent to a Nido server.
- Do not uninstall the app when updating unless you have exported/backed up anything important.
- Android may stop background work under battery restrictions; proactive message timing is therefore best-effort and subject to the OS.


### Updating the Android test APK safely

The CI workflow caches its generated Android debug signing key and increments the APK version code from the GitHub Actions run number. Install the first APK produced after this signing-cache change as the baseline for subsequent in-place test updates. GitHub Actions caches can eventually be evicted, so this is a practical test-build safeguard, not a permanent production signing-key solution. Do not uninstall the app to resolve a signature mismatch if local data matters. A permanent release requires a private, backed-up signing keystore configured as GitHub Actions secrets.
