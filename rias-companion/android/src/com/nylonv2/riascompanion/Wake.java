package com.nylonv2.riascompanion;

import java.util.Locale;

/**
 * Finds "Hey <name>" in what the offline model heard. It doesn't know every name ("Rias" may come out
 * as "reese" or "rios"), so names are compared by how they sound, not how they're spelled.
 */
final class Wake {
    private static final String[] STARTERS = {"hey", "hi", "hay", "okay", "ok", "yo", "hello"};

    private Wake() {
    }

    /** What you said after "Hey <name>" ("" if nothing), or null if you didn't say it. */
    static String command(String heard, String name) {
        if (heard == null || name == null) return null;
        String[] w = heard.toLowerCase(Locale.US).replaceAll("[^a-z' ]", " ").trim().split("\\s+");
        String target = sound(name);
        if (target.isEmpty()) return null;
        int nameWords = name.trim().split("\\s+").length;
        for (int i = 0; i < w.length - 1; i++) {
            if (!starter(w[i])) continue;
            // The name may be heard as one word more or less than it has ("planner" → "plan or"):
            // take the closest-sounding split, preferring the name's own word count on a tie.
            int best = -1, bestD = 2;
            for (int k = Math.max(1, nameWords - 1); k <= nameWords + 1 && i + k < w.length; k++) {
                StringBuilder cand = new StringBuilder();
                for (int j = 1; j <= k; j++) cand.append(w[i + j]);
                String snd = sound(cand.toString());
                if (!same(snd, target)) continue;
                int d = distance(snd, target);
                if (d < bestD || (d == bestD && k == nameWords)) { best = k; bestD = d; }
            }
            if (best > 0) {
                StringBuilder rest = new StringBuilder();
                for (int j = i + best + 1; j < w.length; j++) rest.append(rest.length() > 0 ? " " : "").append(w[j]);
                return rest.toString();
            }
        }
        return null;
    }

    private static boolean starter(String s) {
        for (String st : STARTERS) if (st.equals(s)) return true;
        return false;
    }

    private static boolean same(String a, String b) {
        if (a.equals(b)) return true;
        if (Math.min(a.length(), b.length()) < 3 || a.charAt(0) != b.charAt(0)) return false; // short names must sound exactly alike
        return distance(a, b) <= 1;
    }

    /** A rough sound key: first letter, then consonant sounds with look-alikes folded together. */
    static String sound(String s) {
        s = s.toLowerCase(Locale.US).replaceAll("[^a-z]", "");
        if (s.isEmpty()) return "";
        s = s.replace("ph", "f").replace("ck", "k").replace("sch", "sk").replace("sh", "s").replace("ch", "k")
                .replace("th", "t").replace("qu", "kw").replace("x", "ks").replace("wh", "w");
        StringBuilder out = new StringBuilder();
        char first = s.charAt(0);
        boolean vowelStart = "aeiouy".indexOf(first) >= 0;
        out.append(vowelStart ? 'a' : fold(first));
        for (int i = 1; i < s.length(); i++) {
            char c = s.charAt(i);
            if ("aeiouyhw".indexOf(c) >= 0) continue;
            char f = fold(c);
            if (out.charAt(out.length() - 1) != f) out.append(f);
        }
        return out.toString();
    }

    private static char fold(char c) {
        switch (c) {
            case 'c': case 'k': case 'q': case 'g': return 'k';
            case 'z': case 's': return 's';
            case 'v': case 'f': return 'f';
            case 'b': case 'p': return 'p';
            case 'd': case 't': return 't';
            case 'j': return 'k';
            case 'n': case 'm': return 'n';
            default: return c;
        }
    }

    private static int distance(String a, String b) {
        int[] prev = new int[b.length() + 1], cur = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) prev[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            cur[0] = i;
            for (int j = 1; j <= b.length(); j++)
                cur[j] = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + (a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1));
            int[] t = prev; prev = cur; cur = t;
        }
        return prev[b.length()];
    }
}
