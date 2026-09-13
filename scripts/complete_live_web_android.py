from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing expected fragment: {label}")
    return text.replace(old, new, 1)


p = Path('android/app/src/main/java/com/centralhub/network/NoraComputerActivity.java')
s = p.read_text()

s = replace_once(s,
'''import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;''',
'''import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;''',
'import SharedPreferences')

s = replace_once(s,
'''import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;''',
'''import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.ExecutorService;''',
'import ArrayList')

s = replace_once(s,
'''    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();

    private WebView webView;''',
'''    private static final String BROWSER_PREFS = "centralhub_live_web_browser";
    private static final int MAX_TABS = 8;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService browserExecutor = Executors.newSingleThreadExecutor();
    private final ArrayList<BrowserTab> tabs = new ArrayList<>();

    private WebView webView;''',
'browser fields')

s = replace_once(s,
'''    private String accessToken;
    private String agentEndpoint;
    private boolean agentStarted = false;''',
'''    private String accessToken;
    private String supabaseUrl;
    private String agentEndpoint;
    private String controlEndpoint;
    private int activeTabIndex = 0;
    private boolean agentStarted = false;''',
'control endpoint fields')

s = replace_once(s,
'''    private String lastCallId = "";
    private String lastStepId = "";

    @Override''',
'''    private String lastCallId = "";
    private String lastStepId = "";

    private static final class BrowserTab {
        String title;
        String url;

        BrowserTab(String title, String url) {
            this.title = title == null || title.trim().isEmpty() ? "New tab" : title.trim();
            this.url = url == null ? "" : url.trim();
        }
    }

    @Override''',
'BrowserTab class')

s = replace_once(s,
'''        accessToken = safe(intent.getStringExtra(EXTRA_ACCESS_TOKEN));
        String supabaseUrl = safe(intent.getStringExtra(EXTRA_SUPABASE_URL)).replaceAll("/+$", "");
        agentEndpoint = supabaseUrl + "/functions/v1/nora-computer-agent";''',
'''        accessToken = safe(intent.getStringExtra(EXTRA_ACCESS_TOKEN));
        supabaseUrl = safe(intent.getStringExtra(EXTRA_SUPABASE_URL)).replaceAll("/+$", "");
        agentEndpoint = supabaseUrl + "/functions/v1/nora-computer-agent";
        controlEndpoint = supabaseUrl + "/functions/v1/live-web-control";''',
'control endpoint setup')

s = replace_once(s,
'''        buildUi();
        configureWebView();
        setManualControl(false, "NORA is opening the secure browser…");
        webView.loadUrl(targetUrl);''',
'''        buildUi();
        configureWebView();
        restoreTabs();
        setManualControl(false, "Shruthi is opening Live Web…");
        webView.loadUrl(targetUrl);''',
'restore tabs')

s = replace_once(s,
'''        Button check = browserButton("Check");
        check.setOnClickListener(v -> askShruthi("Check the current page for meaningful changes, risks, unusual information, or anything relevant to CentralHub. Summarize what matters."));
        nav.addView(check, new LinearLayout.LayoutParams(dp(70), dp(42)));

        Button ask = browserButton("Ask");
        ask.setOnClickListener(v -> askShruthi(null));
        nav.addView(ask, new LinearLayout.LayoutParams(dp(58), dp(42)));''',
'''        Button tabsButton = browserButton("Tabs");
        tabsButton.setOnClickListener(v -> showTabs());
        nav.addView(tabsButton, new LinearLayout.LayoutParams(dp(66), dp(42)));

        Button toolsButton = browserButton("Tools");
        toolsButton.setOnClickListener(v -> showTools());
        nav.addView(toolsButton, new LinearLayout.LayoutParams(dp(66), dp(42)));''',
'nav tools')

