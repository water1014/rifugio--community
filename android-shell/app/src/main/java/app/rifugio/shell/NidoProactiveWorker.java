package app.rifugio.shell;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class NidoProactiveWorker extends Worker {
    static final String PREFS = "nido_local_proactive";
    static final String KEY_CONFIG = "config";
    static final String KEY_CONTEXT = "context";
    static final String KEY_PENDING = "pending_messages";
    static final String KEY_NEXT_DUE = "next_due_at";
    static final String KEY_LAST_ERROR = "last_error";
    static final String UNIQUE_WORK = "nido-local-proactive-v1";
    private static final String SECRET_PREFS = "nido_encrypted_secrets";
    private static final String SECRET_KEY_ALIAS = "nido_android_secret_key_v1";

    public NidoProactiveWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        HttpURLConnection connection = null;
        try {
            JSONObject settings = new JSONObject(prefs.getString(KEY_CONFIG, "{}"));
            JSONObject chat = new JSONObject(prefs.getString(KEY_CONTEXT, "{}"));
            if (!settings.optBoolean("enabled", false) || !settings.optBoolean("scriptEnabled", true)) return Result.success();

            long now = System.currentTimeMillis();
            long lastUserAt = chat.optLong("lastUserAt", 0);
            if (lastUserAt <= 0) return Result.success();
            long nextDueAt = prefs.getLong(KEY_NEXT_DUE, 0);
            if (nextDueAt <= 0) {
                nextDueAt = lastUserAt + computeDelay(settings);
                prefs.edit().putLong(KEY_NEXT_DUE, nextDueAt).apply();
            }
            if (now < nextDueAt || !isInsideWindow(settings, now)) return Result.success();

            long lastAnyAt = chat.optLong("lastAnyAt", lastUserAt);
            long quietSeconds = Math.max(10, Math.min(1800, settings.optLong("quietSeconds", 90)));
            if (lastAnyAt > 0 && now - lastAnyAt < quietSeconds * 1000L) return Result.success();

            String apiKey = readEncryptedSecret(context, "talk_api_key");
            String model = settings.optString("apiModel", "").trim();
            String baseUrl = settings.optString("baseUrl", "https://opencode.ai/zen/go").trim();
            if (apiKey.isEmpty() || model.isEmpty() || baseUrl.isEmpty()) {
                prefs.edit().putString(KEY_LAST_ERROR, "主动消息缺少 API Key、Base URL 或模型").apply();
                return Result.success();
            }

            URL endpoint = buildEndpoint(baseUrl);
            for (InetAddress address : InetAddress.getAllByName(endpoint.getHost())) {
                if (isUnsafeAddress(address)) throw new IllegalArgumentException("主动消息 API 地址指向本地或私有网络，已拒绝");
            }

            JSONArray messages = new JSONArray();
            String systemPrompt = settings.optString("systemPrompt", "");
            String characterPrompt = settings.optString("characterPrompt", "");
            if (!systemPrompt.isEmpty()) messages.put(new JSONObject().put("role", "system").put("content", systemPrompt));
            if (!characterPrompt.isEmpty()) messages.put(new JSONObject().put("role", "system").put("content", characterPrompt));
            JSONArray history = chat.optJSONArray("messages");
            if (history != null) {
                int start = Math.max(0, history.length() - 24);
                for (int i = start; i < history.length(); i++) {
                    JSONObject item = history.optJSONObject(i);
                    if (item == null) continue;
                    String role = item.optString("role", "");
                    if (!"user".equals(role) && !"assistant".equals(role)) continue;
                    String text = item.optString("content", "").trim();
                    if (!text.isEmpty()) messages.put(new JSONObject().put("role", role).put("content", text));
                }
            }
            long inactiveMinutes = Math.max(1, (now - lastUserAt) / 60000L);
            String prompt = "Nido System Auto-Prompt：对方已经" + inactiveMinutes
                    + "分钟没有联系你。请结合当前对话上下文，判断对方最后做了什么、你们聊到了哪里，再自然地主动发一条符合当前情境的消息。"
                    + "如果上下文不足，不要编造，也不要只复述多久没联系。"
                    + "这是一次后台主动消息任务，只生成一条自然的聊天消息，不要提及定时任务或后台系统。";
            String extraPrompt = settings.optString("prompt", "").trim();
            if (!extraPrompt.isEmpty()) prompt += "\n用户补充的主动消息风格：" + extraPrompt;
            messages.put(new JSONObject().put("role", "user").put("content", prompt));

            JSONObject payload = new JSONObject()
                    .put("model", model)
                    .put("messages", messages)
                    .put("temperature", 0.85)
                    .put("stream", false);

            connection = (HttpURLConnection) endpoint.openConnection();
            connection.setRequestMethod("POST");
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(45000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            connection.setRequestProperty("User-Agent", "Nido/Android");
            JSONObject custom = parseCustomHeaders(settings.optString("customHeaders", "{}"));
            Iterator<String> names = custom.keys();
            while (names.hasNext()) {
                String name = names.next();
                String value = custom.optString(name, "");
                String lower = name.toLowerCase(Locale.ROOT);
                if (!name.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]{1,80}") || value.length() > 8192
                        || value.contains("\r") || value.contains("\n")
                        || lower.equals("host") || lower.equals("content-length")
                        || lower.equals("connection") || lower.equals("cookie")
                        || lower.equals("set-cookie") || lower.startsWith("proxy-")
                        || lower.equals("transfer-encoding")) continue;
                connection.setRequestProperty(name, value);
            }
            if (endpoint.getHost().equalsIgnoreCase("opencode.ai")
                    || settings.optString("provider", "").toLowerCase(Locale.ROOT).contains("opencode")) {
                SharedPreferences sessionPrefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                String conversationId = chat.optString("conversationId", "default").trim();
                String sessionKey = "opencode_session_" + Integer.toHexString(conversationId.hashCode());
                String session = sessionPrefs.getString(sessionKey, "");
                if (session.isEmpty()) {
                    session = "ses_" + java.util.UUID.randomUUID().toString().replace("-", "");
                    sessionPrefs.edit().putString(sessionKey, session).apply();
                }
                if (customHeaderMissing(custom, "x-opencode-session")) connection.setRequestProperty("x-opencode-session", session);
            }

            byte[] request = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream output = connection.getOutputStream()) { output.write(request); }
            int status = connection.getResponseCode();
            byte[] responseBytes = readLimited(status >= 200 && status < 300
                    ? connection.getInputStream() : connection.getErrorStream(), 1024 * 1024);
            String responseText = new String(responseBytes, StandardCharsets.UTF_8);
            if (status < 200 || status >= 300) {
                String detail = responseText;
                try {
                    JSONObject error = new JSONObject(responseText);
                    detail = error.optJSONObject("error") != null
                            ? error.optJSONObject("error").optString("message", responseText)
                            : error.optString("message", responseText);
                } catch (Exception ignored) {}
                throw new IllegalStateException("主动消息 API HTTP " + status + "：" + detail.substring(0, Math.min(400, detail.length())));
            }

            JSONObject response = new JSONObject(responseText);
            JSONObject choice = response.optJSONArray("choices") == null ? null : response.optJSONArray("choices").optJSONObject(0);
            JSONObject answer = choice == null ? null : choice.optJSONObject("message");
            String content = extractMessageText(answer == null ? null : answer.opt("content")).trim();
            if (content.isEmpty()) throw new IllegalStateException("主动消息模型返回了空内容");

            String conversationId = chat.optString("conversationId", "");
            if (conversationId.isEmpty()) throw new IllegalStateException("没有可用的当前聊天");
            long messageId = now;
            String time = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(now));
            JSONObject message = new JSONObject()
                    .put("id", messageId)
                    .put("role", "assistant")
                    .put("content", content)
                    .put("time", time)
                    .put("model", model)
                    .put("engine", "api")
                    .put("done", true)
                    .put("proactive", true);

            JSONArray updatedHistory = history == null ? new JSONArray() : history;
            updatedHistory.put(message);
            while (updatedHistory.length() > 80) updatedHistory.remove(0);
            chat.put("messages", updatedHistory);
            chat.put("lastAnyAt", now);
            long nextDelay = computeDelay(settings);
            prefs.edit()
                    .putString(KEY_CONTEXT, chat.toString())
                    .putLong(KEY_NEXT_DUE, now + nextDelay)
                    .remove(KEY_LAST_ERROR)
                    .apply();

            JSONObject pendingItem = new JSONObject()
                    .put("conversationId", conversationId)
                    .put("message", message);
            JSONArray pending = new JSONArray(prefs.getString(KEY_PENDING, "[]"));
            pending.put(pendingItem);
            while (pending.length() > 50) pending.remove(0);
            prefs.edit().putString(KEY_PENDING, pending.toString()).apply();

            Map<String, String> data = new HashMap<>();
            data.put("app", "nido");
            data.put("conversationId", conversationId);
            data.put("convoId", conversationId);
            data.put("messageId", String.valueOf(messageId));
            String title = chat.optString("conversationName", "Nido");
            NidoMessagingService.showNotification(context, title, content.substring(0, Math.min(180, content.length())), data);
            return Result.success();
        } catch (Exception error) {
            prefs.edit()
                    .putString(KEY_LAST_ERROR, error.getMessage() == null ? "主动消息任务失败" : error.getMessage())
                    .putLong(KEY_NEXT_DUE, System.currentTimeMillis() + 5 * 60 * 1000L)
                    .apply();
            return Result.retry();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static long computeDelay(JSONObject settings) {
        long min = Math.max(1, Math.min(1440, settings.optLong("minMinutes", 120)));
        long random = Math.max(0, Math.min(1440, settings.optLong("randomMinutes", 0)));
        long extra = random == 0 ? 0 : (long) (Math.random() * random * 60000L);
        return min * 60000L + extra;
    }

    private static boolean isInsideWindow(JSONObject settings, long now) {
        String startText = settings.optString("activeStart", "08:00");
        String endText = settings.optString("activeEnd", "23:30");
        int start = parseMinutes(startText, 8 * 60);
        int end = parseMinutes(endText, 23 * 60 + 30);
        if (start == end) return true;
        TimeZone zone = TimeZone.getTimeZone(settings.optString("timezone", TimeZone.getDefault().getID()));
        java.util.Calendar calendar = java.util.Calendar.getInstance(zone);
        calendar.setTimeInMillis(now);
        int current = calendar.get(java.util.Calendar.HOUR_OF_DAY) * 60 + calendar.get(java.util.Calendar.MINUTE);
        return start < end ? current >= start && current < end : current >= start || current < end;
    }

    private static int parseMinutes(String value, int fallback) {
        try {
            String[] parts = value.split(":");
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);
            return Math.max(0, Math.min(23, hour)) * 60 + Math.max(0, Math.min(59, minute));
        } catch (Exception ignored) { return fallback; }
    }

    private static URL buildEndpoint(String raw) throws Exception {
        Uri uri = Uri.parse(raw);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("主动消息只允许 HTTPS API 地址");
        }
        String path = uri.getPath() == null ? "" : uri.getPath().replaceAll("/+$", "");
        if (path.endsWith("/chat/completions")) {
            // already complete
        } else if (uri.getHost().equalsIgnoreCase("opencode.ai")) {
            if (path.endsWith("/zen/go") || path.endsWith("/inference/go")) path += "/v1/chat/completions";
            else if (path.endsWith("/openai/v1")) path += "/chat/completions";
            else if (path.endsWith("/v1")) path += "/chat/completions";
            else path += "/v1/chat/completions";
        } else if (path.endsWith("/v1")) {
            path += "/chat/completions";
        } else {
            path += "/v1/chat/completions";
        }
        return new URL(uri.getScheme(), uri.getHost(), uri.getPort(), path);
    }

    private static boolean isUnsafeAddress(InetAddress address) {
        return address.isAnyLocalAddress() || address.isLoopbackAddress()
                || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                || address.isMulticastAddress();
    }

    private static JSONObject parseCustomHeaders(String raw) {
        try { return new JSONObject(raw == null || raw.isEmpty() ? "{}" : raw); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    private static boolean customHeaderMissing(JSONObject headers, String target) {
        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) if (keys.next().equalsIgnoreCase(target)) return false;
        return true;
    }

    private static String extractMessageText(Object content) {
        if (content instanceof String) return (String) content;
        if (content instanceof JSONArray) {
            JSONArray parts = (JSONArray) content;
            StringBuilder output = new StringBuilder();
            for (int i = 0; i < parts.length(); i++) {
                JSONObject part = parts.optJSONObject(i);
                if (part != null) {
                    String text = part.optString("text", "");
                    if (!text.isEmpty()) output.append(text);
                }
            }
            return output.toString();
        }
        return "";
    }

    private static byte[] readLimited(InputStream input, int maxBytes) throws Exception {
        if (input == null) return new byte[0];
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > maxBytes) throw new IllegalStateException("主动消息 API 响应超过限制");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private static String readEncryptedSecret(Context context, String name) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(SECRET_PREFS, Context.MODE_PRIVATE);
            String packed = prefs.getString(name, "");
            int split = packed.indexOf(':');
            if (split <= 0) return "";
            byte[] iv = Base64.decode(packed.substring(0, split), Base64.NO_WRAP);
            byte[] cipherText = Base64.decode(packed.substring(split + 1), Base64.NO_WRAP);
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            SecretKey key = (SecretKey) keyStore.getKey(SECRET_KEY_ALIAS, null);
            if (key == null) return "";
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (Exception ignored) { return ""; }
    }
}
