package com.centralhub.network;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class MyFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "centralhub_alerts_v1";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();

        // CentralHub sends data-only FCM messages so the app owns exactly one
        // notification. This prevents Android's automatic notification plus the
        // app's notification from producing duplicates.
        if (!data.isEmpty()) {
            sendNotification(
                    valueOr(data.get("title"), "CentralHub"),
                    valueOr(data.get("body"), "You have a new CentralHub alert."),
                    data.get("action_url"),
                    data.get("category"),
                    data.get("notification_id"),
                    data.get("dedupe_key"),
                    data.get("store_slug")
            );
            return;
        }

        // Keep compatibility with any older Firebase notification payloads.
        if (remoteMessage.getNotification() != null) {
            sendNotification(
                    valueOr(remoteMessage.getNotification().getTitle(), "CentralHub"),
                    valueOr(remoteMessage.getNotification().getBody(), "You have a new CentralHub alert."),
                    null,
                    "phone_push",
                    null,
                    null,
                    null
            );
        }
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        CentralHubNativeBridge.saveFcmToken(this, token);
        android.util.Log.d("FCM", "CentralHub token refreshed.");
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }

    private void sendNotification(
            String title,
            String messageBody,
            String actionUrl,
            String category,
            String notificationId,
            String dedupeKey,
            String storeSlug
    ) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("centralhub_action_url", actionUrl == null ? "/dashboard" : actionUrl);

        int notificationIdValue = stableNotificationId(notificationId, dedupeKey, title, messageBody);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                notificationIdValue,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        NotificationCompat.Builder notificationBuilder =
                new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(notificationIcon(storeSlug))
                        .setContentTitle(title)
                        .setContentText(messageBody)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(messageBody))
                        .setAutoCancel(true)
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setCategory("customer_message".equals(category)
                                ? NotificationCompat.CATEGORY_MESSAGE
                                : NotificationCompat.CATEGORY_EVENT)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setVibrate(new long[]{0, 350, 100, 350, 100, 350})
                        .setSound(defaultSoundUri)
                        .setContentIntent(pendingIntent);

        NotificationManager notificationManager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "CentralHub alerts",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Orders, customer messages, and CentralHub alerts");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 350, 100, 350, 100, 350});
            channel.setSound(defaultSoundUri, null);
            notificationManager.createNotificationChannel(channel);
        }

        notificationManager.notify(notificationIdValue, notificationBuilder.build());
    }

    private int notificationIcon(String storeSlug) {
        String normalized = storeSlug == null ? "" : storeSlug.trim().toLowerCase();
        switch (normalized) {
            case "malluspices":
                return R.drawable.ic_store_malluspices;
            case "keralagrocery":
                return R.drawable.ic_store_keralagrocery;
            case "pocketgrocery":
                return R.drawable.ic_store_pocketgrocery;
            case "tamilretail":
                return R.drawable.ic_store_tamilretail;
            default:
                return R.mipmap.ic_launcher;
        }
    }

    private static int stableNotificationId(
            String notificationId,
            String dedupeKey,
            String title,
            String body
    ) {
        String key = valueOr(notificationId, valueOr(dedupeKey, title + ":" + body));
        int hash = key.hashCode() & 0x7fffffff;
        return hash == 0 ? 1 : hash;
    }
}
