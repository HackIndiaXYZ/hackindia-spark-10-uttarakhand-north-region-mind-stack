export function chunkTranscript(transcript, maxCharacters = 12000, overlapSentences = 2) {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1) throw new Error('Chunk size must be a positive integer.');
  if (!Number.isInteger(overlapSentences) || overlapSentences < 0) throw new Error('Overlap must be a nonnegative integer.');
  const text = String(transcript || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?।！？])\s+(?=\S)/u);
  const pieces = sentences.flatMap(sentence => {
    const out = []; let rest = sentence.trim();
    while (rest.length > maxCharacters) {
      let cut = rest.lastIndexOf(' ', maxCharacters); if (cut <= 0) cut = maxCharacters;
      out.push(rest.slice(0, cut)); rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest); return out;
  });
  const chunks = []; let current = [];
  for (const piece of pieces) {
    if ([...current, piece].join(' ').length > maxCharacters && current.length) {
      chunks.push(current.join(' '));
      current = overlapSentences ? current.slice(-overlapSentences) : [];
      while (current.length && [...current, piece].join(' ').length > maxCharacters) current.shift();
    }
    current.push(piece);
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks;
}
