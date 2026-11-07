package app.rifugio.shell;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
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
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String PREFS = "rifugio";
    private static final String KEY_SERVER = "server_url";
    private WebView webView;
    private SharedPreferences prefs;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(249, 247, 242));
        getWindow().setNavigationBarColor(Color.rgb(249, 247, 242));
        int systemUi = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (android.os.Build.VERSION.SDK_INT >= 26) systemUi |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(systemUi);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
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
        });

        String server = prefs.getString(KEY_SERVER, "");
        if (server.isEmpty()) showSetup();
        else webView.loadUrl(server);
    }

    private void showSetup() {
        webView.removeJavascriptInterface("RifugioNative");
        webView.addJavascriptInterface(new SetupBridge(), "RifugioNative");
        webView.loadUrl("file:///android_asset/setup.html");
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
                webView.loadUrl(value);
            });
        }
        @JavascriptInterface public String current() {
            return prefs.getString(KEY_SERVER, "");
        }
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
