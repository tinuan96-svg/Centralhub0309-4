package com.centralhub.network;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Keeps an active Shruthi Live Web task alive when the user switches to another app.
 *
 * The browser itself remains owned by NoraComputerActivity so login/OTP/CAPTCHA stays
 * human-visible. This foreground service keeps the process/CPU alive, monitors the
 * server-side task state, and calls the user back with speech + notification only when
 * Shruthi genuinely needs help or approval.
 */
public final class ShruthiBackgroundTaskService extends Service implements TextToSpeech.OnInitListener {
    private static final String ACTION_START = "com.centralhub.network.SHRUTHI_BG_START";
    private static final String ACTION_VISIBLE = "com.centralhub.network.SHRUTHI_BG_VISIBLE";
    private static final String ACTION_BACKGROUND = "com.centralhub.network.SHRUTHI_BG_BACKGROUND";
    private static final String ACTION_UPDATE_URL = "com.centralhub.network.SHRUTHI_BG_UPDATE_URL";
    private static final String ACTION_STOP = "com.centralhub.network.SHRUTHI_BG_STOP";

    private static final String EXTRA_SESSION_ID = "nora_session_id";
    private static final String EXTRA_TARGET_URL = "nora_target_url";
    private static final String EXTRA_ACCESS_TOKEN = "nora_access_token";
    private static final String EXTRA_SUPABASE_URL = "nora_supabase_url";
    private static final String EXTRA_PUBLISHABLE_KEY = "nora_publishable_key";

    private static final String WORK_CHANNEL = "shruthi_live_web_background_v1";
    private static final String HELP_CHANNEL = "shruthi_live_web_help_v1";
    private static final int WORK_NOTIFICATION_ID = 7281;
    private static final int HELP_NOTIFICATION_ID = 7282;

    private ScheduledExecutorService scheduler;
    private PowerManager.WakeLock wakeLock;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean activityVisible = true;
    private boolean pollingStarted = false;
    private String pendingSpeech = "";
    private String lastAlertSignature = "";

    private String sessionId = "";
    private String targetUrl = "";
    private String accessToken = "";
    private String supabaseUrl = "";
    private String publishableKey = "";

