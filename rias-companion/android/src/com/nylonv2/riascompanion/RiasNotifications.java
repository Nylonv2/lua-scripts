package com.nylonv2.riascompanion;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Lets Rias read your new notifications to you ("What did I miss?"). Only kept in memory on
 * the phone, for the last few hours; only on if you allow notification access.
 */
public class RiasNotifications extends NotificationListenerService {
    private static final List<JSONObject> recent = new ArrayList<>();

    /** The listener just connected: pick up the messages already in the shade. */
    @Override
    public void onListenerConnected() {
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active != null) for (StatusBarNotification sbn : active) onNotificationPosted(sbn);
        } catch (Exception ignored) {
        }
    }


    static boolean allowed(Context c) {
        String on = Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners");
        return on != null && on.contains(new ComponentName(c, RiasNotifications.class).flattenToString());
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn.getPackageName().equals(getPackageName()) || sbn.isOngoing()) return;
            Notification n = sbn.getNotification();
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            if (Notification.CATEGORY_TRANSPORT.equals(n.category) || Notification.CATEGORY_PROGRESS.equals(n.category)
                    || Notification.CATEGORY_SERVICE.equals(n.category)) return;
            Bundle x = n.extras;
            CharSequence title = x.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence text = x.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (text == null) text = x.getCharSequence(Notification.EXTRA_TEXT);
            if (title == null && text == null) return;
            PackageManager pm = getPackageManager();
            String app;
            try {
                app = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(sbn.getPackageName(), 0)));
            } catch (Exception e) {
                app = sbn.getPackageName();
            }
            JSONObject o = new JSONObject();
            o.put("key", sbn.getKey());
            o.put("app", app);
            o.put("title", title == null ? "" : title.toString());
            o.put("text", text == null ? "" : text.toString());
            o.put("ts", sbn.getPostTime());
            synchronized (recent) {
                for (int i = recent.size() - 1; i >= 0; i--) if (recent.get(i).optString("key").equals(sbn.getKey())) recent.remove(i);
                recent.add(o);
                while (recent.size() > 40) recent.remove(0);
            }
        } catch (Exception ignored) {
        }
    }

    /** Notifications newer than `since` (ms) from the last 12 hours, oldest first. */
    static String since(long since) {
        long floor = Math.max(since, System.currentTimeMillis() - 12 * 3600000L);
        JSONArray out = new JSONArray();
        synchronized (recent) {
            for (JSONObject o : recent) if (o.optLong("ts") > floor) out.put(o);
        }
        return out.toString();
    }
}
