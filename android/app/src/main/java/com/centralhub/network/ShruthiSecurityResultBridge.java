package com.centralhub.network;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Small synchronous hand-off for the biometric activity and the CentralHub WebView.
 * Security results are tiny and infrequent, so commit() is intentional here: the
 * result must be visible before ShruthiSecurityActivity finishes and MainActivity
 * resumes, otherwise the first successful fingerprint can be missed.
 */
final class ShruthiSecurityResultBridge {
    static final String PREFS = "centralhub_security";
    static final String RESULT_KEY = "secure_unlock_result";

    private ShruthiSecurityResultBridge() { }

    static void clear(Context context) {
        preferences(context).edit().remove(RESULT_KEY).commit();
    }

    static void write(Context context, String result) {
        preferences(context).edit().putString(RESULT_KEY, result == null ? "" : result).commit();
    }

    static String consume(Context context) {
        SharedPreferences prefs = preferences(context);
        String value = prefs.getString(RESULT_KEY, "");
        if (value == null || value.isEmpty()) return "";
        prefs.edit().remove(RESULT_KEY).commit();
        return value;
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
