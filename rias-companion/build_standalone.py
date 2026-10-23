"""Bundle the app into one self-contained HTML file.

    python3 build_standalone.py            -> Rias.html (open it directly, no server needed)
    python3 build_standalone.py --fragment OUT.html   -> body-only version for embedding
"""
import base64
import pathlib
import re
import sys

here = pathlib.Path(__file__).parent
read = lambda name: (here / name).read_text(encoding='utf-8')

html = read('index.html')
icon = 'data:image/svg+xml;base64,' + base64.b64encode((here / 'icons/icon.svg').read_bytes()).decode()

html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{read('style.css')}</style>")
html = html.replace('<script src="dialogue.js"></script>', f"<script>\n{read('dialogue.js')}</script>")
html = html.replace('<script src="app.js"></script>', f"<script>\n{read('app.js')}</script>")
html = re.sub(r'\s*<link rel="(manifest|apple-touch-icon)"[^>]*>', '', html)
html = html.replace('icons/icon.svg', icon)

if '--fragment' in sys.argv:
    out = pathlib.Path(sys.argv[sys.argv.index('--fragment') + 1])
    head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
    body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
    head = re.sub(r'\s*<meta (charset|name="viewport")[^>]*>', '', head)
    head = head.replace('height: 100dvh;', 'height: 100%;')
    out.write_text(head.strip() + '\n' + body, encoding='utf-8')
else:
    (here / 'Rias.html').write_text(html, encoding='utf-8')
