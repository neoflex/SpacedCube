"""Build both versions of the page.

dist/index.html   single self-contained file for the Claude artifact (core.js and app.js inlined).
dist/pwa/         installable web app: the same page plus manifest, service worker, icons and config.js.
                  Serve this folder over HTTPS (any static host).
"""
import hashlib, pathlib, shutil, sys

root = pathlib.Path(__file__).parent
src = root / 'src'
sys.path.insert(0, str(src / 'pwa'))
import icons  # noqa: E402

page = (src / 'index.src.html').read_text()
core = (src / 'core.js').read_text()
app = (src / 'app.js').read_text()
assert '</script' not in core and '</script' not in app
page = page.replace('/*@CORE@*/', core).replace('/*@APP@*/', app)
dist = root / 'dist'
dist.mkdir(exist_ok=True)

# Artifact build: no PWA tags (the artifact runtime provides sync through window.claude).
artifact = page.replace('<!--@PWA_HEAD@-->\n', '')
(dist / 'index.html').write_text(artifact)
print(f'dist/index.html: {len(artifact):,} bytes')

# PWA build.
PWA_HEAD = '''<meta name="theme-color" content="#eceef2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1216" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="SpacedCube">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<script src="config.js"></script>
<script>
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
</script>'''
pwa = dist / 'pwa'
if pwa.exists():
    shutil.rmtree(pwa)
pwa.mkdir()
html = page.replace('<!--@PWA_HEAD@-->', PWA_HEAD)
(pwa / 'index.html').write_text(html)
for f in ['config.js', 'manifest.webmanifest', 'privacy.html']:
    shutil.copy(src / 'pwa' / f, pwa / f)
icons.write_all(pwa)
version = hashlib.sha256(b''.join((pwa / f).read_bytes() for f in ['index.html', 'manifest.webmanifest', 'privacy.html'])).hexdigest()[:12]
(pwa / 'sw.js').write_text((src / 'pwa' / 'sw.js').read_text().replace('@VERSION@', version))
print(f'dist/pwa/: {len(list(pwa.iterdir()))} files, cache version {version}')
