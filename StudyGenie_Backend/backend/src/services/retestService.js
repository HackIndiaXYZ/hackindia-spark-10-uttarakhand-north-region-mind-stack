import { supabaseAdmin as db } from '../supabase.js';
import { checked, savedFeature, withGenerationLock } from './featureStore.js';
import { generateRetest } from '../../../AI/generators/retestGenerator.js';

export async function latestQuizAttempt(sourceId, userId) {
  const { data: quizzes } = await checked(db.from('quizzes').select('id')
    .eq('source_id', sourceId).eq('user_id', userId).eq('kind', 'quiz'));
  if (!quizzes.length) return null;
  return (await checked(db.from('quiz_attempts').select('*').eq('source_id', sourceId)
    .eq('user_id', userId).in('quiz_id', quizzes.map(q => q.id))
    .order('created_at', { ascending: false }).limit(1).maybeSingle())).data;
}

export function currentRevision(row, attempt) {
  return !!(row && attempt && (row.content_json?.attemptId === attempt.id ||
    (!row.content_json?.attemptId && Date.parse(row.created_at) >= Date.parse(attempt.created_at))));
}

export function topicScores(answers = []) {
  const scores = new Map();
  for (const answer of answers) {
    const topic = answer.topic || 'Lecture Concepts';
    const score = scores.get(topic) || { topic, correct: 0, total: 0 };
    score.total++; if (answer.isCorrect) score.correct++;
    scores.set(topic, score);
  }
  return [...scores.values()].map(x => ({ ...x, percentage: Math.round(100 * x.correct / x.total) }));
}

export function compareAttempts(baseline, attempt, topics) {
  const before = topicScores(baseline.answers), after = topicScores(attempt.answers);
  const original = baseline.answers.filter(a => topics.includes(a.topic || 'Lecture Concepts'));
  const beforePercentage = original.length ? Math.round(original.filter(a => a.isCorrect).length * 100 / original.length) : null;
  return {
    originalQuizPercentage: baseline.percentage,
    beforePercentage, afterPercentage: attempt.percentage,
    change: beforePercentage === null ? null : attempt.percentage - beforePercentage,
    mastered: attempt.score === attempt.total && attempt.total > 0,
    topics: topics.map(topic => ({ topic,
      before: before.find(x => x.topic === topic) || null,
      after: after.find(x => x.topic === topic) || null,
    })),
  };
}

export async function retestContext(sourceId, userId) {
  const [baseline, revision] = await Promise.all([
    latestQuizAttempt(sourceId, userId), savedFeature(sourceId, userId, 'revision'),
  ]);
  if (!currentRevision(revision, baseline)) throw Object.assign(new Error('Generate Smart Revision for your latest quiz first.'), { status: 409 });
  // Use server-graded mistakes, never client topics or model-invented weaknesses.
  const topics = [...new Set(baseline.answers.filter(a => !a.isCorrect).map(a => a.topic || 'Lecture Concepts'))];
  return { baseline, revision, topics };
}

export async function readRetest(sourceId, userId, baseline) {
  const row = await savedFeature(sourceId, userId, 'retest');
  if (!row || row.content_json?.baselineAttemptId !== baseline.id) return null;
  const { data: quiz } = await checked(db.from('quizzes').select('*').eq('id', row.content_json.quizId)
    .eq('source_id', sourceId).eq('user_id', userId).single());
  const { data: attempt } = await checked(db.from('quiz_attempts').select('*').eq('quiz_id', quiz.id)
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle());
  return { quizId: quiz.id, topics: quiz.practice_topics,
    questions: quiz.questions.map(({ correctAnswer, explanation, ...q }) => q),
    attempt, comparison: attempt ? compareAttempts(baseline, attempt, quiz.practice_topics) : null };
}

export async function startRetest(source, transcript, userId, previousQuizId) {
  return withGenerationLock(source.id, userId, 'retest', async assertLease => {
    const { baseline, revision, topics } = await retestContext(source.id, userId);
    if (!topics.length) throw Object.assign(new Error('Your original quiz has no weak topics. You can practice the full Quiz again.'), { status: 409 });
    const current = await readRetest(source.id, userId, baseline);
    // Resume unfinished work. A retry of an old request cannot create another quiz.
    if (current && (!current.attempt || previousQuizId !== current.quizId)) return current;
    const questions = await generateRetest(transcript.cleaned_text, topics, revision.content_json,
      source.language || 'en', [...baseline.answers, ...(current?.questions || [])]);
    const latest = await latestQuizAttempt(source.id, userId);
    if (latest?.id !== baseline.id) throw Object.assign(new Error('Your quiz changed. Generate Smart Revision again before re-testing.'), { status: 409 });
    assertLease();
    const { data: quiz } = await checked(db.from('quizzes').insert({ source_id: source.id, user_id: userId,
      title: `${source.title || 'Lecture'} Re-test`, kind: 'retest', baseline_attempt_id: baseline.id,
      practice_topics: topics, questions }).select('*').single());
    await checked(db.from('generated_content').upsert({ source_id: source.id, user_id: userId,
      type: 'retest', feature_type: 'retest', title: 'Re-test', updated_at: new Date().toISOString(),
      content_json: { quizId: quiz.id, baselineAttemptId: baseline.id } }, { onConflict: 'source_id,feature_type' }));
    return { quizId: quiz.id, topics, questions: questions.map(({ correctAnswer, explanation, ...q }) => q), attempt: null, comparison: null };
  });
}
