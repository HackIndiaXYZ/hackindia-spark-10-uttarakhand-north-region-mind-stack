import { notesPrompt } from "../prompts/notesPrompt.js";
import { chunkTranscript } from "../utils/chunkTranscript.js";
import { batchChunks } from "../utils/batchChunks.js";
import { askGemini } from "../gemini.js";
import { mergeNotes } from "./mergeNotesGenerator.js";

export async function generateNotes(
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

    // If invalid language is received, use English
    if (!allowedLanguages.includes(language)) {
      language = "en";
    }

    console.log("Selected language:", language);

    // ==========================================
    // CREATE TRANSCRIPT CHUNKS
    // ==========================================

    const chunks = chunkTranscript(transcript);

    console.log(
      `Total transcript chunks: ${chunks.length}`
    );

    // ==========================================
    // SHORT / NORMAL LECTURE
    // ==========================================

    if (chunks.length <= 10) {
      const generatedNotes = [];

      for (let i = 0; i < chunks.length; i++) {
        console.log(
          `Generating notes for chunk ${i + 1}/${chunks.length}...`
        );

        const prompt = notesPrompt(
          chunks[i],
          language
        );

        const notes = await askGemini(prompt);

        generatedNotes.push(notes);
      }

      console.log("All chunk notes generated.");
      console.log("Using normal merge...");

      return await mergeNotes(
        generatedNotes,
        language
      );
    }

    // ==========================================
    // LONG LECTURE
    // ==========================================

    console.log("Large lecture detected.");
    console.log("Using batch processing...");

    const batches = batchChunks(chunks, 5);

    console.log(
      `Total batches: ${batches.length}`
    );

    const sectionNotes = [];

    // ==========================================
    // PROCESS EACH BATCH
    // ==========================================

    for (let i = 0; i < batches.length; i++) {
      console.log(
        `Generating notes for batch ${i + 1}/${batches.length}...`
      );

      const batchTranscript =
        batches[i].join("\n\n");

      const prompt = notesPrompt(
        batchTranscript,
        language
      );

      const notes = await askGemini(prompt);

      sectionNotes.push(notes);
    }

    console.log("All batch notes generated.");

    // ==========================================
    // FINAL MERGE
    // ==========================================

    console.log("Merging all batch notes...");

    const finalNotes = await mergeNotes(
      sectionNotes,
      language
    );

    return finalNotes;

  } catch (error) {
    console.error(
      "Notes Generator Error:",
      error.message
    );

    throw error;
  }
}