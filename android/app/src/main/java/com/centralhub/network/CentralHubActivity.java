package com.centralhub.network;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * CentralHub launcher.
 *
 * Android 13+ keeps one app-owned AudioRecord session open while CentralHub is
 * foreground and feeds PCM into SpeechRecognizer with EXTRA_AUDIO_SOURCE. This
 * prevents Samsung from repeatedly taking/releasing the physical microphone on
 * every recognition segment, which is what produced the paired system beeps.
 */
public final class CentralHubActivity extends MainActivity {
    private static final String CENTRALHUB_HOST = "centralhub.network";
    private static final String CENTRALHUB_FALLBACK = "https://centralhub.network/dashboard";
    private static final int REQUEST_CONTINUOUS_AUDIO = 5102;
    private static final int SAMPLE_RATE = 16000;

    private static final String[] SHRUTHI_ALIASES = {
            "shruthi", "shruti", "sruthi", "sruti", "shrudhi", "srudhi",
            "shrewthi", "shrewti", "shrew tea", "shru thi", "shru ti",
            "shroothi", "shrooti", "shroo thi", "shroo ti",
            "sudhi", "sudi", "suthi", "shudi", "shuti", "sweetie", "sweety",
            "ശ്രുതി", "ശ്രൂതി", "ஸ்ருதி", "ஸ்ரூதி"
    };
    private static final String[] TINU_ALIASES = {
            "tinu", "tino", "teenu", "tenu", "jinu", "jino", "ginu", "chino", "cheenu"
    };
    private static final ArrayList<String> BIAS = new ArrayList<>(Arrays.asList(
            "Shruthi", "Shruti", "Sruthi", "Sruti", "Sudhi", "Sweetie",
            "Hi Shruthi", "Hi Shruthi this is Tinu", "This is Tinu",
            "Tinu", "Teenu", "Jinu", "Ginu", "Chino",
            "ശ്രുതി", "ശ്രൂതി", "ஸ்ருதி", "ஸ்ரூதி",
            "CentralHub", "MalluSpices", "KeralaGrocery", "PocketGrocery", "TamilRetail",
            "DHL", "WhatsApp", "Supabase", "Netlify", "Google Analytics",
            "stop", "wait", "pause", "continue", "repeat", "next", "picked", "done", "back", "previous", "resume"
    ));

    private final Handler voiceHandler = new Handler(Looper.getMainLooper());
    private final Runnable restartRecognizer = this::startRecognizerSession;
    private final Object sinkLock = new Object();

    private boolean continuousEnabled;
    private boolean continuousResumed;
    private boolean conversationActive;
    private boolean shruthiSpeaking;
    private boolean legacyMode;

    private AudioRecord audioRecord;
    private Thread audioThread;
    private volatile boolean audioRunning;
    private NoiseSuppressor noiseSuppressor;
    private AcousticEchoCanceler echoCanceler;

    private SpeechRecognizer recognizer;
    private boolean recognizerListening;
    private ParcelFileDescriptor recognizerReadFd;
    private OutputStream recognizerSink;

    private long ignoreWakeUntil;
    private long lastTranscriptAt;
    private long lastBargeInAt;
    private String lastTranscript = "";
    private String speechContext = "";

