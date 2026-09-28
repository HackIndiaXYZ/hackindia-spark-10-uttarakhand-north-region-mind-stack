import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { checked, withGenerationLock } from '../services/featureStore.js';
import { compareAttempts } from '../services/retestService.js';

export const quizzesRouter = Router();


quizzesRouter.post('/quizzes/:id/submit', async (req, res, next) => {
  try {
    const { data: quiz, error } = await supabaseAdmin.from('quizzes').select('*').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (error || !quiz) return res.status(404).json({ error: 'Quiz not found.' });
    if (quiz.kind === 'retest') {
      const answers = req.body?.answers;
      if (!Array.isArray(answers) || answers.length !== quiz.questions.length ||
        answers.some((answer, i) => !Number.isInteger(answer) || answer < 0 || answer >= quiz.questions[i].options.length)) {
        return res.status(400).json({ error: 'Answer every re-test question before submitting.' });
      }
      const result = await withGenerationLock(quiz.source_id, req.user.id, `submit:${quiz.id}`, async assertLease => {
        const { data: baseline } = await checked(supabaseAdmin.from('quiz_attempts').select('*')
          .eq('id', quiz.baseline_attempt_id).eq('source_id', quiz.source_id).eq('user_id', req.user.id).single());
        if (!baseline) throw Object.assign(new Error('The original quiz result is unavailable.'), { status: 409 });
        let { data: attempt } = await checked(supabaseAdmin.from('quiz_attempts').select('*')
          .eq('quiz_id', quiz.id).eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle());
        if (!attempt) {
          const evaluated = quiz.questions.map((q, i) => ({ question: q.question, topic: q.topic,
            selectedIndex: answers[i], selectedAnswer: q.options[answers[i]], correctAnswer: q.correctAnswer,
            isCorrect: q.options[answers[i]] === q.correctAnswer, explanation: q.explanation }));
          const score = evaluated.filter(a => a.isCorrect).length, total = evaluated.length;
          assertLease();
          attempt = (await checked(supabaseAdmin.from('quiz_attempts').insert({ quiz_id: quiz.id,
            source_id: quiz.source_id, user_id: req.user.id, score, total,
            percentage: Math.round(100 * score / total), answers: evaluated }).select('*').single())).data;
        }
        return { attempt, comparison: compareAttempts(baseline, attempt, quiz.practice_topics) };
      });
      return res.json(result);
    }
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const evaluated = quiz.questions.map((q, i) => {
      const selectedIndex = Number.isInteger(answers[i]) ? answers[i] : -1;
      const selectedAnswer = selectedIndex >= 0 ? q.options?.[selectedIndex] : null;
      return { question: q.question, topic: q.topic || 'Lecture Concepts', selectedIndex, selectedAnswer, correctAnswer: q.correctAnswer, isCorrect: selectedAnswer === q.correctAnswer, explanation: q.explanation };
    });
    const score = evaluated.filter((x) => x.isCorrect).length;
    const total = evaluated.length;
    const percentage = total ? Math.round((score / total) * 100) : 0;
    const { data: attempt, error: attemptError } = await supabaseAdmin.from('quiz_attempts').insert({ quiz_id: quiz.id, source_id: quiz.source_id, user_id: req.user.id, score, total, percentage, answers: evaluated }).select('*').single();
    if (attemptError) throw attemptError;

    const byTopic = new Map();
    for (const row of evaluated) {
      const key = row.topic || 'Lecture Concepts';
      const cur = byTopic.get(key) || { correct: 0, total: 0 };
      cur.total += 1; if (row.isCorrect) cur.correct += 1; byTopic.set(key, cur);
    }
    const topics = [...byTopic.entries()].map(([topic, x]) => ({ topic, accuracy: Math.round((x.correct / x.total) * 100) }));
    const weakTopics = topics.filter((x) => x.accuracy < 60);
    res.json({ attempt, weakTopics });
  } catch (e) { next(e); }
});
