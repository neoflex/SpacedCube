# Notes for Claude

Read README.md first: it describes the features, layout, scheduling rules and sync model.

## Working rules

- Edit `src/`, never `dist/`. Run `python3 build.py` after every change.
- Before committing: `node tests/test_core.js` must end with `fail 0`, `tests/e2e_smoke.py` must print `found: [] errors: []`, and `tests/e2e_pwa.py` must print `pwa: ok`.
- Template literals: every `${...}` must sit inside backticks. Two bugs shipped from `${...}` inside single-quoted strings; the smoke test exists to catch that.
- Case ids are strings everywhere (`'27'`, `'Jb'`). OLL ids sort numerically, PLL ids keep the order of the definition.
- Every diagram, scramble and key is derived from the algorithms by the simulator. Never hand-write diagram data; to change an algorithm, change the `RAW` row and rerun the tests.
- The user practises with yellow on top and green in front; scrambles and the 3D viewer assume that orientation.

## Product decisions already made (keep unless the user asks)

- Seeing the algorithm or using a hint makes the attempt a miss, after a confirmation. Showing the case diagram alone is free. Auto-revealed algorithms (new case, "show the case before I solve") do not count.
- Levels rise only after the time gaps in `GAP_MS` (see README). The user found that cases "mastered" quickly from short-term memory were then forgotten; do not reintroduce promotion on every correct answer.
- New cases come from a learning pool (`settings.pool`, default 3), not "everything must be learned first".
- Sync is whole-state, newest `updatedAt` wins. Local storage is always written first; the page must work fully offline and without any backend.
- Text in the UI: plain, direct, no em-dash asides. Dialogs are built into the page (no alert/confirm).
- Accounts are open to anyone (`allowSignup`), protected by Cloudflare Turnstile on the sign-in form. Deploy the site key before Supabase requires the check, never the other way round. Users can delete their account from the app; `src/pwa/privacy.html` must stay accurate when what is stored or who processes it changes.

## Two builds

`dist/index.html` is the Claude artifact (single file, sync through `window.claude.use('db')`). `dist/pwa/` is the installable app (service worker, manifest, `config.js` with the Supabase URL and anon key). Both come from the same `src/`; keep the artifact build free of PWA tags (`<!--@PWA_HEAD@-->` is filled only for the PWA). Outside claude.ai the page falls back to Supabase (if configured) or local storage only.