marker = '''    private Button browserButton(String label) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setTextSize(11f);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(3), 0, dp(3), 0);
        return button;
    }

'''
helpers = r'''    private Button browserButton(String label) {
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
        for (int i = 0; i < tabs.size(); i++) {
            if (targetUrl.equals(tabs.get(i).url)) found = i;
        }
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
            getSharedPreferences(BROWSER_PREFS, MODE_PRIVATE).edit()
                    .putString("tabs", array.toString())
                    .putInt("active", activeTabIndex)
                    .apply();
        } catch (Exception ignored) { }
    }

    private void updateActiveTab(String url, String title) {
        if (tabs.isEmpty()) {
            tabs.add(new BrowserTab(title, url));
            activeTabIndex = 0;
        }
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
        agentStarted = true;
        lastResponseId = "";
        lastCallId = "";
        lastStepId = "";
        waitingSensitiveHandoff = false;
        setManualControl(true, "Tab " + (index + 1) + "/" + tabs.size() + " · " + tab.title);
        webView.loadUrl(tab.url);
        persistTabs();
    }

    private void newTab() {
        if (tabs.size() >= MAX_TABS) {
            Toast.makeText(this, "Maximum " + MAX_TABS + " tabs.", Toast.LENGTH_SHORT).show();
            return;
        }
        tabs.add(new BrowserTab("New tab", "https://www.google.com/"));
        switchTab(tabs.size() - 1);
    }

    private void closeCurrentTab() {
        if (tabs.size() <= 1) {
            tabs.clear();
            tabs.add(new BrowserTab("Google", "https://www.google.com/"));
            activeTabIndex = 0;
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
        new AlertDialog.Builder(this)
                .setTitle("Live Web tabs · " + tabs.size() + "/" + MAX_TABS)
                .setItems(labels, (dialog, which) -> switchTab(which))
                .setPositiveButton("+ New tab", (dialog, which) -> newTab())
                .setNeutralButton("Close current", (dialog, which) -> closeCurrentTab())
                .setNegativeButton("Done", null)
                .show();
    }

    private JSONObject postControl(JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(controlEndpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + accessToken);
        connection.setRequestProperty("Content-Type", "application/json");
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body.toString().getBytes(StandardCharsets.UTF_8));
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

    private void recordHistory(String url, String title) {
        if (!isAllowedUrl(url)) return;
        browserExecutor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "history");
                body.put("url", url);
                body.put("title", title);
                postControl(body);
            } catch (Exception ignored) { }
        });
    }

    private void showTools() {
        String[] items = new String[]{
                "Save/remove bookmark", "Bookmarks", "History", "Monitor 24×7", "Check page", "Ask Shruthi"
        };
        new AlertDialog.Builder(this)
                .setTitle("Live Web tools")
                .setItems(items, (dialog, which) -> {
                    if (which == 0) toggleBookmark();
                    else if (which == 1) showSavedList("bookmarks", "Bookmarks");
                    else if (which == 2) showSavedList("history", "History");
                    else if (which == 3) showMonitorMenu();
                    else if (which == 4) askShruthi("Check the current page for meaningful changes, risks, unusual information, or anything relevant to CentralHub. Summarize what matters.");
                    else askShruthi(null);
                })
                .setNegativeButton("Close", null)
                .show();
    }

    private void toggleBookmark() {
        final String url = safe(webView.getUrl());
        final String title = safe(webView.getTitle());
        browserExecutor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "toggle_bookmark");
                body.put("url", url);
                body.put("title", title);
                boolean saved = postControl(body).optBoolean("bookmarked", false);
                mainHandler.post(() -> Toast.makeText(this, saved ? "Bookmark saved." : "Bookmark removed.", Toast.LENGTH_SHORT).show());
            } catch (Exception error) {
                mainHandler.post(() -> failVisible("Bookmark failed."));
            }
        });
    }

    private void showSavedList(String key, String title) {
        browserExecutor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "state");
                JSONArray rows = postControl(body).optJSONArray(key);
                mainHandler.post(() -> {
                    if (rows == null || rows.length() == 0) {
                        Toast.makeText(this, "No " + title.toLowerCase(Locale.ROOT) + " yet.", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    int count = Math.min(50, rows.length());
                    String[] labels = new String[count];
                    for (int i = 0; i < count; i++) {
                        JSONObject item = rows.optJSONObject(i);
                        labels[i] = item.optString("title", item.optString("url")) + "\n" + item.optString("url");
                    }
                    new AlertDialog.Builder(this)
                            .setTitle(title)
                            .setItems(labels, (dialog, which) -> {
                                JSONObject item = rows.optJSONObject(which);
                                if (item != null) navigateAddress(item.optString("url"));
                            })
                            .setNegativeButton("Close", null)
                            .show();
                });
            } catch (Exception error) {
                mainHandler.post(() -> failVisible("Could not load " + title.toLowerCase(Locale.ROOT) + "."));
            }
        });
    }

    private void showMonitorMenu() {
        final String url = safe(webView.getUrl());
        final String title = safe(webView.getTitle());
        String[] choices = new String[]{
                "Every 15 minutes", "Every 30 minutes", "Every 1 hour", "Every 3 hours",
                "Every 6 hours", "Every 12 hours", "Every 24 hours", "Stop monitoring"
        };
        int[] values = new int[]{15, 30, 60, 180, 360, 720, 1440};
        new AlertDialog.Builder(this)
                .setTitle("Monitor this website 24×7")
                .setMessage("Runs on CentralHub's backend even when this app is closed.")
                .setItems(choices, (dialog, which) -> {
                    boolean enable = which < values.length;
                    int minutes = enable ? values[which] : 0;
                    browserExecutor.execute(() -> {
                        try {
                            JSONObject body = new JSONObject();
                            body.put("action", enable ? "monitor" : "unmonitor");
                            body.put("url", url);
                            body.put("title", title);
                            if (enable) body.put("interval_minutes", minutes);
                            postControl(body);
                            mainHandler.post(() -> Toast.makeText(this, enable ? "24×7 monitoring enabled." : "Monitoring stopped.", Toast.LENGTH_SHORT).show());
                        } catch (Exception error) {
                            mainHandler.post(() -> failVisible("Monitor update failed."));
                        }
                    });
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void startFreshAgentSession(String goal) {
        final String url = safe(webView.getUrl());
        if (!isAllowedUrl(url)) return;
        setManualControl(true, "Preparing a fresh Shruthi session…");
        browserExecutor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "new_session");
                body.put("url", url);
                body.put("goal", goal);
                String freshId = safe(postControl(body).optString("session_id"));
                if (freshId.isEmpty()) throw new IllegalStateException("session_create_failed");
                mainHandler.post(() -> {
                    sessionId = freshId;
                    lastResponseId = "";
                    lastCallId = "";
                    lastStepId = "";
                    waitingSensitiveHandoff = false;
                    agentStarted = true;
                    setManualControl(false, "Shruthi is inspecting this page…");
                    requestAgent("start", null);
                });
            } catch (Exception error) {
                mainHandler.post(() -> failVisible("Shruthi could not start a fresh page session."));
            }
        });
    }

'''
s = replace_once(s, marker, helpers, 'browser helper block')

