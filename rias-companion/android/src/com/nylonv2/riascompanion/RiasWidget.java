package com.nylonv2.riascompanion;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DateFormat;
import java.util.Calendar;
import java.util.Date;

/**
 * Home screen widget: her picture, the next reminder and a line from her.
 * The web app hands over upcoming items and lines (setWidget); this refreshes on
 * every reminder alarm and every 30 minutes, so it stays right with the app closed.
 */
public class RiasWidget extends AppWidgetProvider {
    private static final String PREFS = "rias";
    private static final String KEY = "widget";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        update(c);
    }

    static void save(Context c, String json) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
        update(c);
    }

    static void update(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, RiasWidget.class));
            if (ids == null || ids.length == 0) return;
            String pkg = c.getPackageName();
            Resources r = c.getResources();
            RemoteViews v = new RemoteViews(pkg, r.getIdentifier("widget_rias", "layout", pkg));
            int label = r.getIdentifier("widget_label", "id", pkg);
            int next = r.getIdentifier("widget_next", "id", pkg);
            int line = r.getIdentifier("widget_line", "id", pkg);

            JSONObject data = new JSONObject(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "{}"));
            long now = System.currentTimeMillis();
            String nextText = null, labelText = "Rias · Up next";
            JSONArray items = data.optJSONArray("next");
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject o = items.optJSONObject(i);
                    if (o == null || o.optLong("at") < now - 60000) continue;
                    Calendar when = Calendar.getInstance();
                    when.setTimeInMillis(o.optLong("at"));
                    Calendar today = Calendar.getInstance();
                    String time = DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(o.optLong("at")));
                    if (when.get(Calendar.DAY_OF_YEAR) != today.get(Calendar.DAY_OF_YEAR)) labelText = "Rias · Tomorrow";
                    nextText = time + " · " + o.optString("title");
                    break;
                }
            }
            if (nextText == null) nextText = items == null ? "Open Rias to start" : "Nothing else planned";

            int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
            String period = h < 5 || h >= 23 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
            String lineText = "";
            JSONObject lines = data.optJSONObject("lines");
            JSONArray pool = lines == null ? null : lines.optJSONArray(period);
            if (pool != null && pool.length() > 0) lineText = "“" + pool.optString((int) ((now / (30 * 60000L)) % pool.length())) + "”";

            v.setTextViewText(label, labelText);
            v.setTextViewText(next, nextText);
            v.setTextViewText(line, lineText);
            Bitmap pic = Scheduler.picture(c);
            if (pic != null) {
                v.setImageViewBitmap(r.getIdentifier("widget_pic", "id", pkg), Bitmap.createScaledBitmap(pic, 160, 160, true));
            }
            Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            v.setOnClickPendingIntent(r.getIdentifier("widget_root", "id", pkg),
                    PendingIntent.getActivity(c, 7, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            m.updateAppWidget(ids, v);
        } catch (Exception ignored) {
        }
    }
}
