package app.rifugio.shell;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;
import org.unifiedpush.android.connector.FailedReason;
import org.unifiedpush.android.connector.PushService;
import org.unifiedpush.android.connector.data.PushEndpoint;
import org.unifiedpush.android.connector.data.PushMessage;
import org.unifiedpush.android.connector.data.PublicKeySet;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public class NidoPushService extends PushService {
    private static final String TAG = "NidoUnifiedPush";

    @Override public void onNewEndpoint(PushEndpoint endpoint, String instance) {
        try {
            PublicKeySet keySet = endpoint.getPubKeySet();
            if (keySet == null) {
                Log.w(TAG, "Distributor returned an endpoint without Web Push keys");
                return;
            }
            JSONObject keys = new JSONObject()
                    .put("p256dh", keySet.getPubKey())
                    .put("auth", keySet.getAuth());
            JSONObject subscription = new JSONObject()
                    .put("endpoint", endpoint.getUrl())
                    .put("expirationTime", JSONObject.NULL)
                    .put("keys", keys);
            SharedPreferences prefs = getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE);
            prefs.edit()
                    .putString("unified_push_subscription", subscription.toString())
                    .putString("unified_push_instance", instance)
                    .apply();
            notifySubscriptionChanged();
        } catch (Exception error) {
            Log.e(TAG, "Could not persist UnifiedPush endpoint", error);
        }
    }

    @Override public void onMessage(PushMessage message, String instance) {
        try {
            if (message == null || !message.getDecrypted()) {
                Log.w(TAG, "Ignored an encrypted or empty UnifiedPush message");
                return;
            }
            JSONObject payload = new JSONObject(new String(message.getContent(), StandardCharsets.UTF_8));
            String title = payload.optString("title", "Nido");
            String body = payload.optString("body", "有一条新消息");
            JSONObject dataObject = payload.optJSONObject("data");
            Map<String, String> data = new HashMap<>();
            if (dataObject != null) {
                Iterator<String> keys = dataObject.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    data.put(key, dataObject.optString(key, ""));
                }
            }
            data.put("conversationId", data.getOrDefault("conversationId", data.getOrDefault("convoId", "")));
            data.put("messageId", data.getOrDefault("messageId", ""));
            NidoMessagingService.showNotification(this, title, body, data);
        } catch (Exception error) {
            Log.e(TAG, "Could not decode UnifiedPush message", error);
        }
    }

    @Override public void onRegistrationFailed(FailedReason reason, String instance) {
        Log.w(TAG, "UnifiedPush registration failed: " + reason);
    }

    @Override public void onTempUnavailable(String instance) {
        Log.w(TAG, "UnifiedPush distributor is temporarily unavailable");
    }

    @Override public void onUnregistered(String instance) {
        SharedPreferences prefs = getSharedPreferences(NidoMessagingService.PREFS, MODE_PRIVATE);
        prefs.edit()
                .remove("unified_push_subscription")
                .remove("unified_push_instance")
                .apply();
        notifySubscriptionChanged();
    }

    private void notifySubscriptionChanged() {
        Intent intent = new Intent(MainActivity.ACTION_UNIFIED_PUSH_UPDATED);
        intent.setPackage(getPackageName());
        sendBroadcast(intent);
    }
}
