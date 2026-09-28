import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

export const meRouter = Router();


meRouter.get('/me', async (req, res, next) => {
  try {
    const { data: profile, error } = await supabaseAdmin.from('profiles').select('*').eq('id', req.user.id).maybeSingle();
    if (error) throw error;
    res.json({ user: { id: req.user.id, email: req.user.email, profile: profile || req.user.user_metadata || {} } });
  } catch (e) { next(e); }
});

meRouter.patch('/me', async (req, res, next) => {
  try {
    const profile = {
      id: req.user.id,
      full_name: String(req.body?.full_name || '').trim().slice(0, 100),
      mobile: String(req.body?.mobile || '').trim().slice(0, 30),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin.from('profiles').upsert(profile).select('*').single();
    if (error) throw error;
    res.json({ profile: data });
  } catch (e) { next(e); }
});
