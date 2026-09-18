package com.centralhub.network;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
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
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Visible, human-supervised browser tool for the single Shruthi conversation.
 *
 * This Activity deliberately contains no second Shruthi chat or assistant input. The
 * address bar is only browser chrome. Authentication secrets, OTP/2FA, CAPTCHA and
 * identity verification remain manual, and consequential final actions require approval.
 */
public final class NoraComputerActivity extends android.app.Activity {
    private static final String EXTRA_SESSION_ID = "nora_session_id";
    private static final String EXTRA_TARGET_URL = "nora_target_url";
    private static final String EXTRA_ACCESS_TOKEN = "nora_access_token";
    private static final String EXTRA_SUPABASE_URL = "nora_supabase_url";
    private static final String EXTRA_PUBLISHABLE_KEY = "nora_publishable_key";
    private static final String BROWSER_PREFS = "centralhub_live_web_browser";
    private static final int MAX_TABS = 8;
    private static final int WEB_PERMISSION_REQUEST_CODE = 4517;
    private static final long PAGE_STABLE_MS = 300L;
    private static final int PAGE_READY_MAX_ATTEMPTS = 20;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService browserExecutor = Executors.newSingleThreadExecutor();
    private final ArrayList<BrowserTab> tabs = new ArrayList<>();

    private WebView webView;
    private TextView statusView;
    private TextView voiceStateView;
    private EditText addressView;
    private Button takeoverButton;
    private String sessionId;
    private String targetUrl;
    private String accessToken;
    private String supabaseUrl;
    private String publishableKey;
    private String agentEndpoint;
    private String voiceEndpoint;
    private String controlEndpoint;
    private int activeTabIndex = 0;
    private int navigationGeneration = 0;
    private boolean agentStarted = false;
    private boolean finishedOrDestroyed = false;
    private boolean manualControl = false;
    private boolean syntheticInput = false;
    private boolean waitingSensitiveHandoff = false;
    private boolean pageLoading = true;
    private boolean sessionCompleted = false;
    private boolean waitingForVoiceAnswer = false;
    private boolean liveVoicePausedForSecureInput = false;
    private boolean desktopMode = false;
    private int actionGeneration = 0;
    private long lastPageFinishedAt = 0L;
    private long lastSyntheticActionAt = 0L;
    private String lastResponseId = "";
    private String lastCallId = "";
    private String lastStepId = "";
    private String lastVoiceUserText = "";
    private ShruthiRealtimeVoiceClient liveVoiceClient;
    private PermissionRequest pendingWebPermissionRequest;

