package com.nylonv2.riascompanion;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
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
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;

import java.util.ArrayList;

/**
 * The assistant sheet: opens from "Hey Rias", the phone's assistant button (long-press home /
 * power, once Rias is your digital assistant app), or the chat widget's mic. Listens, shows what
 * you said, then her answer as she says it out loud. Ends with a question → listens again.
 */
public class AssistActivity extends Activity implements RecognitionListener, RiasReplyService.AssistListener {
    static final String EXTRA_COMMAND = "command";
    static final String EXTRA_WAKE = "wake";
    static volatile boolean opened;
    private static final int REQ_VOICE = 52;

    private final Handler main = new Handler(Looper.getMainLooper());
    private TextView status, heard, answer;
    private Button mic;
    private SpeechRecognizer rec;
    private boolean listening, waiting, userTouched;
    private String lastAnswer = "";
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
            // She asked you something: keep the conversation going.
            if (lastAnswer.trim().endsWith("?")) startListening();
            else main.postDelayed(closeRun, 5000);
        }
    };

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        opened = true;
        WakeService.pause();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);

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
        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                userTouched = true;
                main.removeCallbacks(closeRun);
            }
        });
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] {0xFF3A0F1F, 0xFF1A0910});
        bg.setCornerRadii(new float[] {dp(28), dp(28), dp(28), dp(28), 0, 0, 0, 0});
        bg.setStroke(dp(1), 0x66E3B866);
        card.setBackground(bg);

        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        ImageView pic = new ImageView(this);
        Bitmap bm = Scheduler.picture(this);
        if (bm != null) pic.setImageBitmap(bm); else pic.setImageResource(getApplicationInfo().icon);
        head.addView(pic, new LinearLayout.LayoutParams(dp(44), dp(44)));
        LinearLayout who = new LinearLayout(this);
        who.setOrientation(LinearLayout.VERTICAL);
        who.setPadding(dp(12), 0, 0, 0);
        TextView name = new TextView(this);
        name.setText("Rias Gremory");
        name.setTextColor(0xFFE3B866);
        name.setTypeface(Typeface.SERIF);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        status = new TextView(this);
        status.setTextColor(0xAAF6E9EE);
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        who.addView(name);
        who.addView(status);
        head.addView(who, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        card.addView(head);

        heard = new TextView(this);
        heard.setTextColor(0xCCF6E9EE);
        heard.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        heard.setTypeface(null, Typeface.ITALIC);
        heard.setPadding(0, dp(14), 0, 0);
        card.addView(heard);
        answer = new TextView(this);
        answer.setTextColor(0xFFFFFFFF);
        answer.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        answer.setLineSpacing(0, 1.15f);
        answer.setPadding(0, dp(10), 0, dp(6));
        card.addView(answer);

        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        row.setPadding(0, dp(12), 0, 0);
        Button type = small("⌨", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(AssistActivity.this, QuickChatActivity.class));
                finish();
            }
        });
        mic = new Button(this);
        mic.setText("🎙");
        mic.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        mic.setTextColor(0xFFFFFFFF);
        mic.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                userTouched = true;
                if (listening) stopListening(); else startListening();
            }
        });
        Button open = small("↗", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(AssistActivity.this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                finish();
            }
        });
        row.addView(type);
        LinearLayout.LayoutParams ml = new LinearLayout.LayoutParams(dp(72), dp(72));
        ml.leftMargin = ml.rightMargin = dp(26);
        row.addView(mic, ml);
        row.addView(open);
        card.addView(row);
        setMic(false);

        root.addView(card, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));
        setContentView(root);
        RiasReplyService.assist = this;

        String cmd = getIntent().getStringExtra(EXTRA_COMMAND);
        if (cmd != null && !cmd.trim().isEmpty()) send(cmd.trim());
        else startListening();
    }

    private Button small(String label, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(0xFFF6E9EE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(0x26FFFFFF);
        b.setBackground(d);
        b.setOnClickListener(l);
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(48), dp(48)));
        return b;
    }

    private void setMic(boolean on) {
        listening = on;
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(on ? 0xFFE0284F : 0xFFC8173A);
        if (on) d.setStroke(dp(4), 0x66FFB3C4);
        mic.setBackground(d);
        status.setText(on ? "Listening…" : waiting ? "Thinking…" : "Tap the mic to talk");
    }

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
                status.setText("Voice typing isn't available on this phone");
            }
            return;
        }
        try {
            if (rec == null) {
                rec = SpeechRecognizer.createSpeechRecognizer(this);
                rec.setRecognitionListener(this);
            }
            heard.setText("");
            beep();
            rec.startListening(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName()));
            setMic(true);
        } catch (Exception e) {
            setMic(false);
        }
    }

    private void stopListening() {
        if (rec != null) rec.stopListening();
        setMic(false);
    }

    private void send(String text) {
        heard.setText("“" + text + "”");
        answer.setText("");
        waiting = true;
        setMic(false);
        RiasReplyService.say(this, text, true, true);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_VOICE) return;
        ArrayList<String> r = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (resultCode == RESULT_OK && r != null && !r.isEmpty()) send(r.get(0));
        else main.postDelayed(closeRun, 4000);
    }

    // ---- her answer (from RiasReplyService) ----
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
        answer.setText(lastAnswer);
        status.setText("Rias");
    }

    @Override
    public void onDone() {
        waiting = false;
        setMic(false);
        status.setText("Rias");
        main.removeCallbacks(afterSpeech);
        main.postDelayed(afterSpeech, 700);
    }

    // ---- speech recognizer ----
    @Override
    public void onPartialResults(Bundle b) {
        ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (r != null && !r.isEmpty()) heard.setText(r.get(0));
    }

    @Override
    public void onResults(Bundle b) {
        setMic(false);
        ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (r != null && !r.isEmpty() && !r.get(0).trim().isEmpty()) send(r.get(0).trim());
        else main.postDelayed(closeRun, 4000);
    }

    @Override
    public void onError(int error) {
        setMic(false);
        status.setText(error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                ? "I didn't catch that. Tap the mic to try again." : "Couldn't listen just now. Tap the mic to try again.");
        main.postDelayed(closeRun, 6000);
    }

    @Override public void onReadyForSpeech(Bundle params) { }
    @Override public void onBeginningOfSpeech() { }
    @Override public void onRmsChanged(float rmsdB) { }
    @Override public void onBufferReceived(byte[] buffer) { }
    @Override public void onEndOfSpeech() { status.setText("…"); }
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
        opened = false;
        WakeService.resume();
        super.onDestroy();
    }
}
