package app.rifugio.shell;

import android.Manifest;
import android.app.Activity;
import android.content.SharedPreferences;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.os.Build;
import android.os.Bundle;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.widget.Toast;
import android.util.Base64;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;

import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import static org.unifiedpush.android.connector.ConstantsKt.INSTANCE_DEFAULT;
import org.unifiedpush.android.connector.UnifiedPush;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String PREFS = "nido_app";
    private static final String KEY_SERVER = "server_url";
    private static final String SECRET_PREFS = "nido_encrypted_secrets";
    private static final String SECRET_KEY_ALIAS = "nido_android_secret_key_v1";
    private static final String LOCAL_APP_URL = "https://appassets.androidplatform.net/index.html";
    static final String ACTION_PUSH_TOKEN_REFRESHED = "app.rifugio.shell.PUSH_TOKEN_REFRESHED";
    static final String ACTION_UNIFIED_PUSH_UPDATED = "app.rifugio.shell.UNIFIED_PUSH_UPDATED";
    static final String EXTRA_CONVERSATION_ID = "nido_conversation_id";
    static final String EXTRA_MESSAGE_ID = "nido_message_id";
    private WebView webView;
    private SharedPreferences prefs;
    private WebViewAssetLoader assetLoader;
    private final ExecutorService httpExecutor = Executors.newCachedThreadPool();
    private boolean unifiedPushReceiverRegistered = false;
    private final BroadcastReceiver unifiedPushReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (webView == null || webView.getUrl() == null || !isConfiguredServerPage(webView.getUrl())) return;
            if (ACTION_PUSH_TOKEN_REFRESHED.equals(intent.getAction())) {
                dispatchNativePushToken();
            } else if (ACTION_UNIFIED_PUSH_UPDATED.equals(intent.getAction())) {
                dispatchUnifiedPushSubscription();
            }
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(249, 247, 242));
        getWindow().setNavigationBarColor(Color.rgb(249, 247, 242));
        int systemUi = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= 26) systemUi |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(systemUi);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return assetLoader.shouldInterceptRequest(Uri.parse(url));
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())
                        && "https".equalsIgnoreCase(uri.getScheme())) return false;
                if ("https".equalsIgnoreCase(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                }
                return true;
            }

            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isConfiguredServerPage(url)) {
                    dispatchNativePushToken();
                    dispatchUnifiedPushSubscription();
                    dispatchPendingNotification(getIntent());
                }
            }
        });

        // Nido is local-first: the complete web app is packaged inside this APK.
        // Keep the synthetic HTTPS origin so same-origin storage and root-relative assets work.
        prefs.edit().putString(KEY_SERVER, LOCAL_APP_URL).apply();
        attachNativeBridge();
        webView.loadUrl(LOCAL_APP_URL);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // A notification tap can arrive while MainActivity and its WebView are already alive.
        // In that case onPageFinished will not run again, so dispatch the deep link here.
        if (webView != null && webView.getUrl() != null && isConfiguredServerPage(webView.getUrl())) {
            dispatchPendingNotification(intent);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                NidoMessagingService.CHANNEL_MESSAGES,
                "Nido 消息",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Nido 主动消息和聊天提醒");
        channel.enableVibration(true);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private void registerUnifiedPushReceiver() {
        IntentFilter filter = new IntentFilter(ACTION_UNIFIED_PUSH_UPDATED);
        filter.addAction(ACTION_PUSH_TOKEN_REFRESHED);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(unifiedPushReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(unifiedPushReceiver, filter);
        }
        unifiedPushReceiverRegistered = true;
    }

    private void dispatchUnifiedPushSubscription() {
        if (webView == null || webView.getUrl() == null || !webView.getUrl().startsWith("https://")) return;
        String raw = getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE)
                .getString("unified_push_subscription", "");
        if (raw == null || raw.isEmpty()) {
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('nido:push-subscription',{detail:{removed:true}}));",
                    null);
            return;
        }
        String script = "window.dispatchEvent(new CustomEvent('nido:push-subscription',{detail:"
                + raw + "}));";
        webView.evaluateJavascript(script, null);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7101);
        }
    }

    private void requestFirebaseToken() {
        try {
            FirebaseApp app = FirebaseApp.initializeApp(this);
            if (app == null) return; // Firebase project config has not been supplied yet.
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
                getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE)
                        .edit().putString(NidoMessagingService.KEY_TOKEN, token).apply();
                dispatchNativePushToken();
            }).addOnFailureListener(error ->
                    android.util.Log.w("NidoPush", "FCM token unavailable: " + error.getMessage()));
        } catch (IllegalStateException error) {
            android.util.Log.i("NidoPush", "FCM is not configured for this build yet.");
        }
    }

    private void attachNativeBridge() {
        webView.removeJavascriptInterface("NidoNative");
        webView.addJavascriptInterface(new NidoBridge(), "NidoNative");
    }

    private boolean isConfiguredServerPage(String url) {
        try {
            Uri configured = Uri.parse(prefs.getString(KEY_SERVER, ""));
            Uri current = Uri.parse(url);
            return configured.getHost() != null
                    && configured.getHost().equalsIgnoreCase(current.getHost())
                    && "https".equalsIgnoreCase(current.getScheme());
        } catch (Exception ignored) {
            return false;
        }
    }

    private void dispatchNativePushToken() {
        if (webView == null || !webView.getUrl().startsWith("https://")) return;
        SharedPreferences push = getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE);
        String token = push.getString(NidoMessagingService.KEY_TOKEN, "");
        if (token.isEmpty()) return;
        String installationId = NidoMessagingService.installationId(push);
        String script = "window.dispatchEvent(new CustomEvent('nido:push-token',{detail:{token:"
                + JSONObject.quote(token) + ",installationId:" + JSONObject.quote(installationId) + "}}));";
        webView.evaluateJavascript(script, null);
    }

    private void dispatchPendingNotification(android.content.Intent intent) {
        if (intent == null || webView == null) return;
        String conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID);
        if (conversationId == null || conversationId.trim().isEmpty()) {
            conversationId = intent.getStringExtra("conversationId");
        }
        if (conversationId == null || conversationId.trim().isEmpty()) {
            conversationId = intent.getStringExtra("convoId");
        }
        String messageId = intent.getStringExtra(EXTRA_MESSAGE_ID);
        if (messageId == null || messageId.isEmpty()) messageId = intent.getStringExtra("messageId");
        if (conversationId == null || conversationId.trim().isEmpty()) return;
        JSONObject pending = new JSONObject();
        try {
            pending.put("conversationId", conversationId);
            pending.put("messageId", messageId == null ? "" : messageId);
            getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE)
                    .edit().putString("pending_notification", pending.toString()).apply();
        } catch (Exception ignored) {}
        String script = "window.dispatchEvent(new CustomEvent('nido:open-conversation',{detail:{conversationId:"
                + JSONObject.quote(conversationId) + ",messageId:"
                + JSONObject.quote(messageId == null ? "" : messageId) + "}}));";
        webView.evaluateJavascript(script, null);
        intent.removeExtra(EXTRA_CONVERSATION_ID);
        intent.removeExtra(EXTRA_MESSAGE_ID);
        intent.removeExtra("conversationId");
        intent.removeExtra("convoId");
        intent.removeExtra("messageId");
    }

    private boolean isUnsafeAddress(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress()
                || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                || address.isMulticastAddress()) return true;
        byte[] bytes = address.getAddress();
        if (bytes.length == 4) {
            int a = bytes[0] & 255, b = bytes[1] & 255;
            return a == 0 || a == 10 || a == 127 || a >= 224
                    || (a == 100 && b >= 64 && b <= 127)
                    || (a == 169 && b == 254)
                    || (a == 172 && b >= 16 && b <= 31)
                    || (a == 192 && (b == 0 || b == 168))
                    || (a == 198 && (b == 18 || b == 19));
        }
        return bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc;
    }

    private String readLimited(InputStream input, int limit) throws Exception {
        if (input == null) return "";
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0, count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > limit) throw new IllegalStateException("响应内容过大");
            output.write(buffer, 0, count);
        }
        return output.toString("UTF-8");
    }

    private void deliverNativeHttpResult(String requestId, JSONObject result) {
        if (isFinishing() || isDestroyed() || webView == null) return;
        final String payload = result.toString();
        runOnUiThread(() -> {
            if (webView == null || isFinishing() || isDestroyed()) return;
            String script = "window.__nidoNativeHttpResolve && window.__nidoNativeHttpResolve("
                    + JSONObject.quote(requestId) + "," + JSONObject.quote(payload) + ")";
            webView.evaluateJavascript(script, null);
        });
    }

    private SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(SECRET_KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(SECRET_KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(SECRET_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private boolean validSecretName(String name) {
        return name != null && name.matches("[a-zA-Z0-9_.-]{1,64}");
    }

    private String readEncryptedSecret(String name) {
        if (!validSecretName(name)) return "";
        try {
            String packed = getSharedPreferences(SECRET_PREFS, MODE_PRIVATE).getString(name, "");
            int split = packed.indexOf(':');
            if (split <= 0) return "";
            byte[] iv = Base64.decode(packed.substring(0, split), Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(packed.substring(split + 1), Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception error) {
            android.util.Log.w("NidoSecret", "Could not decrypt local setting: " + name);
            return "";
        }
    }

    private boolean writeEncryptedSecret(String name, String value) {
        if (!validSecretName(name) || value == null || value.length() > 8192) return false;
        if (value.isEmpty()) {
            getSharedPreferences(SECRET_PREFS, MODE_PRIVATE).edit().remove(name).apply();
            return true;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
                    + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            getSharedPreferences(SECRET_PREFS, MODE_PRIVATE).edit().putString(name, packed).apply();
            return true;
        } catch (Exception error) {
            android.util.Log.e("NidoSecret", "Could not encrypt local setting: " + name);
            return false;
        }
    }

    private void enqueueNativeRequest(String requestId, String method, String rawUrl, String rawHeaders, String body) {

            final String id = requestId == null ? "" : requestId.substring(0, Math.min(80, requestId.length()));
            httpExecutor.execute(() -> {
                JSONObject result = new JSONObject();
                HttpURLConnection connection = null;
                try {
                    URL url = new URL(rawUrl);
                    if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getUserInfo() != null
                            || url.getHost() == null || url.getHost().isEmpty()) {
                        throw new IllegalArgumentException("只允许 HTTPS API 地址");
                    }
                    for (InetAddress address : InetAddress.getAllByName(url.getHost())) {
                        if (isUnsafeAddress(address)) throw new IllegalArgumentException("API 地址指向本地或私有网络，已拒绝");
                    }
                    byte[] requestBody = (body == null ? "{}" : body).getBytes(StandardCharsets.UTF_8);
                    if (requestBody.length > 12 * 1024 * 1024) throw new IllegalArgumentException("请求内容超过 12 MB");
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setRequestMethod(method);
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(20000);
                    connection.setReadTimeout(150000);
                    connection.setDoOutput("POST".equals(method));
                    connection.setRequestProperty("Content-Type", "application/json");
                    JSONObject headers = new JSONObject(rawHeaders == null ? "{}" : rawHeaders);
                    Iterator<String> names = headers.keys();
                    while (names.hasNext()) {
                        String name = names.next();
                        String value = headers.optString(name, "");
                        String lower = name.toLowerCase(java.util.Locale.ROOT);
                        if (!name.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]{1,80}")
                                || value.length() > 8192 || value.contains("\r") || value.contains("\n")
                                || lower.equals("host") || lower.equals("content-length")
                                || lower.equals("connection") || lower.equals("cookie")
                                || lower.equals("set-cookie") || lower.startsWith("proxy-")
                                || lower.equals("transfer-encoding")) continue;
                        connection.setRequestProperty(name, value);
                    }
                    if ("POST".equals(method)) {
                        try (OutputStream output = connection.getOutputStream()) {
                            output.write(requestBody);
                        }
                    }
                    int status = connection.getResponseCode();
                    InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                    String responseBody = readLimited(stream, 12 * 1024 * 1024);
                    result.put("status", status);
                    result.put("body", responseBody);
                    if (status >= 300 && status < 400) result.put("error", "API 重定向已拒绝，请检查 Base URL");
                } catch (Exception error) {
                    try {
                        result.put("status", 0);
                        result.put("body", "");
                        result.put("error", error.getMessage() == null ? "网络请求失败" : error.getMessage());
                    } catch (Exception ignored) {}
                } finally {
                    if (connection != null) connection.disconnect();
                }
                deliverNativeHttpResult(id, result);
            });
        
    }

    private final class NidoBridge {
        @JavascriptInterface public String getSecret(String name) {
            return readEncryptedSecret(name);
        }
        @JavascriptInterface public boolean setSecret(String name, String value) {
            return writeEncryptedSecret(name, value);
        }
        @JavascriptInterface public void postJson(String requestId, String rawUrl, String rawHeaders, String body) {
            enqueueNativeRequest(requestId, "POST", rawUrl, rawHeaders, body);
        }
        @JavascriptInterface public void getJson(String requestId, String rawUrl, String rawHeaders) {
            enqueueNativeRequest(requestId, "GET", rawUrl, rawHeaders, "");
        }
        @JavascriptInterface public String getPushToken() {
            return getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE)
                    .getString(NidoMessagingService.KEY_TOKEN, "");
        }
        @JavascriptInterface public String getInstallationId() {
            return NidoMessagingService.installationId(
                    getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE));
        }
        @JavascriptInterface public String getUnifiedPushSubscription() {
            return getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE)
                    .getString("unified_push_subscription", "");
        }
        @JavascriptInterface public String getPendingNotification() {
            return getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE)
                    .getString("pending_notification", "");
        }
        @JavascriptInterface public void clearPendingNotification() {
            getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE)
                    .edit().remove("pending_notification").apply();
        }
        @JavascriptInterface public void enableUnifiedPush(String vapidPublicKey) {
            runOnUiThread(() -> {
                String vapid = vapidPublicKey == null ? "" : vapidPublicKey.trim();
                if (vapid.length() != 87) {
                    Toast.makeText(MainActivity.this, "通知服务公钥无效，请检查服务器配置", Toast.LENGTH_LONG).show();
                    return;
                }
                try {
                    UnifiedPush.tryUseCurrentOrDefaultDistributor(MainActivity.this, success -> {
                        if (success) {
                            try {
                                UnifiedPush.register(getApplicationContext(), INSTANCE_DEFAULT, "Nido 消息通知", vapid);
                                Toast.makeText(MainActivity.this, "已请求连接通知分发器", Toast.LENGTH_SHORT).show();
                            } catch (Exception error) {
                                Toast.makeText(MainActivity.this, "通知注册失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
                            }
                        } else {
                            Toast.makeText(MainActivity.this, "没有可用的通知分发器，请先安装并配置 UnifiedPush 分发器", Toast.LENGTH_LONG).show();
                        }
                        return kotlin.Unit.INSTANCE;
                    });
                } catch (Exception error) {
                    Toast.makeText(MainActivity.this, "无法启动通知分发器：" + error.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }
        @JavascriptInterface public void refreshUnifiedPush(String vapidPublicKey) {
            runOnUiThread(() -> {
                String vapid = vapidPublicKey == null ? "" : vapidPublicKey.trim();
                if (vapid.length() != 87) return;
                try {
                    if (UnifiedPush.getAckDistributor(getApplicationContext()) != null) {
                        UnifiedPush.register(getApplicationContext(), INSTANCE_DEFAULT, "Nido 消息通知", vapid);
                    }
                } catch (Exception error) {
                    android.util.Log.w("NidoPush", "UnifiedPush re-registration failed: " + error.getMessage());
                }
            });
        }
    }

    @Override protected void onDestroy() {
        if (unifiedPushReceiverRegistered) {
            try { unregisterReceiver(unifiedPushReceiver); } catch (Exception ignored) {}
            unifiedPushReceiverRegistered = false;
        }
        httpExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override public boolean onCreateOptionsMenu(Menu menu) {
        menu.add("重新加载");
        return true;
    }

    @Override public boolean onOptionsItemSelected(MenuItem item) {
        if ("重新加载".contentEquals(item.getTitle())) {
            webView.reload();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
