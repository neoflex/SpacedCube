# SpacedCube

A spaced-practice trainer for the last layer of the 3x3 cube: all 57 **OLL** cases and all 21 **PLL** cases.

It gives you a scramble that produces a case from a solved cube, you solve it, and you say whether you got it. The trainer adapts how often each case comes back: weak cases come up often, cases you know well come back rarely but still often enough to check you have not forgotten them. New cases are added a few at a time as earlier ones become solid.

It is a static web app: it installs full screen on a phone, works offline, and can sync between devices through a Supabase project (optional). Without a sync server it keeps everything in the browser.

## Features

- **Case picker.** First run: tick the cases you already kind of know; they start in rotation, the rest are introduced in a learning order.
- **Scrambles generated from the algorithms.** A sticker-level cube simulator inverts the algorithm and, by default, disguises the scramble (OLL: random last-layer permutation; PLL: combination of two other PLLs that lands on the target case), so the case cannot be recognised from the moves. Every scramble is checked in the simulator before it is shown.
- **Diagrams computed from the algorithms.** OLL: top face and side stickers. PLL: side colours and permutation arrows.
- **Help that counts honestly.** Show the case only (free), hints one move at a time, or the full algorithm; hints and the algorithm turn the attempt into a miss, with a confirmation first.
- **3D replay.** Plays the solution on a 3D cube starting from your actual scramble (three.js, loaded on first use).
- **Custom algorithms.** Checked against the case before saving; a leading `y` rotation is hidden and the diagram is turned to match.
- **Cases view.** Grouped like jperm.net, or sorted by weakest first / most recent misses.
- **Progress view.** Daily attempts, success rate and cases by level, with a table view.
- **Data.** Local storage first, optional sync, backup code export/import (a code restores into the set it came from).
- **Accessible.** Works with the keyboard and screen readers: skip link, one heading per view with focus moved to it, focus kept on the same control after every update, modal dialogs that make the page behind inert and return focus, results and errors announced in a live region, text alternatives for diagrams and a table for the charts, single-key shortcuts that can be turned off, reduced motion respected. axe-core checks every screen against WCAG 2.2 A and AA in both colour schemes.
- **Private by default.** No ads, analytics or third-party requests: fonts and three.js are served by the app. Cloudflare Turnstile loads only once someone starts signing in.

## Repository layout

```
src/index.html         Page shell (no inline script or style).
src/css/               base.css (tokens, layout, header, buttons) and one file per view.
src/js/core/           No DOM, runs in Node too:
  cube.js                sticker model and moves
  notation.js            parsing, formatting, face-turn translation
  inspect.js             reading a state: solved, OLL pattern, PLL case, arrows
  cases-oll.js           the 57 OLL cases
  cases-pll.js           the 21 PLL cases
  scheduler.js           levels, gaps, buckets
  case-set.js            a case set built from its definition: scrambles, checks, scheduling
  schema.js              version of the saved state and the steps that upgrade it
  index.js               public API
src/js/app/            The UI, as small ES modules:
  state.js               shared state S, local storage, save, set switching
  env.js                 deployment settings from config.js
  supabase.js, sync.js   sync server client and newest-wins sync
  captcha.js, account.js Turnstile check and sign-in
  practice.js, cases.js, progress.js, charts.js, options.js   the views
  diagrams.js            case diagrams and labels
  dialog.js, modal.js    case dialog and shared modal behaviour
  viewer3d.js            3D replay
  render.js, actions.js, keys.js   rendering, click and keyboard handling
src/js/main.js         Entry point: wires the modules and starts the app.
src/privacy.html       Privacy page template (filled in by the build).
src/sw.js              Service worker (file list and version filled in by the build).
src/fonts/, src/vendor/  Self-hosted fonts and three.js, with their licences.
src/types.d.ts         Types of the few globals the app reads (for the type check).
tools/icons.py         Draws the app icons (no dependencies).
supabase/schema.sql    Table, row-level security, grants and delete_my_account() for sync.
build.py               Copies src/ to dist/ and generates config.js, the CSP, module preloads, privacy.html, icons and sw.js.
tests/unit/            node:test unit tests: scheduler, saved-data versions, state, sync.
tests/test_core.js     Every case and scramble checked in the simulator.
tests/e2e_*.py         Browser tests (Playwright): every screen with axe, keyboard and focus, offline and sync.
eslint.config.js, tsconfig.json   Lint and type check (plain JavaScript, checked with JSDoc).
```

