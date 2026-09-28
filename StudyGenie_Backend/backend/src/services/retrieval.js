const stop = new Set('the a an is are was were of to in on and or for with this that what how why explain please lecture'.split(' '));
const words = text => (String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length > 1 && !stop.has(w));
export function transcriptChunks(text, size = 1800, overlap = 200) {
  const chunks = [];
  for (let start = 0; start < text.length; start += size - overlap) chunks.push({ index: chunks.length, text: text.slice(start, start + size) });
  return chunks;
}
// Deterministic keyword retrieval: no embedding API, training, or extra Gemini call.
export function retrieveContext(text, question, history = []) {
  const chunks = transcriptChunks(text);
  const query = [...new Set(words(question + ' ' + history.slice(-2).map(x => x.question).join(' ')))];
  const scored = chunks.map(chunk => {
    const tokens = words(chunk.text), counts = new Map();
    for (const word of tokens) counts.set(word, (counts.get(word) || 0) + 1);
    return { ...chunk, score: query.reduce((sum, word) => sum + Math.min(counts.get(word) || 0, 4), 0) };
  });
  let selected = scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 5);
  if (selected.every(x => x.score === 0) && chunks.length > 5) {
    selected = Array.from({ length: 5 }, (_, i) => chunks[Math.round(i * (chunks.length - 1) / 4)]);
  }
  selected.sort((a, b) => a.index - b.index);
  return { context: selected.map(x => `[Transcript excerpt ${x.index + 1}]\n${x.text}`).join('\n\n'), excerpts: selected.map(x => x.index + 1) };
}
