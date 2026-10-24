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
        stop();
        if (text == null || text.isEmpty()) return;
        final Context c = ctx.getApplicationContext();
        final SharedPreferences p = c.getSharedPreferences("rias", Context.MODE_PRIVATE);
        final TextToSpeech[] holder = new TextToSpeech[1];
        holder[0] = new TextToSpeech(c, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                TextToSpeech t = holder[0];
                if (status != TextToSpeech.SUCCESS || t == null || t != tts) return;
                try {
                    t.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
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
                    t.speak(text.replace("~", "").replace("\n", ". "), TextToSpeech.QUEUE_FLUSH, null, "rias-alarm");
                } catch (Exception ignored) {
                }
            }
        });
        tts = holder[0];
    }

    static void stop() {
        if (tts == null) return;
        try {
            tts.stop();
            tts.shutdown();
        } catch (Exception ignored) {
        }
        tts = null;
    }
}
