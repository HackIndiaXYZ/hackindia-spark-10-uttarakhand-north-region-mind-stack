import path from "node:path";
import { apiError } from "./services/apiError.js";
import { fileURLToPath } from "node:url";
import { requireAuth } from "./auth.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { stopWorkers } from "./services/pythonWorker.js";
import { config } from "./config.js";
import { meRouter } from "./routes/me.js";
import { sourcesRouter } from "./routes/sources.js";
import { retestsRouter } from "./routes/retests.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { progressRouter } from "./routes/progress.js";

export const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || config.frontendOrigins.includes(origin))
        return cb(null, true);
      cb(
        Object.assign(new Error("Origin not allowed by CORS."), {
          status: 403,
        }),
      );
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Request limit reached. Please retry later.",
      code: "RATE_LIMITED",
      retryable: true,
    },
  }),
);

app.get("/api/config/public", (_req, res) =>
  res.json({
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
  }),
);
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "StudyGenie Backend" }),
);
app.use(
  "/api",
  requireAuth,
  meRouter,
  sourcesRouter,
  quizzesRouter,
  retestsRouter,
  progressRouter,
);

app.use((_req, res) => res.status(404).json({ error: "Route not found." }));

app.use((error, _req, res, _next) => {
  console.error(error);
  const { status, ...payload } = apiError(error, {
    lectureSaved: !!res.locals.lectureSaved,
  });
  res.status(status).json(payload);
});

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = app.listen(config.port, () =>
    console.log(
      "StudyGenie backend running on http://localhost:" + config.port,
    ),
  );
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "Port already in use. Stop the other backend or change PORT."
        : error.message,
    );
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      stopWorkers();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000).unref();
    });
}
