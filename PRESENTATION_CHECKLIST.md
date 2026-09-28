# Presentation checklist

## Before the demo

- Extract this ZIP into a fresh folder. Follow SETUP.md and add your existing credentials only to backend/.env. Keep your working model IDs.
- In Supabase, run schema.sql, 002_feature_persistence.sql, 003_source_reuse.sql, and 004_retests.sql in that order for a fresh database. For an existing installation, apply the remaining migrations in order. Stop the old backend first.
- From the project root, start the backend with npm.cmd run start:backend. In another terminal at the project root, start the frontend with npm.cmd run dev:frontend. Keep both terminals open.
- Check /api/health on the backend, then sign in normally.

## Five-minute rehearsal

1. Open a ready lecture. Confirm the picker excludes failed/processing rows and Resume Studying shows its saved progress.
2. Open Mind Map, then Summary, then Workspace. Reload and use browser Back: the same sourceId/lecture should remain selected.
3. Open saved Notes, Summary, Mind Map, Flashcards, Quiz and Important Questions. All should retain their own content; reopening must not trigger Gemini.
4. Submit the same YouTube video with a shortened or timestamped URL. Confirm it reuses the same ready source and does not run Whisper or Notes again. Existing lecture language stays the same.
5. With a lecture that has no quiz attempt, confirm Smart Revision is locked. Complete its quiz; confirm Smart Revision unlocks and Resume shows the result after reload.
6. Generate Important Questions on a lecture without saved questions. Check answer depth and lecture accuracy. Previously saved short answers intentionally stay unchanged.
7. Check Notes formulas, long text and Mind Map at desktop and phone widths. Confirm no content overlaps the side panel.
8. If generation reports 429/503 or loses connection, check for the saved-lecture/retry message. Retry later; do not repeatedly submit the video.
9. Process one short public lecture end to end to verify your live Supabase, YouTube, Faster-Whisper, cleaner and Gemini setup before the presentation.

## Demo preparation

Keep one fully generated lecture ready before presenting. Use Resume Studying and saved features for predictable navigation. Automated tests used fixtures; real account connectivity, SQL execution and AI answer quality require the live rehearsal above.

