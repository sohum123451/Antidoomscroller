package com.checkpoint.app

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
    private var optionButtons = mutableListOf<Button>()
    private val handler = Handler(Looper.getMainLooper())

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
        tvHeaderReason.text = if (reason == "chat") "Chat checkpoint" else "Next reel"

        btnContinue.setOnClickListener {
            finish()
        }

        loadNextQuestion()
    }

    private fun loadNextQuestion() {
        answered = false
        tvExplanation.visibility = View.GONE
        btnContinue.visibility = View.GONE
        tvQuestionStem.text = "Loading question..."
        containerOptions.removeAllViews()
        optionButtons.clear()

        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val mode = prefs.getString("mode", "jee") ?: "jee"
        val apiUrl = prefs.getString("api_url", ApiClient.DEFAULT_API_URL)
        val authToken = prefs.getString("auth_token", null)

        lifecycleScope.launch {
            val q = ApiClient.getQuestion(this@QuestionOverlayActivity, apiUrl, authToken, mode)
            displayQuestion(q, apiUrl, authToken)
        }
    }

    private fun displayQuestion(q: QuestionItem, apiUrl: String?, authToken: String?) {
        currentQuestion = q
        tvTopic.text = q.label
        tvQuestionStem.text = q.stem
        containerOptions.removeAllViews()
        optionButtons.clear()

        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val answerDelaySec = prefs.getFloat("answer_delay_sec", 1.2f)
        val requireNewOnWrong = prefs.getBoolean("require_new_on_wrong", true)
        val delayMs = (answerDelaySec * 1000).toLong()

        val labels = listOf("A", "B", "C", "D")

        q.options.forEachIndexed { index, optionText ->
            val btn = Button(this).apply {
                text = "${labels.getOrElse(index) { "" }}.  $optionText"
                textSize = 15f
                setTextColor(Color.parseColor("#16223D"))
                setBackgroundColor(Color.parseColor("#F0F4FA"))
                setPadding(32, 24, 32, 24)
                isAllCaps = false
                isEnabled = delayMs <= 0 // Initially disabled if answer delay is configured

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

                    // Highlight choices
                    if (isCorrect) {
                        setBackgroundColor(Color.parseColor("#D1E7DD"))
                        setTextColor(Color.parseColor("#0F5132"))
                    } else {
                        setBackgroundColor(Color.parseColor("#F8D7DA"))
                        setTextColor(Color.parseColor("#842029"))

                        // Highlight correct one in soft green
                        val correctBtn = optionButtons.getOrNull(q.answerIndex)
                        correctBtn?.setBackgroundColor(Color.parseColor("#D1E7DD"))
                        correctBtn?.setTextColor(Color.parseColor("#0F5132"))
                    }

                    tvExplanation.visibility = View.VISIBLE
                    tvExplanation.text = (if (isCorrect) "✓ Correct!\n\n" else "✗ Incorrect.\n\n") + q.explanation

                    if (!isCorrect && requireNewOnWrong) {
                        btnContinue.text = "Try Another Question"
                        btnContinue.visibility = View.VISIBLE
                        btnContinue.setOnClickListener {
                            loadNextQuestion()
                        }
                    } else {
                        btnContinue.text = "Continue to App"
                        btnContinue.visibility = View.VISIBLE
                        btnContinue.setOnClickListener {
                            finish()
                        }
                    }

                    // Save local stats
                    updateLocalStats(isCorrect)

                    // Report attempt to server
                    lifecycleScope.launch {
                        ApiClient.recordAnswer(apiUrl, authToken, q.id, index, isCorrect)
                    }
                }
            }
            optionButtons.add(btn)
            containerOptions.addView(btn)
        }

        // Handle answer delay timer to stop reflex tapping
        if (delayMs > 0) {
            val countdownView = TextView(this).apply {
                text = "Answers unlock in ${String.format("%.1f", answerDelaySec)}s"
                setTextColor(Color.parseColor("#8E99AF"))
                textSize = 12f
                textAlignment = View.TEXT_ALIGNMENT_CENTER
                val params = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 8, 0, 8)
                }
                layoutParams = params
            }
            containerOptions.addView(countdownView)

            handler.postDelayed({
                optionButtons.forEach { it.isEnabled = true }
                countdownView.visibility = View.GONE
            }, delayMs)
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

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
    }
}
