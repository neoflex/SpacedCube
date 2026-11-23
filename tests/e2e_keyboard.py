"""Keyboard and focus behaviour: skip link, focus after view changes and re-renders, modal dialogs
(focus moves in, the page behind is inert, focus returns to the opener), and the shortcut switch.
Prints "keyboard: ok" or the failures.
"""
import asyncio
from playwright.async_api import async_playwright
from helpers import ROOT, BROWSER, CSP_INIT, launch, serve, wait_until, csp_violations




async def main():
    srv, url = serve(ROOT / 'dist')
    fails, errs = [], []

    def check(cond, what):
        if not cond: fails.append(what)

    async with async_playwright() as p:
        b = await launch(p)
        ctx = await b.new_context(service_workers='block', reduced_motion='reduce')
        await ctx.add_init_script(CSP_INIT)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        focused = lambda: pg.evaluate("(() => { const a = document.activeElement; return a ? (a.id || a.dataset.action || a.tagName) : null; })()")
        await pg.goto(url)
        await pg.wait_for_selector('#app > *')

        # Skip link is the first stop and moves focus to the main content.
        await pg.keyboard.press('Tab')
        check(await pg.evaluate("document.activeElement.classList.contains('skip')"), 'skip link first')
        await pg.keyboard.press('Enter')
        check(await focused() == 'app', 'skip link moves to main')

        # Start practising with the keyboard only; focus lands on the new view's heading.
        await pg.focus('[data-action="setup-start"]')
        await pg.keyboard.press('Enter')
        check(await focused() == 'view-title', 'focus on view heading after starting')
        check((await pg.title()).endswith('Practice · PLL · SpacedCube'), 'page title names the view (new users start on PLL)')
        # Due cases are shown in the header (with an accessible name) and the tab title.
        due = await pg.text_content('.tab[data-set="PLL"] .due-count')
        check(due and due.endswith(' due') and (await pg.title()).startswith(f'({due.split()[0]}) '), f'due count in header and title: {due!r}')

        # Grading pauses: the result stays, focus moves to Next scramble (same place as the grade
        # buttons), and the grade is announced.
        rep = lambda: pg.evaluate("JSON.parse(localStorage.getItem('pll-trainer-v1')).rep")
        before = await rep()
        await pg.focus('[data-action="grade"][data-ok="1"]')
        await pg.keyboard.press('Enter')
        check(await rep() == before + 1, 'grade recorded')
        check(await focused() == 'next-btn', 'focus on Next scramble after grading')
        check(await pg.locator('.pausebox').count() == 1 and await pg.locator('#scramble-text').count() == 0, 'result shown, next scramble hidden')
        await wait_until(pg, "document.getElementById('announcer').textContent.length > 0")
        check('Got it' in await pg.text_content('#announcer'), 'grade announced')

        # Grading again by habit (Enter on the same spot, or an arrow key) moves on and grades nothing.
        await pg.keyboard.press('Enter')
        check(await rep() == before + 1, 'second press does not grade')
        check(await focused() == 'scramble-text', 'focus on the new scramble')

        # Shortcuts: arrows grade a visible scramble; while paused they only move on.
        await pg.keyboard.press('ArrowLeft')
        check(await rep() == before + 2, 'arrow grades with shortcuts on')
        await pg.keyboard.press('ArrowLeft')
        check(await rep() == before + 2 and await pg.locator('#scramble-text').count() == 1, 'arrow while paused moves on without grading')

        # The case dialog: focus moves in, the page behind is inert, Escape returns focus to the opener.
        await pg.focus('.strip button >> nth=2')
        opener = await pg.evaluate("document.activeElement.dataset.id")
        await pg.keyboard.press('Enter')
        await pg.wait_for_selector('[role=dialog]')
        check(await focused() == 'close', 'focus moves into the dialog')
        check(await pg.evaluate("document.getElementById('app').inert && document.querySelector('header.top').inert"), 'page behind dialog is inert')
        for _ in range(12): await pg.keyboard.press('Tab')
        check(await pg.evaluate("document.getElementById('dlg').contains(document.activeElement) || document.activeElement === document.body"), 'Tab stays in the dialog')
        await pg.keyboard.press('Escape')
        check(await pg.evaluate("!document.querySelector('[role=dialog]')"), 'Escape closes the dialog')
        check(await pg.evaluate(f"document.activeElement.dataset.id === {opener!r}"), 'focus returns to the opener')
        check(not await pg.evaluate("document.getElementById('app').inert"), 'page usable again')

        # "Practise it now" in a case's details: one attempt at that case, graded like any other.
        pick = await pg.get_attribute('.strip button >> nth=5', 'data-id')
        await pg.click('.strip button >> nth=5')
        await pg.click('[data-action="practise-now"]')
        check(await pg.evaluate("!document.querySelector('[role=dialog]') && !document.getElementById('app').inert"), 'dialog closed after Practise it now')
        check(await focused() == 'scramble-text', 'focus on the picked scramble')
        check(pick in (await pg.text_content('.newflag')), 'picked case named on the practice screen')
        n_before = await pg.evaluate(f"JSON.parse(localStorage.getItem('pll-trainer-v1')).cases[{pick!r}].n")
        await pg.click('[data-action="grade"][data-ok="1"]')
        st = await pg.evaluate("JSON.parse(localStorage.getItem('pll-trainer-v1'))")
        check(st['cases'][pick]['n'] == n_before + 1 and st['cases'][pick]['active'], 'the picked case was graded (and is in practice)')
        await pg.click('#next-btn')

        # Turning shortcuts off (Options) stops single keys, and hides the key hints.
        await pg.click('#tab-options')
        check(await focused() == 'view-title', 'focus on Options heading')
        await pg.click('#o-shortcuts')
        await pg.click('#tab-practice')
        before = await rep()
        await pg.focus('#view-title')
        await pg.keyboard.press('ArrowRight')
        check(await rep() == before, 'no grading with shortcuts off')
        check(await pg.evaluate("getComputedStyle(document.querySelector('kbd')).display === 'none'"), 'key hints hidden')
        # With "Pause after each grade" off, grading goes straight to the next scramble.
        await pg.click('#tab-options'); await pg.click('#o-pause'); await pg.click('#tab-practice')
        before = await rep()
        await pg.click('[data-action="grade"][data-ok="1"]')
        check(await rep() == before + 1 and await pg.locator('.pausebox').count() == 0 and await pg.locator('#scramble-text').count() == 1, 'no pause when turned off')
        await pg.reload()
        await pg.wait_for_selector('#app > *')
        check(await pg.evaluate("document.body.classList.contains('no-shortcuts')"), 'shortcut setting kept')
        errs.extend('CSP: ' + v for v in await csp_violations(pg))

        # A case that comes due while the practice screen is open shows up in the header badge and
        # in the practice screen's pill at the same time (fake clock: no real waiting).
        ctx2 = await b.new_context(service_workers='block', reduced_motion='reduce')
        pg2 = await ctx2.new_page()
        pg2.on('pageerror', lambda e: errs.append(str(e)))
        await pg2.clock.install()
        await pg2.goto(url)
        await pg2.evaluate("""async () => {
            const { sets } = await import('./js/core/index.js');
            const s = sets.OLL.freshState(), now = Date.now();
            s.setupDone = true; s.settings.autoIntro = false;
            Object.assign(s.cases['27'], { active: true, level: 2, n: 3, ok: 3, last: 0, lastTs: now - 8 * 60000 });
            s.updatedAt = now;
            localStorage.setItem('oll-trainer-v1', JSON.stringify(s));
            localStorage.setItem('ll-trainer-set', 'OLL');
        }""")
        await pg2.reload()
        await pg2.wait_for_selector('.duepill')
        check(await pg2.text_content('.duepill') == 'Next due in 2 min', 'pill before: ' + await pg2.text_content('.duepill'))
        check(await pg2.locator('.tab[data-set="OLL"] .due-count').count() == 0, 'no badge before')
        await pg2.clock.fast_forward('03:00')
        check(await pg2.text_content('.duepill') == '1 due now', 'pill after: ' + await pg2.text_content('.duepill'))
        check((await pg2.text_content('.tab[data-set="OLL"] .due-count') or '').startswith('1'), 'badge after')
        await b.close()
    srv.shutdown()
    print(f'[{BROWSER}]', end=' ')
    print('keyboard: ok' if not fails and not errs else f'keyboard: FAIL {fails} errors: {errs}')


asyncio.run(main())
