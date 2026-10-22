"""Local-only real Web Audio tracing with a silent output; never published."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACE = b'''<script>
const output = document.createElement('output');
output.id = 'qa-audio'; output.hidden = true; document.body.append(output);
const trace = [];
window.qa = (phase, name, epoch, duration) => {
  trace.push({phase, name, epoch, duration});
  output.textContent = JSON.stringify(trace.slice(-1000));
};
</script>'''


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT/'build/web'), **kwargs)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/qa':
            states = (ROOT/'research/world-qa-saves.json').read_text()
            body = ('<!doctype html><title>Silent Web Audio regression</title>'
                    '<button>Load audio checkpoint</button><script>const states='+states+';'
                    'document.querySelector("button").onclick=()=>{'
                    'localStorage.setItem("knights-onrush-save-v2",JSON.stringify(states["fire-dust"]));'
                    'location.href="/?mute=1";};</script>').encode()
            mime = 'text/html'
        elif path == '/':
            body = (ROOT/'build/web/index.html').read_bytes()
            body = body.replace(b'<audio id="music"', b'<audio muted id="music"')
            body = body.replace(b'<script type="module"', TRACE+b'<script type="module"')
            mime = 'text/html'
        elif path == '/game.mjs':
            body = (ROOT/'build/web/game.mjs').read_bytes()
            old = b'const epoch = audioEpoch;'
            assert body.count(old) == 1
            body = body.replace(old, old+b' window.qa("requested",name,epoch);')
            old = b'source.connect(output);'
            assert body.count(old) == 1
            body = body.replace(old, b'output.gain.value=0; source.connect(output);')
            old = b'source.start();'
            assert body.count(old) == 1
            body = body.replace(old, old+b'window.qa("started",name,epoch,buffer.duration);')
            mime = 'text/javascript'
        elif path == '/sw.js':
            self.send_error(404)
            return
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
