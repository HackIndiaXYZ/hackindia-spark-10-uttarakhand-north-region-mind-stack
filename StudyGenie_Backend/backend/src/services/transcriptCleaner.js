import { askGemini } from "../../../AI/gemini.js";
import { config } from "../config.js";

/**
 * Fast local cleanup first.
 * Goal:
 * - remove obvious non-educational chatter
 * - remove repeated words/sentences
 * - preserve actual lecture meaning
 * - avoid Gemini unless the transcript is still noisy
 */

const fillerPatterns = [
  // Greetings
  /\b(?:hello|hi|hey)\s+(?:everyone|guys|students|class)\b[,.!? ]*/gi,
  /\bgood\s+(?:morning|afternoon|evening)\s+(?:everyone|guys|students|class)\b[,.!? ]*/gi,

  // Classroom chatter
  /\b(?:any doubts?|any questions?)\b[,.!? ]*/gi,
  /\b(?:is that clear|is it clear)\b[,.!? ]*/gi,
  /\b(?:are you getting it|did you understand)\b[,.!? ]*/gi,
  /\b(?:can you hear me|can everyone hear me)\b[,.!? ]*/gi,
  /\b(?:okay guys|ok guys|alright guys)\b[,.!? ]*/gi,
  /\b(?:please listen|listen carefully)\b[,.!? ]*/gi,

  // Common administrative/classroom noise
  /\b(?:mark your attendance|attendance please)\b[,.!? ]*/gi,
  /\b(?:open your notebook|take out your notebook)\b[,.!? ]*/gi,
  /\b(?:we will continue tomorrow|see you tomorrow)\b[,.!? ]*/gi,

  // Common low-value speech fillers
  /\b(?:you know|i mean|so yeah|okay so|right so)\b[,.!? ]*/gi,

  // Audio markers
  /\[(?:music|applause|noise|laughter|inaudible)\]/gi,
];

function normalizeForDuplicateCheck(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{S}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deterministicClean(text) {
  let out = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!out) return "";

  // Remove known classroom/filler phrases
  for (const pattern of fillerPatterns) {
    out = out.replace(pattern, " ");
  }

  // Remove repeated filler sounds
  out = out.replace(/\b(?:um+|uh+|erm+|hmm+)\b[,.!? ]*/gi, " ");

  // Remove immediately repeated words
  // Example: "the the the array" -> "the array"
  out = out.replace(/\b([a-zA-Z][a-zA-Z'-]*)\s+(?:\1\s+)+/gi, "$1 ");

  // Split approximately into sentences
  const sentences = out.split(/(?<=[.!?।！？])\s+(?=\S)/u);

  const cleaned = [];
  const seen = new Set();

  for (let sentence of sentences) {
    sentence = sentence.replace(/\s+/g, " ").trim();

    if (!sentence) continue;

    const normalized = normalizeForDuplicateCheck(sentence);

    if (!normalized) continue;

    // Remove repeated sentences, even if repeated later
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    cleaned.push(sentence);
  }

  return cleaned.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Decide whether a piece still looks noisy enough
 * to justify spending an AI call.
 */
function needsAiCleaning(text) {
  if (!text || text.length < 800) return false;

  const suspiciousPatterns = [
    /\b(?:um+|uh+|erm+|hmm+)\b/gi,
    /\b(?:you know|i mean|so yeah|okay so|right so)\b/gi,
    /\b(?:any doubts?|any questions?|is that clear|can you hear me)\b/gi,
    /\b(\w+)\s+\1\b/gi,
  ];

  let matches = 0;

  for (const pattern of suspiciousPatterns) {
    matches += (text.match(pattern) || []).length;
  }

  // Only use Gemini if the text is noticeably noisy
  return matches >= 5;
}

function chunk(text, max = 8000) {
  const source = String(text || "");

  if (!source) return [];

  const chunks = [];

  for (let i = 0; i < source.length; i += max) {
    chunks.push(source.slice(i, i + max));
  }

  return chunks;
}

export async function cleanTranscript(rawText) {
  const base = deterministicClean(rawText);

  if (!base) return "";

  /**
   * Skip Gemini completely when:
   * - AI cleaner is disabled
   * - cleaner key/model is missing
   * - transcript is already clean enough
   */
  if (
    !config.enableAiCleaner ||
    !config.cleanerKey ||
    !config.cleanerModel ||
    !needsAiCleaning(base)
  ) {
    return base;
  }

  const outputs = [];

  for (const part of chunk(base)) {
    // Don't waste tokens on clean chunks
    if (!needsAiCleaning(part)) {
      outputs.push(part);
      continue;
    }

    const prompt = `
You are a transcript-cleaning engine.

Your ONLY job is to remove non-educational speech noise from the lecture transcript.

REMOVE:
- greetings such as "hello guys", "hi everyone"
- classroom chatter such as "any doubts?", "any questions?", "is that clear?"
- microphone checks such as "can you hear me?"
- repeated words
- repeated sentences
- meaningless filler speech
- accidental verbal repetition
- non-content chatter

KEEP COMPLETELY:
- definitions
- explanations
- examples
- formulas
- technical terms
- subject-related questions
- teacher reasoning
- useful repetition when it helps explain a concept
- the original teaching meaning and sequence

STRICT RULES:
- Do NOT summarize.
- Do NOT convert the transcript into notes.
- Do NOT shorten educational explanations.
- Do NOT add headings.
- Do NOT provide multiple versions or options.
- Do NOT explain what you removed.
- Do NOT add information that was not in the lecture.
- Return ONLY the cleaned transcript text.

TRANSCRIPT:
${part}
`;

    try {
      const cleaned = await askGemini(prompt, 2, {
        apiKey: config.cleanerKey,
        model: config.cleanerModel,
      });

      const finalPart = String(cleaned || "").trim();

      outputs.push(finalPart || part);
    } catch (error) {
      console.warn(
        "[cleaner] AI cleaning unavailable; using locally cleaned transcript.",
      );

      outputs.push(part);
    }
  }

  return outputs
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
