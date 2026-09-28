import { askGemini } from "../gemini.js";
import { chatPrompt } from "../prompts/chatPrompt.js";

export async function chatWithLecture(
  transcript,
  userQuestion,
  language = "en"
) {
  try {
    if (!transcript || transcript.trim().length === 0) {
      throw new Error("Transcript is empty.");
    }

    if (!userQuestion || userQuestion.trim().length === 0) {
      throw new Error("Question is empty.");
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
    console.log("Generating lecture chat response...");

    const prompt = chatPrompt(
      transcript,
      userQuestion,
      language
    );

    const response = await askGemini(prompt);

    if (!response || response.trim().length === 0) {
      throw new Error(
        "Chat response is empty."
      );
    }

    console.log(
      "Chat response generated successfully."
    );

    return response.trim();

  } catch (error) {
    console.error(
      "Chat Generator Error:",
      error.message
    );

    throw error;
  }
}