    private AudioManager audioManager;
    private int oldAudioMode = AudioManager.MODE_NORMAL;
    private int oldMusicVolume = -1;
    private boolean communicationProfile;
    private volatile boolean realtimeVoiceActive;
    private volatile boolean realtimeVoiceStarting;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        super.setTaraEnabled(false);
    }

    @Override
    public boolean isTaraVoiceAvailable() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return super.isTaraVoiceAvailable();
        }
        return SpeechRecognizer.isRecognitionAvailable(this);
    }

    @Override
    public void setTaraEnabled(boolean enabled) {
        // Respect the picking screen's explicit microphone state, not the global wake UI.
        if (isPickingVoiceModeActive() && enabled != isPickingRecognitionRequested()) return;
        continuousEnabled = enabled;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            legacyMode = true;
            super.setTaraEnabled(enabled);
            return;
        }
        legacyMode = false;
        if (!enabled) {
            conversationActive = false;
            ignoreWakeUntil = System.currentTimeMillis() + 900L;
            stopContinuousPipeline();
            super.setNoraConversationActive(false);
            restoreCommunicationProfile();
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_CONTINUOUS_AUDIO);
            return;
        }
        startContinuousPipeline();
    }

    @Override
    public void setNoraConversationActive(boolean active) {
        if (legacyMode) {
            super.setNoraConversationActive(active);
            return;
        }
        conversationActive = active;
        if (active) ignoreWakeUntil = 0L;
        else {
            ignoreWakeUntil = System.currentTimeMillis() + 900L;
            lastTranscript = "";
            lastTranscriptAt = 0L;
            restoreCommunicationProfile();
        }
        super.setNoraConversationActive(active);
        if (continuousEnabled && continuousResumed) startContinuousPipeline();
    }

    @Override
    public boolean isNoraConversationActive() {
        return legacyMode ? super.isNoraConversationActive() : conversationActive;
    }

    @Override
    public void setTaraSpeechContext(String text) {
        speechContext = text == null ? "" : text.trim();
        super.setTaraSpeechContext(text);
    }

    @Override
    public void setTaraSpeaking(boolean speaking) {
        if (legacyMode) {
            super.setTaraSpeaking(speaking);
            return;
        }
        shruthiSpeaking = speaking;
        if (speaking) enableCommunicationProfile();
        super.setTaraSpeaking(speaking);
        if (!speaking) restoreCommunicationProfile();
    }

    @Override
    public boolean startShruthiRealtime(String accessToken,String supabaseUrl,String publishableKey) {
        realtimeVoiceStarting=true;
        realtimeVoiceActive=true;
        // Let the hardware volume keys control Shruthi's MEDIA speech output.
        // Never set the user's system volume automatically.
        runOnUiThread(() -> {
            setVolumeControlStream(AudioManager.STREAM_MUSIC);
            stopContinuousPipeline();
        });
        boolean started;
        try{started=super.startShruthiRealtime(accessToken,supabaseUrl,publishableKey);}
        finally{realtimeVoiceStarting=false;}
        realtimeVoiceActive=started;
        if(!started)runOnUiThread(this::startContinuousPipeline);
        return started;
    }

    @Override
    public void stopShruthiRealtime() {
        super.stopShruthiRealtime();
        if(!realtimeVoiceStarting){
            realtimeVoiceActive=false;
            if(continuousEnabled&&continuousResumed)runOnUiThread(this::startContinuousPipeline);
        }
    }

    private void startContinuousPipeline() {
        // A second SpeechRecognizer/AudioRecord competes with the Realtime stream
        // and can transcribe Shruthi's own output instead of the user's speech.
        if (legacyMode || !continuousEnabled || !continuousResumed || realtimeVoiceActive || realtimeVoiceStarting) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        if (audioRecord == null) startAudioRecord();
        if (audioRecord != null && !recognizerListening) startRecognizerSession();
    }

    private void startAudioRecord() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || audioRecord != null) return;
        try {
            int min = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (min <= 0) min = SAMPLE_RATE * 2;
            AudioFormat format = new AudioFormat.Builder()
                    .setSampleRate(SAMPLE_RATE)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                    .build();
            AudioRecord record = new AudioRecord.Builder()
                    .setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(Math.max(min * 2, SAMPLE_RATE * 2))
                    .build();
            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                record.release();
                return;
            }
            if (NoiseSuppressor.isAvailable()) {
                try { noiseSuppressor = NoiseSuppressor.create(record.getAudioSessionId()); } catch (Exception ignored) { }
            }
            if (AcousticEchoCanceler.isAvailable()) {
                try { echoCanceler = AcousticEchoCanceler.create(record.getAudioSessionId()); } catch (Exception ignored) { }
            }
            record.startRecording();
            audioRecord = record;
            audioRunning = true;
            audioThread = new Thread(this::pumpAudio, "CentralHub-Shruthi-Audio");
            audioThread.setDaemon(true);
            audioThread.start();
        } catch (Exception ignored) {
            stopAudioRecord();
        }
    }

    private void pumpAudio() {
        byte[] buffer = new byte[4096];
        while (audioRunning) {
            AudioRecord record = audioRecord;
            if (record == null) break;
            int count;
            try { count = record.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING); }
            catch (Exception ignored) { break; }
            if (count <= 0) continue;
            OutputStream sink;
            synchronized (sinkLock) { sink = recognizerSink; }
            if (sink == null) continue;
            try { sink.write(buffer, 0, count); }
            catch (Exception ignored) {
                synchronized (sinkLock) { if (recognizerSink == sink) recognizerSink = null; }
                try { sink.close(); } catch (Exception ignoredAgain) { }
            }
        }
    }

    private void startRecognizerSession() {
        voiceHandler.removeCallbacks(restartRecognizer);
        if (legacyMode || !continuousEnabled || !continuousResumed || recognizerListening) return;
        if (audioRecord == null) {
            startAudioRecord();
            if (audioRecord == null) return;
        }
        destroyRecognizerOnly();
        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            if (recognizer == null) return;
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {
                    recognizerListening = true;
                    dispatchPickingRecognizerReady();
                }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float rmsdB) { }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { }
                @Override public void onEvent(int eventType, Bundle params) { }
                @Override public void onError(int error) {
                    recognizerListening = false;
                    closeRecognizerPipe();
                    if (!continuousEnabled || !continuousResumed) return;
                    long delay = (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) ? 650L : 1500L;
                    voiceHandler.postDelayed(restartRecognizer, delay);
                }
                @Override public void onResults(Bundle results) {
                    handleMatches(results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION), true);
                    recognizerListening = false;
                    closeRecognizerPipe();
                    if (continuousEnabled && continuousResumed) voiceHandler.postDelayed(restartRecognizer, 250L);
                }
                @Override public void onPartialResults(Bundle partialResults) {
                    handleMatches(partialResults == null ? null : partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION), false);
                }
                @Override public void onSegmentResults(Bundle segmentResults) {
                    handleMatches(segmentResults == null ? null : segmentResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION), true);
                    recognizerListening = true;
                }
                @Override public void onEndOfSegmentedSession() {
                    recognizerListening = false;
                    closeRecognizerPipe();
                    if (continuousEnabled && continuousResumed) voiceHandler.postDelayed(restartRecognizer, 250L);
                }
            });
            ParcelFileDescriptor[] pipe = ParcelFileDescriptor.createPipe();
            recognizerReadFd = pipe[0];
            OutputStream sink = new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1]);
            synchronized (sinkLock) { recognizerSink = sink; }
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 8);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-IN");
            intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, recognizerReadFd);
            intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1);
            intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
            intent.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, SAMPLE_RATE);
            intent.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE);
            intent.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, new ArrayList<>(BIAS));
            intent.putExtra(RecognizerIntent.EXTRA_ENABLE_BIASING_DEVICE_CONTEXT, true);
            recognizerListening = true;
            recognizer.startListening(intent);
        } catch (Exception ignored) {
            recognizerListening = false;
            closeRecognizerPipe();
            destroyRecognizerOnly();
            if (continuousEnabled && continuousResumed) voiceHandler.postDelayed(restartRecognizer, 1800L);
        }
    }

    private void handleMatches(ArrayList<String> matches, boolean finalResult) {
        if (matches == null || matches.isEmpty()) return;
        if (isPickingVoiceModeActive()) {
            if (!isPickingRecognitionRequested() || !finalResult || shruthiSpeaking) return;
            for (String raw : matches) {
                if (raw == null || raw.trim().isEmpty()) continue;
                // Route NORA's native transcription to the picking screen; the existing
                // deterministic picking workflow alone decides whether a pick is recorded.
                dispatchDebounced(raw.trim());
                return;
            }
            return;
        }
        if (shruthiSpeaking) { handleBargeIn(matches); return; }
        for (String raw : matches) {
            String canonical = canonicalize(raw);
            if (canonical.isEmpty()) continue;
            String lower = canonical.toLowerCase(Locale.ROOT);
            boolean wake = lower.equals("shruthi") || lower.startsWith("shruthi ");
            if (!wake) continue;
            if (!conversationActive && System.currentTimeMillis() < ignoreWakeUntil) continue;
            conversationActive = true;
            super.setNoraConversationActive(true);
            dispatchDebounced(canonical);
            return;
        }
        if (!conversationActive || !finalResult) return;
        for (String raw : matches) {
            String canonical = canonicalize(raw);
            if (canonical.isEmpty()) continue;
            dispatchDebounced(canonical.toLowerCase(Locale.ROOT).startsWith("shruthi") ? canonical : "SHRUTHI " + canonical);
            return;
        }
    }

    private void handleBargeIn(ArrayList<String> matches) {
        long now = System.currentTimeMillis();
        if (now - lastBargeInAt < 650L) return;
        for (String raw : matches) {
            String canonical = canonicalize(raw);
            if (canonical.isEmpty()) continue;
            String lower = canonical.toLowerCase(Locale.ROOT);
            boolean wake = lower.equals("shruthi") || lower.startsWith("shruthi ");
            String body = wake ? canonical.replaceFirst("(?i)^SHRUTHI\\s*", "").trim() : canonical;
            boolean control = isControl(body);
            if (!wake && !control && isEcho(canonical)) continue;
            if (!wake && !control && body.length() < 2) continue;
            lastBargeInAt = now;
            conversationActive = true;
            super.setNoraConversationActive(true);
            stopShruthiAudio();
            if (!isPause(body)) dispatchDebounced(wake ? canonical : "SHRUTHI " + canonical);
            return;
        }
    }

    private boolean isPause(String raw) {
        String v = normalized(raw);
        return v.equals("stop") || v.equals("stop it") || v.equals("wait") || v.equals("pause")
                || v.equals("hold on") || v.equals("enough") || v.equals("quiet") || v.equals("shh")
                || v.equals("മതി") || v.equals("നിർത്തു") || v.equals("நிறுத்து") || v.equals("போதும்");
    }

    private boolean isControl(String raw) {
        String v = normalized(raw);
        return isPause(v) || v.equals("next") || v.equals("no") || v.equals("yes") || v.equals("actually")
                || v.equals("continue") || v.equals("repeat") || v.equals("again") || v.equals("instead")
                || v.equals("why") || v.equals("what") || v.equals("how");
    }

    private boolean isEcho(String raw) {
        String heard = normalized(raw);
        String spoken = normalized(speechContext);
        if (heard.startsWith("shruthi ")) heard = heard.substring(8).trim();
        if (heard.isEmpty() || spoken.isEmpty()) return false;
        if (heard.length() >= 5 && spoken.contains(heard)) return true;
        String[] words = heard.split("\\s+");
        Set<String> spokenWords = new HashSet<>(Arrays.asList(spoken.split("\\s+")));
        int meaningful = 0, overlap = 0;
        for (String word : words) {
            if (word.length() < 2) continue;
            meaningful++;
            if (spokenWords.contains(word)) overlap++;
        }
        return meaningful > 0 && ((double) overlap / meaningful) >= 0.72d;
    }

    private String canonicalize(String raw) {
        if (raw == null) return "";
        String clean = raw.trim().replaceAll("\\s+", " ");
        if (clean.isEmpty()) return "";
        String candidate = clean.replaceFirst("(?iu)^(?:hi|hello|hey|ok|okay|please)\\s*[,!.-]*\\s+", "").trim();
        String lower = candidate.toLowerCase(Locale.ROOT);
        for (String alias : SHRUTHI_ALIASES) {
            String a = alias.toLowerCase(Locale.ROOT);
            if (lower.equals(a)) return "SHRUTHI";
            if (lower.startsWith(a + " ") || lower.startsWith(a + ",") || lower.startsWith(a + ".") || lower.startsWith(a + "!")) {
                String tail = candidate.substring(alias.length()).replaceFirst("^[\\s,.:;!?-]+", "").trim();
                return tail.isEmpty() ? "SHRUTHI" : "SHRUTHI " + normalizeTinu(tail);
            }
        }
        String[] old = {"nora", "norah", "noora", "noura", "norra", "നോറ", "നോറാ", "நோரா"};
        for (String alias : old) {
            String a = alias.toLowerCase(Locale.ROOT);
            if (lower.equals(a)) return "SHRUTHI";
            if (lower.startsWith(a + " ")) return "SHRUTHI " + normalizeTinu(candidate.substring(alias.length()).trim());
        }
        return normalizeTinu(clean);
    }

    private String normalizeTinu(String text) {
        String value = text;
        for (String alias : TINU_ALIASES) value = value.replaceAll("(?iu)\\b" + Pattern.quote(alias) + "\\b", "Tinu");
        return value;
    }

    private String normalized(String raw) {
        return raw == null ? "" : raw.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").replaceAll("\\s+", " ").trim();
    }

    private void dispatchDebounced(String text) {
        if (text == null || text.trim().isEmpty()) return;
        String clean = text.trim();
        long now = System.currentTimeMillis();
        if (clean.equalsIgnoreCase(lastTranscript) && now - lastTranscriptAt < 900L) return;
        lastTranscript = clean;
        lastTranscriptAt = now;
        WebView web = bridge == null ? null : bridge.getWebView();
        if (web == null) return;
        String js = "window.dispatchEvent(new CustomEvent('centralhub:tara-transcript',{detail:{text:" + JSONObject.quote(clean) + ",nativeContinuousMic:true}}));";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    private void stopShruthiAudio() {
        shruthiSpeaking = false;
        WebView web = bridge == null ? null : bridge.getWebView();
        if (web != null) {
            String js = "(function(){try{document.querySelectorAll('audio').forEach(function(a){a.pause();a.src='';});if(window.speechSynthesis)window.speechSynthesis.cancel();if(window.CentralHubNative&&window.CentralHubNative.stopTaraTts)window.CentralHubNative.stopTaraTts();}catch(e){}})();";
            web.post(() -> web.evaluateJavascript(js, null));
        }
        super.setTaraSpeaking(false);
        restoreCommunicationProfile();
    }

    private void closeRecognizerPipe() {
        OutputStream sink;
        synchronized (sinkLock) { sink = recognizerSink; recognizerSink = null; }
        if (sink != null) try { sink.close(); } catch (Exception ignored) { }
        if (recognizerReadFd != null) try { recognizerReadFd.close(); } catch (Exception ignored) { }
        recognizerReadFd = null;
    }

    private void destroyRecognizerOnly() {
        voiceHandler.removeCallbacks(restartRecognizer);
        closeRecognizerPipe();
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) { }
            try { recognizer.destroy(); } catch (Exception ignored) { }
        }
        recognizer = null;
        recognizerListening = false;
    }

    private void stopAudioRecord() {
        audioRunning = false;
        AudioRecord record = audioRecord;
        audioRecord = null;
        if (record != null) {
            try { record.stop(); } catch (Exception ignored) { }
            try { record.release(); } catch (Exception ignored) { }
        }
        if (audioThread != null) audioThread.interrupt();
        audioThread = null;
        if (echoCanceler != null) try { echoCanceler.release(); } catch (Exception ignored) { }
        echoCanceler = null;
        if (noiseSuppressor != null) try { noiseSuppressor.release(); } catch (Exception ignored) { }
        noiseSuppressor = null;
    }

    private void stopContinuousPipeline() {
        voiceHandler.removeCallbacks(restartRecognizer);
        destroyRecognizerOnly();
        stopAudioRecord();
    }

    private void enableCommunicationProfile() {
        if (communicationProfile) return;
        try {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) return;
            oldAudioMode = audioManager.getMode();
            // Do not quietly cap the user's media volume while Shruthi speaks.
            // Realtime's output is mapped to STREAM_MUSIC and Android owns the
            // volume level, including changes made by the user's volume keys.
            oldMusicVolume = -1;
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.setMicrophoneMute(false);
            communicationProfile = true;
        } catch (Exception ignored) { }
    }

    private void restoreCommunicationProfile() {
        if (!communicationProfile) return;
        try {
            if (audioManager != null) {
                // A user may have adjusted the hardware volume during the
                // conversation; never revert their choice at session end.
                audioManager.setMode(oldAudioMode);
            }
        } catch (Exception ignored) { }
        communicationProfile = false;
        oldMusicVolume = -1;
    }

    private boolean externalUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(value.trim());
            String host = uri.getHost();
            String scheme = uri.getScheme();
            return host != null && ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) && !CENTRALHUB_HOST.equalsIgnoreCase(host);
        } catch (Exception ignored) { return false; }
    }

    private void returnToCentralHub(WebView web) {
        if (web == null) return;
        web.evaluateJavascript("(function(){try{return String(document.referrer||'')}catch(e){return ''}})()", raw -> {
            String ref = raw == null ? "" : raw;
            if (ref.startsWith("\"") && ref.endsWith("\"") && ref.length() >= 2) ref = ref.substring(1, ref.length() - 1);
            ref = ref.replace("\\u0026", "&").replace("\\/", "/");
            String target = CENTRALHUB_FALLBACK;
            try {
                Uri uri = Uri.parse(ref);
                if ("https".equalsIgnoreCase(uri.getScheme()) && CENTRALHUB_HOST.equalsIgnoreCase(uri.getHost())) target = uri.toString();
            } catch (Exception ignored) { }
            final String destination = target;
            web.post(() -> web.loadUrl(destination));
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        WebView web = bridge == null ? null : bridge.getWebView();
        if (web == null) { moveTaskToBack(true); return; }
        if (web.canGoBack()) { web.goBack(); return; }
        if (externalUrl(web.getUrl())) { returnToCentralHub(web); return; }
        web.evaluateJavascript("(window.history&&window.history.length>1)?'true':'false'", value -> {
            boolean history = "true".equalsIgnoreCase(value) || "\"true\"".equals(value);
            if (history) web.evaluateJavascript("window.history.back()", null);
            else moveTaskToBack(true);
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        continuousResumed = true;
        if (!legacyMode && continuousEnabled) startContinuousPipeline();
    }

    @Override
    public void onPause() {
        continuousResumed = false;
        if (!legacyMode) stopContinuousPipeline();
        restoreCommunicationProfile();
        super.onPause();
    }

    @Override
    public void onDestroy() {
        stopContinuousPipeline();
        restoreCommunicationProfile();
        voiceHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(requestCode, permissions, grants);
        if (requestCode == REQUEST_CONTINUOUS_AUDIO && grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED && continuousEnabled && continuousResumed) {
            startContinuousPipeline();
        }
    }
}
