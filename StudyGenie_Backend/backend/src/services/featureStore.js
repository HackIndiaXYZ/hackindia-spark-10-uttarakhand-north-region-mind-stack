import crypto from 'node:crypto';
import { supabaseAdmin as db } from '../supabase.js';

export async function checked(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result;
}
export async function savedFeature(sourceId, userId, type) {
  return (await checked(db.from('generated_content').select('*').eq('source_id', sourceId).eq('user_id', userId).eq('feature_type', type).maybeSingle())).data;
}
const inFlight = new Map();
// Single flight within a server, renewable database lease across server instances.
export function withGenerationLock(sourceId, userId, type, work) {
  const key = `${userId}:${sourceId}:${type}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = (async () => {
    const owner = crypto.randomUUID();
    const args = { p_source: sourceId, p_user: userId, p_feature: type, p_owner: owner };
    const { data } = await checked(db.rpc('claim_generation', args));
    if (!data) throw Object.assign(new Error('Generation is already running. Your saved content is safe; wait and open it again.'), { status: 409 });
    let lost = false;
    const heartbeat = setInterval(() => {
      checked(db.rpc('renew_generation', args)).then(r => { if (!r.data) lost = true; }).catch(() => { lost = true; });
    }, 30000);
    heartbeat.unref?.();
    try {
      return await work(() => { if (lost) throw new Error('Generation lease was lost. Please reload before retrying.'); });
    } finally {
      clearInterval(heartbeat);
      await checked(db.rpc('release_generation', args)).catch(error => console.error('[generation release]', error.message));
    }
  })();
  inFlight.set(key, promise);
  promise.finally(() => { if (inFlight.get(key) === promise) inFlight.delete(key); }).catch(() => {});
  return promise;
}
export async function generateSaved({ sourceId, userId, type, attempt = null, generate }) {
  const currentForAttempt = row => row && (!attempt || row.content_json?.attemptId === attempt.id || (!row.content_json?.attemptId && Date.parse(row.created_at) >= Date.parse(attempt.created_at)));
  const existing = await savedFeature(sourceId, userId, type);
  if (currentForAttempt(existing)) return { feature: existing, cached: true };
  return withGenerationLock(sourceId, userId, type, async assertLease => {
    const current = await savedFeature(sourceId, userId, type);
    if (currentForAttempt(current)) return { feature: current, cached: true };
    const output = await generate();
    assertLease();
    const payload = { source_id: sourceId, user_id: userId, type, feature_type: type, ...output, updated_at: new Date().toISOString() };
    const query = attempt ? db.from('generated_content').upsert(payload, { onConflict: 'source_id,feature_type' }) : db.from('generated_content').insert(payload);
    const { data } = await checked(query.select('*').single());
    return { feature: data, cached: false };
  });
}
