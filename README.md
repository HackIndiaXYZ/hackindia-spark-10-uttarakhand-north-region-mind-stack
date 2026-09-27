# StudyGenie

**Turn a YouTube lecture into a personal AI study workspace.**

StudyGenie is a HackIndia project by **MIND STACK**. It helps students spend less time replaying long lectures and organizing notes, and more time understanding and practicing the material.

## What it does

- Downloads and transcribes lecture audio, including videos without captions.
- Creates saved Notes, Summary, Mind Map, Flashcards, Quiz, and Important Questions.
- Answers questions using the saved lecture transcript.
- Builds Smart Revision from quiz results and offers weak-topic re-tests.
- Supports English, Hindi, and Hinglish study content.
- Saves lectures and progress to an authenticated account.
- Offers browser-based PDF export for Notes, Summary, and Mind Map.

## How it works

YouTube URL → Python audio download and Faster-Whisper transcription → transcript cleanup → Gemini study tools → Supabase storage → browser workspace.

The browser uses Supabase authentication and sends its access token to the Node API. Gemini credentials and the Supabase service-role key stay on the backend.

## Tech stack

HTML, CSS, JavaScript; Node.js and Express; Supabase Auth and PostgreSQL; Google Gemini; Python, yt-dlp, and Faster-Whisper. Bundled browser libraries include Marked, DOMPurify, and MathJax.

## Project layout

```text
frontend/Genie final/              Browser pages, scripts, styles, and vendor assets
StudyGenie_Backend/AI/             AI generators, prompts, and utilities
StudyGenie_Backend/backend/        Express API and environment example
StudyGenie_Backend/backend/python/ Transcription worker and Python requirements
StudyGenie_Backend/backend/sql/    Database schema and migrations
scripts/                          Frontend server and static checks
tests/                            Automated checks and fixtures
```

## Quick start

Use Node.js 22 or newer and Python 3.11 or 3.12. The commands below use Windows PowerShell from the repository root.

```powershell
npm.cmd run install:all
cd StudyGenie_Backend/backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r python/requirements.txt
Copy-Item .env.example .env
```

Fill in your credentials in the new `.env`. Apply all four SQL files in the order documented in [SETUP.md](SETUP.md), and configure Supabase authentication before starting.

Open two terminals at the repository root:

```powershell
# Terminal 1
npm.cmd run start:backend
```

```powershell
# Terminal 2
npm.cmd run dev:frontend
```

Open [StudyGenie locally](http://127.0.0.1:5500/login.html). Backend health is available at `http://localhost:4000/api/health`.

See [SETUP.md](SETUP.md) for complete installation, database, authentication, environment, and hosting details.

## Environment configuration

Copy `StudyGenie_Backend/backend/.env.example` to `.env` in the same directory. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY`. Choose Gemini model IDs enabled for your account. The example also documents origins, ports, transcription options, and optional settings.

Never commit the real `.env`, API keys, or service-role key. Only the public Supabase URL and anon key are exposed to the browser.

## Team — MIND STACK

StudyGenie was developed by **MIND STACK** for HackIndia Spark 10 — Uttarakhand North Region.

### Team Members

- Vanshika Dhami
- Gaurav Parihar
- Harshit Nainwal
- Sakshi Bargali

## Core Learning Flow

YouTube Lecture  
↓  
Transcript / Speech-to-Text  
↓  
Notes & Study Material  
↓  
Quiz  
↓  
Smart Revision  
↓  
Re-test  
↓  
Track Improvement

## Key USP

StudyGenie does more than generate notes or quizzes.

After a quiz, it analyzes the student's incorrect answers, identifies the concepts that need revision, creates focused Smart Revision material from the lecture, and allows the student to re-test those concepts.

**We don't just tell students what they got wrong — we help them understand what to learn next.**

Use [PRESENTATION_CHECKLIST.md](PRESENTATION_CHECKLIST.md) to rehearse the demo.

## Verification and limitations

```powershell
npm.cmd run check
npm.cmd test
```

Install the Node dependencies before running the test suite. See [TEST_REPORT.md](TEST_REPORT.md) for what was checked in this submission package and for optional browser/Python checks.

Live use requires internet access, configured Supabase and Gemini accounts, and a playable YouTube lecture. Initial transcription can download a Whisper model. Processing time and AI output depend on the lecture, hardware, and service limits. Review generated study material for accuracy.

## License

Retain the HackIndia team repository's existing `LICENSE` when adding these files. This ZIP does not add or replace a project license. Bundled third-party license notices are retained alongside the assets in `frontend/Genie final/vendor/`.
