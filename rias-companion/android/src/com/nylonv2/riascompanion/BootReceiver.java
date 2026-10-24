package com.nylonv2.riascompanion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms are wiped on reboot and app update, so re-arm the next reminder. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Scheduler.scheduleNext(context);
        RiasWidget.update(context);
        RiasChatWidget.update(context);
        // "Hey Rias" again (Android 14+ only allows that once the app is opened).
        String wake = WakeService.mode(context);
        if (!"off".equals(wake)) WakeService.setMode(context, wake);
    }
}
