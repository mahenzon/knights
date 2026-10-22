"""Disposable local visual review; the real renderer uses a frozen Wasm checkpoint."""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CHECKPOINTS=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'research/missile-qa-saves.json'
PORT=int(sys.argv[2]) if len(sys.argv)>2 else 8906
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'build/web'),**kwargs)
    def do_GET(self):
        path=self.path.split('?')[0]
        if path=='/qa':
            states=CHECKPOINTS.read_text()
            body=('<!doctype html><title>Local effect checkpoints</title><p>Frozen native-effect checkpoints, test origin only.</p>'
                + ''.join(f'<button>{s}</button>' for s in json.loads(states))
                + '<script>const states='+states+';document.querySelectorAll("button").forEach(b=>b.onclick=()=>{'
                + 'localStorage.setItem("knights-onrush-save-v2",JSON.stringify(states[b.textContent]));location.href="/?mute=1";});</script>').encode()
            mime='text/html'
        elif path=='/game.mjs':
            body=(ROOT/'build/web/game.mjs').read_bytes().replace(b'function tick() {',b'function tick() { clock.stop(); return;')
            mime='text/javascript'
        elif path=='/sw.js':
            self.send_error(404);return # Keep test overrides out of service-worker caches.
        else:return super().do_GET()
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
