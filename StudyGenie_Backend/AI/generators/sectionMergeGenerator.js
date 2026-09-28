import { askGemini } from "../gemini.js";
import { sectionMergePrompt } from "../prompts/sectionMergePrompt.js";

export async function mergeSection(sectionNotes) {
  try {
    if (!sectionNotes || sectionNotes.length === 0) {
      throw new Error("No section notes provided.");
    }

    const combinedNotes = sectionNotes.join("\n\n");

    const prompt = sectionMergePrompt(combinedNotes);

    const result = await askGemini(prompt);

    return result;

  } catch (error) {
    console.error("Section Merge Error:", error.message);
    throw error;
  }
}