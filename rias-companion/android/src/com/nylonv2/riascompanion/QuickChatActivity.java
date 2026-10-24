package com.nylonv2.riascompanion;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;

/**
 * The little chat box from the widget: type (or speak) a message to Rias over your home
 * screen; it closes on send and her answer arrives as a notification.
 */
public class QuickChatActivity extends Activity {
    static final String EXTRA_VOICE = "voice";
    private static final int REQ_VOICE = 51;
    private EditText input;

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0x99000000);
        root.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(16), dp(18), dp(16));
        card.setClickable(true);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] {0xFF3A0F1F, 0xFF1A0910});
        bg.setCornerRadii(new float[] {dp(26), dp(26), dp(26), dp(26), 0, 0, 0, 0});
        bg.setStroke(dp(1), 0x66E3B866);
        card.setBackground(bg);

        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        ImageView pic = new ImageView(this);
        Bitmap bm = Scheduler.picture(this);
        if (bm != null) pic.setImageBitmap(bm); else pic.setImageResource(getApplicationInfo().icon);
        head.addView(pic, new LinearLayout.LayoutParams(dp(40), dp(40)));
        LinearLayout who = new LinearLayout(this);
        who.setOrientation(LinearLayout.VERTICAL);
        who.setPadding(dp(12), 0, 0, 0);
        TextView name = new TextView(this);
        name.setText("Rias Gremory");
        name.setTextColor(0xFFE3B866);
        name.setTypeface(Typeface.SERIF);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        TextView last = new TextView(this);
        last.setText(ChatLog.last(this));
        last.setTextColor(0xFFE8D2DA);
        last.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        last.setMaxLines(3);
        who.addView(name);
        who.addView(last);
        head.addView(who, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        card.addView(head);

        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(14), 0, 0);
        input = new EditText(this);
        input.setHint("Say something to her…");
        input.setHintTextColor(0x99F6E9EE);
        input.setTextColor(0xFFFFFFFF);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        input.setImeOptions(EditorInfo.IME_ACTION_SEND);
        input.setMaxLines(4);
        input.setPadding(dp(16), dp(10), dp(16), dp(10));
        GradientDrawable pill = new GradientDrawable();
        pill.setCornerRadius(dp(24));
        pill.setColor(0x33FFFFFF);
        pill.setStroke(dp(1), 0x33FFFFFF);
        input.setBackground(pill);
        input.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent e) {
                send();
                return true;
            }
        });
        row.addView(input, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(roundButton("🎙", 0x33FFFFFF, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                listen();
            }
        }));
        row.addView(roundButton("➤", 0xFFC8173A, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                send();
            }
        }));
        card.addView(row);
        TextView note = new TextView(this);
        note.setText("Her answer comes as a notification. You can reply right from it.");
        note.setTextColor(0x88F6E9EE);
        note.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        note.setPadding(dp(4), dp(10), 0, 0);
        card.addView(note);

        root.addView(card, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));
        setContentView(root);
        input.requestFocus();
        if (getIntent().getBooleanExtra(EXTRA_VOICE, false)) listen();
    }

    private Button roundButton(String label, int color, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(0xFFFFFFFF);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        b.setPadding(0, 0, 0, 0);
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(color);
        b.setBackground(d);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(46), dp(46));
        lp.leftMargin = dp(8);
        b.setLayoutParams(lp);
        return b;
    }

    private void listen() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PROMPT, "Talk to Rias");
        try {
            startActivityForResult(i, REQ_VOICE);
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_VOICE || resultCode != RESULT_OK || data == null) return;
        ArrayList<String> heard = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (heard == null || heard.isEmpty()) return;
        input.setText(heard.get(0));
        send();
    }

    private void send() {
        String text = input.getText().toString().trim();
        if (text.isEmpty()) return;
        RiasReplyService.say(this, text);
        finish();
    }
}
