package com.pingcrood.vibe_app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannels()
        showOverLockScreenForCall(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        showOverLockScreenForCall(intent)
    }

    /** Back to normal once Vibe leaves the screen: the lock screen shows again next time. */
    override fun onStop() {
        super.onStop()
        setLockScreenFlags(false)
    }

    /**
     * Opened by an incoming-call notification (its full-screen intent or
     * Answer, from call_ringer.dart): show the call over the lock screen and
     * wake the screen, like a phone call. Only for that; [onStop] undoes it.
     */
    private fun showOverLockScreenForCall(intent: Intent?) {
        val payload = intent?.getStringExtra("payload") ?: return
        if (payload.contains("\"open\":\"call\"")) setLockScreenFlags(true)
    }

    private fun setLockScreenFlags(on: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(on)
            setTurnScreenOn(on)
        } else {
            @Suppress("DEPRECATION")
            val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            if (on) window.addFlags(flags) else window.clearFlags(flags)
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Invite attribution: the Play Store install referrer
        // ("vibe_ref=CODE&utm_source=S" from the landing page's Play link).
        // The Dart side asks once, on the first launch (InviteCapture).
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "vibe/install_referrer").setMethodCallHandler { call, result ->
            if (call.method == "get") readInstallReferrer(result) else result.notImplemented()
        }
        // Settings → Devices: "Samsung SM-A515F · Android 13" (sent once as X-Device).
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "vibe/device").setMethodCallHandler { call, result ->
            if (call.method == "name") result.success(deviceName()) else result.notImplemented()
        }
    }

    private fun deviceName(): String {
        val maker = Build.MANUFACTURER.orEmpty().replaceFirstChar { it.uppercase() }
        val model = Build.MODEL.orEmpty()
        val name = if (model.startsWith(maker, ignoreCase = true)) model else "$maker $model".trim()
        return "$name · Android ${Build.VERSION.RELEASE}"
    }

    /** Answers with the referrer string, or null when there is none / Play can't tell. Never errors. */
    private fun readInstallReferrer(result: MethodChannel.Result) {
        val client = try {
            InstallReferrerClient.newBuilder(applicationContext).build()
        } catch (e: Exception) {
            result.success(null)
            return
        }
        var answered = false
        fun answer(value: String?) {
            if (answered) return
            answered = true
            runOnUiThread { result.success(value) }
            try { client.endConnection() } catch (_: Exception) {}
        }
        try {
            client.startConnection(object : InstallReferrerStateListener {
                override fun onInstallReferrerSetupFinished(responseCode: Int) {
                    if (responseCode != InstallReferrerClient.InstallReferrerResponse.OK) {
                        answer(null) // FEATURE_NOT_SUPPORTED, SERVICE_UNAVAILABLE, DEVELOPER_ERROR…
                        return
                    }
                    val referrer = try { client.installReferrer?.installReferrer } catch (_: Exception) { null }
                    answer(referrer)
                }

                override fun onInstallReferrerServiceDisconnected() = answer(null)
            })
        } catch (e: Exception) {
            answer(null)
        }
    }

    /**
     * Push notification channels. Ids match the server's `category`
     * (push-sender.ts sends it as the FCM `channel_id`), so people can mute
     * each kind separately in system settings. Creating them is idempotent.
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channels = listOf(
            NotificationChannel("messages", "Messages", NotificationManager.IMPORTANCE_HIGH).apply { description = "New messages from your friends" },
            NotificationChannel("social", "Friends", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Friend requests, new friends and invites" },
            NotificationChannel("payments", "Payments", NotificationManager.IMPORTANCE_HIGH).apply { description = "Purchases and cash-outs" },
            NotificationChannel("inbox", "News from Vibe", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Messages from the Vibe team" },
            NotificationChannel("engagement", "Streaks and Vibe Hour", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Streaks about to end, Vibe Hour, your weekly recap" },
        )
        manager.createNotificationChannels(channels)
    }
}
