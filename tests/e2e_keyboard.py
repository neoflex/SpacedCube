"""Keyboard and focus behaviour: skip link, focus after view changes and re-renders, modal dialogs
(focus moves in, the page behind is inert, focus returns to the opener), and the shortcut switch.
Prints "keyboard: ok" or the failures.
"""
import asyncio, os, pathlib, threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


async def main():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT / 'dist')))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/'
    fails, errs = [], []

    def check(cond, what):
        if not cond: fails.append(what)

    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
        pg = await (await b.new_context(service_workers='block', reduced_motion='reduce')).new_page()
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
        check(await pg.title() == 'Practice · OLL · SpacedCube', 'page title names the view')

        # Grading by button keeps focus on that button after the re-render, and is announced.
        await pg.focus('[data-action="grade"][data-ok="1"]')
        await pg.keyboard.press('Enter')
        check(await focused() == 'grade', 'focus kept on the grade button')
        await pg.wait_for_function("document.getElementById('announcer').textContent.length > 0")
        check('Got it' in await pg.text_content('#announcer'), 'grade announced')

        # Shortcuts: arrows grade; Space on a focused button presses that button instead.
        rep = lambda: pg.evaluate("JSON.parse(localStorage.getItem('oll-trainer-v1')).rep")
        before = await rep()
        await pg.focus('#view-title')
        await pg.keyboard.press('ArrowLeft')
        check(await rep() == before + 1, 'arrow grades with shortcuts on')

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
        await pg.reload()
        await pg.wait_for_selector('#app > *')
        check(await pg.evaluate("document.body.classList.contains('no-shortcuts')"), 'shortcut setting kept')
        await b.close()
    srv.shutdown()
    print('keyboard: ok' if not fails and not errs else f'keyboard: FAIL {fails} errors: {errs}')


asyncio.run(main())
