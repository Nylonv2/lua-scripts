package com.nylonv2.riascompanion;

import android.app.Activity;
import android.content.Context;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.CalendarContract;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Hosts the web app (assets/www) full screen and exposes a small bridge as window.RiasNative. */
@SuppressWarnings("deprecation")
public class MainActivity extends Activity {
    static volatile boolean visible;
    private static final int REQ_LISTEN = 42;
    private static final int REQ_LISTEN_TR = 46; // the live translator: listen in a given language
    private String trSide = "";
    private static final int REQ_CALENDAR = 2;
    private static final int REQ_FILE = 43;
    private static final int REQ_SAVE = 44;
    private static final int REQ_SOUND = 45;
    /** The alarm sound playing inside the app, if any. */
    private static android.media.Ringtone ringing;
    /** Backup text waiting for the user to pick where to save it. */
    private String pendingSave;
    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private WebView web;
    private boolean pageReady;
    private String pendingShare; // JSON handed to the page once it has loaded
    private TextToSpeech tts;
    private volatile boolean ttsReady;
    /** starting | ready | failed | no-language | error — shown in Settings when she's silent. */
    private volatile String ttsStatus = "starting";
    /** Engines still to try, in order; null means "the phone's default". */
    private final ArrayList<String> enginesToTry = new ArrayList<>();
    private final StringBuilder ttsLog = new StringBuilder();
    private String currentEngine;
    private String pendingSpeech;
    // Voice settings from the web app; applied once the speech engine is ready.
    private String voiceName = "";
    private float pitch = 0.95f, rate = 0.9f;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Scheduler.ensureChannel(this);
        getWindow().setStatusBarColor(0xFF16090E);
        getWindow().setNavigationBarColor(0xFF16090E);