    public static void start(Context context, String sessionId, String targetUrl, String accessToken, String supabaseUrl, String publishableKey) {
        Intent intent = baseIntent(context, ACTION_START);
        intent.putExtra(EXTRA_SESSION_ID, safe(sessionId));
        intent.putExtra(EXTRA_TARGET_URL, safe(targetUrl));
        intent.putExtra(EXTRA_ACCESS_TOKEN, safe(accessToken));
        intent.putExtra(EXTRA_SUPABASE_URL, safe(supabaseUrl));
        intent.putExtra(EXTRA_PUBLISHABLE_KEY, safe(publishableKey));
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
        } catch (Exception ignored) { }
    }

    public static void markVisible(Context context) { safeStart(context, ACTION_VISIBLE, null); }
    public static void markBackground(Context context) { safeStart(context, ACTION_BACKGROUND, null); }
    public static void updateUrl(Context context, String url) { safeStart(context, ACTION_UPDATE_URL, url); }
    public static void stop(Context context) { safeStart(context, ACTION_STOP, null); }

    private static void safeStart(Context context, String action, String url) {
        try {
            Intent intent = baseIntent(context, action);
            if (url != null) intent.putExtra(EXTRA_TARGET_URL, url);
            context.startService(intent);
        } catch (Exception ignored) { }
    }

    private static Intent baseIntent(Context context, String action) {
        Intent intent = new Intent(context, ShruthiBackgroundTaskService.class);
        intent.setAction(action);
        return intent;
    }

    private static String safe(String value) { return value == null ? "" : value.trim(); }

    @Override public void onCreate() {
        super.onCreate();
        createChannels();
        tts = new TextToSpeech(getApplicationContext(), this);
        scheduler = Executors.newSingleThreadScheduledExecutor();
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CentralHub:ShruthiLiveWeb");
            wakeLock.setReferenceCounted(false);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : safe(intent.getAction());
        if (ACTION_STOP.equals(action)) {
            stopSelfSafely();
            return START_NOT_STICKY;
        }
        if (ACTION_VISIBLE.equals(action)) {
            activityVisible = true;
            return START_STICKY;
        }
        if (ACTION_BACKGROUND.equals(action)) {
            activityVisible = false;
            return START_STICKY;
        }
        if (ACTION_UPDATE_URL.equals(action)) {
            String url = safe(intent.getStringExtra(EXTRA_TARGET_URL));
            if (!url.isEmpty()) targetUrl = url;
            return START_STICKY;
        }

        if (intent != null) {
            sessionId = safe(intent.getStringExtra(EXTRA_SESSION_ID));
            targetUrl = safe(intent.getStringExtra(EXTRA_TARGET_URL));
            accessToken = safe(intent.getStringExtra(EXTRA_ACCESS_TOKEN));
            supabaseUrl = safe(intent.getStringExtra(EXTRA_SUPABASE_URL)).replaceAll("/+$", "");
            publishableKey = safe(intent.getStringExtra(EXTRA_PUBLISHABLE_KEY));
        }
        if (sessionId.isEmpty() || accessToken.isEmpty() || supabaseUrl.isEmpty() || publishableKey.isEmpty()) {
            stopSelfSafely();
            return START_NOT_STICKY;
        }

        activityVisible = true;
        startForeground(WORK_NOTIFICATION_ID, workNotification("Shruthi is working in Live Web"));
        try { if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(); } catch (Exception ignored) { }
        startPolling();
        return START_STICKY;
    }

    private void startPolling() {
        if (pollingStarted) return;
        if (scheduler == null || scheduler.isShutdown()) scheduler = Executors.newSingleThreadScheduledExecutor();
        pollingStarted = true;
        scheduler.scheduleWithFixedDelay(this::pollSession, 1, 4, TimeUnit.SECONDS);
    }

    private void pollSession() {
        try {
            JSONObject row = fetchSession();
            if (row == null) return;
            String status = safe(row.optString("status"));
            String step = safe(row.optString("current_step"));
            String lastError = safe(row.optString("last_error"));
            String remoteUrl = safe(row.optString("target_url"));
            JSONObject metadata = row.optJSONObject("metadata");
            if (metadata != null) {
                String activeUrl = safe(metadata.optString("active_url"));
                if (!activeUrl.isEmpty()) remoteUrl = activeUrl;
            }
            if (!remoteUrl.isEmpty()) targetUrl = remoteUrl;

            String notificationText = !step.isEmpty() ? step : ("Shruthi Live Web · " + status);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(WORK_NOTIFICATION_ID, workNotification(notificationText));

            if ("waiting_input".equals(status) || row.optBoolean("awaiting_input", false)) {
                JSONObject question = fetchPendingQuestion();
                boolean sensitive = question != null && question.optBoolean("is_sensitive", false);
                String questionText = question == null ? "" : safe(question.optString("question"));
                boolean loginLike = sensitive || looksSecureOrLogin(questionText) || looksSecureOrLogin(step);
                String message = loginLike
                        ? "Shruthi needs your help to complete a secure login step. Open CentralHub to continue."
                        : (!questionText.isEmpty()
                            ? "Shruthi needs one detail from you. Open CentralHub to continue."
                            : "Shruthi needs your help to continue the Live Web task.");
                alertUser("input|" + questionText + "|" + step, "Shruthi needs your help", message);
            } else if ("waiting_approval".equals(status) || row.optBoolean("requires_approval", false)) {
                String reason = safe(row.optString("approval_reason"));
                String message = "Shruthi needs your approval to continue the Live Web task.";
                if (!reason.isEmpty()) message += " " + shortText(reason, 120);
                alertUser("approval|" + reason + "|" + step, "Shruthi needs approval", message);
            } else if ("failed".equals(status)) {
                String message = "Shruthi hit a problem in Live Web and needs you to check it.";
                if (!lastError.isEmpty()) message += " " + shortText(lastError, 120);
                alertUser("failed|" + lastError, "Shruthi needs attention", message);
            } else if ("completed".equals(status) || "cancelled".equals(status)) {
                postTerminalNotification("completed".equals(status) ? "Shruthi finished the Live Web task" : "Shruthi Live Web task ended");
                stopSelfSafely();
            } else {
                lastAlertSignature = "";
            }
        } catch (Exception ignored) { }
    }

    private JSONObject fetchSession() throws Exception {
        String query = "/rest/v1/nora_action_sessions?id=eq." + URLEncoder.encode(sessionId, "UTF-8")
                + "&select=status,current_step,awaiting_input,requires_approval,approval_reason,last_error,target_url,metadata,updated_at&limit=1";
        JSONArray rows = getArray(query);
        return rows.length() > 0 ? rows.optJSONObject(0) : null;
    }

    private JSONObject fetchPendingQuestion() {
        try {
            String query = "/rest/v1/nora_action_questions?session_id=eq." + URLEncoder.encode(sessionId, "UTF-8")
                    + "&status=eq.pending&select=question,is_sensitive,created_at&order=created_at.desc&limit=1";
            JSONArray rows = getArray(query);
            return rows.length() > 0 ? rows.optJSONObject(0) : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private JSONArray getArray(String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(supabaseUrl + path).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(15_000);
        connection.setRequestProperty("Authorization", "Bearer " + accessToken);
        connection.setRequestProperty("apikey", publishableKey);
        connection.setRequestProperty("Accept", "application/json");
        try {
            int code = connection.getResponseCode();
            InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
            StringBuilder raw = new StringBuilder();
            if (stream != null) try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line; while ((line = reader.readLine()) != null) raw.append(line);
            }
            if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
            return new JSONArray(raw.toString());
        } finally {
            connection.disconnect();
        }
    }

    private boolean looksSecureOrLogin(String text) {
        String value = safe(text).toLowerCase(Locale.ROOT);
        return value.matches(".*\\b(login|log in|sign in|password|passcode|otp|2fa|two[- ]factor|captcha|security code|verification code|passkey|recovery code|identity verification)\\b.*");
    }

    private void alertUser(String signature, String title, String message) {
        if (signature.equals(lastAlertSignature)) return;
        lastAlertSignature = signature;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(HELP_NOTIFICATION_ID, helpNotification(title, message));
        if (!activityVisible) speak(message);
    }

    private void speak(String message) {
        if (message == null || message.trim().isEmpty()) return;
        if (!ttsReady || tts == null) {
            pendingSpeech = message.trim();
            return;
        }
        try { tts.speak(message.trim(), TextToSpeech.QUEUE_FLUSH, null, "shruthi-help-" + System.currentTimeMillis()); }
        catch (Exception ignored) { }
    }

    @Override public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS || tts == null) return;
        ttsReady = true;
        try {
            tts.setLanguage(Locale.UK);
            tts.setSpeechRate(1.02f);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                tts.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
            }
        } catch (Exception ignored) { }
        if (!pendingSpeech.isEmpty()) {
            String speech = pendingSpeech;
            pendingSpeech = "";
            speak(speech);
        }
    }

    private Notification workNotification(String text) {
        return new Notification.Builder(this, WORK_CHANNEL)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Shruthi Live Web is working")
                .setContentText(shortText(text, 120))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(resumePendingIntent())
                .build();
    }

    private Notification helpNotification(String title, String message) {
        return new Notification.Builder(this, HELP_CHANNEL)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(shortText(message, 150))
                .setStyle(new Notification.BigTextStyle().bigText(message))
                .setAutoCancel(true)
                .setContentIntent(resumePendingIntent())
                .build();
    }

    private void postTerminalNotification(String text) {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            manager.cancel(HELP_NOTIFICATION_ID);
            manager.notify(WORK_NOTIFICATION_ID, new Notification.Builder(this, WORK_CHANNEL)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("Shruthi Live Web")
                    .setContentText(text)
                    .setAutoCancel(true)
                    .setOngoing(false)
                    .setContentIntent(resumePendingIntent())
                    .build());
        } catch (Exception ignored) { }
    }

    private PendingIntent resumePendingIntent() {
        Intent open = new Intent(this, NoraComputerActivity.class);
        open.putExtra(EXTRA_SESSION_ID, sessionId);
        open.putExtra(EXTRA_TARGET_URL, targetUrl);
        open.putExtra(EXTRA_ACCESS_TOKEN, accessToken);
        open.putExtra(EXTRA_SUPABASE_URL, supabaseUrl);
        open.putExtra(EXTRA_PUBLISHABLE_KEY, publishableKey);
        open.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, 7280, open, flags);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel work = new NotificationChannel(WORK_CHANNEL, "Shruthi background work", NotificationManager.IMPORTANCE_LOW);
        work.setDescription("Keeps an active Shruthi Live Web task running when CentralHub is not on screen.");
        manager.createNotificationChannel(work);
        NotificationChannel help = new NotificationChannel(HELP_CHANNEL, "Shruthi help requests", NotificationManager.IMPORTANCE_HIGH);
        help.setDescription("Alerts when Shruthi needs login, approval, or another manual step.");
        manager.createNotificationChannel(help);
    }

    private String shortText(String value, int max) {
        String text = safe(value).replaceAll("\\s+", " ");
        return text.length() <= max ? text : text.substring(0, Math.max(0, max - 1)) + "…";
    }

    private void stopSelfSafely() {
        try {
            if (scheduler != null) scheduler.shutdownNow();
            scheduler = null;
            pollingStarted = false;
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            manager.cancel(HELP_NOTIFICATION_ID);
            stopForeground(false);
            stopSelf();
        } catch (Exception ignored) { stopSelf(); }
    }

    @Override public void onDestroy() {
        try { if (scheduler != null) scheduler.shutdownNow(); } catch (Exception ignored) { }
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) { }
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Exception ignored) { }
        scheduler = null; pollingStarted = false; wakeLock = null; tts = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
