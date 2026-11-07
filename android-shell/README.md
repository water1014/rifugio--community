# Nido Android app (development shell)

The Android application is branded **Nido**. This directory currently contains an early WebView shell only; it is not yet the finished daily-use Android app.

## Current prototype behavior

- Opens a local first-run setup page.
- Requires a deployed HTTPS Rifugio backend URL.
- Stores that URL in Android private preferences and loads the remote web app.
- Does not bundle the backend or provide offline operation.

## Build

The repository workflow `.github/workflows/android-apk.yml` builds a debug APK on pushes to `feature/android-api-providers` that touch the Android project or relevant web/API code, or when manually dispatched.

After a successful run, open the workflow run's **Artifacts** section and download `nido-android-debug-apk`. The APK is unsigned with a release keystore and is for development testing only.

## Product requirements still to implement

- A real Android app experience, not a URL-entry WebView wrapper.
- Native notification permission handling and a high-importance Nido message channel are now scaffolded.
- UnifiedPush 3.3.5 connector is included as the primary cross-vendor Android transport. It lets the user select an installed push distributor, stores the Web Push endpoint/keys locally, and reuses the server's existing VAPID/Web Push sender.
- The native push service decrypts incoming UnifiedPush payloads, posts a high-importance Android notification, and routes taps to the correct Talk conversation.
- The Talk settings include an explicit “开启后台推送” action. After distributor registration, the app uploads the endpoint to the authenticated backend.
- FCM HTTP v1 remains an optional secondary transport for devices with Google Play services. It requires `android-shell/app/google-services.json` at build time and `FCM_SERVICE_ACCOUNT_JSON` (raw or base64 JSON) on the server. No Firebase credentials belong in Git.
- Devices without Google Play services can use UnifiedPush, but need a compatible distributor app installed and configured. A push distributor is a separate Android app; Nido cannot promise background delivery until a distributor is registered.
- Durable local data and non-destructive app upgrades.
- No dependency on a Claude subscription. Provider support must be audited feature by feature.
- No API credentials embedded in the APK.

The existing application ID `app.rifugio.shell` is retained for upgrade continuity while the product is developed. The FCM SDK is optional at runtime until Firebase is configured, so the app still builds without project-specific credentials. UnifiedPush works through a separately installed distributor and does not require Google Play services. A release APK will require a stable private signing key.
