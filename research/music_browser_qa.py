"""Local-only silent verification of the production soundtrack transitions."""
import sys
from http.server import ThreadingHTTPServer
from audio_readiness_qa import Handler as AudioHandler, ROOT


class Handler(AudioHandler):
    def do_GET(self):
        if self.path.split('?')[0] != '/audio.mjs':
            return super().do_GET()
        body = (ROOT / 'build/web/audio.mjs').read_bytes()
        marker = b'return Promise.resolve(this.audio.play()).then('
        assert body.count(marker) == 1
        body = body.replace(marker, b'window.qa("music-play",JSON.stringify({group, name:this.name,'
                            b'loops:this.remainingLoops,time:this.audio.currentTime})); ' + marker)
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
