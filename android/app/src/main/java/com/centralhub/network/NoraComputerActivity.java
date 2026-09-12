package com.centralhub.network;

import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Visible, human-supervised browser for NORA Computer Mode.
 *
 * NORA can operate ordinary browser UI through structured screenshot-coordinate
 * actions. Authentication secrets, OTP/2FA, CAPTCHA and identity verification are
 * always handed back to the human. Consequential actions are approved before NORA
 * continues. Nothing here attempts to bypass a site's security controls.
 */
public final class NoraComputerActivity extends android.app.Activity {
    private static final String EXTRA_SESSION_ID = "nora_session_id";
    private static final String EXTRA_TARGET_URL = "nora_target_url";
    private static final String EXTRA_ACCESS_TOKEN = "nora_access_token";
    private static final String EXTRA_SUPABASE_URL = "nora_supabase_url";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();

    private WebView webView;
    private TextView statusView;
    private Button takeoverButton;
    private Button closeButton;
    private String sessionId;
    private String targetUrl;
    private String accessToken;
    private String agentEndpoint;
    private boolean agentStarted = false;
    private boolean finishedOrDestroyed = false;
    private boolean manualControl = false;
    private boolean syntheticInput = false;
    private boolean waitingSensitiveHandoff = false;
    private String lastResponseId = "";
    private String lastCallId = "";
    private String lastStepId = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        sessionId = safe(intent.getStringExtra(EXTRA_SESSION_ID));
        targetUrl = safe(intent.getStringExtra(EXTRA_TARGET_URL));
        accessToken = safe(intent.getStringExtra(EXTRA_ACCESS_TOKEN));
        String supabaseUrl = safe(intent.getStringExtra(EXTRA_SUPABASE_URL)).replaceAll("/+$", "");
        agentEndpoint = supabaseUrl + "/functions/v1/nora-computer-agent";

        if (sessionId.isEmpty() || accessToken.isEmpty() || supabaseUrl.isEmpty() || !isAllowedUrl(targetUrl)) {
            Toast.makeText(this, "NORA Computer Mode could not start safely.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        buildUi();
        configureWebView();
        setManualControl(false, "NORA is opening the secure browser…");
        webView.loadUrl(targetUrl);
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(2, 6, 14));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(12), dp(8), dp(8), dp(8));
        bar.setBackgroundColor(Color.rgb(5, 13, 26));

        TextView brand = new TextView(this);
        brand.setText("NORA · LIVE ACTION");
        brand.setTextColor(Color.rgb(98, 211, 255));
        brand.setTextSize(12f);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(brand, new LinearLayout.LayoutParams(dp(128), dp(46)));

        statusView = new TextView(this);
        statusView.setText("Preparing…");
        statusView.setTextColor(Color.rgb(220, 232, 244));
        statusView.setTextSize(12f);
        statusView.setSingleLine(true);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(0, dp(46), 1f);
        statusView.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(statusView, statusParams);

        takeoverButton = new Button(this);
        takeoverButton.setAllCaps(false);
        takeoverButton.setText("Take over");
        takeoverButton.setTextSize(11f);
        takeoverButton.setOnClickListener(v -> toggleTakeover());
        bar.addView(takeoverButton, new LinearLayout.LayoutParams(dp(104), dp(44)));

        closeButton = new Button(this);
        closeButton.setAllCaps(false);
        closeButton.setText("End");
        closeButton.setTextSize(11f);
        closeButton.setOnClickListener(v -> cancelAndClose());
        bar.addView(closeButton, new LinearLayout.LayoutParams(dp(68), dp(44)));

