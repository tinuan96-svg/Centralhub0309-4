package com.centralhub.network;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.widget.Toast;

/** Handles PackageInstaller callbacks for CentralHub's signed self-updates. */
public final class AppUpdateInstallReceiver extends BroadcastReceiver {
    public static final String ACTION_INSTALL_STATUS = "com.centralhub.network.APP_UPDATE_INSTALL_STATUS";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            try {
                Intent confirm;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
                } else {
                    //noinspection deprecation
                    confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                }
                if (confirm != null) {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(confirm);
                }
            } catch (Exception ignored) {
                Toast.makeText(context, "CentralHub update needs Android confirmation.", Toast.LENGTH_LONG).show();
            }
            return;
        }

        if (status == PackageInstaller.STATUS_SUCCESS) {
            // Android may replace/kill the running process during a successful self-update.
            // If this callback survives, keep the message minimal; the next launch is updated.
            Toast.makeText(context, "CentralHub updated successfully.", Toast.LENGTH_SHORT).show();
            return;
        }

        String detail = message == null || message.trim().isEmpty() ? "Android could not install the update." : message.trim();
        Toast.makeText(context, "CentralHub update failed: " + detail, Toast.LENGTH_LONG).show();
    }
}
