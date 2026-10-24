package com.nylonv2.riascompanion;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Intent;
import android.os.Parcelable;
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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Lets Rias read your new notifications to you ("What did I miss?"). Only kept in memory on
 * the phone, for the last few hours; only on if you allow notification access.
 */
public class RiasNotifications extends NotificationListenerService {
    private static final List<JSONObject> recent = new ArrayList<>();
    /** The notifications behind recent messages, to open their chat or reply when you tap it. */
    private static final Map<String, Notification> live = new LinkedHashMap<String, Notification>() {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Notification> e) {
            return size() > 40;
        }
    };

    /** The listener just connected: pick up the messages already in the shade. */
    @Override
    public void onListenerConnected() {
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active != null) for (StatusBarNotification sbn : active) onNotificationPosted(sbn);
        } catch (Exception ignored) {
        }
    }

    private static Notification.Action replyAction(Notification n) {
        if (n.actions == null) return null;
        for (Notification.Action a : n.actions) {
            RemoteInput[] ri = a.getRemoteInputs();
            if (ri != null && ri.length > 0 && ri[0].getAllowFreeFormInput()) return a;
        }
        return null;
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
            CharSequence convo = x.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE);
            Notification.Action reply = replyAction(n);
            boolean isMsg = Notification.CATEGORY_MESSAGE.equals(n.category) || x.containsKey(Notification.EXTRA_MESSAGES) || reply != null;
            JSONObject o = new JSONObject();
            o.put("key", sbn.getKey());
            o.put("pkg", sbn.getPackageName());
            o.put("app", app);
            o.put("msg", isMsg);
            o.put("canReply", reply != null);
            if (convo != null) o.put("convo", convo.toString());
            // The last few messages of the conversation, when the app includes them.
            Parcelable[] msgs = x.getParcelableArray(Notification.EXTRA_MESSAGES);
            if (msgs != null) {
                JSONArray hist = new JSONArray();
                for (int i = Math.max(0, msgs.length - 8); i < msgs.length; i++) {
                    if (!(msgs[i] instanceof Bundle)) continue;
                    Bundle m = (Bundle) msgs[i];
                    CharSequence mt = m.getCharSequence("text");
                    if (mt == null) continue;
                    CharSequence who = m.getCharSequence("sender");
                    if (who == null && android.os.Build.VERSION.SDK_INT >= 28) {
                        android.app.Person per = m.getParcelable("sender_person");
                        if (per != null) who = per.getName();
                    }
                    hist.put(new JSONObject().put("from", who == null ? "" : who.toString()).put("text", mt.toString()));
                }
                o.put("history", hist);
            }
            if (isMsg) synchronized (live) { live.put(sbn.getKey(), n); }
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

    /** Recent message conversations (texts, WhatsApp, DMs…) from the last day, newest first, one per chat. */
    static String messages() {
        long floor = System.currentTimeMillis() - 24 * 3600000L;
        JSONArray out = new JSONArray();
        Map<String, Boolean> seen = new HashMap<>();
        synchronized (recent) {
            for (int i = recent.size() - 1; i >= 0; i--) {
                JSONObject o = recent.get(i);
                if (!o.optBoolean("msg") || o.optLong("ts") < floor) continue;
                String chat = o.optString("pkg") + "|" + o.optString("convo", o.optString("title"));
                if (seen.containsKey(chat)) continue;
                seen.put(chat, true);
                out.put(o);
            }
        }
        return out.toString();
    }

    /** Opens that conversation in its app (the notification's own tap action). */
    static String open(android.content.Context c, String key) {
        Notification n;
        synchronized (live) { n = live.get(key); }
        if (n == null || n.contentIntent == null) return "gone";
        try {
            n.contentIntent.send();
            return "ok";
        } catch (PendingIntent.CanceledException e) {
            return "gone";
        }
    }

    /** Sends `text` through the app's own notification reply. Only ever called when you tap Send. */
    static String reply(android.content.Context c, String key, String text) {
        Notification n;
        synchronized (live) { n = live.get(key); }
        Notification.Action a = n == null ? null : replyAction(n);
        if (a == null) return "no-reply";
        try {
            RemoteInput[] ris = a.getRemoteInputs();
            Bundle results = new Bundle();
            for (RemoteInput ri : ris) results.putCharSequence(ri.getResultKey(), text);
            Intent fill = new Intent().addFlags(Intent.FLAG_RECEIVER_FOREGROUND);
            RemoteInput.addResultsToIntent(ris, fill, results);
            a.actionIntent.send(c, 0, fill);
            return "ok";
        } catch (Exception e) {
            return "gone";
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
