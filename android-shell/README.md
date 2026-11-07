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
- Native notification channels and notification permission handling.
- Push delivery and backend scheduling for proactive messages when the app is backgrounded or terminated.
- Notification deep links that open the correct conversation.
- Durable local data and non-destructive app upgrades.
- No dependency on a Claude subscription. Provider support must be audited feature by feature.
- No API credentials embedded in the APK.

The existing application ID `app.rifugio.shell` is retained for upgrade continuity while the product is developed. A release APK will require a stable private signing key.
