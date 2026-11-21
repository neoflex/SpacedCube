# Cube Trainer

A spaced-practice trainer for the last layer of the 3x3 cube: all 57 **OLL** cases and all 21 **PLL** cases.

It gives you a scramble that produces a case from a solved cube, you solve it, and you say whether you got it. The trainer adapts how often each case comes back: weak cases come up often, cases you know well come back rarely but still often enough to check you have not forgotten them. New cases are added a few at a time as earlier ones become solid.

It currently runs as a single HTML page published as a Claude artifact, with progress synced through the artifact's per-user database. The next step is a standalone installable web app (PWA) with its own sync backend (see [Roadmap](#roadmap)).

## Features

- **Case picker.** First run: tick the cases you already kind of know; they start in rotation, the rest are introduced in a learning order.
- **Scrambles generated from the algorithms.** A sticker-level cube simulator inverts the algorithm and, by default, disguises the scramble (OLL: random last-layer permutation; PLL: combination of two other PLLs that lands on the target case), so the case cannot be recognised from the moves. Every scramble is checked in the simulator before it is shown.
- **Diagrams computed from the algorithms.** OLL: top face and side stickers. PLL: side colours and permutation arrows.
- **Help that counts honestly.** Show the case only (free), hints one move at a time, or the full algorithm; hints and the algorithm turn the attempt into a miss, with a confirmation first.
- **3D replay.** Plays the solution on a 3D cube starting from your actual scramble (three.js, loaded on demand).
- **Custom algorithms.** Checked against the case before saving; a leading `y` rotation is hidden and the diagram is turned to match.
- **Cases view.** Grouped like jperm.net, or sorted by weakest first / most recent misses.
- **Progress view.** Daily attempts, success rate and cases by level, with a table view.
- **Data.** Local storage + optional sync, backup code export/import.

## Repository layout

```
src/core.js          Cube model, notation, case sets (OLL, PLL), scrambles, scheduler. No DOM; runs in Node.
src/app.js           UI, persistence, sync, charts, 3D viewer.
src/index.src.html   Page shell and CSS. Build inlines core.js and app.js into it.
build.py             Produces dist/index.html (single self-contained file).
tests/test_core.js   Node checks: every PLL is valid and distinct, mirror pairs match, scrambles land on their case.
tests/e2e_smoke.py   Playwright: clicks through every view of both sets and fails on unrendered placeholders or page errors.
```

## Build and test

```sh
python3 build.py                 # -> dist/index.html
node tests/test_core.js          # core logic; last line must read "fail 0"
pip install playwright           # once
CHROME=/path/to/chrome python3 tests/e2e_smoke.py   # expects "found: [] errors: []"
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

State per set (`oll-trainer-v1`, `pll-trainer-v1` in localStorage) is one JSON object: settings, per-case stats (`level`, `n`, `ok`, `hist` of the last 20 results, `last` attempt number, `lastTs`, `lastMiss`), custom algorithms and a daily log for the charts. Every change is written locally at once and, on claude.ai, uploaded about 1.5 s later to the artifact database (`data/users/<id>/oll-trainer`). On load and when the tab becomes visible the newer copy (by `updatedAt`) wins. Whole-state, last writer wins: no per-attempt merge.

## Roadmap

1. **PWA**: manifest, icons, service worker (offline, caches three.js), safe-area padding, so it installs full screen on a phone.
2. **Supabase sync** replacing the Claude-only sync outside claude.ai:
   - table `progress (user_id uuid, set text, state jsonb, updated_at timestamptz, primary key (user_id, set))`, row-level security `user_id = auth.uid()`, check constraint on the size of `state`;
   - public sign-ups disabled on the owner's project; anon role gets no access;
   - project URL and anon key in a small config file so forks use their own project;
   - sign-in by magic link; same newest-wins logic as today.
3. **Migration**: import from the backup code the artifact version produces.

## Credits and licences

- OLL algorithms and numbering as listed on [jperm.net](https://jperm.net/algs/oll); diagrams, scrambles and all code are original.
- [three.js](https://threejs.org) (MIT), loaded from cdnjs for the 3D viewer.
- Fonts: Archivo, IBM Plex Sans, IBM Plex Mono (SIL Open Font License) via Google Fonts.
- Licence for this repository: to be decided before it is made public.
