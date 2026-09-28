import { supabaseAdmin } from '../supabase.js';
import { transcribeYouTube } from './pythonWorker.js';
import { cleanTranscript } from './transcriptCleaner.js';
import { generateNotes } from './aiAdapter.js';
import { generateSaved } from './featureStore.js';
import { config } from '../config.js';
import { apiError } from './apiError.js';

const activeJobs = new Set();
const queue = [];
let running = 0;
const concurrency = Math.max(1, Math.min(4, Number(process.env.MAX_CONCURRENT_TRANSCRIPTIONS) || 1));
function drain() {
  while (running < concurrency && queue.length) {
    running++;
    queue.shift()().catch(error => console.error('[queue]', error.message)).finally(() => { running--; drain(); });
  }
}
export async function dbResult(query) { const result = await query; if (result.error) throw result.error; return result; }


export function normalizeYouTubeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    const host = url.hostname.replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) throw new Error();
    const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
    if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) throw new Error();
    return 'https://www.youtube.com/watch?v=' + id;
  } catch (_) {
    throw new Error('Enter a valid YouTube URL.');
  }
}

export async function getOwnedSource(sourceId, userId) {
  const { data, error } = await supabaseAdmin
    .from('study_sources').select('*').eq('id', sourceId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Lecture not found.');
  if (['queued', 'processing'].includes(data.status) && !activeJobs.has(`${userId}:${sourceId}`) && Date.now() - Date.parse(data.updated_at || data.created_at) > 6 * 60 * 60 * 1000) {
    await dbResult(supabaseAdmin.from('study_sources').update({ status: 'error', error_message: 'Processing was interrupted by a backend restart. Submit the lecture again.' }).eq('id', sourceId).eq('user_id', userId));
    data.status = 'error'; data.error_message = 'Processing was interrupted by a backend restart. Submit the lecture again.';
  }
  return data;
}

export async function startSourceProcessing(sourceId, userId, url, language = 'en') {
  const jobKey = `${userId}:${sourceId}`;
  if (activeJobs.has(jobKey)) return;
  activeJobs.add(jobKey);

  queue.push(async () => {
    try {
      await dbResult(supabaseAdmin.from('study_sources').update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() }).eq('id', sourceId).eq('user_id', userId));
      const raw = await transcribeYouTube(url);
      const cleaned = await cleanTranscript(raw.text);

      const { data: transcript, error: txError } = await supabaseAdmin.from('transcripts').insert({
        source_id: sourceId,
        user_id: userId,
        title: raw.title,
        video_id: raw.video_id,
        channel: raw.channel,
        duration_seconds: raw.duration_seconds,
        detected_language: raw.detected_language,
        raw_text: raw.text,
        cleaned_text: cleaned,
        segments: raw.segments,
      }).select('*').single();
      if (txError) throw txError;

      let notesError = null;

      if (config.autoGenerateNotes) {
        try {
          await generateSaved({ sourceId, userId, type: 'notes', generate: async () => ({
            title: `${raw.title} — Notes`, content_text: await generateNotes(cleaned, language), content_json: null,
          }) });
        } catch (noteError) {
          console.error('[notes:auto]', noteError);
          notesError = apiError(noteError, { lectureSaved:true }).error + ' Use Generate Notes when you are ready.';
        }
      }
      await dbResult(supabaseAdmin.from('study_sources').update({ status: 'ready', updated_at: new Date().toISOString(), title: raw.title, duration_seconds: raw.duration_seconds, error_message: notesError }).eq('id', sourceId).eq('user_id', userId));
    } catch (error) {
      console.error('[source job]', error);
      await supabaseAdmin.from('study_sources').update({ status: 'error', error_message: String(error.message || error).slice(0, 1000) }).eq('id', sourceId).eq('user_id', userId);
    } finally {
      activeJobs.delete(jobKey);
    }
  });
  drain();
}

export async function getTranscriptForSource(sourceId, userId) {
  const source = await getOwnedSource(sourceId, userId);
  if (source.status !== 'ready') throw new Error('Transcript is not ready yet.');
  const { data, error } = await supabaseAdmin.from('transcripts').select('*').eq('source_id', sourceId).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Transcript not found.');
  return { source, transcript: data };
}
