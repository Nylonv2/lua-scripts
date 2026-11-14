package com.nylonv2.deliveryroom;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** A thin shell: the app itself is the web page in assets/www. */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 1;
    private static final String UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingText;   // a delivery list shared or opened into the app, waiting for the page
    private boolean pageReady;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // the list, ticks, photos and key are kept in the page's storage
        s.setAllowFileAccess(true);
        web.addJavascriptInterface(new Bridge(), "DeliveryNative");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                boolean text = false;
                for (String t : params.getAcceptTypes()) if (t != null && (t.contains("text") || t.contains(".txt"))) text = true;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE);
                if (text) pick.setType("*/*").putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"text/plain", "text/*", "application/octet-stream"});
                else pick.setType("image/*");
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(pick, text ? "Choose the delivery list" : "Choose photos"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme())) return false;
                // "See photos" and other links open in the browser, not inside the app.
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* no browser */ }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                deliverText();
            }
        });
        takeIntent(getIntent());
        if (state != null) web.restoreState(state); else web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        takeIntent(intent);
        deliverText();
    }

    /** A delivery list shared to the app as text, or a text file opened with it. */
    private void takeIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        try {
            if (Intent.ACTION_SEND.equals(action)) {
                CharSequence t = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (t != null && t.length() > 0) pendingText = t.toString();
                else if (stream != null) pendingText = readText(stream);
            } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
                pendingText = readText(intent.getData());
            }
        } catch (Exception e) { /* unreadable: nothing to load */ }
    }

    private String readText(Uri uri) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            return in == null ? null : new String(readUpTo(in, 300 * 1024), "UTF-8");
        }
    }

    private void deliverText() {
        if (!pageReady || pendingText == null) return;
        String js = "window.receiveDeliveryText && window.receiveDeliveryText(" + JSONObject.quote(pendingText) + ")";
        pendingText = null;
        web.evaluateJavascript(js, null);
    }

    private static byte[] readUpTo(InputStream in, int max) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while (out.size() < max && (n = in.read(buf, 0, Math.min(buf.length, max - out.size()))) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    private static HttpURLConnection open(String url, String accept) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(12000);
        c.setReadTimeout(15000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", UA);
        c.setRequestProperty("Accept", accept);
        c.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
        return c;
    }

    private static final Pattern[] IMAGE_TAGS = {
        Pattern.compile("<meta[^>]+(?:property|name)=[\"'](?:og:image(?::secure_url)?|twitter:image(?::src)?)[\"'][^>]*content=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE),
        Pattern.compile("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*(?:property|name)=[\"'](?:og:image(?::secure_url)?|twitter:image(?::src)?)[\"']", Pattern.CASE_INSENSITIVE),
        Pattern.compile("<link[^>]+rel=[\"']image_src[\"'][^>]*href=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE),
    };

    /** The product picture a page names for link previews (og:image and friends), as a small JPEG data URL, or null. */
    private static String pictureFrom(String pageUrl) {
        try {
            if (!pageUrl.startsWith("https://") && !pageUrl.startsWith("http://")) return null;
            HttpURLConnection c = open(pageUrl, "text/html,application/xhtml+xml");
            if (c.getResponseCode() / 100 != 2) return null;
            String html;
            try (InputStream in = c.getInputStream()) { html = new String(readUpTo(in, 700 * 1024), "UTF-8"); }
            String img = null;
            for (Pattern p : IMAGE_TAGS) {
                Matcher m = p.matcher(html);
                if (m.find()) { img = m.group(1).replace("&amp;", "&").trim(); break; }
            }
            if (img == null || img.isEmpty()) return null;
            String abs = new URL(c.getURL(), img).toString();   // relative and protocol-relative addresses
            HttpURLConnection ic = open(abs, "image/avif,image/webp,image/*,*/*;q=0.8");
            ic.setRequestProperty("Referer", pageUrl);
            if (ic.getResponseCode() / 100 != 2) return null;
            byte[] bytes;
            try (InputStream in = ic.getInputStream()) { bytes = readUpTo(in, 8 * 1024 * 1024); }
            Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bmp == null || bmp.getWidth() < 80 || bmp.getHeight() < 80) return null;   // a tracking pixel or logo, not a shoe
            float k = Math.min(1f, 480f / Math.max(bmp.getWidth(), bmp.getHeight()));
            Bitmap small = k < 1f ? Bitmap.createScaledBitmap(bmp, Math.round(bmp.getWidth() * k), Math.round(bmp.getHeight() * k), true) : bmp;
            Bitmap flat = Bitmap.createBitmap(small.getWidth(), small.getHeight(), Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas = new android.graphics.Canvas(flat);
            canvas.drawColor(0xFFFFFFFF);   // transparent product shots get a white background
            canvas.drawBitmap(small, 0, 0, null);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            flat.compress(Bitmap.CompressFormat.JPEG, 80, out);
            return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    /** What the page can ask the phone to do. */
    private class Bridge {
        /** Tries each page in turn; answers window.onShoePicture(id, dataUrl or "", pageUrl). */
        @JavascriptInterface
        public void fetchPicture(final String id, final String pagesJson) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    String found = null, from = "";
                    try {
                        JSONArray pages = new JSONArray(pagesJson);
                        for (int i = 0; i < pages.length() && i < 4 && found == null; i++) {
                            from = pages.getString(i);
                            found = pictureFrom(from);
                        }
                    } catch (Exception e) { /* bad list: nothing found */ }
                    final String js = "window.onShoePicture && window.onShoePicture(" + JSONObject.quote(id) + "," + JSONObject.quote(found == null ? "" : found) + "," + JSONObject.quote(found == null ? "" : from) + ")";
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() { web.evaluateJavascript(js, null); }
                    });
                }
            }).start();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                result = new Uri[clip.getItemCount()];
                for (int i = 0; i < result.length; i++) result[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[] { data.getData() };
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
