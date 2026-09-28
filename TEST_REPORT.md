# Submission verification

## Checks performed on this package

- JavaScript syntax, relative imports, and local frontend asset references checked with `npm run check`.
- Archive inspected for actual environment files, recognizable credential tokens, dependency folders, generated media, and duplicate file contents.
- Package names and declared dependencies compared with their lockfile root metadata.
- Application source, SQL, tests, dependency manifests, and bundled assets retained without functional edits.

No live Supabase, Gemini, YouTube, email-confirmation, or deployment tests were performed during packaging. SQL was not applied to a database. The unit and browser suites were not rerun during packaging. Earlier handoff reports are not treated as validation of this submission.

## Reproduce checks

After installing dependencies as described in SETUP.md, run from the repository root:

```powershell
npm.cmd run check
npm.cmd test
.\StudyGenie_Backend\backend\.venv\Scripts\python.exe -m unittest discover -s tests -p 'test_*.py'
```

Optional browser checks need Playwright. To install it locally without changing the manifests or lockfile:

```powershell
npm.cmd install --no-save --package-lock=false playwright
npx.cmd playwright install chromium
node tests/browser-smoke.cjs
node tests/retest-browser.cjs
node tests/print-smoke.cjs
```

Optionally set `STUDYGENIE_BROWSER` to a compatible Chrome/Chromium executable and `STUDYGENIE_TEST_OUTPUT` to a scratch folder. These checks use mock responses; rehearse one real lecture and the full authentication flow before presenting.
