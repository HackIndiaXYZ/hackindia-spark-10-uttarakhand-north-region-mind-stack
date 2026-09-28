import { askGemini } from "../gemini.js";
import { questionsPrompt } from "../prompts/questionsPrompt.js";
import { parseJsonResponse } from "../utils/parseJsonResponse.js";

const clean = value => typeof value === 'string' ? value.trim() : '';

export async function generateQuestions(transcript, language = "en") {
  if (!transcript?.trim()) throw new Error("Transcript is empty.");
  if (!["en", "hi", "hinglish"].includes(language)) language = "en";
  const response = await askGemini(questionsPrompt(transcript, language), 3, { json: true });
  const raw = parseJsonResponse(response, 'array');
  const questions = raw.map((item) => ({
    question: clean(item?.question || item?.q),
    answer: clean(item?.answer || item?.a),
  })).filter((item) => item.question && item.answer).slice(0, 10);
  if (!questions.length) throw new Error('No valid important questions found in AI response.');
  console.log(`Generated ${questions.length} important questions successfully.`);
  return questions;
}
