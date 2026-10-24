package com.nylonv2.riascompanion;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;

/**
 * The assistant sheet: opens from the phone's assistant button (long-press home / power, once
 * Rias is your digital assistant app), "Hey Rias", or the chat widget. Drawn by assist.html in the
 * app's own style (her portrait in the magic circle, glass sheet, chat bubbles); listens, shows
 * what you said, then her answer as she says it. Ends with a question → listens again.
 * A plain native sheet stands in if the WebView can't load.
 */
public class AssistActivity extends Activity implements RecognitionListener, RiasReplyService.AssistListener {
    static final String EXTRA_COMMAND = "command";
    static final String EXTRA_WAKE = "wake";
    static volatile boolean opened;
    private static final int REQ_VOICE = 52;

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private TextView status, heard, answer; // plain fallback
    private SpeechRecognizer rec;
    private boolean listening, waiting, userTouched, started;
    private String lastAnswer = "";
    private boolean quiet; // small bubble, voice only (Settings → Assistant → Pop-up style)
    private long doneAt;
    private final Runnable closeRun = new Runnable() {
        @Override
        public void run() {
            if (!userTouched && !listening && !waiting) finish();
        }
    };
    private final Runnable afterSpeech = new Runnable() {
        @Override
        public void run() {
            if (isFinishing()) return;
            if (DeviceActions.pcmPlaying() || RiasVoice.speaking()) {
                main.postDelayed(this, 300);
                return;
            }
            // Her voice can take a moment to start after the words appear.
            if (System.currentTimeMillis() - doneAt < 2500) {
                main.postDelayed(this, 300);
                return;
            }
            // She asked you something: keep the conversation going.
            if (lastAnswer.trim().endsWith("?")) startListening();
            else if (quiet) leave();
            else {
                update(o("state", "idle", "status", "Tap the mic to keep talking"));
                main.postDelayed(closeRun, 6000);
            }
        }
    };

    static java.io.File pictureFile(android.content.Context c) {
        return new java.io.File(c.getFilesDir(), "assist-picture.jpg");
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private static JSONObject o(Object... kv) {
        JSONObject j = new JSONObject();
        try {
            for (int i = 0; i + 1 < kv.length; i += 2) j.put((String) kv[i], kv[i + 1]);
        } catch (Exception ignored) {
        }
        return j;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        opened = true;
        WakeService.pause();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        RiasReplyService.assist = this;
        quiet = !"full".equals(getSharedPreferences("rias", MODE_PRIVATE).getString("assistStyle", "quiet"));
        if (quiet) {
            // A small window near the bottom; the rest of the screen stays usable.
            getWindow().setLayout(dp(170), dp(170));
            getWindow().setGravity(Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.y = dp(70);
            getWindow().setAttributes(lp);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        }
        try {
            buildWeb();
        } catch (Exception e) {
            web = null;
            buildPlain();
            begin();
        }
    }

    // ---------- the styled sheet ----------
    private void buildWeb() {
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public String data() {
                SharedPreferences p = getSharedPreferences("rias", MODE_PRIVATE);
                JSONObject j = new JSONObject();
                try {
                    j.put("theme", p.getString("theme", "crimson"));
                    j.put("outfit", p.getString("outfit", ""));
                    j.put("style", quiet ? "quiet" : "full");
                    // Settings → Assistant → Pop-up look: same as Home, animated, her picture, or one just for here.
                    String mode = p.getString("assistChar", "same");
                    String mine = AlarmActivity.dataUrl(Scheduler.pictureFile(AssistActivity.this));
                    String own = AlarmActivity.dataUrl(pictureFile(AssistActivity.this));
                    String pic = "own".equals(mode) ? (own.isEmpty() ? mine : own)
                            : "picture".equals(mode) ? mine
                            : "same".equals(mode) && "picture".equals(p.getString("homeChar", "animated")) ? mine : "";
                    j.put("homeChar", pic.isEmpty() ? "animated" : "picture");
                    j.put("pic", pic);
                } catch (Exception ignored) {
                }
                return j.toString();
            }

            @JavascriptInterface
            public void ready() {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        begin();
                    }
                });
            }

