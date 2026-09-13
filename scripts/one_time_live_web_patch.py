from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing expected fragment: {label}")
    return text.replace(old, new, 1)


# ---------- Native updater bridge ----------
p = Path('android/app/src/main/java/com/centralhub/network/CentralHubNativeBridge.java')
s = p.read_text()
s = replace_once(
    s,
    'import android.content.Context;\nimport android.content.Intent;\nimport android.content.pm.PackageInfo;\nimport android.net.Uri;\nimport android.os.Build;\n',
    'import android.app.DownloadManager;\nimport android.content.Context;\nimport android.content.Intent;\nimport android.content.pm.PackageInfo;\nimport android.database.Cursor;\nimport android.net.Uri;\nimport android.os.Build;\nimport android.os.Environment;\nimport android.provider.Settings;\n',
    'native bridge imports',
)
marker = '    @JavascriptInterface\n    public boolean openExternalUrl(String value) {\n'
updater = r'''    /** Download CentralHub APK updates without handing the URL to Chrome. */
    @JavascriptInterface
    public long startAppUpdateDownload(String value, String versionName) {
        if (value == null || value.trim().isEmpty()) return -1L;
        try {
            Uri uri = Uri.parse(value.trim());
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null) return -1L;
            String normalizedHost = host.toLowerCase(Locale.ROOT);
            boolean allowed = normalizedHost.equals("github.com")
                    || normalizedHost.endsWith(".githubusercontent.com")
                    || normalizedHost.equals("centralhub.network");
            if (!allowed) return -1L;

            String safeVersion = versionName == null ? "latest" : versionName.replaceAll("[^A-Za-z0-9._-]", "-");
            DownloadManager.Request request = new DownloadManager.Request(uri)
                    .setTitle("CentralHub " + safeVersion)
                    .setDescription("Downloading Android update")
                    .setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(false);
            request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "centralhub-" + safeVersion + ".apk");
            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            return manager == null ? -1L : manager.enqueue(request);
        } catch (Exception ignored) {
            return -1L;
        }
    }

    @JavascriptInterface
    public String getAppUpdateDownloadStatus(long downloadId) {
        if (downloadId <= 0) return "{\"status\":\"invalid\",\"progress\":0}";
        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) return "{\"status\":\"failed\",\"progress\":0}";
        Cursor cursor = null;
        try {
            cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId));
            if (cursor == null || !cursor.moveToFirst()) return "{\"status\":\"missing\",\"progress\":0}";
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
            long soFar = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            int progress = total > 0 ? (int) Math.min(100L, Math.max(0L, (soFar * 100L) / total)) : 0;
            String state;
            switch (status) {
                case DownloadManager.STATUS_PENDING: state = "pending"; break;
                case DownloadManager.STATUS_RUNNING: state = "running"; break;
                case DownloadManager.STATUS_PAUSED: state = "paused"; break;
                case DownloadManager.STATUS_SUCCESSFUL: state = "successful"; progress = 100; break;
                case DownloadManager.STATUS_FAILED: state = "failed"; break;
                default: state = "unknown"; break;
            }
            return "{\"status\":\"" + state + "\",\"progress\":" + progress + ",\"reason\":" + reason + "}";
        } catch (Exception ignored) {
            return "{\"status\":\"failed\",\"progress\":0}";
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    /** Opens only Android's package installer. Chrome is not involved. */
    @JavascriptInterface
    public boolean installAppUpdate(long downloadId) {
        if (downloadId <= 0) return false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
                Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
                activity.startActivity(permission);
                return false;
            }
            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) return false;
            Uri apk = manager.getUriForDownloadedFile(downloadId);
            if (apk == null) return false;
            Intent install = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(apk, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(install);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

'''
if 'startAppUpdateDownload' not in s:
    s = replace_once(s, marker, updater + marker, 'native updater insertion')
p.write_text(s)

# ---------- Manifest install permission ----------
p = Path('android/app/src/main/AndroidManifest.xml')
s = p.read_text()
if 'android.permission.REQUEST_INSTALL_PACKAGES' not in s:
    s = replace_once(
        s,
        '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n',
        '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n',
        'manifest install permission',
    )
p.write_text(s)

