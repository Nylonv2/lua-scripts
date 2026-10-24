package com.nylonv2.riascompanion;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** A voice/chat timer finished (rings as an alarm) or was cancelled from its notification. */
public class TimerReceiver extends BroadcastReceiver {
    static final String ACTION_DONE = "com.nylonv2.riascompanion.TIMER_DONE";
    static final String ACTION_CANCEL = "com.nylonv2.riascompanion.TIMER_CANCEL";

    @Override
    public void onReceive(Context c, Intent i) {
        String id = i.getStringExtra("id");
        String label = i.getStringExtra("label");
        if (id == null) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(DeviceActions.timerNoteId(id));
        if (ACTION_CANCEL.equals(i.getAction())) {
            DeviceActions.timerCancel(c, id);
            Scheduler.recordAction(c, "timer:" + id, "cancel", System.currentTimeMillis(), 0);
            return;
        }
        String what = label == null || label.isEmpty() ? "Your timer" : "Your " + label + " timer";
        Scheduler.recordAction(c, "timer:" + id, "done", System.currentTimeMillis(), 0);
        Scheduler.showAlarm(c, what + " is done~ Time's up!", "Timer", null, System.currentTimeMillis(), "", "⏱", false);
    }
}
