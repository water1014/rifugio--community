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
import android.os.Build;
import android.os.Bundle;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import static org.unifiedpush.android.connector.ConstantsKt.INSTANCE_DEFAULT;
import org.unifiedpush.android.connector.UnifiedPush;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String PREFS = "nido_app";
    private static final String KEY_SERVER = "server_url";
    static final String ACTION_PUSH_TOKEN_REFRESHED = "app.rifugio.shell.PUSH_TOKEN_REFRESHED";
    static final String ACTION_UNIFIED_PUSH_UPDATED = "app.rifugio.shell.UNIFIED_PUSH_UPDATED";
    static final String EXTRA_CONVERSATION_ID = "nido_conversation_id";
    static final String EXTRA_MESSAGE_ID = "nido_message_id";
    private WebView webView;
    private SharedPreferences prefs;
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
        registerUnifiedPushReceiver();
        createNotificationChannel();
        requestNotificationPermission();

        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setOnLongClickListener(view -> {
            if (!prefs.getString(KEY_SERVER, "").isEmpty()) {
                showSetup();
                return true;
            }
            return false;
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"https".equalsIgnoreCase(uri.getScheme());
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

        String server = prefs.getString(KEY_SERVER, "");
        if (server.isEmpty()) showSetup();
        else {
            attachNativeBridge();
            webView.loadUrl(server);
            requestFirebaseToken();
        }
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

    private void showSetup() {
        webView.removeJavascriptInterface("NidoNative");
        webView.addJavascriptInterface(new SetupBridge(), "RifugioNative");
        webView.loadUrl("file:///android_asset/setup.html");
    }

    private final class NidoBridge {
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

    private final class SetupBridge {
        @JavascriptInterface public void connect(String raw) {
            runOnUiThread(() -> {
                String value = raw == null ? "" : raw.trim().replaceAll("/+$", "");
                Uri uri = Uri.parse(value);
                if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
                    Toast.makeText(MainActivity.this, "请输入有效的 HTTPS 服务器地址", Toast.LENGTH_LONG).show();
                    return;
                }
                prefs.edit().putString(KEY_SERVER, value).apply();
                webView.removeJavascriptInterface("RifugioNative");
                webView.removeJavascriptInterface("NidoNative");
                attachNativeBridge();
                webView.loadUrl(value);
                requestFirebaseToken();
            });
        }
        @JavascriptInterface public String current() {
            return prefs.getString(KEY_SERVER, "");
        }
    }

    @Override protected void onDestroy() {
        if (unifiedPushReceiverRegistered) {
            try { unregisterReceiver(unifiedPushReceiver); } catch (Exception ignored) {}
            unifiedPushReceiverRegistered = false;
        }
        super.onDestroy();
    }

    @Override public boolean onCreateOptionsMenu(Menu menu) {
        menu.add("重新加载");
        menu.add("更改服务器地址");
        return true;
    }

    @Override public boolean onOptionsItemSelected(MenuItem item) {
        if ("更改服务器地址".contentEquals(item.getTitle())) {
            showSetup();
            return true;
        }
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