# ---------- Dashboard update button ----------
p = Path('app/dashboard/components/AppUpdateStatus.tsx')
s = p.read_text()
s = replace_once(
    s,
    '''type UpdateBridge = {\n  getAppId?: () => string;\n  getFcmToken?: () => string;\n  getPlatform?: () => string;\n  getVersionCode?: () => number;\n  getVersionName?: () => string;\n  openExternalUrl?: (url: string) => boolean;\n};''',
    '''type UpdateBridge = {\n  getAppId?: () => string;\n  getFcmToken?: () => string;\n  getPlatform?: () => string;\n  getVersionCode?: () => number;\n  getVersionName?: () => string;\n  startAppUpdateDownload?: (url: string, versionName: string) => number;\n  getAppUpdateDownloadStatus?: (downloadId: number) => string;\n  installAppUpdate?: (downloadId: number) => boolean;\n  openExternalUrl?: (url: string) => boolean;\n};''',
    'UpdateBridge type',
)
state_marker = "  const [error, setError] = useState('');\n"
if 'const [downloadProgress' not in s:
    s = replace_once(
        s,
        state_marker,
        state_marker + "  const [downloadId, setDownloadId] = useState<number | null>(null);\n  const [downloadStatus, setDownloadStatus] = useState('');\n  const [downloadProgress, setDownloadProgress] = useState(0);\n",
        'download state',
    )
if 'getAppUpdateDownloadStatus?.(downloadId)' not in s:
    effect = r'''  useEffect(() => {
    if (!downloadId) return;
    const bridge = getUpdateBridge();
    if (!bridge?.getAppUpdateDownloadStatus) return;
    let timer: number | undefined;
    const poll = () => {
      try {
        const raw = bridge.getAppUpdateDownloadStatus?.(downloadId) || '';
        const payload = JSON.parse(raw) as { status?: string; progress?: number };
        const status = String(payload.status || 'unknown');
        setDownloadStatus(status);
        setDownloadProgress(Math.max(0, Math.min(100, Number(payload.progress || 0))));
        if (status === 'successful') {
          if (timer) window.clearInterval(timer);
          const opened = bridge.installAppUpdate?.(downloadId) === true;
          if (!opened) setError('Download complete. If Android opened “Install unknown apps”, allow CentralHub, return here, and tap Update Android app again.');
        } else if (status === 'failed' || status === 'missing') {
          if (timer) window.clearInterval(timer);
          setError('Android update download failed. Tap again to retry.');
        }
      } catch {
        // Keep polling transient native status failures.
      }
    };
    poll();
    timer = window.setInterval(poll, 700);
    return () => { if (timer) window.clearInterval(timer); };
  }, [downloadId]);

'''
    s = replace_once(s, '  const updateRequired = useMemo(() => {\n', effect + '  const updateRequired = useMemo(() => {\n', 'download polling effect')
s = replace_once(
    s,
    '''  const openUpdate = () => {\n    if (!latest?.downloadUrl) return;\n    const opened = getUpdateBridge()?.openExternalUrl?.(latest.downloadUrl);\n    if (!opened) window.open(latest.downloadUrl, '_blank', 'noopener,noreferrer');\n  };\n\n  const handleClick = () => {\n    if (!loading && latest && (updateRequired || mode === 'web')) {\n      openUpdate();\n      return;\n    }\n    if (!loading) void check();\n  };\n''',
    '''  const openUpdate = () => {\n    if (!latest?.downloadUrl) return;\n    const bridge = getUpdateBridge();\n\n    if (mode === 'native' && bridge?.startAppUpdateDownload) {\n      if (downloadStatus === 'successful' && downloadId && bridge.installAppUpdate) {\n        const opened = bridge.installAppUpdate(downloadId);\n        if (!opened) setError('Allow CentralHub to install app updates in Android settings, then return and tap again.');\n        return;\n      }\n      const id = Number(bridge.startAppUpdateDownload(latest.downloadUrl, latest.versionName) || -1);\n      if (id > 0) {\n        setError('');\n        setDownloadId(id);\n        setDownloadStatus('pending');\n        setDownloadProgress(0);\n        return;\n      }\n      setError('Could not start the in-app Android download.');\n      return;\n    }\n\n    // Existing app shells need one final external download. After the native\n    // updater is installed, future APK updates stay inside CentralHub.\n    const opened = bridge?.openExternalUrl?.(latest.downloadUrl);\n    if (!opened) window.open(latest.downloadUrl, '_blank', 'noopener,noreferrer');\n  };\n\n  const downloading = downloadStatus === 'pending' || downloadStatus === 'running' || downloadStatus === 'paused';\n\n  const handleClick = () => {\n    if (!loading && latest && (updateRequired || mode === 'web')) {\n      openUpdate();\n      return;\n    }\n    if (!loading) void check();\n  };\n''',
    'update click handler',
)
s = replace_once(
    s,
    "  const label = loading\n    ? 'Checking Android app…'\n",
    "  const label = downloading\n    ? `Downloading ${downloadProgress}%`\n    : loading\n      ? 'Checking Android app…'\n",
    'update label',
)
s = replace_once(s, "  const Icon = loading\n    ? RefreshCw\n", "  const Icon = downloading || loading\n    ? RefreshCw\n", 'update icon')
s = replace_once(s, 'disabled={loading}\n', 'disabled={loading || downloading}\n', 'update button disabled')
s = replace_once(s, "className={loading ? 'animate-spin' : ''}", "className={loading || downloading ? 'animate-spin' : ''}", 'update icon animation')
p.write_text(s)

