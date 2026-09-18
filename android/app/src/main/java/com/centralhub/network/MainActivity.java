package com.centralhub.network;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
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
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONObject;
import org.json.JSONTokener;

public class MainActivity extends BridgeActivity {
    private static final String CENTRALHUB_ORIGIN = "https://centralhub.network";
    private static final String EXTRA_ACTION_URL = "centralhub_action_url";
    private static final int REQUEST_POST_NOTIFICATIONS = 4101;
    private static final int REQUEST_RECORD_AUDIO = 4102;
    private static final String PRIMARY_RECOGNITION_LANGUAGE = "en-IN";
    private static final String[] SHRUTHI_VARIANTS = new String[]{
            "shruthi", "shruti", "sruthi", "sruti", "shrudhi", "srudhi",
            "shrewthi", "shrewti", "shrew tea", "shru thi", "shru ti",
            "shroothi", "shrooti", "shroo thi", "shroo ti",
            "sudhi", "sudi", "suthi", "shudi", "shuti", "sweetie", "sweety"
    };
    private static final ArrayList<String> SHRUTHI_LANGUAGE_ALLOWLIST = new ArrayList<>(Arrays.asList(
            "en-IN", "en-GB", "ml-IN", "ta-IN"
    ));
    private static final ArrayList<String> SHRUTHI_BIAS_PHRASES = new ArrayList<>(Arrays.asList(
            "Shruthi", "Shruti", "Sruthi", "Sruti", "Shrudhi", "Srudhi",
            "Shrewthi", "Shrew tea", "Shru thi", "Shru ti", "Shroothi", "Shrooti",
            "Sudhi", "Sudi", "Suthi", "Shudi", "Sweetie",
            "Hi Shruthi", "Hello Shruthi", "Hey Shruthi", "Hi Shruti", "Hey Shruti", "Hey Sruthi",
            "ശ്രുതി", "ശ്രൂതി", "ஸ்ருதி", "ஸ்ரூதி",
            "CentralHub", "MalluSpices", "KeralaGrocery", "PocketGrocery", "TamilRetail",
            "DHL", "D H L", "WhatsApp", "Supabase", "Netlify", "Mollie", "Trust Payments",
            "Google Ads", "Google Analytics", "Merchant Center",
            "stop", "wait", "pause", "next", "hold on", "continue", "repeat"
    ));