        web = new WebView(this);
        web.setBackgroundColor(0xFF16090E);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        // The app's own bundled pages only: lets them call api.anthropic.com without CORS trouble.
        s.setAllowUniversalAccessFromFileURLs(true);
        // Lets <input type="file"> open the photo picker (used for Rias's picture).
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                boolean backup = false;
                for (String t : params.getAcceptTypes()) if (t != null && t.contains("json")) backup = true;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE);
                if (backup) {
                    pick.setType("*/*").putExtra(Intent.EXTRA_MIME_TYPES,
                            new String[] {"application/json", "text/plain", "application/octet-stream"});
                } else {
                    pick.setType("image/*");
                }
                try {
                    startActivityForResult(Intent.createChooser(pick, backup ? "Choose your Rias backup" : "Choose Rias's picture"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverShare();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        startTts();
        // Android 13+ asks before an app may post notifications.
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {"android.permission.POST_NOTIFICATIONS"}, 1);
        }
        web.addJavascriptInterface(new Bridge(this), "RiasNative");
        web.addJavascriptInterface(new RiasDevice(this, this), "RiasDevice");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
        handleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShare(intent);
    }

    /** Something shared to Rias: text (a reminder) or an image (a schedule or a meal). */
    private void handleShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        try {
            JSONObject o = new JSONObject();
            String type = intent.getType() == null ? "" : intent.getType();
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (subject != null && text != null && !text.contains(subject)) text = subject + "\n" + text;
            else if (text == null) text = subject;
            if (type.startsWith("image/")) {
                Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                String data = uri == null ? null : imageBase64(uri);
                if (data == null) return;
                o.put("type", "image");
                o.put("data", data);
                if (text != null) o.put("text", text);
            } else {
                if (text == null) return;
                o.put("type", "text");
                o.put("text", text);
            }
            pendingShare = o.toString();
            deliverShare();
        } catch (Exception ignored) {
        }
    }

    private void deliverShare() {
        if (!pageReady || pendingShare == null) return;
        String js = "window.riasShared && window.riasShared(" + pendingShare + ")";
        pendingShare = null;
        web.evaluateJavascript(js, null);
    }

    /** Reads a shared image, shrinks it so the longest side is at most 1800px, returns base64 JPEG. */
    private String imageBase64(Uri uri) {
        try {
            android.graphics.BitmapFactory.Options bounds = new android.graphics.BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
                android.graphics.BitmapFactory.decodeStream(in, null, bounds);
            }
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / sample > 3600) sample *= 2;
            android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
            opts.inSampleSize = sample;
            android.graphics.Bitmap bm;
            try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
                bm = android.graphics.BitmapFactory.decodeStream(in, null, opts);
            }
            if (bm == null) return null;
            float k = Math.min(1f, 1800f / Math.max(bm.getWidth(), bm.getHeight()));
            if (k < 1f) bm = android.graphics.Bitmap.createScaledBitmap(bm, Math.round(bm.getWidth() * k), Math.round(bm.getHeight() * k), true);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            bm.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out);
            return android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    // Back goes to Home (or closes a pop-up) instead of leaving; on Home it sends the app to the background.
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("window.riasBack ? window.riasBack() : false", new android.webkit.ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        web.onResume();
    }

    @Override
    protected void onPause() {
        visible = false;
        if (ttsReady) tts.stop();
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        visible = false;
        if (tts != null) tts.shutdown();
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == 60) { // assistant permissions (mic, contacts, calls)
            web.evaluateJavascript("window.riasPermission && window.riasPermission('device', true)", null);
            return;
        }
        if (requestCode != REQ_CALENDAR) return;
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        web.evaluateJavascript("window.riasPermission && window.riasPermission('calendar', " + granted + ")", null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
            return;
        }
        if (requestCode == REQ_SOUND) {
            if (resultCode != RESULT_OK || data == null) return;
            Uri picked = data.getParcelableExtra(android.media.RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            if (picked == null) return;
            String title = "Your sound";
            try {
                android.media.Ringtone r = android.media.RingtoneManager.getRingtone(this, picked);
                if (r != null) title = r.getTitle(this);
            } catch (Exception ignored) {
            }
            web.evaluateJavascript("window.riasSoundPicked && window.riasSoundPicked(" + JSONObject.quote(picked.toString())
                    + ", " + JSONObject.quote(title) + ")", null);
            return;
        }
        if (requestCode == REQ_SAVE) {
            boolean ok = false;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try (java.io.OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    out.write(pendingSave.getBytes("UTF-8"));
                    ok = true;
                } catch (Exception ignored) {
                }
            }
            pendingSave = null;
            web.evaluateJavascript("window.riasSaved && window.riasSaved(" + ok + ")", null);
            return;
        }
        if (requestCode == REQ_LISTEN_TR) {
            ArrayList<String> got = resultCode == RESULT_OK && data != null ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
            String text = got == null || got.isEmpty() ? "" : got.get(0);
            web.evaluateJavascript("window.riasTrHeard && window.riasTrHeard(" + JSONObject.quote(trSide) + ", " + JSONObject.quote(text) + ")", null);
            return;
        }
        if (requestCode != REQ_LISTEN || resultCode != RESULT_OK || data == null) return;
        ArrayList<String> heard = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (heard == null || heard.isEmpty()) return;
        web.evaluateJavascript("window.riasHeard && window.riasHeard(" + JSONObject.quote(heard.get(0)) + ")", null);
    }

    // Anonymous classes rather than lambdas: dx can't convert lambdas.
    /** Speech engines installed on the phone, Google's first. */
    private List<String> installedEngines() {
        ArrayList<String> out = new ArrayList<>();
        try {
            for (ResolveInfo ri : getPackageManager().queryIntentServices(
                    new Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE), 0)) {
                if (ri.serviceInfo != null) out.add(ri.serviceInfo.packageName);
            }
        } catch (Exception ignored) {
        }
        if (out.remove("com.google.android.tts")) out.add(0, "com.google.android.tts");
        return out;
    }

    private void startTts() {
        ttsStatus = "starting";
        List<String> engines = installedEngines();
        ttsLog.append("engines=").append(engines.isEmpty() ? "none" : engines.toString());
        enginesToTry.clear();
        enginesToTry.add(null);
        enginesToTry.addAll(engines);
        tryNextEngine();
    }

    // Some phones refuse "the default engine" but connect fine when asked for one by name,
    // so try the default, then every installed engine, before giving up.
    private void tryNextEngine() {
        if (tts != null) {
            try {
                tts.shutdown();
            } catch (Exception ignored) {
            }
            tts = null;
        }
        if (enginesToTry.isEmpty()) {
            ttsStatus = "failed";
            return;
        }
        currentEngine = enginesToTry.remove(0);
        TextToSpeech.OnInitListener listener = new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(final int status) {
                // Posted, never run inline: some engines call this from inside the constructor.
                new Handler(Looper.getMainLooper()).post(new Runnable() {
                    @Override
                    public void run() {
                        onTtsInit(status);
                    }
                });
            }
        };
        try {
            tts = currentEngine == null
                    ? new TextToSpeech(getApplicationContext(), listener)
                    : new TextToSpeech(getApplicationContext(), listener, currentEngine);
        } catch (Exception e) {
            ttsLog.append("; ").append(currentEngine).append("=crash");
            new Handler(Looper.getMainLooper()).post(new Runnable() {
                @Override
                public void run() {
                    tryNextEngine();
                }
            });
        }
    }

    private void onTtsInit(int status) {
        ttsLog.append("; ").append(currentEngine == null ? "default" : currentEngine)
                .append(status == TextToSpeech.SUCCESS ? "=ok" : "=err" + status);
        if (status != TextToSpeech.SUCCESS || tts == null) {
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    tryNextEngine();
                }
            }, 400);
            return;
        }
        tts.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());
        int lang = tts.setLanguage(Locale.getDefault());
        if (lang < 0) lang = tts.setLanguage(Locale.US);
        ttsStatus = lang < 0 ? "no-language" : "ready";
        ttsReady = true;
        applyVoice();
        if (pendingSpeech != null) {
            speakNow(pendingSpeech);
            pendingSpeech = null;
        }
    }

    private int utterance;

    private void speakNow(String text) {
        if (KokoroVoice.say(this, text, AudioAttributes.USAGE_MEDIA, false)) return; // Kokoro chosen in Settings → Her voice
        if (!ttsReady) {
            pendingSpeech = text; // spoken as soon as the engine is up
            return;
        }
        int r = tts.speak(text, TextToSpeech.QUEUE_ADD, null, "rias" + (utterance++));
        if (r == TextToSpeech.ERROR) {
            // The chosen voice may be missing; fall back to the phone's default once.
            tts.setLanguage(Locale.getDefault());
            r = tts.speak(text, TextToSpeech.QUEUE_ADD, null, "rias" + (utterance++));
            if (r == TextToSpeech.ERROR) ttsStatus = "error";
        }
    }

    private synchronized void applyVoice() {
        if (!ttsReady) return;
        tts.setPitch(pitch);
        tts.setSpeechRate(rate);
        if (voiceName.isEmpty()) return;
        try {
            for (Voice v : tts.getVoices()) {
                if (v.getName().equals(voiceName)) {
                    tts.setVoice(v);
                    return;
                }
            }
        } catch (Exception ignored) {
        }
    }

    private Intent listenIntent() {
        return new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PROMPT, "Talk to Rias");
    }

    static final class Bridge {
        private final MainActivity activity;
        private final Context ctx;
        Bridge(MainActivity activity) {
            this.activity = activity;
            this.ctx = activity.getApplicationContext();
        }

        @JavascriptInterface
        public void speak(final String text) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    activity.speakNow(text);
                }
            });
        }

        /** Rias's page in Android settings (permissions, battery, notifications). */
        @JavascriptInterface
        public void openAppSettings() {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                ctx.startActivity(i);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public boolean hasCalendarPermission() {
            return ctx.checkSelfPermission(android.Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public void requestCalendarPermission() {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    activity.requestPermissions(new String[] {android.Manifest.permission.READ_CALENDAR}, REQ_CALENDAR);
                }
            });
        }

        /** Events (with repeats expanded) between two times: {permission, events: [{id, title, begin, end, allDay, cal}]}. */
        @JavascriptInterface
        public String calendarEvents(double fromMs, double toMs) {
            JSONObject out = new JSONObject();
            JSONArray events = new JSONArray();
            try {
                if (!hasCalendarPermission()) {
                    out.put("permission", false);
                    return out.toString();
                }
                out.put("permission", true);
                Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
                ContentUris.appendId(b, (long) fromMs);
                ContentUris.appendId(b, (long) toMs);
                String[] cols = {
                        CalendarContract.Instances.EVENT_ID,
                        CalendarContract.Instances.TITLE,
                        CalendarContract.Instances.BEGIN,
                        CalendarContract.Instances.END,
                        CalendarContract.Instances.ALL_DAY,
                        CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
                };
                Cursor c = ctx.getContentResolver().query(b.build(), cols,
                        CalendarContract.Instances.VISIBLE + "=1", null,
                        CalendarContract.Instances.BEGIN + " ASC");
                if (c != null) {
                    try {
                        while (c.moveToNext() && events.length() < 300) {
                            JSONObject e = new JSONObject();
                            e.put("id", c.getLong(0));
                            e.put("title", c.getString(1) == null ? "" : c.getString(1));
                            e.put("begin", c.getLong(2));
                            e.put("end", c.getLong(3));
                            e.put("allDay", c.getInt(4) == 1);
                            e.put("cal", c.getString(5) == null ? "" : c.getString(5));
                            events.put(e);
                        }
                    } finally {
                        c.close();
                    }
                }
                out.put("events", events);
            } catch (Exception e) {
                try {
                    out.put("error", String.valueOf(e.getMessage()));
                } catch (Exception ignored) {
                }
            }
            return out.toString();
        }

        /** Settings → "Test on lock screen": an alarm pop-up 10 seconds from now. */
        @JavascriptInterface
        public void testAlarm(String text) {
            Scheduler.addEvent(ctx, System.currentTimeMillis() + 10000, text, "", "Test pop-up");
        }

        @JavascriptInterface
        public String takeActions() {
            return Scheduler.takeActions(ctx);
        }

        @JavascriptInterface
        public boolean canFullScreen() {
            return Scheduler.canFullScreen(ctx);
        }

        /** Settings → Backup: asks where to save the file, then writes it (result → window.riasSaved). */
        @JavascriptInterface
        public void saveFile(final String name, final String content) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    activity.pendingSave = content;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                            .setType("application/json").putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        activity.startActivityForResult(i, REQ_SAVE);
                    } catch (Exception e) {
                        activity.pendingSave = null;
                        activity.web.evaluateJavascript("window.riasSaved && window.riasSaved(false)", null);
                    }
                }
            });
        }

        /** Weekly automatic backup: Downloads/RiasCompanion/rias-backup.json (Android 10+). */
        @JavascriptInterface
        public boolean autoBackup(String content) {
            if (Build.VERSION.SDK_INT < 29) return false;
            try {
                android.content.ContentResolver cr = ctx.getContentResolver();
                Uri coll = android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                String dir = android.os.Environment.DIRECTORY_DOWNLOADS + "/RiasCompanion/";
                Uri target = null;
                try (Cursor c = cr.query(coll, new String[] {android.provider.MediaStore.MediaColumns._ID},
                        android.provider.MediaStore.MediaColumns.DISPLAY_NAME + "=? AND "
                                + android.provider.MediaStore.MediaColumns.RELATIVE_PATH + "=?",
                        new String[] {"rias-backup.json", dir}, null)) {
                    if (c != null && c.moveToFirst()) target = ContentUris.withAppendedId(coll, c.getLong(0));
                }
                if (target == null) {
                    android.content.ContentValues v = new android.content.ContentValues();
                    v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, "rias-backup.json");
                    v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/json");
                    v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, dir);
                    target = cr.insert(coll, v);
                }
                if (target == null) return false;
                try (java.io.OutputStream out = cr.openOutputStream(target, "wt")) {
                    out.write(content.getBytes("UTF-8"));
                }
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        // ---------- alarm sounds ----------
        /** Settings → Alarm sound: {key, uri, title, ring}. */
        @JavascriptInterface
        public void setAlarmSound(String json) {
            Scheduler.saveSound(ctx, json);
        }

        /** Plays an alarm sound in the app (the pop-up, or a preview in Settings). */
        @JavascriptInterface
        public void alarmStart(String key, boolean loop, boolean vibrate) {
            alarmStop();
            try {
                if (vibrate) {
                    android.os.Vibrator v = (android.os.Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
                    if (v != null) v.vibrate(new long[] {0, 400, 250, 400}, -1);
                }
                Uri u = Scheduler.soundUri(ctx, key);
                if (u == null) return;
                android.media.Ringtone r = android.media.RingtoneManager.getRingtone(ctx, u);
                if (r == null) return;
                r.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                if (Build.VERSION.SDK_INT >= 28) r.setLooping(loop && !"voice".equals(key));
                r.play();
                ringing = r;
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void alarmStop() {
            try {
                if (ringing != null) ringing.stop();
            } catch (Exception ignored) {
            }
            ringing = null;
        }

        /** "From my phone…": Android's sound picker (alarms, ringtones, notification sounds). */
        @JavascriptInterface
        public void pickSound(final String current) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(android.media.RingtoneManager.ACTION_RINGTONE_PICKER)
                            .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_TYPE, android.media.RingtoneManager.TYPE_ALL)
                            .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_TITLE, "Rias's alarm sound")
                            .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
                            .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
                            .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI,
                                    android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM));
                    if (current != null && !current.isEmpty()) {
                        i.putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(current));
                    }
                    try {
                        activity.startActivityForResult(i, REQ_SOUND);
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        /** Settings → Theme, so the alarm screen matches the app. */
        @JavascriptInterface
        public void setTheme(String theme) {
            ctx.getSharedPreferences("rias", Context.MODE_PRIVATE).edit().putString("theme", theme).apply();
        }

        /** Look settings the assistant sheet uses: homeChar (animated / picture), outfit. */
        @JavascriptInterface
        public void setPref(String key, String value) {
            if (!"homeChar".equals(key) && !"outfit".equals(key) && !"assistChar".equals(key) && !"assistStyle".equals(key)
                    && !"plain".equals(key) && !"displayName".equals(key)) return;
            ctx.getSharedPreferences("rias", Context.MODE_PRIVATE).edit().putString(key, value == null ? "" : value).apply();
        }

        /** Settings → Alarm card picture: "animated", "mine" or "photo". */
        @JavascriptInterface
        public void setAlarmArt(String art) {
            ctx.getSharedPreferences("rias", Context.MODE_PRIVATE).edit().putString("alarmArt", art).apply();
        }

        /** The photo for the alarm card (base64 JPEG). */
        @JavascriptInterface
        public void setAlarmPicture(String base64) {
            java.io.File f = Scheduler.alarmPictureFile(ctx);
            if (base64 == null || base64.isEmpty()) {
                f.delete();
                return;
            }
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) {
                out.write(android.util.Base64.decode(base64, android.util.Base64.DEFAULT));
            } catch (Exception ignored) {
            }
        }

        /** The card photo's subject cut out (base64 WebP) and which picture it belongs to ("photo"/"mine"); "" clears it. */
        @JavascriptInterface
        public void setAlarmCutout(String base64, String forArt) {
            java.io.File f = new java.io.File(ctx.getFilesDir(), "alarm-cutout.webp");
            ctx.getSharedPreferences("rias", Context.MODE_PRIVATE).edit().putString("alarmCutFor", base64 == null || base64.isEmpty() ? "" : forArt).apply();
            if (base64 == null || base64.isEmpty()) {
                f.delete();
                return;
            }
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) {
                out.write(android.util.Base64.decode(base64, android.util.Base64.DEFAULT));
            } catch (Exception ignored) {
            }
        }

        /** Home screen widget data: upcoming items and her lines. */
        @JavascriptInterface
        public void setWidget(String json) {
            RiasWidget.save(ctx, json);
        }

        /** Her latest line in the app, for the chat widget. */
        @JavascriptInterface
        public void setChatLast(String text) {
            ChatLog.setLast(ctx, text);
            RiasChatWidget.update(ctx);
        }

        /** The installed app's version, for the update check. */
        @JavascriptInterface
        public String appVersion() {
            try {
                android.content.pm.PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
                JSONObject o = new JSONObject();
                o.put("code", pi.versionCode);
                o.put("name", pi.versionName);
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        /** Opens a link (the update download) in the browser. */
        @JavascriptInterface
        public void openUrl(String url) {
            if (url == null || !url.startsWith("https://")) return;
            try {
                ctx.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public String alarmCheck() {
            return Scheduler.alarmCheck(ctx);
        }

        /** Opens the settings page that fixes one item of the pop-up check. */
        @JavascriptInterface
        public void openAlarmFix(String what) {
            String pkg = ctx.getPackageName();
            Intent i;
            if ("overlay".equals(what) && Build.VERSION.SDK_INT >= 23) {
                i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + pkg));
            } else if ("battery".equals(what) && Build.VERSION.SDK_INT >= 23) {
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
            } else if ("channel".equals(what) && Build.VERSION.SDK_INT >= 26) {
                i = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                        .putExtra(Settings.EXTRA_CHANNEL_ID, Scheduler.currentAlarmChannel(ctx));
            } else if ("exact".equals(what) && Build.VERSION.SDK_INT >= 31) {
                i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg));
            } else if ("fullScreen".equals(what)) {
                openFullScreenSettings();
                return;
            } else if ("notifications".equals(what)) {
                openSettings();
                return;
            } else {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                ctx.startActivity(i);
            } catch (Exception e) {
                Intent d = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    ctx.startActivity(d);
                } catch (Exception ignored) {
                }
            }
        }

        /** Android 14+: the switch that lets reminders pop up over the lock screen. */
        @JavascriptInterface
        public void openFullScreenSettings() {
            Intent i = Build.VERSION.SDK_INT >= 34
                    ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + ctx.getPackageName()))
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                ctx.startActivity(i);
            } catch (Exception ignored) {
            }
        }

        /** A short buzz + chime for the in-app reminder pop-up. */
        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void buzz() {
            try {
                android.os.Vibrator v = (android.os.Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) v.vibrate(new long[] {0, 300, 200, 300}, -1);
                android.media.Ringtone r = android.media.RingtoneManager.getRingtone(ctx,
                        android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION));
                if (r != null) r.play();
            } catch (Exception ignored) {
            }
        }

        /** Saves Rias's picture (base64 JPEG, or "" for the default) for notifications. */
        @JavascriptInterface
        public void setPicture(String base64) {
            java.io.File f = Scheduler.pictureFile(ctx);
            if (base64 == null || base64.isEmpty()) {
                f.delete();
                return;
            }
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) {
                out.write(android.util.Base64.decode(base64, android.util.Base64.DEFAULT));
            } catch (Exception ignored) {
            }
        }

        /** Discreet mode: show "Assistant" with a plain icon on the home screen instead of Rias (or back). */
        @JavascriptInterface
        public void setLauncher(boolean plainIcon) {
            PackageManager pm = ctx.getPackageManager();
            String pkg = ctx.getPackageName();
            try {
                pm.setComponentEnabledSetting(new android.content.ComponentName(pkg, pkg + ".LauncherPlain"),
                        plainIcon ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
                pm.setComponentEnabledSetting(new android.content.ComponentName(pkg, pkg + ".LauncherRias"),
                        plainIcon ? PackageManager.COMPONENT_ENABLED_STATE_DISABLED : PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            } catch (Exception ignored) {
            }
        }

        /** Settings → Look & pictures → a picture just for the pop-up. */
        @JavascriptInterface
        public void setAssistPicture(String base64) {
            java.io.File f = AssistActivity.pictureFile(ctx);
            if (base64 == null || base64.isEmpty()) {
                f.delete();
                return;
            }
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) {
                out.write(android.util.Base64.decode(base64, android.util.Base64.DEFAULT));
            } catch (Exception ignored) {
            }
        }

        /** {status, volume, maxVolume} so the app can say why she's silent. */
        @JavascriptInterface
        public String voiceStatus() {
            JSONObject o = new JSONObject();
            try {
                AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
                o.put("status", activity.ttsStatus);
                String engine = activity.currentEngine;
                if (engine == null && activity.tts != null) {
                    try {
                        engine = activity.tts.getDefaultEngine();
                    } catch (Exception ignored) {
                    }
                }
                o.put("engine", engine == null ? "" : engine);
                o.put("detail", activity.ttsLog.toString());
                o.put("android", Build.VERSION.SDK_INT);
                o.put("device", Build.MANUFACTURER + " " + Build.MODEL);
                o.put("volume", am == null ? -1 : am.getStreamVolume(AudioManager.STREAM_MUSIC));
                o.put("maxVolume", am == null ? -1 : am.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
            } catch (Exception ignored) {
            }
            return o.toString();
        }

        /** Opens the phone's text-to-speech settings (or the Play Store page for Google's engine). */
        @JavascriptInterface
        public void openTtsSettings() {
            Intent[] tries = {
                    new Intent("com.android.settings.TTS_SETTINGS"),
                    new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA),
                    new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.tts")),
                    new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.tts")),
            };
            for (Intent i : tries) {
                try {
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(i);
                    return;
                } catch (Exception ignored) {
                }
            }
        }

        @JavascriptInterface
        public void configure(String name, double pitch, double rate) {
            synchronized (activity) {
                activity.voiceName = name == null ? "" : name;
                activity.pitch = (float) pitch;
                activity.rate = (float) rate;
            }
            // Remembered for the alarm screen, which talks with the app closed.
            ctx.getSharedPreferences("rias", Context.MODE_PRIVATE).edit()
                    .putString("voiceName", activity.voiceName).putFloat("voicePitch", (float) pitch).putFloat("voiceRate", (float) rate).apply();
            activity.applyVoice();
        }

        /** Installed voices as JSON: [{name, lang, label}]. */
        @JavascriptInterface
        public String voices() {
            JSONArray out = new JSONArray();
            if (!activity.ttsReady) return out.toString();
            try {
                int n = 0;
                for (Voice v : activity.tts.getVoices()) {
                    if (v.getFeatures() != null && v.getFeatures().contains("notInstalled")) continue;
                    String lang = v.getLocale().toLanguageTag();
                    String where = v.isNetworkConnectionRequired() ? "online" : "offline";
                    JSONObject o = new JSONObject();
                    o.put("name", v.getName());
                    o.put("lang", lang);
                    o.put("label", v.getLocale().getDisplayName() + " · " + v.getName() + " (" + where + ")");
                    out.put(o);
                    if (++n >= 150) break;
                }
            } catch (Exception ignored) {
            }
            return out.toString();
        }

        @JavascriptInterface
        public void stopSpeaking() {
            KokoroVoice.stop();
            if (activity.ttsReady) activity.tts.stop();
        }

        @JavascriptInterface
        public boolean canListen() {
            return !ctx.getPackageManager().queryIntentActivities(activity.listenIntent(), 0).isEmpty();
        }

        @JavascriptInterface
        public void listen() {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        activity.startActivityForResult(activity.listenIntent(), REQ_LISTEN);
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        /** Live translator: listen in `lang` (BCP-47) for one side of the conversation. */
        @JavascriptInterface
        public void listenIn(final String lang, final String side, final String prompt) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    activity.trSide = side;
                    TranslateVoice.stop();
                    try {
                        activity.startActivityForResult(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang)
                                .putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, true)
                                .putExtra(RecognizerIntent.EXTRA_PROMPT, prompt), REQ_LISTEN_TR);
                    } catch (Exception e) {
                        activity.web.evaluateJavascript("window.riasTrHeard && window.riasTrHeard(" + JSONObject.quote(side) + ", '', 'unavailable')", null);
                    }
                }
            });
        }

        @JavascriptInterface
        public void schedule(String json) {
            Scheduler.save(ctx, json);
        }

        @JavascriptInterface
        public void test(String text) {
            Scheduler.show(ctx, text, 1, true);
        }

        @JavascriptInterface
        public boolean notificationsEnabled() {
            return Scheduler.enabled(ctx);
        }

        @JavascriptInterface
        public void openSettings() {
            Intent i;
            if (Build.VERSION.SDK_INT >= 26) {
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
            } else {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + ctx.getPackageName()));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                ctx.startActivity(i);
            } catch (Exception ignored) {
            }
        }
    }
}
