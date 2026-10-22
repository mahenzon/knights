"""Local-only cold-audio saved-shop replay. Production UI with silent output."""
import json
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = ROOT/'research/resume-audio-shop-checkpoint.json'
TRACE = b'''<script>
const qa = document.createElement('pre'); qa.id='qa-resume';qa.hidden=true;
document.body.append(qa);
const events=[];
window.qaResume=(event,screen,detail)=>{events.push({event,screen,detail,ms:performance.now()});qa.textContent=JSON.stringify(events);};
</script>'''
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'build/web'),**kwargs)
    def do_GET(self):
        path=self.path.split('?',1)[0]
        if path=='/qa':
            body=('<!doctype html><title>Saved shop audio replay</title><button>Seed day-one shop</button><script>'
                'document.querySelector("button").onclick=()=>{localStorage.setItem("knights-onrush-save-v2-campaign",JSON.stringify('
                + CHECKPOINT.read_text()+'));location.href="/?mute=1";};</script>').encode()
            mime='text/html'
        elif path=='/sw.js':
            self.send_error(404);return
        elif path=='/':
            body=(ROOT/'build/web/index.html').read_bytes().replace(b'<script type="module"',TRACE+b'<script type="module"');mime='text/html'
        elif path in ('/game.mjs','/audio.mjs'):
            body=(ROOT/'build/web'/path[1:]).read_bytes();mime='text/javascript'
            if path=='/game.mjs':
                before=b"previewMuted = new URLSearchParams(location.search).get('mute') === '1'"
                assert body.count(before)==1
                body=body.replace(before,b"previewMuted = new URLSearchParams(location.search).get('qaAudio') !== '1'")
                body=body.replace(b"$('#music').volume = settings.volume",b"$('#music').volume = 0")
                body=body.replace(b'source.connect(output);',b'output.gain.value=0;source.connect(output);')
                for name in ('toMenu','pauseScreen','resultScreen'):
                    token=f'function {name}('.encode();start=body.index(b'{',body.index(token))+1
                    body=body[:start]+f' window.qaResume("{name}",screen,new Error().stack);'.encode()+body[start:]
                body=body.replace(b"show('Restoring your castle\xe2\x80\xa6', 'Opening your saved battle.');",b"window.qaResume('restore-start',screen); show('Restoring your castle\xe2\x80\xa6', 'Opening your saved battle.');")
                body=body.replace(b"  } catch {\n    stopAudio();\n    show(",b"  } catch (error) {\n    window.qaResume('restore-error',screen,String(error));\n    stopAudio();\n    show(")
            else:body=body.replace(b'audio.volume = 0.5;',b'audio.volume = 0;')
        else:
            if path.endswith('.wav') or path.endswith('.mp3'):
                while path.endswith('knights_gameplay_03.mp3') and (ROOT/'research/resume-audio-hold').exists():time.sleep(0.1)
                time.sleep(2)
            return super().do_GET()
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',8944),Handler).serve_forever()
