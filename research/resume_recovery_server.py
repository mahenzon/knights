"""Local-only saved-game recovery test with one unavailable artwork pack."""
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / 'research/resume-recovery-control.json'
SAVE = ROOT / 'research/resume-recovery-checkpoint.json'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'build/web'), **kwargs)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/sw.js':
            self.send_error(404)
            return
        if path == '/art/assasin.pack' and json.loads(STATE.read_text())['fail']:
            self.send_error(503, 'Controlled interrupted artwork download')
            return
        if path != '/qa':
            return super().do_GET()
        checkpoint = json.dumps(json.loads(SAVE.read_text()))
        body = (
            '<!doctype html><title>Saved game recovery test</title>'
            '<button>Prepare recovery test</button><script>'
            'document.querySelector("button").onclick=()=>{'
            'localStorage.setItem("knights-onrush-save-v2-madness",JSON.stringify('
            + checkpoint + '));location.href="/?mute=1";};</script>'
        ).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    assert json.loads(SAVE.read_text())['run']['mode'] == 'madness'
    assert isinstance(json.loads(STATE.read_text())['fail'], bool)
    ThreadingHTTPServer(('127.0.0.1', 8942), Handler).serve_forever()
