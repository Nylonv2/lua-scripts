"""Bundle the app into one self-contained HTML file.

    python3 build_standalone.py            -> ../RiasCompanion.html (open it directly, no server needed)
    python3 build_standalone.py --fragment OUT.html   -> body-only version for embedding
"""
import base64
import json
import pathlib
import re
import sys

here = pathlib.Path(__file__).parent
read = lambda name: (here / name).read_text(encoding='utf-8')

html = read('index.html')
icon = 'data:image/svg+xml;base64,' + base64.b64encode((here / 'icons/icon.svg').read_bytes()).decode()

html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{read('style.css')}</style>")
html = html.replace('<script src="dialogue.js"></script>', f"<script>\n{read('dialogue.js')}</script>")
html = html.replace('<script src="talk.js"></script>', f"<script>\n{read('talk.js')}</script>")
html = html.replace('<script src="chat.js"></script>', f"<script>\n{read('chat.js')}</script>")
for js in ('food.js', 'work.js', 'vendor/anthropic-sdk.js', 'ai.js', 'rias-avatar.js', 'living-photo.js', 'photo-cutout.js', 'alarm-card.js', 'natural-voice.js', 'assistant.js', 'biz.js', 'replies.js'):
    html = html.replace(f'<script src="{js}"></script>', f"<script>\n{read(js)}</script>")
html = html.replace('<script src="app.js"></script>', f"<script>\n{read('app.js')}</script>")
html = re.sub(r'\s*<link rel="(manifest|apple-touch-icon)"[^>]*>', '', html)
html = html.replace('icons/icon.svg', icon)
# The alarm sounds ride along as data URIs (they're small).
sounds = {p.stem.replace('alarm_', ''): 'data:audio/ogg;base64,' + base64.b64encode(p.read_bytes()).decode()
          for p in sorted((here / 'sounds').glob('alarm_*.ogg'))}
html = html.replace('<script>\n', '<script>window.RIAS_SOUNDS = ' + json.dumps(sounds) + ';</script>\n<script>\n', 1)

if '--fragment' in sys.argv:
    out = pathlib.Path(sys.argv[sys.argv.index('--fragment') + 1])
    head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
    body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
    head = re.sub(r'\s*<meta (charset|name="viewport")[^>]*>', '', head)
    head = head.replace('height: 100dvh;', 'height: 100%;')
    out.write_text(head.strip() + '\n' + body, encoding='utf-8')
else:
    (here.parent / 'RiasCompanion.html').write_text(html, encoding='utf-8')
