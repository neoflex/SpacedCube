"""Build both versions of the page.

dist/index.html   single self-contained file for the Claude artifact (core.js and app.js inlined).
dist/pwa/         installable web app: the same page plus manifest, service worker, icons and config.js.
                  Serve this folder over HTTPS (any static host).
"""
import hashlib, json, pathlib, shutil, sys

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
# claude.ai only lets artifacts load Google Fonts and cdnjs, so the artifact keeps those; the PWA serves its own copies.
GOOGLE_FONTS = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,500..800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">'''
artifact = page.replace('<!--@PWA_HEAD@-->\n', '').replace('<!--@FONTS@-->', GOOGLE_FONTS)
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
<link rel="preload" href="fonts/archivo-latin-variable.woff2" as="font" type="font/woff2" crossorigin>
<script src="config.js"></script>
<script>
window.SPACEDCUBE_THREE_URL = 'vendor/three.min.js';
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
</script>'''
pwa = dist / 'pwa'
if pwa.exists():
    shutil.rmtree(pwa)
pwa.mkdir()
html = page.replace('<!--@PWA_HEAD@-->', PWA_HEAD).replace('<!--@FONTS@-->', '<link rel="stylesheet" href="fonts/fonts.css">')
assert '://' not in ''.join(l for l in html.splitlines() if ('src=' in l or 'href=' in l) and 'jperm.net' not in l and 'w3.org' not in l and 'cdnjs' not in l), 'PWA page must not load anything from another origin'
(pwa / 'index.html').write_text(html)
for f in ['config.js', 'manifest.webmanifest', 'privacy.html']:
    shutil.copy(src / 'pwa' / f, pwa / f)
for d in ['fonts', 'vendor']:
    shutil.copytree(src / 'pwa' / d, pwa / d)
icons.write_all(pwa)
files = sorted(p.relative_to(pwa).as_posix() for p in pwa.rglob('*') if p.is_file() and not p.name.startswith('LICENSE'))
version = hashlib.sha256(b''.join((pwa / f).read_bytes() for f in files if f != 'config.js')).hexdigest()[:12]
sw = (src / 'pwa' / 'sw.js').read_text().replace('@VERSION@', version).replace('@FILES@', json.dumps(['./' + f for f in files]))
(pwa / 'sw.js').write_text(sw)
print(f'dist/pwa/: {len(list(pwa.iterdir()))} files, cache version {version}')
