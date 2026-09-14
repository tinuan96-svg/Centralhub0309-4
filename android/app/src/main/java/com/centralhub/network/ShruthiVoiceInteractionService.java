package com.centralhub.network;

import android.Manifest;
import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.service.voice.VoiceInteractionService;
import android.service.voice.VoiceInteractionSession;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;

/** Lightweight default-assistant service for the Shruthi wake phrase while CentralHub is not foreground. */
public final class ShruthiVoiceInteractionService extends VoiceInteractionService {
    private static final String ARG_TRANSCRIPT = "shruthi_transcript";
    private static final long WAKE_COOLDOWN_MS = 2500L;
    private static final String PRIMARY_RECOGNITION_LANGUAGE = "en-IN";
    private static final String[] SHRUTHI_VARIANTS = new String[]{
            "shruthi", "shruti", "sruthi", "sruti", "shrudhi", "srudhi",
            "shrewthi", "shrewti", "shrew tea", "shru thi", "shru ti",
            "shroothi", "shrooti", "shroo thi", "shroo ti"
    };
    private static final ArrayList<String> LANGUAGE_ALLOWLIST = new ArrayList<>(Arrays.asList(
            "en-IN", "en-GB", "ml-IN", "ta-IN"
    ));
    private static final ArrayList<String> BIAS_PHRASES = new ArrayList<>(Arrays.asList(
            "Shruthi", "Shruti", "Sruthi", "Sruti", "Shrudhi", "Srudhi",
            "Shrewthi", "Shrew tea", "Shru thi", "Shru ti", "Shroothi", "Shrooti",
            "Hey Shruthi", "Hey Shruti", "Hey Sruthi",
            "ശ്രുതി", "ശ്രൂതി", "ஸ்ருதி", "ஸ்ரூதி",
            "CentralHub", "MalluSpices", "KeralaGrocery", "PocketGrocery", "TamilRetail",
            "DHL", "D H L", "WhatsApp", "Supabase", "Netlify", "Mollie", "Trust Payments",
            "Google Ads", "Google Analytics", "Merchant Center"
    ));

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable restartRunnable = this::startListeningIfReady;
    private final Runnable pendingWakeRunnable = this::dispatchPendingWake;
    private SpeechRecognizer recognizer;
    private Intent recognizerIntent;
    private boolean listening = false;
    private boolean usingOnDeviceRecognizer = false;
    private boolean languageSwitchEnabled = true;
    private boolean forceNetworkRecognizer = false;
    private boolean uiForeground = false;
    private boolean serviceReady = false;
    private boolean destroyed = false;
    private long ignoreUntil = 0L;
    private String pendingWake = "";

    private final Application.ActivityLifecycleCallbacks activityCallbacks = new Application.ActivityLifecycleCallbacks() {
        @Override public void onActivityCreated(Activity activity, Bundle state) { }
        @Override public void onActivityStarted(Activity activity) { }
        @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) { }
        @Override public void onActivityDestroyed(Activity activity) { }
        @Override public void onActivityResumed(Activity activity) {
            if (!(activity instanceof MainActivity)) return;
            uiForeground = true;
            stopRecognizer();
        }
        @Override public void onActivityPaused(Activity activity) {
            if (!(activity instanceof MainActivity)) return;
            uiForeground = false;
            scheduleRestart(650L);
        }
        @Override public void onActivityStopped(Activity activity) {
            if (!(activity instanceof MainActivity)) return;
            uiForeground = false;
            scheduleRestart(500L);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        getApplication().registerActivityLifecycleCallbacks(activityCallbacks);
    }

    @Override public void onReady() {
        super.onReady();
        if (destroyed) return;
        serviceReady = true;
        setupRecognizer();
        scheduleRestart(450L);
    }

    @Override public void onShutdown() {
        serviceReady = false;
        destroyRecognizer();
        super.onShutdown();
    }

    @Override public void onDestroy() {
        destroyed = true;
        serviceReady = false;
        handler.removeCallbacksAndMessages(null);
        destroyRecognizer();
        try { getApplication().unregisterActivityLifecycleCallbacks(activityCallbacks); } catch (Exception ignored) { }
        super.onDestroy();
    }

