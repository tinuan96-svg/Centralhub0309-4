package com.centralhub.network;

import android.app.DownloadManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.database.Cursor;
import org.json.JSONObject;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

public final class CentralHubNativeBridge {
    private static final String PREFS = "centralhub_native_push";
    private static final String FCM_TOKEN = "fcm_token";
    private static final String SECURITY_PREFS = "centralhub_security";
    private static final String SECURE_UNLOCK_RESULT = "secure_unlock_result";

    private final MainActivity activity;
    private final Context context;
    private TextToSpeech taraTts;
    private volatile boolean taraTtsReady = false;
    // Independent voice channel for picking; do not require a Nora conversation.
    private volatile boolean pickingVoiceActive = false;
    private String pendingSpeech = "";
    private String pendingLanguageTag = "en-GB";

    public CentralHubNativeBridge(MainActivity activity) {
        this.activity = activity;
        this.context = activity.getApplicationContext();
        initializeTaraTts();
    }

    private void initializeTaraTts() {
        activity.runOnUiThread(() -> {
            taraTts = new TextToSpeech(context, status -> {
                taraTtsReady = status == TextToSpeech.SUCCESS;
                if (!taraTtsReady || taraTts == null) {
                    activity.setTaraSpeaking(false);
                    return;
                }
                taraTts.setSpeechRate(0.93f);
                taraTts.setPitch(1.04f);
                taraTts.setLanguage(Locale.UK);
                if (!pendingSpeech.isEmpty()) {
                    String speech = pendingSpeech;
                    String language = pendingLanguageTag;
                    pendingSpeech = "";
                    pendingLanguageTag = "en-GB";
                    speakTara(speech, language);
                }
            });
            taraTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) { activity.runOnUiThread(() -> activity.setTaraSpeaking(true)); }
                @Override public void onDone(String utteranceId) { activity.runOnUiThread(() -> activity.setTaraSpeaking(false)); }
                @Override public void onError(String utteranceId) { activity.runOnUiThread(() -> activity.setTaraSpeaking(false)); }
                @Override public void onError(String utteranceId, int errorCode) { activity.runOnUiThread(() -> activity.setTaraSpeaking(false)); }
            });
        });
    }

    public static void saveFcmToken(Context context, String token) {
        if (token == null || token.trim().isEmpty()) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(FCM_TOKEN, token.trim()).apply();
    }

    @JavascriptInterface public String getFcmToken() { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(FCM_TOKEN, ""); }
    @JavascriptInterface public String getPlatform() { return "android"; }
    @JavascriptInterface public String getAppId() { return "com.centralhub.network"; }

    @JavascriptInterface
    public long getVersionCode() {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return info.getLongVersionCode();
            return info.versionCode;
        } catch (Exception ignored) { return 0L; }
    }

    @JavascriptInterface
    public String getVersionName() {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return info.versionName == null ? "" : info.versionName;
        } catch (Exception ignored) { return ""; }
    }

    @JavascriptInterface public boolean isTaraVoiceAvailable() { return activity.isTaraVoiceAvailable(); }
    @JavascriptInterface public boolean isShruthiRealtimeAvailable() { return activity.isShruthiRealtimeAvailable(); }
    @JavascriptInterface public boolean startShruthiRealtime(String accessToken, String supabaseUrl, String publishableKey) { return activity.startShruthiRealtime(accessToken, supabaseUrl, publishableKey); }
    @JavascriptInterface public void stopShruthiRealtime() { activity.stopShruthiRealtime(); }
    @JavascriptInterface public void interruptShruthiRealtime() { activity.interruptShruthiRealtime(); }
    @JavascriptInterface public void setTaraEnabled(boolean enabled) { activity.runOnUiThread(() -> activity.setTaraEnabled(enabled)); }
    @JavascriptInterface public void setNoraConversationActive(boolean active) { activity.runOnUiThread(() -> activity.setNoraConversationActive(active)); }
    @JavascriptInterface public void setTaraSpeaking(boolean speaking) { activity.runOnUiThread(() -> activity.setTaraSpeaking(speaking)); }

    @JavascriptInterface
    public boolean isSecureUnlockAvailable() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M;
    }

    @JavascriptInterface
    public boolean requestSecureUnlock() {
        if (!isSecureUnlockAvailable()) return false;
        try {
            context.getSharedPreferences(SECURITY_PREFS, Context.MODE_PRIVATE).edit().remove(SECURE_UNLOCK_RESULT).apply();
            Intent intent = new Intent(activity, ShruthiSecurityActivity.class);
            activity.runOnUiThread(() -> activity.startActivity(intent));
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    @JavascriptInterface
    public String consumeSecureUnlockResult() {
        try {
            String value = context.getSharedPreferences(SECURITY_PREFS, Context.MODE_PRIVATE).getString(SECURE_UNLOCK_RESULT, "");
            if (value == null || value.isEmpty()) return "";
            context.getSharedPreferences(SECURITY_PREFS, Context.MODE_PRIVATE).edit().remove(SECURE_UNLOCK_RESULT).apply();
            return value;
        } catch (Exception ignored) {
            return "";
        }
    }

    @JavascriptInterface public boolean isTaraTtsReady() { return taraTtsReady && taraTts != null; }

    public boolean isPickingVoiceActive() { return pickingVoiceActive; }

    @JavascriptInterface
    public void setPickingVoiceActive(boolean active) {
        pickingVoiceActive = active;
        if (!active) stopTaraTts();
    }

    @JavascriptInterface
    public boolean speakPicking(String text, String languageTag) {
        if (!pickingVoiceActive) return false;
        return speakTara(text, languageTag);
    }

    @JavascriptInterface
    public boolean isTaraLanguageAvailable(String languageTag) {
        TextToSpeech tts = taraTts;
        if (!taraTtsReady || tts == null) return false;
        Locale locale = resolveLocale(languageTag);
        try { return tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE; }
        catch (Exception ignored) { return false; }
    }

    @JavascriptInterface
    public boolean speakTara(String text, String languageTag) {
        if (text == null || text.trim().isEmpty()) return false;
        if (!activity.isNoraConversationActive() && !pickingVoiceActive) return false;
        final String speech = text.trim();
        final String requestedLanguage = languageTag == null || languageTag.trim().isEmpty() ? "en-GB" : languageTag.trim();
        if (!isTaraTtsReady()) {
            pendingSpeech = speech;
            pendingLanguageTag = requestedLanguage;
            activity.runOnUiThread(() -> activity.setTaraSpeaking(true));
            return true;
        }
        final Locale locale = resolveLocale(requestedLanguage);
        TextToSpeech currentTts = taraTts;
        if (currentTts == null || !taraTtsReady) return false;
        final Locale selectedLocale = selectSupportedLocale(currentTts, locale);
        activity.runOnUiThread(() -> {
            if (!activity.isNoraConversationActive() && !pickingVoiceActive) {
                pendingSpeech = "";
                pendingLanguageTag = "en-GB";
                activity.setTaraSpeaking(false);
                return;
            }
            TextToSpeech tts = taraTts;
            if (tts == null || !taraTtsReady) {
                pendingSpeech = speech;
                pendingLanguageTag = requestedLanguage;
                return;
            }
            activity.setTaraSpeechContext(speech);
            activity.setTaraSpeaking(true);
            tts.setLanguage(selectedLocale);
            tts.setSpeechRate(0.93f);
            tts.setPitch(1.04f);
            selectExecutiveVoice(tts, selectedLocale);
            int result = tts.speak(speech, TextToSpeech.QUEUE_FLUSH, null, "nora-" + UUID.randomUUID());
            if (result == TextToSpeech.ERROR) activity.setTaraSpeaking(false);
        });
        return true;
    }

    @JavascriptInterface
    public void stopTaraTts() {
        pendingSpeech = "";
        pendingLanguageTag = "en-GB";
        activity.runOnUiThread(() -> {
            if (taraTts != null) {
                try { taraTts.stop(); } catch (Exception ignored) { }
            }
            activity.setTaraSpeaking(false);
        });
    }

    @JavascriptInterface
    public boolean openNoraComputerMode(String sessionId, String targetUrl, String accessToken, String supabaseUrl, String publishableKey) {
        if (sessionId == null || sessionId.trim().isEmpty() || targetUrl == null || targetUrl.trim().isEmpty() || accessToken == null || accessToken.trim().isEmpty() || supabaseUrl == null || supabaseUrl.trim().isEmpty() || publishableKey == null || publishableKey.trim().isEmpty()) return false;
        try {
            Uri target = Uri.parse(targetUrl.trim());
            Uri backend = Uri.parse(supabaseUrl.trim());
            if (!"https".equalsIgnoreCase(target.getScheme()) || target.getHost() == null || !"https".equalsIgnoreCase(backend.getScheme()) || backend.getHost() == null || !backend.getHost().toLowerCase(Locale.ROOT).endsWith(".supabase.co")) return false;
            Intent intent = new Intent(activity, NoraComputerActivity.class);
            intent.putExtra("nora_session_id", sessionId.trim());
            intent.putExtra("nora_target_url", targetUrl.trim());
            intent.putExtra("nora_access_token", accessToken.trim());
            intent.putExtra("nora_supabase_url", supabaseUrl.trim());
            intent.putExtra("nora_publishable_key", publishableKey.trim());
            activity.runOnUiThread(() -> activity.startActivity(intent));
            return true;
        } catch (Exception ignored) { return false; }
    }

    private Locale resolveLocale(String languageTag) {
        if (languageTag == null || languageTag.trim().isEmpty()) return Locale.UK;
        try {
            Locale locale = Locale.forLanguageTag(languageTag.trim());
            return locale.getLanguage().isEmpty() ? Locale.UK : locale;
        } catch (Exception ignored) { return Locale.UK; }
    }

    private Locale selectSupportedLocale(TextToSpeech tts, Locale preferred) {
        int support = tts.isLanguageAvailable(preferred);
        if (support >= TextToSpeech.LANG_AVAILABLE) return preferred;
        int ukSupport = tts.isLanguageAvailable(Locale.UK);
        if (ukSupport >= TextToSpeech.LANG_AVAILABLE) return Locale.UK;
        return Locale.US;
    }

    private Voice findExecutiveVoice(TextToSpeech tts, Locale locale) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return null;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices == null || voices.isEmpty()) return null;
            for (Voice voice : voices) {
                if (voice == null || voice.getLocale() == null) continue;
                if (!voice.getLocale().getLanguage().equalsIgnoreCase(locale.getLanguage())) continue;
                String name = voice.getName() == null ? "" : voice.getName().toLowerCase(Locale.ROOT);
                if (name.contains("female") || name.contains("sonia") || name.contains("serena") || name.contains("samantha") || name.contains("aria") || name.contains("ava") || name.contains("veena") || name.contains("heera") || name.contains("hazel") || name.contains("susan")) return voice;
            }
        } catch (Exception ignored) { }
        return null;
    }

    private boolean selectExecutiveVoice(TextToSpeech tts, Locale locale) {
        Voice preferred = findExecutiveVoice(tts, locale);
        if (preferred == null) return true;
        try { tts.setVoice(preferred); return true; }
        catch (Exception ignored) { return true; }
    }

    public void shutdown() {
        pendingSpeech = "";
        taraTtsReady = false;
        if (taraTts != null) {
            try { taraTts.stop(); } catch (Exception ignored) { }
            try { taraTts.shutdown(); } catch (Exception ignored) { }
            taraTts = null;
        }
    }

    @JavascriptInterface
    public long startAppUpdateDownload(String value, String versionName) {
        if (value == null || value.trim().isEmpty()) return -1L;
        try {
            Uri uri = Uri.parse(value.trim());
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null) return -1L;
            String normalizedHost = host.toLowerCase(Locale.ROOT);
            boolean allowed = normalizedHost.equals("github.com") || normalizedHost.endsWith(".githubusercontent.com") || normalizedHost.equals("centralhub.network");
            if (!allowed) return -1L;
            String safeVersion = versionName == null ? "latest" : versionName.replaceAll("[^A-Za-z0-9._-]", "-");
            DownloadManager.Request request = new DownloadManager.Request(uri).setTitle("CentralHub " + safeVersion).setDescription("Downloading Android update").setMimeType("application/vnd.android.package-archive").setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED).setAllowedOverMetered(true).setAllowedOverRoaming(false);
            request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "centralhub-" + safeVersion + "-" + UUID.randomUUID() + ".apk");
            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            return manager == null ? -1L : manager.enqueue(request);
        } catch (Exception ignored) { return -1L; }
    }

    @JavascriptInterface
    public boolean cancelAppUpdateDownload(long downloadId) {
        if (downloadId <= 0) return false;
        try {
            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            return manager != null && manager.remove(downloadId) > 0;
        } catch (Exception ignored) { return false; }
    }

    @JavascriptInterface
    public String getAppUpdateDownloadStatus(long downloadId) {
        if (downloadId <= 0) return "{\"status\":\"invalid\",\"progress\":0}";
        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) return "{\"status\":\"failed\",\"progress\":0}";
        Cursor cursor = null;
        try {
            cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId));
            if (cursor == null || !cursor.moveToFirst()) return "{\"status\":\"missing\",\"progress\":0}";
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
            long soFar = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            int progress = total > 0 ? (int) Math.min(100L, Math.max(0L, (soFar * 100L) / total)) : 0;
            String state;
            switch (status) {
                case DownloadManager.STATUS_PENDING: state = "pending"; break;
                case DownloadManager.STATUS_RUNNING: state = "running"; break;
                case DownloadManager.STATUS_PAUSED: state = "paused"; break;
                case DownloadManager.STATUS_SUCCESSFUL: state = "successful"; progress = 100; break;
                case DownloadManager.STATUS_FAILED: state = "failed"; break;
                default: state = "unknown"; break;
            }
            return "{\"status\":\"" + state + "\",\"progress\":" + progress + ",\"reason\":" + reason + ",\"bytes\":" + soFar + ",\"totalBytes\":" + total + "}";
        } catch (Exception ignored) { return "{\"status\":\"failed\",\"progress\":0}"; }
        finally { if (cursor != null) cursor.close(); }
    }

    @JavascriptInterface
    public boolean canInstallAppUpdatesAutomatically() {
        // Capability to launch the installer, not a guarantee of silent installation.
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.getPackageManager().canRequestPackageInstalls();
    }

    @JavascriptInterface
    public String getAppUpdateInstallStatus() {
        android.content.SharedPreferences prefs = context.getSharedPreferences(AppUpdateInstallReceiver.PREFS, Context.MODE_PRIVATE);
        JSONObject result = new JSONObject();
        try {
            result.put("state", prefs.getString("state", "idle"));
            result.put("message", prefs.getString("message", ""));
            result.put("updatedAt", prefs.getLong("updated_at", 0L));
            result.put("androidStatus", prefs.getInt("android_status", 0));
        } catch (Exception ignored) { return "{\"state\":\"unknown\"}"; }
        return result.toString();
    }

    @JavascriptInterface
    public boolean installAppUpdate(long downloadId) {
        if (downloadId <= 0) return false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
                Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
                activity.runOnUiThread(() -> activity.startActivity(permission));
                return false;
            }
            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) return false;
            Uri apk = manager.getUriForDownloadedFile(downloadId);
            if (apk == null) return false;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && installSelfUpdateWithPackageInstaller(apk)) {
                return true;
            }
            // Some Samsung/Android builds reject self-installer sessions. Open the stock
            // package installer using the same DownloadManager content URI instead.
            return launchAndroidPackageInstaller(apk);
        } catch (Exception error) {
            context.getSharedPreferences(AppUpdateInstallReceiver.PREFS, Context.MODE_PRIVATE).edit()
                    .putString("state", "failed").putString("message", error.getClass().getSimpleName())
                    .putLong("updated_at", System.currentTimeMillis()).apply();
            return false;
        }
    }

    private boolean launchAndroidPackageInstaller(Uri apk) {
        try {
            Intent install = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(apk, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            install.setClipData(ClipData.newUri(context.getContentResolver(), "CentralHub Android update", apk));
            context.getSharedPreferences(AppUpdateInstallReceiver.PREFS, Context.MODE_PRIVATE).edit()
                    .putString("state", "confirmation")
                    .putString("message", "Opening Android package installer")
                    .putLong("updated_at", System.currentTimeMillis()).apply();
            activity.runOnUiThread(() -> {
                try {
                    activity.startActivity(install);
                } catch (Exception error) {
                    context.getSharedPreferences(AppUpdateInstallReceiver.PREFS, Context.MODE_PRIVATE).edit()
                            .putString("state", "failed")
                            .putString("message", "Could not open Android installer: " + error.getClass().getSimpleName())
                            .putLong("updated_at", System.currentTimeMillis()).apply();
                }
            });
            return true; // Installer requested; installation success is verified after app relaunch.
        } catch (Exception error) {
            context.getSharedPreferences(AppUpdateInstallReceiver.PREFS, Context.MODE_PRIVATE).edit()
                    .putString("state", "failed").putString("message", "Installer fallback: " + error.getClass().getSimpleName())
                    .putLong("updated_at", System.currentTimeMillis()).apply();
            return false;
        }
    }

    private boolean installSelfUpdateWithPackageInstaller(Uri apk) {
        PackageInstaller installer = context.getPackageManager().getPackageInstaller();
        int sessionId = -1;
        try {
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(context.getPackageName());
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            context.getSharedPreferences(AppUpdateInstallReceiver.PREFS, Context.MODE_PRIVATE).edit()
                    .putString("state", "installing").putString("message", "Installer session started")
                    .putLong("updated_at", System.currentTimeMillis()).apply();
            sessionId = installer.createSession(params);

            try (PackageInstaller.Session session = installer.openSession(sessionId);
                 InputStream input = context.getContentResolver().openInputStream(apk);
                 OutputStream output = session.openWrite("centralhub-update.apk", 0, -1)) {
                if (input == null) throw new IllegalStateException("downloaded_apk_unavailable");
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                session.fsync(output);

                Intent statusIntent = new Intent(context, AppUpdateInstallReceiver.class)
                        .setAction(AppUpdateInstallReceiver.ACTION_INSTALL_STATUS)
                        .putExtra("package", context.getPackageName());
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
                PendingIntent status = PendingIntent.getBroadcast(context, sessionId, statusIntent, flags);
                session.commit(status.getIntentSender());
            }
            return true;
        } catch (Exception error) {
            context.getSharedPreferences(AppUpdateInstallReceiver.PREFS, Context.MODE_PRIVATE).edit()
                    .putString("state", "failed").putString("message", error.getClass().getSimpleName())
                    .putLong("updated_at", System.currentTimeMillis()).apply();
            if (sessionId >= 0) {
                try { installer.abandonSession(sessionId); } catch (Exception ignoredAgain) { }
            }
            return false;
        }
    }

    @JavascriptInterface
    public boolean openExternalUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(value.trim());
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(scheme) || host == null) return false;
            String normalizedHost = host.toLowerCase(Locale.ROOT);
            boolean allowed = normalizedHost.equals("github.com") || normalizedHost.endsWith(".githubusercontent.com") || normalizedHost.equals("centralhub.network");
            if (!allowed) return false;
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return true;
        } catch (Exception ignored) { return false; }
    }
}
