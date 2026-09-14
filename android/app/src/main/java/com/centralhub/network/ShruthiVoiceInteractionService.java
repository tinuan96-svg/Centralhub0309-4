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

/** Lightweight default-assistant service for Shruthi/Nora wake while CentralHub UI is not foreground. */
public final class ShruthiVoiceInteractionService extends VoiceInteractionService {
    private static final String ARG_TRANSCRIPT = "shruthi_transcript";
    private static final long WAKE_COOLDOWN_MS = 2500L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable restartRunnable = this::startListeningIfReady;
    private final Runnable pendingWakeRunnable = this::dispatchPendingWake;
    private SpeechRecognizer recognizer;
    private Intent recognizerIntent;
    private boolean listening = false;
    private boolean usingOnDeviceRecognizer = false;
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
        if (destroyed || uiForeground || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED || !SpeechRecognizer.isRecognitionAvailable(this)) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
            try { recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this); usingOnDeviceRecognizer = recognizer != null; } catch (Exception ignored) { recognizer = null; }
        }
        if (recognizer == null) {
            try { recognizer = SpeechRecognizer.createSpeechRecognizer(this); usingOnDeviceRecognizer = false; } catch (Exception ignored) { recognizer = null; }
        }
        if (recognizer == null) return;
        recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-GB");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-GB");
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, usingOnDeviceRecognizer);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            recognizerIntent.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, new ArrayList<>(Arrays.asList(
                    "Shruthi", "Sruthi", "Shruti", "Hey Shruthi", "Hey Sruthi", "Hey Shruti",
                    "Nora", "Norah", "Noora", "Noura", "Hey Nora", "Hey NORA",
                    "ശ്രുതി", "നോറ", "നോറാ", "ஸ்ருதி", "நோரா")));
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_ENABLE_BIASING_DEVICE_CONTEXT, true);
        }
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 400L);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 500L);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 850L);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && usingOnDeviceRecognizer) {
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS);
        }
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { listening = true; }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onEvent(int eventType, Bundle params) { }
            @Override public void onError(int error) {
                listening = false; clearPendingWake();
                if (!serviceReady || uiForeground || destroyed || error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) return;
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && error == SpeechRecognizer.ERROR_SERVER_DISCONNECTED)) {
                    destroyRecognizer(); scheduleRestart(1200L); return;
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
            @Override public void onEndOfSegmentedSession() { listening = false; scheduleRestart(650L); }
        });
    }

    private void handleMatches(ArrayList<String> matches, boolean isFinal) {
        if (matches == null || matches.isEmpty() || uiForeground || System.currentTimeMillis() < ignoreUntil) return;
        for (String raw : matches) {
            String canonical = canonicalizeWake(raw);
            if (canonical.isEmpty()) continue;
            String lower = canonical.toLowerCase(Locale.ROOT);
            if (lower.startsWith("shruthi ")) { clearPendingWake(); triggerAssistant(canonical); return; }
            if (!lower.equals("shruthi")) continue;
            pendingWake = "SHRUTHI";
            handler.removeCallbacks(pendingWakeRunnable);
            handler.postDelayed(pendingWakeRunnable, isFinal ? 80L : 380L);
            return;
        }
    }
    private void dispatchPendingWake() {
        String wake = pendingWake; pendingWake = "";
        if (wake.isEmpty() || uiForeground || System.currentTimeMillis() < ignoreUntil) return;
        triggerAssistant(wake);
    }
    private void triggerAssistant(String transcript) {
        if (!serviceReady || destroyed || uiForeground) return;
        ignoreUntil = System.currentTimeMillis() + WAKE_COOLDOWN_MS;
        stopRecognizer();
        Bundle args = new Bundle();
        args.putString(ARG_TRANSCRIPT, transcript == null || transcript.trim().isEmpty() ? "SHRUTHI" : transcript.trim());
        try { showSession(args, VoiceInteractionSession.SHOW_WITH_ASSIST); } catch (Exception ignored) { scheduleRestart(1200L); }
    }
    private String canonicalizeWake(String raw) {
        if (raw == null) return "";
        String clean = raw.trim(); if (clean.isEmpty()) return ""; String lower = clean.toLowerCase(Locale.ROOT);
        String[] shruthi = {"shruthi", "sruthi", "shruti"};
        for (String name : shruthi) {
            if (lower.equals(name) || lower.equals("hey " + name)) return "SHRUTHI";
            if (lower.startsWith(name + " ")) return "SHRUTHI " + clean.substring(name.length()).trim();
            String hey = "hey " + name + " "; if (lower.startsWith(hey)) return "SHRUTHI " + clean.substring(hey.length()).trim();
        }
        String[] nora = {"nora", "norah", "noora", "noura", "norra"};
        for (String name : nora) {
            if (lower.equals(name) || lower.equals("hey " + name)) return "SHRUTHI";
            if (lower.startsWith(name + " ")) return "SHRUTHI " + clean.substring(name.length()).trim();
            String hey = "hey " + name + " "; if (lower.startsWith(hey)) return "SHRUTHI " + clean.substring(hey.length()).trim();
        }
        if (lower.equals("ശ്രുതി") || lower.equals("ஸ்ருதி") || lower.equals("നോറ") || lower.equals("നോറാ") || lower.equals("நோரா")) return "SHRUTHI";
        return "";
    }
    private void startListeningIfReady() {
        if (!serviceReady || destroyed || uiForeground || listening) return;
        if (System.currentTimeMillis() < ignoreUntil) { scheduleRestart(ignoreUntil - System.currentTimeMillis() + 100L); return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        if (recognizer == null || recognizerIntent == null) setupRecognizer();
        if (recognizer == null || recognizerIntent == null || uiForeground) return;
        try { recognizer.startListening(recognizerIntent); listening = true; } catch (Exception ignored) { listening = false; destroyRecognizer(); scheduleRestart(1200L); }
    }
    private void scheduleRestart(long delayMs) {
        handler.removeCallbacks(restartRunnable);
        if (!serviceReady || destroyed || uiForeground || listening) return;
        handler.postDelayed(restartRunnable, Math.max(350L, delayMs));
    }
    private void stopRecognizer() {
        handler.removeCallbacks(restartRunnable); clearPendingWake(); listening = false;
        if (recognizer != null) try { recognizer.cancel(); } catch (Exception ignored) { }
    }
    private void destroyRecognizer() {
        stopRecognizer();
        if (recognizer != null) try { recognizer.destroy(); } catch (Exception ignored) { }
        recognizer = null; recognizerIntent = null; usingOnDeviceRecognizer = false;
    }
    private void clearPendingWake() { handler.removeCallbacks(pendingWakeRunnable); pendingWake = ""; }
}