There is no bundler and no runtime dependency: the browser loads the modules directly (the build lists them as `modulepreload` links so they download in parallel). `package.json` only holds the check and test tools.

## Build and test

```sh
npm install                              # once: eslint, typescript, axe-core
pip install -r tests/requirements.txt    # once: Playwright
python -m playwright install chromium firefox webkit

npm run check                    # lint, type check, unit tests, core checks
python3 build.py                 # -> dist/ (settings from environment variables, see below)
python3 tests/e2e_smoke.py       # every screen; expects "found: [] errors: [] a11y: []"
python3 tests/e2e_keyboard.py    # expects "keyboard: ok"
python3 tests/e2e_pwa.py         # offline and sync; expects "pwa: ok"
python3 -m http.server -d dist 8000   # try it at http://localhost:8000
```

The browser tests run in Chromium by default; `BROWSER=firefox` or `BROWSER=webkit` picks another engine (CI runs all three: WebKit is what every browser on an iPhone uses). `CHROME=/path/to/chrome` makes Chromium use another binary. They also fail on any Content Security Policy violation.

## How it works

### Cube model (`src/js/core/`)

54 stickers, each with a position and normal in `{-1,0,1}^3` (x = R, y = U, z = F). Every move (faces, wide moves, slices, rotations) is a quarter-turn rotation of the stickers selected by a layer predicate, so the same code handles `R`, `r`, `M`, `x`. Any algorithm can be translated to outer face turns relative to fixed centres (`toFaceTurns`), which is what scrambles use.

### Case sets

`makeSet(def)` builds a case set from a definition: groups, `[id, group, algorithm]` rows, learning order. For each case it derives the face-turn sequence, the diagram data and the set of keys that identify the case from any angle and AUF. These keys are how scrambles and custom algorithms are verified.

