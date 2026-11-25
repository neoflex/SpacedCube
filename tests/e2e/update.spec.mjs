// A new deploy reaches an open or installed app on its next load: no banner, no second reload.
// The server sends GitHub Pages' caching headers (browsers may reuse a file for 10 minutes), which
// is what kept old code running: the browser reused modules from memory without asking anyone.
// Versioned addresses (file.js?v=<build version>, see build.mjs) make every deploy load new files.
import { test, expect } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CSP_INIT, ROOT } from './helpers.mjs';
import { startServer } from './server.mjs';

let server, work, site;
test.beforeAll(async () => {
  // A copy of the sources to build "the next deploy" from, and the served site.
  work = mkdtempSync(join(tmpdir(), 'spacedcube-update-'));
  for (const d of ['src', 'tools']) cpSync(join(ROOT, d), join(work, d), { recursive: true });
  cpSync(join(ROOT, 'build.mjs'), join(work, 'build.mjs'));
  site = join(work, 'site');
  execFileSync(process.execPath, [join(work, 'build.mjs'), '--out', site]);
  server = await startServer(site);
});
test.afterAll(async () => { await server.close(); rmSync(work, { recursive: true, force: true }); });

const howText = async (page) => {
  await page.click('#tab-options');
  return page.locator('#o-how').locator('..').innerText();
};

test('the next load after a deploy runs the new code', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Playwright cannot run service workers in Firefox');
  const ctx = await browser.newContext({ serviceWorkers: 'allow' });
  await ctx.addInitScript(CSP_INIT);
  const page = await ctx.newPage();
  await page.goto(server.url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();                           // now controlled by the service worker, files cached
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(await howText(page)).toContain('While any case is due');

  // Deploy: one module changes, the site is rebuilt in place.
  const file = join(work, 'src', 'js', 'app', 'options.js');
  writeFileSync(file, readFileSync(file, 'utf8').replace('While any case is due, only due cases come up', 'DEPLOYED: only due cases come up'));
  execFileSync(process.execPath, [join(work, 'build.mjs'), '--out', site]);

  await page.reload();
  expect(await howText(page), 'one reload runs the new code').toContain('DEPLOYED: only due cases come up');

  // Offline afterwards: the app still opens.
  if (browserName === 'chromium') {
    await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
    await ctx.setOffline(true);
    await page.reload();
    await expect(page.locator('#tab-options')).toBeVisible();
    await ctx.setOffline(false);
  }
  await ctx.close();
});
