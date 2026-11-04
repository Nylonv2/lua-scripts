package com.nylonv2.riascompanion;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The pause screen in front of a scrolling app: a few seconds, a big "Close it" button, and the
 * next thing on today's plan. "Open anyway" unlocks when the pause is over. No lecture.
 */
public class PauseActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String pkg = "";
    private int left;
    private Button open;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.parseColor("#0f1115"));
        getWindow().setNavigationBarColor(Color.parseColor("#0f1115"));
        show(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        show(intent);
    }

    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    private String appName(String p) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(p, 0);
            return pm.getApplicationLabel(ai).toString();
        } catch (Exception e) {
            return "that app";
        }
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        t.setLineSpacing(0, 1.15f);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private Button button(String s, boolean primary) {
        Button btn = new Button(this);
        btn.setText(s);
        btn.setAllCaps(false);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, primary ? 19 : 16);
        btn.setTextColor(primary ? Color.WHITE : Color.parseColor("#9aa3b2"));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(16));
        bg.setColor(primary ? Color.parseColor("#2563eb") : Color.TRANSPARENT);
        if (!primary) bg.setStroke(dp(1), Color.parseColor("#2a2f3a"));
        btn.setBackground(bg);
        btn.setPadding(dp(16), dp(14), dp(16), dp(14));
        btn.setMinHeight(dp(primary ? 60 : 52));
        return btn;
    }

    private void show(Intent intent) {
        handler.removeCallbacksAndMessages(null);
        pkg = intent.getStringExtra("pkg") == null ? "" : intent.getStringExtra("pkg");
        SharedPreferences p = ScrollPause.prefs(this);
        left = p.getInt("seconds", 5);
        String[] plan = ScrollPause.current(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#0f1115"));
        root.setPadding(dp(28), dp(48), dp(28), dp(36));

        root.addView(text("Opening " + appName(pkg), 15, Color.parseColor("#9aa3b2"), false));
        TextView breath = text("Take a breath.", 30, Color.WHITE, true);
        breath.setPadding(0, dp(10), 0, dp(26));
        root.addView(breath);
        if (plan != null) {
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(18), dp(16), dp(18), dp(16));
            GradientDrawable cbg = new GradientDrawable();
            cbg.setCornerRadius(dp(16));
            cbg.setColor(Color.parseColor("#181b22"));
            card.setBackground(cbg);
            TextView label = text(plan[0], 13, Color.parseColor("#9aa3b2"), false);
            card.addView(label);
            TextView n = text(plan[1], 18, Color.WHITE, false);
            n.setPadding(0, dp(6), 0, 0);
            card.addView(n);
            root.addView(card, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }
        View gap = new View(this);
        root.addView(gap, new LinearLayout.LayoutParams(1, dp(40)));

        Button close = button("Close it", true);
        close.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { closeIt(); }
        });
        root.addView(close, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        View gap2 = new View(this);
        root.addView(gap2, new LinearLayout.LayoutParams(1, dp(12)));
        open = button("", false);
        open.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (left > 0) return;
                ScrollPause.allow(PauseActivity.this, pkg);
                finish();
                overridePendingTransition(0, 0);
            }
        });
        root.addView(open, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        setContentView(root);
        tick();
    }

    private void tick() {
        if (left > 0) {
            open.setText("Open anyway (" + left + ")");
            open.setEnabled(false);
            open.setAlpha(0.5f);
            left--;
            handler.postDelayed(new Runnable() { @Override public void run() { tick(); } }, 1000);
        } else {
            open.setText("Open anyway");
            open.setEnabled(true);
            open.setAlpha(1f);
        }
    }

    private void closeIt() {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(home); } catch (Exception ignored) { }
        finish();
        overridePendingTransition(0, 0);
    }

    @Override
    public void onBackPressed() { closeIt(); }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
