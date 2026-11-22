"""Clicks through every view of both sets and checks three things on each screen:
unrendered placeholders (${, undefined, NaN), page errors, and accessibility (axe-core, WCAG 2.2 A and AA).
Run `npm install` once for axe-core. Prints "found: [] errors: [] a11y: []" when everything passes.
"""
import asyncio
from playwright.async_api import async_playwright
from helpers import ROOT, BROWSER, CSP_INIT, launch, serve, csp_violations

AXE = (ROOT / 'node_modules' / 'axe-core' / 'axe.min.js').read_text()
TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']



async def main():
    srv, url = serve(ROOT / 'dist')
    found, errs, a11y = [], [], {}
    async with async_playwright() as p:
        b = await launch(p)
        for scheme in ['light', 'dark']:
            ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, color_scheme=scheme, reduced_motion='reduce', service_workers='block')
            await ctx.add_init_script(CSP_INIT)
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(url)
            await pg.wait_for_selector('#app > *')

            async def scan(where):
                t = await pg.evaluate("document.body.innerText + [...document.querySelectorAll('[title],[aria-label],[placeholder]')].map(e=>(e.title||'')+(e.getAttribute('aria-label')||'')+(e.placeholder||'')).join(' ')")
                if '${' in t or 'undefined' in t or 'NaN' in t:
                    found.append((where, [l for l in t.split('\n') if '${' in l or 'undefined' in l or 'NaN' in l][:3]))
                if not await pg.evaluate('!!window.axe'):
                    await pg.evaluate(AXE)   # evaluated, not injected as <script>: the page's CSP stays in force
                res = await pg.evaluate('(tags) => axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] })', TAGS)
                for v in res['violations']:
                    key = f"{v['id']} ({v['impact']})"
                    entry = a11y.setdefault(key, {'help': v['help'], 'where': set(), 'nodes': set()})
                    entry['where'].add(f'{scheme} {where}')
                    for n in v['nodes'][:3]:
                        entry['nodes'].add(n['target'][0] if isinstance(n['target'][0], str) else str(n['target']))

            for S in ['OLL', 'PLL']:
                await pg.click(f'.tab[data-set="{S}"]')
                await scan(S + ' setup')
                n = await pg.locator('.ghead .btn').count()
                for i in range(n): await pg.locator('.ghead .btn').nth(i).click()
                await scan(S + ' setup all selected')
                await pg.click('.setup .btn.primary')
                await scan(S + ' practice all active')
                await pg.keyboard.press('c'); await scan(S + ' case only')
                await pg.click('[data-action="hint"]'); await scan(S + ' hint ask')
                await pg.keyboard.press('Escape'); await pg.keyboard.press('Space'); await scan(S + ' reveal ask')
                await pg.keyboard.press('Space'); await scan(S + ' revealed')
                for i in range(10): await pg.keyboard.press('ArrowRight' if i % 3 else 'ArrowLeft')
                await scan(S + ' after grades')
                await pg.click('.strip button >> nth=0'); await scan(S + ' dialog')
                await pg.keyboard.press('Escape')
                await pg.click('#tab-cases'); await scan(S + ' cases')
                for v in ['weak', 'misses']:
                    await pg.select_option('#sort-by', v); await scan(S + ' sort ' + v)
                await pg.click('#tab-progress'); await scan(S + ' progress')
                await pg.click('#tab-options'); await scan(S + ' options')
                for pnl in ['export', 'import', 'reset']:
                    await pg.click(f'[data-action="panel"][data-p="{pnl}"]'); await scan(S + ' panel ' + pnl)
                await pg.click('#tab-practice')
                if scheme == 'dark': break   # contrast in dark mode: one set is enough
            errs.extend('CSP: ' + v for v in await csp_violations(pg))
            await ctx.close()
        await b.close()
    srv.shutdown()
    for k, v in sorted(a11y.items()):
        print(f"a11y {k}: {v['help']}\n    where: {', '.join(sorted(v['where']))[:300]}\n    nodes: {', '.join(sorted(v['nodes']))[:300]}")
    print(f'[{BROWSER}]', end=' ')
    print('found:', found, 'errors:', errs, 'a11y:', sorted(a11y))


asyncio.run(main())
