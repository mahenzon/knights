"""Local-only visual-clock telemetry; never included in the static release."""
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
        body = (ROOT / 'build/web/game.mjs').read_text()
        marker = 'const visualTime = new ApplicationTime();'
        assert body.count(marker) == 1
        body = body.replace(marker, marker + '''
const clockReceipt = { ticks: 0, errors: 0, transitions: [] };
const clockOutput = document.createElement('output');
clockOutput.id = 'clock-receipt';
clockOutput.style = 'position:fixed;left:0;top:0;max-width:100%;font:10px monospace;background:#fff;color:#111;z-index:100;pointer-events:none';
document.body.append(clockOutput);
function recordClock() {
  clockOutput.textContent = JSON.stringify({ ...clockReceipt, screen,
    phase: visualTime.value, mode: visualTime.mode, active: visualTime.active,
    simulation: draw?.[0], battleRunning: clock.running, menuRunning: menuClock.running });
}
''')
        marker = 'function tick() {\n    visualTime.step();'
        assert body.count(marker) == 1
        body = body.replace(marker, '''function tick() {
    const beforePhase = visualTime.value;
    visualTime.step();
    clockReceipt.ticks++;
    if (visualTime.value !== Math.fround(Math.fround(beforePhase + Math.fround(1/60)) + Math.fround(1/60))) clockReceipt.errors++;
''')
        marker = '    visualTime.setMode(mode);'
        assert body.count(marker) == 1
        body = body.replace(marker, marker + '\n    clockReceipt.transitions.push({ mode, phase: visualTime.value });')
        marker = 'function render() {'
        assert body.count(marker) == 1
        body = body.replace(marker, marker + '\n    recordClock();')
        encoded = body.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
