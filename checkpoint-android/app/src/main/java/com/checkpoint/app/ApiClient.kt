package com.checkpoint.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class UserProfile(
    val email: String,
    val name: String,
    val mode: String,
    val usedQuota: Int,
    val capQuota: Int,
    val unseen: Int
)

data class SyllabusTopic(
    val id: Int,
    val mode: String,
    val subject: String,
    val unit: String?,
    val topic: String,
    val enabled: Boolean,
    val mine: Boolean,
    val bankCount: Int
)

object ApiClient {

    const val DEFAULT_API_URL = "https://checkpoint-api.sohum123451.workers.dev"

    private val client = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    /**
     * Gets a question: first checks local buffer; if empty, attempts server fetch;
     * if offline / unauthenticated, serves from QuestionsBank.
     */
    suspend fun getQuestion(context: Context, apiUrl: String?, authToken: String?, mode: String): QuestionItem = withContext(Dispatchers.IO) {
        val prefs = context.getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)

        // Try reading from locally buffered server questions
        val buffered = readBufferedQuestions(prefs)
        if (buffered.isNotEmpty()) {
            val q = buffered.removeAt(0)
            saveBufferedQuestions(prefs, buffered)
            // If buffer is running low, trigger top-up in background
            if (buffered.size < 3 && !authToken.isNullOrBlank()) {
                fetchAndBufferQuestions(prefs, apiUrl, authToken, mode, 6)
            }
            return@withContext QuestionsBank.shuffle(q)
        }

