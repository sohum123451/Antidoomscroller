package com.checkpoint.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var btnAccessibility: Button
    private lateinit var btnOverlayPermission: Button
    private lateinit var tvAccountStatus: TextView
    private lateinit var btnSignIn: Button
    private lateinit var spinnerMode: Spinner

    private lateinit var tvAnswered: TextView
    private lateinit var tvAccuracy: TextView
    private lateinit var tvStreak: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        btnAccessibility = findViewById(R.id.btnAccessibility)
        btnOverlayPermission = findViewById(R.id.btnOverlayPermission)
        tvAccountStatus = findViewById(R.id.tvAccountStatus)
        btnSignIn = findViewById(R.id.btnSignIn)
        spinnerMode = findViewById(R.id.spinnerMode)

        tvAnswered = findViewById(R.id.tvAnswered)
        tvAccuracy = findViewById(R.id.tvAccuracy)
        tvStreak = findViewById(R.id.tvStreak)

        setupPermissionsButtons()
        setupModeSpinner()
        setupSignInButton()
        updateDashboard()
    }

    override fun onResume() {
        super.onResume()
        updateDashboard()
    }

    private fun setupPermissionsButtons() {
        btnAccessibility.setOnClickListener {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            startActivity(intent)
        }

        btnOverlayPermission.setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")
                )
                startActivity(intent)
            } else {
                Toast.makeText(this, "Overlay permission is granted by default on your Android version.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setupModeSpinner() {
        val modes = arrayOf("JEE", "NEET")
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, modes)
        spinnerMode.adapter = adapter

        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val currentMode = prefs.getString("mode", "jee") ?: "jee"
        spinnerMode.setSelection(if (currentMode.equals("neet", ignoreCase = true)) 1 else 0)

        spinnerMode.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val selected = if (position == 1) "neet" else "jee"
                prefs.edit().putString("mode", selected).apply()
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    private fun setupSignInButton() {
        btnSignIn.setOnClickListener {
            val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
            val currentAccount = prefs.getString("account_email", null)

            if (currentAccount == null) {
                // Mock / Test Sign In with active user account
                prefs.edit()
                    .putString("account_email", "mangalapalli.ss@gmail.com")
                    .putString("auth_token", "android_google_token_active")
                    .apply()
                Toast.makeText(this, "Signed in as mangalapalli.ss@gmail.com", Toast.LENGTH_SHORT).show()
            } else {
                prefs.edit()
                    .remove("account_email")
                    .remove("auth_token")
                    .apply()
                Toast.makeText(this, "Signed out", Toast.LENGTH_SHORT).show()
            }
            updateDashboard()
        }
    }

    private fun updateDashboard() {
        val prefs = getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)
        val accountEmail = prefs.getString("account_email", null)

        if (accountEmail != null) {
            tvAccountStatus.text = "Signed in as $accountEmail"
            tvAccountStatus.setTextColor(android.graphics.Color.parseColor("#1F7A54"))
            btnSignIn.text = "Sign Out"
        } else {
            tvAccountStatus.text = "Not signed in"
            tvAccountStatus.setTextColor(android.graphics.Color.parseColor("#A0ACC0"))
            btnSignIn.text = "Sign in with Google"
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
