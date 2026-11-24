// Speed practice: the mode switch, starting and stopping the timer by pointer and by keyboard,
// a false start, grading, the time kept for the case, and axe on each Speed screen.
import { test, expect } from '@playwright/test';
import { AXE, CSP_INIT, DIST, cspViolations, focused } from './helpers.mjs';
import { startServer } from './server.mjs';
import { sets } from '../../src/js/core/index.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
let server;
test.beforeAll(async () => { server = await startServer(DIST); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: 'block' });

// Every PLL case Mastered and seen just now, so none is due and Speed is open.
function masteredState() {
  const C = sets.PLL, s = C.freshState(), now = Date.now();
  s.setupDone = true;
  for (const id of C.CASE_IDS) { C.introduce(s, id, C.MASTERED); s.cases[id].lastTs = now; s.cases[id].n = 4; s.cases[id].ok = 4; }
  C.openSpeedIfReady(s);
  s.updatedAt = now;
  return s;
}

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(CSP_INIT);
  await page.addInitScript((st) => { if (!localStorage.getItem('pll-trainer-v1')) localStorage.setItem('pll-trainer-v1', st); }, JSON.stringify(masteredState()));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  info['errors'] = errors;
});
test.afterEach(async ({ page }, info) => {
  expect(info['errors'], 'page errors').toEqual([]);
  expect(await cspViolations(page), 'CSP violations').toEqual([]);
});

async function axe(page, where, found) {
  if (!(await page.evaluate('!!window.axe'))) await page.evaluate(AXE);
  const res = await page.evaluate((tags) => window['axe'].run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), TAGS);
  for (const v of res.violations) found.push(`${where}: ${v.id} ${v.nodes.map((n) => n.target[0]).slice(0, 3).join(', ')}`);
}
const saved = (page) => page.evaluate("JSON.parse(localStorage.getItem('pll-trainer-v1'))");

test('Speed practice: switch, time a solve with the pointer and the keyboard, grade it', async ({ page }) => {
  const soft = expect.soft, a11y = [];
  await page.goto(server.url);
  await page.locator('.trainer').waitFor();

  // The switch appears once Speed is open; Memory is selected until you choose Speed.
  await expect(page.locator('[data-action="mode"][data-p="memory"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('[data-action="mode"][data-p="speed"]');
  await expect(page.locator('#timer-start')).toBeVisible();
  soft(await focused(page), 'focus stays on the switch').toBe('mode');
  soft(await page.locator('#scramble-h').textContent()).toBe('Speed');
  await axe(page, 'speed ready', a11y);

  // Got it needs a time: the right arrow does nothing before the solve.
  await page.locator('#scramble-text').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#timer-start')).toBeVisible();

  // Pointer: start, the whole screen stops it.
  await page.click('#timer-start');
  await expect(page.locator('#timer-stop')).toBeVisible();
  soft(await focused(page), 'focus on the stop button').toBe('timer-stop');
  await axe(page, 'speed running', a11y);
  await page.waitForTimeout(400);
  await page.mouse.click(20, 20);
  await expect(page.locator('.timeres')).toBeVisible();
  soft(await focused(page), 'focus on Got it after stopping').toBe('grade');

  // A false start goes back to Start with the same scramble.
  const scramble = await page.locator('#scramble-text').textContent();
  await page.click('[data-action="retime"]');
  await expect(page.locator('#timer-start')).toBeVisible();
  soft(await page.locator('#scramble-text').textContent(), 'same scramble after a false start').toBe(scramble);

  // Keyboard: Space starts, any key stops, the right arrow grades.
  await page.locator('#scramble-text').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#timer-stop')).toBeVisible();
  await page.waitForTimeout(400);
  await page.keyboard.press('k');
  await expect(page.locator('.timeres')).toBeVisible();
  await axe(page, 'speed result', a11y);
  const before = await saved(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.pausebox')).toBeVisible();
  await axe(page, 'speed paused', a11y);

  const after = await saved(page);
  const id = after.lastCase;
  soft(after.cases[id].times.length, 'the time is kept').toBe(1);
  const [ms, turns] = after.cases[id].times[0];
  soft(ms, 'about the time waited').toBeGreaterThanOrEqual(400);
  soft(turns).toBeGreaterThan(0);
  soft(after.cases[id].level, 'memory level unchanged (not due)').toBe(before.cases[id].level);
  soft(after.cases[id].lastTs, 'memory gap not reset').toBe(before.cases[id].lastTs);
  soft(after.rep, 'not a memory attempt').toBe(before.rep);
  await expect(page.locator('.pausebox')).toContainText('2 more timed solves for a speed level');

  // Missed without timing: possible from the start screen, records no time.
  await page.click('#next-btn');
  await page.click('[data-action="grade"][data-ok="0"]');
  const missed = await saved(page);
  soft(missed.cases[missed.lastCase].times.length, 'a miss records no time').toBe(0);
  soft(missed.cases[missed.lastCase].level, 'a miss counts for memory').toBeLessThan(7);

  // The case details show the Speed section.
  await page.click('[data-action="open"]');
  await expect(page.locator('#dlg-speed')).toBeVisible();
  await axe(page, 'case dialog with speed', a11y);
  await page.keyboard.press('Escape');

  // Back to Memory: the attempt counter and grade buttons return.
  await page.click('[data-action="mode"][data-p="memory"]');
  await expect(page.locator('.grades')).toBeVisible();
  soft(a11y, 'accessibility (axe)').toEqual([]);
});
