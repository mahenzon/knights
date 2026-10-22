"""Local-only browser audio test: real decoding, silent output, controllable downloads."""
import sys
import time
from http.server import ThreadingHTTPServer
from sound_browser_qa import Handler as BaseHandler, ROOT


class Handler(BaseHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        if path in ('/assets/knightlite_fly.wav', '/assets/knights_gameplay_03.mp3'):
            while not (ROOT/'research/audio-download-release').exists():
                time.sleep(0.1)
        if path == '/qa':
            return super().do_GET()
        if path == '/game.mjs':
            body = (ROOT/'build/web/game.mjs').read_bytes()
            # Exercise the real audio path while keeping this QA origin physically silent.
            body = body.replace(b"previewMuted = new URLSearchParams(location.search).get('mute') === '1'", b'previewMuted = false')
            assert b"previewMuted = false" in body
            body = body.replace(b'const epoch = audioEpoch;', b'const epoch = audioEpoch; window.qa("requested",name,epoch);')
            body = body.replace(b'source.connect(output);',
                                b'output.gain.value=0; source.connect(output);')
            body = body.replace(b'source.start();', b'source.start(); window.qa("started",name,epoch,buffer.duration);')
            body = body.replace(b'startBattle(core, data, next, next.seed);',
                                b'window.qa("battle-ready",JSON.stringify({effects:audioBuffers.size,'
                                b'context:audioContext.state,tracks:music.sources.size,src:music.audio.src,'
                                b'paused:music.audio.paused,ready:music.audio.readyState,time:music.audio.currentTime})); '
                                b'startBattle(core, data, next, next.seed);')
            body = body.replace(b'function stopAudio() {', b'function stopAudio() { window.qa("stop",audioSources.size);')
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
