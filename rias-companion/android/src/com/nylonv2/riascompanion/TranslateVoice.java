package com.nylonv2.riascompanion;

import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;

import java.util.Locale;

/**
 * The live translator's voice: says a translation out loud in the other person's language.
 * Uses Google's speech engine when installed (it has the most languages), else the phone's
 * default, at natural pitch and speed. Separate from Rias's own voice settings.
 */
final class TranslateVoice {
    private static TextToSpeech tts;
    private static boolean ready;
    private static String pendingText, pendingLang;

    private TranslateVoice() {}

    private static void init(Context c) {
        if (tts != null) return;
        ready = false;
        String engine = null;
        try {
            c.getPackageManager().getPackageInfo("com.google.android.tts", 0);
            engine = "com.google.android.tts";
        } catch (PackageManager.NameNotFoundException ignored) {
        }
        final TextToSpeech[] holder = new TextToSpeech[1];
        TextToSpeech.OnInitListener l = new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(final int status) {
                new Handler(Looper.getMainLooper()).post(new Runnable() {
                    @Override
                    public void run() {
                        if (holder[0] != tts) return;
                        ready = status == TextToSpeech.SUCCESS;
                        if (!ready) { tts = null; return; }
                        tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                        if (pendingText != null) {
                            speakNow(pendingText, pendingLang);
                            pendingText = null;
                        }
                    }
                });
            }
        };
        holder[0] = engine == null ? new TextToSpeech(c.getApplicationContext(), l) : new TextToSpeech(c.getApplicationContext(), l, engine);
        tts = holder[0];
    }

    private static int speakNow(String text, String lang) {
        int r = tts.setLanguage(Locale.forLanguageTag(lang));
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) return r;
        tts.setPitch(1f);
        tts.setSpeechRate(1f);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "rias-translate");
        return TextToSpeech.SUCCESS;
    }

    /** Says `text` in `lang` (BCP-47, e.g. "es-MX"). Returns ok, starting, missing (voice data not installed) or unsupported. */
    static String say(final Context c, final String text, final String lang) {
        RiasVoice.stop();
        DeviceActions.stopPcm();
        init(c);
        if (!ready) {
            pendingText = text;
            pendingLang = lang;
            return "starting";
        }
        int r = speakNow(text, lang);
        return r == TextToSpeech.SUCCESS ? "ok" : r == TextToSpeech.LANG_MISSING_DATA ? "missing" : "unsupported";
    }

    /** Can the phone speak `lang`? ok, missing, unsupported or starting. */
    static String check(Context c, String lang) {
        init(c);
        if (!ready) return "starting";
        int r = tts.isLanguageAvailable(Locale.forLanguageTag(lang));
        return r >= TextToSpeech.LANG_AVAILABLE ? "ok" : r == TextToSpeech.LANG_MISSING_DATA ? "missing" : "unsupported";
    }

    static boolean speaking() {
        try {
            return tts != null && tts.isSpeaking();
        } catch (Exception e) {
            return false;
        }
    }

    static void stop() {
        try {
            if (tts != null) tts.stop();
        } catch (Exception ignored) {
        }
        pendingText = null;
    }
}
