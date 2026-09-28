import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { apiError } from "./services/apiError.js";
import { stopWorkers } from "./services/pythonWorker.js";
import { requireAuth } from "./auth.js";
import { config } from "./config.js";

import { meRouter } from "./routes/me.js";
import { sourcesRouter } from "./routes/sources.js";
import { retestsRouter } from "./routes/retests.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { progressRouter } from "./routes/progress.js";

export const app = express();

/**
 * Required when running behind Render / reverse proxies.
 */
app.set("trust proxy", 1);

/**
 * Security headers
 */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

/**
 * CORS
 *
 * Allows requests only from origins listed in FRONTEND_ORIGIN.
 * Requests without an Origin header are allowed for server-to-server,
 * health checks, curl, etc.
 */
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.frontendOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        Object.assign(new Error("Origin not allowed by CORS."), {
          status: 403,
        }),
      );
    },

    methods: ["GET", "POST", "PATCH", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

/**
 * JSON body parser
 */
app.use(
  express.json({
    limit: "1mb",
  }),
);

/**
 * Rate limiter
 */
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

/**
 * Public frontend configuration
 *
 * Only public Supabase values should be returned here.
 * Never expose the service-role key or Gemini key.
 */
app.get("/api/config/public", (_req, res) => {
  res.json({
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
  });
});

/**
 * Health endpoint
 *
 * Render can use this endpoint as the health check.
 */
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "StudyGenie Backend",
  });
});

/**
 * Protected API routes
 */
app.use(
  "/api",
  requireAuth,
  meRouter,
  sourcesRouter,
  quizzesRouter,
  retestsRouter,
  progressRouter,
);

/**
 * 404
 */
app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found.",
  });
});

/**
 * Central API error handler
 */
app.use((error, _req, res, _next) => {
  console.error(error);

  const { status, ...payload } = apiError(error, {
    lectureSaved: !!res.locals.lectureSaved,
  });

  res.status(status).json(payload);
});

/**
 * Start server only when this file is executed directly.
 *
 * Render requires the app to listen on 0.0.0.0.
 * config.port should use process.env.PORT with 4000 as fallback.
 */
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const host = "0.0.0.0";
  const port = config.port;

  const server = app.listen(port, host, () => {
    console.log(`StudyGenie backend running on http://${host}:${port}`);
  });

  /**
   * Server startup errors
   */
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is already in use. Stop the other backend or change PORT.`
        : error.message,
    );

    process.exitCode = 1;
  });

  /**
   * Graceful shutdown
   */
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      console.log(`Received ${signal}. Shutting down StudyGenie backend...`);

      stopWorkers();

      server.close(() => {
        console.log("StudyGenie backend stopped.");

        process.exit(0);
      });

      setTimeout(() => {
        process.exit(0);
      }, 2000).unref();
    });
  }
}
