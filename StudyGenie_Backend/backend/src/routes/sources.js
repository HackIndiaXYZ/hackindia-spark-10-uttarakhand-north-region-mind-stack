import { Router } from "express";

import crypto from "node:crypto";

import { supabaseAdmin } from "../supabase.js";

import {
  dbResult,
  getOwnedSource,
  getTranscriptForSource,
  normalizeYouTubeUrl,
  startSourceProcessing,
} from "../services/sourceService.js";

import {
  generateNotes,
  generateSummary,
  generateMindMap,
  generateQuestions,
  chatWithLecture,
  flashcardsForFrontend,
  generateQuiz,
  revisionAdapter,
} from "../services/aiAdapter.js";

import {
  checked,
  savedFeature,
  generateSaved,
  withGenerationLock,
} from "../services/featureStore.js";

import { retrieveContext } from "../services/retrieval.js";

import { latestQuizAttempt as latestAttempt, currentRevision, readRetest } from "../services/retestService.js";

export const sourcesRouter = Router();

const sourceRequests = new Map();

const languageOf = (req, source) =>
  ["en", "hi", "hinglish"].includes(source?.language)
    ? source.language
    : ["en", "hi", "hinglish"].includes(req.body?.language)
      ? req.body.language
      : "en";

sourcesRouter.post("/study-sources", async (req, res, next) => {
  try {
    const url = normalizeYouTubeUrl(req.body?.url),
      language = languageOf(req);

    const key = req.user.id + ":" + url;

    if (!sourceRequests.has(key)) {
      const work = (async () => {
        const args = {
          p_user: req.user.id,
          p_url: url,
          p_hash: crypto.createHash("sha256").update(url).digest("hex"),
          p_language: language,
        }; // The RPC holds a transaction lock, including across separate Node processes.

        for (let attempt = 0; attempt < 2; attempt++) {
          const { data } = await checked(
            supabaseAdmin.rpc("get_or_create_study_source", args),
          );

          if (data.created) {
            await startSourceProcessing(
              data.source.id,
              req.user.id,
              url,
              language,
            );

            return { source: data.source, created: true };
          }

          const source = await getOwnedSource(data.source.id, req.user.id);

          if (source.status !== "error") return { source, created: false };
        }

        throw Object.assign(
          new Error(
            "Lecture submission is temporarily unavailable. Please retry later.",
          ),
          { status: 503 },
        );
      })();

      sourceRequests.set(key, work);

      work
        .finally(() => {
          if (sourceRequests.get(key) === work) sourceRequests.delete(key);
        })
        .catch(() => {});
    }

    const result = await sourceRequests.get(key);

    res
      .status(result.created ? 202 : 200)
      .json({
        source: result.source,
        cached: result.source.status === "ready",
        reused: !result.created,
      });
  } catch (e) {
    next(e);
  }
});

sourcesRouter.get("/study-sources/:id", async (req, res, next) => {
  try {
    const source = await getOwnedSource(req.params.id, req.user.id);

    let transcript = null;

    if (source.status === "ready") {
      const { data, error } = await supabaseAdmin
        .from("transcripts")
        .select("title,duration_seconds,detected_language")
        .eq("source_id", source.id)
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      transcript = data || null;
    }

    res.json({ source, transcript });
  } catch (e) {
    next(e);
  }
});

const featureTitles = {
  notes: "Notes",
  summary: "Summary",
  mindmap: "Mind Map",
  questions: "Important Questions",
  flashcards: "Flashcards",
  quiz: "Quiz",
  revision: "Smart Revision",
};

const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

async function publicFeature(row, userId) {
  if (!row || row.feature_type !== "quiz") return row;

  const { data: quiz } = await checked(
    supabaseAdmin
      .from("quizzes")
      .select("*")
      .eq("id", row.content_json.quizId)
      .eq("user_id", userId)
      .single(),
  );

  return {
    ...row,
    content_json: {
      quizId: quiz.id,
      questions: quiz.questions.map(
        ({ correctAnswer, explanation, ...q }) => q,
      ),
    },
  };
}

sourcesRouter.get("/study-sources", async (req, res, next) => {
  try {
    const { data } = await checked(
      supabaseAdmin
        .from("study_sources")
        .select("id,title,status,language,created_at,url,url_hash")
        .eq("user_id", req.user.id)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(100),
    );

    const seen = new Set();

    const sources = data.filter((source) => {
      let key;
      try {
        key = normalizeYouTubeUrl(source.url);
      } catch {
        key = source.url_hash || source.id;
      }

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });

    res.json({ sources });
  } catch (e) {
    next(e);
  }
});

