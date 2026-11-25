// The recap after a grade (level change, level track, next level, recent results) and the confetti
// on a level up: shown with motion allowed, never with reduced motion or with the setting off.
import { test, expect } from '@playwright/test';
import { AXE, CSP_INIT, DIST, cspViolations } from './helpers.mjs';
import { startServer } from './server.mjs';
import { sets } from '../../src/js/core/index.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
let server;
test.beforeAll(async () => { server = await startServer(DIST); });
test.afterAll(async () => { await server.close(); });

// T perm at level 4, last seen 3 days ago: a correct answer raises it to 5 (Solid).
function state() {
  const C = sets.PLL, s = C.freshState(), now = Date.now();
  s.setupDone = true;
  for (const id of C.CASE_IDS) { C.introduce(s, id, 2); Object.assign(s.cases[id], { lastTs: now, n: 3, ok: 3, hist: '111', last: 1 }); }
  Object.assign(s.cases.T, { level: 4, lastTs: now - 3 * 86400000, n: 9, ok: 7, hist: '110111011', last: 0 });
  s.rep = 30; s.updatedAt = now;
  return JSON.stringify(s);
}

async function levelUp(browser, { motion, celebrate }) {
  const ctx = await browser.newContext({ reducedMotion: motion, serviceWorkers: 'block' });
  await ctx.addInitScript(CSP_INIT);
  await ctx.addInitScript(([st, cel]) => {
    if (!localStorage.getItem('pll-trainer-v1')) localStorage.setItem('pll-trainer-v1', st);
    if (!cel) localStorage.setItem('spacedcube-celebrate', 'off');
  }, [state(), celebrate]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(server.url);
  await page.locator('.trainer').waitFor();
  await page.click('.strip [data-id="T"]');
  await page.click('[data-action="practise-now"]');
  await page.click('[data-action="grade"][data-ok="1"]');
  await expect(page.locator('.pausebox')).toBeVisible();
  const confetti = await page.locator('canvas.confetti').count();
  return { ctx, page, errors, confetti };
}

test('the pause shows the level up, the track, the next level and recent results', async ({ browser }) => {
  const { ctx, page, errors, confetti } = await levelUp(browser, { motion: 'reduce', celebrate: true });
  const box = page.locator('.pausebox');
  await expect(box.locator('.levelup')).toHaveText('Level up: 4 to 5. Now Solid!');
  await expect(box.locator('.lvtrack-bar')).toHaveAttribute('aria-label', 'Level 5 of 10, Solid');
  await expect(box.locator('.lvtrack-bar i.on')).toHaveCount(5);
  await expect(box).toContainText('Next level: get it right again in 2 days or later.');
  await expect(box).toContainText('Mastered: 2 more level ups, at the earliest in 6 days.');
  await expect(box).toContainText('Last 10: 8 right');
  expect(confetti, 'no confetti with reduced motion').toBe(0);

  // A miss on the next case: the level drops, said in words.
  await page.click('#next-btn');
  await page.click('[data-action="grade"][data-ok="0"]');
  await expect(page.locator('.recap')).toContainText(/Down from level 2 to 0/);

  await page.evaluate(AXE);
  const res = await page.evaluate((tags) => window['axe'].run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), TAGS);
  expect(res.violations.map((v) => v.id), 'accessibility (axe)').toEqual([]);
  expect(errors).toEqual([]);
  expect(await cspViolations(page)).toEqual([]);
  await ctx.close();
});

test('confetti on a level up when motion is allowed, not when the setting is off', async ({ browser }) => {
  const on = await levelUp(browser, { motion: 'no-preference', celebrate: true });
  expect(on.confetti, 'confetti shown').toBe(1);
  await expect(on.page.locator('canvas.confetti')).toHaveCount(0, { timeout: 5000 }); // gone after about 2 s
  expect(on.errors).toEqual([]);
  await on.ctx.close();
  const off = await levelUp(browser, { motion: 'no-preference', celebrate: false });
  expect(off.confetti, 'setting off').toBe(0);
  await off.ctx.close();
});