    private static final class BrowserTab {
        String title;
        String url;
        BrowserTab(String title, String url) {
            this.title = title == null || title.trim().isEmpty() ? "New tab" : title.trim();
            this.url = url == null ? "" : url.trim();
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        sessionId = safe(intent.getStringExtra(EXTRA_SESSION_ID));
        targetUrl = safe(intent.getStringExtra(EXTRA_TARGET_URL));
        accessToken = safe(intent.getStringExtra(EXTRA_ACCESS_TOKEN));
        supabaseUrl = safe(intent.getStringExtra(EXTRA_SUPABASE_URL)).replaceAll("/+$", "");
        publishableKey = safe(intent.getStringExtra(EXTRA_PUBLISHABLE_KEY));
        agentEndpoint = supabaseUrl + "/functions/v1/nora-computer-agent";
        voiceEndpoint = supabaseUrl + "/functions/v1/centralhub-voice-assistant";
        controlEndpoint = supabaseUrl + "/functions/v1/live-web-control";

        if (sessionId.isEmpty() || accessToken.isEmpty() || supabaseUrl.isEmpty() || publishableKey.isEmpty() || !isAllowedUrl(targetUrl)) {
            Toast.makeText(this, "Shruthi Live Web could not start safely.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        buildUi();
        configureWebView();
        restoreTabs();
        setManualControl(false, "Shruthi is opening Live Web…");
        webView.loadUrl(targetUrl);
        startLiveVoice();
        ShruthiBackgroundTaskService.start(this, sessionId, targetUrl, accessToken, supabaseUrl, publishableKey);
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
        brand.setText("SHRUTHI · LIVE WEB");
        brand.setTextColor(Color.rgb(98, 211, 255));
        brand.setTextSize(12f);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(brand, new LinearLayout.LayoutParams(dp(142), dp(46)));

        statusView = new TextView(this);
        statusView.setText("Preparing…");
        statusView.setTextColor(Color.rgb(220, 232, 244));
        statusView.setTextSize(12f);
        statusView.setSingleLine(true);
        statusView.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(statusView, new LinearLayout.LayoutParams(0, dp(46), 1f));

        voiceStateView = new TextView(this);
        voiceStateView.setText("Voice");
        voiceStateView.setTextColor(Color.rgb(130, 207, 255));
        voiceStateView.setTextSize(10f);
        voiceStateView.setGravity(Gravity.CENTER);
        voiceStateView.setSingleLine(true);
        bar.addView(voiceStateView, new LinearLayout.LayoutParams(dp(72), dp(44)));

        takeoverButton = browserButton("Take over");
        takeoverButton.setOnClickListener(v -> toggleTakeover());
        bar.addView(takeoverButton, new LinearLayout.LayoutParams(dp(104), dp(44)));

        Button closeButton = browserButton("End");
        closeButton.setOnClickListener(v -> cancelAndClose());
        bar.addView(closeButton, new LinearLayout.LayoutParams(dp(68), dp(44)));

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER_VERTICAL);
        nav.setPadding(dp(8), dp(4), dp(8), dp(6));
        nav.setBackgroundColor(Color.rgb(4, 10, 20));

        Button back = browserButton("‹");
        back.setOnClickListener(v -> {
            takeOverForBrowser();
            if (webView != null && webView.canGoBack()) webView.goBack();
            else { requestAgent("pause", null); finish(); }
        });
        nav.addView(back, new LinearLayout.LayoutParams(dp(44), dp(42)));

        Button forward = browserButton("›");
        forward.setOnClickListener(v -> { takeOverForBrowser(); if (webView != null && webView.canGoForward()) webView.goForward(); });
        nav.addView(forward, new LinearLayout.LayoutParams(dp(44), dp(42)));

        Button refresh = browserButton("↻");
        refresh.setOnClickListener(v -> { takeOverForBrowser(); if (webView != null) webView.reload(); });
        nav.addView(refresh, new LinearLayout.LayoutParams(dp(44), dp(42)));

        Button home = browserButton("⌂");
        home.setOnClickListener(v -> { takeOverForBrowser(); if (webView != null) webView.loadUrl(targetUrl); });
        nav.addView(home, new LinearLayout.LayoutParams(dp(44), dp(42)));

        addressView = new EditText(this);
        addressView.setSingleLine(true);
        addressView.setText(targetUrl);
        addressView.setTextColor(Color.WHITE);
        addressView.setHintTextColor(Color.rgb(104, 124, 148));
        addressView.setHint("Search or enter website");
        addressView.setTextSize(12f);
        addressView.setPadding(dp(12), 0, dp(10), 0);
        addressView.setBackgroundColor(Color.rgb(12, 22, 38));
        addressView.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_GO);
        addressView.setOnEditorActionListener((v, actionId, event) -> { navigateAddress(addressView.getText().toString()); return true; });
        nav.addView(addressView, new LinearLayout.LayoutParams(0, dp(42), 1f));

        Button go = browserButton("Go");
        go.setOnClickListener(v -> navigateAddress(addressView.getText().toString()));
        nav.addView(go, new LinearLayout.LayoutParams(dp(52), dp(42)));

        Button tabsButton = browserButton("Tabs");
        tabsButton.setOnClickListener(v -> showTabs());
        nav.addView(tabsButton, new LinearLayout.LayoutParams(dp(66), dp(42)));

        Button toolsButton = browserButton("Tools");
        toolsButton.setOnClickListener(v -> showTools());
        nav.addView(toolsButton, new LinearLayout.LayoutParams(dp(66), dp(42)));

        webView = new WebView(this);
        root.addView(bar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(62)));
        root.addView(nav, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));
        root.addView(webView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private Button browserButton(String label) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setTextSize(11f);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(3), 0, dp(3), 0);
        return button;
    }

    private void restoreTabs() {
        tabs.clear();
        try {
            SharedPreferences prefs = getSharedPreferences(BROWSER_PREFS, MODE_PRIVATE);
            JSONArray saved = new JSONArray(prefs.getString("tabs", "[]"));
            for (int i = 0; i < saved.length() && tabs.size() < MAX_TABS; i++) {
                JSONObject item = saved.optJSONObject(i);
                if (item == null) continue;
                String url = safe(item.optString("url"));
                if (!isAllowedUrl(url)) continue;
                tabs.add(new BrowserTab(item.optString("title", "Tab"), url));
            }
        } catch (Exception ignored) { }
        int found = -1;
        for (int i = 0; i < tabs.size(); i++) if (targetUrl.equals(tabs.get(i).url)) found = i;
        if (found < 0) {
            if (tabs.size() >= MAX_TABS) tabs.remove(0);
            tabs.add(new BrowserTab("Opening…", targetUrl));
            found = tabs.size() - 1;
        }
        activeTabIndex = found;
        persistTabs();
    }

    private void persistTabs() {
        try {
            JSONArray array = new JSONArray();
            for (BrowserTab tab : tabs) {
                JSONObject item = new JSONObject();
                item.put("title", tab.title);
                item.put("url", tab.url);
                array.put(item);
            }
            getSharedPreferences(BROWSER_PREFS, MODE_PRIVATE).edit().putString("tabs", array.toString()).putInt("active", activeTabIndex).apply();
        } catch (Exception ignored) { }
    }

    private void updateActiveTab(String url, String title) {
        if (tabs.isEmpty()) { tabs.add(new BrowserTab(title, url)); activeTabIndex = 0; }
        if (activeTabIndex < 0 || activeTabIndex >= tabs.size()) activeTabIndex = 0;
        BrowserTab tab = tabs.get(activeTabIndex);
        tab.url = safe(url);
        if (!safe(title).isEmpty()) tab.title = safe(title);
        persistTabs();
    }

    private void switchTab(int index) {
        if (index < 0 || index >= tabs.size()) return;
        activeTabIndex = index;
        BrowserTab tab = tabs.get(index);
        setManualControl(true, "Tab " + (index + 1) + "/" + tabs.size() + " · " + tab.title);
        webView.loadUrl(tab.url);
        persistTabs();
    }

    private void newTab() {
        if (tabs.size() >= MAX_TABS) { Toast.makeText(this, "Maximum " + MAX_TABS + " tabs.", Toast.LENGTH_SHORT).show(); return; }
        tabs.add(new BrowserTab("New tab", "https://www.google.com/"));
        switchTab(tabs.size() - 1);
    }

    private void closeCurrentTab() {
        if (tabs.size() <= 1) {
            tabs.clear(); tabs.add(new BrowserTab("Google", "https://www.google.com/")); activeTabIndex = 0;
        } else {
            tabs.remove(activeTabIndex);
            activeTabIndex = Math.max(0, Math.min(activeTabIndex, tabs.size() - 1));
        }
        switchTab(activeTabIndex);
    }

    private void showTabs() {
        String[] labels = new String[tabs.size()];
        for (int i = 0; i < tabs.size(); i++) {
            BrowserTab tab = tabs.get(i);
            labels[i] = (i == activeTabIndex ? "● " : "○ ") + (i + 1) + " · " + tab.title + "\n" + tab.url;
        }
        new AlertDialog.Builder(this).setTitle("Live Web tabs · " + tabs.size() + "/" + MAX_TABS)
                .setItems(labels, (dialog, which) -> switchTab(which))
                .setPositiveButton("+ New tab", (dialog, which) -> newTab())
                .setNeutralButton("Close current", (dialog, which) -> closeCurrentTab())
                .setNegativeButton("Done", null).show();
    }

    private JSONObject postControl(JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(controlEndpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + accessToken);
        connection.setRequestProperty("Content-Type", "application/json");
        try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder text = new StringBuilder();
        if (stream != null) try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line; while ((line = reader.readLine()) != null) text.append(line);
        }
        connection.disconnect();
        JSONObject result = text.length() == 0 ? new JSONObject() : new JSONObject(text.toString());
        if (status < 200 || status >= 300 || !result.optBoolean("success", false)) throw new IllegalStateException(result.optString("error", "HTTP " + status));
        return result;
    }

    private void recordHistory(String url, String title) {
        if (!isAllowedUrl(url)) return;
        browserExecutor.execute(() -> {
            try { JSONObject body = new JSONObject(); body.put("action", "history"); body.put("url", url); body.put("title", title); postControl(body); }
            catch (Exception ignored) { }
        });
    }

    private void showTools() {
        String[] items = new String[]{"Save/remove bookmark", "Bookmarks", "History", "Monitor 24×7"};
        new AlertDialog.Builder(this).setTitle("Live Web tools")
                .setMessage("Browser utilities only. Use the single Shruthi input in CentralHub for assistant commands.")
                .setItems(items, (dialog, which) -> {
                    if (which == 0) toggleBookmark();
                    else if (which == 1) showSavedList("bookmarks", "Bookmarks");
                    else if (which == 2) showSavedList("history", "History");
                    else if (which == 3) showMonitorMenu();
                }).setNegativeButton("Close", null).show();
    }

    private void toggleBookmark() {
        final String url = safe(webView.getUrl());
        final String title = safe(webView.getTitle());
        browserExecutor.execute(() -> {
            try {
                JSONObject body = new JSONObject(); body.put("action", "toggle_bookmark"); body.put("url", url); body.put("title", title);
                boolean saved = postControl(body).optBoolean("bookmarked", false);
                mainHandler.post(() -> Toast.makeText(this, saved ? "Bookmark saved." : "Bookmark removed.", Toast.LENGTH_SHORT).show());
            } catch (Exception error) { mainHandler.post(() -> failVisible("Bookmark failed.")); }
        });
    }

    private void showSavedList(String key, String title) {
        browserExecutor.execute(() -> {
            try {
                JSONObject body = new JSONObject(); body.put("action", "state");
                JSONArray rows = postControl(body).optJSONArray(key);
                mainHandler.post(() -> {
                    if (rows == null || rows.length() == 0) { Toast.makeText(this, "No " + title.toLowerCase(Locale.ROOT) + " yet.", Toast.LENGTH_SHORT).show(); return; }
                    int count = Math.min(50, rows.length());
                    String[] labels = new String[count];
                    for (int i = 0; i < count; i++) { JSONObject item = rows.optJSONObject(i); labels[i] = item.optString("title", item.optString("url")) + "\n" + item.optString("url"); }
                    new AlertDialog.Builder(this).setTitle(title).setItems(labels, (dialog, which) -> {
                        JSONObject item = rows.optJSONObject(which); if (item != null) navigateAddress(item.optString("url"));
                    }).setNegativeButton("Close", null).show();
                });
            } catch (Exception error) { mainHandler.post(() -> failVisible("Could not load " + title.toLowerCase(Locale.ROOT) + ".")); }
        });
    }

    private void showMonitorMenu() {
        final String url = safe(webView.getUrl());
        final String title = safe(webView.getTitle());
        String[] choices = new String[]{"Every 15 minutes", "Every 30 minutes", "Every 1 hour", "Every 3 hours", "Every 6 hours", "Every 12 hours", "Every 24 hours", "Stop monitoring"};
        int[] values = new int[]{15, 30, 60, 180, 360, 720, 1440};
        new AlertDialog.Builder(this).setTitle("Monitor this website 24×7").setMessage("Runs on CentralHub's backend even when this app is closed.")
                .setItems(choices, (dialog, which) -> {
                    boolean enable = which < values.length;
                    int minutes = enable ? values[which] : 0;
                    browserExecutor.execute(() -> {
                        try {
                            JSONObject body = new JSONObject(); body.put("action", enable ? "monitor" : "unmonitor"); body.put("url", url); body.put("title", title);
                            if (enable) body.put("interval_minutes", minutes); postControl(body);
                            mainHandler.post(() -> Toast.makeText(this, enable ? "24×7 monitoring enabled." : "Monitoring stopped.", Toast.LENGTH_SHORT).show());
                        } catch (Exception error) { mainHandler.post(() -> failVisible("Monitor update failed.")); }
                    });
                }).setNegativeButton("Cancel", null).show();
    }

    private void takeOverForBrowser() {
        if (!manualControl) {
            manualControl = true;
            if (takeoverButton != null) takeoverButton.setText("Continue Shruthi");
            setStatus("You have control · Shruthi is paused");
        }
    }

    private void navigateAddress(String raw) {
        takeOverForBrowser();
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return;
        if (value.contains(" ") || (!value.contains(".") && !value.startsWith("https://"))) value = "https://www.google.com/search?q=" + Uri.encode(value);
        else if (!value.startsWith("https://")) value = "https://" + value.replaceFirst("^http://", "");
        if (!isAllowedUrl(value)) { Toast.makeText(this, "Only public HTTPS websites can open in Live Web.", Toast.LENGTH_LONG).show(); return; }
        webView.loadUrl(value);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportMultipleWindows(false);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) settings.setOffscreenPreRaster(true);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { runOnUiThread(() -> handleWebPermissionRequest(request)); }
            @Override public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 85 && lastPageFinishedAt <= 0) pageLoading = true;
                else if (newProgress >= 90 && lastPageFinishedAt > 0) pageLoading = false;
            }
        });
        webView.setOnTouchListener((v, event) -> !manualControl && !syntheticInput);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String value = request.getUrl().toString();
                if (isAllowedUrl(value)) return false;
                setStatus("Blocked unsafe or non-HTTPS navigation");
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                navigationGeneration += 1;
                pageLoading = true;
                lastPageFinishedAt = 0L;
                if (addressView != null) addressView.setText(url);
                setStatus(manualControl ? "Loading…" : "Shruthi is waiting for the page…");
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageLoading = false;
                lastPageFinishedAt = System.currentTimeMillis();
                if (addressView != null) addressView.setText(url);
                if (!isAllowedUrl(url)) return;
                ShruthiBackgroundTaskService.updateUrl(NoraComputerActivity.this, url);
                updateActiveTab(url, safe(view.getTitle()));
                CookieManager.getInstance().flush();
                recordHistory(url, safe(view.getTitle()));
                if (!agentStarted) {
                    agentStarted = true;
                    setStatus("Shruthi is waiting for the page to settle…");
                    waitForPageReady(() -> requestAgent("start", null), 0);
                } else if (manualControl) setStatus("Live Web · " + safe(view.getTitle()));
            }
        });
    }

    private void waitForPageReady(Runnable ready, int attempt) {
        if (finishedOrDestroyed || webView == null) return;
        String current = safe(webView.getUrl());
        if (!isAllowedUrl(current)) {
            mainHandler.postDelayed(() -> waitForPageReady(ready, attempt + 1), 250L);
            return;
        }
        if (attempt >= PAGE_READY_MAX_ATTEMPTS) {
            setStatus("Page is interactive · Shruthi is checking it…");
            ready.run();
            return;
        }
        long now = System.currentTimeMillis();
        boolean stableEnough = webView.getProgress() >= 85 && lastPageFinishedAt > 0
                && now - lastPageFinishedAt >= PAGE_STABLE_MS && now - lastSyntheticActionAt >= PAGE_STABLE_MS;
        if (!stableEnough) {
            mainHandler.postDelayed(() -> waitForPageReady(ready, attempt + 1), 250L);
            return;
        }
        webView.evaluateJavascript("(function(){try{var s=document.readyState;var b=document.body;return ((s==='interactive'||s==='complete')&&b)?'ready':'loading'}catch(e){return 'loading'}})()", value -> {
            if (value != null && value.contains("ready")) ready.run();
            else mainHandler.postDelayed(() -> waitForPageReady(ready, attempt + 1), 250L);
        });
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        if (request == null) return;
        ArrayList<String> supportedResources = new ArrayList<>();
        boolean wantsMic = false, wantsCamera = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) { wantsMic = true; supportedResources.add(resource); }
            else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) { wantsCamera = true; supportedResources.add(resource); }
        }
        if (supportedResources.isEmpty()) { request.deny(); return; }
        if (!manualControl) { setManualControl(true, "Site permission requires your approval"); requestAgent("pause", null); }
        String host = request.getOrigin() == null ? "this website" : safe(request.getOrigin().getHost());
        String what = wantsMic && wantsCamera ? "microphone and camera" : wantsMic ? "microphone" : "camera";
        final boolean finalWantsMic = wantsMic, finalWantsCamera = wantsCamera;
        new AlertDialog.Builder(this).setTitle("Allow website permission?")
                .setMessage((host.isEmpty() ? "This website" : host) + " wants access to your " + what + ". Shruthi never grants website camera or microphone access automatically.")
                .setPositiveButton("Allow", (dialog, which) -> grantWebPermissionWithRuntimeCheck(request, finalWantsMic, finalWantsCamera))
                .setNegativeButton("Deny", (dialog, which) -> request.deny()).setCancelable(false).show();
    }

    private void grantWebPermissionWithRuntimeCheck(PermissionRequest request, boolean wantsMic, boolean wantsCamera) {
        ArrayList<String> missing = new ArrayList<>();
        if (wantsMic && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.RECORD_AUDIO);
        if (wantsCamera && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.CAMERA);
        if (missing.isEmpty()) { grantSupportedWebResources(request); return; }
        pendingWebPermissionRequest = request;
        requestPermissions(missing.toArray(new String[0]), WEB_PERMISSION_REQUEST_CODE);
    }

    private void grantSupportedWebResources(PermissionRequest request) {
        if (request == null) return;
        ArrayList<String> grant = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) grant.add(resource);
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) grant.add(resource);
        }
        if (grant.isEmpty()) request.deny(); else request.grant(grant.toArray(new String[0]));
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != WEB_PERMISSION_REQUEST_CODE) return;
        PermissionRequest request = pendingWebPermissionRequest;
        pendingWebPermissionRequest = null;
        if (request != null) grantSupportedWebResources(request);
    }

    private void toggleTakeover() {
        if (sessionCompleted) { finish(); return; }
        if (manualControl) {
            setManualControl(false, "Shruthi is resuming…");
            if (waitingSensitiveHandoff) {
                waitingSensitiveHandoff = false;
                liveVoicePausedForSecureInput = false;
                startLiveVoice();
                requestResume(false, "completed manually");
            } else if (!lastCallId.isEmpty()) captureAndContinue();
            else if (!lastResponseId.isEmpty()) requestResume(false, "Continue from the current screen after my manual check.");
            else waitForPageReady(() -> requestAgent("start", null), 0);
        } else {
            setManualControl(true, "You have control · Shruthi is paused");
            requestAgent("pause", null);
        }
    }

    private void setManualControl(boolean enabled, String status) {
        if (enabled && !manualControl) actionGeneration += 1;
        manualControl = enabled;
        if (takeoverButton != null) takeoverButton.setText(sessionCompleted ? "Return to Shruthi" : enabled ? "Continue Shruthi" : "Take over");
        setStatus(status);
    }

    private void addBrowserState(JSONObject body) {
        try {
            String current = webView == null ? targetUrl : safe(webView.getUrl());
            if (!isAllowedUrl(current)) current = targetUrl;
            body.put("current_url", current);
            body.put("page_title", webView == null ? "" : safe(webView.getTitle()));
            body.put("page_ready", isPageReadyNow());
            body.put("active_tab", activeTabIndex);
            body.put("navigation_generation", navigationGeneration);
        } catch (Exception ignored) { }
    }

    private boolean isPageReadyNow() {
        if (webView == null || webView.getProgress() < 85 || lastPageFinishedAt <= 0) return false;
        long now = System.currentTimeMillis();
        return now - lastPageFinishedAt >= PAGE_STABLE_MS && now - lastSyntheticActionAt >= PAGE_STABLE_MS;
    }

    private void requestAgent(String action, JSONObject extra) {
        if (finishedOrDestroyed) return;
        final JSONObject body = extra == null ? new JSONObject() : extra;
        try { body.put("action", action); body.put("session_id", sessionId); addBrowserState(body); }
        catch (Exception error) { failVisible("Shruthi could not prepare the browser state."); return; }
        networkExecutor.execute(() -> {
            try { JSONObject result = postJson(body); mainHandler.post(() -> handleAgentResult(result)); }
            catch (Exception error) { mainHandler.post(() -> failVisible("Shruthi could not continue: " + safe(error.getMessage()))); }
        });
    }

    private JSONObject postJson(JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(agentEndpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(40_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + accessToken);
        connection.setRequestProperty("Content-Type", "application/json");
        try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder text = new StringBuilder();
        if (stream != null) try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line; while ((line = reader.readLine()) != null) text.append(line);
        }
        connection.disconnect();
        JSONObject result = text.length() == 0 ? new JSONObject() : new JSONObject(text.toString());
        if (status < 200 || status >= 300 || !result.optBoolean("success", false)) throw new IllegalStateException(result.optString("error", "HTTP " + status));
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
                setManualControl(false, result.optString("current_step", "Shruthi is working…"));
                int batchGeneration = ++actionGeneration;
                executeActions(result.optJSONArray("actions"), 0, batchGeneration);
                break;
            case "input_required":
                handleInputRequest(result.optString("question", "Shruthi needs your input."), result.optBoolean("sensitive", false));
                break;
            case "approval_required":
                showApproval(result.optString("reason", "Shruthi reached an action that requires your approval."));
                break;
            case "completed":
                lastCallId = ""; lastResponseId = ""; lastStepId = ""; sessionCompleted = true;
                setManualControl(true, "Completed · " + result.optString("message", "Shruthi finished the task."));
                showCompletion(result.optString("message", "Shruthi completed and verified the task."));
                break;
            case "message":
                setManualControl(false, result.optString("message", "Got it · Shruthi is continuing…"));
                break;
            case "browser_fallback":
                applyBrowserFallback(result);
                break;
            case "paused": setManualControl(true, "Paused · you have control"); break;
            default: failVisible("Shruthi returned an unexpected computer state.");
        }
    }

    private void executeActions(JSONArray actions, int index, int generation) {
        if (finishedOrDestroyed || manualControl || generation != actionGeneration) return;
        if (actions == null || index >= actions.length()) { mainHandler.postDelayed(() -> { if (generation == actionGeneration) captureAndContinue(); }, 140L); return; }
        JSONObject action = actions.optJSONObject(index);
        if (action == null) { executeActions(actions, index + 1, generation); return; }
        String type = action.optString("type", "");
        long delay = "wait".equals(type) ? 1100L : 120L;
        try {
            switch (type) {
                case "click": tap((float) action.optDouble("x", 0), (float) action.optDouble("y", 0), false); break;
                case "double_click": tap((float) action.optDouble("x", 0), (float) action.optDouble("y", 0), true); break;
                case "drag": drag(action.optJSONArray("path")); break;
                case "scroll": scroll(action.optInt("scroll_x", 0), action.optInt("scroll_y", 0)); break;
                case "keypress": keypress(action.optJSONArray("keys")); break;
                case "type": typeText(action.optString("text", "")); break;
                case "move": case "screenshot": case "wait": break;
                default: failVisible("Shruthi requested an unsupported action: " + type); return;
            }
        } catch (Exception error) { failVisible("Shruthi action failed: " + safe(error.getMessage())); return; }
        if (!"wait".equals(type) && !"screenshot".equals(type) && !"move".equals(type)) lastSyntheticActionAt = System.currentTimeMillis();
        mainHandler.postDelayed(() -> executeActions(actions, index + 1, generation), delay);
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
        JSONObject first = path.optJSONObject(0); if (first == null) return;
        syntheticInput = true;
        long start = android.os.SystemClock.uptimeMillis();
        webView.dispatchTouchEvent(MotionEvent.obtain(start, start, MotionEvent.ACTION_DOWN, (float) first.optDouble("x"), (float) first.optDouble("y"), 0));
        for (int i = 1; i < path.length(); i++) {
            JSONObject point = path.optJSONObject(i); if (point == null) continue;
            webView.dispatchTouchEvent(MotionEvent.obtain(start, start + i * 35L, MotionEvent.ACTION_MOVE, (float) point.optDouble("x"), (float) point.optDouble("y"), 0));
        }
        JSONObject last = path.optJSONObject(path.length() - 1);
        webView.dispatchTouchEvent(MotionEvent.obtain(start, start + path.length() * 35L, MotionEvent.ACTION_UP, (float) last.optDouble("x"), (float) last.optDouble("y"), 0));
        syntheticInput = false;
    }

    private void scroll(int dx, int dy) {
        webView.scrollBy(dx, dy);
        String js = "try{var e=document.elementFromPoint(innerWidth/2,innerHeight/2);for(;e&&e!==document.body;e=e.parentElement){var s=getComputedStyle(e);if(/auto|scroll/.test(s.overflowY)&&e.scrollHeight>e.clientHeight){e.scrollBy(" + dx + "," + dy + ");break;}}}catch(_){window.scrollBy(" + dx + "," + dy + ");}";
        webView.evaluateJavascript(js, null);
    }

    private void typeText(String text) {
        if (text == null || text.isEmpty()) return;
        String quoted = JSONObject.quote(text);
        String js = "(function(){var e=document.activeElement;if(!e)return false;var t=" + quoted + ";try{if(document.execCommand&&document.execCommand('insertText',false,t))return true;}catch(_){}try{var p=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value');var v=(typeof e.value==='string'?e.value:'')+t;if(p&&p.set)p.set.call(e,v);else e.value=v;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:t}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;}catch(_){return false;}})();";
        webView.evaluateJavascript(js, null);
    }

    private void keypress(JSONArray keys) {
        if (keys == null || keys.length() == 0) return;
        boolean ctrl = false; String primary = "";
        for (int i = 0; i < keys.length(); i++) {
            String k = keys.optString(i, "");
            if ("CTRL".equalsIgnoreCase(k) || "CONTROL".equalsIgnoreCase(k)) ctrl = true; else primary = k;
        }
        if (ctrl && "A".equalsIgnoreCase(primary)) { webView.evaluateJavascript("try{document.activeElement&&document.activeElement.select&&document.activeElement.select()}catch(_){}", null); return; }
        int code = keyCode(primary); if (code == KeyEvent.KEYCODE_UNKNOWN) return;
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
            default: return key.length() == 1 ? KeyEvent.keyCodeFromString("KEYCODE_" + key.toUpperCase(Locale.ROOT)) : KeyEvent.KEYCODE_UNKNOWN;
        }
    }

    private void captureAndContinue() {
        waitForPageReady(this::captureReadyPageAndContinue, 0);
    }

    private void captureReadyPageAndContinue() {
        if (finishedOrDestroyed || manualControl || webView == null || webView.getWidth() <= 0 || webView.getHeight() <= 0 || lastResponseId.isEmpty() || lastCallId.isEmpty()) return;
        try {
            Bitmap bitmap = Bitmap.createBitmap(webView.getWidth(), webView.getHeight(), Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap); webView.draw(canvas);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 84, output); bitmap.recycle();
            JSONObject extra = new JSONObject();
            extra.put("screenshot_mime", "image/jpeg");
            extra.put("previous_response_id", lastResponseId);
            extra.put("call_id", lastCallId);
            extra.put("step_id", lastStepId);
            extra.put("screenshot_base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            addBrowserState(extra);
            setStatus("Shruthi is checking the current page…");
            requestAgent("continue", extra);
        } catch (Exception error) { failVisible("Could not capture Shruthi browser state."); }
    }


    private void applyBrowserFallback(JSONObject result) {
        String fallbackUrl = safe(result.optString("url", webView == null ? targetUrl : webView.getUrl()));
        boolean useDesktop = result.optBoolean("desktop_mode", true);
        if (!isAllowedUrl(fallbackUrl)) { failVisible("Shruthi could not open the safe fallback page."); return; }
        if (useDesktop && webView != null) {
            desktopMode = true;
            WebSettings settings = webView.getSettings();
            String ua = settings.getUserAgentString();
            if (ua == null) ua = "";
            ua = ua.replace("; wv", "").replace(" Mobile ", " ").replace(" Mobile", "");
            if (!ua.contains("X11")) {
                ua = ua.replace("Linux; Android", "X11; Linux x86_64");
            }
            settings.setUserAgentString(ua);
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
        }
        setManualControl(false, result.optString("message", "Shruthi is switching to a web fallback…"));
        pageLoading = true;
        lastPageFinishedAt = 0L;
        webView.loadUrl(fallbackUrl);
        mainHandler.postDelayed(() -> waitForPageReady(() -> requestResume(false, "The fallback web page is loaded. Continue the same task from the current screen."), 0), 350L);
    }

    private void handleInputRequest(String question, boolean sensitive) {
        lastCallId = "";
        if (sensitive) {
            waitingSensitiveHandoff = true;
            liveVoicePausedForSecureInput = true;
            stopLiveVoice();
            setManualControl(true, "Your turn · secure step · voice paused");
            new AlertDialog.Builder(this).setTitle("Shruthi needs you")
                    .setMessage(question + "\n\nComplete this directly in the browser. Live voice is paused so passwords, OTPs, passkeys and CAPTCHA responses are not captured. Then tap Continue Shruthi.")
                    .setPositiveButton("Take over", null).show();
            return;
        }
        waitingForVoiceAnswer = true;
        setManualControl(true, "Shruthi needs one detail · answer by voice or take over");
        new AlertDialog.Builder(this).setTitle("Shruthi needs one detail")
                .setMessage(question + "\n\nYou can answer Shruthi out loud here, or use the browser manually.")
                .setPositiveButton("Answer by voice", null)
                .setNegativeButton("Take over", null).show();
    }


    private void startLiveVoice() {
        if (finishedOrDestroyed || liveVoicePausedForSecureInput || publishableKey.isEmpty() || accessToken.isEmpty() || supabaseUrl.isEmpty() || liveVoiceClient != null) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { setVoiceState("Voice off"); return; }
        ShruthiRealtimeVoiceClient client = new ShruthiRealtimeVoiceClient(this, accessToken, supabaseUrl, publishableKey, sessionId, new ShruthiRealtimeVoiceClient.Listener() {
            @Override public void onState(String state) { runOnUiThread(() -> setVoiceState(state)); }
            @Override public void onUserTranscript(String text) { runOnUiThread(() -> handleLiveVoiceTranscript(text)); }
            @Override public void onAssistantTranscript(String text) { runOnUiThread(() -> handleLiveVoiceAssistantTranscript(text)); }
            @Override public void onError(String message) { runOnUiThread(() -> setVoiceState("Voice retry")); }
        });
        liveVoiceClient = client;
        client.connect();
    }

    private void stopLiveVoice() {
        ShruthiRealtimeVoiceClient client = liveVoiceClient;
        liveVoiceClient = null;
        if (client != null) client.release();
        setVoiceState(liveVoicePausedForSecureInput ? "Voice paused" : "Voice off");
    }

    private void setVoiceState(String state) {
        if (voiceStateView == null) return;
        String value = state == null ? "" : state.toLowerCase(Locale.ROOT);
        if (value.contains("listen")) voiceStateView.setText("● Listening");
        else if (value.contains("speak")) voiceStateView.setText("● Speaking");
        else if (value.contains("think") || value.contains("connect") || value.contains("reconnect")) voiceStateView.setText("● Thinking");
        else if (value.contains("paused")) voiceStateView.setText("Voice paused");
        else if (value.contains("retry") || value.contains("error")) voiceStateView.setText("Voice retry");
        else voiceStateView.setText("Voice");
    }

    private boolean looksSensitiveVoiceText(String text) {
        String value = text == null ? "" : text.toLowerCase(Locale.ROOT);
        return value.matches(".*\\b(password|passcode|otp|2fa|two[- ]factor|captcha|security code|recovery code|api key|private key|card number|cvv)\\b.*");
    }

    private void handleLiveVoiceTranscript(String rawText) {
        String text = safe(rawText);
        if (text.isEmpty() || finishedOrDestroyed) return;
        lastVoiceUserText = text;
        if (looksSensitiveVoiceText(text)) { lastVoiceUserText = ""; setStatus("Sensitive value was not sent · enter it directly in the page"); return; }

        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.matches(".*\\b(stop|pause|wait|hold on|hold up)\\b.*")) {
            actionGeneration += 1;
            setManualControl(true, "Paused by voice · you have control");
            requestAgent("pause", null);
            return;
        }
        if (waitingForVoiceAnswer) {
            waitingForVoiceAnswer = false;
            setManualControl(false, "Got it · Shruthi is continuing…");
            requestResume(false, text);
            return;
        }
        if (waitingSensitiveHandoff) { setStatus("Secure step is manual · finish it, then tap Continue Shruthi"); return; }
        if (manualControl && lower.matches(".*\\b(continue|resume|go on|carry on)\\b.*")) {
            setManualControl(false, "Shruthi is resuming…");
            requestResume(false, "Continue from the current page.");
            return;
        }
        sendVoiceMessageToAgent(text);
    }

    private void handleLiveVoiceAssistantTranscript(String text) {
        String assistantText = safe(text);
        String userText = lastVoiceUserText;
        lastVoiceUserText = "";
        if (assistantText.isEmpty() || userText.isEmpty() || looksSensitiveVoiceText(userText)) return;
        browserExecutor.execute(() -> recordRealtimeTurn(userText, assistantText));
    }

    private void recordRealtimeTurn(String userText, String assistantText) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(voiceEndpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + accessToken);
            connection.setRequestProperty("apikey", publishableKey);
            connection.setRequestProperty("Content-Type", "application/json");
            JSONObject body = new JSONObject();
            body.put("action", "record_realtime_turn");
            body.put("user_text", userText);
            body.put("assistant_text", assistantText);
            body.put("page_context", "live_web:" + sessionId);
            try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            try { connection.getResponseCode(); } finally { connection.disconnect(); }
        } catch (Exception ignored) { }
    }

    private void sendVoiceMessageToAgent(String text) {
        actionGeneration += 1;
        setManualControl(false, "Heard you · Shruthi is adjusting…");
        JSONObject extra = new JSONObject();
        try {
            extra.put("user_message", text);
            if (!lastResponseId.isEmpty()) extra.put("previous_response_id", lastResponseId);
            if (!lastCallId.isEmpty()) extra.put("call_id", lastCallId);
            if (!lastStepId.isEmpty()) extra.put("step_id", lastStepId);
            if (webView != null && webView.getWidth() > 0 && webView.getHeight() > 0) {
                Bitmap bitmap = Bitmap.createBitmap(webView.getWidth(), webView.getHeight(), Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap); webView.draw(canvas);
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.JPEG, 78, output); bitmap.recycle();
                extra.put("screenshot_mime", "image/jpeg");
                extra.put("screenshot_base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            }
            addBrowserState(extra);
        } catch (Exception error) { failVisible("Shruthi could not attach your browser context."); return; }
        requestAgent("user_message", extra);
    }

    private void showApproval(String reason) {
        lastCallId = "";
        setManualControl(true, "Approval required before Shruthi continues");
        new AlertDialog.Builder(this).setTitle("Approve Shruthi action?").setMessage(reason)
                .setPositiveButton("Approve", (dialog, which) -> { setManualControl(false, "Approved · Shruthi is continuing…"); requestResume(true, ""); })
                .setNegativeButton("Not now", (dialog, which) -> { setManualControl(true, "Not approved · Shruthi is paused"); requestAgent("pause", null); })
                .setCancelable(false).show();
    }

    private void requestResume(boolean approved, String answer) {
        try {
            JSONObject extra = new JSONObject(); extra.put("previous_response_id", lastResponseId);
            if (approved) extra.put("approved", true); if (answer != null && !answer.isEmpty()) extra.put("answer", answer);
            addBrowserState(extra); requestAgent("resume", extra);
        } catch (Exception error) { failVisible("Shruthi could not resume."); }
    }

    private void showCompletion(String message) {
        new AlertDialog.Builder(this).setTitle("Shruthi finished").setMessage(message)
                .setPositiveButton("Stay in Live Web", null)
                .setNegativeButton("Return to Shruthi", (dialog, which) -> finish()).show();
    }

    private void cancelAndClose() {
        if (finishedOrDestroyed) return;
        ShruthiBackgroundTaskService.stop(this);
        if (sessionCompleted) { finish(); return; }
        setStatus("Ending Shruthi task…");
        networkExecutor.execute(() -> {
            try { JSONObject body = new JSONObject(); body.put("action", "cancel"); body.put("session_id", sessionId); addBrowserState(body); postJson(body); }
            catch (Exception ignored) { }
            mainHandler.post(this::finish);
        });
    }

    private void failVisible(String message) {
        setManualControl(true, message);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
    private void setStatus(String value) { if (statusView != null) statusView.setText(value == null || value.isEmpty() ? "Shruthi Live Web" : value); }

    private boolean isAllowedUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
            String host = uri.getHost(); if (host == null) return false;
            host = host.toLowerCase(Locale.ROOT);
            if (host.equals("localhost") || host.endsWith(".local") || host.equals("::1") || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return false;
            if (host.startsWith("172.")) {
                String[] parts = host.split("\\.");
                if (parts.length > 1) try { int second = Integer.parseInt(parts[1]); if (second >= 16 && second <= 31) return false; } catch (Exception ignored) { }
            }
            return true;
        } catch (Exception ignored) { return false; }
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private String safe(String value) { return value == null ? "" : value.trim(); }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) { takeOverForBrowser(); webView.goBack(); return; }
        new AlertDialog.Builder(this).setTitle("Return to Shruthi?")
                .setMessage("The Live Web tool will close and the main Shruthi conversation will remain your only assistant input.")
                .setPositiveButton("Return", (dialog, which) -> { ShruthiBackgroundTaskService.stop(this); if (!sessionCompleted) requestAgent("pause", null); finish(); })
                .setNegativeButton("Stay", null).show();
    }

    @Override protected void onResume() {
        super.onResume();
        ShruthiBackgroundTaskService.markVisible(this);
        if (!liveVoicePausedForSecureInput) startLiveVoice();
    }

    @Override protected void onPause() {
        ShruthiBackgroundTaskService.markBackground(this);
        stopLiveVoice();
        super.onPause();
    }

    @Override protected void onDestroy() {
        finishedOrDestroyed = true;
        stopLiveVoice();
        mainHandler.removeCallbacksAndMessages(null);
        if (pendingWebPermissionRequest != null) { try { pendingWebPermissionRequest.deny(); } catch (Exception ignored) { } pendingWebPermissionRequest = null; }
        networkExecutor.shutdownNow(); browserExecutor.shutdownNow();
        if (webView != null) {
            CookieManager.getInstance().flush();
            webView.stopLoading(); webView.setWebChromeClient(null); webView.setWebViewClient(null); webView.destroy(); webView = null;
        }
        super.onDestroy();
    }
}
