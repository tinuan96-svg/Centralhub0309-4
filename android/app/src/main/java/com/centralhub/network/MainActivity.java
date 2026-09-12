package com.centralhub.network;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String CENTRALHUB_ORIGIN = "https://centralhub.network";
    private static final String EXTRA_ACTION_URL = "centralhub_action_url";
    private static final int REQUEST_POST_NOTIFICATIONS = 4101;
    private static final int REQUEST_RECORD_AUDIO = 4102;
    private static final long NORA_FOLLOWUP_WINDOW_MS = 35_000L;

    // Bridge method names remain Tara-compatible so installed web/native versions can
    // overlap during rollout. NORA is now the primary product name and wake phrase.
    private final Handler taraHandler = new Handler(Looper.getMainLooper());
    private final Runnable taraRestartRunnable = this::startTaraRecognizerIfReady;
    private SpeechRecognizer taraRecognizer;
    private Intent taraRecognizerIntent;
    private CentralHubNativeBridge nativeBridge;
    private boolean taraEnabled = false;
    private boolean taraSpeaking = false;
    private boolean taraResumed = false;
    private boolean taraListening = false;
    private boolean taraPartialWakeDispatched = false;
    private boolean taraSegmentedSession = false;
    private int taraConsecutiveErrors = 0;
    private long taraLastTranscriptAt = 0L;
    private String taraLastTranscriptText = "";
    private long noraConversationUntil = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebSettings webSettings = bridge.getWebView().getSettings();
        webSettings.setUseWideViewPort(true);
        int screenWidthDp = getResources().getConfiguration().screenWidthDp;
        if (screenWidthDp >= 600) {
            webSettings.setLoadWithOverviewMode(true);
            bridge.getWebView().setInitialScale(75);
        } else {
            webSettings.setLoadWithOverviewMode(false);
        }

        nativeBridge = new CentralHubNativeBridge(this);
        bridge.getWebView().addJavascriptInterface(nativeBridge, "CentralHubNative");
        setupTaraRecognizer();

        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                CentralHubNativeBridge.saveFcmToken(this, task.getResult());
            }
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_POST_NOTIFICATIONS);
        }

        bridge.getWebView().setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
                if ("http".equals(scheme) || "https".equals(scheme)) return false;

                if ("whatsapp".equals(scheme)
                        || "tel".equals(scheme)
                        || "mailto".equals(scheme)
                        || "sms".equals(scheme)
                        || "geo".equals(scheme)
                        || "market".equals(scheme)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException ignored) {
                        if ("whatsapp".equals(scheme)) {
                            String phone = uri.getQueryParameter("phone");
                            String text = uri.getQueryParameter("text");
                            if (phone != null && !phone.trim().isEmpty()) {
                                Uri.Builder fallback = Uri.parse("https://wa.me/" + phone.trim()).buildUpon();
                                if (text != null && !text.trim().isEmpty()) fallback.appendQueryParameter("text", text);
                                startActivity(new Intent(Intent.ACTION_VIEW, fallback.build()));
                            }
                        }
                    }
                    return true;
                }
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://localhost") || url.startsWith("https://localhost")) {
                    try {
                        String path = request.getUrl().getPath();
                        if (path != null && !path.startsWith("/_next") && !path.equals("/") && !path.equals("/index.html")) {
                            String assetPath = "public" + path;
                            if (path.endsWith("/")) assetPath = assetPath + "index.html";
                            else assetPath = assetPath + "/index.html";
                            try {
                                return new WebResourceResponse("text/html", "utf-8", getAssets().open(assetPath));
                            } catch (Exception e) {
                                return new WebResourceResponse("text/html", "utf-8", getAssets().open("public/index.html"));
                            }
                        }
                    } catch (Exception ignored) { }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://localhost") || url.startsWith("https://localhost")) {
                    view.post(() -> view.loadUrl("file:///android_asset/public/index.html"));
                } else {
                    super.onReceivedError(view, request, error);
                }
            }
        });

        handleNotificationIntent(getIntent());
    }

    /**
     * Passive wake listening uses Android's on-device recognizer. Android 13+
     * uses one long segmented session so Samsung does not continuously play the
     * recognizer start/stop beeps. Non-wake speech is only forwarded for a short
     * follow-up window after NORA was explicitly called.
     */
    private void setupTaraRecognizer() {
        destroyTaraRecognizer();
        taraSegmentedSession = false;
        if (!isTaraVoiceAvailable()) return;

        try {
            taraRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
        } catch (Exception ignored) {
            taraRecognizer = null;
        }
        if (taraRecognizer == null) return;

        taraRecognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            taraSegmentedSession = true;
            taraRecognizerIntent.putStringArrayListExtra(
                    RecognizerIntent.EXTRA_BIASING_STRINGS,
                    new ArrayList<>(Arrays.asList(
                            "NORA", "Nora", "Norah", "Noora", "Noura", "Hey NORA", "Hey Nora",
                            "നോറ", "നോറാ", "நோரா",
                            // Narrow legacy compatibility only; broad aliases such as
                            // Sarah/Terra caused false background wakes.
                            "Tara", "Thara", "താര", "താരാ", "தாரா"
                    ))
            );
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_ENABLE_BIASING_DEVICE_CONTEXT, true);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 300000L);
            taraRecognizerIntent.putExtra(
                    RecognizerIntent.EXTRA_SEGMENTED_SESSION,
                    RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS
            );
        } else {
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 12000L);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 9000L);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 20000L);
        }

        taraRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { taraListening = true; }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }

            @Override
            public void onError(int error) {
                taraListening = false;
                taraPartialWakeDispatched = false;
                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) return;

                taraConsecutiveErrors += 1;
                if (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED
                        || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) {
                    requestTaraLanguageModel();
                    scheduleTaraRestart(6000L);
                    return;
                }

                long delay;
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) delay = 2600L;
                else if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    delay = taraSegmentedSession ? 3500L : 2600L;
                } else {
                    delay = Math.min(12000L, 2800L + (taraConsecutiveErrors * 1200L));
                }
                scheduleTaraRestart(delay);
            }

            @Override
            public void onResults(Bundle results) {
                processNoraRecognitionBundle(results);
                taraListening = false;
                taraConsecutiveErrors = 0;
                taraPartialWakeDispatched = false;
                long delay = System.currentTimeMillis() < noraConversationUntil
                        ? 900L
                        : (taraSegmentedSession ? 2600L : 1800L);
                scheduleTaraRestart(delay);
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                if (taraSpeaking || taraPartialWakeDispatched) return;
                ArrayList<String> matches = partialResults == null ? null : partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches == null) return;
                for (String match : matches) {
                    if (isSimpleNoraWakePhrase(match)) {
                        taraPartialWakeDispatched = true;
                        noraConversationUntil = System.currentTimeMillis() + NORA_FOLLOWUP_WINDOW_MS;
                        dispatchTaraTranscriptDebounced("NORA");
                        break;
                    }
                }
            }

            @Override
            public void onSegmentResults(Bundle segmentResults) {
                processNoraRecognitionBundle(segmentResults);
                taraConsecutiveErrors = 0;
                taraPartialWakeDispatched = false;
                taraListening = true;
            }

            @Override
            public void onEndOfSegmentedSession() {
                taraListening = false;
                taraConsecutiveErrors = 0;
                taraPartialWakeDispatched = false;
                scheduleTaraRestart(System.currentTimeMillis() < noraConversationUntil ? 900L : 2600L);
            }

            @Override public void onEvent(int eventType, Bundle params) { }
        });
    }

    private void processNoraRecognitionBundle(Bundle results) {
        ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (taraSpeaking || matches == null || matches.isEmpty()) return;

        long now = System.currentTimeMillis();
        for (String match : matches) {
            if (match == null || match.trim().isEmpty()) continue;
            String canonical = canonicalizeNoraTranscript(match);
            String lower = canonical.trim().toLowerCase(Locale.ROOT);
            boolean explicitWake = lower.equals("nora") || lower.startsWith("nora ");

            if (taraPartialWakeDispatched && lower.equals("nora")) return;

            if (explicitWake) {
                noraConversationUntil = now + NORA_FOLLOWUP_WINDOW_MS;
            } else if (now > noraConversationUntil) {
                // Ambient/background speech outside an active conversation is ignored.
                return;
            } else {
                noraConversationUntil = now + NORA_FOLLOWUP_WINDOW_MS;
                // The web assistant already knows how to handle an explicitly-addressed
                // NORA turn. Prefix active-conversation follow-ups so natural replies
                // do not get rejected by the stricter ambient-speech heuristic there.
                canonical = "NORA " + canonical;
            }

            dispatchTaraTranscriptDebounced(canonical);
            return;
        }
    }

    private void requestTaraLanguageModel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || taraRecognizer == null || taraRecognizerIntent == null) return;
        try { taraRecognizer.triggerModelDownload(taraRecognizerIntent); } catch (Exception ignored) { }
    }

    private String canonicalizeNoraTranscript(String raw) {
        if (raw == null) return "";
        String clean = raw.trim();
        if (clean.isEmpty()) return clean;

        String normalized = clean.toLowerCase(Locale.ROOT);
        String[] noraVariants = new String[]{"nora", "norah", "noora", "noura", "norra", "nora's"};
        for (String variant : noraVariants) {
            if (normalized.equals(variant) || normalized.equals("hey " + variant)) return "NORA";
            if (normalized.startsWith(variant + " ")) return "NORA " + clean.substring(variant.length()).trim();
            String heyVariant = "hey " + variant + " ";
            if (normalized.startsWith(heyVariant)) return "NORA " + clean.substring(heyVariant.length()).trim();
        }

        if (normalized.equals("നോറ") || normalized.equals("നോറാ") || normalized.equals("நோரா")) return "NORA";

        // Minimal migration aliases only. Removing broad sound-alikes avoids false wakes.
        String[] legacyVariants = new String[]{"tara", "thara"};
        for (String variant : legacyVariants) {
            if (normalized.equals(variant) || normalized.equals("hey " + variant)) return "NORA";
            if (normalized.startsWith(variant + " ")) return "NORA " + clean.substring(variant.length()).trim();
            String heyVariant = "hey " + variant + " ";
            if (normalized.startsWith(heyVariant)) return "NORA " + clean.substring(heyVariant.length()).trim();
        }
        return clean;
    }

    private boolean isSimpleNoraWakePhrase(String raw) {
        if (raw == null) return false;
        String canonical = canonicalizeNoraTranscript(raw);
        String normalized = canonical.trim().toLowerCase(Locale.ROOT).replaceAll("[\\p{Punct}\\s]+", " ").trim();
        if (normalized.length() > 18) return false;
        return normalized.equals("nora") || normalized.equals("നോറ") || normalized.equals("നോറാ") || normalized.equals("நோரா");
    }

    public boolean isTaraVoiceAvailable() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && SpeechRecognizer.isRecognitionAvailable(this)
                && SpeechRecognizer.isOnDeviceRecognitionAvailable(this);
    }

    public void setTaraEnabled(boolean enabled) {
        taraEnabled = enabled;
        if (!enabled) {
            noraConversationUntil = 0L;
            stopTaraRecognizer();
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
            return;
        }
        startTaraRecognizerIfReady();
    }

    public void setTaraSpeaking(boolean speaking) {
        taraSpeaking = speaking;

        if (!speaking && noraConversationUntil > 0L) {
            // Give the user a fresh follow-up turn after NORA finishes speaking.
            noraConversationUntil = System.currentTimeMillis() + NORA_FOLLOWUP_WINDOW_MS;
        }

        // On Android 13+ keep the long on-device segmented recognizer alive while
        // NORA speaks and simply ignore recognition callbacks. Cancelling and
        // restarting it for every reply is what produced Samsung's double beep.
        if (taraSegmentedSession && taraListening) return;

        if (speaking) stopTaraRecognizer();
        else if (!taraListening) scheduleTaraRestart(noraConversationUntil > System.currentTimeMillis() ? 900L : 1800L);
    }

    private void startTaraRecognizerIfReady() {
        if (!taraEnabled || !taraResumed || taraSpeaking || taraListening) return;
        if (taraRecognizer == null) setupTaraRecognizer();
        if (taraRecognizer == null || taraRecognizerIntent == null) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;

        try {
            taraHandler.removeCallbacks(taraRestartRunnable);
            taraPartialWakeDispatched = false;
            taraRecognizer.startListening(taraRecognizerIntent);
            taraListening = true;
        } catch (Exception ignored) {
            taraListening = false;
            taraConsecutiveErrors += 1;
            scheduleTaraRestart(Math.min(12000L, 2800L + (taraConsecutiveErrors * 1200L)));
        }
    }

    private void scheduleTaraRestart(long delayMs) {
        taraHandler.removeCallbacks(taraRestartRunnable);
        if (!taraEnabled || !taraResumed || taraSpeaking || taraListening) return;
        long minimumDelay = System.currentTimeMillis() < noraConversationUntil ? 600L : 1600L;
        taraHandler.postDelayed(taraRestartRunnable, Math.max(minimumDelay, delayMs));
    }

    private void stopTaraRecognizer() {
        taraHandler.removeCallbacks(taraRestartRunnable);
        taraListening = false;
        taraPartialWakeDispatched = false;
        if (taraRecognizer != null) {
            try { taraRecognizer.cancel(); } catch (Exception ignored) { }
        }
    }

    private void destroyTaraRecognizer() {
        taraHandler.removeCallbacks(taraRestartRunnable);
        taraListening = false;
        taraPartialWakeDispatched = false;
        if (taraRecognizer != null) {
            try { taraRecognizer.cancel(); } catch (Exception ignored) { }
            try { taraRecognizer.destroy(); } catch (Exception ignored) { }
        }
        taraRecognizer = null;
        taraRecognizerIntent = null;
        taraSegmentedSession = false;
    }

    private void dispatchTaraTranscriptDebounced(String text) {
        if (text == null || text.trim().isEmpty()) return;
        String clean = text.trim();
        long now = System.currentTimeMillis();
        long elapsed = now - taraLastTranscriptAt;
        boolean sameTranscript = clean.equalsIgnoreCase(taraLastTranscriptText);
        boolean expandsPartialWake = "NORA".equalsIgnoreCase(taraLastTranscriptText)
                && clean.length() > 5
                && clean.regionMatches(true, 0, "NORA ", 0, 5);

        // Suppress duplicate callbacks, but never drop a full "NORA <command>"
        // result merely because the partial wake "NORA" arrived milliseconds first.
        if (elapsed < 700L && (sameTranscript || !expandsPartialWake)) return;

        taraLastTranscriptAt = now;
        taraLastTranscriptText = clean;
        dispatchTaraTranscript(clean);
    }

    private void dispatchTaraTranscript(String text) {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null || text == null || text.trim().isEmpty()) return;
        String quoted = JSONObject.quote(text.trim());
        String script = "window.dispatchEvent(new CustomEvent('centralhub:tara-transcript',{detail:{text:" + quoted + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    public void onResume() {
        super.onResume();
        taraResumed = true;
        scheduleTaraRestart(1800L);
    }

    @Override
    public void onPause() {
        taraResumed = false;
        noraConversationUntil = 0L;
        stopTaraRecognizer();
        super.onPause();
    }

    @Override
    public void onDestroy() {
        taraHandler.removeCallbacksAndMessages(null);
        destroyTaraRecognizer();
        if (nativeBridge != null) {
            nativeBridge.shutdown();
            nativeBridge = null;
        }
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_RECORD_AUDIO
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            scheduleTaraRestart(1800L);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent);
    }

    private void handleNotificationIntent(Intent intent) {
        if (intent == null) return;
        String actionUrl = intent.getStringExtra(EXTRA_ACTION_URL);
        if (actionUrl == null || actionUrl.trim().isEmpty()) return;
        intent.removeExtra(EXTRA_ACTION_URL);

        final String targetUrl = normalizeCentralHubUrl(actionUrl);
        if (targetUrl == null) return;

        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null) webView.post(() -> webView.loadUrl(targetUrl));
    }

    private String normalizeCentralHubUrl(String actionUrl) {
        String value = actionUrl.trim();
        if (value.startsWith("/")) return CENTRALHUB_ORIGIN + value;

        try {
            Uri uri = Uri.parse(value);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if ("https".equalsIgnoreCase(scheme) && "centralhub.network".equalsIgnoreCase(host)) return uri.toString();
        } catch (Exception ignored) { }
        return null;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        WebView webView = bridge.getWebView();
        if (webView == null) {
            super.onBackPressed();
            return;
        }

        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }

        webView.evaluateJavascript(
                "(window.history && window.history.length > 1) ? 'true' : 'false'",
                value -> {
                    boolean hasPageHistory = "true".equalsIgnoreCase(value) || "\"true\"".equals(value);
                    if (hasPageHistory) webView.evaluateJavascript("window.history.back()", null);
                    else MainActivity.super.onBackPressed();
                }
        );
    }
}