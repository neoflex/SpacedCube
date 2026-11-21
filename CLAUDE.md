# Notes for Claude

Read README.md first: it describes the features, layout, scheduling rules and sync model.

## Working rules

- Edit `src/`, never `dist/`. Run `python3 build.py` after every change.
- Before committing: `node tests/test_core.js` must end with `fail 0`, and `tests/e2e_smoke.py` must print `found: [] errors: []`.
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

## Current task

Turn the page into an installable PWA with Supabase sync (README "Roadmap"). Keep the Claude-artifact build working: the artifact runtime exposes `window.claude.use('db')`; outside claude.ai that object does not exist and the page must fall back to Supabase (if configured) or local storage only.