# ---------- NORA browser navigation and public HTTPS ----------
p = Path('android/app/src/main/java/com/centralhub/network/NoraComputerActivity.java')
s = p.read_text()
if 'private EditText addressView;' not in s:
    s = replace_once(s, '    private TextView statusView;\n', '    private TextView statusView;\n    private EditText addressView;\n', 'browser address field')
old_build = '''    private void buildUi() {\n        LinearLayout root = new LinearLayout(this);\n        root.setOrientation(LinearLayout.VERTICAL);\n        root.setBackgroundColor(Color.rgb(2, 6, 14));\n\n        LinearLayout bar = new LinearLayout(this);\n        bar.setOrientation(LinearLayout.HORIZONTAL);\n        bar.setGravity(Gravity.CENTER_VERTICAL);\n        bar.setPadding(dp(12), dp(8), dp(8), dp(8));\n        bar.setBackgroundColor(Color.rgb(5, 13, 26));\n\n        TextView brand = new TextView(this);\n        brand.setText("NORA · LIVE ACTION");\n        brand.setTextColor(Color.rgb(98, 211, 255));\n        brand.setTextSize(12f);\n        brand.setGravity(Gravity.CENTER_VERTICAL);\n        bar.addView(brand, new LinearLayout.LayoutParams(dp(128), dp(46)));\n\n        statusView = new TextView(this);\n        statusView.setText("Preparing…");\n        statusView.setTextColor(Color.rgb(220, 232, 244));\n        statusView.setTextSize(12f);\n        statusView.setSingleLine(true);\n        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(0, dp(46), 1f);\n        statusView.setGravity(Gravity.CENTER_VERTICAL);\n        bar.addView(statusView, statusParams);\n\n        takeoverButton = new Button(this);\n        takeoverButton.setAllCaps(false);\n        takeoverButton.setText("Take over");\n        takeoverButton.setTextSize(11f);\n        takeoverButton.setOnClickListener(v -> toggleTakeover());\n        bar.addView(takeoverButton, new LinearLayout.LayoutParams(dp(104), dp(44)));\n\n        closeButton = new Button(this);\n        closeButton.setAllCaps(false);\n        closeButton.setText("End");\n        closeButton.setTextSize(11f);\n        closeButton.setOnClickListener(v -> cancelAndClose());\n        bar.addView(closeButton, new LinearLayout.LayoutParams(dp(68), dp(44)));\n\n        webView = new WebView(this);\n        root.addView(bar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(62)));\n        root.addView(webView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));\n        setContentView(root);\n    }\n'''
new_build = r'''    private void buildUi() {
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
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(0, dp(46), 1f);
        statusView.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(statusView, statusParams);

        takeoverButton = browserButton("Take over");
        takeoverButton.setOnClickListener(v -> toggleTakeover());
        bar.addView(takeoverButton, new LinearLayout.LayoutParams(dp(104), dp(44)));

        closeButton = browserButton("End");
        closeButton.setOnClickListener(v -> cancelAndClose());
        bar.addView(closeButton, new LinearLayout.LayoutParams(dp(68), dp(44)));

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER_VERTICAL);
        nav.setPadding(dp(8), dp(4), dp(8), dp(6));
        nav.setBackgroundColor(Color.rgb(4, 10, 20));

        Button back = browserButton("‹");
        back.setOnClickListener(v -> { takeOverForBrowser(); if (webView != null && webView.canGoBack()) webView.goBack(); });
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
        addressView.setOnEditorActionListener((v, actionId, event) -> {
            navigateAddress(addressView.getText().toString());
            return true;
        });
        nav.addView(addressView, new LinearLayout.LayoutParams(0, dp(42), 1f));

        Button go = browserButton("Go");
        go.setOnClickListener(v -> navigateAddress(addressView.getText().toString()));
        nav.addView(go, new LinearLayout.LayoutParams(dp(52), dp(42)));

        Button check = browserButton("Check");
        check.setOnClickListener(v -> askShruthi("Check the current page for meaningful changes, risks, unusual information, or anything relevant to CentralHub. Summarize what matters."));
        nav.addView(check, new LinearLayout.LayoutParams(dp(70), dp(42)));

        Button ask = browserButton("Ask");
        ask.setOnClickListener(v -> askShruthi(null));
        nav.addView(ask, new LinearLayout.LayoutParams(dp(58), dp(42)));

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

    private void takeOverForBrowser() {
        if (!manualControl) {
            manualControl = true;
            if (takeoverButton != null) takeoverButton.setText("Continue NORA");
            setStatus("You have control · Shruthi is paused");
            requestAgent("pause", null);
        }
    }

    private void navigateAddress(String raw) {
        takeOverForBrowser();
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return;
        if (value.contains(" ") || (!value.contains(".") && !value.startsWith("https://"))) {
            value = "https://www.google.com/search?q=" + Uri.encode(value);
        } else if (!value.startsWith("https://")) {
            value = "https://" + value.replaceFirst("^http://", "");
        }
        if (!isAllowedUrl(value)) {
            Toast.makeText(this, "Only public HTTPS websites can open in Live Web.", Toast.LENGTH_LONG).show();
            return;
        }
        webView.loadUrl(value);
    }

    private void askShruthi(String preset) {
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
'''
s = replace_once(s, old_build, new_build, 'Nora browser UI')
s = replace_once(
    s,
    '                if (isAllowedUrl(value)) return false;\n                setStatus("Blocked navigation outside NORA\'s approved sites");\n                return true;',
    '                if (isAllowedUrl(value)) return false;\n                setStatus("Blocked unsafe or non-HTTPS navigation");\n                return true;',
    'browser blocked navigation message',
)
s = replace_once(
    s,
    '            public void onPageFinished(WebView view, String url) {\n                super.onPageFinished(view, url);\n                if (!isAllowedUrl(url)) return;\n',
    '            public void onPageFinished(WebView view, String url) {\n                super.onPageFinished(view, url);\n                if (addressView != null) addressView.setText(url);\n                if (!isAllowedUrl(url)) return;\n',
    'browser address synchronization',
)
old_allowed = '''    private boolean isAllowedUrl(String value) {\n        if (value == null || value.trim().isEmpty()) return false;\n        try {\n            Uri uri = Uri.parse(value.trim());\n            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;\n            String host = uri.getHost();\n            if (host == null) return false;\n            host = host.toLowerCase(Locale.ROOT);\n            String[] roots = new String[]{\n                    "facebook.com", "meta.com", "google.com", "google.co.uk",\n                    "github.com", "netlify.com", "supabase.com", "centralhub.network"\n            };\n            for (String root : roots) if (host.equals(root) || host.endsWith("." + root)) return true;\n            return false;\n        } catch (Exception ignored) {\n            return false;\n        }\n    }\n'''
new_allowed = r'''    private boolean isAllowedUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
            String host = uri.getHost();
            if (host == null) return false;
            host = host.toLowerCase(Locale.ROOT);
            if (host.equals("localhost") || host.endsWith(".local") || host.equals("::1")
                    || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")
                    || host.startsWith("169.254.")) return false;
            if (host.startsWith("172.")) {
                String[] parts = host.split("\\.");
                if (parts.length > 1) {
                    try {
                        int second = Integer.parseInt(parts[1]);
                        if (second >= 16 && second <= 31) return false;
                    } catch (Exception ignored) { }
                }
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
'''
s = replace_once(s, old_allowed, new_allowed, 'browser public HTTPS policy')
p.write_text(s)

