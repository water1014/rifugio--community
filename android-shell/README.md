# Rifugio Android shell

This is a lightweight Android WebView container for the Rifugio web application.

## Build

The repository workflow `.github/workflows/android-apk.yml` builds a debug APK on pushes to `feature/android-api-providers` that touch this project, or when manually dispatched.

After a successful run, open the workflow run's **Artifacts** section and download `rifugio-android-debug-apk`. The APK is currently unsigned with a release keystore and is intended for private testing.

## First launch

1. Install the debug APK.
2. Enter the HTTPS address of a deployed Rifugio server.
3. Tap Connect.

The shell does not bundle the Rifugio backend. Until a server is deployed and connected, it only displays the setup screen. The configured server URL is stored in the app's private preferences; web data is held in the WebView app storage.

## Security and limitations

- HTTPS only; cleartext HTTP is disabled.
- No API keys or OpenCode/DeepSeek credentials are bundled in the APK.
- API credentials belong in the Rifugio server-side settings, not in this Android shell.
- This initial shell does not yet include offline backend support, push notifications, file export integration, or signed in-app updates.
- The same Android application ID is retained for future upgrades: `app.rifugio.shell`. A future release build must use a stable private signing key to upgrade this debug package safely.
