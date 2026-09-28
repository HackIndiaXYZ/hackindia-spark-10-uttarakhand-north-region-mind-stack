import { parseJsonResponse } from "../utils/parseJsonResponse.js";
import { askGemini } from "../gemini.js";
import { smartRevisionPrompt } from "../prompts/smartRevisionPrompt.js";

export async function generateSmartRevision(
  questions,
  quizResults,
  lectureContent,
  language = "en",
) {
  try {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("Questions are required.");
    }

    if (!quizResults) {
      throw new Error("Quiz results are required.");
    }

    if (
      !lectureContent ||
      typeof lectureContent !== "string" ||
      !lectureContent.trim()
    ) {
      throw new Error("Lecture content is required.");
    }

    const allowedLanguages = ["en", "hi", "hinglish"];

    if (!allowedLanguages.includes(language)) {
      language = "en";
    }

    console.log("Selected language:", language);
    console.log("Generating smart revision...");

    const prompt = smartRevisionPrompt(
      questions,
      quizResults,
      lectureContent,
      language,
    );

    const response = await askGemini(prompt, 3, { json: true });

    const revision = parseJsonResponse(response, "object");

    // ==========================================
    // VALIDATE BASIC RESPONSE
    // ==========================================

    if (!revision || typeof revision !== "object" || Array.isArray(revision)) {
      throw new Error("Smart revision response is invalid.");
    }

    // ==========================================
    // OVERALL PERFORMANCE
    // ==========================================

    if (
      !revision.overallPerformance ||
      typeof revision.overallPerformance !== "object"
    ) {
      throw new Error("Overall performance is missing.");
    }

    const performance = revision.overallPerformance;

    if (
      typeof performance.score !== "number" ||
      typeof performance.total !== "number" ||
      typeof performance.percentage !== "number"
    ) {
      throw new Error("Overall performance contains invalid values.");
    }

    // ==========================================
    // WEAK TOPICS
    // ==========================================

    if (!Array.isArray(revision.weakTopics)) {
      throw new Error("Weak topics are missing.");
    }

    for (const item of revision.weakTopics) {
      if (!item || typeof item !== "object") {
        throw new Error("Invalid weak topic entry.");
      }

      if (typeof item.topic !== "string" || !item.topic.trim()) {
        throw new Error("Weak topic name is missing.");
      }

      if (!["High", "Medium", "Low"].includes(item.priority)) {
        throw new Error(`Invalid priority for topic: ${item.topic}`);
      }

      if (typeof item.whyWeak !== "string") {
        item.whyWeak = "";
      }

      if (typeof item.revisionNote !== "string" || !item.revisionNote.trim()) {
        throw new Error(`Revision explanation is missing for topic: ${item.topic}`);
      }

      if (typeof item.definition !== "string") {
        item.definition = "";
      }

      if (typeof item.keyPoint !== "string") {
        item.keyPoint = "";
      }

      if (typeof item.formula !== "string") {
        item.formula = "";
      }

      if (typeof item.example !== "string") {
        item.example = "";
      }

      // ==========================================
      // MISTAKE DETAILS
      // ==========================================

      if (!item.mistake || typeof item.mistake !== "object") {
        item.mistake = {
          question: "",
          studentAnswer: "",
          correctAnswer: "",
        };
      }

      if (typeof item.mistake.question !== "string") {
        item.mistake.question = "";
      }

      if (typeof item.mistake.studentAnswer !== "string") {
        item.mistake.studentAnswer = "";
      }

      if (typeof item.mistake.correctAnswer !== "string") {
        item.mistake.correctAnswer = "";
      }
    }

    // ==========================================
    // STRONG TOPICS
    // ==========================================

    if (!Array.isArray(revision.strongTopics)) {
      revision.strongTopics = [];
    }

    for (const item of revision.strongTopics) {
      if (!item || typeof item !== "object") {
        continue;
      }

      if (typeof item.topic !== "string") {
        item.topic = "";
      }

      if (typeof item.reason !== "string") {
        item.reason = "";
      }
    }

    console.log("Smart revision generated successfully.");

    return revision;
  } catch (error) {
    console.error("Smart Revision Generator Error:", error.message);

    throw error;
  }
}
