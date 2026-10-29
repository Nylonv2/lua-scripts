package com.nylonv2.riascompanion;

import android.content.Context;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * The offline speech model the wake word runs on (Vosk, small US English, about 40 MB).
 * Downloaded once, the first time "Hey …" is turned on; after that listening needs no internet.
 */
class WakeModel {
    static final String NAME = "vosk-model-small-en-us-0.15";
    static final String URL_ZIP = "https://alphacephei.com/vosk/models/" + NAME + ".zip";

    /** "", "downloading:NN" (percent), "ready" or "error:<why>". */
    static volatile String state = "";
    private static volatile boolean busy;

    static File dir(Context c) {
        return new File(c.getFilesDir(), "wake/" + NAME);
    }

    static boolean ready(Context c) {
        return new File(dir(c), ".done").exists();
    }

    static String status(Context c) {
        return ready(c) ? "ready" : state;
    }

    /** Starts the download if needed; `done` runs (on a background thread) once the model is usable. */
    static void ensure(final Context c, final Runnable done) {
        if (ready(c)) {
            if (done != null) done.run();
            return;
        }
        if (busy) return;
        busy = true;
        state = "downloading:0";
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    fetch(c.getApplicationContext());
                    state = "ready";
                    if (done != null) done.run();
                } catch (Exception e) {
                    state = "error:" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                } finally {
                    busy = false;
                }
            }
        }, "wake-model").start();
    }

    private static void fetch(Context c) throws Exception {
        File root = new File(c.getFilesDir(), "wake");
        File zip = new File(c.getCacheDir(), NAME + ".zip");
        HttpURLConnection con = (HttpURLConnection) new URL(URL_ZIP).openConnection();
        con.setConnectTimeout(20000);
        con.setReadTimeout(30000);
        int code = con.getResponseCode();
        if (code != 200) throw new Exception("download failed (" + code + ")");
        long total = con.getContentLengthLong();
        InputStream in = new BufferedInputStream(con.getInputStream());
        OutputStream out = new FileOutputStream(zip);
        byte[] buf = new byte[64 * 1024];
        long got = 0;
        int n;
        try {
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                got += n;
                if (total > 0) state = "downloading:" + (int) (got * 90 / total);
            }
        } finally {
            out.close();
            in.close();
            con.disconnect();
        }
        state = "downloading:95";
        deleteTree(root);
        root.mkdirs();
        ZipInputStream z = new ZipInputStream(new java.io.FileInputStream(zip));
        try {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                File f = new File(root, e.getName());
                if (!f.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) continue; // no ../ tricks
                if (e.isDirectory()) { f.mkdirs(); continue; }
                f.getParentFile().mkdirs();
                OutputStream fo = new FileOutputStream(f);
                try {
                    while ((n = z.read(buf)) > 0) fo.write(buf, 0, n);
                } finally {
                    fo.close();
                }
            }
        } finally {
            z.close();
            zip.delete();
        }
        if (!dir(c).isDirectory()) throw new Exception("unexpected download");
        new File(dir(c), ".done").createNewFile();
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }
}