# ---------- AI computer public HTTPS policy ----------
p = Path('supabase/functions/nora-computer-agent/index.ts')
s = p.read_text()
roots = '''const ALLOWED_ROOTS = [\n  "facebook.com",\n  "meta.com",\n  "google.com",\n  "google.co.uk",\n  "github.com",\n  "netlify.com",\n  "supabase.com",\n  "centralhub.network",\n];\n'''
s = s.replace(roots, '')
s = replace_once(
    s,
    '''function allowedTarget(value: string) {\n  try {\n    const u = new URL(value);\n    if (u.protocol !== "https:") return false;\n    const host = u.hostname.toLowerCase();\n    return ALLOWED_ROOTS.some((root) => host === root || host.endsWith(`.${root}`));\n  } catch {\n    return false;\n  }\n}\n''',
    '''function allowedTarget(value: string) {\n  try {\n    const u = new URL(value);\n    if (u.protocol !== "https:") return false;\n    const host = u.hostname.toLowerCase();\n    if (!host || host === "localhost" || host.endsWith(".local") || host === "::1") return false;\n    if (/^(127\\.|10\\.|192\\.168\\.|169\\.254\\.)/.test(host)) return false;\n    const private172 = host.match(/^172\\.(\\d{1,3})\\./);\n    if (private172) {\n      const second = Number(private172[1]);\n      if (second >= 16 && second <= 31) return false;\n    }\n    return true;\n  } catch {\n    return false;\n  }\n}\n''',
    'AI public HTTPS policy',
)
p.write_text(s)