            @JavascriptInterface
            public void mic() {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (listening) stopListening(); else startListening();
                    }
                });
            }

            @JavascriptInterface
            public void send(final String text) {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        userTouched = true;
                        if (listening) stopListening();
                        if (text != null && !text.trim().isEmpty()) send(text.trim());
                    }
                });
            }

            @JavascriptInterface
            public void open() {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        startActivity(new Intent(AssistActivity.this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                        finish();
                    }
                });
            }

            @JavascriptInterface
            public void close() {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        finish();
                    }
                });
            }

            @JavascriptInterface
            public void tap() {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (listening) stopListening();
                        else if (waiting) return;
                        else if (DeviceActions.pcmPlaying() || RiasVoice.speaking()) { DeviceActions.stopPcm(); RiasVoice.stop(); leave(); }
                        else startListening();
                    }
                });
            }

            @JavascriptInterface
            public void touch() {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        userTouched = true;
                        main.removeCallbacks(closeRun);
                    }
                });
            }
        }, "AssistNative");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/assist.html");
        // If the page never says it's ready, carry on anyway.
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                begin();
            }
        }, 2500);
    }

    /** Quiet bubble: shrink away, then close. */
    private void leave() {
        update(o("state", "leaving"));
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                finish();
            }
        }, 320);
    }

    /** No answer coming (nothing heard, an error): close soon in quiet style, later in full. */
    private void closeSoon(long fullDelay) {
        main.removeCallbacks(closeRun);
        if (quiet) {
            main.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (!listening && !waiting) leave();
                }
            }, 1200);
        } else {
            main.postDelayed(closeRun, fullDelay);
        }
    }

    private void begin() {
        if (started) return;
        started = true;
        String cmd = getIntent().getStringExtra(EXTRA_COMMAND);
        if (cmd != null && !cmd.trim().isEmpty()) send(cmd.trim());
        else startListening();
    }

    /** Sends a change to the sheet: { state, status, heard, final, answer, level }. */
    private void update(JSONObject change) {
        if (web != null) {
            web.evaluateJavascript("window.assist && window.assist.update(" + change + ")", null);
            return;
        }
        if (status == null) return;
        if (change.has("status")) status.setText(change.optString("status"));
        if (change.has("heard")) heard.setText(change.optBoolean("final") ? "“" + change.optString("heard") + "”" : change.optString("heard"));
        if (change.has("answer")) answer.setText(change.optString("answer"));
        if (change.optBoolean("final")) answer.setText("…");
    }

    // ---------- plain fallback ----------
    private void buildPlain() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0x88000000);
        root.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(18), dp(20), dp(20));
        card.setClickable(true);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] {0xFF3A0F1F, 0xFF1A0910});
        bg.setCornerRadii(new float[] {dp(28), dp(28), dp(28), dp(28), 0, 0, 0, 0});
        card.setBackground(bg);
        TextView name = new TextView(this);
        name.setText("Rias Gremory");
        name.setTextColor(0xFFE3B866);
        name.setTypeface(Typeface.SERIF);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        status = new TextView(this);
        status.setTextColor(0xAAF6E9EE);
        heard = new TextView(this);
        heard.setTextColor(0xCCF6E9EE);
        heard.setPadding(0, dp(12), 0, 0);
        answer = new TextView(this);
        answer.setTextColor(0xFFFFFFFF);
        answer.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        answer.setPadding(0, dp(8), 0, dp(8));
        Button mic = new Button(this);
        mic.setText("🎙");
        mic.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                userTouched = true;
                if (listening) stopListening(); else startListening();
            }
        });
        card.addView(name);
        card.addView(status);
        card.addView(heard);
        card.addView(answer);
        card.addView(mic, new LinearLayout.LayoutParams(dp(72), dp(72)));
        ((LinearLayout.LayoutParams) mic.getLayoutParams()).gravity = Gravity.CENTER_HORIZONTAL;
        root.addView(card, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));
        setContentView(root);
    }

    // ---------- listening ----------
    private void beep() {
        try {
            final ToneGenerator t = new ToneGenerator(AudioManager.STREAM_MUSIC, 60);
            t.startTone(ToneGenerator.TONE_PROP_BEEP, 120);
            main.postDelayed(new Runnable() {
                @Override
                public void run() {
                    t.release();
                }
            }, 400);
        } catch (Exception ignored) {
        }
    }

    private void startListening() {
        main.removeCallbacks(closeRun);
        DeviceActions.stopPcm();
        RiasVoice.stop();
        if (!DeviceActions.granted(this, android.Manifest.permission.RECORD_AUDIO) || !SpeechRecognizer.isRecognitionAvailable(this)) {
            // Without mic permission, use the phone's own voice typing screen.
            try {
                startActivityForResult(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        .putExtra(RecognizerIntent.EXTRA_PROMPT, "Talk to Rias"), REQ_VOICE);
            } catch (Exception e) {
                update(o("state", "idle", "status", "Voice typing isn't available. Tap the keyboard to type."));
            }
            return;
        }
        try {
            if (rec == null) {
                rec = SpeechRecognizer.createSpeechRecognizer(this);
                rec.setRecognitionListener(this);
            }
            beep();
            rec.startListening(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName()));
            listening = true;
            update(o("state", "listening", "status", "I'm listening~"));
        } catch (Exception e) {
            listening = false;
            update(o("state", "idle", "status", "Couldn't listen just now. Tap the mic to try again."));
        }
    }

    private void stopListening() {
        if (rec != null) rec.stopListening();
        listening = false;
        update(o("state", "idle", "status", ""));
    }

    private void send(String text) {
        main.removeCallbacks(closeRun);
        waiting = true;
        listening = false;
        update(o("state", "thinking", "status", "Thinking…", "heard", text, "final", true));
        RiasReplyService.say(this, text, true, true);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_VOICE) return;
        ArrayList<String> r = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (resultCode == RESULT_OK && r != null && !r.isEmpty()) send(r.get(0));
        else {
            update(o("state", "idle", "status", "Tap the mic to talk"));
            closeSoon(6000);
        }
    }

    // ---------- her answer (from RiasReplyService) ----------
    @Override
    public void onLines(String json) {
        StringBuilder sb = new StringBuilder();
        try {
            JSONArray a = new JSONArray(json);
            for (int i = 0; i < a.length(); i++) {
                if (sb.length() > 0) sb.append("\n\n");
                sb.append(a.optString(i));
            }
        } catch (Exception ignored) {
        }
        lastAnswer = sb.toString();
        update(o("state", "speaking", "status", "", "answer", lastAnswer));
    }

    @Override
    public void onDone() {
        waiting = false;
        doneAt = System.currentTimeMillis();
        main.removeCallbacks(afterSpeech);
        main.postDelayed(afterSpeech, 700);
    }

    // ---------- speech recognizer ----------
    @Override
    public void onPartialResults(Bundle b) {
        ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (r != null && !r.isEmpty() && !r.get(0).isEmpty()) update(o("heard", r.get(0)));
    }

    @Override
    public void onResults(Bundle b) {
        listening = false;
        ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (r != null && !r.isEmpty() && !r.get(0).trim().isEmpty()) send(r.get(0).trim());
        else {
            update(o("state", "idle", "status", "I didn't catch that. Tap the mic to try again."));
            closeSoon(6000);
        }
    }

    @Override
    public void onError(int error) {
        listening = false;
        update(o("state", "idle", "status", error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                ? "I didn't catch that. Tap the mic to try again." : "Couldn't listen just now. Tap the mic to try again."));
        closeSoon(7000);
    }

    @Override public void onRmsChanged(float rmsdB) { update(o("level", (double) rmsdB)); }
    @Override public void onReadyForSpeech(Bundle params) { }
    @Override public void onBeginningOfSpeech() { }
    @Override public void onBufferReceived(byte[] buffer) { }
    @Override public void onEndOfSpeech() { update(o("status", "Mm…")); }
    @Override public void onEvent(int eventType, Bundle params) { }

    @Override
    protected void onStop() {
        super.onStop();
        // She opened another app for you (maps, a call, music): get out of the way.
        if (!isChangingConfigurations() && !waiting) finish();
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (RiasReplyService.assist == this) RiasReplyService.assist = null;
        if (rec != null) {
            try {
                rec.destroy();
            } catch (Exception ignored) {
            }
            rec = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        opened = false;
        WakeService.resume();
        super.onDestroy();
    }
}
