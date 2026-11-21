# Contributing to SpacedCube

Thanks for helping. Issues and pull requests are welcome: bug reports, better algorithms, new case sets, translations of the UI text.

## Set up

You need Python 3 and Node.js. Nothing else is installed for the app itself.

```sh
python3 build.py                 # -> dist/index.html (single file) and dist/pwa/ (installable app)
node tests/test_core.js          # last line must read "fail 0"
pip install playwright && python -m playwright install chromium
python3 tests/e2e_smoke.py       # must print "found: [] errors: []"
python3 tests/e2e_pwa.py         # must print "pwa: ok"
```

To try the app locally: `python3 -m http.server -d dist/pwa 8000` and open http://localhost:8000 (service workers need localhost or HTTPS). It syncs with the project in `src/pwa/config.js`; empty that file's values to work offline only.

Every pull request runs the same build and tests in GitHub Actions.

## Rules of the code

- Edit `src/`, never `dist/`, and rebuild after every change.
- Case ids are strings everywhere (`'27'`, `'Jb'`).
- Diagrams, scrambles and case keys are computed from the algorithms by the cube simulator in `src/core.js`. Never hand-write diagram data. To change an algorithm, edit its `RAW` row and run the tests: they check that every algorithm solves its case.
- In template literals, every `${...}` must be inside backticks. The smoke test fails on unrendered `${` in the page.
- The page must keep working fully offline and without any backend. Local storage is always written first; sync is optional.
- UI text is plain and direct. Dialogs are built into the page (no `alert` or `confirm`).

## Product rules

These came from real practice data; please open an issue before changing them.

- Seeing the algorithm or using a hint turns the attempt into a miss (after a confirmation). Showing the case diagram alone is free.
- A level rises only after the time gaps in `GAP_MS`, never on every correct answer.
- New cases join from a small learning pool (default 3).

## Your own sync server

Forks can run their own: create a Supabase project, run `supabase/schema.sql`, and put the project URL and publishable key in `src/pwa/config.js`. See the README for the Auth settings.
