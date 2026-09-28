import { Router } from 'express';
import { getOwnedSource, getTranscriptForSource } from '../services/sourceService.js';
import { retestContext, readRetest, startRetest } from '../services/retestService.js';

export const retestsRouter = Router();
retestsRouter.get('/study-sources/:id/retest', async (req, res, next) => {
  try {
    const source = await getOwnedSource(req.params.id, req.user.id);
    const { baseline, topics } = await retestContext(source.id, req.user.id);
    res.json({ topics, retest: await readRetest(source.id, req.user.id, baseline) });
  } catch (error) { next(error); }
});
retestsRouter.post('/study-sources/:id/retest', async (req, res, next) => {
  try {
    const { source, transcript } = await getTranscriptForSource(req.params.id, req.user.id);
    res.locals.lectureSaved = true;
    res.json({ retest: await startRetest(source, transcript, req.user.id, req.body?.previousQuizId) });
  } catch (error) { next(error); }
});
