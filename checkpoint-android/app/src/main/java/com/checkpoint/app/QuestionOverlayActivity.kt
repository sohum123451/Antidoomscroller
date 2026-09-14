package com.checkpoint.app

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class QuestionOverlayActivity : AppCompatActivity() {

    private lateinit var tvHeaderReason: TextView
    private lateinit var tvTopic: TextView
    private lateinit var tvQuestionStem: TextView
    private lateinit var containerOptions: LinearLayout
    private lateinit var tvExplanation: TextView
    private lateinit var btnContinue: Button

    private var currentQuestion: QuestionItem? = null
    private var answered = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_overlay)

        tvHeaderReason = findViewById(R.id.tvHeaderReason)
        tvTopic = findViewById(R.id.tvTopic)
        tvQuestionStem = findViewById(R.id.tvQuestionStem)
        containerOptions = findViewById(R.id.containerOptions)
        tvExplanation = findViewById(R.id.tvExplanation)
        btnContinue = findViewById(R.id.btnContinue)

        val reason = intent.getStringExtra("reason") ?: "reel"
        tvHeaderReason.text = if (reason == "chat") "Five minutes of chat" else "Next reel"

        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val mode = prefs.getString("mode", "jee") ?: "jee"
        val apiUrl = prefs.getString("api_url", "https://checkpoint-api.sohum123451.workers.dev")
        val authToken = prefs.getString("auth_token", null)

        btnContinue.setOnClickListener {
            finish()
        }

        lifecycleScope.launch {
            val q = ApiClient.getQuestion(apiUrl, authToken, mode)
            if (q != null) {
                displayQuestion(q, apiUrl, authToken)
            } else {
                finish()
            }
        }
    }

    private fun displayQuestion(q: QuestionItem, apiUrl: String?, authToken: String?) {
        currentQuestion = q
        tvTopic.text = q.label
        tvQuestionStem.text = q.stem
        containerOptions.removeAllViews()

        q.options.forEachIndexed { index, optionText ->
            val btn = Button(this).apply {
                text = "${listOf("A", "B", "C", "D").getOrElse(index) { "" }}.  $optionText"
                textSize = 15f
                setTextColor(Color.parseColor("#16223D"))
                setBackgroundColor(Color.parseColor("#F0F4FA"))
                setPadding(32, 24, 32, 24)
                isAllCaps = false
                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 0, 0, 16)
                }
                layoutParams = params

                setOnClickListener {
                    if (answered) return@setOnClickListener
                    answered = true

                    val isCorrect = index == q.answerIndex
                    if (isCorrect) {
                        setBackgroundColor(Color.parseColor("#D1E7DD"))
                        setTextColor(Color.parseColor("#0F5132"))
                    } else {
                        setBackgroundColor(Color.parseColor("#F8D7DA"))
                        setTextColor(Color.parseColor("#842029"))
                    }

                    tvExplanation.visibility = View.VISIBLE
                    tvExplanation.text = q.explanation
                    btnContinue.visibility = View.VISIBLE

                    // Save local stats
                    updateLocalStats(isCorrect)

                    // Report attempt to server
                    lifecycleScope.launch {
                        ApiClient.recordAnswer(apiUrl, authToken, q.id, index, isCorrect)
                    }
                }
            }
            containerOptions.addView(btn)
        }
    }

    private fun updateLocalStats(correct: Boolean) {
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val answeredCount = prefs.getInt("stats_answered", 0) + 1
        val correctCount = prefs.getInt("stats_correct", 0) + if (correct) 1 else 0
        val streak = if (correct) prefs.getInt("stats_streak", 0) + 1 else 0
        val bestStreak = maxOf(streak, prefs.getInt("stats_best_streak", 0))

        prefs.edit()
            .putInt("stats_answered", answeredCount)
            .putInt("stats_correct", correctCount)
            .putInt("stats_streak", streak)
            .putInt("stats_best_streak", bestStreak)
            .apply()
    }
}
