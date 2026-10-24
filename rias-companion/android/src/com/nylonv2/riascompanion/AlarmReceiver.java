package com.nylonv2.riascompanion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    /** Done / Snooze tapped right on the reminder notification. */
    static final String ACTION_DONE = "com.nylonv2.riascompanion.DONE";
    static final String ACTION_SNOOZE = "com.nylonv2.riascompanion.SNOOZE";
    /** An alarm rang for 3 minutes unanswered: stop the sound, keep the notification. */
    static final String ACTION_QUIET = "com.nylonv2.riascompanion.QUIET";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_DONE.equals(action) || ACTION_SNOOZE.equals(action)) {
            Scheduler.handleAction(context, intent);
            return;
        }
        if (ACTION_QUIET.equals(action)) {
            Scheduler.handleQuiet(context, intent);
            return;
        }
        Scheduler.fireDue(context);
    }
}
