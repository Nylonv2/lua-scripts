package com.nylonv2.riascompanion;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;

/**
 * Rias reading a reminder out loud on the alarm screen (the "Chime + Rias says it" sound),
 * with the voice, pitch and speed chosen in the app.
 */
final class RiasVoice {
    private static TextToSpeech tts;
    /** From say() until she finishes (covers the second or so the voice engine takes to start). */
    private static volatile boolean pending;
    private static volatile long pendingSince;

    private RiasVoice() {}

    static void sayLater(final Context ctx, final String text, long delayMs) {
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                say(ctx, text);
            }
        }, delayMs);
    }

    static void say(Context ctx, final String text) {
        say(ctx, text, false);
    }

    /** Is she still talking (native voice)? */
    static boolean speaking() {
        try {
            if (pending && System.currentTimeMillis() - pendingSince > 90000) pending = false; // never stuck
            return pending || (tts != null && tts.isSpeaking()) || KokoroVoice.speaking();
        } catch (Exception e) {
            return false;
        }
    }

    /** `assistant`: answering you (assistant volume) rather than reading a reminder at alarm volume. */
    static void say(Context ctx, final String text, final boolean assistant) {
        stop();
        if (text == null || text.isEmpty()) return;
        // Kokoro (Settings → Her voice), when it's chosen and downloaded.
        if (KokoroVoice.say(ctx, text, assistant ? AudioAttributes.USAGE_ASSISTANT : AudioAttributes.USAGE_ALARM)) return;
        sayTts(ctx, text, assistant);
    }

    /** The phone's own voice, skipping Kokoro (its fallback when something goes wrong). */
    static void sayPhone(final Context ctx, final String text) {
        new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
                sayTts(ctx, text, true);
            }
        });
    }

    private static void sayTts(Context ctx, final String text, final boolean assistant) {
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception ignored) {
            }
            tts = null;
        }
        pending = true;
        pendingSince = System.currentTimeMillis();
        final Context c = ctx.getApplicationContext();
        final SharedPreferences p = c.getSharedPreferences("rias", Context.MODE_PRIVATE);
        final TextToSpeech[] holder = new TextToSpeech[1];
        holder[0] = new TextToSpeech(c, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                TextToSpeech t = holder[0];
                if (status != TextToSpeech.SUCCESS || t == null || t != tts) {
                    if (t == tts) pending = false;
                    return;
                }
                try {
                    t.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                        @Override public void onStart(String id) { }
                        @Override public void onDone(String id) { pending = false; }
                        @Override public void onError(String id) { pending = false; }
                        @Override public void onStop(String id, boolean interrupted) { pending = false; }
                    });
                    t.setAudioAttributes(new AudioAttributes.Builder().setUsage(assistant ? AudioAttributes.USAGE_ASSISTANT : AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                    String name = p.getString("voiceName", "");
                    if (!name.isEmpty() && t.getVoices() != null) {
                        for (Voice v : t.getVoices()) {
                            if (v.getName().equals(name)) {
                                t.setVoice(v);
                                break;
                            }
                        }
                    }
                    t.setPitch(p.getFloat("voicePitch", 0.95f));
                    t.setSpeechRate(p.getFloat("voiceRate", 0.9f));
                    if (t.speak(text.replace("~", "").replace("\n", ". "), TextToSpeech.QUEUE_FLUSH, null, assistant ? "rias-reply" : "rias-alarm") != TextToSpeech.SUCCESS) pending = false;
                } catch (Exception ignored) {
                    pending = false;
                }
            }
        });
        tts = holder[0];
    }

    static void stop() {
        pending = false;
        KokoroVoice.stop();
        if (tts == null) return;
        try {
            tts.stop();
            tts.shutdown();
        } catch (Exception ignored) {
        }
        tts = null;
    }
}
