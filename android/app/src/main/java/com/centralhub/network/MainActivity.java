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

    // Bridge method names remain Tara-compatible so installed web/native versions can
    // overlap during rollout. NORA remains a wake alias; SHRUTHI is the primary name.
    private final Handler taraHandler = new Handler(Looper.getMainLooper());
    private final Runnable taraRestartRunnable = this::startTaraRecognizerIfReady;
    private final Runnable taraStartWatchdogRunnable = this::recoverStalledTaraStart;
    private final Runnable taraPartialWakeDispatchRunnable = this::dispatchPendingPartialWake;
    private SpeechRecognizer taraRecognizer;
    private Intent taraRecognizerIntent;
    private CentralHubNativeBridge nativeBridge;
    private boolean taraEnabled = false;
    private boolean taraSpeaking = false;
    private boolean taraResumed = false;
    private boolean taraListening = false;
    private boolean taraReadyForSpeech = false;
    private boolean taraPartialWakeDispatched = false;
    private boolean taraSegmentedSession = false;
    private boolean taraUsingOnDeviceRecognizer = false;
    private boolean taraForceNetworkRecognizer = false;
    private boolean noraConversationActive = false;
    private int taraConsecutiveErrors = 0;
    private long taraLastTranscriptAt = 0L;
    private String taraLastTranscriptText = "";
    private String taraPendingPartialWakeText = "";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebSettings webSettings = bridge.getWebView().getSettings();
        webSettings.setUseWideViewPort(true);
        // Shruthi cloud TTS is generated after an authenticated network round-trip.
        // Allow the trusted CentralHub WebView to play that assistant audio without a second tap.
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
        });

        handleNotificationIntent(getIntent());
    }

    /**
     * Passive wake listening uses Android's on-device recognizer where available.
     * Android 13+ uses segmented recognition so Samsung can keep one recognizer
     * session alive while still delivering a result shortly after the user stops
     * speaking. SHRUTHI and NORA are both accepted wake names.
     */
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
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-GB");
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-GB");
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, taraUsingOnDeviceRecognizer);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            taraRecognizerIntent.putStringArrayListExtra(
                    RecognizerIntent.EXTRA_BIASING_STRINGS,
                    new ArrayList<>(Arrays.asList(
                            "Shruthi", "Sruthi", "Shruti", "Hey Shruthi", "Hey Sruthi", "Hey Shruti",
                            "ശ്രുതി", "ஸ்ருதி",
                            "NORA", "Nora", "Norah", "Noora", "Noura", "Hey NORA", "Hey Nora",
                            "നോറ", "നോറാ", "நோரா"
                    ))
            );
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_ENABLE_BIASING_DEVICE_CONTEXT, true);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && taraUsingOnDeviceRecognizer) {
            taraSegmentedSession = true;
            // The old 300,000 ms minimum kept a one-word wake trapped inside a
            // five-minute recognition session on Samsung. Use silence-based
            // segmentation instead: it keeps a segmented session but emits the
            // utterance quickly after the user stops speaking. If a recognizer
            // ignores segmented mode, the same short endpointer values also make
            // the normal final result arrive promptly.
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 500L);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 650L);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1050L);
            taraRecognizerIntent.putExtra(
                    RecognizerIntent.EXTRA_SEGMENTED_SESSION,
                    RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS
            );
        } else {
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1050L);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 650L);
            taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 500L);
        }

        taraRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                taraHandler.removeCallbacks(taraStartWatchdogRunnable);
                taraReadyForSpeech = true;
                taraListening = true;
                taraConsecutiveErrors = 0;
            }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }

            @Override
            public void onError(int error) {
                taraHandler.removeCallbacks(taraStartWatchdogRunnable);
                clearPendingPartialWake();
                taraListening = false;
                taraReadyForSpeech = false;
                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) return;

                taraConsecutiveErrors += 1;
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                        || error == SpeechRecognizer.ERROR_CLIENT
                        || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                        && error == SpeechRecognizer.ERROR_SERVER_DISCONNECTED)) {
                    // Samsung/Bixby can leave Android SpeechRecognizer bound to a stale
                    // recognition service after audio focus or app lifecycle changes.
                    // Recreate the native recognizer instead of retrying the dead instance.
                    destroyTaraRecognizer();
                    scheduleTaraRestart(noraConversationActive ? 700L : 1800L);
                    return;
                }
                if (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED
                        || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) {
                    if (taraUsingOnDeviceRecognizer) {
                        taraForceNetworkRecognizer = true;
                        destroyTaraRecognizer();
                        scheduleTaraRestart(900L);
                    } else {
                        scheduleTaraRestart(6000L);
                    }
                    return;
                }

                long delay;
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) delay = 2600L;
                else if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    delay = taraSegmentedSession ? 1800L : 1400L;
                } else {
                    delay = Math.min(12000L, 2200L + (taraConsecutiveErrors * 1000L));
                }
                scheduleTaraRestart(delay);
            }

            @Override
            public void onResults(Bundle results) {
                taraHandler.removeCallbacks(taraStartWatchdogRunnable);
                clearPendingPartialWake();
                processNoraRecognitionBundle(results);
                taraListening = false;
                taraReadyForSpeech = false;
                taraConsecutiveErrors = 0;
                scheduleTaraRestart(noraConversationActive ? 700L : (taraSegmentedSession ? 1200L : 1000L));
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults == null ? null : partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches == null || matches.isEmpty()) return;

                // While Shruthi is talking, only an explicit wake-name utterance is
                // allowed through. This gives the user barge-in without feeding the
                // assistant's own speaker audio back as a new user command.
                if (taraSpeaking) {
                    for (String match : matches) {
                        if (match == null || match.trim().isEmpty()) continue;
                        String canonical = canonicalizeNoraTranscript(match);
                        String lower = canonical.trim().toLowerCase(Locale.ROOT);
                        if (lower.equals("shruthi") || lower.startsWith("shruthi ")) {
                            noraConversationActive = true;
                            clearPendingPartialWake();
                            interruptTaraSpeechForWake();
                            dispatchTaraTranscriptDebounced(canonical);
                            return;
                        }
                    }
                    return;
                }

                // If the user continues past the wake name into a command, cancel
                // the standalone-wake acknowledgement and let final/segment results
                // deliver the complete command without Shruthi speaking over them.
                for (String match : matches) {
                    if (match == null || match.trim().isEmpty()) continue;
                    String canonical = canonicalizeNoraTranscript(match);
                    String lower = canonical.trim().toLowerCase(Locale.ROOT);
                    if (lower.startsWith("shruthi ")) {
                        noraConversationActive = true;
                        clearPendingPartialWake();
                        return;
                    }
                }

                // Partial callbacks are not guaranteed, but when Samsung supplies
                // one for a standalone wake we can react even before the silence
                // segment/final callback arrives.
                for (String match : matches) {
                    if (isSimpleNoraWakePhrase(match)) {
                        noraConversationActive = true;
                        if (!taraPartialWakeDispatched) {
                            taraPartialWakeDispatched = true;
                            taraPendingPartialWakeText = "SHRUTHI";
                            taraHandler.removeCallbacks(taraPartialWakeDispatchRunnable);
                            taraHandler.postDelayed(taraPartialWakeDispatchRunnable, 500L);
                        }
                        return;
                    }
                }
            }

            @Override
            public void onSegmentResults(Bundle segmentResults) {
                clearPendingPartialWake();
                processNoraRecognitionBundle(segmentResults);
                taraConsecutiveErrors = 0;
                taraListening = true;
            }

            @Override
            public void onEndOfSegmentedSession() {
                taraHandler.removeCallbacks(taraStartWatchdogRunnable);
                clearPendingPartialWake();
                taraListening = false;
                taraReadyForSpeech = false;
                taraConsecutiveErrors = 0;
                scheduleTaraRestart(noraConversationActive ? 700L : 1200L);
            }

            @Override public void onEvent(int eventType, Bundle params) { }
        });
    }

    private void processNoraRecognitionBundle(Bundle results) {
        ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return;

        for (String match : matches) {
            if (match == null || match.trim().isEmpty()) continue;
            String canonical = canonicalizeNoraTranscript(match);
            String lower = canonical.trim().toLowerCase(Locale.ROOT);
            boolean explicitWake = lower.equals("shruthi") || lower.startsWith("shruthi ");

            // Keep the microphone alive during TTS, but ignore ordinary recognition
            // while Shruthi is speaking so her own voice cannot recursively trigger
            // commands. An explicit Shruthi/Nora wake is the safe barge-in signal.
            if (taraSpeaking) {
                if (!explicitWake) continue;
                noraConversationActive = true;
                interruptTaraSpeechForWake();
            } else if (explicitWake) {
                noraConversationActive = true;
            } else if (!noraConversationActive) {
                // Android returns recognition alternatives in ranked order. A Samsung
                // recognizer may put a near-match first and Shruthi/NORA second.
                // Check every candidate before deciding this was ambient speech.
                continue;
            } else {
                // During an active conversation there is no timeout. Prefix each
                // follow-up so the web assistant treats it as the current Shruthi turn.
                canonical = "SHRUTHI " + canonical;
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
        String[] shruthiVariants = new String[]{"shruthi", "sruthi", "shruti"};
        for (String variant : shruthiVariants) {
            if (normalized.equals(variant) || normalized.equals("hey " + variant)) return "SHRUTHI";
            if (normalized.startsWith(variant + " ")) return "SHRUTHI " + clean.substring(variant.length()).trim();
            String heyVariant = "hey " + variant + " ";
            if (normalized.startsWith(heyVariant)) return "SHRUTHI " + clean.substring(heyVariant.length()).trim();
        }
        if (normalized.equals("ശ്രുതി") || normalized.equals("ஸ்ருதி")) return "SHRUTHI";
        if (normalized.startsWith("ശ്രുതി ")) return "SHRUTHI " + clean.substring("ശ്രുതി".length()).trim();
        if (normalized.startsWith("ஸ்ருதி ")) return "SHRUTHI " + clean.substring("ஸ்ருதி".length()).trim();

        // NORA remains a narrow legacy alias. Tara/Thara are intentionally not
        // wake aliases because unrelated speech can resemble those words.
        String[] noraVariants = new String[]{"nora", "norah", "noora", "noura", "norra", "nora's"};
        for (String variant : noraVariants) {
            if (normalized.equals(variant) || normalized.equals("hey " + variant)) return "SHRUTHI";
            if (normalized.startsWith(variant + " ")) return "SHRUTHI " + clean.substring(variant.length()).trim();
            String heyVariant = "hey " + variant + " ";
            if (normalized.startsWith(heyVariant)) return "SHRUTHI " + clean.substring(heyVariant.length()).trim();
        }
        if (normalized.equals("നോറ") || normalized.equals("നോറാ") || normalized.equals("நோரா")) return "SHRUTHI";
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
        noraConversationActive = true;
        dispatchTaraTranscriptDebounced(wakeText);
    }

    private void clearPendingPartialWake() {
        taraHandler.removeCallbacks(taraPartialWakeDispatchRunnable);
        taraPendingPartialWakeText = "";
        taraPartialWakeDispatched = false;
    }

    /**
     * Barge-in helper for a spoken SHRUTHI/NORA wake while assistant audio is
     * playing. The WebView's existing Mute button owns every TTS backend
     * (cloud Audio, browser speechSynthesis and native TTS), so briefly toggling
     * it off and back on stops the current reply without permanently muting the
     * assistant. The wake transcript is then handled by the normal web listener.
     */
    private void interruptTaraSpeechForWake() {
        if (!taraSpeaking) return;
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;
        String script = "(function(){try{var b=document.querySelector('button[aria-label=\"Mute SHRUTHI\"]');if(!b)return;b.click();setTimeout(function(){var r=document.querySelector('button[aria-label=\"Enable SHRUTHI voice\"]');if(r)r.click();},140);}catch(e){}})();";
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
        scheduleTaraRestart(300L);
    }

    public void setNoraConversationActive(boolean active) {
        noraConversationActive = active;
        if (!active) clearPendingPartialWake();
        if (taraEnabled && taraResumed && !taraSpeaking && !taraListening) {
            scheduleTaraRestart(active ? 450L : 900L);
        }
    }

    public void setTaraSpeaking(boolean speaking) {
        taraSpeaking = speaking;

        // On Android 13+ keep the segmented recognizer alive while Shruthi speaks.
        // Recognition callbacks are filtered above so only an explicit wake name can
        // barge in; ordinary speaker output is ignored and cannot loop back as input.
        if (taraSegmentedSession && taraListening) return;

        if (speaking) stopTaraRecognizer();
        else if (!taraListening) scheduleTaraRestart(noraConversationActive ? 600L : 1000L);
    }

    private void startTaraRecognizerIfReady() {
        if (!taraEnabled || !taraResumed || taraSpeaking || taraListening) return;
        if (taraRecognizer == null) setupTaraRecognizer();
        if (taraRecognizer == null || taraRecognizerIntent == null) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;

        try {
            taraHandler.removeCallbacks(taraRestartRunnable);
            taraHandler.removeCallbacks(taraStartWatchdogRunnable);
            clearPendingPartialWake();
            taraReadyForSpeech = false;
            taraRecognizer.startListening(taraRecognizerIntent);
            taraListening = true;
            // startListening() can return successfully even when Samsung has handed
            // us a stale recognizer after an app switch. If onReadyForSpeech never
            // arrives, recycle the recognizer instead of remaining silently stuck.
            taraHandler.postDelayed(taraStartWatchdogRunnable, 3500L);
        } catch (Exception ignored) {
            taraListening = false;
            taraReadyForSpeech = false;
            taraConsecutiveErrors += 1;
            destroyTaraRecognizer();
            scheduleTaraRestart(Math.min(12000L, 2200L + (taraConsecutiveErrors * 1000L)));
        }
    }

    private void recoverStalledTaraStart() {
        if (!taraEnabled || !taraResumed || taraSpeaking || !taraListening || taraReadyForSpeech) return;
        taraConsecutiveErrors += 1;
        if (taraUsingOnDeviceRecognizer && taraConsecutiveErrors >= 2) {
            taraForceNetworkRecognizer = true;
        }
        destroyTaraRecognizer();
        scheduleTaraRestart(noraConversationActive ? 600L : 1200L);
    }

    private void scheduleTaraRestart(long delayMs) {
        taraHandler.removeCallbacks(taraRestartRunnable);
        if (!taraEnabled || !taraResumed || taraSpeaking || taraListening) return;
        long minimumDelay = noraConversationActive ? 450L : 900L;
        taraHandler.postDelayed(taraRestartRunnable, Math.max(minimumDelay, delayMs));
    }

    private void stopTaraRecognizer() {
        taraHandler.removeCallbacks(taraRestartRunnable);
        taraHandler.removeCallbacks(taraStartWatchdogRunnable);
        clearPendingPartialWake();
        taraListening = false;
        taraReadyForSpeech = false;
        if (taraRecognizer != null) {
            try { taraRecognizer.cancel(); } catch (Exception ignored) { }
        }
    }

    private void destroyTaraRecognizer() {
        taraHandler.removeCallbacks(taraRestartRunnable);
        taraHandler.removeCallbacks(taraStartWatchdogRunnable);
        clearPendingPartialWake();
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

        // Suppress duplicate callbacks, but never drop a full wake+command result
        // merely because the partial standalone wake arrived milliseconds first.
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
        if (taraEnabled
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                && (taraRecognizer == null || taraRecognizerIntent == null)) {
            setupTaraRecognizer();
        }
        scheduleTaraRestart(noraConversationActive ? 450L : 900L);
    }

    @Override
    public void onPause() {
        taraResumed = false;
        clearPendingPartialWake();
        // Android only grants this app microphone access while it is foregrounded.
        // Destroy the recognizer here so Samsung/Bixby cannot leave a cancelled,
        // non-responsive SpeechRecognizer instance behind for the next resume.
        // Conversation state is preserved and the recognizer is rebuilt on resume.
        destroyTaraRecognizer();
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
            if (taraEnabled && taraResumed) setupTaraRecognizer();
            scheduleTaraRestart(600L);
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
