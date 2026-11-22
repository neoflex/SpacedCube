// Globals the app reads that are not part of the DOM typings.
interface Window {
  SPACEDCUBE_CONFIG?: { supabaseUrl?: string; supabaseKey?: string; allowSignup?: boolean; turnstileSiteKey?: string };
  turnstile?: any;
  THREE?: any;
}