sourcesRouter.get("/study-sources/:id/features", async (req, res, next) => {
  try {
    const source = await getOwnedSource(req.params.id, req.user.id);

    const [{ data: rows }, attempt, { data: locks }, { data: chats }] =
      await Promise.all([
        checked(
          supabaseAdmin
            .from("generated_content")
            .select("feature_type,title,updated_at,created_at,content_json")
            .eq("source_id", source.id)
            .eq("user_id", req.user.id),
        ),

        latestAttempt(source.id, req.user.id),

        checked(
          supabaseAdmin
            .from("generation_locks")
            .select("feature_type,expires_at")
            .eq("source_id", source.id)
            .eq("user_id", req.user.id),
        ),

        checked(
          supabaseAdmin
            .from("chat_turns")
            .select("id")
            .eq("source_id", source.id)
            .eq("user_id", req.user.id)
            .limit(1),
        ),
      ]);

    const features = Object.fromEntries(
      Object.keys(featureTitles).map((type) => [type, { generated: false }]),
    );

    for (const row of rows) {
      const currentRevision =
        row.feature_type !== "revision" ||
        (attempt &&
          (row.content_json?.attemptId === attempt.id ||
            (!row.content_json?.attemptId &&
              Date.parse(row.created_at) >= Date.parse(attempt.created_at))));

      features[row.feature_type] = {
        generated: !!currentRevision,
        updatedAt: row.updated_at,
      };
    }

    for (const lock of locks)
      if (
        Date.parse(lock.expires_at) > Date.now() &&
        features[lock.feature_type]
      )
        features[lock.feature_type].generating = true;

    const revision = rows.find(row => row.feature_type === 'revision');
    const retest = attempt && currentRevision(revision, attempt)
      ? await readRetest(source.id, req.user.id, attempt) : null;
    features.retest = { generated: !!retest,
      generating: locks.some(lock => lock.feature_type === 'retest' && Date.parse(lock.expires_at) > Date.now()),
      completed: !!retest?.attempt, mastered: !!retest?.comparison?.mastered };
    features.chat = { generated: chats.length > 0 };

    res.json({
      source,
      features,
      quizCompleted: !!attempt,
      quizProgress: attempt
        ? {
            score: attempt.score,
            total: attempt.total,
            percentage: attempt.percentage,
          }
        : null,
    });
  } catch (e) {
    next(e);
  }
});

sourcesRouter.get(
  "/study-sources/:id/features/:type",
  async (req, res, next) => {
    try {
      if (!featureTitles[req.params.type])
        return res.status(400).json({ error: "Unsupported feature." });

      await getOwnedSource(req.params.id, req.user.id);

      const row = await savedFeature(
        req.params.id,
        req.user.id,
        req.params.type,
      );

      if (req.params.type === "revision" && row) {
        const attempt = await latestAttempt(req.params.id, req.user.id);

        if (
          !attempt ||
          !(
            row.content_json?.attemptId === attempt.id ||
            (!row.content_json?.attemptId &&
              Date.parse(row.created_at) >= Date.parse(attempt.created_at))
          )
        )
          return res.json({ feature: null });
      }

      res.json({ feature: await publicFeature(row, req.user.id) });
    } catch (e) {
      next(e);
    }
  },
);

sourcesRouter.get("/study-sources/:id/notes/latest", async (req, res, next) => {
  try {
    const source = await getOwnedSource(req.params.id, req.user.id);

    const note = await savedFeature(source.id, req.user.id, "notes");

    res.json({
      title: note?.title || "Notes",
      note,
      error: source.error_message,
    });
  } catch (e) {
    next(e);
  }
});

