# Contributing to SpacedCube

Thanks for helping. Issues and pull requests are welcome: bug reports, better algorithms, new case sets, translations of the UI text.

## Set up

You need Node.js 22 or newer. Nothing else: no Python, no bundler.

```sh
npm install                      # Playwright, axe-core, eslint, typescript
npx playwright install           # the browsers for the tests
npm start                        # build and serve at http://localhost:8000
npm test                         # lint, type check, unit tests, browser tests in Chromium, Firefox and WebKit
npx playwright test --project=webkit   # the browser tests in one engine
```

`npm start` serves the app at http://localhost:8000 (ES modules and service workers need http://localhost or HTTPS, not file://). Without environment variables the build has no sync server; to test sync, build with your own `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (see the README).

Every pull request runs the same checks, and the browser tests in Chromium, Firefox and WebKit, in GitHub Actions.

## Rules of the code

- Edit `src/`, never `dist/`, and rebuild after every change.
- Keep modules small and focused; `src/js/core/` must not touch the DOM.
- Accessibility is part of done: keyboard and screen reader must work, and the smoke test's axe run must stay clean (WCAG 2.2 AA).
- No deployment-specific values (keys, project ids, domains, emails) in the code: they are build-time environment variables.
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

Forks can run their own: create a Supabase project, run `supabase/schema.sql`, and set the repository variables listed in the README (Deploying your own copy).
