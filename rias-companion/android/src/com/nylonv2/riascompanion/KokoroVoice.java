package com.nylonv2.riascompanion;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;

import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsCallback;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;

import java.io.File;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Kokoro: a free, natural-sounding neural voice that runs on the phone (sherpa-onnx engine, Apache-2.0;
 * Kokoro-82M model, Apache-2.0). The voice model (about 100 MB) downloads once when it's chosen in Settings;
 * after that it works offline. Speech streams sentence by sentence, so she starts talking quickly.
 */
final class KokoroVoice {
    static final String MODEL = "kokoro-int8-en-v0_19";
    static final String URL_MODEL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/" + MODEL + ".tar.bz2";
    static final int DEFAULT_VOICE = 7; // bf_emma: British, poised

    /** "", "downloading:NN", "unpacking", "ready" or "error:<why>". */
    private static volatile String state = "";
    private static volatile boolean downloading;
    private static OfflineTts tts;
    private static HandlerThread thread;
    private static Handler worker;
    private static volatile int generation; // bumps on stop(): the running sentence notices and stops
    private static final java.util.concurrent.atomic.AtomicInteger queued = new java.util.concurrent.atomic.AtomicInteger();
    private static AudioTrack track;

    private KokoroVoice() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("rias", Context.MODE_PRIVATE);
    }

    /** The engine is built for 64-bit ARM phones (nearly every phone from the last several years). */
    static boolean supported() {
        for (String abi : Build.SUPPORTED_ABIS) if ("arm64-v8a".equals(abi)) return true;
        return false;
    }

    static File dir(Context c) {
        return new File(c.getFilesDir(), "kokoro/" + MODEL);
    }

    static boolean ready(Context c) {
        return new File(dir(c), ".done").exists();
    }

    static String status(Context c) {
        if (!supported()) return "unsupported";
        return ready(c) ? "ready" : state;
    }

    /** Chosen in Settings → Her voice, downloaded and usable on this phone. */
    static boolean active(Context c) {
        return "kokoro".equals(prefs(c).getString("voiceStyle", "")) && supported() && ready(c);
    }

    static void choose(Context c, String style, int voice) {
        prefs(c).edit().putString("voiceStyle", style == null ? "" : style).putInt("kokoroVoice", voice).apply();
        warm(c);
    }

    /** Loads the model in the background (a second or two) so her first answer starts quickly. */
    static void warm(Context ctx) {
        final Context c = ctx.getApplicationContext();
        if (!active(c)) return;
        worker().post(new Runnable() {
            @Override
            public void run() {
                try {
                    if (tts == null) tts = load(c);
                } catch (Throwable ignored) {
                }
            }
        });
    }

    static void download(final Context ctx) {
        final Context c = ctx.getApplicationContext();
        if (!supported() || ready(c) || downloading) return;
        downloading = true;
        state = "downloading:0";
        new Thread(new Runnable() {
            @Override
            public void run() {
                File root = new File(c.getFilesDir(), "kokoro");
                File tmp = new File(root, "tmp");
                try {
                    deleteTree(tmp);
                    tmp.mkdirs();
                    HttpURLConnection con = (HttpURLConnection) new URL(URL_MODEL).openConnection();
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(60000);
                    con.setInstanceFollowRedirects(true);
                    int code = con.getResponseCode();
                    if (code != 200) throw new IOException("download failed (" + code + ")");
                    final long total = con.getContentLengthLong();
                    // Unpack while downloading: no 100 MB archive left lying around.
                    InputStream in = new FilterInputStream(con.getInputStream()) {
                        long got;

                        @Override
                        public int read(byte[] b, int off, int len) throws IOException {
                            int n = super.read(b, off, len);
                            if (n > 0) {
                                got += n;
                                if (total > 0) state = "downloading:" + Math.min(99, (int) (got * 100 / total));
                            }
                            return n;
                        }
                    };
                    try {
                        TarBz2.extract(in, tmp);
                    } finally {
                        con.disconnect();
                    }
                    File got = new File(tmp, MODEL);
                    if (!new File(got, "model.int8.onnx").isFile() || !new File(got, "voices.bin").isFile()) throw new IOException("unexpected download");
                    File dest = dir(c);
                    deleteTree(dest);
                    if (!got.renameTo(dest)) throw new IOException("couldn't save the voice");
                    new File(dest, ".done").createNewFile();
                    deleteTree(tmp);
                    state = "ready";
                    warm(c);
                } catch (Exception e) {
                    deleteTree(tmp);
                    String m = e.getMessage();
                    state = "error:" + (m == null ? e.getClass().getSimpleName() : m);
                } finally {
                    downloading = false;
                }
            }
        }, "kokoro-download").start();
    }

    /** Removes the downloaded voice (Settings → Her voice → Remove). */
    static void remove(Context c) {
        stop();
        final Handler w = worker();
        w.post(new Runnable() {
            @Override
            public void run() {
                if (tts != null) {
                    tts.release();
                    tts = null;
                }
            }
        });
        deleteTree(new File(c.getFilesDir(), "kokoro"));
        state = "";
    }

    private static synchronized Handler worker() {
        if (worker == null) {
            thread = new HandlerThread("kokoro");
            thread.start();
            worker = new Handler(thread.getLooper());
        }
        return worker;
    }

    static boolean speaking() {
        return queued.get() > 0;
    }

    static void stop() {
        generation++;
        AudioTrack t = track;
        if (t != null) {
            try {
                t.pause();
                t.flush();
            } catch (Exception ignored) {
            }
        }
    }

    /** Says `text` in the chosen Kokoro voice, after anything still being said. False if it can't (then the phone voice is used). */
    static boolean say(Context ctx, String text, final int usage) {
        return say(ctx, text, usage, true);
    }

    /** `flush`: cut off whatever she's saying first; otherwise this waits its turn (chat lines one after another). */
    static boolean say(Context ctx, String text, final int usage, boolean flush) {
        Context c = ctx.getApplicationContext();
        if (!active(c)) return false;
        return speakWith(c, text, usage, flush, prefs(c).getInt("kokoroVoice", DEFAULT_VOICE));
    }

    /** "▶ Hear her" in Settings: try a voice before choosing it. */
    static boolean preview(Context ctx, String text, int voice) {
        Context c = ctx.getApplicationContext();
        if (!supported() || !ready(c)) return false;
        return speakWith(c, text, AudioAttributes.USAGE_MEDIA, true, voice);
    }

    private static boolean speakWith(final Context c, String text, final int usage, boolean flush, final int sid) {
        if (text == null) return false;
        final String clean = clean(text);
        if (clean.isEmpty()) return true;
        if (flush) stop();
        final int my = generation;
        queued.incrementAndGet();
        worker().post(new Runnable() {
            @Override
            public void run() {
                speak(c, clean, sid, my, usage);
            }
        });
        return true;
    }

    private static void speak(Context c, String text, int sid, final int my, int usage) {
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        try {
            if (my != generation) return; // stopped before its turn
            if (tts == null) tts = load(c);
            final int rate = tts.getSampleRate();
            final AudioTrack t = trackFor(rate, usage);
            if (am != null) am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
            final long[] frames = {0};
            t.play();
            final long startHead = t.getPlaybackHeadPosition() & 0xffffffffL;
            tts.generateWithCallback(text, sid, 1.0f, new OfflineTtsCallback() {
                @Override
                public Integer invoke(float[] samples) {
                    // Small non-blocking writes, so stop() can cut in at any moment.
                    int off = 0;
                    while (off < samples.length) {
                        if (my != generation) return 0; // stopped: quit making the rest
                        int w = t.write(samples, off, samples.length - off, AudioTrack.WRITE_NON_BLOCKING);
                        if (w < 0) return 0;
                        off += w;
                        if (w == 0) {
                            try {
                                Thread.sleep(15);
                            } catch (InterruptedException e) {
                                return 0;
                            }
                        }
                    }
                    frames[0] += samples.length;
                    return 1;
                }
            });
            // Let the last sentence finish playing.
            long deadline = System.currentTimeMillis() + 2000 + frames[0] * 1000 / rate;
            while (my == generation && (t.getPlaybackHeadPosition() & 0xffffffffL) - startHead < frames[0]
                    && System.currentTimeMillis() < deadline) Thread.sleep(40);
            if (my == generation) t.pause();
        } catch (Throwable e) {
            android.util.Log.w("RiasKokoro", "speak", e);
            if (my == generation) RiasVoice.sayPhone(c, text); // fall back to the phone voice
        } finally {
            if (am != null) am.abandonAudioFocus(null);
            queued.decrementAndGet();
        }
    }

    private static OfflineTts load(Context c) {
        File d = dir(c);
        OfflineTtsKokoroModelConfig k = OfflineTtsKokoroModelConfig.builder()
                .setModel(new File(d, "model.int8.onnx").getAbsolutePath())
                .setVoices(new File(d, "voices.bin").getAbsolutePath())
                .setTokens(new File(d, "tokens.txt").getAbsolutePath())
                .setDataDir(new File(d, "espeak-ng-data").getAbsolutePath())
                .build();
        int threads = Math.max(2, Math.min(4, Runtime.getRuntime().availableProcessors() / 2));
        OfflineTtsModelConfig m = OfflineTtsModelConfig.builder().setKokoro(k).setNumThreads(threads).setDebug(false).build();
        return new OfflineTts(OfflineTtsConfig.builder().setModel(m).setMaxNumSentences(1).build());
    }

    private static int trackUsage;

    private static AudioTrack trackFor(int rate, int usage) {
        if (track != null && track.getSampleRate() == rate && trackUsage == usage) {
            track.flush();
            return track;
        }
        if (track != null) track.release();
        int min = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT);
        track = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(usage)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                        .setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(Math.max(min, rate * 4 / 2)) // half a second
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build();
        trackUsage = usage;
        return track;
    }

    /** Drops what a voice shouldn't read out: emoji, decorations, markdown. */
    static String clean(String t) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < t.length(); ) {
            int cp = t.codePointAt(i);
            i += Character.charCount(cp);
            if (cp > 0x2BFF && cp < 0x3000) continue;       // arrows, symbols
            if (cp >= 0x1F000 || (cp >= 0x2600 && cp <= 0x27BF) || cp == 0xFE0F || cp == 0x200D) continue; // emoji
            sb.appendCodePoint(cp);
        }
        return sb.toString().replace("~", ".").replace("…", "...").replace("*", "").replace("#", "")
                .replaceAll("\\s*\\n+\\s*", ". ").replaceAll("\\.{4,}", "...").replaceAll("\\s{2,}", " ").trim();
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }
}