    private final Handler taraHandler = new Handler(Looper.getMainLooper());
    private final Runnable taraRestartRunnable = this::startTaraRecognizerIfReady;
    private final Runnable taraStartWatchdogRunnable = this::recoverStalledTaraStart;
    private final Runnable taraPartialWakeDispatchRunnable = this::dispatchPendingPartialWake;
    private final Runnable taraSegmentCommitRunnable = this::commitPendingSegmentTurn;
    private SpeechRecognizer taraRecognizer;
    private Intent taraRecognizerIntent;
    private CentralHubNativeBridge nativeBridge;
    private ShruthiAudioPipe taraAudioPipe;
    private ShruthiRealtimeVoiceClient shruthiRealtimeClient;
    private volatile boolean shruthiRealtimeActive = false;
    private boolean taraEnabled = false;
    private boolean taraSpeaking = false;
    private boolean taraResumed = false;
    private boolean taraListening = false;
    private boolean taraReadyForSpeech = false;
    private boolean taraPartialWakeDispatched = false;
    private boolean taraSegmentedSession = false;
    private boolean taraUsingOnDeviceRecognizer = false;
    private boolean taraForceNetworkRecognizer = false;
    private boolean taraLanguageSwitchEnabled = true;
    private boolean taraInjectedAudioEnabled = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU;
    private boolean taraInjectedAudioActive = false;
    private boolean noraConversationActive = false;
    private int taraConsecutiveErrors = 0;
    private long taraLastTranscriptAt = 0L;
    private long taraLastBargeInAt = 0L;
    private long taraIgnoreWakeUntil = 0L;
    private long taraSpeechEndedAt = 0L;
    private long taraLastRmsDispatchAt = 0L;
    private final StringBuilder taraSegmentText = new StringBuilder();
    private String taraLastTranscriptText = "";
    private String taraPendingPartialWakeText = "";
    private String taraCurrentSpeechContext = "";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebSettings webSettings = bridge.getWebView().getSettings();
        webSettings.setUseWideViewPort(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
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

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                updateTaraWebAudioGuard(noraConversationActive);
            }
        });

        handleNotificationIntent(getIntent());
    }

    private void setupTaraRecognizer() {
        destroyTaraRecognizer();
        taraSegmentedSession = false;
        taraUsingOnDeviceRecognizer = false;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return;

        if (!taraForceNetworkRecognizer
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
            try {
                taraRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
                taraUsingOnDeviceRecognizer = taraRecognizer != null;
            } catch (Exception ignored) {
                taraRecognizer = null;
            }
        }
        if (taraRecognizer == null) {
            try {
                taraRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
                taraUsingOnDeviceRecognizer = false;
            } catch (Exception ignored) {
                taraRecognizer = null;
            }
        }
        if (taraRecognizer == null) return;

        taraRecognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 8);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, PRIMARY_RECOGNITION_LANGUAGE);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, PRIMARY_RECOGNITION_LANGUAGE);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, taraUsingOnDeviceRecognizer);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            taraRecognizerIntent.putStringArrayListExtra(
                    RecognizerIntent.EXTRA_BIASING_STRINGS,
                    new ArrayList<>(SHRUTHI_BIAS_PHRASES)
            );
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_ENABLE_BIASING_DEVICE_CONTEXT, true);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && taraLanguageSwitchEnabled) {
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_ENABLE_LANGUAGE_DETECTION, true);
            taraRecognizerIntent.putStringArrayListExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES,
                    new ArrayList<>(SHRUTHI_LANGUAGE_ALLOWLIST)
            );
            taraRecognizerIntent.putExtra(
                    RecognizerIntent.EXTRA_ENABLE_LANGUAGE_SWITCH,
                    RecognizerIntent.LANGUAGE_SWITCH_BALANCED
            );
            taraRecognizerIntent.putStringArrayListExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES,
                    new ArrayList<>(SHRUTHI_LANGUAGE_ALLOWLIST)
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_SWITCH_MAX_SWITCHES, 3);
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && taraUsingOnDeviceRecognizer) {
            taraSegmentedSession = true;
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 280L);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 480L);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 720L);
            taraRecognizerIntent.putExtra(
                    RecognizerIntent.EXTRA_SEGMENTED_SESSION,
                    RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS
            );
        } else {
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 720L);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 480L);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 280L);
        }

        taraRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                taraHandler.removeCallbacks(taraStartWatchdogRunnable);
                taraReadyForSpeech = true;
                taraListening = true;
                taraHandler.removeCallbacks(taraSegmentCommitRunnable);
                taraSegmentText.setLength(0);
                taraConsecutiveErrors = 0;
            }
            @Override
            public void onBeginningOfSpeech() {
                if (noraConversationActive && !taraSpeaking) dispatchTaraUserSpeechStart();
            }
            @Override
            public void onRmsChanged(float rmsdB) {
                if (noraConversationActive && !taraSpeaking) dispatchTaraRmsDb(rmsdB);
            }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }

            @Override
            public void onError(int error) {
                taraHandler.removeCallbacks(taraStartWatchdogRunnable);
                clearPendingPartialWake();
                taraHandler.removeCallbacks(taraSegmentCommitRunnable);
                taraSegmentText.setLength(0);
                taraListening = false;
                taraReadyForSpeech = false;

                boolean injectedFailure = taraInjectedAudioActive
                        && (error == SpeechRecognizer.ERROR_AUDIO
                        || error == SpeechRecognizer.ERROR_CLIENT
                        || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY);
                closeTaraAudioPipe();

                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) return;
                if (injectedFailure) {
                    taraInjectedAudioEnabled = false;
                    taraConsecutiveErrors += 1;
                    destroyTaraRecognizer();
                    scheduleTaraRestart(450L);
                    return;
                }

                taraConsecutiveErrors += 1;
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                        || error == SpeechRecognizer.ERROR_CLIENT
                        || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                        && error == SpeechRecognizer.ERROR_SERVER_DISCONNECTED)) {
                    destroyTaraRecognizer();
                    scheduleTaraRestart(noraConversationActive ? 550L : 1000L);
                    return;
                }
                if (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED
                        || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) {
                    if (taraLanguageSwitchEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        taraLanguageSwitchEnabled = false;
                        destroyTaraRecognizer();
                        scheduleTaraRestart(500L);
                        return;
                    }
                    if (taraUsingOnDeviceRecognizer) {
                        taraForceNetworkRecognizer = true;
                        destroyTaraRecognizer();
                        scheduleTaraRestart(750L);
                    } else {
                        scheduleTaraRestart(3500L);
                    }
                    return;
                }

                long delay;
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) delay = 2200L;
                else if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    delay = taraSegmentedSession ? 650L : 600L;
                } else {
                    delay = Math.min(10000L, 1800L + (taraConsecutiveErrors * 900L));
                }
                scheduleTaraRestart(delay);
            }

            @Override
            public void onResults(Bundle results) {
                taraHandler.removeCallbacks(taraStartWatchdogRunnable);
                clearPendingPartialWake();
                taraHandler.removeCallbacks(taraSegmentCommitRunnable);
                taraSegmentText.setLength(0);
                processNoraRecognitionBundle(results);
                closeTaraAudioPipe();
                taraListening = false;
                taraReadyForSpeech = false;
                taraConsecutiveErrors = 0;
                scheduleTaraRestart(noraConversationActive ? 180L : (taraSegmentedSession ? 700L : 650L));
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults == null ? null : partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches == null || matches.isEmpty()) return;

                if (taraSpeaking) {
                    handleTaraBargeInMatches(matches);
                    return;
                }

                for (String match : matches) {
                    if (match == null || match.trim().isEmpty()) continue;
                    String canonical = canonicalizeNoraTranscript(match);
                    String lower = canonical.trim().toLowerCase(Locale.ROOT);
                    if (lower.equals("shruthi") || lower.startsWith("shruthi ")) {
                        activateNoraConversation();
                        clearPendingPartialWake();
                        if (!taraPartialWakeDispatched) {
                            taraPartialWakeDispatched = true;
                            taraPendingPartialWakeText = canonical;
                            taraHandler.removeCallbacks(taraPartialWakeDispatchRunnable);
                            taraHandler.postDelayed(taraPartialWakeDispatchRunnable, 180L);
                        }
                        return;
                    }
                }
            }

            @Override
            public void onSegmentResults(Bundle segmentResults) {
                clearPendingPartialWake();
                ArrayList<String> matches = segmentResults == null ? null : segmentResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) {
                    String segment = matches.get(0) == null ? "" : matches.get(0).trim();
                    if (!segment.isEmpty()) {
                        if (taraSegmentText.length() > 0) taraSegmentText.append(' ');
                        taraSegmentText.append(segment);
                        taraHandler.removeCallbacks(taraSegmentCommitRunnable);
                        taraHandler.postDelayed(taraSegmentCommitRunnable, 520L);
                    }
                }
                taraConsecutiveErrors = 0;
                taraListening = true;
            }

            @Override
            public void onEndOfSegmentedSession() {
                taraHandler.removeCallbacks(taraStartWatchdogRunnable);
                clearPendingPartialWake();
                commitPendingSegmentTurn();
                closeTaraAudioPipe();
                taraListening = false;
                taraReadyForSpeech = false;
                taraConsecutiveErrors = 0;
                scheduleTaraRestart(noraConversationActive ? 180L : 700L);
            }

            @Override public void onEvent(int eventType, Bundle params) { }
        });
    }

    private void processNoraRecognitionBundle(Bundle results) {
        ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return;

        if (taraSpeaking) {
            handleTaraBargeInMatches(matches);
            return;
        }

        for (String match : matches) {
            if (match == null || match.trim().isEmpty()) continue;
            processNoraRecognitionText(match);
            return;
        }
    }

    private void processNoraRecognitionText(String rawText) {
        if (rawText == null || rawText.trim().isEmpty()) return;
        String canonical = canonicalizeNoraTranscript(rawText);
        String lower = canonical.trim().toLowerCase(Locale.ROOT);
        boolean explicitWake = lower.equals("shruthi") || lower.startsWith("shruthi ");

        if (System.currentTimeMillis() - taraSpeechEndedAt < 1400L && isLikelyTaraEcho(canonical)) return;

        if (explicitWake) {
            if (!noraConversationActive && System.currentTimeMillis() < taraIgnoreWakeUntil) return;
            activateNoraConversation();
        } else if (!noraConversationActive) {
            return;
        } else {
            canonical = "SHRUTHI " + canonical;
        }

        dispatchTaraTranscriptDebounced(canonical);
    }

    private void commitPendingSegmentTurn() {
        taraHandler.removeCallbacks(taraSegmentCommitRunnable);
        String completedTurn = taraSegmentText.toString().trim();
        taraSegmentText.setLength(0);
        if (!completedTurn.isEmpty()) processNoraRecognitionText(completedTurn);
    }

    private void handleTaraBargeInMatches(ArrayList<String> matches) {
        long now = System.currentTimeMillis();
        if (now - taraLastBargeInAt < 260L) return;

        for (String match : matches) {
            if (match == null || match.trim().isEmpty()) continue;
            String canonical = canonicalizeNoraTranscript(match).trim();
            if (canonical.isEmpty()) continue;

            String lower = canonical.toLowerCase(Locale.ROOT);
            boolean explicitWake = lower.equals("shruthi") || lower.startsWith("shruthi ");
            String withoutWake = explicitWake
                    ? canonical.replaceFirst("(?i)^SHRUTHI\\s*", "").trim()
                    : canonical;

            boolean pauseOnly = isPauseOnlyBargeIn(withoutWake);
            boolean conversationalControl = isConversationalBargeInControl(withoutWake);
            if (!explicitWake && !pauseOnly && !conversationalControl && isLikelyTaraEcho(canonical)) continue;
            if (!explicitWake && !pauseOnly && withoutWake.length() < 2) continue;

            taraLastBargeInAt = now;
            activateNoraConversation();
            clearPendingPartialWake();
            interruptTaraSpeechForWake();

            if (pauseOnly) return;

            String dispatch = explicitWake ? canonical : "SHRUTHI " + canonical;
            dispatchTaraTranscriptDebounced(dispatch);
            return;
        }
    }

    private boolean isPauseOnlyBargeIn(String raw) {
        String value = normalizeSpeechForCompare(raw);
        if (value.isEmpty()) return false;
        return value.equals("stop")
                || value.equals("stop it")
                || value.equals("wait")
                || value.equals("wait a second")
                || value.equals("pause")
                || value.equals("hold on")
                || value.equals("enough")
                || value.equals("quiet")
                || value.equals("shh")
                || value.equals("മതി")
                || value.equals("നിർത്തു")
                || value.equals("நிறுத்து")
                || value.equals("போதும்");
    }

    private boolean isConversationalBargeInControl(String raw) {
        String value = normalizeSpeechForCompare(raw);
        return value.equals("next")
                || value.equals("no")
                || value.equals("yes")
                || value.equals("actually")
                || value.equals("continue")
                || value.equals("go on")
                || value.equals("repeat")
                || value.equals("again")
                || value.equals("instead")
                || value.equals("why")
                || value.equals("what")
                || value.equals("how");
    }

    private boolean isLikelyTaraEcho(String raw) {
        String heard = normalizeSpeechForCompare(raw);
        String spoken = normalizeSpeechForCompare(taraCurrentSpeechContext);
        if (heard.isEmpty() || spoken.isEmpty()) return false;
        if (heard.startsWith("shruthi ")) heard = heard.substring(8).trim();
        if (heard.isEmpty()) return false;

        if (heard.length() >= 5 && spoken.contains(heard)) return true;

        String[] heardWords = heard.split("\\s+");
        String[] spokenWords = spoken.split("\\s+");
        Set<String> spokenSet = new HashSet<>(Arrays.asList(spokenWords));
        int meaningful = 0;
        int overlap = 0;
        for (String word : heardWords) {
            if (word.length() < 2) continue;
            meaningful += 1;
            if (spokenSet.contains(word)) overlap += 1;
        }
        if (meaningful == 0) return false;
        if (meaningful == 1) return overlap == 1 && heard.length() >= 5;
        return ((double) overlap / (double) meaningful) >= 0.72d;
    }

    private String normalizeSpeechForCompare(String raw) {
        if (raw == null) return "";
        return raw.toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}]+", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private void activateNoraConversation() {
        noraConversationActive = true;
        taraIgnoreWakeUntil = 0L;
        updateTaraWebAudioGuard(true);
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
        String[] greetings = new String[]{"", "hi ", "hello ", "hey "};
        for (String variant : SHRUTHI_VARIANTS) {
            for (String greeting : greetings) {
                String wake = greeting + variant;
                if (normalized.equals(wake)) return "SHRUTHI";
                String wakeWithSpace = wake + " ";
                if (normalized.startsWith(wakeWithSpace)) {
                    return "SHRUTHI " + clean.substring(wakeWithSpace.length()).trim();
                }
            }
        }

        String[] nativeVariants = new String[]{"ശ്രുതി", "ശ്രൂതി", "ஸ்ருதி", "ஸ்ரூதி"};
        for (String variant : nativeVariants) {
            for (String greeting : greetings) {
                String wake = greeting + variant;
                if (normalized.equals(wake)) return "SHRUTHI";
                String wakeWithSpace = wake + " ";
                if (normalized.startsWith(wakeWithSpace)) {
                    return "SHRUTHI " + clean.substring(wakeWithSpace.length()).trim();
                }
            }
        }

        String[] legacyVariants = new String[]{"nora", "norah", "noora", "noura", "norra", "nora's", "നോറ", "നോറാ", "நோரா"};
        for (String variant : legacyVariants) {
            for (String greeting : greetings) {
                String wake = greeting + variant;
                if (normalized.equals(wake)) return "SHRUTHI";
                String wakeWithSpace = wake + " ";
                if (normalized.startsWith(wakeWithSpace)) {
                    return "SHRUTHI " + clean.substring(wakeWithSpace.length()).trim();
                }
            }
        }
        return clean;
    }

    private boolean isSimpleNoraWakePhrase(String raw) {
        if (raw == null) return false;
        String canonical = canonicalizeNoraTranscript(raw);
        String normalized = canonical.trim().toLowerCase(Locale.ROOT).replaceAll("[\\p{Punct}\\s]+", " ").trim();
        if (normalized.length() > 18) return false;
        return normalized.equals("shruthi");
    }

    private void dispatchPendingPartialWake() {
        String wakeText = taraPendingPartialWakeText;
        taraPendingPartialWakeText = "";
        taraPartialWakeDispatched = false;
        if (!taraEnabled || !taraResumed || taraSpeaking || wakeText.isEmpty()) return;
        if (System.currentTimeMillis() < taraIgnoreWakeUntil) return;
        activateNoraConversation();
        dispatchTaraTranscriptDebounced(wakeText);
    }

    private void clearPendingPartialWake() {
        taraHandler.removeCallbacks(taraPartialWakeDispatchRunnable);
        taraPendingPartialWakeText = "";
        taraPartialWakeDispatched = false;
    }

    private void interruptTaraSpeechForWake() {
        if (!taraSpeaking) return;
        taraSpeaking = false;
        taraSpeechEndedAt = System.currentTimeMillis();
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;
        String script = "(function(){try{"
                + "var b=document.querySelector('button[aria-label=\\\"Mute SHRUTHI\\\"]');"
                + "if(b){b.click();setTimeout(function(){var r=document.querySelector('button[aria-label=\\\"Enable SHRUTHI voice\\\"]');if(r)r.click();},120);}"
                + "else{document.querySelectorAll('audio').forEach(function(a){try{a.pause();a.src='';}catch(e){}});if(window.speechSynthesis)window.speechSynthesis.cancel();if(window.CentralHubNative&&window.CentralHubNative.stopTaraTts)window.CentralHubNative.stopTaraTts();}"
                + "}catch(e){}})();";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void captureTaraSpeechContextFromWeb() {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;
        String script = "(function(){try{var c=document.querySelectorAll('.nora-glass-card');for(var i=c.length-1;i>=0;i--){var l=c[i].querySelector('.nora-card-label');var p=c[i].querySelector('p');if(l&&p&&String(l.textContent||'').trim().toUpperCase()==='SHRUTHI')return String(p.textContent||'').trim();}return '';}catch(e){return '';}})();";
        webView.postDelayed(() -> webView.evaluateJavascript(script, value -> {
            if (value == null || "null".equals(value)) return;
            try {
                Object decoded = new JSONTokener(value).nextValue();
                if (decoded instanceof String) {
                    String text = ((String) decoded).trim();
                    if (!text.isEmpty()) taraCurrentSpeechContext = text;
                }
            } catch (Exception ignored) { }
        }), 140L);
    }

    public void setTaraSpeechContext(String text) {
        taraCurrentSpeechContext = text == null ? "" : text.trim();
    }

    public boolean isNoraConversationActive() {
        return noraConversationActive;
    }

    private void updateTaraWebAudioGuard(boolean allowed) {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;
        String value = allowed ? "true" : "false";
        String script = "(function(){try{"
                + "window.__centralHubShruthiAudioAllowed=" + value + ";"
                + "if(!window.__centralHubShruthiAudioGuardInstalled){"
                + "window.__centralHubShruthiAudioGuardInstalled=true;"
                + "var originalPlay=HTMLMediaElement.prototype.play;"
                + "HTMLMediaElement.prototype.play=function(){var s=String(this.src||'');if(window.__centralHubShruthiAudioAllowed===false&&this.tagName==='AUDIO'&&s.indexOf('blob:')===0)return Promise.resolve();return originalPlay.apply(this,arguments);};"
                + "if(window.speechSynthesis){var synth=window.speechSynthesis;var originalSpeak=synth.speak.bind(synth);window.__centralHubShruthiOriginalSpeak=originalSpeak;try{synth.speak=function(u){if(window.__centralHubShruthiAudioAllowed===false)return;return originalSpeak(u);};}catch(e){}}"
                + "}"
                + "if(window.__centralHubShruthiAudioAllowed===false){document.querySelectorAll('audio').forEach(function(a){var s=String(a.src||'');if(s.indexOf('blob:')===0){try{a.pause();a.src='';}catch(e){}}});if(window.speechSynthesis)window.speechSynthesis.cancel();}"
                + "}catch(e){}})();";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    public boolean isTaraVoiceAvailable() {
        return SpeechRecognizer.isRecognitionAvailable(this);
    }

    public void setTaraEnabled(boolean enabled) {
        boolean wasEnabled = taraEnabled;
        taraEnabled = enabled;
        if (!enabled) {
            noraConversationActive = false;
            taraIgnoreWakeUntil = System.currentTimeMillis() + 1000L;
            taraCurrentSpeechContext = "";
            updateTaraWebAudioGuard(false);
            clearPendingPartialWake();
            destroyTaraRecognizer();
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
            return;
        }
        if (!wasEnabled || taraRecognizer == null || taraRecognizerIntent == null) {
            setupTaraRecognizer();
        }
        scheduleTaraRestart(250L);
    }

    public void setNoraConversationActive(boolean active) {
        if (active) {
            activateNoraConversation();
        } else {
            noraConversationActive = false;
            taraIgnoreWakeUntil = System.currentTimeMillis() + 1100L;
            taraCurrentSpeechContext = "";
            taraLastTranscriptText = "";
            taraLastTranscriptAt = 0L;
            updateTaraWebAudioGuard(false);
            clearPendingPartialWake();
        }
        if (taraEnabled && taraResumed && !taraListening) {
            scheduleTaraRestart(active ? 160L : 700L);
        }
    }

    public void setTaraSpeaking(boolean speaking) {
        if (speaking && !noraConversationActive) {
            taraSpeaking = false;
            taraSpeechEndedAt = System.currentTimeMillis();
            updateTaraWebAudioGuard(false);
            return;
        }

        taraSpeaking = speaking;
        if (speaking) {
            updateTaraWebAudioGuard(true);
            captureTaraSpeechContextFromWeb();
            if (taraEnabled && taraResumed && !taraListening) scheduleTaraRestart(180L);
            return;
        }

        taraSpeechEndedAt = System.currentTimeMillis();
        if (!taraListening) scheduleTaraRestart(noraConversationActive ? 160L : 700L);
    }

    private void startTaraRecognizerIfReady() {
        if (shruthiRealtimeActive) return;
        if (!taraEnabled || !taraResumed || taraListening) return;
        if (taraSpeaking && !noraConversationActive) return;
        if (taraRecognizer == null) setupTaraRecognizer();
        if (taraRecognizer == null || taraRecognizerIntent == null) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;

        try {
            taraHandler.removeCallbacks(taraRestartRunnable);
            taraHandler.removeCallbacks(taraStartWatchdogRunnable);
            clearPendingPartialWake();
            closeTaraAudioPipe();
            taraReadyForSpeech = false;

            Intent sessionIntent = taraRecognizerIntent;
            if (taraInjectedAudioEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ShruthiAudioPipe audioPipe = ShruthiAudioPipe.start(level -> {
                    if (noraConversationActive && !taraSpeaking) dispatchTaraRmsLevel(level);
                });
                if (audioPipe != null) {
                    taraAudioPipe = audioPipe;
                    taraInjectedAudioActive = true;
                    taraSegmentedSession = true;
                    sessionIntent = new Intent(taraRecognizerIntent);
                    sessionIntent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, audioPipe.getReadDescriptor());
                    sessionIntent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, ShruthiAudioPipe.CHANNEL_COUNT);
                    sessionIntent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
                    sessionIntent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, ShruthiAudioPipe.SAMPLE_RATE_HZ);
                    sessionIntent.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE);
                }
            }

            taraRecognizer.startListening(sessionIntent);
            taraListening = true;
            taraHandler.postDelayed(taraStartWatchdogRunnable, 3500L);
        } catch (Exception ignored) {
            closeTaraAudioPipe();
            taraListening = false;
            taraReadyForSpeech = false;
            taraConsecutiveErrors += 1;
            destroyTaraRecognizer();
            scheduleTaraRestart(Math.min(10000L, 1800L + (taraConsecutiveErrors * 900L)));
        }
    }

    private void recoverStalledTaraStart() {
        if (!taraEnabled || !taraResumed || !taraListening || taraReadyForSpeech) return;
        if (taraSpeaking && !noraConversationActive) return;
        taraConsecutiveErrors += 1;
        if (taraUsingOnDeviceRecognizer && taraConsecutiveErrors >= 2) {
            taraForceNetworkRecognizer = true;
        }
        destroyTaraRecognizer();
        scheduleTaraRestart(noraConversationActive ? 500L : 1000L);
    }

    private void scheduleTaraRestart(long delayMs) {
        taraHandler.removeCallbacks(taraRestartRunnable);
        if (shruthiRealtimeActive) return;
        if (!taraEnabled || !taraResumed || taraListening) return;
        if (taraSpeaking && !noraConversationActive) return;
        long minimumDelay = noraConversationActive ? 120L : 650L;
        taraHandler.postDelayed(taraRestartRunnable, Math.max(minimumDelay, delayMs));
    }

    private void closeTaraAudioPipe() {
        ShruthiAudioPipe pipe = taraAudioPipe;
        taraAudioPipe = null;
        taraInjectedAudioActive = false;
        if (pipe != null) {
            try { pipe.close(); } catch (Exception ignored) { }
        }
    }

    private void stopTaraRecognizer() {
        taraHandler.removeCallbacks(taraRestartRunnable);
        taraHandler.removeCallbacks(taraStartWatchdogRunnable);
        taraHandler.removeCallbacks(taraSegmentCommitRunnable);
        taraSegmentText.setLength(0);
        clearPendingPartialWake();
        closeTaraAudioPipe();
        taraListening = false;
        taraReadyForSpeech = false;
        if (taraRecognizer != null) {
            try { taraRecognizer.cancel(); } catch (Exception ignored) { }
        }
    }

    private void destroyTaraRecognizer() {
        taraHandler.removeCallbacks(taraRestartRunnable);
        taraHandler.removeCallbacks(taraStartWatchdogRunnable);
        taraHandler.removeCallbacks(taraSegmentCommitRunnable);
        taraSegmentText.setLength(0);
        clearPendingPartialWake();
        closeTaraAudioPipe();
        taraListening = false;
        taraReadyForSpeech = false;
        if (taraRecognizer != null) {
            try { taraRecognizer.cancel(); } catch (Exception ignored) { }
            try { taraRecognizer.destroy(); } catch (Exception ignored) { }
        }
        taraRecognizer = null;
        taraRecognizerIntent = null;
        taraSegmentedSession = false;
        taraUsingOnDeviceRecognizer = false;
    }

    private void dispatchTaraTranscriptDebounced(String text) {
        if (text == null || text.trim().isEmpty()) return;
        String clean = text.trim();
        long now = System.currentTimeMillis();
        long elapsed = now - taraLastTranscriptAt;
        boolean sameTranscript = clean.equalsIgnoreCase(taraLastTranscriptText);
        boolean expandsPartialWake = "SHRUTHI".equalsIgnoreCase(taraLastTranscriptText)
                && clean.length() > 8
                && clean.regionMatches(true, 0, "SHRUTHI ", 0, 8);

        if (elapsed < 260L && (sameTranscript || !expandsPartialWake)) return;

        taraLastTranscriptAt = now;
        taraLastTranscriptText = clean;
        dispatchTaraTranscript(clean);
    }

    private void dispatchTaraUserSpeechStart() {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;
        String script = "window.dispatchEvent(new CustomEvent('centralhub:tara-user-speech-start'));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void dispatchTaraRmsDb(float rmsDb) {
        double level = Math.max(0d, Math.min(1d, (rmsDb + 2d) / 12d));
        dispatchTaraRmsLevel(level);
    }

    public void dispatchTaraRmsLevel(double level) {
        long now = System.currentTimeMillis();
        if (now - taraLastRmsDispatchAt < 50L) return;
        taraLastRmsDispatchAt = now;
        double safeLevel = Math.max(0d, Math.min(1d, level));
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;
        String script = "window.dispatchEvent(new CustomEvent('centralhub:tara-rms',{detail:{level:" + safeLevel + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void dispatchTaraTranscript(String text) {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null || text == null || text.trim().isEmpty()) return;
        String quoted = JSONObject.quote(text.trim());
        String script = "window.dispatchEvent(new CustomEvent('centralhub:tara-transcript',{detail:{text:" + quoted + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    public boolean isShruthiRealtimeAvailable() {
        return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    public boolean startShruthiRealtime(String accessToken, String supabaseUrl, String publishableKey) {
        if (accessToken == null || accessToken.trim().isEmpty() || supabaseUrl == null || supabaseUrl.trim().isEmpty() || !isShruthiRealtimeAvailable()) return false;
        try {
            Uri backend = Uri.parse(supabaseUrl.trim());
            if (!"https".equalsIgnoreCase(backend.getScheme()) || backend.getHost() == null || !backend.getHost().toLowerCase(Locale.ROOT).endsWith(".supabase.co")) return false;
        } catch (Exception ignored) { return false; }
        stopShruthiRealtime();
        shruthiRealtimeActive = true;
        runOnUiThread(this::stopTaraRecognizer);
        ShruthiRealtimeVoiceClient client = new ShruthiRealtimeVoiceClient(this, accessToken.trim(), supabaseUrl.trim(), publishableKey == null ? "" : publishableKey.trim(), new ShruthiRealtimeVoiceClient.Listener() {
            @Override public void onState(String state) { dispatchShruthiRealtimeEvent("state", "state", state); }
            @Override public void onUserTranscript(String text) { dispatchShruthiRealtimeEvent("user-transcript", "text", text); }
            @Override public void onAssistantTranscript(String text) { dispatchShruthiRealtimeEvent("assistant-transcript", "text", text); }
            @Override public void onError(String message) { dispatchShruthiRealtimeEvent("error", "message", message); }
        });
        shruthiRealtimeClient = client;
        client.connect();
        return true;
    }

    public void interruptShruthiRealtime() {
        ShruthiRealtimeVoiceClient client = shruthiRealtimeClient;
        if (client != null) client.interrupt();
    }


    public void stopShruthiRealtime() {
        ShruthiRealtimeVoiceClient client = shruthiRealtimeClient;
        shruthiRealtimeClient = null;
        shruthiRealtimeActive = false;
        if (client != null) client.release();
        if (taraEnabled && taraResumed) runOnUiThread(() -> scheduleTaraRestart(180L));
    }

    private void dispatchShruthiRealtimeEvent(String eventName, String key, String value) {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;
        String quoted = JSONObject.quote(value == null ? "" : value);
        String script = "window.dispatchEvent(new CustomEvent('centralhub:shruthi-realtime-" + eventName + "',{detail:{" + key + ":" + quoted + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    public void onResume() {
        super.onResume();
        taraResumed = true;
        if (taraEnabled
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                && (taraRecognizer == null || taraRecognizerIntent == null)) {
            setupTaraRecognizer();
        }
        updateTaraWebAudioGuard(noraConversationActive);
        scheduleTaraRestart(noraConversationActive ? 160L : 700L);
    }

    @Override
    public void onPause() {
        stopShruthiRealtime();
        taraResumed = false;
        clearPendingPartialWake();
        destroyTaraRecognizer();
        super.onPause();
    }

    @Override
    public void onDestroy() {
        stopShruthiRealtime();
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
            if (taraEnabled && taraResumed) setupTaraRecognizer();
            scheduleTaraRestart(500L);
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
