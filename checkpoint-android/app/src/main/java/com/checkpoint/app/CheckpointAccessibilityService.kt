package com.checkpoint.app

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent

class CheckpointAccessibilityService : AccessibilityService() {

    private var lastTriggerTime: Long = 0
    private var reelsSeen = 0

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val pkgName = event.packageName?.toString() ?: return
        val eventType = event.eventType

        if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            val currentTime = System.currentTimeMillis()

            // Trigger overlay if at least 15 seconds have passed since last gate
            if (currentTime - lastTriggerTime > 15_000) {
                if (isTargetApp(pkgName)) {
                    lastTriggerTime = currentTime
                    launchQuestionGate(pkgName)
                }
            }
        }
    }

    private fun isTargetApp(pkgName: String): Boolean {
        return pkgName.contains("instagram") ||
                pkgName.contains("youtube") ||
                pkgName.contains("musically") || // TikTok
                pkgName.contains("whatsapp") ||
                pkgName.contains("snapchat")
    }

    private fun launchQuestionGate(pkgName: String) {
        val intent = Intent(this, QuestionOverlayActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("pkg_name", pkgName)
            putExtra("reason", if (pkgName.contains("whatsapp") || pkgName.contains("snapchat")) "chat" else "reel")
        }
        startActivity(intent)
    }

    override fun onInterrupt() {
        // Required method override
    }
}
