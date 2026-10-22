"""Loopback-only actual map clock/handler regression, with an old-code comparison."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
CHECK = b'''
async function checkSlowMapDrag() {
  await castleMenu();
  const overlay = $('#castle-ui'), bounds = canvas.getBoundingClientRect();
  const capture = overlay.setPointerCapture, release = overlay.releasePointerCapture;
  overlay.setPointerCapture = () => {};
  overlay.releasePointerCapture = () => {};
  const event = (y) => ({pointerId:999, button:0, preventDefault(){},
    clientX:bounds.left + 20 * bounds.width / 480,
    clientY:bounds.top + y * bounds.height / 320});
  const frame = () => new Promise(requestAnimationFrame);
  overlay.onpointerdown(event(100));
  for (let i=0; i<120; i++) await frame();
  const before = [...mapView.motion.frameCamera], running = menuClock.running;
  const samples = [];
  for (let i=1; i<=40; i++) {
    overlay.onpointermove(event(100+i*2));
    await frame();
    samples.push([...mapView.motion.frameCamera]);
  }
  await frame();
  const after = [...mapView.motion.frameCamera];
  overlay.onpointerup(event(180));
  overlay.setPointerCapture = capture;
  overlay.releasePointerCapture = release;
  for (let i=0; i<3; i++) await frame();
  const changed = new Set(samples.map(p => p.join(','))).size;
  const result = {pass:running && changed>1 && after[1]===before[1]+80 && !menuClock.running,
    runningDuringHold:running, distinctCameraFrames:changed, before, after,
    idleAfterRelease:!menuClock.running, scope:'Synthetic pointer handlers and real RAF clock; desktop browser'};
  const note=document.createElement('pre'); note.id='map-check-result';
  note.style='position:fixed;top:0;left:0;z-index:100;background:#000;color:#fff;font:12px monospace;max-width:100%;white-space:pre-wrap';
  note.textContent=JSON.stringify(result,null,2); document.body.append(note);
}
'''


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'build/web'), **kwargs)

    def do_GET(self):
        path = urlsplit(self.path)
        if path.path == '/sw.js':
            self.send_error(404)
            return
        if path.path not in ('/game.mjs', '/map.mjs'):
            return super().do_GET()
        body = (ROOT / 'build/web' / path.path[1:]).read_bytes()
        if path.path == '/game.mjs':
            if 'baseline=1' in self.headers.get('Referer', ''):
                body = body.replace(b"from './map.mjs'", b"from './map.mjs?baseline=1'")
            marker = b'toMenu();\n        if (navigator.serviceWorker?.controller)'
            assert body.count(marker) == 1
            body = body.replace(marker, b'toMenu();\n        checkSlowMapDrag();\n        if (navigator.serviceWorker?.controller)') + CHECK
        elif 'baseline=1' in path.query:
            marker = b'Boolean(this.pointer) ||'
            assert body.count(marker) == 1
            body = body.replace(marker, b'')
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
