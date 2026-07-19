package com.gensoft.order;

import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RepTracking")
public class RepTrackingPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        String token = call.getString("token", "");
        String apiBase = call.getString("apiBase", "");
        int intervalSec = call.getInt("intervalSec", 30);
        int minMoveMeters = call.getInt("minMoveMeters", 50);
        if (token.isEmpty() || apiBase.isEmpty()) {
            call.reject("token and apiBase are required");
            return;
        }

        Context context = getContext();
        Intent intent = new Intent(context, RepLocationService.class);
        intent.setAction(RepLocationService.ACTION_START);
        intent.putExtra("token", token);
        intent.putExtra("apiBase", apiBase);
        intent.putExtra("intervalSec", Math.max(15, intervalSec));
        intent.putExtra("minMoveMeters", Math.max(10, minMoveMeters));
        ContextCompat.startForegroundService(context, intent);

        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, RepLocationService.class);
        intent.setAction(RepLocationService.ACTION_STOP);
        context.startService(intent);
        call.resolve();
    }
}
