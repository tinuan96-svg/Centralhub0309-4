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
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String CENTRALHUB_ORIGIN = "https://centralhub.network";
    private static final String EXTRA_ACTION_URL = "centralhub_action_url";
    private static final int REQUEST_POST_NOTIFICATIONS = 4101;
    private static final int REQUEST_RECORD_AUDIO = 4102;

    private final Handler taraHandler = new Handler(Looper.getMainLooper());
    private final Runnable taraRestartRunnable = this::startTaraRecognizerIfReady;
    private SpeechRecognizer taraRecognizer;
    private Intent taraRecognizerIntent;
    private boolean taraEnabled = false;
    private boolean taraSpeaking = false;
    private boolean taraResumed = false;
    private boolean taraListening = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebSettings webSettings = bridge.getWebView().getSettings();
        webSettings.setUseWideViewPort(true);
        // The inner Fold display has a wide layout, but the default WebView scale
        // makes the admin shell feel oversized. Apply a compact zoom-out only there;
        // the cover display keeps its existing responsive scale.
        int screenWidthDp = getResources().getConfiguration().screenWidthDp;
        if (screenWidthDp >= 600) {
            webSettings.setLoadWithOverviewMode(true);
            bridge.getWebView().setInitialScale(75);
        } else {
            webSettings.setLoadWithOverviewMode(false);
        }

        bridge.getWebView().addJavascriptInterface(
                new CentralHubNativeBridge(this),
                "CentralHubNative"
        );

        setupTaraRecognizer();

        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                CentralHubNativeBridge.saveFcmToken(this, task.getResult());
            }
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    REQUEST_POST_NOTIFICATIONS
            );
        }

        bridge.getWebView().setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    return false;
                }

                // Open native Android destinations outside the WebView. This keeps
                // WhatsApp, phone, email, SMS, maps and Play Store links working.
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
                                if (text != null && !text.trim().isEmpty()) {
                                    fallback.appendQueryParameter("text", text);
                                }
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
                            if (path.endsWith("/")) {
                                assetPath = assetPath + "index.html";
                            } else {
                                assetPath = assetPath + "/index.html";
                            }
                            try {
                                return new WebResourceResponse(
                                    "text/html",
                                    "utf-8",
                                    getAssets().open(assetPath)
                                );
                            } catch (Exception e) {
                                return new WebResourceResponse(
                                    "text/html",
                                    "utf-8",
                                    getAssets().open("public/index.html")
                                );
                            }
                        }
                    } catch (Exception e) {
                    }
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

    private void setupTaraRecognizer() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
                taraRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
            } else {
                taraRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            }
        } catch (Exception ignored) {
            taraRecognizer = null;
        }
        if (taraRecognizer == null) return;

        taraRecognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        taraRecognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

        taraRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                taraListening = true;
            }

            @Override
            public void onBeginningOfSpeech() {
            }

            @Override
            public void onRmsChanged(float rmsdB) {
            }

            @Override
            public void onBufferReceived(byte[] buffer) {
            }

            @Override
            public void onEndOfSpeech() {
            }

            @Override
            public void onError(int error) {
                taraListening = false;
                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) return;
                scheduleTaraRestart(error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? 1200L : 550L);
            }

            @Override
            public void onResults(Bundle results) {
                taraListening = false;
                ArrayList<String> matches = results == null
                        ? null
                        : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (!taraSpeaking && matches != null) {
                    for (String match : matches) {
                        if (match != null && !match.trim().isEmpty()) {
                            dispatchTaraTranscript(match.trim());
                            break;
                        }
                    }
                }
                scheduleTaraRestart(450L);
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
            }

            @Override
            public void onEvent(int eventType, Bundle params) {
            }
        });
    }

    public boolean isTaraVoiceAvailable() {
        return SpeechRecognizer.isRecognitionAvailable(this);
    }

    public void setTaraEnabled(boolean enabled) {
        taraEnabled = enabled;
        if (!enabled) {
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
        if (speaking) {
            stopTaraRecognizer();
        } else {
            scheduleTaraRestart(350L);
        }
    }

    private void startTaraRecognizerIfReady() {
        if (!taraEnabled || !taraResumed || taraSpeaking || taraListening) return;
        if (taraRecognizer == null) setupTaraRecognizer();
        if (taraRecognizer == null || taraRecognizerIntent == null) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;

        try {
            taraHandler.removeCallbacks(taraRestartRunnable);
            taraRecognizer.startListening(taraRecognizerIntent);
            taraListening = true;
        } catch (Exception ignored) {
            taraListening = false;
            scheduleTaraRestart(1000L);
        }
    }

    private void scheduleTaraRestart(long delayMs) {
        taraHandler.removeCallbacks(taraRestartRunnable);
        if (!taraEnabled || !taraResumed || taraSpeaking) return;
        taraHandler.postDelayed(taraRestartRunnable, Math.max(250L, delayMs));
    }

    private void stopTaraRecognizer() {
        taraHandler.removeCallbacks(taraRestartRunnable);
        taraListening = false;
        if (taraRecognizer != null) {
            try {
                taraRecognizer.cancel();
            } catch (Exception ignored) {
            }
        }
    }

    private void dispatchTaraTranscript(String text) {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null || text == null || text.trim().isEmpty()) return;
        String quoted = JSONObject.quote(text.trim());
        String script = "window.dispatchEvent(new CustomEvent('centralhub:tara-transcript',{detail:{text:" + quoted + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    protected void onResume() {
        super.onResume();
        taraResumed = true;
        scheduleTaraRestart(300L);
    }

    @Override
    protected void onPause() {
        taraResumed = false;
        stopTaraRecognizer();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        taraHandler.removeCallbacksAndMessages(null);
        if (taraRecognizer != null) {
            try {
                taraRecognizer.destroy();
            } catch (Exception ignored) {
            }
            taraRecognizer = null;
        }
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_RECORD_AUDIO
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            scheduleTaraRestart(250L);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent);
    }

    /**
     * Route notification taps into the exact CentralHub page supplied by the push
     * payload. Only CentralHub-relative URLs or the CentralHub HTTPS origin are
     * accepted, so a push payload cannot turn the native app into an open redirect.
     */
    private void handleNotificationIntent(Intent intent) {
        if (intent == null) return;
        String actionUrl = intent.getStringExtra(EXTRA_ACTION_URL);
        if (actionUrl == null || actionUrl.trim().isEmpty()) return;
        intent.removeExtra(EXTRA_ACTION_URL);

        final String targetUrl = normalizeCentralHubUrl(actionUrl);
        if (targetUrl == null) return;

        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null) {
            webView.post(() -> webView.loadUrl(targetUrl));
        }
    }

    private String normalizeCentralHubUrl(String actionUrl) {
        String value = actionUrl.trim();
        if (value.startsWith("/")) {
            return CENTRALHUB_ORIGIN + value;
        }

        try {
            Uri uri = Uri.parse(value);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if ("https".equalsIgnoreCase(scheme)
                    && "centralhub.network".equalsIgnoreCase(host)) {
                return uri.toString();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    /**
     * Keep Android Back inside the WebView while there is an in-app page to
     * return to. Only the root page is allowed to close the activity.
     */
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

        // Next.js client navigation can use the History API. If WebView's
        // native history stack has not caught up yet, ask the page directly.
        webView.evaluateJavascript(
                "(window.history && window.history.length > 1) ? 'true' : 'false'",
                value -> {
                    boolean hasPageHistory =
                            "true".equalsIgnoreCase(value) || "\"true\"".equals(value);
                    if (hasPageHistory) {
                        webView.evaluateJavascript("window.history.back()", null);
                    } else {
                        MainActivity.super.onBackPressed();
                    }
                }
        );
    }
}
