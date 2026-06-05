package com.kura.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Wipe the splash-screen window background so the strip exposed when
        // the soft keyboard opens shows the app colour, not the K-on-black splash.
        getWindow().setBackgroundDrawableResource(R.color.kuraWindowBg);
    }
}
