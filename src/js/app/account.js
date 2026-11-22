// Sign-in for sync: a 6-digit code (or link) by email. An app installed on a phone often cannot
// receive the link, so the code is the reliable path. Shown only when a sync server is configured.
import { CONFIG } from './env.js';
import { render } from './state.js';
import { $, esc, announce, target } from './util.js';
import { Supa } from './supabase.js';
import { Captcha } from './captcha.js';
import { Sync } from './sync.js';
import { onAction } from './actions.js';

let auth = { step: 'email', email: '', busy: false, msg: null, del: false };
const reset = (msg) => { auth = { step: 'email', email: '', busy: false, msg, del: false }; };
const PRIVACY = '<a href="privacy.html">Privacy</a>';

export function accountView() {
  if (!Supa.configured()) return '';
  const m = auth.msg ? `<p class="msg ${auth.msg.ok ? 'ok' : 'err'}" id="auth-msg">${esc(auth.msg.text)}</p>` : '';
  const invalid = auth.msg && !auth.msg.ok ? 'aria-invalid="true" aria-describedby="auth-msg"' : '';
  const dis = auth.busy ? 'disabled' : '';
  if (Supa.session) {
    const who = (Supa.session.user && Supa.session.user.email) || 'your account';
    const del = auth.del
      ? `<div class="confirm" role="group" aria-labelledby="del-h"><b id="del-h">Delete your account?</b><span>Your sign-in and the progress stored on the sync server are deleted. Progress in this browser stays. This cannot be undone.</span>
          <div class="row"><button type="button" class="btn small danger" data-action="delete-yes" ${dis}>Delete my account</button><button type="button" class="btn small" data-action="delete-no">Keep my account</button></div></div>`
      : '';
    return `<div class="sec account"><p style="margin:0">Signed in as <b>${esc(who)}</b>.</p>
      <div class="row"><button type="button" class="btn small" data-action="sync-now">Sync now</button><button type="button" class="btn small" data-action="sign-out">Sign out</button>${auth.del ? '' : '<button type="button" class="btn small danger" data-action="delete-ask">Delete account…</button>'}</div>${del}${m}
      <p class="muted" style="margin:0;font-size:13px">${PRIVACY}</p></div>`;
  }
  if (auth.step === 'code') {
    return `<div class="sec account"><p style="margin:0" id="code-help">We sent a sign-in email to <b>${esc(auth.email)}</b>. Open its link on this device, or type the code from the email here.</p>
      <form class="row" data-form="code"><label class="sr-only" for="auth-code">Code from the email</label>
      <input id="auth-code" class="field" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Code" ${invalid || 'aria-describedby="code-help"'}>
      <button class="btn small primary" ${dis}>Sign in</button><button type="button" class="btn small" data-action="auth-back">Use another email</button></form>${m}</div>`;
  }
  const intro = CONFIG.allowSignup
    ? 'Sign in to sync progress between devices. New here? The same email creates your account.'
    : 'Sign in to sync progress between devices.';
  return `<div class="sec account"><label for="auth-email">${intro}</label>
    <form class="row" data-form="email"><input id="auth-email" class="field" type="email" autocomplete="email" required placeholder="you@example.com" value="${esc(auth.email)}" ${invalid}>
    <button class="btn small primary" ${dis}>Send sign-in email</button></form>
    ${Captcha.key ? '<div id="captcha" class="captcha"></div>' : ''}${m}
    <p class="muted" style="margin:0;font-size:13px">We store your email and your practice progress, nothing else. ${PRIVACY}</p></div>`;
}