        webView = new WebView(this);
        root.addView(bar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(62)));
        root.addView(webView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setOnTouchListener((v, event) -> !manualControl && !syntheticInput);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String value = request.getUrl().toString();
                if (isAllowedUrl(value)) return false;
                setStatus("Blocked navigation outside NORA's approved sites");
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!isAllowedUrl(url)) return;
                if (!agentStarted) {
                    agentStarted = true;
                    setStatus("NORA is inspecting the page…");
                    mainHandler.postDelayed(() -> requestAgent("start", null), 900L);
                }
            }
        });
    }

    private void toggleTakeover() {
        if (manualControl) {
            setManualControl(false, "NORA is resuming…");
            if (waitingSensitiveHandoff) {
                waitingSensitiveHandoff = false;
                requestResume(false, "completed manually");
            } else if (!lastCallId.isEmpty()) {
                captureAndContinue();
            } else {
                requestResume(false, "Continue from the current screen after my manual check.");
            }
        } else {
            setManualControl(true, "You have control · NORA is paused");
            requestAgent("pause", null);
        }
    }

    private void setManualControl(boolean enabled, String status) {
        manualControl = enabled;
        if (takeoverButton != null) takeoverButton.setText(enabled ? "Continue NORA" : "Take over");
        setStatus(status);
    }

    private void requestAgent(String action, JSONObject extra) {
        if (finishedOrDestroyed) return;
        networkExecutor.execute(() -> {
            try {
                JSONObject body = extra == null ? new JSONObject() : extra;
                body.put("action", action);
                body.put("session_id", sessionId);
                JSONObject result = postJson(body);
                mainHandler.post(() -> handleAgentResult(result));
            } catch (Exception error) {
                mainHandler.post(() -> failVisible("NORA could not continue: " + safe(error.getMessage())));
            }
        });
    }

    private JSONObject postJson(JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(agentEndpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(75_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + accessToken);
        connection.setRequestProperty("Content-Type", "application/json");
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(bytes);
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder text = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) text.append(line);
            }
        }
        connection.disconnect();
        JSONObject result = text.length() == 0 ? new JSONObject() : new JSONObject(text.toString());
        if (status < 200 || status >= 300 || !result.optBoolean("success", false)) {
            throw new IllegalStateException(result.optString("error", "HTTP " + status));
        }
        return result;
    }

    private void handleAgentResult(JSONObject result) {
        if (finishedOrDestroyed) return;
        String kind = result.optString("kind", "");
        String responseId = result.optString("response_id", "");
        if (!responseId.isEmpty()) lastResponseId = responseId;

        switch (kind) {
            case "computer_actions":
                lastCallId = result.optString("call_id", "");
                lastStepId = result.optString("step_id", "");
                setManualControl(false, result.optString("current_step", "NORA is working…"));
                executeActions(result.optJSONArray("actions"), 0);
                break;
            case "input_required":
                handleInputRequest(result.optString("question", "NORA needs your input."), result.optBoolean("sensitive", false));
                break;
            case "approval_required":
                showApproval(result.optString("reason", "NORA reached an action that requires your approval."));
                break;
            case "completed":
                lastCallId = "";
                setManualControl(true, "Completed · " + result.optString("message", "NORA finished the task."));
                showCompletion(result.optString("message", "NORA completed and verified the task."));
                break;
            case "paused":
                setManualControl(true, "Paused · you have control");
                break;
            default:
                failVisible("NORA returned an unexpected computer state.");
                break;
        }
    }

    private void executeActions(JSONArray actions, int index) {
        if (finishedOrDestroyed || manualControl) return;
        if (actions == null || index >= actions.length()) {
            mainHandler.postDelayed(this::captureAndContinue, 500L);
            return;
        }
        JSONObject action = actions.optJSONObject(index);
        if (action == null) {
            executeActions(actions, index + 1);
            return;
        }
        String type = action.optString("type", "");
        long delay = "wait".equals(type) ? 2000L : 260L;

        try {
            switch (type) {
                case "click":
                    tap((float) action.optDouble("x", 0), (float) action.optDouble("y", 0), false);
                    break;
                case "double_click":
                    tap((float) action.optDouble("x", 0), (float) action.optDouble("y", 0), true);
                    break;
                case "drag":
                    drag(action.optJSONArray("path"));
                    break;
                case "scroll":
                    scroll(action.optInt("scroll_x", 0), action.optInt("scroll_y", 0));
                    break;
                case "keypress":
                    keypress(action.optJSONArray("keys"));
                    break;
                case "type":
                    typeText(action.optString("text", ""));
                    break;
                case "move":
                case "screenshot":
                case "wait":
                    break;
                default:
                    failVisible("NORA requested an unsupported action: " + type);
                    return;
            }
        } catch (Exception error) {
            failVisible("NORA action failed: " + safe(error.getMessage()));
            return;
        }
        mainHandler.postDelayed(() -> executeActions(actions, index + 1), delay);
    }

    private void tap(float x, float y, boolean doubleClick) {
        syntheticInput = true;
        long now = android.os.SystemClock.uptimeMillis();
        webView.dispatchTouchEvent(MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0));
        webView.dispatchTouchEvent(MotionEvent.obtain(now, now + 60, MotionEvent.ACTION_UP, x, y, 0));
        if (doubleClick) {
            webView.dispatchTouchEvent(MotionEvent.obtain(now + 100, now + 100, MotionEvent.ACTION_DOWN, x, y, 0));
            webView.dispatchTouchEvent(MotionEvent.obtain(now + 100, now + 160, MotionEvent.ACTION_UP, x, y, 0));
        }
        syntheticInput = false;
    }

    private void drag(JSONArray path) {
        if (path == null || path.length() < 2) return;
        JSONObject first = path.optJSONObject(0);
        if (first == null) return;
        syntheticInput = true;
        long start = android.os.SystemClock.uptimeMillis();
        webView.dispatchTouchEvent(MotionEvent.obtain(start, start, MotionEvent.ACTION_DOWN, (float) first.optDouble("x"), (float) first.optDouble("y"), 0));
        for (int i = 1; i < path.length(); i++) {
            JSONObject point = path.optJSONObject(i);
            if (point == null) continue;
            long t = start + i * 35L;
            webView.dispatchTouchEvent(MotionEvent.obtain(start, t, MotionEvent.ACTION_MOVE, (float) point.optDouble("x"), (float) point.optDouble("y"), 0));
        }
        JSONObject last = path.optJSONObject(path.length() - 1);
        long end = start + path.length() * 35L;
        webView.dispatchTouchEvent(MotionEvent.obtain(start, end, MotionEvent.ACTION_UP, (float) last.optDouble("x"), (float) last.optDouble("y"), 0));
        syntheticInput = false;
    }

    private void scroll(int dx, int dy) {
        webView.scrollBy(dx, dy);
        String js = "try{var e=document.elementFromPoint(innerWidth/2,innerHeight/2);" +
                "for(;e&&e!==document.body;e=e.parentElement){var s=getComputedStyle(e);" +
                "if(/auto|scroll/.test(s.overflowY)&&e.scrollHeight>e.clientHeight){e.scrollBy(" + dx + "," + dy + ");break;}}}catch(_){window.scrollBy(" + dx + "," + dy + ");}";
        webView.evaluateJavascript(js, null);
    }

    private void typeText(String text) {
        if (text == null || text.isEmpty()) return;
        String quoted = JSONObject.quote(text);
        String js = "(function(){var e=document.activeElement;if(!e)return false;var t=" + quoted + ";" +
                "try{if(document.execCommand&&document.execCommand('insertText',false,t))return true;}catch(_){}" +
                "try{var p=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value');" +
                "var v=(typeof e.value==='string'?e.value:'')+t;if(p&&p.set)p.set.call(e,v);else e.value=v;" +
                "e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:t}));" +
                "e.dispatchEvent(new Event('change',{bubbles:true}));return true;}catch(_){return false;}})();";
        webView.evaluateJavascript(js, null);
    }

    private void keypress(JSONArray keys) {
        if (keys == null || keys.length() == 0) return;
        boolean ctrl = false;
        String primary = "";
        for (int i = 0; i < keys.length(); i++) {
            String k = keys.optString(i, "");
            if ("CTRL".equalsIgnoreCase(k) || "CONTROL".equalsIgnoreCase(k)) ctrl = true;
            else primary = k;
        }
        if (ctrl && "A".equalsIgnoreCase(primary)) {
            webView.evaluateJavascript("try{document.activeElement&&document.activeElement.select&&document.activeElement.select()}catch(_){}", null);
            return;
        }
        int code = keyCode(primary);
        if (code == KeyEvent.KEYCODE_UNKNOWN) return;
        webView.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
        webView.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, code));
    }

    private int keyCode(String key) {
        if (key == null) return KeyEvent.KEYCODE_UNKNOWN;
        switch (key.toUpperCase(Locale.ROOT)) {
            case "ENTER": case "RETURN": return KeyEvent.KEYCODE_ENTER;
            case "TAB": return KeyEvent.KEYCODE_TAB;
            case "BACKSPACE": case "BACK": return KeyEvent.KEYCODE_DEL;
            case "ESC": case "ESCAPE": return KeyEvent.KEYCODE_ESCAPE;
            case "SPACE": return KeyEvent.KEYCODE_SPACE;
            case "ARROWUP": case "UP": return KeyEvent.KEYCODE_DPAD_UP;
            case "ARROWDOWN": case "DOWN": return KeyEvent.KEYCODE_DPAD_DOWN;
            case "ARROWLEFT": case "LEFT": return KeyEvent.KEYCODE_DPAD_LEFT;
            case "ARROWRIGHT": case "RIGHT": return KeyEvent.KEYCODE_DPAD_RIGHT;
            default:
                if (key.length() == 1) return KeyEvent.keyCodeFromString("KEYCODE_" + key.toUpperCase(Locale.ROOT));
                return KeyEvent.KEYCODE_UNKNOWN;
        }
    }

    private void captureAndContinue() {
        if (finishedOrDestroyed || manualControl || webView.getWidth() <= 0 || webView.getHeight() <= 0 || lastResponseId.isEmpty() || lastCallId.isEmpty()) return;
        try {
            Bitmap bitmap = Bitmap.createBitmap(webView.getWidth(), webView.getHeight(), Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            webView.draw(canvas);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
            bitmap.recycle();
            String encoded = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
            JSONObject extra = new JSONObject();
            extra.put("previous_response_id", lastResponseId);
            extra.put("call_id", lastCallId);
            extra.put("step_id", lastStepId);
            extra.put("screenshot_base64", encoded);
            setStatus("NORA is checking the result…");
            requestAgent("continue", extra);
        } catch (Exception error) {
            failVisible("Could not capture NORA browser state.");
        }
    }

    private void handleInputRequest(String question, boolean sensitive) {
        lastCallId = "";
        if (sensitive) {
            waitingSensitiveHandoff = true;
            setManualControl(true, "Your turn · complete the secure step, then tap Continue NORA");
            new AlertDialog.Builder(this)
                    .setTitle("NORA needs you")
                    .setMessage(question + "\n\nComplete this directly in the browser. NORA will not read or store your password, OTP or CAPTCHA response.")
                    .setPositiveButton("Take over", null)
                    .show();
            return;
        }

        EditText input = new EditText(this);
        input.setSingleLine(false);
        input.setMinLines(1);
        input.setMaxLines(4);
        input.setPadding(dp(18), dp(10), dp(18), dp(10));
        new AlertDialog.Builder(this)
                .setTitle("NORA asks")
                .setMessage(question)
                .setView(input)
                .setPositiveButton("Continue", (dialog, which) -> {
                    String answer = input.getText().toString().trim();
                    if (!answer.isEmpty()) requestResume(false, answer);
                    else setManualControl(true, "Waiting for your answer");
                })
                .setNegativeButton("Pause", (dialog, which) -> {
                    setManualControl(true, "Paused · waiting for your answer");
                    requestAgent("pause", null);
                })
                .setCancelable(false)
                .show();
    }

    private void showApproval(String reason) {
        lastCallId = "";
        setManualControl(true, "Approval required before NORA continues");
        new AlertDialog.Builder(this)
                .setTitle("Approve NORA action?")
                .setMessage(reason)
                .setPositiveButton("Approve", (dialog, which) -> {
                    setManualControl(false, "Approved · NORA is continuing…");
                    requestResume(true, "");
                })
                .setNegativeButton("Not now", (dialog, which) -> {
                    setManualControl(true, "Not approved · NORA is paused");
                    requestAgent("pause", null);
                })
                .setCancelable(false)
                .show();
    }

    private void requestResume(boolean approved, String answer) {
        try {
            JSONObject extra = new JSONObject();
            extra.put("previous_response_id", lastResponseId);
            if (approved) extra.put("approved", true);
            if (answer != null && !answer.isEmpty()) extra.put("answer", answer);
            requestAgent("resume", extra);
        } catch (Exception error) {
            failVisible("NORA could not resume.");
        }
    }

    private void showCompletion(String message) {
        new AlertDialog.Builder(this)
                .setTitle("NORA finished")
                .setMessage(message)
                .setPositiveButton("Return to CentralHub", (dialog, which) -> finish())
                .setNegativeButton("View result", null)
                .show();
    }

    private void cancelAndClose() {
        if (finishedOrDestroyed) return;
        setStatus("Ending NORA task…");
        networkExecutor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "cancel");
                body.put("session_id", sessionId);
                postJson(body);
            } catch (Exception ignored) {
            }
            mainHandler.post(this::finish);
        });
    }

    private void failVisible(String message) {
        setManualControl(true, message);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private void setStatus(String value) {
        if (statusView != null) statusView.setText(value == null || value.isEmpty() ? "NORA Computer Mode" : value);
    }

    private boolean isAllowedUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
            String host = uri.getHost();
            if (host == null) return false;
            host = host.toLowerCase(Locale.ROOT);
            String[] roots = new String[]{"facebook.com", "meta.com", "google.com", "google.co.uk", "centralhub.network"};
            for (String root : roots) if (host.equals(root) || host.endsWith("." + root)) return true;
            return false;
        } catch (Exception ignored) {
            return false;
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack() && manualControl) {
            webView.goBack();
        } else {
            new AlertDialog.Builder(this)
                    .setTitle("Leave NORA Computer Mode?")
                    .setMessage("The task will be paused. You can return to it from CentralHub.")
                    .setPositiveButton("Leave", (dialog, which) -> {
                        requestAgent("pause", null);
                        finish();
                    })
                    .setNegativeButton("Stay", null)
                    .show();
        }
    }

    @Override
    protected void onDestroy() {
        finishedOrDestroyed = true;
        mainHandler.removeCallbacksAndMessages(null);
        networkExecutor.shutdownNow();
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
