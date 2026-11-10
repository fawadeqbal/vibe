package dev.fawadiqbal.vibe.calls;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.PorterDuff;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Vibe's own incoming-call screen, over the lock screen: their photo, name,
 * Decline, Message (a quick reply) and Answer. Only Answer opens Vibe. When
 * the call ends some other way it says so for a moment and closes itself.
 * (The design: "Incoming calls with Vibe closed" on the canvas.)
 */
public class IncomingCallActivity extends Activity {
    private static final String[] QUICK_REPLIES = {"Can't talk now", "Call me in 10 min", "Text me instead"};

    private final Handler main = new Handler(Looper.getMainLooper());
    private Call call;
    private TextView sub;
    private TextView pill;
    private LinearLayout buttons;
    private ImageView photo;
    private ImageView backdrop;
    private boolean done;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        call = Call.fromBundle(getIntent().getExtras());
        if (call == null) {
            finish();
            return;
        }
        // Answer on the notification banner: straight into Vibe, no screen in between.
        if (IncomingCalls.ACTION_ANSWER.equals(getIntent().getAction())) {
            if (!IncomingCalls.isOver(call)) IncomingCalls.answer(this, call);
            finish();
            return;
        }
        // Tapped after it ended (or a late full-screen intent): nothing to show.
        if (IncomingCalls.isOver(call)) {
            finish();
            return;
        }
        overLockScreen();
        setContentView(build());
        IncomingCalls.attach(this);
        loadPhoto(call.avatar);
        main.postDelayed(() -> ended(call.id, "no_answer"), Math.max(1000, call.msLeft()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Call c = Call.fromBundle(intent.getExtras());
        if (c != null && IncomingCalls.ACTION_ANSWER.equals(intent.getAction()) && !IncomingCalls.isOver(c)) {
            done = true;
            IncomingCalls.answer(this, c);
            finishAndRemoveTask();
        }
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        IncomingCalls.detach(this);
        super.onDestroy();
    }

    /** The call ended without this screen (they hung up, it rang out, answered elsewhere…). */
    void ended(String callId, String reason) {
        main.post(() -> {
            if (done || call == null || !call.id.equals(callId)) return;
            done = true;
            IncomingCalls.cancel(this, callId);
            String line;
            switch (reason == null ? "" : reason) {
                case "cancelled":
                    line = call.firstName() + " hung up";
                    break;
                case "no_answer":
                    line = "Missed call";
                    break;
                case "accepted":
                    line = "Answered on another device";
                    break;
                case "declined":
                    line = "Declined";
                    break;
                default:
                    line = "Call ended";
            }
            sub.setText(line);
            buttons.animate().alpha(0f).setDuration(200).start();
            buttons.setEnabled(false);
            for (int i = 0; i < buttons.getChildCount(); i++) buttons.getChildAt(i).setEnabled(false);
            pill.setVisibility(View.VISIBLE);
            main.postDelayed(this::finishAndRemoveTask, 1600);
        });
    }

    /** Declined or answered from the notification banner: close without a word. */
    void close(String callId) {
        main.post(() -> {
            if (call == null || !call.id.equals(callId)) return;
            done = true;
            finishAndRemoveTask();
        });
    }

    private void onDecline(String reply) {
        if (done) return;
        done = true;
        IncomingCalls.decline(getApplicationContext(), call, reply, null);
        finishAndRemoveTask();
    }

    private void onAnswer() {
        if (done) return;
        done = true;
        IncomingCalls.answer(this, call);
        finishAndRemoveTask();
    }

    private void onMessage() {
        if (done) return;
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Reply to " + call.firstName())
                .setItems(QUICK_REPLIES, (d, which) -> onDecline(QUICK_REPLIES[which]))
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void overLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
            w.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    // ── The screen ──────────────────────────────────────────────────────

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        return t;
    }

    private View build() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF0B0A10);

