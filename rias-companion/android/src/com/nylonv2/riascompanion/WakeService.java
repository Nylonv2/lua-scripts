package com.nylonv2.riascompanion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import org.json.JSONObject;
import org.vosk.LibVosk;
import org.vosk.LogLevel;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.util.ArrayList;
import java.util.Locale;

/**
 * "Hey …" like Siri: an offline speech model (Vosk) listens on the phone itself, silently, for
 * "Hey" + her name. Nothing is sent anywhere until you say it. Then a short buzz, and she answers
 * out loud: no pop-up, no reply notification. If you only said her name, she listens once more
 * for your question (the phone's sounds are muted for that moment so it doesn't beep).
 * Android requires a small silent "listening" notification while the microphone is in use.
 * Modes: off, charging (only while plugged in), always.
 */
public class WakeService extends Service {
    static final String CHANNEL = "rias_wake";
    static final int NOTE_ID = 7900;
    static final String ACTION_OFF = "com.nylonv2.riascompanion.WAKE_OFF";
    static volatile boolean running;
    /** For Settings: what it's doing (same as the notification) and the last thing it heard. */
    static volatile String stateText = "", lastHeard = "";
    private static final String[] HELLO_RIAS = {"Yes? What do you need?", "I'm here. What is it?", "Mm? I'm listening."};
    private static final String[] HELLO_PLAIN = {"Yes?", "How can I help?", "I'm listening."};
    private static int hello;
    private static volatile boolean paused;
    private static WakeService instance;

