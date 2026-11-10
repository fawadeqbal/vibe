package dev.fawadiqbal.vibe.calls;

import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

import androidx.annotation.NonNull;

import java.util.HashMap;
import java.util.Map;

import io.flutter.embedding.engine.plugins.FlutterPlugin;
import io.flutter.embedding.engine.plugins.activity.ActivityAware;
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding;
import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;
import io.flutter.plugin.common.PluginRegistry;

/**
 * `vibe/calls`: the incoming-call screen (works from the push's background
 * isolate too, so a call rings with Vibe closed) and the proximity sensor.
 * Dart side: packages/vibe_calls/lib/vibe_calls.dart.
 */
public class VibeCallsPlugin implements FlutterPlugin, MethodChannel.MethodCallHandler, ActivityAware, PluginRegistry.NewIntentListener {
    private MethodChannel channel;
    private Context context;
    private ActivityPluginBinding activity;
    private static PowerManager.WakeLock proximity;

    @Override
    public void onAttachedToEngine(@NonNull FlutterPluginBinding binding) {
        context = binding.getApplicationContext();
        channel = new MethodChannel(binding.getBinaryMessenger(), "vibe/calls");
        channel.setMethodCallHandler(this);
    }

    @Override
    public void onDetachedFromEngine(@NonNull FlutterPluginBinding binding) {
        channel.setMethodCallHandler(null);
        channel = null;
    }

    @Override
    public void onMethodCall(@NonNull MethodCall call, @NonNull MethodChannel.Result result) {
        try {
            switch (call.method) {
                case "show": {
                    Call c = call.arguments instanceof Map ? Call.fromMap((Map<?, ?>) call.arguments) : null;
                    result.success(c != null && IncomingCalls.show(context, c));
                    return;
                }
                case "stop": {
                    String id = call.argument("callId");
                    String reason = call.argument("reason");
                    if (id != null) IncomingCalls.stop(context, id, reason);
                    result.success(null);
                    return;
                }
                case "takeAnswered": {
                    String[] a = IncomingCalls.answered;
                    IncomingCalls.answered = null;
                    if (a == null) {
                        result.success(null);
                    } else {
                        Map<String, String> m = new HashMap<>();
                        m.put("callId", a[0]);
                        m.put("payload", a[1]);
                        result.success(m);
                    }
                    return;
                }
                case "proximity":
                    result.success(setProximity(Boolean.TRUE.equals(call.argument("on"))));
                    return;
                default:
                    result.notImplemented();
            }
        } catch (RuntimeException e) {
            result.error("vibe_calls", e.getMessage(), null);
        }
    }

    /**
     * On the earpiece in a voice call: the screen turns off while the phone is
     * at your ear (so your cheek can't tap Mute or End), and back on away from
     * it. False when the phone has no proximity sensor.
     */
    private boolean setProximity(boolean on) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (pm == null) return false;
        synchronized (VibeCallsPlugin.class) {
            if (on) {
                if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return false;
                if (proximity == null) {
                    proximity = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "vibe:proximity");
                    proximity.setReferenceCounted(false);
                }
                // A safety limit: a call never holds it longer than this.
                if (!proximity.isHeld()) proximity.acquire(4 * 60 * 60 * 1000L);
                return true;
            }
            // Wait for the phone to leave the ear before the screen comes back on.
            if (proximity != null && proximity.isHeld()) proximity.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY);
            return true;
        }
    }

    // ── Answer opens Vibe: hand the call to Dart ─────────────────────────

    @Override
    public void onAttachedToActivity(@NonNull ActivityPluginBinding binding) {
        activity = binding;
        binding.addOnNewIntentListener(this);
        readAnswer(binding.getActivity().getIntent(), false);
    }

    @Override
    public void onDetachedFromActivityForConfigChanges() {
        onDetachedFromActivity();
    }

    @Override
    public void onReattachedToActivityForConfigChanges(@NonNull ActivityPluginBinding binding) {
        onAttachedToActivity(binding);
    }

    @Override
    public void onDetachedFromActivity() {
        if (activity != null) activity.removeOnNewIntentListener(this);
        activity = null;
    }

    @Override
    public boolean onNewIntent(@NonNull Intent intent) {
        readAnswer(intent, true);
        return false;
    }

    private void readAnswer(Intent intent, boolean running) {
        if (intent == null) return;
        String id = intent.getStringExtra(IncomingCalls.EXTRA_ANSWER);
        if (id == null) return;
        intent.removeExtra(IncomingCalls.EXTRA_ANSWER);
        IncomingCalls.answered = new String[] {id, intent.getStringExtra("payload")};
        // Vibe was already running: tell it now (it takes the call with takeAnswered).
        if (running && channel != null) channel.invokeMethod("answered", id);
    }
}
