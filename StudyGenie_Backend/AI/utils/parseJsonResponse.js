// Extract complete JSON containers, respecting quoted braces and escapes.
export function parseJsonResponse(response, expected = 'any') {
  const text = String(response ?? '').trim();
  if (!text) throw new Error('AI returned an empty response.');
  const matches = value => expected === 'any' || (expected === 'array' ? Array.isArray(value) : value !== null && typeof value === 'object' && !Array.isArray(value));
  const parse = s => { try { let v = JSON.parse(s); if (expected === 'array' && v && !Array.isArray(v) && typeof v === 'object') { const key = ['cards', 'flashcards', 'questions', 'quiz', 'data'].find(key => Array.isArray(v[key])); if (key) v = v[key]; } return matches(v) ? { value: v } : null; } catch { return null; } };
  const direct = parse(text); if (direct) return direct.value;
  for (let start = 0; start < text.length; start++) {
    if (!['[', '{'].includes(text[start])) continue;
    let quoted = false, escaped = false; const stack = [];
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
      if (c === '"') { quoted = true; continue; }
      if (c === '[' || c === '{') stack.push(c);
      if (c === ']' || c === '}') {
        if (stack.pop() !== (c === ']' ? '[' : '{')) break;
        if (!stack.length) { const result = parse(text.slice(start, i + 1)); if (result) return result.value; start = i; break; }
      }
    }
  }
  throw new Error('AI response did not contain valid ' + expected + ' JSON. Please retry generation.');
}
