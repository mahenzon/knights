"""Local-only muted map navigation and synthetic result/shop checkpoints."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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
        body = (ROOT / 'build/web/game.mjs').read_bytes()
        marker = b'toMenu();\n        if (navigator.serviceWorker?.controller)'
        assert body.count(marker) == 1
        replacement = b'''    toMenu();
    const checkpoint = new URLSearchParams(location.search).get('checkpoint');
    if (checkpoint === 'win' || checkpoint === 'final') {
      const level = checkpoint === 'final' ? 11 : 0;
      localStorage.setItem('knights-completed', JSON.stringify(Object.fromEntries(
        Array.from({length:level+1},(_,i)=>['normal:'+i,true]))));
      await loadImages(resultAssets);
      run = prepareDay(data, createRun(data, 'campaign', level, 'normal', 73));
      startBattle(core, data, run, 73);
      run.phase = 'complete'; run.day = dayCount(data, run); run.score = 5000;
      resultScreen(); render();
    }
    if (checkpoint === 'shop') {
      await loadImages(resultAssets);
      run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73));
      startBattle(core, data, run, 73);
      run.phase = 'shop'; run.gold = 100000; run.sacrifices = 1000;
      await shop();
    }
    if (navigator.serviceWorker?.controller)'''
        body = body.replace(marker, replacement)
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