s = replace_once(s,
'''    private void takeOverForBrowser() {
        if (!manualControl) {
            manualControl = true;
            if (takeoverButton != null) takeoverButton.setText("Continue NORA");
            setStatus("You have control · Shruthi is paused");
            requestAgent("pause", null);
        }
    }
''',
'''    private void takeOverForBrowser() {
        if (!manualControl) {
            manualControl = true;
            if (takeoverButton != null) takeoverButton.setText("Continue Shruthi");
            setStatus("You have control · Shruthi is paused");
        }
    }
''',
'takeover behavior')

s = replace_once(s,
'''    private void askShruthi(String preset) {
        if (lastResponseId.isEmpty()) {
            Toast.makeText(this, "Shruthi is still connecting to this page. Try again in a moment.", Toast.LENGTH_SHORT).show();
            return;
        }
        takeOverForBrowser();
        if (preset != null && !preset.isEmpty()) {
            setManualControl(false, "Shruthi is checking this page…");
            requestResume(false, preset + " Current page: " + safe(webView.getUrl()));
            return;
        }
        EditText input = new EditText(this);
        input.setSingleLine(false);
        input.setHint("Ask Shruthi about this page…");
        new AlertDialog.Builder(this)
                .setTitle("Ask Shruthi")
                .setMessage("Shruthi can inspect the visible page. Login secrets, OTPs and CAPTCHA stay manual.")
                .setView(input)
                .setPositiveButton("Ask", (dialog, which) -> {
                    String question = input.getText().toString().trim();
                    if (question.isEmpty()) return;
                    setManualControl(false, "Shruthi is checking this page…");
                    requestResume(false, question + " Current page: " + safe(webView.getUrl()));
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
''',
'''    private void askShruthi(String preset) {
        takeOverForBrowser();
        if (preset != null && !preset.isEmpty()) {
            startFreshAgentSession(preset + " Current page: " + safe(webView.getUrl()));
            return;
        }
        EditText input = new EditText(this);
        input.setSingleLine(false);
        input.setHint("Ask Shruthi about this page…");
        new AlertDialog.Builder(this)
                .setTitle("Ask Shruthi")
                .setMessage("Shruthi can inspect the visible page. Login secrets, OTPs and CAPTCHA stay manual.")
                .setView(input)
                .setPositiveButton("Ask", (dialog, which) -> {
                    String question = input.getText().toString().trim();
                    if (question.isEmpty()) return;
                    startFreshAgentSession(question + " Current page: " + safe(webView.getUrl()));
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
''',
'fresh page agent')

