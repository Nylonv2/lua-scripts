package com.nylonv2.riascompanion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.app.RemoteInput;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;

/**
 * Talks to Rias without opening the app: a message from the chat widget, the quick-chat box
 * or a notification's Reply goes to the app's own logic running in a hidden WebView
 * (index.html#headless: same AI, memory, reminders and chat history), and her answer comes
 * back as a conversation notification you can reply to again.
 */
public class RiasReplyService extends Service {
    static final String ACTION_SAY = "com.nylonv2.riascompanion.SAY";
    static final String ACTION_REPLY = "com.nylonv2.riascompanion.REPLY";
    static final String EXTRA_TEXT = "text";
    static final String EXTRA_CANCEL = "cancelId";
    static final String EXTRA_VOICE = "voice";   // answer out loud
    static final String EXTRA_ASSIST = "assist"; // asked from the assistant sheet (it shows the answer itself)

    /** The assistant sheet, while it's open: gets her lines as soon as they're ready. */
    interface AssistListener {
        void onLines(String json);

        void onDone();
    }

    static AssistListener assist;
    static final String KEY_REPLY = "rias_reply";
    static final String CHANNEL = "rias_chat";
    static final int NOTE_ID = 7700;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayDeque<String[]> queue = new ArrayDeque<>();
    private String[] current;
    private WebView web;
    private boolean ready, busy, lastShown;
    private final Runnable timeout = new Runnable() {
        @Override
        public void run() {
            finishTurn(null);
        }
    };

    /** Starts the service with a message (from an activity, widget tap or notification). */
    static void say(Context c, String text) {
        say(c, text, false, false);
    }

