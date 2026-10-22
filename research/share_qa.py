"""Loopback-only share API capture; never opens a composer or sends a message."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
CHECK = b'''
const qaPage = {href:location.href}, qaCalls = [];
const qaMode = new URL(location.href).searchParams.get('qaMode');
Object.defineProperty(navigator, 'share', {value: qaMode === 'unsupported' ? undefined :
  async function(data) {
    qaCalls.push({data, active:navigator.userActivation.isActive, receiver:this === navigator});
    if (qaMode === 'cancel') throw new DOMException('Canceled by QA', 'AbortError');
    if (qaMode === 'failure') throw new DOMException('Denied by QA', 'NotAllowedError');
  }});
function qaReport() {
  let note = document.querySelector('#share-check-result');
  if (!note) {
    note = document.createElement('pre'); note.id = 'share-check-result';
    note.style = 'position:fixed;top:0;left:0;z-index:100;background:#000;color:#fff;font:12px monospace;max-width:100%;white-space:pre-wrap;pointer-events:none';
    document.body.append(note);
  }
  note.textContent = JSON.stringify({calls:qaCalls, href:qaPage.href, screen,
    scope:'Desktop browser, actual menu button, stubbed share API and mail handoff'}, null, 2);
}
'''


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'build/web'), **kwargs)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/sw.js':
            self.send_error(404)
            return
        if path != '/game.mjs':
            return super().do_GET()
        body = (ROOT / 'build/web/game.mjs').read_bytes()
        marker = b'void tellFriend(location, navigator);'
        assert body.count(marker) == 1
        body = CHECK + body.replace(marker, b'void tellFriend(qaPage, navigator).finally(qaReport);')
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
