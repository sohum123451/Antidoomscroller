package com.checkpoint.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object ApiClient {

    private const val DEFAULT_API_URL = "https://checkpoint-api.sohum123451.workers.dev"

    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    suspend fun getQuestion(apiUrl: String?, authToken: String?, mode: String): QuestionItem? = withContext(Dispatchers.IO) {
        val baseUrl = (apiUrl?.takeIf { it.isNotBlank() } ?: DEFAULT_API_URL).trimEnd('/')
        if (authToken.isNullOrBlank()) {
            return@withContext QuestionsBank.getRandomQuestion(mode)
        }

        try {
            val jsonBody = JSONObject().apply {
                put("mode", mode)
                put("count", 1)
            }
            val request = Request.Builder()
                .url("$baseUrl/v1/questions/next")
                .header("Authorization", "Bearer $authToken")
                .post(jsonBody.toString().toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val bodyStr = response.body?.string() ?: return@withContext QuestionsBank.getRandomQuestion(mode)
                    val json = JSONObject(bodyStr)
                    val array = json.optJSONArray("questions")
                    if (array != null && array.length() > 0) {
                        val obj = array.getJSONObject(0)
                        val opts = mutableListOf<String>()
                        val optsArray = obj.optJSONArray("options")
                        if (optsArray != null) {
                            for (i in 0 until optsArray.length()) {
                                opts.add(optsArray.getString(i))
                            }
                        }
                        return@withContext QuestionItem(
                            id = "srv:${obj.optInt("id")}",
                            topic = obj.optString("topic"),
                            label = "${obj.optString("subject")} · ${obj.optString("topic")}",
                            stem = obj.optString("stem"),
                            options = opts,
                            answerIndex = obj.optInt("answerIndex"),
                            explanation = obj.optString("explanation"),
                            offline = false
                        )
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return@withContext QuestionsBank.getRandomQuestion(mode)
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
}
