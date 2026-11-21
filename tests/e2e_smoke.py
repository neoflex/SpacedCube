import asyncio, os, pathlib
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=os.environ.get('CHROME') or None,args=['--no-sandbox'])
        pg=await (await b.new_context(viewport={'width':1280,'height':900})).new_page()
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto(pathlib.Path(__file__).resolve().parent.parent.joinpath('dist','index.html').as_uri())
        found=[]
        async def scan(where):
            t=await pg.evaluate("document.body.innerText + [...document.querySelectorAll('[title],[aria-label],[placeholder]')].map(e=>(e.title||'')+(e.getAttribute('aria-label')||'')+(e.placeholder||'')).join(' ')")
            if '${' in t or 'undefined' in t or 'NaN' in t: found.append((where, [l for l in t.split('\n') if '${' in l or 'undefined' in l or 'NaN' in l][:3]))
        for S in ['OLL','PLL']:
            await pg.click(f'.tab[data-set="{S}"]')
            await scan(S+' setup')
            n=await pg.locator('.ghead .btn').count()
            for i in range(n): await pg.locator('.ghead .btn').nth(i).click()
            await scan(S+' setup all selected')
            await pg.click('.setup .btn.primary')
            await scan(S+' practice all active')
            await pg.keyboard.press('c'); await scan(S+' case only')
            await pg.click('[data-action="hint"]'); await scan(S+' hint ask')
            await pg.keyboard.press('Escape'); await pg.keyboard.press('Space'); await scan(S+' reveal ask')
            await pg.keyboard.press('Space'); await scan(S+' revealed')
            for i in range(10): await pg.keyboard.press('ArrowRight' if i%3 else 'ArrowLeft')
            await scan(S+' after grades')
            await pg.click('.strip button >> nth=0'); await scan(S+' dialog'); await pg.keyboard.press('Escape')
            await pg.click('#tab-cases'); await scan(S+' cases')
            for v in ['weak','misses']:
                await pg.select_option('#sort-by', v); await scan(S+' sort '+v)
            await pg.click('#tab-progress'); await scan(S+' progress')
            await pg.click('#tab-options'); await scan(S+' options')
            for pnl in ['export','import','reset']:
                await pg.click(f'[data-action="panel"][data-p="{pnl}"]'); await scan(S+' panel '+pnl)
            await pg.click('#tab-practice')
        print('found:', found, 'errors:', errs)
        await b.close()
asyncio.run(main())
