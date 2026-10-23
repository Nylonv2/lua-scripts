package com.nylonv2.riascompanion;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
public class MainActivity extends Activity {
    static volatile boolean visible;
    private static final int REQ_LISTEN = 42;
    private WebView web;
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
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
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
        web.addJavascriptInterface(new Bridge(this), "RiasNative");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
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
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
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

        /** {status, volume, maxVolume} so the app can say why she's silent. */
        @JavascriptInterface
        public String voiceStatus() {
            JSONObject o = new JSONObject();
            try {
                AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
                o.put("status", activity.ttsStatus);
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
