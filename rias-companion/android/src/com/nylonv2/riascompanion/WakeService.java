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
import android.media.ToneGenerator;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * "Hey Rias": listens for her name in the background (a foreground service, so Android shows
 * a small notification while it's on), then opens the assistant sheet, or answers out loud
 * when the sheet can't open. Modes: off, charging (only while plugged in), always.
 */
public class WakeService extends Service implements RecognitionListener {
    static final String CHANNEL = "rias_wake";
    static final int NOTE_ID = 7900;
    static final String ACTION_OFF = "com.nylonv2.riascompanion.WAKE_OFF";
    static volatile boolean running;
    private static volatile boolean paused;
    private static WakeService instance;

    // Speech recognizers hear "Rias" many ways.
    private static final Pattern WAKE = Pattern.compile(
            "(?:^|\\b)(?:hey|hi|hay|okay|ok|yo)\\s+(?:rias|reese|reece|rhea'?s|ria'?s|rios|reyes|rees|reez|rhys|rheas|rias's|ryas)\\b[\\s,.!?]*(.*)$"
                    + "|^(?:rias|ryas)\\b[\\s,.!?]*(.*)$");

    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer rec;
    private int errors;
    private boolean awaitingCommand; // heard her name but the sheet couldn't open: listening for the request
    private final Runnable listenRun = new Runnable() {
        @Override
        public void run() {
            listen();
        }
    };

    static String mode(Context c) {
        return c.getSharedPreferences("rias", Context.MODE_PRIVATE).getString("wakeMode", "off");
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
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) {
        }
    }

    /** The assistant sheet opened (stop listening so it can use the mic) / closed (start again). */
    static void pause() {
        paused = true;
        final WakeService w = instance;
        if (w != null) w.main.post(new Runnable() {
            @Override
            public void run() {
                w.stopRec();
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
        Notification n = note("Say “Hey Rias” anytime");
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(NOTE_ID, n);
        } catch (Exception e) {
            stopSelf(); // Android refused (started from the background): the app turns it on again when opened
            return START_NOT_STICKY;
        }
        instance = this;
        running = true;
        main.removeCallbacks(listenRun);
        main.post(listenRun);
        return START_NOT_STICKY;
    }

    private Notification note(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Hey Rias (listening)", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Shown while Rias listens for her name");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        int small = getResources().getIdentifier("ic_stat_rias", "drawable", getPackageName());
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        PendingIntent off = PendingIntent.getService(this, 7901, new Intent(this, WakeService.class).setAction(ACTION_OFF),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(this, 7902, new Intent(this, AssistActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return b.setSmallIcon(small != 0 ? small : android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Rias is listening for her name")
                .setContentText(text)
                .setColor(0xFFC8173A)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(open)
                .addAction(0, "Turn off", off)
                .build();
    }

    private boolean charging() {
        Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int plugged = b == null ? 0 : b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        return plugged != 0;
    }

    private void listen() {
        if (!running) return;
        if (paused) return;
        if ("charging".equals(mode(this)) && !charging()) {
            stopRec();
            updateNote("Waiting for the charger (Hey Rias works while charging)");
            main.postDelayed(listenRun, 30000);
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            updateNote("Speech recognition isn't available on this phone");
            return;
        }
        try {
            if (rec == null) {
                if (Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
                    rec = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
                } else {
                    rec = SpeechRecognizer.createSpeechRecognizer(this);
                }
                rec.setRecognitionListener(this);
            }
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                    .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                    .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                    .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
            rec.startListening(i);
            updateNote(awaitingCommand ? "Listening…" : "Say “Hey Rias” anytime");
        } catch (Exception e) {
            retry(2000, true);
        }
    }

    private String shown = "";

    private void updateNote(String text) {
        if (text.equals(shown)) return; // re-posting the same notification can make some phones chime
        shown = text;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTE_ID, note(text));
    }

    private void retry(long delay, boolean recreate) {
        if (recreate) stopRec();
        main.removeCallbacks(listenRun);
        main.postDelayed(listenRun, delay);
    }

    private void stopRec() {
        if (rec == null) return;
        try {
            rec.cancel();
            rec.destroy();
        } catch (Exception ignored) {
        }
        rec = null;
    }

    @Override
    public void onResults(Bundle results) {
        errors = 0;
        ArrayList<String> heard = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (awaitingCommand) {
            awaitingCommand = false;
            if (heard != null && !heard.isEmpty() && !heard.get(0).trim().isEmpty()) RiasReplyService.say(this, heard.get(0).trim(), true, false);
            retry(1500, false);
            return;
        }
        if (heard != null) {
            for (String h : heard) {
                Matcher m = WAKE.matcher(h.toLowerCase(Locale.US).trim());
                if (m.find()) {
                    String cmd = m.group(1) != null ? m.group(1) : m.group(2);
                    woke(cmd == null ? "" : cmd.trim());
                    return;
                }
            }
        }
        retry(150, false);
    }

    /** Heard her name: open the assistant sheet (with whatever you said after it). */
    private void woke(final String command) {
        stopRec();
        paused = true;
        AssistActivity.opened = false;
        try {
            startActivity(new Intent(this, AssistActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .putExtra(AssistActivity.EXTRA_COMMAND, command).putExtra(AssistActivity.EXTRA_WAKE, true));
        } catch (Exception ignored) {
        }
        // Android may refuse to open it from the background (allow "Appear on top" to fix that).
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (AssistActivity.opened) return;
                paused = false;
                if (!command.isEmpty()) {
                    RiasReplyService.say(WakeService.this, command, true, false);
                    retry(1500, false);
                } else {
                    try {
                        new ToneGenerator(AudioManager.STREAM_MUSIC, 70).startTone(ToneGenerator.TONE_PROP_BEEP2, 180);
                    } catch (Exception ignored) {
                    }
                    awaitingCommand = true;
                    retry(300, false);
                }
            }
        }, 1800);
    }

    @Override
    public void onError(int error) {
        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
            updateNote("Rias needs microphone permission. Open the app to allow it.");
            running = false;
            stopSelf();
            return;
        }
        if (awaitingCommand && (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) awaitingCommand = false;
        switch (error) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                errors = 0;
                retry(100, false);
                break;
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                retry(1000, true);
                break;
            default:
                // Network, server, client errors: back off a little more each time.
                errors++;
                retry(Math.min(60000, 1000L * errors * errors), true);
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        instance = null;
        main.removeCallbacksAndMessages(null);
        stopRec();
        super.onDestroy();
    }

    @Override public void onReadyForSpeech(Bundle params) { }
    @Override public void onBeginningOfSpeech() { }
    @Override public void onRmsChanged(float rmsdB) { }
    @Override public void onBufferReceived(byte[] buffer) { }
    @Override public void onEndOfSpeech() { }
    @Override public void onPartialResults(Bundle partialResults) { }
    @Override public void onEvent(int eventType, Bundle params) { }
}
