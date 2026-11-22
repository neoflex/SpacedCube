// Check against automated sign-ups (Cloudflare Turnstile). Only used when a site key is configured.
// Nothing is loaded from Cloudflare until the user starts signing in (focuses the email field or sends).
// Usually invisible; it asks for a click only when unsure.
import { CONFIG } from './env.js';

export const Captcha = {
  key: CONFIG.turnstileSiteKey,
  token: null, widget: null, loading: null, failed: false,
  load() {
    if (window.turnstile) return Promise.resolve();
    if (!this.loading) {
      this.loading = new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        sc.async = true;
        sc.onload = () => (window.turnstile ? res() : rej(new Error('captcha')));
        sc.onerror = () => { this.loading = null; rej(new Error('captcha')); };
        document.head.appendChild(sc);
      });
    }
    return this.loading;
  },
  mount() {
    const el = document.getElementById('captcha');
    if (!this.key || !el || el.dataset.mounted) return;
    el.dataset.mounted = '1';
    this.load().then(() => {
      if (!el.isConnected) return;
      if (this.widget != null) { try { window.turnstile.remove(this.widget); } catch (e) { /* already gone */ } }
      this.token = null; this.failed = false;
      this.widget = window.turnstile.render(el, {
        sitekey: this.key, appearance: 'interaction-only', action: 'sign-in',
        callback: (t) => { this.token = t; },
        'expired-callback': () => { this.token = null; },
        'error-callback': () => { this.token = null; this.failed = true; },
      });
    }).catch(() => { this.failed = true; el.textContent = 'The check against automated sign-ups could not load. Check your connection and reload the page.'; });
  },
  // Waits up to `ms` for a token (the check takes a moment after it starts).
  async wait(ms) {
    this.mount();
    for (let t = 0; t < ms && !this.token && !this.failed; t += 100) await new Promise((r) => setTimeout(r, 100));
    return this.token;
  },
  // A token works once: hand it over and start a fresh check for the next attempt.
  take() {
    const t = this.token;
    this.token = null;
    try { if (this.widget != null && window.turnstile) window.turnstile.reset(this.widget); } catch (e) { /* ignore */ }
    return t;
  },
};
