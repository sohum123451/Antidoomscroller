package com.checkpoint.app

import android.content.Context
import kotlin.random.Random

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
            id = "local:jee:kinematics_1",
            topic = "Kinematics",
            label = "JEE · Physics · Mechanics",
            stem = "A particle moves along a circular path of radius R with constant speed v. What is the magnitude of its average acceleration during a half-revolution?",
            options = listOf("2v² / (πR)", "v² / R", "2v / π", "Zero"),
            answerIndex = 0,
            explanation = "Magnitude of change in velocity is 2v. Time taken for half revolution is πR/v. Hence average acceleration = 2v / (πR/v) = 2v² / (πR).",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:work_energy_1",
            topic = "Work, Energy & Power",
            label = "JEE · Physics · Mechanics",
            stem = "A particle of mass m moves under a central force field with potential energy U(r) = k·r². If it moves in a circular orbit of radius R, what is its total mechanical energy?",
            options = listOf("2k·R²", "k·R²", "k·R² / 2", "Zero"),
            answerIndex = 0,
            explanation = "F = -dU/dr = -2kr. For circular orbit, m v² / R = 2kR, so Kinetic Energy = ½ m v² = k R². Total Energy E = K + U = kR² + kR² = 2kR².",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:thermo_1",
            topic = "Thermodynamics",
            label = "JEE · Physics · Thermal Physics",
            stem = "An ideal monoatomic gas undergoes an adiabatic expansion where its volume doubles. What is the ratio of final temperature to initial temperature?",
            options = listOf("1 / 2^(2/3)", "2^(2/3)", "1 / 2^(5/3)", "1 / 2"),
            answerIndex = 0,
            explanation = "For adiabatic process, T·V^(γ-1) = constant. For monoatomic gas γ = 5/3, so γ - 1 = 2/3. T2 = T1 · (V1 / 2V1)^(2/3) = T1 / 2^(2/3).",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:electro_1",
            topic = "Electrostatics",
            label = "JEE · Physics · Electromagnetism",
            stem = "Two concentric spherical conducting shells have radii a and b (b > a) with charges Q1 and Q2. What is the electric field at distance r where a < r < b?",
            options = listOf("Q1 / (4πε₀r²)", "(Q1 + Q2) / (4πε₀r²)", "Zero", "Q2 / (4πε₀r²)"),
            answerIndex = 0,
            explanation = "By Gauss's Law, taking a Gaussian sphere of radius r (a < r < b), only charge Q1 is enclosed. Therefore, E = Q1 / (4πε₀r²).",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:magnetism_1",
            topic = "Magnetic Effects of Current",
            label = "JEE · Physics · Electromagnetism",
            stem = "A circular loop of radius R carries a current I. The magnetic field at its center is B0. At what distance along its axis from the center does the magnetic field drop to B0 / 8?",
            options = listOf("√3 R", "2R", "R / √3", "3R"),
            answerIndex = 0,
            explanation = "B(x) = B0 / (1 + x²/R²)^(3/2). Setting this to B0/8 gives (1 + x²/R²)^(3/2) = 8 = 2³, so 1 + x²/R² = 4, which yields x = √3 R.",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:modern_1",
            topic = "Modern Physics",
            label = "JEE · Physics · Modern Physics",
            stem = "When light of frequency 2ν₀ is incident on a metal with threshold frequency ν₀, maximum KE of emitted photoelectrons is K1. When frequency is 5ν₀, maximum KE is K2. What is K1 / K2?",
            options = listOf("1 / 4", "1 / 2", "2 / 5", "1 / 3"),
            answerIndex = 0,
            explanation = "Einstein's photoelectric equation: K1 = h(2ν₀) - hν₀ = hν₀. K2 = h(5ν₀) - hν₀ = 4hν₀. Hence K1 / K2 = 1/4.",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:chem_kinetics_1",
            topic = "Chemical Kinetics",
            label = "JEE · Chemistry · Physical Chemistry",
            stem = "In a first-order reaction, the time required for 99.9% completion (t_99.9) is approximately how many times the half-life (t_1/2)?",
            options = listOf("10 times", "3 times", "5 times", "20 times"),
            answerIndex = 0,
            explanation = "t = (2.303 / k) log(100 / 0.1) = (2.303 / k) · 3 = 10 · (0.693 / k) = 10 · t_1/2.",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:electrochem_1",
            topic = "Electrochemistry",
            label = "JEE · Chemistry · Physical Chemistry",
            stem = "In the Nernst equation at 298 K for reaction quotient Q: E_cell = E°_cell - (X / n) log₁₀ Q. What is the value of X?",
            options = listOf("0.0591 V", "0.0257 V", "0.0831 V", "1.987 V"),
            answerIndex = 0,
            explanation = "At 298 K, (2.303 · R · T / F) ≈ 0.0591 V.",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:organic_isomerism_1",
            topic = "Organic Isomerism",
            label = "JEE · Chemistry · Organic Chemistry",
            stem = "Which of the following compounds exhibits geometrical (cis-trans) isomerism?",
            options = listOf("2-Butene", "1-Butene", "2-Methylpropene", "Propene"),
            answerIndex = 0,
            explanation = "2-Butene (CH3-CH=CH-CH3) has restricted rotation around the double bond and each carbon atom bears two different groups (-H and -CH3).",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:coordination_1",
            topic = "Coordination Compounds",
            label = "JEE · Chemistry · Inorganic Chemistry",
            stem = "What is the hybridization and magnetic behavior of the complex [Ni(CN)₄]²⁻? (Atomic number of Ni = 28)",
            options = listOf("dsp², diamagnetic", "sp³, paramagnetic", "sp³d², diamagnetic", "d²sp³, paramagnetic"),
            answerIndex = 0,
            explanation = "Ni²⁺ has 3d⁸ configuration. Strong field ligand CN⁻ forces pairing of 3d electrons, leaving one empty 3d orbital for dsp² hybridization (square planar, diamagnetic).",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:calculus_1",
            topic = "Definite Integrals",
            label = "JEE · Mathematics · Integral Calculus",
            stem = "What is the value of the integral ∫ from -π/2 to π/2 of (sin³ x + x·cos x + x²) dx?",
            options = listOf("π³ / 12", "0", "π / 4", "π² / 6"),
            answerIndex = 0,
            explanation = "sin³ x and x·cos x are odd functions, so their integrals over [-π/2, π/2] vanish. For x², 2 ∫[0 to π/2] x² dx = 2 · (π/2)³ / 3 = π³ / 12.",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:calculus_2",
            topic = "Limits",
            label = "JEE · Mathematics · Differential Calculus",
            stem = "Evaluate the limit: lim (x -> 0) [ (1 - cos 2x) / x² ].",
            options = listOf("2", "1", "1/2", "4"),
            answerIndex = 0,
            explanation = "Using 1 - cos 2x = 2 sin² x, lim (x -> 0) [ 2 (sin x / x)² ] = 2(1)² = 2.",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:vectors_1",
            topic = "Vector Algebra",
            label = "JEE · Mathematics · Vectors & 3D",
            stem = "If |a + b| = |a - b| for two non-zero vectors a and b, what is the angle between a and b?",
            options = listOf("90° (π/2)", "0°", "45° (π/4)", "180° (π)"),
            answerIndex = 0,
            explanation = "|a + b|² = |a - b|² implies |a|² + |b|² + 2 a·b = |a|² + |b|² - 2 a·b, which gives 4 a·b = 0, meaning a and b are perpendicular.",
            offline = true
        ),
        QuestionItem(
            id = "local:jee:matrices_1",
            topic = "Matrices & Determinants",
            label = "JEE · Mathematics · Algebra",
            stem = "If A is a 3 × 3 matrix such that det(A) = 4, what is the value of det(2A)?",
            options = listOf("32", "8", "16", "64"),
            answerIndex = 0,
            explanation = "For an n × n matrix, det(k A) = kⁿ · det(A). Here n = 3, so det(2A) = 2³ · 4 = 8 · 4 = 32.",
            offline = true
        )
    )

    private val NEET_QUESTIONS = listOf(
        QuestionItem(
            id = "local:neet:cell_1",
            topic = "Cell Biology",
            label = "NEET · Biology · Cytology",
            stem = "Which cellular organelle is known as the powerhouse of the cell due to ATP synthesis?",
            options = listOf("Mitochondria", "Chloroplast", "Ribosome", "Golgi apparatus"),
            answerIndex = 0,
            explanation = "Mitochondria produce ATP through aerobic cellular respiration and oxidative phosphorylation.",
            offline = true
        ),
        QuestionItem(
            id = "local:neet:genetics_1",
            topic = "Genetics",
            label = "NEET · Biology · Genetics",
            stem = "In DNA structure, adenine pairs with thymine via how many hydrogen bonds?",
            options = listOf("2", "3", "1", "4"),
            answerIndex = 0,
            explanation = "Adenine and Thymine form 2 hydrogen bonds (A=T), while Guanine and Cytosine form 3 hydrogen bonds (G≡C).",
            offline = true
        ),
        QuestionItem(
            id = "local:neet:physio_1",
            topic = "Human Physiology",
            label = "NEET · Biology · Endocrine System",
            stem = "Which pancreatic hormone lowers blood glucose concentration by stimulating cellular uptake?",
            options = listOf("Insulin", "Glucagon", "Somatostatin", "Thyroxine"),
            answerIndex = 0,
            explanation = "Insulin, secreted by beta cells of the Islets of Langerhans, lowers blood glucose levels.",
            offline = true
        ),
        QuestionItem(
            id = "local:neet:photosynthesis_1",
            topic = "Plant Physiology",
            label = "NEET · Biology · Photosynthesis",
            stem = "During photosynthesis in higher plants, the light-dependent reactions take place in which site?",
            options = listOf("Thylakoid membrane", "Stroma", "Outer chloroplast membrane", "Peroxisome"),
            answerIndex = 0,
            explanation = "Light reactions occur in the thylakoid membranes where photosystems and electron transport chains reside.",
            offline = true
        ),
        QuestionItem(
            id = "local:neet:circulatory_1",
            topic = "Human Circulatory System",
            label = "NEET · Biology · Physiology",
            stem = "The natural pacemaker of the human heart that initiates action potentials is:",
            options = listOf("Sinoatrial (SA) node", "Atrioventricular (AV) node", "Bundle of His", "Purkinje fibers"),
            answerIndex = 0,
            explanation = "The SA node located in the right atrium initiates electrical impulses spontaneously at the highest intrinsic rate.",
            offline = true
        ),
        QuestionItem(
            id = "local:neet:ecology_1",
            topic = "Ecology",
            label = "NEET · Biology · Ecology",
            stem = "According to Lindeman's 10% law, how much energy is transferred from one trophic level to the next?",
            options = listOf("10%", "1%", "50%", "25%"),
            answerIndex = 0,
            explanation = "Only approximately 10% of the energy stored as biomass in one trophic level is passed on to the next level.",
            offline = true
        ),
        QuestionItem(
            id = "local:neet:chem_ph_1",
            topic = "Ionic Equilibrium",
            label = "NEET · Chemistry · Physical Chemistry",
            stem = "What is the pH of a 0.001 M HCl solution at 298 K assuming complete dissociation?",
            options = listOf("3", "1", "7", "11"),
            answerIndex = 0,
            explanation = "pH = -log₁₀[H⁺]. For 0.001 M = 10⁻³ M HCl, pH = -log₁₀(10⁻³) = 3.",
            offline = true
        ),
        QuestionItem(
            id = "local:neet:chem_org_1",
            topic = "Biomolecules",
            label = "NEET · Chemistry · Organic Chemistry",
            stem = "Which vitamin is water-soluble and deficiency leads to Scurvy?",
            options = listOf("Vitamin C (Ascorbic acid)", "Vitamin A", "Vitamin D", "Vitamin K"),
            answerIndex = 0,
            explanation = "Vitamin C and Vitamin B complex are water-soluble. Vitamin C deficiency causes Scurvy.",
            offline = true
        ),
        QuestionItem(
            id = "local:neet:physics_optics_1",
            topic = "Ray Optics",
            label = "NEET · Physics · Optics",
            stem = "What is the phenomenon responsible for the glittering of a diamond and optical fiber communication?",
            options = listOf("Total Internal Reflection", "Diffraction", "Polarization", "Interference"),
            answerIndex = 0,
            explanation = "Total Internal Reflection occurs when light travels from a denser medium to a rarer medium at an angle greater than critical angle.",
            offline = true
        ),
        QuestionItem(
            id = "local:neet:physics_units_1",
            topic = "Units & Dimensions",
            label = "NEET · Physics · General",
            stem = "What are the dimensional units of Planck's constant (h)?",
            options = listOf("[M L² T⁻¹]", "[M L T⁻¹]", "[M L² T⁻²]", "[M⁻¹ L² T⁻¹]"),
            answerIndex = 0,
            explanation = "E = h ν, so h = E / ν = [M L² T⁻²] / [T⁻¹] = [M L² T⁻¹], identical to angular momentum.",
            offline = true
        )
    )

    /**
     * Randomly shuffles the options of a question and updates the answerIndex
     * so that the correct answer is not statically fixed to option A.
     */
    fun shuffle(q: QuestionItem): QuestionItem {
        val originalCorrectText = q.options[q.answerIndex]
        val shuffledOptions = q.options.shuffled(Random.Default)
        val newCorrectIndex = shuffledOptions.indexOf(originalCorrectText)
        return q.copy(options = shuffledOptions, answerIndex = newCorrectIndex)
    }

    /**
     * Picks a question ensuring recent questions are not repeated,
     * maintaining a sliding cooldown buffer.
     */
    fun getNextQuestion(context: Context, mode: String): QuestionItem {
        val pool = if (mode.equals("neet", ignoreCase = true)) NEET_QUESTIONS else JEE_QUESTIONS
        val prefs = context.getSharedPreferences("checkpoint_prefs", Context.MODE_PRIVATE)

        val recentRaw = prefs.getString("recent_q_ids", "") ?: ""
        val recentIds = recentRaw.split(",").filter { it.isNotBlank() }.toMutableList()

        val cooldown = maxOf(1, pool.size / 2)
        val freshQuestions = pool.filter { !recentIds.takeLast(cooldown).contains(it.id) }

        val selected = if (freshQuestions.isNotEmpty()) {
            freshQuestions.random()
        } else {
            // If all have been seen recently, cycle and clear older history
            recentIds.clear()
            pool.random()
        }

        recentIds.add(selected.id)
        if (recentIds.size > 20) {
            recentIds.removeAt(0)
        }
        prefs.edit().putString("recent_q_ids", recentIds.joinToString(",")).apply()

        return shuffle(selected)
    }
}
