import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config({
  path: new URL("../backend/.env", import.meta.url),
  quiet: true,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function askGemini(prompt, maxRetries = 3, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;

  const primaryModel = options.model || process.env.GEMINI_MODEL;

  const fallbackModel =
    options.fallbackModel ||
    process.env.GEMINI_FALLBACK_MODEL ||
    process.env.CLEANER_GEMINI_MODEL;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  if (!primaryModel) {
    throw new Error("GEMINI_MODEL is missing.");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 120000,
    },
  });

  async function request(model) {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      ...(options.json
        ? {
            config: {
              responseMimeType: "application/json",
            },
          }
        : {}),
    });

    const text = response?.text?.trim();

    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    return text;
  }

  let lastError;

  // Try main model first
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await request(primaryModel);
    } catch (error) {
      lastError = error;

      const status = Number(error?.status || error?.code);

      console.warn(
        `[Gemini] ${primaryModel} attempt ${attempt}/${maxRetries} failed`,
        status || error?.message,
      );

      // Retry only temporary errors
      if (![429, 500, 502, 503, 504].includes(status)) {
        throw Object.assign(error, { provider:'gemini' });
      }

      if (attempt < maxRetries) {
        const wait = Math.min(2000 * Math.pow(2, attempt - 1), 15000);

        console.log(`[Gemini] waiting ${wait / 1000}s before retry...`);

        await sleep(wait);
      }
    }
  }

  // If main model still fails, use fallback
  if (fallbackModel && fallbackModel !== primaryModel) {
    console.warn(`[Gemini] switching to fallback model: ${fallbackModel}`);

    try { return await request(fallbackModel); }
    catch (error) { throw Object.assign(error, { provider:'gemini', fallbackExhausted:true }); }
  }

  throw Object.assign(lastError || new Error('AI is temporarily unavailable.'), { provider:'gemini' });
}
