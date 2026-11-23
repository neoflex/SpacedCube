// Keyboard and focus: skip link, focus after view changes and re-renders, the pause after a grade,
// modal dialogs (focus moves in, the page behind is inert, focus returns to the opener),
// "Practise it now", and the device settings (shortcuts, pause). Plus due counts with a fake clock.
import { test, expect } from '@playwright/test';
import { CSP_INIT, DIST, cspViolations, focused, until } from './helpers.mjs';
import { startServer } from './server.mjs';

let server;
test.beforeAll(async () => { server = await startServer(DIST); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(CSP_INIT);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  info['errors'] = errors;
});
test.afterEach(async ({ page }, info) => {
  expect(info['errors'], 'page errors').toEqual([]);
  expect(await cspViolations(page), 'CSP violations').toEqual([]);
});

test('keyboard and focus through a practice session', async ({ page }) => {
  const soft = expect.soft;
  const rep = () => page.evaluate("JSON.parse(localStorage.getItem('pll-trainer-v1')).rep");
  await page.goto(server.url);
  await page.locator('#app > *').first().waitFor();

  // The skip link is the first stop and moves focus to the main content.
  await page.keyboard.press('Tab');
  soft(await page.evaluate("document.activeElement.classList.contains('skip')"), 'skip link first').toBe(true);
  await page.keyboard.press('Enter');
  soft(await focused(page), 'skip link moves to main').toBe('app');

  // Start practising with the keyboard only; focus lands on the new view's heading.
  await page.focus('[data-action="setup-start"]');
  await page.keyboard.press('Enter');
  soft(await focused(page), 'focus on the view heading').toBe('view-title');
  soft(await page.title(), 'page title names the view (new users start on PLL)').toMatch(/Practice · PLL · SpacedCube$/);
  const due = await page.textContent('.tab[data-set="PLL"] .due-count');
  soft(due, 'due count in the header').toMatch(/^\d+ due$/);
  soft(await page.title(), 'due count in the title').toMatch(new RegExp(`^\\(${(due || '').split(' ')[0]}\\) `));

  // Grading pauses: the result stays, focus moves to Next scramble, the grade is announced.
  const before = await rep();
  await page.focus('[data-action="grade"][data-ok="1"]');
  await page.keyboard.press('Enter');
  soft(await rep(), 'grade recorded').toBe(before + 1);
  soft(await focused(page), 'focus on Next scramble').toBe('next-btn');
  soft(await page.locator('.pausebox').count() === 1 && await page.locator('#scramble-text').count() === 0, 'result shown, next scramble hidden').toBe(true);
  await until(page, "document.getElementById('announcer').textContent.length > 0");
  soft(await page.textContent('#announcer'), 'grade announced').toContain('Got it');

  // Grading again by habit (Enter on the same spot, or an arrow key) moves on and grades nothing.
  await page.keyboard.press('Enter');
  soft(await rep(), 'second press does not grade').toBe(before + 1);
  soft(await focused(page), 'focus on the new scramble').toBe('scramble-text');
  await page.keyboard.press('ArrowLeft');
  soft(await rep(), 'arrow grades a visible scramble').toBe(before + 2);
  await page.keyboard.press('ArrowLeft');
  soft(await rep(), 'arrow while paused does not grade').toBe(before + 2);
  soft(await page.locator('#scramble-text').count(), 'arrow while paused moves on').toBe(1);

  // The case dialog: focus moves in, the page behind is inert, Escape returns focus to the opener.
  await page.focus('.strip button >> nth=2');
  const opener = await page.evaluate('document.activeElement.dataset.id');
  await page.keyboard.press('Enter');
  await page.locator('[role=dialog]').waitFor();
  soft(await focused(page), 'focus moves into the dialog').toBe('close');
  soft(await page.evaluate("document.getElementById('app').inert && document.querySelector('header.top').inert"), 'page behind is inert').toBe(true);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  soft(await page.evaluate("document.getElementById('dlg').contains(document.activeElement) || document.activeElement === document.body"), 'Tab stays in the dialog').toBe(true);
  await page.keyboard.press('Escape');
  soft(await page.locator('[role=dialog]').count(), 'Escape closes the dialog').toBe(0);
  soft(await page.evaluate('document.activeElement.dataset.id'), 'focus returns to the opener').toBe(opener);
  soft(await page.evaluate("document.getElementById('app').inert"), 'page usable again').toBe(false);

  // "Practise it now": one attempt at that case, graded like any other.
  const pick = await page.getAttribute('.strip button >> nth=5', 'data-id');
  await page.click('.strip button >> nth=5');
  await page.click('[data-action="practise-now"]');
  soft(await page.evaluate("!document.querySelector('[role=dialog]') && !document.getElementById('app').inert"), 'dialog closed').toBe(true);
  soft(await focused(page), 'focus on the picked scramble').toBe('scramble-text');
  soft(await page.textContent('.newflag'), 'picked case named').toContain(pick);
  const nBefore = await page.evaluate((id) => JSON.parse(localStorage.getItem('pll-trainer-v1')).cases[id].n, pick);
  await page.click('[data-action="grade"][data-ok="1"]');
  const st = await page.evaluate("JSON.parse(localStorage.getItem('pll-trainer-v1'))");
  soft(st.cases[pick].n, 'the picked case was graded').toBe(nBefore + 1);
  soft(st.cases[pick].active, 'the picked case is in practice').toBe(true);
  await page.click('#next-btn');

  // Shortcuts off (Options): single keys do nothing, key hints are hidden.
  await page.click('#tab-options');
  soft(await focused(page), 'focus on the Options heading').toBe('view-title');
  await page.click('#o-shortcuts');
  await page.click('#tab-practice');
  let b2 = await rep();
  await page.focus('#view-title');
  await page.keyboard.press('ArrowRight');
  soft(await rep(), 'no grading with shortcuts off').toBe(b2);
  soft(await page.evaluate("getComputedStyle(document.querySelector('kbd')).display"), 'key hints hidden').toBe('none');

  // Pause off: grading goes straight to the next scramble.
  await page.click('#tab-options'); await page.click('#o-pause'); await page.click('#tab-practice');
  b2 = await rep();
  await page.click('[data-action="grade"][data-ok="1"]');
  soft(await rep(), 'graded').toBe(b2 + 1);
  soft(await page.locator('.pausebox').count() === 0 && await page.locator('#scramble-text').count() === 1, 'no pause when turned off').toBe(true);
  await page.reload();
  await page.locator('#app > *').first().waitFor();
  soft(await page.evaluate("document.body.classList.contains('no-shortcuts')"), 'shortcut setting kept').toBe(true);
});

test('a case coming due shows in the header badge and the practice pill together', async ({ page }) => {
  await page.clock.install();
  await page.goto(server.url);
  await page.evaluate(async () => {
    const { sets } = await import('./js/core/index.js');
    const s = sets.OLL.freshState(), now = Date.now();
    s.setupDone = true; s.settings.autoIntro = false;
    Object.assign(s.cases['27'], { active: true, level: 2, n: 3, ok: 3, last: 0, lastTs: now - 8 * 60000 });
    s.updatedAt = now;
    localStorage.setItem('oll-trainer-v1', JSON.stringify(s));
    localStorage.setItem('ll-trainer-set', 'OLL');
  });
  await page.reload();
  await page.locator('.duepill').waitFor();
  expect.soft(await page.textContent('.duepill')).toBe('Next due in 2 min');
  expect.soft(await page.locator('.tab[data-set="OLL"] .due-count').count()).toBe(0);
  await page.clock.fastForward('03:00');
  expect.soft(await page.textContent('.duepill')).toBe('1 due now');
  expect.soft(await page.textContent('.tab[data-set="OLL"] .due-count')).toMatch(/^1/);
});