    private void setupRecognizer() {
        destroyRecognizer();
        if (destroyed
                || uiForeground
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                || !SpeechRecognizer.isRecognitionAvailable(this)) return;

        if (!forceNetworkRecognizer
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
            try {
                recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
                usingOnDeviceRecognizer = recognizer != null;
            } catch (Exception ignored) {
                recognizer = null;
            }
        }
        if (recognizer == null) {
            try {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
                usingOnDeviceRecognizer = false;
            } catch (Exception ignored) {
                recognizer = null;
            }
        }
        if (recognizer == null) return;

        recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 8);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, PRIMARY_RECOGNITION_LANGUAGE);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, PRIMARY_RECOGNITION_LANGUAGE);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, usingOnDeviceRecognizer);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            recognizerIntent.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, new ArrayList<>(BIAS_PHRASES));
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_ENABLE_BIASING_DEVICE_CONTEXT, true);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && languageSwitchEnabled) {
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_ENABLE_LANGUAGE_DETECTION, true);
            recognizerIntent.putStringArrayListExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES,
                    new ArrayList<>(LANGUAGE_ALLOWLIST)
            );
            recognizerIntent.putExtra(
                    RecognizerIntent.EXTRA_ENABLE_LANGUAGE_SWITCH,
                    RecognizerIntent.LANGUAGE_SWITCH_BALANCED
            );
            recognizerIntent.putStringArrayListExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES,
                    new ArrayList<>(LANGUAGE_ALLOWLIST)
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_SWITCH_MAX_SWITCHES, 3);
            }
        }

        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 450L);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 650L);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1050L);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && usingOnDeviceRecognizer) {
            recognizerIntent.putExtra(
                    RecognizerIntent.EXTRA_SEGMENTED_SESSION,
                    RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS
            );
        }

        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { listening = true; }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onEvent(int eventType, Bundle params) { }

            @Override public void onError(int error) {
                listening = false;
                clearPendingWake();
                if (!serviceReady || uiForeground || destroyed || error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) return;

                if (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED
                        || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) {
                    if (languageSwitchEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        languageSwitchEnabled = false;
                        destroyRecognizer();
                        scheduleRestart(500L);
                        return;
                    }
                    if (usingOnDeviceRecognizer) {
                        forceNetworkRecognizer = true;
                        destroyRecognizer();
                        scheduleRestart(700L);
                        return;
                    }
                    scheduleRestart(3500L);
                    return;
                }

                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                        || error == SpeechRecognizer.ERROR_CLIENT
                        || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                        && error == SpeechRecognizer.ERROR_SERVER_DISCONNECTED)) {
                    destroyRecognizer();
                    scheduleRestart(1200L);
                    return;
                }
                scheduleRestart(error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? 700L : 1400L);
            }

            @Override public void onResults(Bundle results) {
                listening = false;
                handleMatches(results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION), true);
                scheduleRestart(650L);
            }

            @Override public void onPartialResults(Bundle partialResults) {
                handleMatches(partialResults == null ? null : partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION), false);
            }

            @Override public void onSegmentResults(Bundle segmentResults) {
                handleMatches(segmentResults == null ? null : segmentResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION), true);
            }

            @Override public void onEndOfSegmentedSession() {
                listening = false;
                scheduleRestart(650L);
            }
        });
    }

    private void handleMatches(ArrayList<String> matches, boolean isFinal) {
        if (matches == null || matches.isEmpty() || uiForeground || System.currentTimeMillis() < ignoreUntil) return;
        for (String raw : matches) {
            String canonical = canonicalizeWake(raw);
            if (canonical.isEmpty()) continue;
            String lower = canonical.toLowerCase(Locale.ROOT);
            if (lower.startsWith("shruthi ")) {
                clearPendingWake();
                triggerAssistant(canonical);
                return;
            }
            if (!lower.equals("shruthi")) continue;
            pendingWake = "SHRUTHI";
            handler.removeCallbacks(pendingWakeRunnable);
            handler.postDelayed(pendingWakeRunnable, isFinal ? 80L : 340L);
            return;
        }
    }

    private void dispatchPendingWake() {
        String wake = pendingWake;
        pendingWake = "";
        if (wake.isEmpty() || uiForeground || System.currentTimeMillis() < ignoreUntil) return;
        triggerAssistant(wake);
    }

    private void triggerAssistant(String transcript) {
        if (!serviceReady || destroyed || uiForeground) return;
        ignoreUntil = System.currentTimeMillis() + WAKE_COOLDOWN_MS;
        stopRecognizer();
        Bundle args = new Bundle();
        args.putString(ARG_TRANSCRIPT, transcript == null || transcript.trim().isEmpty() ? "SHRUTHI" : transcript.trim());
        try {
            showSession(args, VoiceInteractionSession.SHOW_WITH_ASSIST);
        } catch (Exception ignored) {
            scheduleRestart(1200L);
        }
    }

    private String canonicalizeWake(String raw) {
        if (raw == null) return "";
        String clean = raw.trim();
        if (clean.isEmpty()) return "";
        String lower = clean.toLowerCase(Locale.ROOT);

        for (String name : SHRUTHI_VARIANTS) {
            if (lower.equals(name) || lower.equals("hey " + name)) return "SHRUTHI";
            if (lower.startsWith(name + " ")) return "SHRUTHI " + clean.substring(name.length()).trim();
            String hey = "hey " + name + " ";
            if (lower.startsWith(hey)) return "SHRUTHI " + clean.substring(hey.length()).trim();
        }

        String[] nativeNames = new String[]{"ശ്രുതി", "ശ്രൂതി", "ஸ்ருதி", "ஸ்ரூதி"};
        for (String name : nativeNames) {
            if (lower.equals(name)) return "SHRUTHI";
            if (lower.startsWith(name + " ")) return "SHRUTHI " + clean.substring(name.length()).trim();
        }

        // Legacy NORA aliases are kept only as a compatibility fallback for already-installed
        // flows. They are intentionally NOT bias phrases; Shruthi is the only promoted wake name.
        String[] legacyNames = new String[]{"nora", "norah", "noora", "noura", "norra", "നോറ", "നോറാ", "நோரா"};
        for (String name : legacyNames) {
            if (lower.equals(name) || lower.equals("hey " + name)) return "SHRUTHI";
            if (lower.startsWith(name + " ")) return "SHRUTHI " + clean.substring(name.length()).trim();
            String hey = "hey " + name + " ";
            if (lower.startsWith(hey)) return "SHRUTHI " + clean.substring(hey.length()).trim();
        }
        return "";
    }

    private void startListeningIfReady() {
        if (!serviceReady || destroyed || uiForeground || listening) return;
        if (System.currentTimeMillis() < ignoreUntil) {
            scheduleRestart(ignoreUntil - System.currentTimeMillis() + 100L);
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        if (recognizer == null || recognizerIntent == null) setupRecognizer();
        if (recognizer == null || recognizerIntent == null || uiForeground) return;
        try {
            recognizer.startListening(recognizerIntent);
            listening = true;
        } catch (Exception ignored) {
            listening = false;
            destroyRecognizer();
            scheduleRestart(1200L);
        }
    }

    private void scheduleRestart(long delayMs) {
        handler.removeCallbacks(restartRunnable);
        if (!serviceReady || destroyed || uiForeground || listening) return;
        handler.postDelayed(restartRunnable, Math.max(350L, delayMs));
    }

    private void stopRecognizer() {
        handler.removeCallbacks(restartRunnable);
        clearPendingWake();
        listening = false;
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) { }
        }
    }

    private void destroyRecognizer() {
        stopRecognizer();
        if (recognizer != null) {
            try { recognizer.destroy(); } catch (Exception ignored) { }
        }
        recognizer = null;
        recognizerIntent = null;
        usingOnDeviceRecognizer = false;
    }

    private void clearPendingWake() {
        handler.removeCallbacks(pendingWakeRunnable);
        pendingWake = "";
    }
}
