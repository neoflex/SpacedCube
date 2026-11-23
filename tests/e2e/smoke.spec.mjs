// Clicks through every view of both sets and checks each screen for unrendered placeholders
// (${, undefined, NaN), page errors, Content Security Policy violations, and accessibility
// (axe-core, WCAG 2.2 A and AA, plus best practices).
import { test, expect } from '@playwright/test';
import { AXE, CSP_INIT, DIST, cspViolations } from './helpers.mjs';
import { startServer } from './server.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
let server;
test.beforeAll(async () => { server = await startServer(DIST); });
test.afterAll(async () => { await server.close(); });

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`every screen, ${scheme} mode`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.addInitScript(CSP_INIT);
    const page = await ctx.newPage();
    const errors = [], found = [], a11y = new Map();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(server.url);
    await page.locator('#app > *').first().waitFor();

    async function scan(where) {
      const text = await page.evaluate("document.body.innerText + [...document.querySelectorAll('[title],[aria-label],[placeholder]')].map(e => (e.title || '') + (e.getAttribute('aria-label') || '') + (e.placeholder || '')).join(' ')");
      const bad = text.split('\n').filter((l) => l.includes('${') || l.includes('undefined') || l.includes('NaN'));
      if (bad.length) found.push(`${where}: ${bad.slice(0, 3).join(' | ')}`);
      // Evaluated, not injected as a <script>: the page's CSP stays in force.
      if (!(await page.evaluate('!!window.axe'))) await page.evaluate(AXE);
      const res = await page.evaluate((tags) => window['axe'].run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }), TAGS);
      for (const v of res.violations) {
        const key = `${v.id} (${v.impact}): ${v.help}`;
        const e = a11y.get(key) || { where: new Set(), nodes: new Set() };
        e.where.add(where);
        v.nodes.slice(0, 3).forEach((n) => e.nodes.add(String(n.target[0])));
        a11y.set(key, e);
      }
    }

    // Dark mode only changes colours: one set is enough there.
    for (const set of scheme === 'light' ? ['PLL', 'OLL'] : ['PLL']) {
      await page.click(`.tab[data-set="${set}"]`);
      await scan(`${set} setup`);
      const groups = page.locator('.ghead .btn');
      for (let i = 0, n = await groups.count(); i < n; i++) await groups.nth(i).click();
      await scan(`${set} setup all selected`);
      await page.click('.setup .btn.primary');
      await scan(`${set} practice`);
      await page.keyboard.press('c'); await scan(`${set} case only`);
      await page.click('[data-action="hint"]'); await scan(`${set} hint ask`);
      await page.keyboard.press('Escape'); await page.keyboard.press('Space'); await scan(`${set} reveal ask`);
      await page.keyboard.press('Space'); await scan(`${set} revealed`);
      for (let i = 0; i < 10; i++) await page.keyboard.press(i % 3 ? 'ArrowRight' : 'ArrowLeft');
      await scan(`${set} after grades`);
      await page.click('.strip button >> nth=0'); await scan(`${set} dialog`);
      await page.keyboard.press('Escape');
      await page.click('#tab-cases'); await scan(`${set} cases`);
      for (const v of ['weak', 'misses']) { await page.selectOption('#sort-by', v); await scan(`${set} sort ${v}`); }
      await page.click('#tab-progress'); await scan(`${set} progress`);
      await page.click('#tab-options'); await scan(`${set} options`);
      for (const p of ['export', 'import', 'reset']) { await page.click(`[data-action="panel"][data-p="${p}"]`); await scan(`${set} panel ${p}`); }
      await page.click('#tab-practice');
    }

    const csp = await cspViolations(page);
    await ctx.close();
    const report = [...a11y].map(([k, e]) => `${k}\n    where: ${[...e.where].join(', ')}\n    nodes: ${[...e.nodes].join(', ')}`);
    expect.soft(found, 'unrendered placeholders').toEqual([]);
    expect.soft(errors, 'page errors').toEqual([]);
    expect.soft(csp, 'CSP violations').toEqual([]);
    expect.soft(report, 'accessibility (axe)').toEqual([]);
  });
}
