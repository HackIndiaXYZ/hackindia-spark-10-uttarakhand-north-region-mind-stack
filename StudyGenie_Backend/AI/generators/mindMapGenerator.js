import { askGemini } from "../gemini.js";
import { mindMapPrompt } from "../prompts/mindMapPrompt.js";
import { parseJsonResponse } from "../utils/parseJsonResponse.js";

export async function generateMindMap(transcript, language = "en") {
  if (!transcript?.trim()) throw new Error("Transcript is empty.");
  if (!["en", "hi", "hinglish"].includes(language)) language = "en";
  const response = await askGemini(mindMapPrompt(transcript, language), 3, { json: true });
  const mindMap = parseJsonResponse(response, 'object');
  if (typeof mindMap.central === 'string' && mindMap.central.trim() && Array.isArray(mindMap.branches)) {
    const branches = mindMap.branches.filter(x => x && typeof x.topic === 'string' && x.topic.trim() && Array.isArray(x.children)).map(x => ({ topic: x.topic.trim(), children: x.children.filter(y => typeof y === 'string' && y.trim()) }));
    if (!branches.length) throw new Error('Mind map response has no valid branches.');
    return { central: mindMap.central.trim(), branches };
  }
  const title = String(mindMap.title || '').trim();
  if (!title || !Array.isArray(mindMap.children)) throw new Error('Mind map response is invalid.');
  return {
    central: title,
    branches: mindMap.children.map((child) => ({
      topic: child?.title || child?.topic || 'Concept',
      children: Array.isArray(child?.children) ? child.children.map((item) => item?.title || item?.topic || String(item)) : [],
    })),
  };
}