- OLL algorithms and case numbers follow [jperm.net/algs/oll](https://jperm.net/algs/oll).
- PLL algorithms are the widely used standard set. A closing U turn was added to Z, Ja, Jb, Ra and Rb so the algorithm ends solved and the arrows show the true permutation.

### Scheduling

Each case has a level 0-10. Buckets: 0 New, 1-2 Learning, 3-4 Familiar, 5-6 Solid, 7+ Mastered.

- **Miss:** level drops to about half (`min(level-2, floor(level/2))`).
- **Correct:** level rises by one **only if enough time has passed since the case was last seen** (`GAP_MS`): none for 0->1 and 1->2, then 10 min, 8 h, 1 d, 2 d, 4 d, 7 d, 14 d, 30 d. A correct answer while the case is still in short-term memory is recorded but does not raise the level. Reaching Mastered takes at least about a week of spaced successes.
- **Due:** levels 0-1 are due after a few other attempts; from level 2 a case is due once its gap has passed (`dueRatio`).
- **Picking:** weighted random, weight = `dueRatio^2` x a factor for a weak recent record (last 20 results, smoothed) x a small boost for cases with few attempts. The last case (and the one before, with 5+ active) is never shown twice in a row.
- **New cases:** a new case joins whenever fewer than `pool` cases (default 3) are below the "learned" level (Familiar/Solid/Mastered, a setting).

These rules came from looking at real practice data: with promotions counted on every correct answer, 31 OLL cases reached level 10 within a week and half of all attempts went to cases never missed.

### Saved-data versions

Every saved state carries `v`, the format version (`src/js/core/schema.js`). Older states are upgraded step by step when read. A state written by a newer version of the app (synced from another device, or a backup code) is never read or overwritten: sync stops for that set and the app asks to reload, which installs the update.

### Persistence and sync

State per set (`oll-trainer-v1`, `pll-trainer-v1` in localStorage) is one JSON object: settings, per-case stats (`level`, `n`, `ok`, `hist` of the last 20 results, `last` attempt number, `lastTs`, `lastMiss`), custom algorithms and a daily log for the charts (two years kept). Every change is written locally at once and, when signed in, uploaded about 1.5 s later. On load, when the tab becomes visible and when the connection comes back, the newer copy (by `updatedAt`) wins. Whole-state, last writer wins: no per-attempt merge.

Sync uses the `progress` table of the configured Supabase project, one row per user and set. The client is a few plain `fetch` calls (auth and PostgREST), so nothing extra is loaded. The session (access and refresh token) is kept in localStorage under `ll-trainer-auth`.

## Deploying your own copy

`.github/workflows/pages.yml` runs every test, then builds the app with the repository's settings and publishes `dist/` to GitHub Pages on each push to `main` (pull requests run the tests only). Any static host with HTTPS works too: run `python3 build.py` with the same environment variables and upload `dist/`.

Nothing specific to a deployment lives in the code. The build reads these environment variables; in GitHub, set them as repository variables (Settings > Secrets and variables > Actions > Variables). All are optional and public by nature (they end up in the page):

| Variable | Meaning |
|---|---|
| `SUPABASE_URL` | `https://<project>.supabase.co`. Without it, no sync: progress stays in the browser. |
| `SUPABASE_PUBLISHABLE_KEY` | The project's publishable key (or legacy anon key). |
| `ALLOW_SIGNUP` | `true`: an unknown email creates an account on first sign-in. |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key for the sign-in form. |
| `PRIVACY_OPERATOR` | Who runs this copy, for the privacy page. |
| `PRIVACY_CONTACT_EMAIL` | Address for privacy requests. |
| `PRIVACY_DATA_LOCATION` | Where Supabase stores the data, e.g. `Servers in Ireland (EU).` |
| `PRIVACY_EMAIL_PROVIDER` | Who sends the sign-in emails, e.g. `Brevo (EU)`. |
| `PRIVACY_HOSTING` | Who hosts the files (default: GitHub Pages). |

Set the custom domain, if any, in the repository's Pages settings.

The build turns the same settings into a Content Security Policy (a `<meta>` tag, since GitHub Pages cannot send headers): scripts and connections only to the site itself, the configured Supabase project and, when a site key is set, Cloudflare Turnstile. No inline scripts, no `eval`.

The app caches itself on the first visit and then works offline. On a phone use "Add to Home Screen" (iOS Safari) or "Install app" (Android Chrome); it opens full screen and respects the notch and home indicator. When a new version is deployed, an open app offers to reload.

### Accounts

With `ALLOW_SIGNUP`, the sign-in email creates the account on first use. Sign-in is by a 6-digit code or a link in the same email. An app installed on an iPhone does not share storage with Safari, so a link opened from the mail app signs in Safari, not the installed app; typing the code works everywhere. The Turnstile check keeps bots from creating accounts and burning the email quota. Options > Your data > Delete account removes the sign-in and the synced rows; progress in the browser stays. What is stored is described on `/privacy.html`.

Each state is capped at 256 KB by the database; a heavy user is about 50 KB.

### Setting up a sync server (once)

1. Create a project at [supabase.com](https://supabase.com). SQL editor: run `supabase/schema.sql` (table, row-level security `user_id = auth.uid()`, size limit, no access for the anon role, `delete_my_account()`).
2. An email provider with SMTP: authenticate your domain there (DKIM, DMARC), then Authentication > Emails > SMTP Settings. Supabase's built-in sender only mails members of your Supabase team, and on the free plan the email templates can only be edited once custom SMTP is on.
3. Authentication > Emails: put `{{ .Token }}` in the Magic Link and Confirm signup templates so the email contains the code. Authentication > Providers > Email: 6-digit codes.
4. Authentication > URL Configuration: Site URL and Redirect URLs set to where the app is served.
5. Cloudflare dashboard > Turnstile: add a widget for your hostnames (Managed mode). Set `TURNSTILE_SITE_KEY` and deploy. Then Authentication > Attack Protection: enable CAPTCHA protection, provider Turnstile, with the widget's **secret key**. Keep this order: once Supabase requires the check, an app without the site key can no longer sign in.
6. Authentication > Sign In / Providers: allow new users to sign up (only after step 5) and set `ALLOW_SIGNUP=true`. Leave both off if accounts should only be created by you (Authentication > Users > Add user).
7. Project Settings > API: set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, and the `PRIVACY_*` variables, then deploy.

The publishable key and the Turnstile site key are public by design; the row-level security policy is what keeps each user's rows private, and the Turnstile secret stays in Supabase.

### Moving progress between copies

Options > Show backup code (once per set), then Options > Restore from backup in the other copy. The code is restored into the set it belongs to and synced once you sign in.

## Credits and licences

- OLL algorithms and numbering as listed on [jperm.net](https://jperm.net/algs/oll); diagrams, scrambles and all code are original.
- [three.js](https://threejs.org) r128 (MIT) for the 3D viewer, in `src/vendor/`.
- Fonts: Archivo, IBM Plex Sans, IBM Plex Mono (SIL Open Font License 1.1, latin subset from Fontsource), in `src/fonts/`.
- [axe-core](https://github.com/dequelabs/axe-core) (MPL 2.0) runs in the tests only.
- SpacedCube itself: [MIT](LICENSE). Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md).
