package com.nylonv2.riascompanion;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.DateFormat;
import java.util.Date;

/**
 * The reminder pop-up in the middle of the screen while you're using another app.
 * Android only shows full-screen alarms over the lock screen; when the phone is
 * unlocked it shrinks them to a banner, so with "Appear on top" allowed we draw
 * the card ourselves on top of whatever is open.
 */
final class AlarmOverlay {
    private static final int CRIMSON = 0xFFC8173A;
    private static final int GOLD = 0xFFE3B866;
    private static final int TEXT = 0xFFF6E9EE;
    private static final int MUTED = 0xFFB896A4;

    private static View current;

    private AlarmOverlay() {}

    static boolean allowed(Context c) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
    }

    /** Screen on and unlocked: the only time Android turns an alarm into a small banner. */
    static boolean phoneInUse(Context c) {
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        KeyguardManager km = (KeyguardManager) c.getSystemService(Context.KEYGUARD_SERVICE);
        boolean on = pm != null && pm.isInteractive();
        boolean locked = km != null && km.isKeyguardLocked();
        return on && !locked;
    }

    static void show(final Context ctx, final String text, final String title, final String itemId,
                     final long at, final int notificationId, final String sound) {
        if ("voice".equals(sound)) RiasVoice.sayLater(ctx, text, 1200);
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
                try {
                    attach(ctx.getApplicationContext(), text, title, itemId, at, notificationId);
                } catch (Exception ignored) {
                    // Permission revoked or the window was refused: the notification still shows.
                }
            }
        });
    }

    private static int dp(Context c, float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics());
    }

    @SuppressWarnings("deprecation")
    private static void attach(final Context c, final String text, final String title, final String itemId,
                               final long at, final int notificationId) {
        final WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        if (wm == null) return;
        remove(wm);

        // Dimmed backdrop with the card centered on it.
        final FrameLayout root = new FrameLayout(c);
        root.setBackgroundColor(0x99000000);

        LinearLayout card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(c, 22), dp(c, 22), dp(c, 22), dp(c, 16));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[] {0xFF3A0F1F, 0xFF1C0B12});
        bg.setCornerRadius(dp(c, 28));
        bg.setStroke(dp(c, 1), 0xFF5A2438);
        card.setBackground(bg);
        card.setElevation(dp(c, 12));

        ImageView pic = new ImageView(c);
        Bitmap bm = Scheduler.picture(c);
        if (bm != null) pic.setImageBitmap(bm);
        else pic.setImageResource(c.getApplicationInfo().icon);
        pic.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setStroke(dp(c, 3), CRIMSON);
        pic.setBackground(ring);
        pic.setPadding(dp(c, 4), dp(c, 4), dp(c, 4), dp(c, 4));
        LinearLayout.LayoutParams picLp = new LinearLayout.LayoutParams(dp(c, 96), dp(c, 96));
        picLp.bottomMargin = dp(c, 10);
        card.addView(pic, picLp);

        TextView name = label(c, "Rias Gremory · " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(at)), 15, GOLD);
        name.setTypeface(Typeface.SERIF);
        card.addView(name);
        if (title != null && !title.isEmpty()) {
            TextView t = label(c, title, 20, TEXT);
            t.setTypeface(Typeface.DEFAULT_BOLD);
            t.setPadding(0, dp(c, 6), 0, 0);
            card.addView(t);
        }
        TextView msg = label(c, text, 16, TEXT);
        msg.setLineSpacing(0, 1.2f);
        msg.setPadding(dp(c, 4), dp(c, 8), dp(c, 4), dp(c, 14));
        card.addView(msg);

        if (itemId != null && !itemId.isEmpty()) {
            card.addView(button(c, "Done ✓", CRIMSON, new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    Scheduler.recordAction(c, itemId, "done", at, 0);
                    close(c, wm, notificationId);
                }
            }));
            LinearLayout row = new LinearLayout(c);
            row.setOrientation(LinearLayout.HORIZONTAL);
            for (final int mins : new int[] {5, 10, 30}) {
                Button b = button(c, "Snooze " + mins, 0xFF301723, new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        long until = System.currentTimeMillis() + mins * 60 * 1000L;
                        Scheduler.recordAction(c, itemId, "snooze", at, until);
                        Scheduler.addEvent(c, until, text, itemId, title);
                        close(c, wm, notificationId);
                    }
                });
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(c, 50), 1f);
                lp.topMargin = dp(c, 8);
                if (mins != 5) lp.leftMargin = dp(c, 6);
                b.setLayoutParams(lp);
                b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
                row.addView(b);
            }
            card.addView(row, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }
        card.addView(button(c, "Dismiss", 0x00000000, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                close(c, wm, notificationId);
            }
        }));
        TextView open = label(c, "Open Rias", 14, MUTED);
        open.setPadding(0, dp(c, 12), 0, dp(c, 4));
        open.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                close(c, wm, notificationId);
                c.startActivity(new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }
        });
        card.addView(open);

        FrameLayout.LayoutParams cardLp = new FrameLayout.LayoutParams(
                Math.min(dp(c, 340), c.getResources().getDisplayMetrics().widthPixels - dp(c, 32)),
                FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        root.addView(card, cardLp);

        int type = Build.VERSION.SDK_INT >= 26
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, type,
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.CENTER;
        wm.addView(root, lp);
        current = root;
    }

    private static TextView label(Context c, String s, float sp, int color) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        return t;
    }

    private static Button button(Context c, String s, int color, View.OnClickListener onClick) {
        Button b = new Button(c);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setTextColor(TEXT);
        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(dp(c, 16));
        shape.setColor(color);
        if (color == 0xFF301723 || color == 0x00000000) shape.setStroke(dp(c, 1), 0xFF4A2333);
        b.setBackground(shape);
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(c, 50));
        lp.topMargin = dp(c, 8);
        b.setLayoutParams(lp);
        return b;
    }

    /** The full alarm screen opened (or the reminder was handled): take the card down. */
    static void hide(final Context ctx) {
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
                WindowManager wm = (WindowManager) ctx.getApplicationContext().getSystemService(Context.WINDOW_SERVICE);
                if (wm != null) remove(wm);
            }
        });
    }

    private static void remove(WindowManager wm) {
        if (current == null) return;
        try {
            wm.removeView(current);
        } catch (Exception ignored) {
        }
        current = null;
    }

    private static void close(Context c, WindowManager wm, int notificationId) {
        RiasVoice.stop();
        remove(wm);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && notificationId != 0) nm.cancel(notificationId);
    }
}
