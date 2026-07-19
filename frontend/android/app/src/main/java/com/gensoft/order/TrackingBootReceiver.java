package com.gensoft.order;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.content.ContextCompat;

public class TrackingBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (
            !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())
        ) {
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(
            RepLocationService.PREFS,
            Context.MODE_PRIVATE
        );
        if (!prefs.getBoolean("enabled", false)) return;
        Intent service = new Intent(context, RepLocationService.class);
        service.setAction(RepLocationService.ACTION_START);
        ContextCompat.startForegroundService(context, service);
    }
}
