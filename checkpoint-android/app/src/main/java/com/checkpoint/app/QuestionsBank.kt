package com.checkpoint.app

import org.json.JSONArray
import org.json.JSONObject

data class QuestionItem(
    val id: String,
    val topic: String,
    val label: String,
    val stem: String,
    val options: List<String>,
    val answerIndex: Int,
    val explanation: String,
    val offline: Boolean = false
)

object QuestionsBank {

    private val JEE_QUESTIONS = listOf(
        QuestionItem(
            id = "local:jee:1",
            topic = "Kinematics",
            label = "JEE · Physics - Mechanics",
            stem = "A particle moves in a circle of radius R with constant speed v. What is the magnitude of average acceleration during a half-revolution?",
            options = listOf("2v² / (πR)", "v² / R", "2v / π", "Zero"),
            answerIndex = 0,
            explanation = "Change in velocity = 2v. Time taken = πR/v. Average acceleration = 2v / (πR/v) = 2v² / (πR).",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:2",
            topic = "Organic Chemistry",
            label = "JEE · Chemistry - Organic",
            stem = "Which compound exhibits geometrical isomerism?",
            options = listOf("2-Butene", "1-Butene", "Propene", "2-Methylpropene"),
            answerIndex = 0,
            explanation = "2-Butene has restricted rotation around C=C and each double-bonded carbon has two different groups (cis and trans).",
            offline = true
        )
    )

    private val NEET_QUESTIONS = listOf(
        QuestionItem(
            id = "local:neet:1",
            topic = "Botany",
            label = "NEET · Biology - Botany",
            stem = "Which organelle is known as the powerhouse of the cell?",
            options = listOf("Mitochondria", "Chloroplast", "Ribosome", "Golgi apparatus"),
            answerIndex = 0,
            explanation = "Mitochondria produce ATP through cellular respiration.",
            offline = true
        ),
        QuestionItem(
            id = "local:neet:2",
            topic = "Physics",
            label = "NEET · Physics - Mechanics",
            stem = "Dimensions of magnetic flux are:",
            options = listOf("M L² T⁻² A⁻¹", "M⁻¹ L² T⁻² A", "M L T⁻² A⁻¹", "M L² T⁻¹ A⁻²"),
            answerIndex = 0,
            explanation = "Flux Φ = B × A. B = [M T⁻² A⁻¹], so Φ = [M L² T⁻² A⁻¹].",
            offline = true
        )
    )

    fun getRandomQuestion(mode: String): QuestionItem {
        val list = if (mode.equals("neet", ignoreCase = true)) NEET_QUESTIONS else JEE_QUESTIONS
        return list.random()
    }
}
