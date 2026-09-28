import { dbResult } from '../services/sourceService.js';
import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

export const progressRouter = Router();


progressRouter.get('/progress', async (req, res, next) => {
  try {
    const [{ count: lectureCount }, { count: toolCount }, { data: attempts }] = await Promise.all([
      dbResult(supabaseAdmin.from('study_sources').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('status', 'ready')),
      dbResult(supabaseAdmin.from('generated_content').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id)),
      dbResult(supabaseAdmin.from('quiz_attempts').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(20)),
    ]);
    const latest = attempts?.[0];
    const topicMap = new Map();
    for (const attempt of attempts || []) {
      for (const row of attempt.answers || []) {
        const topic = row.topic || 'Lecture Concepts';
        const cur = topicMap.get(topic) || { correct: 0, total: 0 };
        cur.total++; if (row.isCorrect) cur.correct++; topicMap.set(topic, cur);
      }
    }
    const topics = [...topicMap.entries()].map(([topic, v]) => ({ topic, accuracy: Math.round((v.correct / v.total) * 100) }));
    const average = topics.length ? Math.round(topics.reduce((sum, x) => sum + x.accuracy, 0) / topics.length) : 0;
    res.json({ lectureCount: lectureCount || 0, toolCount: toolCount || 0, latestScore: latest ? `${latest.percentage}%` : '—', average, topics });
  } catch (e) { next(e); }
});
