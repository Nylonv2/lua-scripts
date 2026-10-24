package com.nylonv2.riascompanion;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** The last few lines of the quick chat (widget + notification replies), for the conversation notification. */
final class ChatLog {
    private static final String KEY = "quickChat";

    private ChatLog() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("rias", Context.MODE_PRIVATE);
    }

    static JSONArray all(Context c) {
        try {
            return new JSONArray(prefs(c).getString(KEY, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void add(Context c, String from, String text) {
        if (text == null || text.trim().isEmpty()) return;
        try {
            JSONArray old = all(c), out = new JSONArray();
            for (int i = Math.max(0, old.length() - 11); i < old.length(); i++) out.put(old.get(i));
            JSONObject o = new JSONObject();
            o.put("from", from);
            o.put("text", text.trim());
            o.put("ts", System.currentTimeMillis());
            out.put(o);
            SharedPreferences.Editor ed = prefs(c).edit().putString(KEY, out.toString());
            if ("rias".equals(from)) ed.putString("chatLast", text.trim());
            ed.apply();
        } catch (Exception ignored) {
        }
    }

    /** Her latest line, for the chat widget. */
    static String last(Context c) {
        return prefs(c).getString("chatLast", "Talk to me whenever you like~");
    }

    static void setLast(Context c, String text) {
        if (text != null && !text.trim().isEmpty()) prefs(c).edit().putString("chatLast", text.trim()).apply();
    }
}
