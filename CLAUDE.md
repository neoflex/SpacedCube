# Notes for Claude

Read README.md first: it describes the features, layout, scheduling rules and sync model.

## Working rules

- Edit `src/`, never `dist/`. Run `npm run build` (or `npm start`) after every change. Tooling is Node only: no Python.
- Before committing: `npm test` must pass: ESLint, `tsc --checkJs`, unit tests (including every case and scramble in the simulator), and the Playwright browser tests (`tests/e2e/`: every screen with axe, keyboard and focus, offline and sync). Locally at least `--project=chromium`; CI runs Chromium, Firefox and WebKit.
- Changing the saved-state format: bump `SCHEMA_VERSION` in `src/js/core/schema.js` and add an upgrade step; never edit a released step. Add a unit test with a state in the old format.
- No inline scripts, `eval` or third-party hosts: the CSP built by `build.mjs` blocks them and the browser tests fail on violations. A new host (only if unavoidable) goes into the policy in `build.mjs`.
- Template literals: every `${...}` must sit inside backticks. Two bugs shipped from `${...}` inside single-quoted strings; the smoke test exists to catch that.
- Case ids are strings everywhere (`'27'`, `'Jb'`). OLL ids sort numerically, PLL ids keep the order of the definition.
- Every diagram, scramble and key is derived from the algorithms by the simulator. Never hand-write diagram data; to change an algorithm, change the `RAW` row and rerun the tests.
- The user practises with yellow on top and green in front; scrambles and the 3D viewer assume that orientation.

## Product decisions already made (keep unless the user asks)

- Seeing the algorithm or using a hint makes the attempt a miss, after a confirmation. Showing the case diagram alone is free. Auto-revealed algorithms (new case, "show the case before I solve") do not count.
- Levels rise only after the time gaps in `GAP_MS` (see README). The user found that cases "mastered" quickly from short-term memory were then forgotten; do not reintroduce promotion on every correct answer.
- New cases come from a learning pool (`settings.pool`, default 3), not "everything must be learned first". A case counts as learned at Solid by default (`introLevel` 5).
- Speed practice opens for a set only once every case is Mastered: memorise first, then get faster. It times the execution only (you recognise the case before starting the timer; recognition gets its own drill, issue #3). The speed level is turns per second, so long and short algorithms compare fairly, and it rises with no time gap. A Speed attempt changes the memory level only when the case was due or missed.
- PLL comes before OLL: first in the header, and the set a new user starts on.
- After a grade the practice screen pauses (device setting, on by default): the result stays and "Next scramble" takes the place of the grade buttons, so a habitual second tap after restoring the cube grades nothing. Help is shown as chips; what counts as missed is marked and explained under the grade buttons. Key hints appear only with a keyboard and precise pointer.
- Sync is whole-state, newest `updatedAt` wins. Local storage is always written first; the page must work fully offline and without any backend.
- Text in the UI: plain, direct, no em-dash asides. Dialogs are built into the page (no alert/confirm).
- Accounts can be open to anyone (`ALLOW_SIGNUP`), protected by Cloudflare Turnstile on the sign-in form. Deploy the site key before Supabase requires the check, never the other way round. Users can delete their account from the app; `src/privacy.html` must stay accurate when what is stored or who processes it changes.
- GDPR: the app loads nothing from third parties (no CDN, no Google Fonts, no analytics). Fonts and three.js are self-hosted under `src/fonts/` and `src/vendor/`. Turnstile loads only once the user starts signing in. `tests/e2e/pwa.spec.mjs` enforces this.
- Accessibility: WCAG 2.2 AA. Every view has an `h1#view-title`; focus moves to it on view change and stays on the same control after a re-render (`render.js`). Dialogs go through `modal.js`. Announce results and errors with `announce()`, not by re-rendering a live region. Diagrams inside a labelled control are `decorative`. Single-key shortcuts must stay switchable off. The smoke test runs axe on every screen.

## Code layout

- No bundler, no runtime dependency: `src/` is copied to `dist/` and the browser loads the ES modules directly. Keep modules small and focused (see the README layout); `src/js/core/` must not touch the DOM.
- Shared UI state is `S` in `src/js/app/state.js`. Modules register their click handlers with `onAction` and re-render with `render()`; avoid import cycles (use `hooks` in state.js).
- Nothing deployment-specific in the repository: no project ids, keys, domains or contact addresses. They come from environment variables at build time (GitHub Actions repository variables); see `build.mjs` and the README table. The one exception is the README's link to the public copy at the top.
