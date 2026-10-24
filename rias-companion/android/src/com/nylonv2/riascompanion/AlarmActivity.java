package com.nylonv2.riascompanion;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.DateFormat;
import java.util.Date;

/**
 * The alarm-style pop-up for reminders: Rias's picture, her message, and
 * Done / Snooze / Dismiss. Shown over the lock screen like an alarm app.
 * Buttons are recorded and applied by the web app next time it opens.
 */
public class AlarmActivity extends Activity {
    static final String EXTRA_TEXT = "text";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_ITEM = "itemId";
    static final String EXTRA_AT = "at";
    static final String EXTRA_NOTIFICATION = "notificationId";

    private static final int CRIMSON = 0xFFC8173A;
    private static final int GOLD = 0xFFE3B866;
    private static final int TEXT = 0xFFF6E9EE;
    private static final int MUTED = 0xFFB896A4;

    @Override
    @SuppressWarnings("deprecation")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(0xFF16090E);
        getWindow().setNavigationBarColor(0xFF16090E);
        AlarmOverlay.hide(this);
        show(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        show(intent);
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private void show(Intent in) {
        final String text = in.getStringExtra(EXTRA_TEXT) == null ? "" : in.getStringExtra(EXTRA_TEXT);
        final String title = in.getStringExtra(EXTRA_TITLE);
        final String itemId = in.getStringExtra(EXTRA_ITEM);
        final long at = in.getLongExtra(EXTRA_AT, System.currentTimeMillis());
        final int notificationId = in.getIntExtra(EXTRA_NOTIFICATION, 0);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(24), dp(24), dp(24), dp(24));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[] {0xFF3A0F1F, 0xFF16090E, 0xFF16090E});
        root.setBackground(bg);

        // Her picture (your chosen one, or the app icon), in a crimson ring.
        ImageView pic = new ImageView(this);
        Bitmap bm = Scheduler.picture(this);
        if (bm != null) pic.setImageBitmap(bm);
        else pic.setImageResource(getApplicationInfo().icon);
        pic.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setStroke(dp(4), CRIMSON);
        pic.setBackground(ring);
        pic.setPadding(dp(6), dp(6), dp(6), dp(6));
        LinearLayout.LayoutParams picLp = new LinearLayout.LayoutParams(dp(160), dp(160));
        picLp.bottomMargin = dp(18);
        root.addView(pic, picLp);

        TextView name = label("Rias Gremory", 24, GOLD);
        name.setTypeface(Typeface.SERIF);
        root.addView(name);

        TextView time = label(DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(at)), 44, TEXT);
        time.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(time);

        if (title != null && !title.isEmpty()) {
            TextView t = label(title, 18, GOLD);
            t.setPadding(0, dp(4), 0, dp(10));
            root.addView(t);
        }

        TextView msg = label(text, 18, TEXT);
        msg.setLineSpacing(0, 1.2f);
        msg.setPadding(dp(8), dp(4), dp(8), dp(28));
        root.addView(msg);

        final Context c = this;
        if (itemId != null && !itemId.isEmpty()) {
            root.addView(button("Done ✓", CRIMSON, new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    Scheduler.recordAction(c, itemId, "done", at, 0);
                    close(notificationId);
                }
            }));
            root.addView(button("Snooze 10 min", 0xFF301723, new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    long until = System.currentTimeMillis() + 10 * 60 * 1000L;
                    Scheduler.recordAction(c, itemId, "snooze", at, until);
                    Scheduler.addEvent(c, until, text, itemId, title);
                    close(notificationId);
                }
            }));
        }
        root.addView(button("Dismiss", 0x00000000, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                close(notificationId);
            }
        }));
        TextView open = label("Open Rias", 15, MUTED);
        open.setPadding(0, dp(14), 0, 0);
        open.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                close(notificationId);
            }
        });
        root.addView(open);

        setContentView(root);
    }

    private TextView label(String s, float sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        return t;
    }

    private Button button(String s, int color, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        b.setTextColor(TEXT);
        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(dp(16));
        shape.setColor(color);
        if (color == 0xFF301723 || color == 0x00000000) shape.setStroke(dp(1), 0xFF4A2333);
        b.setBackground(shape);
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(280), dp(54));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    private void close(int notificationId) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && notificationId != 0) nm.cancel(notificationId);
        finish();
    }
}
