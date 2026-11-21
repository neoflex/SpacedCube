"""Build the single-file page: inlines src/core.js and src/app.js into src/index.src.html."""
import pathlib

root = pathlib.Path(__file__).parent
src = (root / 'src' / 'index.src.html').read_text()
core = (root / 'src' / 'core.js').read_text()
app = (root / 'src' / 'app.js').read_text()
assert '</script' not in core and '</script' not in app
out = src.replace('/*@CORE@*/', core).replace('/*@APP@*/', app)
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'index.html').write_text(out)
print(f'dist/index.html: {len(out):,} bytes')
