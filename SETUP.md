# StudyGenie setup

## 1. Install

Use Node.js 22 or newer and Python 3.11 or 3.12. Extract the ZIP into a new folder. In PowerShell, from the `StudyGenie` project folder:

```powershell
npm.cmd run install:all
cd StudyGenie_Backend\backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r python\requirements.txt
Copy-Item .env.example .env
```

Edit `StudyGenie_Backend/backend/.env`. Enter your own Supabase URL, public anon key, **server-only** service role key, and Gemini API key. The example sets Gemini 3.5 Flash for generation and 3.5 Flash-Lite for fallback and transcript cleaning. Confirm the model IDs are available to your Google account; use `npm.cmd run models:list` from the backend folder if generation reports an unavailable model. Keep the service role key out of frontend files.

The backend uses its own `.venv` when present. First Faster-Whisper use may download a model. The existing yt-dlp and Faster-Whisper pipeline was preserved.

## 2. Update Supabase

Open Supabase SQL Editor for the project configured in `.env`. Run these files **in order**:

1. `StudyGenie_Backend/backend/sql/schema.sql`
2. `StudyGenie_Backend/backend/sql/002_feature_persistence.sql`
3. `StudyGenie_Backend/backend/sql/003_source_reuse.sql`
4. `StudyGenie_Backend/backend/sql/004_retests.sql`

If the first three files are already installed, run **only `004_retests.sql`** before starting this build. It adds re-test metadata to quizzes and preserves existing questions and attempts. If you have only installed the first two files, also run `003_source_reuse.sql` first.

For an existing database, the second migration adds one saved record per `(source_id, feature_type)`. It keeps the newest record for each feature and moves earlier duplicates into `generated_content_archive`. It also links existing quizzes to the latest saved Quiz, creates per-lecture chat history, and adds generation locks. It does not delete your transcripts, users, attempts, or older quizzes. All four SQL files can be run again. Stop an older backend process before applying the migration and starting this version.

Enable Supabase email/password auth. For the supplied local frontend server, set the Supabase Site URL to `http://127.0.0.1:5500/login.html`. Allow the exact login, dashboard, and settings URLs at that origin for confirmation, OAuth, and password recovery. Add equivalent URLs only for other origins you actually use. If you use Google login, enable and configure that provider too. The current signup code does not specify `emailRedirectTo`, so email confirmation depends on the Supabase Site URL. Test a real confirmation email. For another hosting layout, use the actual page paths rather than copying these local URLs.

## 3. Start

In one terminal, from `StudyGenie/StudyGenie_Backend/backend`:

```powershell
npm.cmd start
```

In a second terminal, from the `StudyGenie` project folder:

```powershell
npm.cmd run dev:frontend
```

Open `http://127.0.0.1:5500/login.html`. The frontend defaults to `http://localhost:4000`, so no API override is needed for the default local setup. To use another backend address, set `window.STUDYGENIE_API_BASE_URL` before `js/api.js` loads. If you change the frontend port, update `FRONTEND_ORIGIN` in the backend `.env` to include the exact browser origin. Serve the frontend over HTTP rather than opening HTML with `file://`.

## 4. Use

Sign in and paste a YouTube lecture URL. The backend downloads audio, transcribes once, saves the cleaned transcript, and generates Notes first in the selected English, Hindi, or Hinglish language. Choose a saved lecture from the Dashboard to reopen it. Each tool card shows `Generate` or `Open` according to its saved state. Open a feature repeatedly without using Gemini again. Saved study tools have no Regenerate control. Re-test has a separate Practice / Re-test Again action that creates a fresh set after a completed attempt. Submitting the same video again reuses the existing ready or active lecture for that user, including shortened YouTube links. Its original language and saved tools remain intact; the language selector applies to new videos. Old incomplete rows stay in the database but are hidden from the picker. Chat saves each question and answer, using relevant parts of the saved cleaned transcript. Smart Revision unlocks after a completed Quiz. A new quiz attempt makes the previous revision stale; requesting Smart Revision then creates one new plan for that attempt.

Unicode fonts for Hindi text, digits, and mathematical symbols are bundled. The right panel links to separate pages for Notes, Summary, Mind Map, Flashcards, Quiz, Important Questions, Chat, Smart Revision, and Re-test. Markdown, formulas, and map graphics are rendered by libraries included in `frontend/Genie final/vendor`; their licenses are alongside them. Supabase Auth still loads from the existing Supabase browser CDN, so sign-in needs browser internet access.

The Resume Studying card restores the most recently opened ready lecture on this browser/account, falling back to the latest ready lecture. It shows saved tool progress and quiz completion from Supabase. Workspace links and dashboard selection use `sourceId` in the URL, including reload/back navigation. Saved Important Questions are preserved; the expanded answer prompt applies to newly generated questions only.

`npm.cmd start` and `npm.cmd run dev` keep the backend running without automatic restarts. Use `npm.cmd run dev:watch` only when you want restarts during development.

## Smart Revision and Re-test

The dashboard has separate cards. Smart Revision is locked until Quiz completion, then shows Unlocked or Generated. Re-test is locked until the current Smart Revision exists.

New revision notes aim for 150–250 words per weak topic when supported by the lecture, using short paragraphs, definitions, examples and a highlighted key point. Previously saved revisions remain saved; completing the original Quiz again creates a new revision cycle when you request Smart Revision.

Re-test uses only topics with wrong answers in the original quiz. Its results compare those same topics before and after, including percentage-point change and topic scores. Questions can differ in difficulty. Completed re-tests stay available on reload. Practice / Re-test Again stays enabled after mastery and uses the original weak-topic pool. An original quiz with no wrong answers has no weak-topic re-test; its page offers full Quiz practice instead. Re-tests do not replace the original quiz result or invalidate its revision. Completing the original Quiz again starts a new revision cycle.

## Checks and limits

Run `npm.cmd run check` and `npm.cmd test` from the project folder. Python worker checks: `python StudyGenie_Backend/backend/python/transcribe_youtube.py --help` and `python -m unittest discover -s tests -p 'test_*.py'`.

Automated checks use mock data; they do not connect to your Supabase/Gemini account or download a live YouTube video. After setup, verify one short public lecture end to end. Gemini and Supabase are used only when configured with your credentials. Multiple simultaneous feature requests are serialized using a database lease; a request interrupted after Gemini responds but before saving may need a retry and could consume another call.

## Hosting and optional configuration

Host the static frontend with `frontend/Genie final/` as its document root. The supplied frontend server binds to loopback and is intended for local development. The backend must support a long-running Node process, Python, audio downloads, temporary storage, and Whisper model files. A frontend-only host does not run this backend.

For a hosted frontend, define `window.STUDYGENIE_API_BASE_URL` with the HTTPS backend URL before `js/api.js` loads on every page that uses the API. Configure the backend's `FRONTEND_ORIGIN` with the exact frontend origin and update Supabase Site URL and callback URLs. No hosted deployment has been verified for this package.

Optional backend environment variables include `WORKER_TIMEOUT_MS` (default 7200000) and `MAX_CONCURRENT_TRANSCRIPTIONS` (default 1, clamped to 1–4). `STUDYGENIE_NODE_BIN` is supplied automatically to the Python worker by the backend. Set `FRONTEND_PORT` in the terminal environment before starting the frontend server if a port other than 5500 is needed; it is not read from the backend `.env`.

The checked-in Python requirements allow version ranges; record validated versions if exact environment reproduction is required. Browser tests additionally require Playwright and a compatible browser; these are optional development tools, not application runtime dependencies.
