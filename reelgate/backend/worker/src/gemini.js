const BASE = "https://generativelanguage.googleapis.com/v1beta";

const QUESTION_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      stem: { type: "STRING" },
      options: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 4 },
      answer_index: { type: "INTEGER" },
      explanation: { type: "STRING" },
      difficulty: { type: "INTEGER" }
    },
    required: ["stem", "options", "answer_index", "explanation", "difficulty"],
    propertyOrdering: ["stem", "options", "answer_index", "explanation", "difficulty"]
  }
};

const SYSTEM = `You write single-correct-answer multiple choice questions for competitive exam preparation in India.

Rules you never break:
- Exactly four options. Exactly one is correct.
- The three wrong options are plausible mistakes a prepared student would actually make: a sign error, a swapped definition, an off-by-one-power unit, a confused mechanism. Never filler.
- No "all of the above", "none of the above", or "both A and B".
- The stem is self-contained. No reference to figures, tables, passages or earlier questions.
- Anything numerical must be solvable mentally or with one line of arithmetic. The reader is standing in a corridor with a phone, not sitting at a desk.
- The explanation is at most two sentences and says why the answer is right, not merely restating it.
- Plain text only. No markdown, no LaTeX delimiters. Write formulas inline like E = E0 - (0.0592/n) log Q.

Vary the shape of the questions: some recall, some application, some "what goes wrong if". Do not open every stem the same way.`;

function normalise(vec) {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

export async function generateQuestions(env, { subject, unit, topic, notes, difficulty, count, avoid }) {
  const model = env.GEMINI_MODEL || "gemini-flash-lite-latest";

  const lines = [
    `Write ${count} questions.`,
    `Subject: ${subject}`,
    unit ? `Unit: ${unit}` : null,
    `Topic: ${topic}`,
    notes ? `Extra instruction from the student: ${notes}` : null,
    `Target difficulty: ${["", "easy", "moderate", "hard"][difficulty] || "moderate"} (1-3 scale, you may vary by one).`
  ].filter(Boolean);

  if (avoid && avoid.length) {
    lines.push(
      "",
      "These questions already exist. Do not write anything that tests the same fact, even reworded:",
      ...avoid.slice(0, 40).map((s) => `- ${s}`)
    );
  }

  const res = await fetch(`${BASE}/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: lines.join("\n") }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: QUESTION_SCHEMA,
        temperature: 1.1,
        topP: 0.95
      }
    })
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const body = await res.json();
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "[]";

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned unparseable JSON");
  }

  return (Array.isArray(parsed) ? parsed : []).filter(
    (q) =>
      q &&
      typeof q.stem === "string" &&
      q.stem.trim().length > 10 &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      q.options.every((o) => typeof o === "string" && o.trim()) &&
      new Set(q.options.map((o) => o.trim().toLowerCase())).size === 4 &&
      Number.isInteger(q.answer_index) &&
      q.answer_index >= 0 &&
      q.answer_index < 4 &&
      typeof q.explanation === "string"
  );
}

export async function embed(env, texts) {
  const model = env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
  const res = await fetch(`${BASE}/models/${model}:batchEmbedContents?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: 768
      }))
    })
  });

  if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${await res.text()}`);

  const body = await res.json();
  // Truncated embeddings are no longer unit length, so renormalise before
  // storing — cosine distance in Turso assumes we did.
  return (body.embeddings || []).map((e) => normalise(e.values));
}
