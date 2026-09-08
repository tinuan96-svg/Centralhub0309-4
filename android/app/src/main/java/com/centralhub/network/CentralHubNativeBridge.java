package com.centralhub.network;

import android.content.Context;
import android.webkit.JavascriptInterface;

public final class CentralHubNativeBridge {
    private static final String PREFS = "centralhub_native_push";
    private static final String FCM_TOKEN = "fcm_token";

    private final Context context;

    public CentralHubNativeBridge(Context context) {
        this.context = context.getApplicationContext();
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
}