function authError(e) {
  if (e && (e.code === 'unavailable' || e.code === 'timeout')) return 'The sync server could not be reached. Check your connection and try again.';
  const t = String((e && e.msg) || '');
  if (t === 'captcha pending') return 'The check against automated sign-ups is not finished yet. Wait a moment and try again.';
  if (/captcha/i.test(t)) return 'The check against automated sign-ups did not pass. Wait a moment and try again.';
  if (/signup|not allowed|not found/i.test(t)) return CONFIG.allowSignup ? 'This sync server is not accepting new accounts right now.' : 'There is no account for this email on this sync server.';
  if (/expired|invalid/i.test(t)) return 'That code is wrong or has expired. Request a new email.';
  if (e && e.status === 429) return 'Too many emails were requested. Wait a minute and try again.';
  return t ? 'Sign-in failed: ' + t : 'Sign-in failed.';
}

async function submit(form) {
  if (auth.busy) return;
  auth.busy = true; auth.msg = null;
  let focus;
  try {
    if (form === 'email') {
      auth.email = $('#auth-email').value.trim();
      let token = null;
      if (Captcha.key) {
        await Captcha.wait(8000);
        token = Captcha.take();
        if (!token) throw { msg: Captcha.failed ? 'captcha failed' : 'captcha pending' };
      }
      await Supa.sendLink(auth.email, token);
      auth.step = 'code';
      focus = '#auth-code';
      announce(`Sign-in email sent to ${auth.email}. Type the code from the email.`);
    } else {
      const code = $('#auth-code').value.replace(/\s+/g, '');
      if (!code) throw { msg: 'invalid' };
      await Supa.verifyCode(auth.email, code);
      reset({ ok: true, text: 'Signed in.' });
      await Sync.init();
      focus = '[data-action="sync-now"]';
    }
  } catch (err) {
    auth.msg = { ok: false, text: authError(err) };
    focus = form === 'email' ? '#auth-email' : '#auth-code';
  }
  auth.busy = false;
  render();
  if (auth.msg) announce(auth.msg.text);
  const el = focus && $(focus); if (el) el.focus();
}

// Called on load and when the URL fragment changes: a magic link brings tokens back to the page.
export function takeRedirect() {
  const r = Supa.configured() ? Supa.takeRedirect() : null;
  if (r) reset(r.ok ? { ok: true, text: 'Signed in.' } : { ok: false, text: r.text });
  return r;
}

export function listenAccount() {
  document.addEventListener('focusin', (e) => { if (target(e)?.id === 'auth-email') Captcha.mount(); });
  document.addEventListener('submit', (e) => {
    const f = /** @type {HTMLElement | null} */ (target(e)?.closest('[data-form]'));
    if (!f) return;
    e.preventDefault();
    submit(f.dataset.form);
  });
}

onAction({
  'auth-back': () => { auth = { step: 'email', email: auth.email, busy: false, msg: null, del: false }; render(); $('#auth-email').focus(); },
  'delete-ask': () => { auth.del = true; auth.msg = null; render(); $('[data-action="delete-no"]').focus(); },
  'delete-no': () => { auth.del = false; render(); const b = $('[data-action="delete-ask"]'); if (b) b.focus(); },
  'delete-yes': () => {
    auth.busy = true; render();
    Supa.deleteAccount().then(() => {
      reset({ ok: true, text: 'Your account is deleted. Progress stays in this browser.' });
      Sync.init(); render(); announce(auth.msg.text);
    }, (err) => {
      auth.busy = false;
      auth.msg = { ok: false, text: err && (err.code === 'unavailable' || err.code === 'timeout') ? 'The sync server could not be reached. Nothing was deleted. Try again when you are online.' : 'The account could not be deleted. Sign out, sign in again and retry.' };
      render(); announce(auth.msg.text);
    });
  },
  'sign-out': () => {
    Supa.signOut().then(() => {
      reset({ ok: true, text: 'Signed out. Progress stays in this browser.' });
      Sync.init(); render(); announce(auth.msg.text);
      const el = $('#auth-email'); if (el) el.focus();
    });
  },
  'sync-now': () => { auth.msg = null; Sync.init().then(() => { render(); announce(Sync.status === 'synced' ? 'Synced.' : 'Sync paused.'); }); },
});