    static void say(Context c, String text, boolean voice, boolean fromAssist) {
        Intent i = new Intent(c, RiasReplyService.class).setAction(ACTION_SAY).putExtra(EXTRA_TEXT, text)
                .putExtra(EXTRA_VOICE, voice).putExtra(EXTRA_ASSIST, fromAssist);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    static PendingIntent replyIntent(Context c, int cancelId) {
        Intent i = new Intent(c, RiasReplyService.class).setAction(ACTION_REPLY).putExtra(EXTRA_CANCEL, cancelId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return Build.VERSION.SDK_INT >= 26 ? PendingIntent.getForegroundService(c, 7000 + (cancelId & 0xff), i, flags)
                : PendingIntent.getService(c, 7000 + (cancelId & 0xff), i, flags);
    }

    static Notification.Action replyAction(Context c, int cancelId) {
        RemoteInput ri = new RemoteInput.Builder(KEY_REPLY).setLabel("Reply to Rias").build();
        int icon = c.getResources().getIdentifier("ic_stat_rias", "drawable", c.getPackageName());
        return new Notification.Action.Builder(Icon.createWithResource(c, icon != 0 ? icon : android.R.drawable.ic_menu_send),
                "Reply", replyIntent(c, cancelId)).addRemoteInput(ri).setAllowGeneratedReplies(true).build();
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Chat with Rias", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Her replies when you talk to her from the widget or a notification");
        nm.createNotificationChannel(ch);
    }

    /** The conversation as a messaging notification, with a Reply box. */
    @SuppressWarnings("deprecation")
    static Notification conversation(Context c, boolean typing) {
        ensureChannel(c);
        int small = c.getResources().getIdentifier("ic_stat_rias", "drawable", c.getPackageName());
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL)
                : new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        b.setSmallIcon(small != 0 ? small : android.R.drawable.ic_popup_reminder)
                .setColor(0xFFC8173A)
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setOnlyAlertOnce(typing)
                .setShowWhen(true)
                .setContentIntent(PendingIntent.getActivity(c, 7001, new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
                .addAction(replyAction(c, NOTE_ID));
        JSONArray log = ChatLog.all(c);
        Bitmap pic = Scheduler.picture(c);
        if (Build.VERSION.SDK_INT >= 28) {
            Person me = new Person.Builder().setName("You").build();
            Person.Builder rb = new Person.Builder().setName("Rias");
            if (pic != null) rb.setIcon(Icon.createWithBitmap(pic));
            Person rias = rb.build();
            Notification.MessagingStyle st = new Notification.MessagingStyle(me).setConversationTitle("Rias");
            for (int i = Math.max(0, log.length() - 8); i < log.length(); i++) {
                JSONObject o = log.optJSONObject(i);
                if (o == null) continue;
                st.addMessage(o.optString("text"), o.optLong("ts"), "me".equals(o.optString("from")) ? null : rias);
            }
            if (typing) st.addMessage("typing…", System.currentTimeMillis(), rias);
            b.setStyle(st);
        } else {
            JSONObject lastO = log.length() > 0 ? log.optJSONObject(log.length() - 1) : null;
            String last = typing ? "Rias is typing…" : lastO != null ? lastO.optString("text") : "";
            b.setContentTitle("Rias").setContentText(last).setStyle(new Notification.BigTextStyle().bigText(last));
            if (pic != null) b.setLargeIcon(pic);
        }
        return b.build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String text = null;
        boolean voice = false, fromAssist = false;
        if (intent != null) {
            voice = intent.getBooleanExtra(EXTRA_VOICE, false);
            fromAssist = intent.getBooleanExtra(EXTRA_ASSIST, false);
            text = intent.getStringExtra(EXTRA_TEXT);
            if (ACTION_REPLY.equals(intent.getAction())) {
                Bundle r = RemoteInput.getResultsFromIntent(intent);
                CharSequence cs = r == null ? null : r.getCharSequence(KEY_REPLY);
                text = cs == null ? null : cs.toString();
                int cancel = intent.getIntExtra(EXTRA_CANCEL, 0);
                if (cancel != 0 && cancel != NOTE_ID) {
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(cancel);
                }
            }
        }
        if (text != null && !text.trim().isEmpty()) ChatLog.add(this, "me", text);
        Notification n = conversation(this, true);
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE);
        else startForeground(NOTE_ID, n);
        if (text == null || text.trim().isEmpty()) {
            if (!busy && queue.isEmpty()) stopTurn();
            return START_NOT_STICKY;
        }
        // While the app is on screen, it answers in its own chat instead.
        queue.add(new String[] {text.trim(), voice ? "1" : "", fromAssist ? "1" : ""});
        ensureWeb();
        pump();
        return START_NOT_STICKY;
    }

    private void ensureWeb() {
        if (web != null) return;
        ready = false;
        web = new WebView(getApplicationContext());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void ready() {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        ready = true;
                        pump();
                    }
                });
            }

            @JavascriptInterface
            public void lines(final String json) {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (current != null && !current[2].isEmpty() && assist != null) assist.onLines(json);
                    }
                });
            }

            @JavascriptInterface
            public void reply(final String json) {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        finishTurn(json);
                    }
                });
            }
        }, "RiasHeadless");
        web.addJavascriptInterface(new MiniNative(), "RiasNative");
        web.addJavascriptInterface(new RiasDevice(this, null), "RiasDevice");
        web.loadUrl("file:///android_asset/www/index.html#headless");
    }

    private void pump() {
        if (!ready || busy || queue.isEmpty() || web == null) return;
        busy = true;
        current = queue.poll();
        String opts = "{\"voice\":" + !current[1].isEmpty() + ",\"assist\":" + !current[2].isEmpty() + "}";
        web.evaluateJavascript("window.riasHeadlessSay && window.riasHeadlessSay(" + JSONObject.quote(current[0]) + "," + opts + ")", null);
        main.postDelayed(timeout, 80000);
    }

    private void finishTurn(String json) {
        main.removeCallbacks(timeout);
        busy = false;
        int added = 0;
        try {
            JSONArray lines = new JSONArray(json == null ? "[]" : json);
            for (int i = 0; i < lines.length(); i++) {
                ChatLog.add(this, "rias", lines.optString(i));
                added++;
            }
        } catch (Exception ignored) {
        }
        if (added == 0) ChatLog.add(this, "rias", "Sorry, I couldn't answer just now. Try again in a moment, or open the app.");
        boolean shown = current != null && !current[2].isEmpty() && assist != null;
        if (shown) {
            if (added == 0) assist.onLines("[\"Sorry, I couldn't answer just now. Try again in a moment.\"]");
            assist.onDone();
        } else {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTE_ID, conversation(this, false));
        }
        lastShown = shown;
        current = null;
        RiasChatWidget.update(this);
        if (queue.isEmpty()) stopTurn(); else pump();
    }

    @SuppressWarnings("deprecation")
    private void stopTurn() {
        // The assistant sheet showed the answer: no notification needed.
        if (lastShown) stopForeground(true);
        else if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_DETACH); else stopForeground(false);
        stopSelf();
    }

    /** Android 14+: a short foreground job ran out of time. */
    @Override
    public void onTimeout(int startId) {
        finishTurn(null);
    }

    @Override
    public void onDestroy() {
        main.removeCallbacks(timeout);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** The few app features the hidden page uses: keep the reminder schedule and widgets current. */
    final class MiniNative {
        @JavascriptInterface
        public void schedule(String json) {
            Scheduler.save(RiasReplyService.this, json);
        }

        @JavascriptInterface
        public void setWidget(String json) {
            RiasWidget.save(RiasReplyService.this, json);
        }

        @JavascriptInterface
        public boolean notificationsEnabled() {
            return true;
        }
    }
}
