package com.pingcrood.vibe_app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannels()
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
            NotificationChannel("social", "Friends", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Friend requests and new friends" },
            NotificationChannel("payments", "Payments", NotificationManager.IMPORTANCE_HIGH).apply { description = "Purchases and cash-outs" },
            NotificationChannel("inbox", "News from Vibe", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Messages from the Vibe team" },
            NotificationChannel("engagement", "Streaks and Vibe Hour", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Streaks about to end, Vibe Hour, your weekly recap" },
        )
        manager.createNotificationChannels(channels)
    }
}
