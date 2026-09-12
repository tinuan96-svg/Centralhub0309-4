package com.centralhub.network;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;

public final class CentralHubNativeBridge {
    private static final String PREFS = "centralhub_native_push";
    private static final String FCM_TOKEN = "fcm_token";

    private final MainActivity activity;
    private final Context context;

    public CentralHubNativeBridge(MainActivity activity) {
        this.activity = activity;
        this.context = activity.getApplicationContext();
    }

    public static void saveFcmToken(Context context, String token) {
        if (token == null || token.trim().isEmpty()) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(FCM_TOKEN, token.trim())
                .apply();
    }

    @JavascriptInterface
    public String getFcmToken() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(FCM_TOKEN, "");
    }

    @JavascriptInterface
    public String getPlatform() {
        return "android";
    }

    @JavascriptInterface
    public String getAppId() {
        return "com.centralhub.network";
    }

    @JavascriptInterface
    public long getVersionCode() {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return info.getLongVersionCode();
            }
            return info.versionCode;
        } catch (Exception ignored) {
            return 0L;
        }
    }

    @JavascriptInterface
    public String getVersionName() {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return info.versionName == null ? "" : info.versionName;
        } catch (Exception ignored) {
            return "";
        }
    }

    @JavascriptInterface
    public boolean isTaraVoiceAvailable() {
        return activity.isTaraVoiceAvailable();
    }

    @JavascriptInterface
    public void setTaraEnabled(boolean enabled) {
        activity.runOnUiThread(() -> activity.setTaraEnabled(enabled));
    }

    @JavascriptInterface
    public void setTaraSpeaking(boolean speaking) {
        activity.runOnUiThread(() -> activity.setTaraSpeaking(speaking));
    }

    /**
     * Open a trusted HTTPS destination outside CentralHub's WebView. This is used
     * by the dashboard app-update control so an APK can be downloaded by the
     * system browser/download manager instead of getting trapped inside WebView.
     */
    @JavascriptInterface
    public boolean openExternalUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(value.trim());
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(scheme) || host == null) return false;

            String normalizedHost = host.toLowerCase();
            boolean allowed = normalizedHost.equals("github.com")
                    || normalizedHost.endsWith(".githubusercontent.com")
                    || normalizedHost.equals("centralhub.network");
            if (!allowed) return false;

            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
