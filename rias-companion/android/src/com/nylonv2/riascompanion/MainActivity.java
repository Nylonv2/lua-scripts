package com.nylonv2.riascompanion;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Hosts the web app (assets/www) full screen and exposes a small bridge as window.RiasNative. */
public class MainActivity extends Activity {
    static volatile boolean visible;
    private WebView web;

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
        web.addJavascriptInterface(new Bridge(getApplicationContext()), "RiasNative");
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
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        visible = false;
        web.destroy();
        super.onDestroy();
    }

    static final class Bridge {
        private final Context ctx;

        Bridge(Context ctx) {
            this.ctx = ctx;
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
