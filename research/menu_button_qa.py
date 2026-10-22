"""Local-only browser replay of touch leave-before-click; never shipped."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = b'''
const receipts = document.createElement('output');
receipts.id = 'qa-input'; receipts.hidden = true;
document.body.append(receipts);
let trace = [];
function record(value) {
  trace.push(value); trace = trace.slice(-100);
  receipts.textContent = JSON.stringify(trace);
}
window.open = (url, target, features) => {
  record({visit: url, target, features, activeGesture: navigator.userActivation.isActive});
  return null;
};
document.addEventListener('pointerup', (event) => {
  if (!event.target.matches('#castle-ui > button')) return;
  record({leaveBeforeClick: event.target.textContent});
  event.target.dispatchEvent(new PointerEvent('pointerleave', {
    pointerId: event.pointerId, pointerType: 'touch',
    clientX: event.clientX, clientY: event.clientY,
  }));
});
document.addEventListener('click', (event) => {
  if (event.target.matches('button')) record({click: event.target.textContent});
});
'''
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT/'build/web'),**kwargs)
    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/qa-touch.js': body, mime = SCRIPT, 'text/javascript'
        elif path == '/qa-seed':
            state = (ROOT/'research/menu-qa-save.json').read_text()
            body = ('<!doctype html><button id="seed">Load local shop checkpoint</button><script>'
                    + 'document.querySelector("#seed").onclick=()=>{localStorage.setItem("knights-onrush-save-v2",JSON.stringify('
                    + state + ')); location.href="/?mute=1";};</script>').encode()
            mime = 'text/html'
        elif path == '/':
            body = (ROOT/'build/web/index.html').read_bytes().replace(b'<script type="module"',b'<script src="./qa-touch.js"></script><script type="module"')
            mime = 'text/html'
        else:
            return super().do_GET()
        self.send_response(200); self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv)>1 else 8904), Handler).serve_forever()
