package app.rifugio.shell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.UUID;

public class NidoMessagingService extends FirebaseMessagingService {
    static final String PREFS = "nido_native_push";
    static final String KEY_TOKEN = "fcm_token";
    static final String KEY_INSTALLATION = "installation_id";
    static final String CHANNEL_MESSAGES = "nido_messages";

    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_TOKEN, token).apply();
        Intent intent = new Intent(MainActivity.ACTION_PUSH_TOKEN_REFRESHED);
        intent.setPackage(getPackageName());
        sendBroadcast(intent);
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        Map<String, String> data = message.getData();
        String title = message.getNotification() != null && message.getNotification().getTitle() != null
                ? message.getNotification().getTitle() : data.getOrDefault("title", "Nido");
        String body = message.getNotification() != null && message.getNotification().getBody() != null
                ? message.getNotification().getBody() : data.getOrDefault("body", "有一条新消息");
        showNotification(title, body, data);
    }

    private void showNotification(String title, String body, Map<String, String> data) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_MESSAGES, "Nido 消息", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Nido 主动消息和聊天提醒");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra(MainActivity.EXTRA_CONVERSATION_ID,
                data.getOrDefault("conversationId", data.getOrDefault("convoId", "")));
        open.putExtra(MainActivity.EXTRA_MESSAGE_ID, data.getOrDefault("messageId", ""));
        int requestCode = (data.getOrDefault("messageId", UUID.randomUUID().toString())).hashCode();
        PendingIntent pending = PendingIntent.getActivity(
                this, requestCode, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_MESSAGES)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title == null || title.isEmpty() ? "Nido" : title)
                .setContentText(body == null || body.isEmpty() ? "有一条新消息" : body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pending)
                .build();
        manager.notify(requestCode, notification);
    }

    static String installationId(SharedPreferences prefs) {
        String id = prefs.getString(KEY_INSTALLATION, "");
        if (id == null || id.isEmpty()) {
            id = UUID.randomUUID().toString();
            prefs.edit().putString(KEY_INSTALLATION, id).apply();
        }
        return id;
    }
}
