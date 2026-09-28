import { askGemini } from "../gemini.js";
import { mergeNotesPrompt } from "../prompts/mergeNotesPrompt.js";

export async function mergeNotes(chunkNotes, language = "en") {
  try {
    if (!chunkNotes || chunkNotes.length === 0) {
      throw new Error("No chunk notes provided.");
    }

    if (chunkNotes.length === 1) return chunkNotes[0];
    const combinedNotes = chunkNotes.join("\n\n");

    const prompt = mergeNotesPrompt(combinedNotes, language);

    const finalNotes = await askGemini(prompt);

    return finalNotes;

  } catch (error) {
    console.error("Merge Notes Error:", error.message);
    throw error;
  }
}