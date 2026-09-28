import { askGemini } from "../gemini.js";
import { flashcardPrompt } from "../prompts/flashcardPrompt.js";
import { parseJsonResponse } from "../utils/parseJsonResponse.js";

const clean = value => typeof value === 'string' ? value.trim() : '';

export async function generateFlashcards(transcript, language = "en") {
  if (!transcript?.trim()) throw new Error("Transcript is empty.");
  if (!["en", "hi", "hinglish"].includes(language)) language = "en";
  const response = await askGemini(flashcardPrompt(transcript, language), 3, { json: true });
  const raw = parseJsonResponse(response, 'array');
  const cards = raw.map((card) => ({
    question: clean(card?.question || card?.front),
    answer: clean(card?.answer || card?.back),
  })).filter((card) => card.question && card.answer).slice(0, 10);
  if (!cards.length) throw new Error('No valid flashcards found in AI response.');
  console.log(`Generated ${cards.length} flashcards successfully.`);
  return cards;
}