# ---------- Live Web page ----------
page = Path('app/live-web/page.tsx')
page.parent.mkdir(parents=True, exist_ok=True)
page.write_text(r'''\'use client\';

import { useMemo, useState } from 'react';
import { Bot, Globe2, Loader2, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type NativeBrowserBridge = {
  getPlatform?: () => string;
  openNoraComputerMode?: (sessionId: string, targetUrl: string, accessToken: string, supabaseUrl: string) => boolean;
};

const QUICK_LINKS = [
  ['Meta Business', 'https://business.facebook.com/'],
  ['Google Ads', 'https://ads.google.com/'],
  ['Merchant Center', 'https://merchants.google.com/'],
  ['Google Analytics', 'https://analytics.google.com/'],
  ['Search Console', 'https://search.google.com/search-console/'],
  ['GitHub', 'https://github.com/'],
  ['Netlify', 'https://app.netlify.com/'],
  ['Supabase', 'https://supabase.com/dashboard/'],
  ['Kerala Taste', 'https://keralataste.com/'],
  ['PickEasy', 'https://pickeasy.co.uk/'],
  ['Veenas', 'https://veenas.com/'],
  ['The Indian Shelf', 'https://theindianshelf.co.uk/'],
] as const;

function nativeBridge(): NativeBrowserBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CentralHubNative?: NativeBrowserBridge }).CentralHubNative;
}

function normalizeTarget(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error('Enter a website or search term.');
  if (/\s/.test(value) || (!value.includes('.') && !/^https:\/\//i.test(value))) {
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  }
  const normalized = /^https:\/\//i.test(value) ? value : `https://${value.replace(/^http:\/\//i, '')}`;
  const url = new URL(normalized);
  if (url.protocol !== 'https:') throw new Error('Live Web only opens HTTPS websites.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) {
    throw new Error('Local/private network addresses are blocked in Live Web.');
  }
  return url.toString();
}

export default function LiveWebPage() {
  const [address, setAddress] = useState('https://www.google.com/');
  const [goal, setGoal] = useState('Inspect the starting page, summarize what matters for CentralHub, and wait for my approval before any consequential action.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAndroid = useMemo(() => {
    try { return nativeBridge()?.getPlatform?.() === 'android'; } catch { return false; }
  }, []);

  const launch = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const targetUrl = normalizeTarget(address);
      const bridge = nativeBridge();
      if (bridge?.getPlatform?.() !== 'android' || !bridge.openNoraComputerMode) throw new Error('Live Web requires the CentralHub Android app.');
      const { data } = await supabase.auth.getSession();
      const auth = data.session;
      if (!auth?.user || !auth.access_token) throw new Error('Your CentralHub session has expired. Sign in again.');
      const hostname = new URL(targetUrl).hostname;
      const { data: actionSession, error: insertError } = await supabase
        .from('nora_action_sessions')
        .insert({
          user_id: auth.user.id,
          title: `Live Web · ${hostname}`,
          goal: goal.trim() || `Inspect ${hostname} and help the admin with the visible page.`,
          target_system: hostname,
          target_url: targetUrl,
          status: 'planned',
          risk_level: 'medium',
          current_step: `Opening ${hostname}`,
          metadata: { source: 'centralhub_live_web', browser_mode: true },
        })
        .select('id')
        .single();
      if (insertError || !actionSession?.id) throw new Error(insertError?.message || 'Could not create the Live Web session.');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const launched = bridge.openNoraComputerMode(actionSession.id, targetUrl, auth.access_token, supabaseUrl) === true;
      if (!launched) {
        await supabase.from('nora_action_sessions').update({ status: 'failed', last_error: 'Android Live Web could not launch.', completed_at: new Date().toISOString() }).eq('id', actionSession.id);
        throw new Error('Could not open Live Web. Install the latest CentralHub Android update.');
      }
    } catch (e: any) {
      setError(e?.message || 'Could not open Live Web.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-full bg-slate-950 p-4 text-white md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl border border-cyan-400/15 bg-slate-900/70 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-300"><Globe2 /></div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">CentralHub Live Web</h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">A separate secure browser for live websites and Shruthi computer actions. Third-party pages never receive the CentralHub native admin bridge.</p>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/55 p-4 md:p-5">
          <label className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Website or search</label>
          <div className="mt-2 flex gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-slate-700 bg-slate-950 px-3"><Search className="h-4 w-4 shrink-0 text-slate-500" /><input value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void launch(); }} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none" placeholder="Website or search term" /></div>
            <button type="button" onClick={() => void launch()} disabled={busy} className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Open'}</button>
          </div>

          <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">What should Shruthi do?</label>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none" />
          {error && <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          {!isAndroid && <p className="mt-3 text-xs text-amber-300">Open this page inside the CentralHub Android app to launch Live Web.</p>}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map(([name, url]) => (
            <button key={url} type="button" onClick={() => setAddress(url)} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-cyan-400/30 hover:bg-slate-900">
              <div className="flex items-center gap-2 text-sm font-bold"><Globe2 className="h-4 w-4 text-cyan-300" />{name}</div>
              <div className="mt-1 truncate text-[11px] text-slate-500">{new URL(url).hostname}</div>
            </button>
          ))}
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4"><div className="flex items-center gap-2 font-bold text-emerald-200"><ShieldCheck className="h-4 w-4" />Isolated browsing</div><p className="mt-2 text-xs leading-relaxed text-slate-400">Only public HTTPS pages are allowed. Local/private network addresses, file access and mixed HTTP content stay blocked.</p></div>
          <div className="rounded-2xl border border-violet-400/15 bg-violet-400/5 p-4"><div className="flex items-center gap-2 font-bold text-violet-200"><Bot className="h-4 w-4" />Shruthi live inspection</div><p className="mt-2 text-xs leading-relaxed text-slate-400">Use Take over for manual browsing, Ask for page-specific questions, or Check for a fresh AI inspection. Passwords, OTPs and CAPTCHA remain manual.</p></div>
        </section>
      </div>
    </main>
  );
}
''')

# ---------- Sidebar link ----------
p = Path('components/Sidebar.tsx')
s = p.read_text()
if "href: '/live-web'" not in s:
    anchor = "    { label: 'Settings', icon: '⚙️', key: '14 — settings'"
    s = replace_once(s, anchor, "    { href: '/live-web', label: 'Live Web', icon: '🌐', key: '13.5 — live web' },\n" + anchor, 'Live Web sidebar item')
p.write_text(s)
