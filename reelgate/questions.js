/*
 * QUESTION BANK (OFFLINE FALLBACK)
 * --------------------------------
 * Pre-compiled questions used when offline or before signing in.
 */

const QUESTION_BANK = {
  neet_biology: {
    mode: "neet",
    label: "Biology · Cell Structure & Function",
    questions: [
      {
        q: "Which organelle is known as the powerhouse of the cell?",
        opts: [
          "Mitochondria",
          "Ribosome",
          "Golgi apparatus",
          "Endoplasmic reticulum"
        ],
        a: 0,
        why: "Mitochondria produce ATP through cellular respiration, earning the title powerhouse of the cell.",
        d: 1
      },
      {
        q: "In DNA, adenine pairs with thymine via how many hydrogen bonds?",
        opts: ["2", "3", "1", "4"],
        a: 0,
        why: "Adenine and Thymine form 2 hydrogen bonds, while Guanine and Cytosine form 3 hydrogen bonds.",
        d: 1
      },
      {
        q: "Which hormone regulates blood sugar levels by facilitating glucose uptake in cells?",
        opts: ["Insulin", "Glucagon", "Thyroxine", "Adrenaline"],
        a: 0,
        why: "Insulin produced by pancreatic beta cells lowers blood glucose by aiding cell uptake.",
        d: 1
      },
      {
        q: "During photosynthesis, light reactions occur in which part of the chloroplast?",
        opts: [
          "Thylakoid membrane",
          "Stroma",
          "Outer membrane",
          "Intermembrane space"
        ],
        a: 0,
        why: "Light-dependent reactions take place in the thylakoid membranes where chlorophyll pigments are located.",
        d: 2
      }
    ]
  },

  neet_chemistry: {
    mode: "neet",
    label: "Chemistry · Organic & Physical",
    questions: [
      {
        q: "What is the pH of a 0.01 M HCl solution at 298 K?",
        opts: ["2", "1", "7", "12"],
        a: 0,
        why: "pH = -log[H+]. For 0.01 M (10^-2 M) strong acid HCl, pH = -log(10^-2) = 2.",
        d: 1
      },
      {
        q: "Which functional group is characterized by a C=O double bond attached to an OH group?",
        opts: [
          "Carboxylic acid",
          "Aldehyde",
          "Ketone",
          "Ester"
        ],
        a: 0,
        why: "-COOH represents a carboxylic acid functional group.",
        d: 1
      },
      {
        q: "In the Nernst equation at 298 K, what multiplies log Q?",
        opts: ["0.0592 / n", "n / 0.0592", "0.0592 × n", "2.303 × n"],
        a: 0,
        why: "E = E° - (0.0592/n) log Q at 298 K, where n is the number of transferred electrons.",
        d: 2
      }
    ]
  },

  neet_physics: {
    mode: "neet",
    label: "Physics · Mechanics & Optics",
    questions: [
      {
        q: "What is the acceleration due to gravity on the surface of the Earth approximately?",
        opts: ["9.8 m/s²", "1.6 m/s²", "9.8 km/s²", "3.0 × 10⁸ m/s²"],
        a: 0,
        why: "g ≈ 9.8 m/s² on Earth's surface.",
        d: 1
      },
      {
        q: "The unit of electrical capacitance is:",
        opts: ["Farad", "Henry", "Tesla", "Ohm"],
        a: 0,
        why: "Capacitance C = Q/V is measured in Farads (F).",
        d: 1
      }
    ]
  },

  jee_physics: {
    mode: "jee",
    label: "Physics · Mechanics & Electromagnetism",
    questions: [
      {
        q: "Escape velocity from the surface of Earth depends on mass of Earth (M) and radius (R) as:",
        opts: ["√(2GM / R)", "√(GM / R)", "2GM / R", "GM / R²"],
        a: 0,
        why: "ve = √(2GM/R) derived from conservation of mechanical energy.",
        d: 2
      },
      {
        q: "Dimensions of magnetic flux are:",
        opts: ["ML²T⁻²A⁻¹", "MLT⁻²A⁻¹", "ML²T⁻¹A⁻²", "M⁻¹L²T⁻²A"],
        a: 0,
        why: "Flux Φ = B × A = (F / I L) × A = [M L² T⁻² A⁻¹].",
        d: 2
      }
    ]
  },

  jee_chemistry: {
    mode: "jee",
    label: "Chemistry · Physical & Organic",
    questions: [
      {
        q: "In a zero-order reaction, the half-life t1/2 is proportional to initial concentration [A]0 as:",
        opts: ["t1/2 ∝ [A]0", "t1/2 ∝ 1 / [A]0", "t1/2 is independent of [A]0", "t1/2 ∝ [A]0²"],
        a: 0,
        why: "For zero order, t1/2 = [A]0 / (2k), so t1/2 is directly proportional to initial concentration.",
        d: 2
      }
    ]
  },

  jee_math: {
    mode: "jee",
    label: "Mathematics · Algebra & Calculus",
    questions: [
      {
        q: "The derivative of sin(x²) with respect to x is:",
        opts: ["2x cos(x²)", "cos(x²)", "-2x cos(x²)", "2 sin(x) cos(x)"],
        a: 0,
        why: "By the chain rule: d/dx[sin(x²)] = cos(x²) · d/dx[x²] = 2x cos(x²).",
        d: 1
      },
      {
        q: "The value of lim (x->0) (sin x / x) is:",
        opts: ["1", "0", "Infinity", "Undefined"],
        a: 0,
        why: "Standard limit: lim_(x->0) (sin x / x) = 1.",
        d: 1
      }
    ]
  }
};

if (typeof module !== "undefined") module.exports = { QUESTION_BANK };
