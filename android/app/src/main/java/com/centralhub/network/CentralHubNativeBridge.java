package com.centralhub.network;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

public final class CentralHubNativeBridge {
    private static final String PREFS = "centralhub_native_push";
    private static final String FCM_TOKEN = "fcm_token";

    private final MainActivity activity;
    private final Context context;
    private TextToSpeech taraTts;
    private volatile boolean taraTtsReady = false;
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

                // The first wake reply can arrive before Android's TTS engine has
                // finished initialising. Queue it instead of silently dropping it.
                if (!pendingSpeech.isEmpty()) {
                    String speech = pendingSpeech;
                    String language = pendingLanguageTag;
                    pendingSpeech = "";
                    pendingLanguageTag = "en-GB";
                    speakTara(speech, language);
                }
            });

            taraTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    activity.runOnUiThread(() -> activity.setTaraSpeaking(true));
                }

                @Override
                public void onDone(String utteranceId) {
                    activity.runOnUiThread(() -> activity.setTaraSpeaking(false));
                }

                @Override
                public void onError(String utteranceId) {
                    activity.runOnUiThread(() -> activity.setTaraSpeaking(false));
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    activity.runOnUiThread(() -> activity.setTaraSpeaking(false));
                }
            });
        });
    }

    public static void saveFcmToken(Context context, String token) {
        if (token == null || token.trim().isEmpty()) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(FCM_TOKEN, token.trim())
                .apply();
    }

    @JavascriptInterface
    public String getFcmToken() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(FCM_TOKEN, "");
    }

    @JavascriptInterface
    public String getPlatform() {
        return "android";
    }

    @JavascriptInterface
    public String getAppId() {
        return "com.centralhub.network";
    }

    @JavascriptInterface
    public long getVersionCode() {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return info.getLongVersionCode();
            return info.versionCode;
        } catch (Exception ignored) {
            return 0L;
        }
    }

    @JavascriptInterface
    public String getVersionName() {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return info.versionName == null ? "" : info.versionName;
        } catch (Exception ignored) {
            return "";
        }
    }

    @JavascriptInterface
    public boolean isTaraVoiceAvailable() {
        return activity.isTaraVoiceAvailable();
    }

    @JavascriptInterface
    public void setTaraEnabled(boolean enabled) {
        activity.runOnUiThread(() -> activity.setTaraEnabled(enabled));
    }

    @JavascriptInterface
    public void setNoraConversationActive(boolean active) {
        activity.runOnUiThread(() -> activity.setNoraConversationActive(active));
    }

    @JavascriptInterface
    public void setTaraSpeaking(boolean speaking) {
        activity.runOnUiThread(() -> activity.setTaraSpeaking(speaking));
    }

    @JavascriptInterface
    public boolean isTaraTtsReady() {
        return taraTtsReady && taraTts != null;
    }

    @JavascriptInterface
    public boolean isTaraLanguageAvailable(String languageTag) {
        TextToSpeech tts = taraTts;
        if (!taraTtsReady || tts == null) return false;
        Locale locale = resolveLocale(languageTag);
        try {
            return tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE;
        } catch (Exception ignored) {
            return false;
        }
    }

    @JavascriptInterface
    public boolean speakTara(String text, String languageTag) {
        if (text == null || text.trim().isEmpty()) return false;
        final String speech = text.trim();
        final String requestedLanguage = languageTag == null || languageTag.trim().isEmpty() ? "en-GB" : languageTag.trim();

        if (!isTaraTtsReady()) {
            pendingSpeech = speech;
            pendingLanguageTag = requestedLanguage;
            activity.runOnUiThread(() -> activity.setTaraSpeaking(true));
            return true;
        }

        final Locale locale = resolveLocale(requestedLanguage);
        activity.runOnUiThread(() -> {
            TextToSpeech tts = taraTts;
            if (tts == null || !taraTtsReady) {
                pendingSpeech = speech;
                pendingLanguageTag = requestedLanguage;
                return;
            }

            activity.setTaraSpeaking(true);
            Locale selected = selectSupportedLocale(tts, locale);
            tts.setLanguage(selected);
            tts.setSpeechRate(0.93f);
            tts.setPitch(1.04f);
            selectExecutiveVoice(tts, selected);
            int result = tts.speak(
                    speech,
                    TextToSpeech.QUEUE_FLUSH,
                    null,
                    "nora-" + UUID.randomUUID()
            );
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

    /** Launch NORA's visible browser-computer mode. Authentication secrets remain manual. */
    @JavascriptInterface
    public boolean openNoraComputerMode(
            String sessionId,
            String targetUrl,
            String accessToken,
            String supabaseUrl
    ) {
        if (sessionId == null || sessionId.trim().isEmpty()
                || targetUrl == null || targetUrl.trim().isEmpty()
                || accessToken == null || accessToken.trim().isEmpty()
                || supabaseUrl == null || supabaseUrl.trim().isEmpty()) return false;
        try {
            Uri target = Uri.parse(targetUrl.trim());
            Uri backend = Uri.parse(supabaseUrl.trim());
            if (!"https".equalsIgnoreCase(target.getScheme())
                    || target.getHost() == null
                    || !"https".equalsIgnoreCase(backend.getScheme())
                    || backend.getHost() == null
                    || !backend.getHost().toLowerCase(Locale.ROOT).endsWith(".supabase.co")) return false;

            Intent intent = new Intent(activity, NoraComputerActivity.class);
            intent.putExtra("nora_session_id", sessionId.trim());
            intent.putExtra("nora_target_url", targetUrl.trim());
            intent.putExtra("nora_access_token", accessToken.trim());
            intent.putExtra("nora_supabase_url", supabaseUrl.trim());
            activity.runOnUiThread(() -> activity.startActivity(intent));
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private Locale resolveLocale(String languageTag) {
        if (languageTag == null || languageTag.trim().isEmpty()) return Locale.UK;
        try {
            Locale locale = Locale.forLanguageTag(languageTag.trim());
            return locale.getLanguage().isEmpty() ? Locale.UK : locale;
        } catch (Exception ignored) {
            return Locale.UK;
        }
    }

    private Locale selectSupportedLocale(TextToSpeech tts, Locale preferred) {
        int support = tts.isLanguageAvailable(preferred);
        if (support >= TextToSpeech.LANG_AVAILABLE) return preferred;
        int ukSupport = tts.isLanguageAvailable(Locale.UK);
        if (ukSupport >= TextToSpeech.LANG_AVAILABLE) return Locale.UK;
        return Locale.US;
    }

    private void selectExecutiveVoice(TextToSpeech tts, Locale locale) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices == null || voices.isEmpty()) return;
            Voice firstMatch = null;
            Voice preferred = null;
            for (Voice voice : voices) {
                if (voice == null || voice.getLocale() == null) continue;
                if (!voice.getLocale().getLanguage().equalsIgnoreCase(locale.getLanguage())) continue;
                if (firstMatch == null) firstMatch = voice;
                String name = voice.getName() == null ? "" : voice.getName().toLowerCase(Locale.ROOT);
                if (name.contains("female")
                        || name.contains("sonia")
                        || name.contains("serena")
                        || name.contains("samantha")
                        || name.contains("aria")
                        || name.contains("ava")
                        || name.contains("veena")
                        || name.contains("heera")) {
                    preferred = voice;
                    break;
                }
            }
            if (preferred != null) tts.setVoice(preferred);
            else if (firstMatch != null) tts.setVoice(firstMatch);
        } catch (Exception ignored) { }
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
    public boolean openExternalUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(value.trim());
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(scheme) || host == null) return false;

            String normalizedHost = host.toLowerCase(Locale.ROOT);
            boolean allowed = normalizedHost.equals("github.com")
                    || normalizedHost.endsWith(".githubusercontent.com")
                    || normalizedHost.equals("centralhub.network");
            if (!allowed) return false;

            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
