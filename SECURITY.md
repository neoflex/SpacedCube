# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue: use **Report a vulnerability** on the repository's Security tab (GitHub private vulnerability reporting). Include what you found, how to reproduce it, and what an attacker could do with it.

You will get an answer within a week. Fixes are deployed as soon as they are ready, and you are credited in the release notes unless you prefer not to be.

## Scope

- The app in this repository (`src/`) and the copy published from it.
- The sync backend as set up by `supabase/schema.sql`: table, row-level security and `delete_my_account()`.
- The build and its Content Security Policy (`build.mjs`).

Out of scope: denial-of-service and volume tests, spam to the sign-in form, and problems in Supabase, Cloudflare or GitHub themselves (report those to them).

## How the app protects users

- Progress lives in the browser first; the sync server stores only an email address and practice progress.
- Each user can read and write only their own rows (row-level security `user_id = auth.uid()`); requests with only the public key get nothing.
- Sign-in by one-time code; no passwords. A Cloudflare Turnstile check guards account creation.
- A strict Content Security Policy: no inline scripts, no `eval`, no third-party hosts except the sync server and, during sign-in, Turnstile. The tests fail on any violation.
