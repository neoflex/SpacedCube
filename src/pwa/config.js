// Sync server for the installable app. Leave both empty to keep progress in this browser only.
// Forks: create your own Supabase project (see supabase/schema.sql and README) and put its values here.
// The anon key is meant to be public: row-level security on the table is what protects the data.
window.CUBE_TRAINER_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  // true: an unknown email creates an account on first sign-in (sign-ups must also be enabled in Supabase).
  allowSignup: true,
  // Cloudflare Turnstile site key (public). Set it before enabling CAPTCHA protection in Supabase; empty = no check.
  turnstileSiteKey: '',
};
