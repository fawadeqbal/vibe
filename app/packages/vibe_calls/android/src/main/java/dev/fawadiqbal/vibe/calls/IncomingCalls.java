package dev.fawadiqbal.vibe.calls;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;

import org.json.JSONObject;

import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Incoming calls with Vibe in the background or closed, like WhatsApp: the
 * call notification (the system's call style, with the ringtone) and its
 * full-screen [IncomingCallActivity] over the lock screen. Vibe itself only
 * opens on Answer. Every ending stops it: [stop] (the server's call.stop push
 * or the app's socket), Decline, Answer, or ringing out.
 */
final class IncomingCalls {
    private static final String TAG = "VibeCalls";
    /** The same channel call_ringer.dart creates (ringtone, max importance). */
    static final String CHANNEL = "calls";
    static final String ACTION_SHOW = "dev.fawadiqbal.vibe.calls.SHOW";
    static final String ACTION_ANSWER = "dev.fawadiqbal.vibe.calls.ANSWER";
    static final String ACTION_DECLINE = "dev.fawadiqbal.vibe.calls.DECLINE";
    /** On the intent that opens Vibe after Answer: the call id. */
    static final String EXTRA_ANSWER = "vibe_call_answer";

    /** Calls that have ended (newest last): a late tap or a late push never rings them again. */
    private static final Set<String> ended = Collections.synchronizedSet(new LinkedHashSet<>());
    private static WeakReference<IncomingCallActivity> screen = new WeakReference<>(null);
    /** Answered, waiting for Dart to take it (VibeCallsPlugin.takeAnswered): the call id and its push data. */
    static volatile String[] answered;

    private IncomingCalls() {}

    static boolean isOver(Call c) {
        return ended.contains(c.id) || c.msLeft() <= 0;
    }

    static void attach(IncomingCallActivity a) {
        screen = new WeakReference<>(a);
    }

    static void detach(IncomingCallActivity a) {
        if (screen.get() == a) screen = new WeakReference<>(null);
    }

    /** Rings: the call notification and, when the phone is locked or idle, the full-screen call screen. */
    static boolean show(Context ctx, Call c) {
        if (isOver(c)) return true; // over before it reached us: nothing to ring
        try {
            ensureChannel(ctx);
            PendingIntent full = PendingIntent.getActivity(ctx, c.notificationId(), screenIntent(ctx, c, ACTION_SHOW), flags());
            PendingIntent answer = PendingIntent.getActivity(ctx, c.notificationId() + 1, screenIntent(ctx, c, ACTION_ANSWER), flags());
            Intent d = new Intent(ctx, CallActionReceiver.class).setAction(ACTION_DECLINE).putExtras(c.toBundle());
            PendingIntent decline = PendingIntent.getBroadcast(ctx, c.notificationId() + 2, d, flags());

            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                    .setSmallIcon(ctx.getApplicationInfo().icon)
                    .setContentTitle(c.name)
                    .setContentText(c.video ? "Incoming video call · Vibe" : "Incoming voice call · Vibe")
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setOngoing(true)
                    .setAutoCancel(false)
                    .setTimeoutAfter(c.msLeft())
                    .setContentIntent(full)
                    .setFullScreenIntent(full, true);
            try {
                Person caller = new Person.Builder().setName(c.name).setImportant(true).build();
                b.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer).setIsVideo(c.video));
            } catch (RuntimeException e) {
                b.addAction(0, "Decline", decline).addAction(0, "Answer", answer);
            }
            Notification n = b.build();
            // The ringtone keeps going until it's answered, declined, stopped or rings out.
            n.flags |= Notification.FLAG_INSISTENT;
            NotificationManagerCompat.from(ctx).notify(c.notificationId(), n);
            return true;
        } catch (SecurityException e) {
            Log.w(TAG, "can't post the call notification: " + e.getMessage());
            return false;
        } catch (RuntimeException e) {
            Log.w(TAG, "call notification failed: " + e.getMessage());
            return false;
        }
    }

    /**
     * The call is over however it ended (`reason`: cancelled, no_answer,
     * declined, accepted, or ended): the ring stops, and a call screen on it
     * says so for a moment and closes.
     */
    static void stop(Context ctx, String callId, String reason) {
        markEnded(callId);
        cancel(ctx, callId);
        IncomingCallActivity a = screen.get();
        if (a != null) a.ended(callId, reason);
    }

    private static void closeScreen(String callId) {
        IncomingCallActivity a = screen.get();
        if (a != null) a.close(callId);
    }

    static void cancel(Context ctx, String callId) {
        try {
            NotificationManagerCompat.from(ctx).cancel(Call.notificationId(callId));
        } catch (RuntimeException ignored) {
        }
    }

    private static void markEnded(String callId) {
        ended.add(callId);
        // Remember the last few only.
        synchronized (ended) {
            while (ended.size() > 32) ended.remove(ended.iterator().next());
        }
    }

    /** Answer: the ring stops and Vibe opens straight into the call (over the lock screen). */
    static void answer(Context ctx, Call c) {
        markEnded(c.id);
        cancel(ctx, c.id);
        closeScreen(c.id);
        answered = new String[] {c.id, c.payload};
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) return;
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launch.putExtra(EXTRA_ANSWER, c.id);
        // MainActivity shows itself over the lock screen when opened by a call.
        launch.putExtra("payload", c.payload);
        ctx.startActivity(launch);
    }

    /** Decline (optionally with a quick reply): nothing opens; the caller sees Declined. */
    static void decline(Context ctx, Call c, String reply, BroadcastReceiver.PendingResult pending) {
        markEnded(c.id);
        cancel(ctx, c.id);
        closeScreen(c.id);
        new Thread(() -> {
            try {
                postDecline(c, reply);
            } finally {
                if (pending != null) pending.finish();
            }
        }, "vibe-decline").start();
    }

    private static void postDecline(Call c, String reply) {
        if (c.restBase.isEmpty() || c.to.isEmpty() || c.ack.isEmpty()) return;
        HttpURLConnection http = null;
        try {
            JSONObject body = new JSONObject().put("userId", c.to).put("t", c.ack).put("action", "decline");
            if (reply != null && !reply.trim().isEmpty()) body.put("reply", reply.trim());
            URL url = new URL(c.restBase + "/calls/" + URLEncoder.encode(c.id, "UTF-8") + "/push-action");
            http = (HttpURLConnection) url.openConnection();
            http.setRequestMethod("POST");
            http.setConnectTimeout(10_000);
            http.setReadTimeout(10_000);
            http.setDoOutput(true);
            http.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = http.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            http.getResponseCode();
        } catch (Exception e) {
            Log.w(TAG, "decline failed: " + e.getMessage());
        } finally {
            if (http != null) http.disconnect();
        }
    }

    static Intent screenIntent(Context ctx, Call c, String action) {
        return new Intent(ctx, IncomingCallActivity.class)
                .setAction(action)
                .putExtras(c.toBundle())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
    }

    private static int flags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }

    /** call_ringer.dart creates it first; this only covers a phone where it never ran. */
    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Calls", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Friends calling you");
        ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }
}
