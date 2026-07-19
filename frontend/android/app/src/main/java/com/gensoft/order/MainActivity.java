package com.gensoft.order;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RepTrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
