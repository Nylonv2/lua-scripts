package com.nylonv2.riascompanion;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.util.ArrayList;

/** Hosts the web app (assets/www) full screen and exposes a small bridge as window.RiasNative. */
public class MainActivity extends Activity {
    static volatile boolean visible;
    private static final int REQ_LISTEN = 42;
    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady;

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
        // Anonymous classes rather than lambdas: dx can't convert lambdas.
        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status != TextToSpeech.SUCCESS) return;
                tts.setPitch(1.05f);
                tts.setSpeechRate(0.95f);
                ttsReady = true;
            }
        });
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
        if (tts != null) tts.stop();
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

    private Intent listenIntent() {
        return new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PROMPT, "Talk to Rias");
    }

    static final class Bridge {
        private final MainActivity activity;
        private final Context ctx;
        private int utterance;

        Bridge(MainActivity activity) {
            this.activity = activity;
            this.ctx = activity.getApplicationContext();
        }

        @JavascriptInterface
        public void speak(String text) {
            if (activity.ttsReady) {
                activity.tts.speak(text, TextToSpeech.QUEUE_ADD, null, "rias" + (utterance++));
            }
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
