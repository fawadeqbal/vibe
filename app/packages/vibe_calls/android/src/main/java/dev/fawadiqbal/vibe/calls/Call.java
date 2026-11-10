package dev.fawadiqbal.vibe.calls;

import android.os.Bundle;

import java.util.Map;

/** One incoming call, as the push carried it (see call_ringer.dart). */
final class Call {
    final String id;
    final String name;
    final String avatar;
    final boolean video;
    /** When it stops ringing (epoch ms). */
    final long expiresAt;
    /** Who is being called, and the token the push carried: Decline works without a session. */
    final String to;
    final String ack;
    /** The API base, e.g. https://api.example.com/v1. */
    final String restBase;
    /** The push data as JSON: handed to Vibe on Answer (MainActivity shows the call over the lock screen). */
    final String payload;

    private Call(String id, String name, String avatar, boolean video, long expiresAt, String to, String ack, String restBase, String payload) {
        this.id = id;
        this.name = name == null || name.trim().isEmpty() ? "Incoming call" : name.trim();
        this.avatar = avatar == null ? "" : avatar;
        this.video = video;
        this.expiresAt = expiresAt;
        this.to = to == null ? "" : to;
        this.ack = ack == null ? "" : ack;
        this.restBase = restBase == null ? "" : restBase;
        this.payload = payload == null ? "" : payload;
    }

    /** The notification id for a call: the same here, in Dart and after a restart (FNV-1a, 31 bits). */
    static int notificationId(String callId) {
        int h = 0x811c9dc5;
        for (int i = 0; i < callId.length(); i++) {
            h ^= callId.charAt(i);
            h *= 0x01000193;
        }
        return h & 0x7fffffff;
    }

    int notificationId() {
        return notificationId(id);
    }

    /** First name, for "Sana hung up". */
    String firstName() {
        String[] parts = name.split("\\s+");
        return parts.length == 0 ? name : parts[0];
    }

    long msLeft() {
        return expiresAt - System.currentTimeMillis();
    }

    static Call fromMap(Map<?, ?> m) {
        Object id = m.get("callId");
        if (id == null) return null;
        Object exp = m.get("expiresAt");
        long expiresAt = exp instanceof Number ? ((Number) exp).longValue() : System.currentTimeMillis() + 30_000;
        return new Call(String.valueOf(id), str(m.get("name")), str(m.get("avatar")), Boolean.TRUE.equals(m.get("video")), expiresAt,
                str(m.get("to")), str(m.get("ack")), str(m.get("restBase")), str(m.get("payload")));
    }

    static Call fromBundle(Bundle b) {
        if (b == null || b.getString("vibe_call_id") == null) return null;
        return new Call(b.getString("vibe_call_id"), b.getString("vibe_call_name"), b.getString("vibe_call_avatar"), b.getBoolean("vibe_call_video"),
                b.getLong("vibe_call_expires"), b.getString("vibe_call_to"), b.getString("vibe_call_ack"), b.getString("vibe_call_rest"), b.getString("vibe_call_payload"));
    }

    Bundle toBundle() {
        Bundle b = new Bundle();
        b.putString("vibe_call_id", id);
        b.putString("vibe_call_name", name);
        b.putString("vibe_call_avatar", avatar);
        b.putBoolean("vibe_call_video", video);
        b.putLong("vibe_call_expires", expiresAt);
        b.putString("vibe_call_to", to);
        b.putString("vibe_call_ack", ack);
        b.putString("vibe_call_rest", restBase);
        b.putString("vibe_call_payload", payload);
        return b;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
