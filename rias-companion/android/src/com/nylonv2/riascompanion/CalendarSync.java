package com.nylonv2.riascompanion;

import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.CalendarContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.TimeZone;

/**
 * Copies what Rias plans (to-dos, goal sessions, work shifts, one-time reminders) into the phone's calendar
 * (Google Calendar), so it shows on your computer and watch too. Only events it created are ever changed:
 * it remembers their ids. Events start without their own alarm, since the app already reminds you.
 */
final class CalendarSync {
    private static final String PREFS = "rias_calsync";
    private static volatile String status = "";
    private static final Object LOCK = new Object();

    private CalendarSync() {
    }

    static boolean allowed(Context c) {
        return Build.VERSION.SDK_INT < 23 || (c.checkSelfPermission(android.Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED
                && c.checkSelfPermission(android.Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED);
    }

    /** {allowed, calendar, count, error} for Settings. */
    static String status(Context c) {
        try {
            JSONObject o = status.isEmpty() ? new JSONObject() : new JSONObject(status);
            o.put("allowed", allowed(c));
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /** The ids of events Rias put in the calendar (so reading the calendar back skips them). */
    static Set<Long> ownIds(Context c) {
        Set<Long> ids = new HashSet<>();
        for (Object v : c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getAll().values()) {
            String s = String.valueOf(v);
            try {
                ids.add(Long.parseLong(s.substring(0, s.indexOf('|'))));
            } catch (Exception ignored) {
            }
        }
        return ids;
    }

    /** `json`: [{key, title, start, end}] for the coming days. An empty list removes everything still ahead. */
    static void sync(final Context ctx, final String json) {
        final Context c = ctx.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                synchronized (LOCK) {
                    try {
                        apply(c, new JSONArray(json == null ? "[]" : json));
                    } catch (Exception e) {
                        setStatus(null, 0, String.valueOf(e.getMessage()));
                    }
                }
            }
        }, "calendar-sync").start();
    }

    private static void apply(Context c, JSONArray want) throws Exception {
        if (!allowed(c)) {
            setStatus(null, 0, "permission");
            return;
        }
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = p.edit();
        long now = System.currentTimeMillis();
        String[] cal = want.length() > 0 ? calendar(c) : null;
        if (want.length() > 0 && cal == null) {
            setStatus(null, 0, "no-calendar");
            return;
        }
        Set<String> keep = new HashSet<>();
        int count = 0;
        for (int i = 0; i < want.length(); i++) {
            JSONObject e = want.getJSONObject(i);
            String key = e.getString("key");
            long start = e.getLong("start"), end = e.getLong("end");
            String title = e.optString("title", "Plan");
            String hash = title + "@" + start + "-" + end;
            keep.add(key);
            String had = p.getString(key, null);
            if (had != null) {
                String[] parts = had.split("\\|", 3);
                if (parts.length >= 2 && parts[1].equals(hash)) { count++; continue; }
                long id = Long.parseLong(parts[0]);
                ContentValues v = new ContentValues();
                v.put(CalendarContract.Events.TITLE, title);
                v.put(CalendarContract.Events.DTSTART, start);
                v.put(CalendarContract.Events.DTEND, end);
                int n = c.getContentResolver().update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), v, null, null);
                if (n > 0) { ed.putString(key, id + "|" + hash + "|" + start); count++; continue; }
                // Deleted in the calendar app: add it again below.
            }
            ContentValues v = new ContentValues();
            v.put(CalendarContract.Events.CALENDAR_ID, Long.parseLong(cal[0]));
            v.put(CalendarContract.Events.TITLE, title);
            v.put(CalendarContract.Events.DTSTART, start);
            v.put(CalendarContract.Events.DTEND, end);
            v.put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
            v.put(CalendarContract.Events.DESCRIPTION, "Planned by " + Scheduler.name(c) + " (Rias Companion)");
            v.put(CalendarContract.Events.HAS_ALARM, 0);
            Uri u = c.getContentResolver().insert(CalendarContract.Events.CONTENT_URI, v);
            if (u != null) {
                ed.putString(key, ContentUris.parseId(u) + "|" + hash + "|" + start);
                count++;
            }
        }
        // Things no longer planned: remove them if they're still ahead; past ones stay as a record.
        for (Iterator<String> it = p.getAll().keySet().iterator(); it.hasNext(); ) {
            String key = it.next();
            if (keep.contains(key)) continue;
            String[] parts = p.getString(key, "").split("\\|", 3);
            try {
                long start = parts.length > 2 ? Long.parseLong(parts[2]) : 0;
                if (start > now) c.getContentResolver().delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, Long.parseLong(parts[0])), null, null);
            } catch (Exception ignored) {
            }
            ed.remove(key);
        }
        ed.apply();
        setStatus(cal == null ? null : cal[1], count, "");
    }

    /** [id, name]: the user's main writable calendar (their Google account's own one when there is one). */
    private static String[] calendar(Context c) {
        String[] cols = {CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CalendarContract.Calendars.ACCOUNT_TYPE,
                CalendarContract.Calendars.ACCOUNT_NAME, CalendarContract.Calendars.OWNER_ACCOUNT};
        Cursor cur = c.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, cols,
                CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + ">=" + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR + " AND "
                        + CalendarContract.Calendars.VISIBLE + "=1", null, null);
        if (cur == null) return null;
        String[] best = null;
        int bestScore = -1;
        try {
            while (cur.moveToNext()) {
                String type = cur.getString(2), account = cur.getString(3), owner = cur.getString(4);
                int score = 0;
                if ("com.google".equals(type)) score += 2;
                if (account != null && account.equals(owner)) score += 2; // the account's own calendar, not a shared one
                if (score > bestScore) {
                    bestScore = score;
                    best = new String[] {String.valueOf(cur.getLong(0)), cur.getString(1) == null ? "Calendar" : cur.getString(1)};
                }
            }
        } finally {
            cur.close();
        }
        return best;
    }

    private static void setStatus(String calendar, int count, String error) {
        try {
            JSONObject o = new JSONObject();
            o.put("calendar", calendar == null ? "" : calendar);
            o.put("count", count);
            o.put("error", error == null ? "" : error);
            o.put("at", System.currentTimeMillis());
            status = o.toString();
        } catch (Exception ignored) {
        }
    }
}