        // Their photo, blurred and dark, behind everything.
        backdrop = new ImageView(this);
        backdrop.setScaleType(ImageView.ScaleType.CENTER_CROP);
        backdrop.setColorFilter(0xB3000000, PorterDuff.Mode.SRC_ATOP);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) backdrop.setRenderEffect(RenderEffect.createBlurEffect(dp(28), dp(28), Shader.TileMode.CLAMP));
        root.addView(backdrop, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(24), dp(48), dp(24), dp(56));
        root.addView(col, new FrameLayout.LayoutParams(-1, -1));

        col.addView(text(call.video ? "Vibe · video call" : "Vibe · voice call", 13, 0xB3FFFFFF, false));

        // The photo (their initial until it loads), with a soft green ring.
        FrameLayout avatar = new FrameLayout(this);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(0x1F34D399);
        avatar.setBackground(ring);
        avatar.setPadding(dp(14), dp(14), dp(14), dp(14));
        FrameLayout disc = new FrameLayout(this);
        GradientDrawable discBg = new GradientDrawable();
        discBg.setShape(GradientDrawable.OVAL);
        discBg.setColor(0xFF2A2438);
        disc.setBackground(discBg);
        TextView initial = text(call.name.substring(0, 1).toUpperCase(), 48, Color.WHITE, true);
        disc.addView(initial, new FrameLayout.LayoutParams(-1, -1));
        photo = new ImageView(this);
        photo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        photo.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setOval(0, 0, view.getWidth(), view.getHeight());
            }
        });
        photo.setClipToOutline(true);
        disc.addView(photo, new FrameLayout.LayoutParams(-1, -1));
        avatar.addView(disc, new FrameLayout.LayoutParams(dp(132), dp(132)));
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(-2, -2);
        ap.topMargin = dp(64);
        col.addView(avatar, ap);

        TextView name = text(call.name, 30, Color.WHITE, true);
        name.setMaxLines(1);
        name.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-1, -2);
        np.topMargin = dp(18);
        col.addView(name, np);

        sub = text(call.video ? "Incoming video call…" : "Incoming voice call…", 15, 0xC7FFFFFF, false);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, -2);
        sp.topMargin = dp(6);
        col.addView(sub, sp);

        View spacer = new View(this);
        col.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

        pill = text("Call ended", 14, Color.WHITE, true);
        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setCornerRadius(dp(22));
        pillBg.setColor(0x80000000);
        pill.setBackground(pillBg);
        pill.setPadding(dp(18), dp(11), dp(18), dp(11));
        pill.setVisibility(View.GONE);
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(-2, -2);
        pp.bottomMargin = dp(24);
        col.addView(pill, pp);

        buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER_VERTICAL);
        buttons.addView(control(R.drawable.vibe_ic_call_end, "Decline", 0xFFEF4444, 68, v -> onDecline(null)), weight());
        buttons.addView(control(R.drawable.vibe_ic_message, "Message", 0x29FFFFFF, 56, v -> onMessage()), weight());
        buttons.addView(control(call.video ? R.drawable.vibe_ic_videocam : R.drawable.vibe_ic_call, "Answer", 0xFF22C55E, 68, v -> onAnswer()), weight());
        col.addView(buttons, new LinearLayout.LayoutParams(-1, -2));
        return root;
    }

    private LinearLayout.LayoutParams weight() {
        return new LinearLayout.LayoutParams(0, -2, 1f);
    }

    private View control(int icon, String label, int color, int size, View.OnClickListener onClick) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout circle = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(color);
        circle.setBackground(bg);
        circle.setContentDescription(label);
        circle.setClickable(true);
        circle.setFocusable(true);
        circle.setOnClickListener(onClick);
        ImageView i = new ImageView(this);
        i.setImageResource(icon);
        i.setColorFilter(Color.WHITE);
        FrameLayout.LayoutParams ip = new FrameLayout.LayoutParams(dp(30), dp(30), Gravity.CENTER);
        circle.addView(i, ip);
        c.addView(circle, new LinearLayout.LayoutParams(dp(size), dp(size)));
        TextView t = text(label, 13, 0xE0FFFFFF, false);
        t.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-2, -2);
        tp.topMargin = dp(8);
        c.addView(t, tp);
        return c;
    }

    private void loadPhoto(String url) {
        if (url == null || !url.startsWith("http")) return;
        new Thread(() -> {
            HttpURLConnection http = null;
            try {
                http = (HttpURLConnection) new URL(url).openConnection();
                http.setConnectTimeout(8000);
                http.setReadTimeout(8000);
                try (InputStream in = http.getInputStream()) {
                    Bitmap b = BitmapFactory.decodeStream(in);
                    if (b != null) main.post(() -> {
                        photo.setImageBitmap(b);
                        backdrop.setImageBitmap(b);
                    });
                }
            } catch (Exception ignored) {
                // Their initial stays.
            } finally {
                if (http != null) http.disconnect();
            }
        }, "vibe-call-photo").start();
    }
}