    private final Handler main = new Handler(Looper.getMainLooper());
    private Model model;
    private Recognizer recognizer;
    private Mic mic;
    private boolean loading, cued, turn, awaitingCommand;
    private SpeechRecognizer google;
    private final ArrayList<Integer> muted = new ArrayList<>();
    private final Runnable listenRun = new Runnable() {
        @Override
        public void run() {
            listen();
        }
    };
    private final Runnable chargeCheck = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            if ("charging".equals(mode(WakeService.this)) && !charging() && mic != null) stopMic();
            if (mic == null && !turn && !paused) listen();
            main.postDelayed(this, 60000);
        }
    };
    private final Runnable turnTimeout = new Runnable() {
        @Override
        public void run() {
            endTurn(false);
        }
    };
    private final Runnable stopAwaiting = new Runnable() {
        @Override
        public void run() {
            awaitingCommand = false;
        }
    };

    static String mode(Context c) {
        return c.getSharedPreferences("rias", Context.MODE_PRIVATE).getString("wakeMode", "off");
    }

    /** The name after "Hey": set in the app, or the assistant's / Rias's name. */
    static String wakeName(Context c) {
        String n = c.getSharedPreferences("rias", Context.MODE_PRIVATE).getString("wakeName", "");
        if (n == null || n.trim().isEmpty()) n = Scheduler.plain(c) ? Scheduler.name(c) : "Rias";
        return n.trim();
    }

    /** Saves the mode and starts/stops listening. Only works while the app is on screen (Android rule for the mic). */
    static void setMode(Context c, String mode) {
        if (mode == null || mode.isEmpty()) mode = "off";
        c.getSharedPreferences("rias", Context.MODE_PRIVATE).edit().putString("wakeMode", mode).apply();
        Intent i = new Intent(c, WakeService.class);
        if ("off".equals(mode) || !DeviceActions.granted(c, android.Manifest.permission.RECORD_AUDIO)) {
            c.stopService(i);
            return;
        }
        WakeModel.ensure(c, null); // fetch the speech model now, while the app is open
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) {
        }
    }

    static void setWakeName(Context c, String name) {
        c.getSharedPreferences("rias", Context.MODE_PRIVATE).edit().putString("wakeName", name == null ? "" : name.trim()).apply();
        final WakeService w = instance;
        if (w != null) w.main.post(new Runnable() {
            @Override
            public void run() {
                w.shown = "";
                if (w.mic != null) w.updateNote(w.idleText());
            }
        });
    }

    /** The assistant sheet opened (stop listening so it can use the mic) / closed (start again). */
    static void pause() {
        paused = true;
        final WakeService w = instance;
        if (w != null) w.main.post(new Runnable() {
            @Override
            public void run() {
                w.stopMic();
            }
        });
    }

    static void resume() {
        paused = false;
        final WakeService w = instance;
        if (w != null) {
            w.main.removeCallbacks(w.listenRun);
            w.main.postDelayed(w.listenRun, 700);
        }
    }

    /** RiasReplyService finished a hands-free answer (`question`: she asked you something back). */
    static void replied(final boolean question) {
        final WakeService w = instance;
        if (w != null) w.main.post(new Runnable() {
            @Override
            public void run() {
                w.endTurn(question);
            }
        });
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_OFF.equals(intent.getAction())) {
            getSharedPreferences("rias", MODE_PRIVATE).edit().putString("wakeMode", "off").apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        Notification n = note(idleText());
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(NOTE_ID, n);
        } catch (Exception e) {
            stopSelf(); // Android refused (started from the background): the app turns it on again when opened
            return START_NOT_STICKY;
        }
        instance = this;
        running = true;
        paused = AssistActivity.opened; // never left stuck from a pop-up that closed without saying so
        main.removeCallbacks(listenRun);
        main.post(listenRun);
        main.removeCallbacks(chargeCheck);
        main.postDelayed(chargeCheck, 60000);
        return START_NOT_STICKY;
    }

    private String idleText() {
        return "Say “Hey " + wakeName(this) + "” anytime";
    }

    private Notification note(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Hands-free listening", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Shown (silently) while she listens for “Hey …”");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
        int small = getResources().getIdentifier("ic_stat_rias", "drawable", getPackageName());
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        PendingIntent off = PendingIntent.getService(this, 7901, new Intent(this, WakeService.class).setAction(ACTION_OFF),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(this, 7902, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return b.setSmallIcon(small != 0 ? small : android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Listening for “Hey " + wakeName(this) + "”")
                .setContentText(text)
                .setColor(Scheduler.plain(this) ? 0xFF2563EB : 0xFFC8173A)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setContentIntent(open)
                .addAction(0, "Turn off", off)
                .build();
    }

    private String shown = "";

    private void updateNote(String text) {
        stateText = text;
        if (text.equals(shown)) return; // re-posting the same notification can make some phones chime
        shown = text;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTE_ID, note(text));
    }

    private boolean charging() {
        Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int plugged = b == null ? 0 : b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        return plugged != 0;
    }

    // ---------- listening for "Hey …" (on the phone, silent) ----------

    private void listen() {
        if (!running || paused || turn) return;
        main.removeCallbacks(listenRun);
        if ("charging".equals(mode(this)) && !charging()) {
            stopMic();
            updateNote("Waiting for the charger (hands-free works while charging)");
            return; // chargeCheck looks again every minute
        }
        if (!WakeModel.ready(this)) {
            String st = WakeModel.status(this);
            if (st.startsWith("error")) {
                updateNote("Couldn't download the speech model. Trying again soon (needs internet once).");
                main.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        WakeModel.state = "";
                        listen();
                    }
                }, 120000);
                return;
            }
            updateNote("Getting ready: downloading the speech model (one time, about 40 MB)…");
            WakeModel.ensure(this, new Runnable() {
                @Override
                public void run() {
                    main.post(listenRun);
                }
            });
            main.postDelayed(listenRun, 5000);
            return;
        }
        if (model == null) {
            if (loading) return;
            loading = true;
            updateNote("Getting ready…");
            final String path = WakeModel.dir(this).getAbsolutePath();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    Model m = null;
                    String err = null;
                    try {
                        LibVosk.setLogLevel(LogLevel.WARNINGS);
                        m = new Model(path);
                    } catch (Throwable t) {
                        err = t.toString();
                    }
                    final Model got = m;
                    final String why = err;
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            loading = false;
                            if (got == null) {
                                updateNote("Hands-free listening couldn't start on this phone.");
                                android.util.Log.w("RiasWake", "model: " + why);
                                return;
                            }
                            model = got;
                            listen();
                        }
                    });
                }
            }, "wake-load").start();
            return;
        }
        if (mic != null) {
            mic.setPause(false);
            updateNote(awaitingCommand ? "Listening…" : idleText());
            return;
        }
        try {
            recognizer = new Recognizer(model, 16000f);
            mic = new Mic(recognizer);
            mic.start();
            cued = false;
            updateNote(idleText());
        } catch (Throwable t) {
            stopMic();
            main.postDelayed(listenRun, 5000);
        }
    }

    private void stopMic() {
        if (mic != null) {
            mic.finish();
            mic = null;
        }
        if (recognizer != null) {
            try {
                recognizer.close();
            } catch (Throwable ignored) {
            }
            recognizer = null;
        }
    }

    private void resetRecognizer() {
        if (recognizer == null) return;
        synchronized (recognizer) {
            recognizer.reset();
        }
    }

    private static String field(String json, String key) {
        try {
            return new JSONObject(json).optString(key, "").trim();
        } catch (Exception e) {
            return "";
        }
    }

    void onPartialResult(String json) {
        if (turn || awaitingCommand || cued) return;
        if (Wake.command(field(json, "partial"), wakeName(this)) != null) {
            cued = true;
            buzz(); // you know she heard you, before you've finished the sentence
        }
    }

    void onResult(String json) {
        if (turn) return;
        String text = field(json, "text");
        if (!text.isEmpty()) lastHeard = text;
        if (awaitingCommand) {
            if (text.isEmpty()) return;
            awaitingCommand = false;
            main.removeCallbacks(stopAwaiting);
            ask(text);
            return;
        }
        String cmd = Wake.command(text, wakeName(this));
        boolean wasCued = cued;
        cued = false;
        if (cmd == null) return;
        if (!wasCued) buzz();
        woke(cmd);
    }

    /** Heard "Hey …": open the pop-up (if chosen and allowed), or answer by voice. */
    private void woke(final String cmd) {
        String action = getSharedPreferences("rias", MODE_PRIVATE).getString("wakeAction", "voice");
        boolean canPop = Build.VERSION.SDK_INT < 23 || android.provider.Settings.canDrawOverlays(this);
        if ("popup".equals(action) && canPop) {
            stopMic();
            turn = true;
            AssistActivity.opened = false;
            try {
                startActivity(new Intent(this, AssistActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        .putExtra(AssistActivity.EXTRA_COMMAND, cmd).putExtra(AssistActivity.EXTRA_WAKE, true));
            } catch (Exception ignored) {
            }
            // If Android didn't let it open, answer by voice instead. (The pop-up resumes listening when it closes.)
            main.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (AssistActivity.opened) { turn = false; return; }
                    turn = false;
                    byVoice(cmd);
                }
            }, 2000);
            return;
        }
        byVoice(cmd);
    }

    private void byVoice(String cmd) {
        if (cmd.split("\\s+").length >= 2) ask(cmd);
        else greetThenListen();
    }

    /** Just "Hey …": she says hello out loud, then listens for your question. */
    private void greetThenListen() {
        turn = true;
        if (mic != null) mic.setPause(true);
        String[] lines = Scheduler.plain(this) ? HELLO_PLAIN : HELLO_RIAS;
        String line = lines[hello++ % lines.length];
        updateNote(line);
        try {
            RiasVoice.say(this, line, true);
        } catch (Exception ignored) {
        }
        endTurn(true); // waits until she's done talking, then listens
    }

    void onMicError() {
        stopMic();
        main.postDelayed(listenRun, 3000);
    }

    /** Reads the microphone (quietly: no system sounds) and feeds the offline recognizer. */
    private class Mic extends Thread {
        private final Recognizer rec;
        private volatile boolean done, hold;
        private String lastPartial = "";

        Mic(Recognizer rec) {
            super("wake-mic");
            this.rec = rec;
        }

        void setPause(boolean p) {
            hold = p;
        }

        void finish() {
            done = true;
            interrupt();
            try {
                join(1500);
            } catch (InterruptedException ignored) {
            }
        }

        @Override
        public void run() {
            int min = android.media.AudioRecord.getMinBufferSize(16000, android.media.AudioFormat.CHANNEL_IN_MONO, android.media.AudioFormat.ENCODING_PCM_16BIT);
            int size = Math.max(min, 16000 / 5 * 2); // 0.2 s of audio
            android.media.AudioRecord rec2 = null;
            try {
                rec2 = new android.media.AudioRecord(android.media.MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000,
                        android.media.AudioFormat.CHANNEL_IN_MONO, android.media.AudioFormat.ENCODING_PCM_16BIT, size * 2);
                if (rec2.getState() != android.media.AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("mic busy");
                rec2.startRecording();
                byte[] buf = new byte[size];
                while (!done) {
                    int n = rec2.read(buf, 0, buf.length);
                    if (n <= 0 || hold) continue;
                    final String out;
                    final boolean fin;
                    synchronized (rec) {
                        fin = rec.acceptWaveForm(buf, n);
                        out = fin ? rec.getResult() : rec.getPartialResult();
                    }
                    if (!fin && out.equals(lastPartial)) continue;
                    lastPartial = fin ? "" : out;
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            if (mic != Mic.this) return;
                            if (fin) onResult(out); else onPartialResult(out);
                        }
                    });
                }
            } catch (final Throwable t) {
                if (!done) main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (mic == Mic.this) onMicError();
                    }
                });
            } finally {
                if (rec2 != null) {
                    try {
                        rec2.stop();
                    } catch (Throwable ignored) {
                    }
                    rec2.release();
                }
            }
        }
    }

    private void buzz() {
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(45, 120));
            else v.vibrate(45);
        } catch (Exception ignored) {
        }
    }

    // ---------- answering ----------

    /** Hands her what you said; she answers out loud with nothing on screen. */
    private void ask(String text) {
        turn = true;
        if (mic != null) mic.setPause(true); // don't listen to her own voice
        updateNote("Thinking…");
        try {
            RiasReplyService.say(this, text, true, false, true);
        } catch (Exception e) {
            endTurn(false);
            return;
        }
        main.removeCallbacks(turnTimeout);
        main.postDelayed(turnTimeout, 100000);
    }

    private void endTurn(final boolean question) {
        main.removeCallbacks(turnTimeout);
        if (google != null) closeGoogle(); // the phone's recognizer never answered
        final long since = System.currentTimeMillis();
        // Wait until she has finished speaking.
        main.post(new Runnable() {
            @Override
            public void run() {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                boolean talking = RiasVoice.speaking() || (am != null && am.isMusicActive());
                if (talking && System.currentTimeMillis() - since < 45000) {
                    main.postDelayed(this, 300);
                    return;
                }
                turn = false;
                if (question) listenForQuestion();
                else {
                    resetRecognizer();
                    listen();
                }
            }
        });
    }

    /** You said only "Hey …" (or she asked you something): listen once for the question, no wake word needed. */
    private void listenForQuestion() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            // No phone speech service: the offline model takes the question instead.
            awaitingCommand = true;
            main.removeCallbacks(stopAwaiting);
            main.postDelayed(stopAwaiting, 8000);
            resetRecognizer();
            listen();
            return;
        }
        stopMic(); // the phone's recognizer needs the microphone
        turn = true;
        main.removeCallbacks(turnTimeout);
        main.postDelayed(turnTimeout, 15000);
        updateNote("Listening…");
        mute();
        try {
            google = SpeechRecognizer.createSpeechRecognizer(this);
            google.setRecognitionListener(new android.speech.RecognitionListener() {
                @Override public void onResults(Bundle b) {
                    ArrayList<String> heard = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String text = heard == null || heard.isEmpty() ? "" : heard.get(0).trim();
                    closeGoogle();
                    main.removeCallbacks(turnTimeout);
                    if (text.isEmpty()) { turn = false; listen(); }
                    else ask(text);
                }
                @Override public void onError(int error) {
                    closeGoogle();
                    main.removeCallbacks(turnTimeout);
                    turn = false;
                    listen();
                }
                @Override public void onReadyForSpeech(Bundle p) { }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float r) { }
                @Override public void onBufferReceived(byte[] b) { }
                @Override public void onEndOfSpeech() { }
                @Override public void onPartialResults(Bundle p) { }
                @Override public void onEvent(int t, Bundle p) { }
            });
            google.startListening(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
                    .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName()));
        } catch (Exception e) {
            closeGoogle();
            turn = false;
            listen();
        }
    }

    private void closeGoogle() {
        if (google != null) {
            try {
                google.cancel();
                google.destroy();
            } catch (Exception ignored) {
            }
            google = null;
        }
        // Unmute a moment later, after the recognizer's closing sound would have played.
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                unmute();
            }
        }, 450);
    }

    /** The phone's recognizer beeps when it starts and stops; silence those sounds for the moment it listens. */
    private void mute() {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        for (int s : new int[] {AudioManager.STREAM_MUSIC, AudioManager.STREAM_SYSTEM, AudioManager.STREAM_NOTIFICATION}) {
            try {
                if (Build.VERSION.SDK_INT >= 23 && am.isStreamMute(s)) continue;
                am.adjustStreamVolume(s, AudioManager.ADJUST_MUTE, 0);
                muted.add(s);
            } catch (Exception ignored) {
                // Do Not Disturb can block changing some streams
            }
        }
    }

    private void unmute() {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am != null) for (int s : muted) {
            try {
                am.adjustStreamVolume(s, AudioManager.ADJUST_UNMUTE, 0);
            } catch (Exception ignored) {
            }
        }
        muted.clear();
    }

    @Override
    public void onDestroy() {
        running = false;
        instance = null;
        main.removeCallbacksAndMessages(null);
        stopMic();
        if (google != null) {
            try {
                google.destroy();
            } catch (Exception ignored) {
            }
            google = null;
        }
        unmute();
        if (model != null) {
            try {
                model.close();
            } catch (Throwable ignored) {
            }
            model = null;
        }
        super.onDestroy();
    }
}
