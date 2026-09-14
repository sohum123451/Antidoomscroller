package com.checkpoint.app

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.material.materialswitch.MaterialSwitch
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private val WEB_CLIENT_ID = "26126776554-7qnf73gi14tes8od19jr2su54khdm774.apps.googleusercontent.com"

    private lateinit var switchMaster: MaterialSwitch
    private lateinit var btnAccessibility: Button
    private lateinit var btnOverlayPermission: Button

    private lateinit var spinnerMode: Spinner
    private lateinit var btnManageSyllabus: Button
    private lateinit var btnAddTopic: Button

    private lateinit var etReelsPerQuestion: EditText
    private lateinit var etChatMinutes: EditText
    private lateinit var etAnswerDelaySec: EditText
    private lateinit var switchRequireNewOnWrong: MaterialSwitch

    private lateinit var cbInstagram: CheckBox
    private lateinit var cbYouTube: CheckBox
    private lateinit var cbTikTok: CheckBox
    private lateinit var cbWhatsApp: CheckBox
    private lateinit var cbSnapchat: CheckBox

    private lateinit var etApiUrl: EditText
    private lateinit var btnResetApiUrl: Button
    private lateinit var btnCheckConnection: Button
    private lateinit var tvConnectionStatus: TextView
    private lateinit var tvAccountStatus: TextView
    private lateinit var tvQuotaInfo: TextView
    private lateinit var btnSignIn: Button
    private lateinit var layoutAuthActions: LinearLayout
    private lateinit var btnSwitchAccount: Button
    private lateinit var btnSignOut: Button

    private lateinit var tvAnswered: TextView
    private lateinit var tvAccuracy: TextView
    private lateinit var tvStreak: TextView
    private lateinit var btnClearRecord: Button

    private lateinit var googleSignInClient: GoogleSignInClient

    private val signInLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            handleGoogleSignInSuccess(account)
        } catch (e: ApiException) {
            val errMsg = "Google sign-in error (${e.statusCode}). You can also enter your account email directly."
            Toast.makeText(this, errMsg, Toast.LENGTH_LONG).show()
            showManualEmailDialog(e.statusCode)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupGoogleSignIn()
        setupPermissions()
        setupGatingControls()
        setupServerControls()
        setupSyllabusControls()
        setupStatsControls()

        loadSavedSettings()
        updateDashboard()
    }

    override fun onResume() {
        super.onResume()
        updateDashboard()
    }

    private fun initViews() {
        switchMaster = findViewById(R.id.switchMaster)
        btnAccessibility = findViewById(R.id.btnAccessibility)
        btnOverlayPermission = findViewById(R.id.btnOverlayPermission)

        spinnerMode = findViewById(R.id.spinnerMode)
        btnManageSyllabus = findViewById(R.id.btnManageSyllabus)
        btnAddTopic = findViewById(R.id.btnAddTopic)

        etReelsPerQuestion = findViewById(R.id.etReelsPerQuestion)
        etChatMinutes = findViewById(R.id.etChatMinutes)
        etAnswerDelaySec = findViewById(R.id.etAnswerDelaySec)
        switchRequireNewOnWrong = findViewById(R.id.switchRequireNewOnWrong)

        cbInstagram = findViewById(R.id.cbInstagram)
        cbYouTube = findViewById(R.id.cbYouTube)
        cbTikTok = findViewById(R.id.cbTikTok)
        cbWhatsApp = findViewById(R.id.cbWhatsApp)
        cbSnapchat = findViewById(R.id.cbSnapchat)

        etApiUrl = findViewById(R.id.etApiUrl)
        btnResetApiUrl = findViewById(R.id.btnResetApiUrl)
        btnCheckConnection = findViewById(R.id.btnCheckConnection)
        tvConnectionStatus = findViewById(R.id.tvConnectionStatus)
        tvAccountStatus = findViewById(R.id.tvAccountStatus)
        tvQuotaInfo = findViewById(R.id.tvQuotaInfo)
        btnSignIn = findViewById(R.id.btnSignIn)
        layoutAuthActions = findViewById(R.id.layoutAuthActions)
        btnSwitchAccount = findViewById(R.id.btnSwitchAccount)
        btnSignOut = findViewById(R.id.btnSignOut)

        tvAnswered = findViewById(R.id.tvAnswered)
        tvAccuracy = findViewById(R.id.tvAccuracy)
        tvStreak = findViewById(R.id.tvStreak)
        btnClearRecord = findViewById(R.id.btnClearRecord)
    }

    private fun setupGoogleSignIn() {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(WEB_CLIENT_ID)
            .requestEmail()
            .requestProfile()
            .build()
        googleSignInClient = GoogleSignIn.getClient(this, gso)
    }

    private fun setupPermissions() {
        btnAccessibility.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        btnOverlayPermission.setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            } else {
                Toast.makeText(this, "Overlay permission granted by default.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setupGatingControls() {
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)

        switchMaster.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean("enabled", isChecked).apply()
        }

        etReelsPerQuestion.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val value = s?.toString()?.toIntOrNull() ?: 1
                prefs.edit().putInt("reels_per_question", maxOf(1, value)).apply()
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        etChatMinutes.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val value = s?.toString()?.toIntOrNull() ?: 5
                prefs.edit().putInt("chat_minutes", maxOf(1, value)).apply()
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        etAnswerDelaySec.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val value = s?.toString()?.toFloatOrNull() ?: 1.2f
                prefs.edit().putFloat("answer_delay_sec", maxOf(0f, value)).apply()
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        switchRequireNewOnWrong.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean("require_new_on_wrong", isChecked).apply()
        }

        // App switches
        cbInstagram.setOnCheckedChangeListener { _, isChecked -> prefs.edit().putBoolean("gate_instagram", isChecked).apply() }
        cbYouTube.setOnCheckedChangeListener { _, isChecked -> prefs.edit().putBoolean("gate_youtube", isChecked).apply() }
        cbTikTok.setOnCheckedChangeListener { _, isChecked -> prefs.edit().putBoolean("gate_tiktok", isChecked).apply() }
        cbWhatsApp.setOnCheckedChangeListener { _, isChecked -> prefs.edit().putBoolean("gate_whatsapp", isChecked).apply() }
        cbSnapchat.setOnCheckedChangeListener { _, isChecked -> prefs.edit().putBoolean("gate_snapchat", isChecked).apply() }

        // Mode spinner
        val modes = arrayOf("JEE", "NEET", "Custom")
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, modes)
        spinnerMode.adapter = adapter
        spinnerMode.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val mode = when (position) {
                    1 -> "neet"
                    2 -> "custom"
                    else -> "jee"
                }
                prefs.edit().putString("mode", mode).apply()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    private fun setupServerControls() {
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)

        etApiUrl.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val url = s?.toString()?.trim() ?: ApiClient.DEFAULT_API_URL
                prefs.edit().putString("api_url", url).apply()
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        btnResetApiUrl.setOnClickListener {
            etApiUrl.setText(ApiClient.DEFAULT_API_URL)
            prefs.edit().putString("api_url", ApiClient.DEFAULT_API_URL).apply()
            Toast.makeText(this, "API URL reset to default", Toast.LENGTH_SHORT).show()
        }

        btnCheckConnection.setOnClickListener {
            tvConnectionStatus.visibility = View.VISIBLE
            tvConnectionStatus.text = "Checking connection…"
            tvConnectionStatus.setTextColor(Color.parseColor("#8E99AF"))

            val currentUrl = etApiUrl.text.toString().trim()
            lifecycleScope.launch {
                val (ok, message) = ApiClient.testConnection(currentUrl)
                tvConnectionStatus.text = message
                tvConnectionStatus.setTextColor(Color.parseColor(if (ok) "#1F7A54" else "#B82A2A"))
                if (ok) syncUserProfile()
            }
        }

        btnSignIn.setOnClickListener {
            showSignInOptionsDialog()
        }

        btnSwitchAccount.setOnClickListener {
            showSignInOptionsDialog()
        }

        btnSignOut.setOnClickListener {
            signOutUser()
        }
    }

    private fun showSignInOptionsDialog() {
        val options = arrayOf("Choose with Google Account Picker", "Enter or Switch Account Email")
        AlertDialog.Builder(this)
            .setTitle("Sign in to Checkpoint")
            .setItems(options) { _, which ->
                if (which == 0) {
                    // Sign out of client first so Google always displays the account chooser modal
                    googleSignInClient.signOut().addOnCompleteListener {
                        signInLauncher.launch(googleSignInClient.signInIntent)
                    }
                } else {
                    showManualEmailDialog(null)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showManualEmailDialog(errorCode: Int?) {
        val builder = AlertDialog.Builder(this)
        builder.setTitle("Account Sign In")
        val message = if (errorCode != null) {
            "Google Play Services reported code $errorCode. Enter your Google account email to sign in directly:"
        } else {
            "Enter your Google account email to sign in:"
        }
        builder.setMessage(message)

        val input = EditText(this)
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val currentEmail = prefs.getString("account_email", "")
        input.setText(currentEmail)
        input.hint = "user@example.com"
        input.setSingleLine()
        builder.setView(input)

        builder.setPositiveButton("Sign In") { _, _ ->
            val email = input.text.toString().trim()
            if (email.contains("@")) {
                prefs.edit()
                    .putString("account_email", email)
                    .putString("auth_token", "dev:$email")
                    .apply()
                Toast.makeText(this, "Signed in as $email", Toast.LENGTH_SHORT).show()
                updateDashboard()
                syncUserProfile()
            } else {
                Toast.makeText(this, "Please enter a valid email address.", Toast.LENGTH_SHORT).show()
            }
        }
        builder.setNegativeButton("Cancel", null)
        builder.show()
    }

    private fun handleGoogleSignInSuccess(account: GoogleSignInAccount) {
        val email = account.email ?: "Signed In"
        val idToken = account.idToken ?: "dev:$email"

        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("account_email", email)
            .putString("auth_token", idToken)
            .apply()

        Toast.makeText(this, "Signed in as $email", Toast.LENGTH_SHORT).show()
        updateDashboard()
        syncUserProfile()
    }

    private fun signOutUser() {
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        prefs.edit()
            .remove("account_email")
            .remove("auth_token")
            .remove("buffered_questions")
            .apply()

        googleSignInClient.signOut()
        Toast.makeText(this, "Signed out", Toast.LENGTH_SHORT).show()
        updateDashboard()
    }

    private fun syncUserProfile() {
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val apiUrl = prefs.getString("api_url", ApiClient.DEFAULT_API_URL)
        val authToken = prefs.getString("auth_token", null)

        if (!authToken.isNullOrBlank()) {
            lifecycleScope.launch {
                val profile = ApiClient.getUserProfile(apiUrl, authToken)
                if (profile != null) {
                    tvQuotaInfo.visibility = View.VISIBLE
                    tvQuotaInfo.text = "Generations today: ${profile.usedQuota} / ${profile.capQuota}"
                }
            }
        }
    }

    private fun setupSyllabusControls() {
        btnManageSyllabus.setOnClickListener {
            showSyllabusDialog()
        }

        btnAddTopic.setOnClickListener {
            showAddTopicDialog()
        }
    }

    private fun showSyllabusDialog() {
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val apiUrl = prefs.getString("api_url", ApiClient.DEFAULT_API_URL)
        val authToken = prefs.getString("auth_token", null)
        val mode = prefs.getString("mode", "jee") ?: "jee"

        val dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_syllabus, null)
        val tvTitle = dialogView.findViewById<TextView>(R.id.tvSyllabusTitle)
        val progress = dialogView.findViewById<ProgressBar>(R.id.progressSyllabus)
        val container = dialogView.findViewById<LinearLayout>(R.id.containerTopics)
        val btnClose = dialogView.findViewById<Button>(R.id.btnCloseSyllabus)

        tvTitle.text = "${mode.uppercase()} Syllabus Topics"

        val dialog = AlertDialog.Builder(this)
            .setView(dialogView)
            .create()

        btnClose.setOnClickListener { dialog.dismiss() }

        lifecycleScope.launch {
            val topics = ApiClient.getSyllabus(apiUrl, authToken, mode)
            progress.visibility = View.GONE

            if (topics.isEmpty()) {
                val emptyTv = TextView(this@MainActivity).apply {
                    text = if (authToken.isNullOrBlank()) {
                        "Sign in to view and customize server syllabus topics. Offline built-in topics are currently active."
                    } else {
                        "No topics found for mode $mode."
                    }
                    setTextColor(Color.parseColor("#8E99AF"))
                    setPadding(16, 24, 16, 24)
                }
                container.addView(emptyTv)
            } else {
                topics.forEach { topic ->
                    val row = LinearLayout(this@MainActivity).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = android.view.Gravity.CENTER_VERTICAL
                        setPadding(12, 16, 12, 16)
                    }

                    val infoLayout = LinearLayout(this@MainActivity).apply {
                        orientation = LinearLayout.VERTICAL
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    }

                    val nameTv = TextView(this@MainActivity).apply {
                        text = "${topic.subject} · ${topic.topic}"
                        setTextColor(Color.parseColor("#FFFFFF"))
                        textSize = 14f
                    }

                    val bankTv = TextView(this@MainActivity).apply {
                        text = "${topic.bankCount} questions in bank"
                        setTextColor(Color.parseColor("#8E99AF"))
                        textSize = 11f
                    }

                    infoLayout.addView(nameTv)
                    infoLayout.addView(bankTv)

                    val toggle = MaterialSwitch(this@MainActivity).apply {
                        isChecked = topic.enabled
                        setOnCheckedChangeListener { _, isChecked ->
                            lifecycleScope.launch {
                                ApiClient.toggleTopic(apiUrl, authToken, topic.id, isChecked)
                            }
                        }
                    }

                    row.addView(infoLayout)
                    row.addView(toggle)
                    container.addView(row)
                }
            }
        }

        dialog.show()
    }

    private fun showAddTopicDialog() {
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val apiUrl = prefs.getString("api_url", ApiClient.DEFAULT_API_URL)
        val authToken = prefs.getString("auth_token", null)
        val currentMode = prefs.getString("mode", "jee") ?: "jee"

        if (authToken.isNullOrBlank()) {
            Toast.makeText(this, "Sign in first to add custom syllabus topics.", Toast.LENGTH_SHORT).show()
            return
        }

        val dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_add_topic, null)
        val etMode = dialogView.findViewById<EditText>(R.id.etTopicMode)
        val etSubject = dialogView.findViewById<EditText>(R.id.etTopicSubject)
        val etUnit = dialogView.findViewById<EditText>(R.id.etTopicUnit)
        val etTopic = dialogView.findViewById<EditText>(R.id.etTopicName)
        val etNotes = dialogView.findViewById<EditText>(R.id.etTopicNotes)
        val spinnerDifficulty = dialogView.findViewById<Spinner>(R.id.spinnerDifficulty)
        val btnCancel = dialogView.findViewById<Button>(R.id.btnCancelAddTopic)
        val btnSubmit = dialogView.findViewById<Button>(R.id.btnSubmitAddTopic)

        etMode.setText(currentMode)

        val difficulties = arrayOf("Easy", "Moderate", "Hard")
        spinnerDifficulty.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, difficulties)
        spinnerDifficulty.setSelection(1) // Moderate

        val dialog = AlertDialog.Builder(this)
            .setView(dialogView)
            .create()

        btnCancel.setOnClickListener { dialog.dismiss() }

        btnSubmit.setOnClickListener {
            val mode = etMode.text.toString().trim()
            val subject = etSubject.text.toString().trim()
            val unit = etUnit.text.toString().trim().takeIf { it.isNotBlank() }
            val topicName = etTopic.text.toString().trim()
            val notes = etNotes.text.toString().trim().takeIf { it.isNotBlank() }
            val difficulty = spinnerDifficulty.selectedItemPosition + 1

            if (mode.isBlank() || subject.isBlank() || topicName.isBlank()) {
                Toast.makeText(this, "Mode, Subject, and Topic Name are required.", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            btnSubmit.isEnabled = false
            btnSubmit.text = "Saving…"

            lifecycleScope.launch {
                val success = ApiClient.addTopic(apiUrl, authToken, mode, subject, unit, topicName, difficulty, notes)
                if (success) {
                    Toast.makeText(this@MainActivity, "Topic '$topicName' added!", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                } else {
                    btnSubmit.isEnabled = true
                    btnSubmit.text = "Save Topic"
                    Toast.makeText(this@MainActivity, "Failed to add topic. Check network/server.", Toast.LENGTH_SHORT).show()
                }
            }
        }

        dialog.show()
    }

    private fun setupStatsControls() {
        btnClearRecord.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Clear Record")
                .setMessage("Are you sure you want to reset your answered count, accuracy, and streak?")
                .setPositiveButton("Reset") { _, _ ->
                    val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
                    prefs.edit()
                        .putInt("stats_answered", 0)
                        .putInt("stats_correct", 0)
                        .putInt("stats_streak", 0)
                        .putInt("stats_best_streak", 0)
                        .apply()
                    updateDashboard()
                    Toast.makeText(this, "Record reset.", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    private fun loadSavedSettings() {
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)

        switchMaster.isChecked = prefs.getBoolean("enabled", true)

        val currentMode = prefs.getString("mode", "jee") ?: "jee"
        val modeIndex = when (currentMode.lowercase()) {
            "neet" -> 1
            "custom" -> 2
            else -> 0
        }
        spinnerMode.setSelection(modeIndex)

        etReelsPerQuestion.setText(prefs.getInt("reels_per_question", 1).toString())
        etChatMinutes.setText(prefs.getInt("chat_minutes", 5).toString())
        etAnswerDelaySec.setText(String.format("%.1f", prefs.getFloat("answer_delay_sec", 1.2f)))
        switchRequireNewOnWrong.isChecked = prefs.getBoolean("require_new_on_wrong", true)

        cbInstagram.isChecked = prefs.getBoolean("gate_instagram", true)
        cbYouTube.isChecked = prefs.getBoolean("gate_youtube", true)
        cbTikTok.isChecked = prefs.getBoolean("gate_tiktok", true)
        cbWhatsApp.isChecked = prefs.getBoolean("gate_whatsapp", true)
        cbSnapchat.isChecked = prefs.getBoolean("gate_snapchat", true)

        val apiUrl = prefs.getString("api_url", ApiClient.DEFAULT_API_URL)
        etApiUrl.setText(apiUrl)
    }

    private fun updateDashboard() {
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val accountEmail = prefs.getString("account_email", null)

        if (accountEmail != null) {
            tvAccountStatus.text = "Signed in as $accountEmail"
            tvAccountStatus.setTextColor(Color.parseColor("#1F7A54"))
            btnSignIn.visibility = View.GONE
            layoutAuthActions.visibility = View.VISIBLE
        } else {
            tvAccountStatus.text = "Not signed in"
            tvAccountStatus.setTextColor(Color.parseColor("#8E99AF"))
            btnSignIn.visibility = View.VISIBLE
            layoutAuthActions.visibility = View.GONE
            tvQuotaInfo.visibility = View.GONE
        }

        val answered = prefs.getInt("stats_answered", 0)
        val correct = prefs.getInt("stats_correct", 0)
        val bestStreak = prefs.getInt("stats_best_streak", 0)
        val accuracyPct = if (answered > 0) Math.round((correct.toDouble() / answered) * 100) else 0

        tvAnswered.text = answered.toString()
        tvAccuracy.text = "$accuracyPct%"
        tvStreak.text = bestStreak.toString()
    }
}
