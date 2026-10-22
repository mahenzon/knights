"""Local-only crowded browser rendering probe; production files stay untouched."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'research/render_browser_qa.mjs'


def instrument():
    source = (ROOT / 'build/web/game.mjs').read_text()
    for before, after in [
        ('function tick() {', 'function originalTick() {'),
        ('function render() {', 'function originalRender() {'),
        ('boot();', SCRIPT.read_text()),
    ]:
        assert source.count(before) == 1, before
        source = source.replace(before, after)
    return source.encode()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'build/web'), **kwargs)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/sw.js':
            self.send_error(404)
            return
        if path != '/game.mjs':
            return super().do_GET()
        body = instrument()
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    instrument()  # Fail before opening a server if production anchors changed.
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
