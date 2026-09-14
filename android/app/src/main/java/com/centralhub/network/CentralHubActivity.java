package com.centralhub.network;

import android.content.Context;
import android.media.AudioManager;
import android.net.Uri;
import android.webkit.WebView;

/**
 * Launcher shell for CentralHub.
 *
 * Keeps Android Back inside the app when an external document has replaced the
 * main WebView, and applies a short communication audio profile while Shruthi is
 * speaking so Samsung's recognizer has a better chance of hearing a real user
 * interruption over the device speaker.
 */
public final class CentralHubActivity extends MainActivity {
    private static final String CENTRALHUB_HOST = "centralhub.network";
    private static final String CENTRALHUB_FALLBACK = "https://centralhub.network/dashboard";

    private AudioManager audioManager;
    private int previousAudioMode = AudioManager.MODE_NORMAL;
    private int previousMusicVolume = -1;
    private boolean bargeInAudioProfileActive = false;

    @Override
    public void setTaraSpeaking(boolean speaking) {
        if (speaking) enableBargeInAudioProfile();
        super.setTaraSpeaking(speaking);
        if (!speaking) restoreBargeInAudioProfile();
    }

    @Override
    public void setNoraConversationActive(boolean active) {
        super.setNoraConversationActive(active);
        if (!active) restoreBargeInAudioProfile();
    }

    private void enableBargeInAudioProfile() {
        if (bargeInAudioProfileActive) return;
        try {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) return;
            previousAudioMode = audioManager.getMode();
            previousMusicVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);

            // Samsung's communication mode enables the platform's voice-oriented
            // echo/noise processing while the recognizer remains live for barge-in.
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.setMicrophoneMute(false);

            // Lightly duck only very loud playback. Shruthi remains easy to hear,
            // but the phone speaker is less likely to drown out a real interruption.
            int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int ceiling = Math.max(1, Math.round(max * 0.78f));
            if (previousMusicVolume > ceiling) {
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, ceiling, 0);
            }
            bargeInAudioProfileActive = true;
        } catch (Exception ignored) { }
    }

    private void restoreBargeInAudioProfile() {
        if (!bargeInAudioProfileActive) return;
        try {
            if (audioManager != null) {
                if (previousMusicVolume >= 0) {
                    int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    audioManager.setStreamVolume(
                            AudioManager.STREAM_MUSIC,
                            Math.max(0, Math.min(max, previousMusicVolume)),
                            0
                    );
                }
                audioManager.setMode(previousAudioMode);
            }
        } catch (Exception ignored) { }
        bargeInAudioProfileActive = false;
        previousMusicVolume = -1;
    }

    private boolean isExternalHttpUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(value.trim());
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) || host == null) return false;
            return !CENTRALHUB_HOST.equalsIgnoreCase(host);
        } catch (Exception ignored) {
            return false;
        }
    }

    private void returnToCentralHub(WebView webView) {
        if (webView == null) return;
        webView.evaluateJavascript(
                "(function(){try{return String(document.referrer||'')}catch(e){return ''}})()",
                raw -> {
                    String referrer = raw == null ? "" : raw;
                    if (referrer.startsWith("\"") && referrer.endsWith("\"") && referrer.length() >= 2) {
                        referrer = referrer.substring(1, referrer.length() - 1);
                    }
                    referrer = referrer.replace("\\u0026", "&").replace("\\/", "/");
                    String target = CENTRALHUB_FALLBACK;
                    try {
                        Uri uri = Uri.parse(referrer);
                        if ("https".equalsIgnoreCase(uri.getScheme())
                                && CENTRALHUB_HOST.equalsIgnoreCase(uri.getHost())) {
                            target = uri.toString();
                        }
                    } catch (Exception ignored) { }
                    final String destination = target;
                    webView.post(() -> webView.loadUrl(destination));
                }
        );
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }

        String currentUrl = webView.getUrl();
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }

        // External pages can replace the main WebView without creating a native
        // history entry. In that case Android Back must return to CentralHub,
        // never destroy the Activity/app.
        if (isExternalHttpUrl(currentUrl)) {
            returnToCentralHub(webView);
            return;
        }

        webView.evaluateJavascript(
                "(window.history && window.history.length > 1) ? 'true' : 'false'",
                value -> {
                    boolean hasPageHistory = "true".equalsIgnoreCase(value) || "\"true\"".equals(value);
                    if (hasPageHistory) {
                        webView.evaluateJavascript("window.history.back()", null);
                    } else {
                        // At the app root, keep CentralHub alive in the task rather
                        // than finishing it. Returning to it is immediate.
                        moveTaskToBack(true);
                    }
                }
        );
    }

    @Override
    public void onPause() {
        restoreBargeInAudioProfile();
        super.onPause();
    }

    @Override
    public void onDestroy() {
        restoreBargeInAudioProfile();
        super.onDestroy();
    }
}
