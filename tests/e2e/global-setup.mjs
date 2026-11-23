// Builds dist/ without deployment settings before the browser tests (the sync test builds its own copy).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function globalSetup() {
  const build = fileURLToPath(new URL('../../build.mjs', import.meta.url));
  const env = { ...process.env };
  for (const k of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'ALLOW_SIGNUP', 'TURNSTILE_SITE_KEY', 'REPOSITORY_URL', 'GITHUB_REPOSITORY']) delete env[k];
  execFileSync(process.execPath, [build], { env, stdio: 'ignore' });
}
