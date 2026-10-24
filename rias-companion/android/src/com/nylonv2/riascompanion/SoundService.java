package com.nylonv2.riascompanion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.text.DateFormat;
import java.util.Date;

/** Sleep / ambient sounds (rain, ocean, brown noise, fireplace, fan) with an off timer. */
public class SoundService extends Service {
    static final String ACTION_STOP = "com.nylonv2.riascompanion.SOUND_STOP";
    static final String CHANNEL = "rias_sounds";
    static final int NOTE_ID = 7800;
    static final String[][] SOUNDS = {{"rain", "Rain"}, {"ocean", "Ocean waves"}, {"brown", "Brown noise"}, {"fire", "Fireplace"}, {"fan", "Fan"}};
    static String playing = "";

    private MediaPlayer player;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable fadeOut = new Runnable() {
        float vol = 1f;

        @Override
        public void run() {
            vol -= 0.05f;
            if (player == null || vol <= 0) {
                stopSelf();
                return;
            }
            try {
                player.setVolume(vol, vol);
            } catch (Exception ignored) {
            }
            main.postDelayed(this, 1500);
        }
    };

    static String label(String key) {
        for (String[] s : SOUNDS) if (s[0].equals(key)) return s[1];
        return key;
    }

    static void play(Context c, String key, int minutes) {
        Intent i = new Intent(c, SoundService.class).putExtra("key", key).putExtra("minutes", minutes);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception e) {
            // Not allowed to start from the background right now (e.g. a notification reply).
        }
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, SoundService.class));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @SuppressWarnings("deprecation")
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String key = intent.getStringExtra("key");
        int minutes = intent.getIntExtra("minutes", 45);
        int res = getResources().getIdentifier("ambient_" + key, "raw", getPackageName());
        if (res == 0) {
            key = "rain";
            res = getResources().getIdentifier("ambient_rain", "raw", getPackageName());
        }
        long until = System.currentTimeMillis() + minutes * 60000L;
        Notification n = note(key, minutes > 0 ? until : 0);
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTE_ID, n);
        release();
        main.removeCallbacks(fadeOut);
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            player.setDataSource(this, Uri.parse("android.resource://" + getPackageName() + "/" + res));
            player.setLooping(true);
            player.prepare();
            player.start();
            playing = key;
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // Fade out gently over the last half minute.
        if (minutes > 0) main.postDelayed(fadeOut, Math.max(0, minutes * 60000L - 30000));
        return START_NOT_STICKY;
    }

    private Notification note(String key, long until) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Sleep sounds", NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
        }
        int small = getResources().getIdentifier("ic_stat_rias", "drawable", getPackageName());
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        PendingIntent stop = PendingIntent.getService(this, 7801, new Intent(this, SoundService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return b.setSmallIcon(small != 0 ? small : android.R.drawable.ic_media_play)
                .setContentTitle("🌙 " + label(key))
                .setContentText(until > 0 ? "Stops at " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(until)) : "Playing until you stop it")
                .setColor(0xFFC8173A)
                .setOngoing(true)
                .addAction(0, "Stop", stop)
                .build();
    }

    private void release() {
        if (player == null) return;
        try {
            player.stop();
            player.release();
        } catch (Exception ignored) {
        }
        player = null;
    }

    @Override
    public void onDestroy() {
        main.removeCallbacks(fadeOut);
        release();
        playing = "";
        super.onDestroy();
    }
}
