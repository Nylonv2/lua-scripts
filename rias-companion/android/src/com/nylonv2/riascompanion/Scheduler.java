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
    /** The old single alarm channel; now each alarm sound has its own (see alarmChannel). */
    private static final String ALARM_CHANNEL = "rias_alarms";
    private static final String KEY_ACTIONS = "actions";
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
                String text = o.optString("text", "Rias is calling for you.");
                if (o.optBoolean("alarm", false)) {
                    showAlarm(c, text, o.optString("title", ""), o.optString("itemId", ""), at, o.optString("sound", ""), o.optString("icon", ""), false);
                } else {
                    show(c, text, (int) (at / 1000), false);
                }
            }
        }
        p.edit().putLong(KEY_LAST_FIRED, now + 5000).apply();
        scheduleNext(c);
        RiasWidget.update(c);
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

    // ---------- alarm sounds ----------
    private static final String KEY_SOUND = "alarmSound";
    /** Alarms ring at most this long before going quiet (the notification stays). */
    private static final long RING_MS = 3 * 60 * 1000L;

    /** {key, uri, title, ring} from Settings → Alarm sound. */
    static void saveSound(Context c, String json) {
        prefs(c).edit().putString(KEY_SOUND, json).apply();
    }

    static JSONObject soundPrefs(Context c) {
        try {
            return new JSONObject(prefs(c).getString(KEY_SOUND, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** The reminder's own sound, else the one chosen in Settings. */
    static String soundKey(Context c, String own) {
        if (own != null && !own.isEmpty()) return own;
        return soundPrefs(c).optString("key", "chime");
    }

    static android.net.Uri soundUri(Context c, String key) {
        if ("silent".equals(key)) return null;
        if ("phone".equals(key)) return android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM);
        if ("custom".equals(key)) {
            String u = soundPrefs(c).optString("uri", "");
            return u.isEmpty() ? android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM) : android.net.Uri.parse(u);
        }
        String name = "voice".equals(key) ? "chime" : key;
        if (c.getResources().getIdentifier("alarm_" + name, "raw", c.getPackageName()) == 0) name = "chime";
        return android.net.Uri.parse("android.resource://" + c.getPackageName() + "/raw/alarm_" + name);
    }

    private static String soundLabel(String key) {
        switch (key) {
            case "harp": return "Harp";
            case "musicbox": return "Music box";
            case "magic": return "Magic circle";
            case "classic": return "Classic beep";
            case "pulse": return "Soft pulse";
            case "phone": return "Phone alarm";
            case "custom": return "Your sound";
            case "voice": return "Rias's voice";
            case "silent": return "Vibrate only";
            default: return "Crimson chime";
        }
    }

    /** A channel's sound can't change once made, so each alarm sound gets its own channel. */
    static String alarmChannel(Context c, String key) {
        String id = "custom".equals(key)
                ? "rias_alarm_custom_" + Integer.toHexString(soundPrefs(c).optString("uri", "").hashCode())
                : "rias_alarm_" + key;
        if (Build.VERSION.SDK_INT < 26) return id;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(id) != null) return id;
        for (NotificationChannel old : nm.getNotificationChannels()) {
            String oid = old.getId();
            if (oid.equals(ALARM_CHANNEL) || (oid.startsWith("rias_alarm_custom_") && !oid.equals(id))) nm.deleteNotificationChannel(oid);
        }
        NotificationChannel ch = new NotificationChannel(id, "Reminder pop-ups · " + soundLabel(key),
                NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Reminders that pop up in the middle of the screen, like an alarm");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] {0, 400, 250, 400, 250, 400});
        android.net.Uri u = soundUri(c, key);
        if (u == null) {
            ch.setSound(null, null);
        } else {
            ch.setSound(u, new android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
        }
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
        return id;
    }

    static String currentAlarmChannel(Context c) {
        return alarmChannel(c, soundKey(c, ""));
    }

    /** After RING_MS, an alarm nobody answered stops ringing but stays in the notifications. */
    private static void scheduleQuiet(Context c, int id, String text, String title, String itemId, long at, String sound, String icon) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_QUIET)
                .putExtra(AlarmActivity.EXTRA_TEXT, text)
                .putExtra(AlarmActivity.EXTRA_TITLE, title)
                .putExtra(AlarmActivity.EXTRA_ITEM, itemId)
                .putExtra(AlarmActivity.EXTRA_AT, at)
                .putExtra(AlarmActivity.EXTRA_NOTIFICATION, id)
                .putExtra(AlarmActivity.EXTRA_SOUND, sound)
                .putExtra(AlarmActivity.EXTRA_ICON, icon);
        PendingIntent pi = PendingIntent.getBroadcast(c, id * 4 + 3, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + RING_MS, pi);
    }

    static void handleQuiet(Context c, Intent in) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        int id = in.getIntExtra(AlarmActivity.EXTRA_NOTIFICATION, 0);
        if (nm == null || id == 0) return;
        for (android.service.notification.StatusBarNotification sb : nm.getActiveNotifications()) {
            if (sb.getId() != id) continue;
            showAlarm(c, in.getStringExtra(AlarmActivity.EXTRA_TEXT), in.getStringExtra(AlarmActivity.EXTRA_TITLE),
                    in.getStringExtra(AlarmActivity.EXTRA_ITEM), in.getLongExtra(AlarmActivity.EXTRA_AT, 0),
                    in.getStringExtra(AlarmActivity.EXTRA_SOUND), in.getStringExtra(AlarmActivity.EXTRA_ICON), true);
            return;
        }
    }

    /** Android 14+ only lets apps pop up over the lock screen once you allow it in Settings. */
    static boolean canFullScreen(Context c) {
        if (Build.VERSION.SDK_INT < 34) return true;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.canUseFullScreenIntent();
    }

    /** A reminder as an alarm: full-screen pop-up when locked, heads-up pop-up when in use. */
    @SuppressWarnings("deprecation")
    static void showAlarm(Context c, String text, String title, String itemId, long at, String sound, String icon, boolean quiet) {
        if (MainActivity.visible) return; // the app shows its own pop-up
        String key = soundKey(c, sound);
        String channel = alarmChannel(c, key);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        int id = (int) (at / 1000);
        Intent alarm = new Intent(c, AlarmActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION)
                .putExtra(AlarmActivity.EXTRA_TEXT, text)
                .putExtra(AlarmActivity.EXTRA_TITLE, title)
                .putExtra(AlarmActivity.EXTRA_ITEM, itemId)
                .putExtra(AlarmActivity.EXTRA_AT, at)
                .putExtra(AlarmActivity.EXTRA_NOTIFICATION, id)
                .putExtra(AlarmActivity.EXTRA_SOUND, key)
                .putExtra(AlarmActivity.EXTRA_ICON, icon);
        PendingIntent pop = PendingIntent.getActivity(c, id, alarm,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int smallIcon = c.getResources().getIdentifier("ic_stat_rias", "drawable", c.getPackageName());
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(c, channel);
        } else {
            b = new Notification.Builder(c).setPriority(Notification.PRIORITY_MAX)
                    .setDefaults(Notification.DEFAULT_VIBRATE | Notification.DEFAULT_LIGHTS)
                    .setSound(soundUri(c, key), android.media.AudioManager.STREAM_ALARM);
        }
        b.setSmallIcon(smallIcon != 0 ? smallIcon : android.R.drawable.ic_popup_reminder)
                .setContentTitle(title == null || title.isEmpty() ? "Rias" : "Rias · " + title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFFC8173A)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setContentIntent(pop);
        // Going quiet re-posts the same alarm without sound; otherwise it pops up full screen.
        if (quiet) b.setOnlyAlertOnce(true);
        else b.setFullScreenIntent(pop, true);
        if (itemId != null && !itemId.isEmpty()) {
            b.addAction(0, "Done ✓", actionIntent(c, AlarmReceiver.ACTION_DONE, id, text, title, itemId, at, 0));
            b.addAction(0, "Snooze 10 min", actionIntent(c, AlarmReceiver.ACTION_SNOOZE, id, text, title, itemId, at, 10));
            b.addAction(0, "30 min", actionIntent(c, AlarmReceiver.ACTION_SNOOZE, id, text, title, itemId, at, 30));
        }
        android.graphics.Bitmap pic = picture(c);
        if (pic != null) b.setLargeIcon(pic);
        Notification n = b.build();
        // Like a real alarm: the sound repeats until you answer (or for RING_MS).
        boolean ring = !quiet && soundPrefs(c).optBoolean("ring", true) && !"voice".equals(key) && !"silent".equals(key);
        if (ring) n.flags |= Notification.FLAG_INSISTENT;
        nm.notify(id, n);
        if (ring) scheduleQuiet(c, id, text, title, itemId, at, sound, icon);
        if (quiet) return;
        // Unlocked and in use: Android shrinks the alarm to a banner. With "Appear on top" allowed,
        // draw the card over the current app, then open the full alarm screen on top of it
        // (the card stays if Android refuses to open the screen).
        if (AlarmOverlay.phoneInUse(c) && AlarmOverlay.allowed(c)) {
            AlarmOverlay.show(c, text, title, itemId, at, id, key);
            try {
                c.startActivity(alarm);
            } catch (Exception ignored) {
            }
        }
    }

    private static PendingIntent actionIntent(Context c, String action, int id, String text, String title,
                                              String itemId, long at, int mins) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(action)
                .putExtra(AlarmActivity.EXTRA_TEXT, text)
                .putExtra(AlarmActivity.EXTRA_TITLE, title)
                .putExtra(AlarmActivity.EXTRA_ITEM, itemId)
                .putExtra(AlarmActivity.EXTRA_AT, at)
                .putExtra(AlarmActivity.EXTRA_NOTIFICATION, id)
                .putExtra("mins", mins);
        int code = id * 4 + (AlarmReceiver.ACTION_DONE.equals(action) ? 1 : mins >= 30 ? 2 : 0);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Done / Snooze from the notification's buttons. */
    static void handleAction(Context c, Intent in) {
        String itemId = in.getStringExtra(AlarmActivity.EXTRA_ITEM);
        long at = in.getLongExtra(AlarmActivity.EXTRA_AT, 0);
        int id = in.getIntExtra(AlarmActivity.EXTRA_NOTIFICATION, 0);
        if (itemId == null || itemId.isEmpty()) return;
        if (AlarmReceiver.ACTION_DONE.equals(in.getAction())) {
            recordAction(c, itemId, "done", at, 0);
        } else {
            long until = System.currentTimeMillis() + in.getIntExtra("mins", 10) * 60 * 1000L;
            recordAction(c, itemId, "snooze", at, until);
            addEvent(c, until, in.getStringExtra(AlarmActivity.EXTRA_TEXT), itemId, in.getStringExtra(AlarmActivity.EXTRA_TITLE));
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && id != 0) nm.cancel(id);
        AlarmOverlay.hide(c);
    }

    /** What could stop pop-ups from showing outside the app, for Settings → "Pop-up check". */
    static String alarmCheck(Context c) {
        JSONObject o = new JSONObject();
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            o.put("notifications", enabled(c));
            boolean channel = true;
            if (Build.VERSION.SDK_INT >= 26 && nm != null) {
                NotificationChannel ch = nm.getNotificationChannel(currentAlarmChannel(c));
                channel = ch == null || ch.getImportance() >= NotificationManager.IMPORTANCE_HIGH;
            }
            o.put("channel", channel);
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            o.put("exact", Build.VERSION.SDK_INT < 31 || (am != null && am.canScheduleExactAlarms()));
            o.put("fullScreen", canFullScreen(c));
            o.put("overlay", AlarmOverlay.allowed(c));
            android.os.PowerManager pm = (android.os.PowerManager) c.getSystemService(Context.POWER_SERVICE);
            o.put("battery", Build.VERSION.SDK_INT < 23 || (pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName())));
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    /** Done / Snooze tapped on the pop-up while the app was closed; applied when it next opens. */
    static void recordAction(Context c, String itemId, String action, long at, long until) {
        try {
            SharedPreferences p = prefs(c);
            JSONArray arr = new JSONArray(p.getString(KEY_ACTIONS, "[]"));
            JSONObject o = new JSONObject();
            o.put("itemId", itemId);
            o.put("action", action);
            o.put("at", at);
            o.put("until", until);
            arr.put(o);
            p.edit().putString(KEY_ACTIONS, arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    static String takeActions(Context c) {
        SharedPreferences p = prefs(c);
        String s = p.getString(KEY_ACTIONS, "[]");
        p.edit().remove(KEY_ACTIONS).apply();
        return s;
    }

    /** Adds one alarm (a snooze) to the schedule and re-arms. */
    static void addEvent(Context c, long at, String text, String itemId, String title) {
        try {
            JSONArray arr = events(c);
            JSONObject o = new JSONObject();
            o.put("at", at);
            o.put("text", text);
            o.put("itemId", itemId);
            o.put("title", title);
            o.put("alarm", true);
            arr.put(o);
            prefs(c).edit().putString(KEY_EVENTS, arr.toString()).apply();
            scheduleNext(c);
        } catch (Exception ignored) {
        }
    }

    /** The photo chosen just for the alarm card (Settings → Alarm card picture). */
    static java.io.File alarmPictureFile(Context c) {
        return new java.io.File(c.getFilesDir(), "alarm-picture.jpg");
    }

    static java.io.File pictureFile(Context c) {
        return new java.io.File(c.getFilesDir(), "rias-picture.jpg");
    }

    static android.graphics.Bitmap picture(Context c) {
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
