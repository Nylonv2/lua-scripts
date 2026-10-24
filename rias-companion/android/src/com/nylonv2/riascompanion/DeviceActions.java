package com.nylonv2.riascompanion;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.util.Base64;

import org.json.JSONObject;

import java.util.List;
import java.util.Locale;

/**
 * The phone things Rias can do when you ask (by voice, chat or the widget):
 * timers, volume, flashlight, Do Not Disturb, opening apps, calls, texts,
 * directions and playing her voice. Each returns a short result string the app turns
 * into her answer ("ok", "no-permission", "not-found", ...).
 */
final class DeviceActions {
    static final String TIMER_CHANNEL = "rias_timers";

    private DeviceActions() {}

    private static boolean start(Context c, Intent i) {
        try {
            c.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    // ---------- timers ----------
    private static PendingIntent timerIntent(Context c, String id, String label) {
        Intent i = new Intent(c, TimerReceiver.class).setAction(TimerReceiver.ACTION_DONE)
                .putExtra("id", id).putExtra("label", label);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void timerStart(Context c, String id, long endsAt, String label) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = timerIntent(c, id, label);
        PendingIntent show = PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        am.setAlarmClock(new AlarmManager.AlarmClockInfo(endsAt, show), pi);
        // A live countdown in the notification shade until it rings.
        ensureTimerChannel(c);
        int small = c.getResources().getIdentifier("ic_stat_rias", "drawable", c.getPackageName());
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, TIMER_CHANNEL) : new Notification.Builder(c);
        Intent cancel = new Intent(c, TimerReceiver.class).setAction(TimerReceiver.ACTION_CANCEL).putExtra("id", id).putExtra("label", label);
        b.setSmallIcon(small != 0 ? small : android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("⏱ " + (label == null || label.isEmpty() ? "Timer" : label))
                .setContentText("Rias will call you when it's done")
                .setColor(0xFFC8173A)
                .setOngoing(true)
                .setShowWhen(true)
                .setWhen(endsAt)
                .setUsesChronometer(true)
                .setContentIntent(show)
                .addAction(0, "Cancel", PendingIntent.getBroadcast(c, ~id.hashCode(), cancel, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(timerNoteId(id), b.build());
    }

    static void timerCancel(Context c, String id) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(timerIntent(c, id, ""));
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(timerNoteId(id));
    }

    static int timerNoteId(String id) {
        return 8800 + (id.hashCode() & 0x3ff);
    }

    private static void ensureTimerChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(TIMER_CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(TIMER_CHANNEL, "Running timers", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("The countdown while a timer runs (it rings as an alarm when done)");
        nm.createNotificationChannel(ch);
    }

    // ---------- volume ----------
    /** action: up, down, mute, unmute, set (level 0-100). Returns the new level in percent. */
    static String volume(Context c, String action, int level) {
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return "error";
        int s = AudioManager.STREAM_MUSIC, max = am.getStreamMaxVolume(s);
        try {
            switch (action) {
                case "up": am.adjustStreamVolume(s, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI); am.adjustStreamVolume(s, AudioManager.ADJUST_RAISE, 0); break;
                case "down": am.adjustStreamVolume(s, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI); am.adjustStreamVolume(s, AudioManager.ADJUST_LOWER, 0); break;
                case "mute": am.adjustStreamVolume(s, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI); break;
                case "unmute": am.adjustStreamVolume(s, AudioManager.ADJUST_UNMUTE, AudioManager.FLAG_SHOW_UI); break;
                default: am.setStreamVolume(s, Math.round(Math.max(0, Math.min(100, level)) / 100f * max), AudioManager.FLAG_SHOW_UI);
            }
        } catch (SecurityException e) {
            return "no-permission"; // changing volume in Do Not Disturb
        }
        return String.valueOf(Math.round(am.getStreamVolume(s) * 100f / Math.max(1, max)));
    }

    // ---------- phone controls ----------
    static String flashlight(Context c, boolean on) {
        if (Build.VERSION.SDK_INT < 23) return "unsupported";
        CameraManager cm = (CameraManager) c.getSystemService(Context.CAMERA_SERVICE);
        if (cm == null) return "unsupported";
        try {
            for (String id : cm.getCameraIdList()) {
                Boolean flash = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (flash != null && flash) {
                    cm.setTorchMode(id, on);
                    return "ok";
                }
            }
        } catch (Exception e) {
            return "error";
        }
        return "unsupported";
    }

    static boolean dndAccess(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return Build.VERSION.SDK_INT >= 23 && nm != null && nm.isNotificationPolicyAccessGranted();
    }

    static String dnd(Context c, boolean on) {
        if (!dndAccess(c)) return "no-permission";
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.setInterruptionFilter(on ? NotificationManager.INTERRUPTION_FILTER_PRIORITY : NotificationManager.INTERRUPTION_FILTER_ALL);
        return "ok";
    }

    /** Opens an installed app by (part of) its name. Returns the app's name, or "" if none matched. */
    static String openApp(Context c, String name) {
        if (name == null || name.trim().isEmpty()) return "";
        String want = name.trim().toLowerCase(Locale.US);
        PackageManager pm = c.getPackageManager();
        List<ResolveInfo> apps = pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0);
        ResolveInfo best = null;
        int bestScore = 0;
        for (ResolveInfo r : apps) {
            String label = String.valueOf(r.loadLabel(pm)).toLowerCase(Locale.US);
            int score = label.equals(want) ? 3 : label.startsWith(want) ? 2 : label.contains(want) ? 1 : 0;
            if (score > bestScore) {
                best = r;
                bestScore = score;
            }
        }
        if (best == null) return "";
        Intent i = pm.getLaunchIntentForPackage(best.activityInfo.packageName);
        if (i == null || !start(c, i)) return "";
        return String.valueOf(best.loadLabel(pm));
    }

    // ---------- calls, texts, directions ----------
    static boolean granted(Context c, String perm) {
        return Build.VERSION.SDK_INT < 23 || c.checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    /** {name, number} of the best contact match, or null. */
    static JSONObject findContact(Context c, String who) {
        if (who == null) return null;
        String digits = who.replaceAll("[^0-9+]", "");
        try {
            if (digits.length() >= 3 && digits.length() >= who.replaceAll("\\s", "").length() - 2) {
                return new JSONObject().put("name", who).put("number", digits);
            }
            if (!granted(c, android.Manifest.permission.READ_CONTACTS)) return new JSONObject().put("error", "no-permission");
            ContentResolver cr = c.getContentResolver();
            String w = who.trim();
            try (Cursor cur = cr.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    new String[] {ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER,
                            ContactsContract.CommonDataKinds.Phone.IS_SUPER_PRIMARY},
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?", new String[] {"%" + w + "%"},
                    ContactsContract.CommonDataKinds.Phone.IS_SUPER_PRIMARY + " DESC")) {
                String bestName = null, bestNum = null;
                int bestScore = -1;
                while (cur != null && cur.moveToNext()) {
                    String n = cur.getString(0), num = cur.getString(1);
                    String ln = n == null ? "" : n.toLowerCase(Locale.US), lw = w.toLowerCase(Locale.US);
                    int score = ln.equals(lw) ? 3 : ln.startsWith(lw + " ") || ln.startsWith(lw) ? 2 : 1;
                    if (score > bestScore) {
                        bestScore = score;
                        bestName = n;
                        bestNum = num;
                    }
                }
                if (bestNum == null) return null;
                return new JSONObject().put("name", bestName).put("number", bestNum);
            }
        } catch (Exception e) {
            return null;
        }
    }

    static String call(Context c, String who) {
        JSONObject ct = findContact(c, who);
        if (ct == null) return "not-found";
        if (ct.has("error")) return ct.optString("error");
        Uri tel = Uri.parse("tel:" + Uri.encode(ct.optString("number")));
        boolean direct = granted(c, android.Manifest.permission.CALL_PHONE);
        if (!start(c, new Intent(direct ? Intent.ACTION_CALL : Intent.ACTION_DIAL, tel))) return "error";
        return "ok:" + ct.optString("name");
    }

    /** Opens your texting app with the message written out; you tap Send. */
    static String text(Context c, String who, String message) {
        JSONObject ct = findContact(c, who);
        if (ct == null) return "not-found";
        if (ct.has("error")) return ct.optString("error");
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(ct.optString("number")))).putExtra("sms_body", message);
        return start(c, i) ? "ok:" + ct.optString("name") : "error";
    }

    /** {name, email} of the best contact match with an email address, {error} without permission, or null. */
    static JSONObject findEmail(Context c, String who) {
        if (who == null || who.trim().isEmpty()) return null;
        try {
            if (!granted(c, android.Manifest.permission.READ_CONTACTS)) return new JSONObject().put("error", "no-permission");
            String w = who.trim();
            try (Cursor cur = c.getContentResolver().query(ContactsContract.CommonDataKinds.Email.CONTENT_URI,
                    new String[] {ContactsContract.CommonDataKinds.Email.DISPLAY_NAME_PRIMARY, ContactsContract.CommonDataKinds.Email.ADDRESS},
                    ContactsContract.CommonDataKinds.Email.DISPLAY_NAME_PRIMARY + " LIKE ?", new String[] {"%" + w + "%"},
                    ContactsContract.CommonDataKinds.Email.IS_SUPER_PRIMARY + " DESC")) {
                String bestName = null, bestMail = null;
                int bestScore = -1;
                String lw = w.toLowerCase(Locale.US);
                while (cur != null && cur.moveToNext()) {
                    String n = cur.getString(0), mail = cur.getString(1);
                    String ln = n == null ? "" : n.toLowerCase(Locale.US);
                    int score = ln.equals(lw) ? 3 : ln.startsWith(lw) ? 2 : 1;
                    if (score > bestScore && mail != null) {
                        bestScore = score;
                        bestName = n;
                        bestMail = mail;
                    }
                }
                return bestMail == null ? null : new JSONObject().put("name", bestName).put("email", bestMail);
            }
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Opens your email app with the email written out (to, subject, body); you check it and tap Send.
     * `to` can be an address, a contact's name, or empty. Returns "ok:Name|address", "not-found", "no-permission", "no-app".
     */
    static String email(Context c, String to, String subject, String body) {
        String addr = to == null ? "" : to.trim(), name = addr;
        if (!addr.isEmpty() && !addr.contains("@")) {
            JSONObject ct = findEmail(c, addr);
            if (ct == null) return "not-found";
            if (ct.has("error")) return ct.optString("error");
            addr = ct.optString("email");
            name = ct.optString("name");
        }
        addr = addr.replace(" ", "");
        Uri uri = Uri.parse("mailto:" + addr + "?subject=" + Uri.encode(subject == null ? "" : subject) + "&body=" + Uri.encode(body == null ? "" : body));
        Intent i = new Intent(Intent.ACTION_SENDTO, uri)
                .putExtra(Intent.EXTRA_SUBJECT, subject)
                .putExtra(Intent.EXTRA_TEXT, body);
        if (!addr.isEmpty()) i.putExtra(Intent.EXTRA_EMAIL, new String[] {addr});
        return start(c, i) ? "ok:" + name + "|" + addr : "no-app";
    }

    static String directions(Context c, String place) {
        Intent nav = new Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=" + Uri.encode(place)));
        if (start(c, nav)) return "ok";
        return start(c, new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(place)))) ? "ok" : "no-app";
    }

    static void openSettings(Context c, String what) {
        Intent i;
        switch (what) {
            case "dnd": i = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS); break;
            case "notifications": i = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"); break;
            case "assistant": i = new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS); break;
            default: i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
        }
        if (!start(c, i)) start(c, new Intent(Settings.ACTION_SETTINGS));
    }

    // ---------- her natural voice ----------
    private static AudioTrack track;

    /** Plays 16-bit mono PCM (her natural voice from the AI service). */
    static synchronized void playPcm(String base64, int rate) {
        stopPcm();
        try {
            byte[] pcm = Base64.decode(base64, Base64.DEFAULT);
            if (pcm.length < 2) return;
            AudioTrack t = new AudioTrack(
                    new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build(),
                    new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build(),
                    pcm.length & ~1, AudioTrack.MODE_STATIC, AudioManager.AUDIO_SESSION_ID_GENERATE);
            t.write(pcm, 0, pcm.length & ~1);
            t.play();
            track = t;
        } catch (Exception ignored) {
        }
    }

    static synchronized void stopPcm() {
        if (track == null) return;
        try {
            track.stop();
            track.release();
        } catch (Exception ignored) {
        }
        track = null;
    }

    static synchronized boolean pcmPlaying() {
        return track != null && track.getPlayState() == AudioTrack.PLAYSTATE_PLAYING
                && track.getPlaybackHeadPosition() < track.getBufferSizeInFrames() - 1;
    }
}
