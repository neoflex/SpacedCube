# SpacedCube

A spaced-practice trainer for the last layer of the 3x3 cube: all 57 **OLL** cases and all 21 **PLL** cases.

It gives you a scramble that produces a case from a solved cube, you solve it, and you say whether you got it. The trainer adapts how often each case comes back: weak cases come up often, cases you know well come back rarely but still often enough to check you have not forgotten them. New cases are added a few at a time as earlier ones become solid.

It comes in two builds from the same source:

- **Claude artifact**: a single HTML page, with progress synced through the artifact's per-user database.
- **Installable web app (PWA)**: works offline, installs full screen on a phone, and syncs through your own Supabase project (optional). See [Installable app and Supabase sync](#installable-app-and-supabase-sync).

## Features

- **Case picker.** First run: tick the cases you already kind of know; they start in rotation, the rest are introduced in a learning order.
- **Scrambles generated from the algorithms.** A sticker-level cube simulator inverts the algorithm and, by default, disguises the scramble (OLL: random last-layer permutation; PLL: combination of two other PLLs that lands on the target case), so the case cannot be recognised from the moves. Every scramble is checked in the simulator before it is shown.
- **Diagrams computed from the algorithms.** OLL: top face and side stickers. PLL: side colours and permutation arrows.
- **Help that counts honestly.** Show the case only (free), hints one move at a time, or the full algorithm; hints and the algorithm turn the attempt into a miss, with a confirmation first.
- **3D replay.** Plays the solution on a 3D cube starting from your actual scramble (three.js, loaded on demand).
- **Custom algorithms.** Checked against the case before saving; a leading `y` rotation is hidden and the diagram is turned to match.
- **Cases view.** Grouped like jperm.net, or sorted by weakest first / most recent misses.
- **Progress view.** Daily attempts, success rate and cases by level, with a table view.
- **Data.** Local storage + optional sync (Claude account on claude.ai, Supabase in the installable app), backup code export/import. A backup code restores into the set it came from, whichever set is open.

## Repository layout

```
src/core.js          Cube model, notation, case sets (OLL, PLL), scrambles, scheduler. No DOM; runs in Node.
src/app.js           UI, persistence, sync, charts, 3D viewer.
src/index.src.html   Page shell and CSS. Build inlines core.js and app.js into it.
src/pwa/             PWA files: config.js (Supabase URL and key, sign-up and Turnstile settings), sw.js, manifest, privacy.html, icons.py (draws the icons).
supabase/schema.sql  Table, row-level security, grants and delete_my_account() for the sync backend.
.github/workflows/   pages.yml: build, test and deploy to GitHub Pages.
build.py             Produces dist/index.html (artifact) and dist/pwa/ (installable app).
tests/test_core.js   Node checks: every PLL is valid and distinct, mirror pairs match, scrambles land on their case.
tests/e2e_smoke.py   Playwright: clicks through every view of both sets and fails on unrendered placeholders or page errors.
tests/e2e_pwa.py     Playwright against a local mock of Supabase and Turnstile: install files, sign-in with the check, pull/push, offline reload, sign-out, delete account.
```

## Build and test

```sh
python3 build.py                 # -> dist/index.html and dist/pwa/
node tests/test_core.js          # core logic; last line must read "fail 0"
pip install playwright           # once
CHROME=/path/to/chrome python3 tests/e2e_smoke.py   # expects "found: [] errors: []"
CHROME=/path/to/chrome python3 tests/e2e_pwa.py     # expects "pwa: ok"
```

The page loads fonts from Google Fonts and three.js r128 from cdnjs; everything else is inline.

## How it works

### Cube model (`src/core.js`)

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

### Persistence and sync

State per set (`oll-trainer-v1`, `pll-trainer-v1` in localStorage) is one JSON object: settings, per-case stats (`level`, `n`, `ok`, `hist` of the last 20 results, `last` attempt number, `lastTs`, `lastMiss`), custom algorithms and a daily log for the charts. Every change is written locally at once and uploaded about 1.5 s later to the sync backend, if there is one. On load, when the tab becomes visible and when the connection comes back, the newer copy (by `updatedAt`) wins. Whole-state, last writer wins: no per-attempt merge.

The backend is chosen at start-up:

1. `window.claude.use` exists (claude.ai artifact): the artifact database, document `data/users/<id>/<set>-trainer`.
2. Otherwise, if `config.js` has a Supabase URL and anon key: the `progress` table, one row per user and set, once signed in.
3. Otherwise: this browser only.

The Supabase client is a few plain `fetch` calls (auth and PostgREST), so nothing extra is loaded. The session (access and refresh token) is kept in localStorage under `ll-trainer-auth`.

## Installable app and Supabase sync

The app is published at **https://spacedcube.app**. `.github/workflows/pages.yml` builds it, runs all tests and deploys `dist/pwa/` to GitHub Pages on every push to `main` (pull requests run the tests only). Forks can serve `dist/pwa/` over HTTPS from any static host. It caches itself on the first visit, including three.js and the fonts, and then works offline. On a phone use "Add to Home Screen" (iOS Safari) or "Install app" (Android Chrome); it opens full screen and respects the notch and home indicator.

Without a Supabase project, leave `src/pwa/config.js` empty: the app keeps progress in the browser and the backup code moves it between devices.

### Accounts

Anyone can create an account: the sign-in email creates it on first use (`allowSignup` in `config.js`). Sign-in is by a 6-digit code or a link in the same email. An app installed on an iPhone does not share storage with Safari, so a link opened from the mail app signs in Safari, not the installed app; typing the code works everywhere. A Cloudflare Turnstile check on the sign-in form keeps bots from creating accounts and burning the email quota. Options > Your data > Delete account removes the sign-in and the synced rows; progress in the browser stays. What is stored is described in `src/pwa/privacy.html` (served as `/privacy.html`).

Each state is capped at 256 KB by the database; the app keeps two years of daily chart history so a state stays around 50 KB at most.

### Setting up sync (once, by the owner of the project)

1. Create a project at [supabase.com](https://supabase.com). SQL editor: run `supabase/schema.sql` (table, row-level security `user_id = auth.uid()`, size limit, no access for the anon role, `delete_my_account()`).
2. An email provider with SMTP (this project uses Brevo): authenticate your domain there (DKIM, DMARC), then Authentication > Emails > SMTP Settings. Supabase's built-in sender only mails members of your Supabase team, and on the free plan the email templates can only be edited once custom SMTP is on.
3. Authentication > Emails: put `{{ .Token }}` in the Magic Link and Confirm signup templates so the email contains the code. Authentication > Providers > Email: 6-digit codes.
4. Authentication > URL Configuration: Site URL and Redirect URLs set to where the app is served.
5. Cloudflare dashboard > Turnstile: add a widget for your hostnames (Managed mode). Put its **site key** in `src/pwa/config.js` (`turnstileSiteKey`) and deploy. Then Authentication > Attack Protection: enable CAPTCHA protection, provider Turnstile, with the widget's **secret key**. Do it in this order: once Supabase requires the check, an app without the site key can no longer sign in.
6. Authentication > Sign In / Providers: allow new users to sign up (only after step 5). Keep `allowSignup: false` in `config.js` instead if accounts should only be created by you (Authentication > Users > Add user).
7. Project Settings > API: copy the project URL and the publishable key into `src/pwa/config.js`, rebuild, deploy.

The publishable key and the Turnstile site key are public by design; the row-level security policy is what keeps each user's rows private, and the Turnstile secret stays in Supabase. Forks put their own project in `config.js`.

### Moving progress from the Claude artifact

In the artifact: Options > Show backup code, copy it (once for OLL, once for PLL). In the app: Options > Restore from backup, paste. The code is restored into the set it belongs to, and synced once you sign in.

## Credits and licences

- OLL algorithms and numbering as listed on [jperm.net](https://jperm.net/algs/oll); diagrams, scrambles and all code are original.
- [three.js](https://threejs.org) (MIT), loaded from cdnjs for the 3D viewer.
- Fonts: Archivo, IBM Plex Sans, IBM Plex Mono (SIL Open Font License) via Google Fonts.
- SpacedCube itself: [MIT](LICENSE). Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md).
