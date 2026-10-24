package com.nylonv2.riascompanion;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Context;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/**
 * window.RiasDevice: what the app's assistant can do on the phone. Shared by the app's
 * WebView and the hidden one that answers the widget, "Hey Rias" and the assistant button.
 */
final class RiasDevice {
    private final Context ctx;
    private final Activity activity; // null in the hidden WebView

    RiasDevice(Context ctx, Activity activity) {
        this.ctx = ctx.getApplicationContext();
        this.activity = activity;
    }

    @JavascriptInterface public void timerStart(String id, double endsAt, String label) { DeviceActions.timerStart(ctx, id, (long) endsAt, label); }
    @JavascriptInterface public void timerCancel(String id) { DeviceActions.timerCancel(ctx, id); }
    @JavascriptInterface public String volume(String action, int level) { return DeviceActions.volume(ctx, action, level); }
    @JavascriptInterface public String flashlight(boolean on) { return DeviceActions.flashlight(ctx, on); }
    @JavascriptInterface public String dnd(boolean on) { return DeviceActions.dnd(ctx, on); }
    @JavascriptInterface public String openApp(String name) { return DeviceActions.openApp(ctx, name); }
    @JavascriptInterface public String call(String who) { return DeviceActions.call(ctx, who); }
    @JavascriptInterface public String text(String who, String message) { return DeviceActions.text(ctx, who, message); }
    @JavascriptInterface public String directions(String place) { return DeviceActions.directions(ctx, place); }
    @JavascriptInterface public String notifications(double since) { return RiasNotifications.since((long) since); }
    @JavascriptInterface public void playPcm(String base64, int rate) { DeviceActions.playPcm(base64, rate); }
    @JavascriptInterface public void stopPcm() { DeviceActions.stopPcm(); }
    @JavascriptInterface public boolean pcmPlaying() { return DeviceActions.pcmPlaying(); }
    @JavascriptInterface
    public void sayNative(final String text) {
        // Start the voice engine on the main thread (this is called from the page's JS thread).
        new android.os.Handler(android.os.Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
                RiasVoice.say(ctx, text, true);
            }
        });
    }
    @JavascriptInterface public void openSettings(String what) { DeviceActions.openSettings(ctx, what); }
    @JavascriptInterface public void wake(String mode) { WakeService.setMode(ctx, mode); }

    /** What's allowed: {mic, contacts, call, dnd, notifications, assistant, wake, overlay}. */
    @JavascriptInterface
    public String status() {
        JSONObject o = new JSONObject();
        try {
            o.put("mic", DeviceActions.granted(ctx, android.Manifest.permission.RECORD_AUDIO));
            o.put("contacts", DeviceActions.granted(ctx, android.Manifest.permission.READ_CONTACTS));
            o.put("call", DeviceActions.granted(ctx, android.Manifest.permission.CALL_PHONE));
            o.put("dnd", DeviceActions.dndAccess(ctx));
            o.put("notifications", RiasNotifications.allowed(ctx));
            o.put("overlay", AlarmOverlay.allowed(ctx));
            boolean assistant = false;
            if (Build.VERSION.SDK_INT >= 29) {
                RoleManager rm = ctx.getSystemService(RoleManager.class);
                assistant = rm != null && rm.isRoleHeld(RoleManager.ROLE_ASSISTANT);
            }
            o.put("assistant", assistant);
            o.put("wake", WakeService.mode(ctx));
            o.put("wakeRunning", WakeService.running);
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    /** Asks for mic / contacts / phone permission (only from the app's own screen). */
    @JavascriptInterface
    public void requestPermission(final String what) {
        if (activity == null || Build.VERSION.SDK_INT < 23) return;
        final String[] perms;
        switch (what) {
            case "mic": perms = new String[] {android.Manifest.permission.RECORD_AUDIO}; break;
            case "calls": perms = new String[] {android.Manifest.permission.READ_CONTACTS, android.Manifest.permission.CALL_PHONE}; break;
            default: return;
        }
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.requestPermissions(perms, 60);
            }
        });
    }
}
