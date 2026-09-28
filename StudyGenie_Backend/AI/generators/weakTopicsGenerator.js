import { parseJsonResponse } from '../utils/parseJsonResponse.js';
import { askGemini } from "../gemini.js";
import { weakTopicsPrompt } from "../prompts/weakTopicsPrompt.js";

export async function generateWeakTopics(
  questions,
  quizResults,
  language = "en"
) {
  try {
    if (!questions || questions.length === 0) {
      throw new Error("Questions are required.");
    }

    if (!quizResults) {
      throw new Error("Quiz results are required.");
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
    console.log("Analyzing weak topics...");

    const prompt = weakTopicsPrompt(
      questions,
      quizResults,
      language
    );

    const response = await askGemini(prompt, 3, { json: true });

    const result = parseJsonResponse(response, 'object');

    // ==========================================
    // VALIDATE RESPONSE
    // ==========================================

    if (!result || typeof result !== "object") {
      throw new Error(
        "Weak topics response is invalid."
      );
    }

    if (!result.weakTopics) {
      throw new Error(
        "Weak topics are missing."
      );
    }

    if (!Array.isArray(result.weakTopics)) {
      throw new Error(
        "Weak topics must be an array."
      );
    }

    // ==========================================
    // VALIDATE EACH TOPIC
    // ==========================================

    for (const topic of result.weakTopics) {

      if (!topic || typeof topic.topic !== 'string' || !topic.topic.trim()) {
        throw new Error(
          "Weak topic name is missing."
        );
      }

      if (!topic.reason) {
        throw new Error(
          "Weak topic reason is missing."
        );
      }

      if (!['High', 'Medium', 'Low'].includes(topic.priority)) {
        throw new Error(
          "Weak topic priority is missing."
        );
      }

      if (!topic.suggestion) {
        throw new Error(
          "Weak topic suggestion is missing."
        );
      }
    }

    console.log(
      "Weak topics generated successfully."
    );

    return result;

  } catch (error) {
    console.error(
      "Weak Topics Generator Error:",
      error.message
    );

    throw error;
  }
}