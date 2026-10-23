package com.nylonv2.riascompanion;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Keeps the list of upcoming reminders (built by the web app) and hands the next one
 * to Android's AlarmManager, so Rias can speak up even when the app is closed.
 */
final class Scheduler {
    private static final String PREFS = "rias";
    private static final String KEY_EVENTS = "events";
    private static final String KEY_LAST_FIRED = "lastFired";
    private static final String CHANNEL = "rias_reminders";
    /** Reminders older than this when the alarm finally runs (phone was off, etc.) are dropped. */
    private static final long STALE_MS = 30 * 60 * 1000L;

    private Scheduler() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray events(Context c) {
        try {
            return new JSONArray(prefs(c).getString(KEY_EVENTS, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** Called from the web app with [{at: epochMillis, text: "..."}, ...]. */
    static void save(Context c, String json) {
        try {
            new JSONArray(json); // validate
        } catch (Exception e) {
            return;
        }
        SharedPreferences p = prefs(c);
        SharedPreferences.Editor ed = p.edit().putString(KEY_EVENTS, json);
        if (!p.contains(KEY_LAST_FIRED)) ed.putLong(KEY_LAST_FIRED, System.currentTimeMillis());
        ed.apply();
        scheduleNext(c);
    }

    static void scheduleNext(Context c) {
        JSONArray arr = events(c);
        long now = System.currentTimeMillis();
        long next = Long.MAX_VALUE;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            long at = o.optLong("at", 0);
            if (at > now && at < next) next = at;
        }
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, new Intent(c, AlarmReceiver.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (am == null) return;
        if (next == Long.MAX_VALUE) {
            am.cancel(pi);
            return;
        }
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi); // within a few minutes
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
        }
    }

    /** The alarm went off: show everything that is due, then arm the next one. */
    static void fireDue(Context c) {
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        long last = p.getLong(KEY_LAST_FIRED, now - STALE_MS);
        JSONArray arr = events(c);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            long at = o.optLong("at", 0);
            if (at > last && at <= now + 5000 && now - at <= STALE_MS) {
                show(c, o.optString("text", "Rias is calling for you."), (int) (at / 1000), false);
            }
        }
        p.edit().putLong(KEY_LAST_FIRED, now + 5000).apply();
        scheduleNext(c);
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Reminders from Rias",
                NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Routine reminders and check-ins");
        ch.enableVibration(true);
        nm.createNotificationChannel(ch);
    }

    static java.io.File pictureFile(Context c) {
        return new java.io.File(c.getFilesDir(), "rias-picture.jpg");
    }

    private static android.graphics.Bitmap picture(Context c) {
        java.io.File f = pictureFile(c);
        if (!f.exists()) return null;
        try {
            android.graphics.Bitmap bm = android.graphics.BitmapFactory.decodeFile(f.getAbsolutePath());
            if (bm == null) return null;
            // Crop to a circle so it looks like a contact photo.
            int size = Math.min(bm.getWidth(), bm.getHeight());
            android.graphics.Bitmap out = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas = new android.graphics.Canvas(out);
            android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
            canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
            paint.setXfermode(new android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.SRC_IN));
            canvas.drawBitmap(bm, (size - bm.getWidth()) / 2f, (size - bm.getHeight()) / 2f, paint);
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    static boolean enabled(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.areNotificationsEnabled();
    }

    @SuppressWarnings("deprecation")
    static void show(Context c, String text, int id, boolean force) {
        // While the app is on screen she's already talking to you in the chat.
        if (MainActivity.visible && !force) return;
        ensureChannel(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent open = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        int icon = c.getResources().getIdentifier("ic_stat_rias", "drawable", c.getPackageName());
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(c, CHANNEL)
                : new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH)
                        .setDefaults(Notification.DEFAULT_ALL);
        b.setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_popup_reminder)
                .setContentTitle("Rias")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFFC8173A)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setContentIntent(tap);
        // Your chosen picture of Rias, shown beside the message.
        android.graphics.Bitmap pic = picture(c);
        if (pic != null) b.setLargeIcon(pic);
        nm.notify(id, b.build());
    }
}
