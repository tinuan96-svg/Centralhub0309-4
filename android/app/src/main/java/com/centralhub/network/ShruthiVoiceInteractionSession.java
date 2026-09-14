package com.centralhub.network;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;

/** Hands a system-assistant invocation to the authenticated CentralHub Shruthi UI. */
public final class ShruthiVoiceInteractionSession extends VoiceInteractionSession {
    private static final String ARG_TRANSCRIPT = "shruthi_transcript";
    private static final String EXTRA_ACTION_URL = "centralhub_action_url";

    public ShruthiVoiceInteractionSession(Context context) { super(context); }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        String transcript = args == null ? "SHRUTHI" : args.getString(ARG_TRANSCRIPT, "SHRUTHI");
        if (transcript == null || transcript.trim().isEmpty()) transcript = "SHRUTHI";
        Uri url = Uri.parse("https://centralhub.network/dashboard").buildUpon()
                .appendQueryParameter("shruthi_wake", "1")
                .appendQueryParameter("shruthi_command", transcript.trim())
                .build();
        Intent intent = new Intent(getContext(), CentralHubActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(EXTRA_ACTION_URL, url.toString());
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startAssistantActivity(intent);
            else startVoiceActivity(intent);
        } catch (Exception ignored) {
            try { getContext().startActivity(intent); } catch (Exception ignoredAgain) { }
        }
        finish();
    }
}
