package com.nylonv2.riascompanion;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.os.Build;
import android.widget.RemoteViews;

/**
 * Chat widget: her latest line, a "Say something" bar and mic (open the quick-chat box),
 * and quick replies that go straight to her; answers arrive as notifications.
 */
public class RiasChatWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        update(c);
    }

    static void update(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, RiasChatWidget.class));
            if (ids == null || ids.length == 0) return;
            String pkg = c.getPackageName();
            Resources r = c.getResources();
            RemoteViews v = new RemoteViews(pkg, r.getIdentifier("widget_chat", "layout", pkg));
            v.setTextViewText(r.getIdentifier("chat_last", "id", pkg), ChatLog.last(c));
            Bitmap pic = Scheduler.picture(c);
            if (pic != null) v.setImageViewBitmap(r.getIdentifier("chat_pic", "id", pkg), Bitmap.createScaledBitmap(pic, 120, 120, true));
            int imm = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            Intent box = new Intent(c, QuickChatActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            v.setOnClickPendingIntent(r.getIdentifier("chat_input", "id", pkg), PendingIntent.getActivity(c, 8001, box, imm));
            Intent voice = new Intent(c, QuickChatActivity.class).putExtra(QuickChatActivity.EXTRA_VOICE, true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            v.setOnClickPendingIntent(r.getIdentifier("chat_mic", "id", pkg), PendingIntent.getActivity(c, 8002, voice, imm));
            v.setOnClickPendingIntent(r.getIdentifier("chat_head", "id", pkg),
                    PendingIntent.getActivity(c, 8003, new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), imm));
            String[][] quick = {{"chat_q1", "How's my day looking?"}, {"chat_q2", "Talk to me, I'm bored"}};
            for (int i = 0; i < quick.length; i++) {
                Intent say = new Intent(c, RiasReplyService.class).setAction(RiasReplyService.ACTION_SAY).putExtra(RiasReplyService.EXTRA_TEXT, quick[i][1]);
                PendingIntent pi = Build.VERSION.SDK_INT >= 26 ? PendingIntent.getForegroundService(c, 8010 + i, say, imm)
                        : PendingIntent.getService(c, 8010 + i, say, imm);
                v.setOnClickPendingIntent(r.getIdentifier(quick[i][0], "id", pkg), pi);
            }
            m.updateAppWidget(ids, v);
        } catch (Exception ignored) {
        }
    }
}