s = replace_once(s,
'''                if (addressView != null) addressView.setText(url);
                if (!isAllowedUrl(url)) return;
                if (!agentStarted) {
                    agentStarted = true;
                    setStatus("NORA is inspecting the page…");
                    mainHandler.postDelayed(() -> requestAgent("start", null), 900L);
                }
''',
'''                if (addressView != null) addressView.setText(url);
                if (!isAllowedUrl(url)) return;
                updateActiveTab(url, safe(view.getTitle()));
                recordHistory(url, safe(view.getTitle()));
                if (!agentStarted) {
                    agentStarted = true;
                    setStatus("Shruthi is inspecting the page…");
                    mainHandler.postDelayed(() -> requestAgent("start", null), 900L);
                } else if (manualControl) {
                    setStatus("Live Web · " + safe(view.getTitle()));
                }
''',
'page tracking')

s = replace_once(s,
'''            } else {
                requestResume(false, "Continue from the current screen after my manual check.");
            }''',
'''            } else if (!lastResponseId.isEmpty()) {
                requestResume(false, "Continue from the current screen after my manual check.");
            } else {
                startFreshAgentSession("Continue helping from the current visible page. Inspect it first, then proceed carefully.");
            }''',
'continue fresh session')

s = replace_once(s,
'''        if (takeoverButton != null) takeoverButton.setText(enabled ? "Continue NORA" : "Take over");''',
'''        if (takeoverButton != null) takeoverButton.setText(enabled ? "Continue Shruthi" : "Take over");''',
'button label')

s = replace_once(s,
'''            case "completed":
                lastCallId = "";
                setManualControl(true, "Completed · " + result.optString("message", "NORA finished the task."));''',
'''            case "completed":
                lastCallId = "";
                lastResponseId = "";
                lastStepId = "";
                setManualControl(true, "Completed · " + result.optString("message", "Shruthi finished the task."));''',
'completed reset')

s = replace_once(s,
'''    private void showCompletion(String message) {
        new AlertDialog.Builder(this)
                .setTitle("NORA finished")
                .setMessage(message)
                .setPositiveButton("Return to CentralHub", (dialog, which) -> finish())
                .setNegativeButton("View result", null)
                .show();
    }''',
'''    private void showCompletion(String message) {
        new AlertDialog.Builder(this)
                .setTitle("Shruthi finished")
                .setMessage(message)
                .setPositiveButton("Stay in Live Web", null)
                .setNegativeButton("Return to CentralHub", (dialog, which) -> finish())
                .show();
    }''',
'completion browser stays open')

s = replace_once(s,
'''        networkExecutor.shutdownNow();
        if (webView != null) {''',
'''        networkExecutor.shutdownNow();
        browserExecutor.shutdownNow();
        if (webView != null) {''',
'browser executor shutdown')

p.write_text(s)

manifest = Path('android/app/src/main/AndroidManifest.xml')
m = manifest.read_text().replace('android:label="NORA Live Action"', 'android:label="Shruthi Live Web"')
manifest.write_text(m)
