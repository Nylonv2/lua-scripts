package com.nylonv2.countprep;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** A thin shell: the app itself is the web page in assets/www. */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 1;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;   // where the camera app is saving the photo being taken

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // the checklist, counts and key are kept in the page's storage
        s.setAllowFileAccess(true);
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                cameraUri = null;
                try {
                    Intent go;
                    if (params.isCaptureEnabled() && Build.VERSION.SDK_INT >= 29) {
                        // "Take a photo": open the camera straight away. The full-size photo is saved in
                        // Pictures/Count Prep (Android 10+ lets an app save there without a permission).
                        ContentValues v = new ContentValues();
                        v.put(MediaStore.Images.Media.DISPLAY_NAME, "jibbitz-" + System.currentTimeMillis() + ".jpg");
                        v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                        v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Count Prep");
                        cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                        go = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
                            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } else {
                        Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
                        if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                        go = Intent.createChooser(pick, "Choose photos");
                    }
                    startActivityForResult(go, REQ_FILE);
                } catch (Exception e) {
                    dropCameraFile();
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
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* no browser */ }
                return true;
            }
        });
        if (state != null) web.restoreState(state); else web.loadUrl("file:///android_asset/www/index.html");
    }

    private void dropCameraFile() {
        if (cameraUri == null) return;
        try { getContentResolver().delete(cameraUri, null, null); } catch (Exception e) { /* already gone */ }
        cameraUri = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
        if (cameraUri != null) out.putString("cameraUri", cameraUri.toString());
    }

    @Override
    protected void onRestoreInstanceState(Bundle state) {
        super.onRestoreInstanceState(state);
        String u = state.getString("cameraUri");
        if (u != null) cameraUri = Uri.parse(u);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE) return;
        Uri[] result = null;
        if (cameraUri != null) {
            if (resultCode == RESULT_OK) { result = new Uri[] { cameraUri }; cameraUri = null; }
            else dropCameraFile();   // cancelled: don't leave an empty picture behind
        } else if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                result = new Uri[clip.getItemCount()];
                for (int i = 0; i < result.length; i++) result[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[] { data.getData() };
            }
        }
        if (fileCallback != null) fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
