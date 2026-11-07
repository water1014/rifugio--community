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
- Firebase Messaging client service, encrypted device-token registration, and server-side FCM HTTP v1 delivery are implemented behind optional Firebase/service-account configuration.
- Notification taps carry the conversation ID into the Talk UI; the UI registers the native token after authentication.
- Firebase delivery is not active until a Firebase Android app config (`google-services.json`) is supplied at build time and `FCM_SERVICE_ACCOUNT_JSON` (or base64-encoded JSON) is configured on the server. No Firebase credentials belong in Git.
- Durable local data and non-destructive app upgrades.
- No dependency on a Claude subscription. Provider support must be audited feature by feature.
- No API credentials embedded in the APK.

The existing application ID `app.rifugio.shell` is retained for upgrade continuity while the product is developed. The FCM SDK is optional at runtime until Firebase is configured, so the app still builds without project-specific credentials. A release APK will require a stable private signing key.
