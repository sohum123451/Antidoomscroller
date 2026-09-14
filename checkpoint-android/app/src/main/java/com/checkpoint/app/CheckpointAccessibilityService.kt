package com.checkpoint.app

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.view.accessibility.AccessibilityEvent

class CheckpointAccessibilityService : AccessibilityService() {

    private var lastGateTime: Long = 0
    private var reelCount: Int = 0
    private var chatSessionStart: Long = 0
    private var currentChatPackage: String? = null

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val pkgName = event.packageName?.toString() ?: return
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)

        // Master toggle
        val isEnabled = prefs.getBoolean("enabled", true)
        if (!isEnabled) return

        // Check if this specific app is enabled by user
        if (!isAppEnabled(pkgName, prefs)) return

        val currentTime = System.currentTimeMillis()
        val isChatApp = pkgName.contains("whatsapp") || pkgName.contains("snapchat")

        if (isChatApp) {
            handleChatEvent(pkgName, currentTime, prefs)
        } else {
            handleReelEvent(pkgName, event.eventType, currentTime, prefs)
        }
    }

    private fun isAppEnabled(pkgName: String, prefs: android.content.SharedPreferences): Boolean {
        return when {
            pkgName.contains("instagram") -> prefs.getBoolean("gate_instagram", true)
            pkgName.contains("youtube") -> prefs.getBoolean("gate_youtube", true)
            pkgName.contains("musically") -> prefs.getBoolean("gate_tiktok", true)
            pkgName.contains("whatsapp") -> prefs.getBoolean("gate_whatsapp", true)
            pkgName.contains("snapchat") -> prefs.getBoolean("gate_snapchat", true)
            else -> false
        }
    }

    private fun handleReelEvent(
        pkgName: String,
        eventType: Int,
        currentTime: Long,
        prefs: android.content.SharedPreferences
    ) {
        val reelsPerQuestion = prefs.getInt("reels_per_question", 1)
        val cooldownMs = 8_000L // Minimum cooldown between gates

        if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
            eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
            eventType == AccessibilityEvent.TYPE_VIEW_SCROLLED
        ) {
            // Count scrolls/reels
            reelCount++

            if (reelCount >= reelsPerQuestion && (currentTime - lastGateTime > cooldownMs)) {
                reelCount = 0
                lastGateTime = currentTime
                launchQuestionGate(pkgName, "reel")
            }
        }
    }

    private fun handleChatEvent(
        pkgName: String,
        currentTime: Long,
        prefs: android.content.SharedPreferences
    ) {
        val chatMinutes = prefs.getInt("chat_minutes", 5)
        val targetMs = chatMinutes * 60_000L

        if (currentChatPackage != pkgName) {
            currentChatPackage = pkgName
            chatSessionStart = currentTime
            return
        }

        val elapsed = currentTime - chatSessionStart
        if (elapsed >= targetMs && (currentTime - lastGateTime > 30_000L)) {
            chatSessionStart = currentTime
            lastGateTime = currentTime
            launchQuestionGate(pkgName, "chat")
        }
    }

    private fun launchQuestionGate(pkgName: String, reason: String) {
        val intent = Intent(this, QuestionOverlayActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("pkg_name", pkgName)
            putExtra("reason", reason)
        }
        startActivity(intent)
    }

    override fun onInterrupt() {
        // Required method override
    }
}
