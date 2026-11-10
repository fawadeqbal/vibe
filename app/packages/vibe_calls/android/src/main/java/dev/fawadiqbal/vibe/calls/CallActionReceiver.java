package dev.fawadiqbal.vibe.calls;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Decline on the call notification's banner: tells the server (no session needed) and stops the ring. */
public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!IncomingCalls.ACTION_DECLINE.equals(intent.getAction())) return;
        Call c = Call.fromBundle(intent.getExtras());
        if (c == null) return;
        IncomingCalls.decline(context.getApplicationContext(), c, null, goAsync());
    }
}
