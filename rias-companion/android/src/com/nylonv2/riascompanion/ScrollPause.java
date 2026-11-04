package com.nylonv2.riascompanion;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "Pause before scrolling": when one of the apps you picked comes to the front, a short pause
 * screen shows first, with a big "Close it" button (PauseActivity). It only watches which app
 * is in front; it never reads what's on the screen.
 */
public class ScrollPause extends AccessibilityService {
    static final String PREFS = "rias_pause";
    private static long lastShown;
    private static String lastPkg = "";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Settings from the app: {on, apps:[package…], seconds, grace (minutes), plan: JSON [{at, text}] not done yet}. */
    static void configure(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            SharedPreferences.Editor e = prefs(c).edit();
            if (o.has("on")) e.putBoolean("on", o.optBoolean("on"));
            if (o.has("apps")) {
                JSONArray a = o.optJSONArray("apps");
                StringBuilder sb = new StringBuilder(",");
                if (a != null) for (int i = 0; i < a.length(); i++) sb.append(a.optString(i)).append(',');
                e.putString("apps", sb.toString());
            }
            if (o.has("seconds")) e.putInt("seconds", Math.max(3, Math.min(30, o.optInt("seconds", 5))));
            if (o.has("grace")) e.putInt("grace", Math.max(1, Math.min(60, o.optInt("grace", 10))));
            if (o.has("plan")) e.putString("plan", o.optString("plan", "[]"));
            e.apply();
        } catch (Exception ignored) {
        }
    }

    /** Whether the user turned the service on in Android's Accessibility settings. */
    static boolean enabled(Context c) {
        String list = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (list == null) return false;
        String me = new ComponentName(c, ScrollPause.class).flattenToString();
        String shortMe = new ComponentName(c, ScrollPause.class).flattenToShortString();
        for (String s : list.split(":")) if (s.equalsIgnoreCase(me) || s.equalsIgnoreCase(shortMe)) return true;
        return false;
    }

    /** {label, text}: what you should be doing right now (started in the last hour), else what's next. Null if nothing. */
    static String[] current(Context c) {
        try {
            JSONArray a = new JSONArray(prefs(c).getString("plan", "[]"));
            long now = System.currentTimeMillis();
            String nowText = null, nextText = null;
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                long at = o.optLong("at");
                if (at <= now && at >= now - 3600000L) nowText = o.optString("text");
                else if (at > now && nextText == null) nextText = o.optString("text");
            }
            if (nowText != null) return new String[] { "Right now on your plan", nowText };
            if (nextText != null) return new String[] { "Next on your plan", nextText };
        } catch (Exception ignored) {
        }
        return null;
    }

    /** "Open anyway": leave that app alone for the grace period. */
    static void allow(Context c, String pkg) {
        SharedPreferences p = prefs(c);
        p.edit().putLong("allow_" + pkg, System.currentTimeMillis() + p.getInt("grace", 10) * 60000L).apply();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || event.getPackageName() == null) return;
        String pkg = event.getPackageName().toString();
        // The notification shade and keyboards aren't "switching apps".
        if (pkg.equals("com.android.systemui") || pkg.contains("inputmethod") || pkg.contains("keyboard")) return;
        // Only when you switch INTO the app, not every screen change inside it.
        boolean switched = !pkg.equals(lastPkg);
        lastPkg = pkg;
        if (!switched || pkg.equals(getPackageName())) return;
        SharedPreferences p = prefs(this);
        if (!p.getBoolean("on", false)) return;
        if (!p.getString("apps", "").contains("," + pkg + ",")) return;
        long now = System.currentTimeMillis();
        if (now < p.getLong("allow_" + pkg, 0)) return;
        if (now - lastShown < 2500) return; // the same opening fires a few events
        lastShown = now;
        Intent i = new Intent(this, PauseActivity.class)
                .putExtra("pkg", pkg)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        try { startActivity(i); } catch (Exception ignored) { }
    }

    @Override
    public void onInterrupt() { }
}
