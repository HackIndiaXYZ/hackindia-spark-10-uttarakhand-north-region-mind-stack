import { askGemini } from "../gemini.js";
import { quizPrompt } from "../prompts/quizPrompt.js";
import { parseJsonResponse } from "../utils/parseJsonResponse.js";

const clean = (value) => typeof value === 'string' ? value.trim() : '';
const equalLoose = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

export async function generateQuiz(transcript, language = "en") {
  if (!transcript?.trim()) throw new Error("Transcript is empty.");
  if (!["en", "hi", "hinglish"].includes(language)) language = "en";
  const response = await askGemini(quizPrompt(transcript, language), 3, { json: true });
  const raw = parseJsonResponse(response, 'array');
  const validated = [];
  for (const q of raw) {
    const question = clean(q?.question);
    const options = Array.isArray(q?.options) ? [...new Set(q.options.map(clean).filter(Boolean))].slice(0, 4) : [];
    let correctAnswer = clean(q?.correctAnswer ?? q?.answer);
    if (!question || options.length < 2 || !correctAnswer) continue;
    const matched = options.find((option) => equalLoose(option, correctAnswer));
    if (!matched) continue;
    correctAnswer = matched;
    validated.push({
      question,
      options: options.slice(0, 4),
      correctAnswer,
      explanation: clean(q?.explanation) || 'Review the lecture material for details.',
      topic: clean(q?.topic) || 'Lecture Concepts',
    });
    if (validated.length >= 10) break;
  }
  if (!validated.length) throw new Error('No valid quiz questions found in AI response.');
  console.log(`Generated ${validated.length} quiz questions successfully.`);
  return validated;
}