        // Buffer empty: if authToken available, fetch fresh batch from server
        if (!authToken.isNullOrBlank()) {
            try {
                val newBatch = fetchAndBufferQuestions(prefs, apiUrl, authToken, mode, 5)
                if (newBatch.isNotEmpty()) {
                    val q = newBatch.removeAt(0)
                    saveBufferedQuestions(prefs, newBatch)
                    return@withContext QuestionsBank.shuffle(q)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // Offline or unauthenticated fallback
        return@withContext QuestionsBank.getNextQuestion(context, mode)
    }

    private suspend fun fetchAndBufferQuestions(
        prefs: android.content.SharedPreferences,
        apiUrl: String?,
        authToken: String,
        mode: String,
        count: Int
    ): MutableList<QuestionItem> = withContext(Dispatchers.IO) {
        val baseUrl = (apiUrl?.takeIf { it.isNotBlank() } ?: DEFAULT_API_URL).trimEnd('/')
        val list = mutableListOf<QuestionItem>()

        try {
            val jsonBody = JSONObject().apply {
                put("mode", mode)
                put("count", count)
            }
            val request = Request.Builder()
                .url("$baseUrl/v1/questions/next")
                .header("Authorization", "Bearer $authToken")
                .post(jsonBody.toString().toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val bodyStr = response.body?.string() ?: return@withContext list
                    val json = JSONObject(bodyStr)
                    val array = json.optJSONArray("questions")
                    if (array != null) {
                        for (i in 0 until array.length()) {
                            val obj = array.getJSONObject(i)
                            val opts = mutableListOf<String>()
                            val optsArray = obj.optJSONArray("options")
                            if (optsArray != null) {
                                for (j in 0 until optsArray.length()) {
                                    opts.add(optsArray.getString(j))
                                }
                            }
                            list.add(
                                QuestionItem(
                                    id = "srv:${obj.optInt("id")}",
                                    topic = obj.optString("topic"),
                                    label = "${obj.optString("subject")} · ${obj.optString("topic")}",
                                    stem = obj.optString("stem"),
                                    options = opts,
                                    answerIndex = obj.optInt("answerIndex"),
                                    explanation = obj.optString("explanation"),
                                    offline = false
                                )
                            )
                        }
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        if (list.isNotEmpty()) {
            val current = readBufferedQuestions(prefs)
            current.addAll(list)
            saveBufferedQuestions(prefs, current)
        }

        return@withContext list
    }

    private fun readBufferedQuestions(prefs: android.content.SharedPreferences): MutableList<QuestionItem> {
        val raw = prefs.getString("buffered_questions", null) ?: return mutableListOf()
        val list = mutableListOf<QuestionItem>()
        try {
            val array = JSONArray(raw)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                val opts = mutableListOf<String>()
                val optsArray = obj.getJSONArray("options")
                for (j in 0 until optsArray.length()) {
                    opts.add(optsArray.getString(j))
                }
                list.add(
                    QuestionItem(
                        id = obj.getString("id"),
                        topic = obj.getString("topic"),
                        label = obj.getString("label"),
                        stem = obj.getString("stem"),
                        options = opts,
                        answerIndex = obj.getInt("answerIndex"),
                        explanation = obj.getString("explanation"),
                        offline = obj.optBoolean("offline", false)
                    )
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    private fun saveBufferedQuestions(prefs: android.content.SharedPreferences, list: List<QuestionItem>) {
        val array = JSONArray()
        for (q in list) {
            val obj = JSONObject().apply {
                put("id", q.id)
                put("topic", q.topic)
                put("label", q.label)
                put("stem", q.stem)
                put("options", JSONArray(q.options))
                put("answerIndex", q.answerIndex)
                put("explanation", q.explanation)
                put("offline", q.offline)
            }
            array.put(obj)
        }
        prefs.edit().putString("buffered_questions", array.toString()).apply()
    }

    suspend fun recordAnswer(apiUrl: String?, authToken: String?, questionId: String, chosen: Int, correct: Boolean) = withContext(Dispatchers.IO) {
        if (authToken.isNullOrBlank() || !questionId.startsWith("srv:")) return@withContext
        val baseUrl = (apiUrl?.takeIf { it.isNotBlank() } ?: DEFAULT_API_URL).trimEnd('/')
        val serverId = questionId.removePrefix("srv:").toIntOrNull() ?: return@withContext

        try {
            val jsonBody = JSONObject().apply {
                put("questionId", serverId)
                put("chosen", chosen)
                put("correct", correct)
                put("device", "android")
            }
            val request = Request.Builder()
                .url("$baseUrl/v1/attempts")
                .header("Authorization", "Bearer $authToken")
                .post(jsonBody.toString().toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().close()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun testConnection(apiUrl: String?): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val baseUrl = (apiUrl?.takeIf { it.isNotBlank() } ?: DEFAULT_API_URL).trimEnd('/')
        val startTime = System.currentTimeMillis()
        try {
            val request = Request.Builder()
                .url("$baseUrl/v1/status")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                val latency = System.currentTimeMillis() - startTime
                if (response.isSuccessful) {
                    val body = response.body?.string() ?: "{}"
                    val json = JSONObject(body)
                    val questionsCount = json.optInt("questions", 0)
                    Pair(true, "Connected in ${latency}ms ($questionsCount questions in pool)")
                } else {
                    Pair(false, "Server returned HTTP ${response.code}")
                }
            }
        } catch (e: Exception) {
            Pair(false, "Connection error: ${e.localizedMessage ?: e.message}")
        }
    }

    suspend fun getUserProfile(apiUrl: String?, authToken: String?): UserProfile? = withContext(Dispatchers.IO) {
        if (authToken.isNullOrBlank()) return@withContext null
        val baseUrl = (apiUrl?.takeIf { it.isNotBlank() } ?: DEFAULT_API_URL).trimEnd('/')
        try {
            val request = Request.Builder()
                .url("$baseUrl/v1/me")
                .header("Authorization", "Bearer $authToken")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val json = JSONObject(response.body?.string() ?: "{}")
                    val userObj = json.optJSONObject("user")
                    val quotaObj = json.optJSONObject("quota")
                    val unseen = json.optInt("unseen", 0)
                    if (userObj != null) {
                        return@withContext UserProfile(
                            email = userObj.optString("email"),
                            name = userObj.optString("name"),
                            mode = userObj.optString("mode"),
                            usedQuota = quotaObj?.optInt("used") ?: 0,
                            capQuota = quotaObj?.optInt("cap") ?: 40,
                            unseen = unseen
                        )
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        null
    }

    suspend fun getSyllabus(apiUrl: String?, authToken: String?, mode: String): List<SyllabusTopic> = withContext(Dispatchers.IO) {
        if (authToken.isNullOrBlank()) return@withContext emptyList()
        val baseUrl = (apiUrl?.takeIf { it.isNotBlank() } ?: DEFAULT_API_URL).trimEnd('/')
        val list = mutableListOf<SyllabusTopic>()
        try {
            val request = Request.Builder()
                .url("$baseUrl/v1/syllabus?mode=$mode")
                .header("Authorization", "Bearer $authToken")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val json = JSONObject(response.body?.string() ?: "{}")
                    val array = json.optJSONArray("syllabus")
                    if (array != null) {
                        for (i in 0 until array.length()) {
                            val obj = array.getJSONObject(i)
                            list.add(
                                SyllabusTopic(
                                    id = obj.getInt("id"),
                                    mode = obj.getString("mode"),
                                    subject = obj.getString("subject"),
                                    unit = obj.optString("unit").takeIf { it.isNotBlank() },
                                    topic = obj.getString("topic"),
                                    enabled = obj.optInt("enabled", 1) == 1,
                                    mine = obj.optBoolean("mine", false),
                                    bankCount = obj.optInt("bank", 0)
                                )
                            )
                        }
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        list
    }

    suspend fun toggleTopic(apiUrl: String?, authToken: String?, syllabusId: Int, enabled: Boolean): Boolean = withContext(Dispatchers.IO) {
        if (authToken.isNullOrBlank()) return@withContext false
        val baseUrl = (apiUrl?.takeIf { it.isNotBlank() } ?: DEFAULT_API_URL).trimEnd('/')
        try {
            val body = JSONObject().apply {
                put("toggle", syllabusId)
                put("enabled", enabled)
            }
            val request = Request.Builder()
                .url("$baseUrl/v1/syllabus")
                .header("Authorization", "Bearer $authToken")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }

    suspend fun addTopic(
        apiUrl: String?,
        authToken: String?,
        mode: String,
        subject: String,
        unit: String?,
        topic: String,
        difficulty: Int,
        notes: String?
    ): Boolean = withContext(Dispatchers.IO) {
        if (authToken.isNullOrBlank()) return@withContext false
        val baseUrl = (apiUrl?.takeIf { it.isNotBlank() } ?: DEFAULT_API_URL).trimEnd('/')
        try {
            val body = JSONObject().apply {
                put("mode", mode)
                put("subject", subject)
                put("unit", unit ?: "")
                put("topic", topic)
                put("difficulty", difficulty)
                put("notes", notes ?: "")
            }
            val request = Request.Builder()
                .url("$baseUrl/v1/syllabus")
                .header("Authorization", "Bearer $authToken")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }
}
