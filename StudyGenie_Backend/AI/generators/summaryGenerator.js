import { askGemini } from "../gemini.js";
import { summaryPrompt } from "../prompts/summaryPrompt.js";

export async function generateSummary(
  transcript,
  language = "en"
) {
  try {
    if (!transcript || transcript.trim().length === 0) {
      throw new Error("Transcript is empty.");
    }

    // Allowed languages
    const allowedLanguages = [
      "en",
      "hi",
      "hinglish"
    ];

    // Prevent invalid language values
    if (!allowedLanguages.includes(language)) {
      language = "en";
    }

    console.log("Selected language:", language);
    console.log("Generating summary...");

    // Pass language to the prompt
    const prompt = summaryPrompt(
      transcript,
      language
    );

    const summary = await askGemini(prompt);

    console.log("Summary generated successfully.");

    return summary;

  } catch (error) {
    console.error(
      "Summary Generator Error:",
      error.message
    );

    throw error;
  }
}