async function generateFeature(req, res, next) {
  try {
    const type = req.params.type || req.body?.type;

    if (!featureTitles[type])
      return res.status(400).json({ error: "Unsupported generation type." });

    if (req.body?.regenerate)
      return res
        .status(400)
        .json({
          error: "Regeneration is disabled. Open the saved feature instead.",
        });

    const { source, transcript } = await getTranscriptForSource(
      req.params.id,
      req.user.id,
    );

    res.locals.lectureSaved = true;

    const attempt =
      type === "revision" ? await latestAttempt(source.id, req.user.id) : null;

    if (type === "revision" && !attempt)
      return res.status(400).json({ error: "Complete a quiz first." });

    const result = await generateSaved({
      sourceId: source.id,
      userId: req.user.id,
      type,
      attempt,
      generate: async () => {
        const language = languageOf(req, source),
          text = transcript.cleaned_text;

        let output;

        if (type === "notes") output = await generateNotes(text, language);

        if (type === "summary") output = await generateSummary(text, language);

        if (type === "mindmap") output = await generateMindMap(text, language);

        if (type === "questions")
          output = await generateQuestions(text, language);

        if (type === "flashcards")
          output = { cards: await flashcardsForFrontend(text, language) };

        if (type === "quiz") {
          const questions = (await generateQuiz(text, language)).map((q) => ({
            ...q,
            topic: q.topic || "Lecture Concepts",
          }));

          const { data: quiz } = await checked(
            supabaseAdmin
              .from("quizzes")
              .insert({
                source_id: source.id,
                user_id: req.user.id,
                title: `${source.title || "Lecture"} Quiz`,
                questions,
                kind: "quiz",
              })
              .select("*")
              .single(),
          );

          output = { quizId: quiz.id };
        }

        if (type === "revision") {
          const { data: quiz } = await checked(
            supabaseAdmin
              .from("quizzes")
              .select("*")
              .eq("id", attempt.quiz_id)
              .eq("user_id", req.user.id)
              .single(),
          );

          const revision = await revisionAdapter(
            quiz.questions,
            attempt,
            text,
            language,
          );

          return {
            title: featureTitles[type],
            content_text: revision.text,
            content_json: { ...revision.revision, attemptId: attempt.id },
          };
        }

        return {
          title: `${source.title || "Lecture"} — ${featureTitles[type]}`,
          content_text: typeof output === "string" ? output : null,
          content_json: typeof output === "string" ? null : output,
        };
      },
    });

    const feature = await publicFeature(result.feature, req.user.id); // Compatibility with earlier frontend integrations.

    res.json({
      ...result,
      feature,
      title: feature.title,
      content: feature.content_text,
      data: feature.content_json,
      note: type === "notes" ? feature : undefined,

      flashcards:
        type === "flashcards"
          ? { id: feature.id, cards: feature.content_json.cards }
          : undefined,

      quiz:
        type === "quiz"
          ? {
              id: feature.content_json.quizId,
              title: feature.title,
              questions: feature.content_json.questions,
            }
          : undefined,

      revision: type === "revision" ? feature.content_text : undefined,
    });
  } catch (e) {
    next(e);
  }
}

sourcesRouter.post("/study-sources/:id/features/:type", generateFeature);

sourcesRouter.post("/study-sources/:id/generate", generateFeature);

for (const type of ["notes", "flashcards", "quiz", "revision"])
  sourcesRouter.post(`/study-sources/:id/${type}`, (req, res, next) => {
    req.params.type = type;
    return generateFeature(req, res, next);
  });

sourcesRouter.get("/study-sources/:id/chat", async (req, res, next) => {
  try {
    await getOwnedSource(req.params.id, req.user.id);

    let query = supabaseAdmin
      .from("chat_turns")
      .select("*")
      .eq("source_id", req.params.id)
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (req.query.before && !Number.isNaN(Date.parse(req.query.before)))
      query = query.lt("created_at", req.query.before);

    const { data } = await checked(query);

    res.json({
      turns: data.slice().reverse(),
      nextBefore: data.length === 50 ? data.at(-1).created_at : null,
    });
  } catch (e) {
    next(e);
  }
});

sourcesRouter.post("/study-sources/:id/chat", async (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim(),
      requestId = req.body?.requestId;

    if (!message || message.length > 3000 || !uuid(requestId))
      return res
        .status(400)
        .json({
          error:
            "A question up to 3000 characters and valid requestId are required.",
        });

    const { source, transcript } = await getTranscriptForSource(
      req.params.id,
      req.user.id,
    );

    res.locals.lectureSaved = true;

    const find = async () =>
      (
        await checked(
          supabaseAdmin
            .from("chat_turns")
            .select("*")
            .eq("source_id", req.params.id)
            .eq("user_id", req.user.id)
            .eq("request_id", requestId)
            .maybeSingle(),
        )
      ).data;

    const cached = await find();

    if (cached)
      return res.json({ turn: cached, answer: cached.answer, cached: true }); // A different message must not receive another in-flight message's answer.

    const turn = await withGenerationLock(
      req.params.id,
      req.user.id,
      `chat:${requestId}`,
      async (assertLease) => {
        const again = await find();
        if (again) return again;

        const { data: recent } = await checked(
          supabaseAdmin
            .from("chat_turns")
            .select("*")
            .eq("source_id", req.params.id)
            .eq("user_id", req.user.id)
            .order("created_at", { ascending: false })
            .limit(4),
        );

        const history = recent.slice().reverse();

        const { context, excerpts } = retrieveContext(
          transcript.cleaned_text,
          message,
          history,
        );

        const conversation = history
          .map(
            (x) =>
              `Student: ${x.question.slice(0, 500)}\nAssistant: ${x.answer.slice(0, 800)}`,
          )
          .join("\n");

        const answer = await chatWithLecture(
          context,
          `Previous conversation (context only):\n${conversation}\n\nCurrent question: ${message}\nAnswer from the supplied excerpts. If they do not support the answer, say so.`,
          languageOf(req, source),
        );

        assertLease();

        return (
          await checked(
            supabaseAdmin
              .from("chat_turns")
              .insert({
                source_id: req.params.id,
                user_id: req.user.id,
                request_id: requestId,
                question: message,
                answer,
                excerpts,
              })
              .select("*")
              .single(),
          )
        ).data;
      },
    );

    res.json({ turn, answer: turn.answer });
  } catch (e) {
    next(e);
  }
});
