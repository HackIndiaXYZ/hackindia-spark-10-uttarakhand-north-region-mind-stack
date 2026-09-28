import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
if (!process.env.GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY in backend/.env first.');
let pageToken = '';
do {
  const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const response = await fetch(url, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Model listing failed (HTTP ' + response.status + '). Check API key/project access.');
  const body = await response.json();
  for (const model of body.models || []) if (model.supportedGenerationMethods?.includes('generateContent')) console.log(model.name.replace(/^models\//, ''));
  pageToken = body.nextPageToken || '';
} while (pageToken);
