"""Local-only fullscreen event trace; no replacement of the browser API."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def instrument():
    source = (ROOT / 'build/web/game.mjs').read_text()
    before = 'fullscreenButton.onclick = async () => {'
    assert source.count(before) == 1
    source = source.replace(before, '''
const fullTrace = [];
const fullOutput = document.createElement('pre');
fullOutput.id = 'fullscreen-trace';
fullOutput.style = 'position:fixed;top:0;left:0;z-index:100;background:white;color:black;font:11px monospace;pointer-events:none';
document.body.append(fullOutput);
function traceFull(phase, event) {
  fullTrace.push({phase, trusted:event?.isTrusted, activation:navigator.userActivation?.isActive,
    enabled:document.fullscreenEnabled, fullscreen:!!document.fullscreenElement,
    focused:document.hasFocus(), visibility:document.visibilityState,
    width:innerWidth, height:innerHeight});
  fullOutput.textContent = JSON.stringify(fullTrace, null, 2);
}
traceFull('ready');
document.addEventListener('fullscreenchange', event => traceFull('change', event));
document.addEventListener('fullscreenerror', event => traceFull('error', event));
fullscreenButton.onclick = async (event) => {
  traceFull('click', event);''')
    before = '  fullscreenChanged();\n};'
    assert source.count(before) == 1
    source = source.replace(before, "  traceFull('resolved');\n" + before)
    return source.encode()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'build/web'), **kwargs)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
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
    instrument()
    ThreadingHTTPServer(('127.0.0.1', 8943), Handler).serve_forever()
