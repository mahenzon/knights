"""Local-only regression controls; never included in the static release."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTROLS = b'''
const qaBox = document.createElement('div');
qaBox.style.cssText = 'position:fixed;left:0;top:0;z-index:100;background:#fff;color:#000';
const qaOutput = document.createElement('pre');
qaOutput.id = 'qa-state';
function qaRead() {
  qaOutput.textContent = JSON.stringify({screen, wanted:music?.wanted, source:$('#music').getAttribute('src'),
    time:$('#music').currentTime, paused:$('#music').paused, muted:$('#music').muted,
    saved:music?.resumeAt, context:audioContext?.state, effects:audioSources.size, group:music?.group,
    error:$('#music').error?.message, downloads:music?.sources.size});
}
for (const [label,action] of [
 ['Sample state', qaRead],
 ['Start audio',()=>prepareAudio('menu')],
 ['Stop audio',()=>stopAudio()],
 ['Ready battle audio',()=>loadBattleAudio(true)],
 ['Background',()=>window.dispatchEvent(new Event('pagehide'))],
 ['Open funded shop',async()=>{run=prepareDay(data,createRun(data,'campaign',0,'normal',73));run.phase='shop';run.gold=100000;run.sacrifices=1000;await shop();}],
]) {
  const button = document.createElement('button');button.textContent=label;
  button.onclick=async()=>{try {await action();qaRead();}catch(e){qaOutput.textContent=e.stack;}};
  qaBox.append(button);
}
qaBox.append(qaOutput);document.body.append(qaBox);
'''

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT/'build/web'), **kwargs)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/sw.js':
            self.send_error(404)
            return
        if path not in ('/game.mjs', '/audio.mjs'):
            return super().do_GET()
        body = (ROOT/'build/web'/path[1:]).read_bytes()
        if path == '/game.mjs':
            # Run production audio lifecycle with physically silent output.
            before = b"previewMuted = new URLSearchParams(location.search).get('mute') === '1'"
            assert body.count(before) == 1
            body = body.replace(before, b'previewMuted = false')
            body = body.replace(b"$('#music').volume = settings.volume", b"$('#music').volume = 0")
            body = body.replace(b'source.connect(output);', b'output.gain.value=0;source.connect(output);')
            body += CONTROLS
        else:
            body = body.replace(b'audio.volume = 0.5;', b'audio.volume = 0;')
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8943), Handler).serve_forever()
