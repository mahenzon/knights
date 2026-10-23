#!/usr/bin/env python3
"""Build a static game with an explicit allowlist: no IPA, ARM code or emulator."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from prepare_game_data import prepare
from pack_art import pack_art, DIRECT

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'build/web'

def build():
    prepare()
    subprocess.run([str(ROOT/'node_modules/.bin/tsc')],cwd=ROOT,check=True)
    subprocess.run(['cargo','build','--manifest-path',str(ROOT/'engine/Cargo.toml'),'--release','--target','wasm32-unknown-unknown','--offline'],check=True)
    OUT.mkdir(parents=True,exist_ok=True)
    files=['index.html','style.css','game.mjs','install.mjs','audio.mjs','offline.mjs','assets.mjs','enemies.mjs','hud.mjs','shop.mjs','play.mjs','options.mjs','scores.mjs','font.mjs','campaign.mjs','lifecycle.mjs','scene.mjs','map.mjs','game-data.json','manifest.webmanifest']
    for name in files:
        source=ROOT/('build/browser' if name.endswith('.mjs') else 'web')/name
        shutil.copy2(source,OUT/name)
    # PNG copies of the original App Store artwork also work with Android's WebAPK icon loader.
    for name in ['icon-192.png','icon-512.png','apple-touch-icon.png']:
        shutil.copy2(ROOT/'web'/name,OUT/name)
        files.append(name)
    for name in ['icon.jpg','icon.svg']:
        (OUT/name).unlink(missing_ok=True)  # Retire only superseded generated icons.
    wasm='knights_core.wasm'
    shutil.copy2(ROOT/'engine/target/wasm32-unknown-unknown/release'/wasm,OUT/wasm)
    files.append(wasm)
    data=json.loads((OUT/'game-data.json').read_text())
    data['art'],packed=pack_art(ROOT/'dist/assets',OUT,data)
    files.extend(packed)
    (OUT/'game-data.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
    (OUT/'assets').mkdir(exist_ok=True)
    for source in sorted((ROOT/'dist/assets').iterdir()):
        if source.suffix not in {'.png','.jpg','.wav','.mp3','.fnt'}: continue
        destination='assets/'+source.name
        if source.suffix in {'.png','.jpg'} and source.name not in DIRECT:
            (OUT/destination).unlink(missing_ok=True)  # Remove only superseded generated copies.
            continue
        shutil.copy2(source,OUT/destination)
        files.append(destination)
    version=hashlib.sha256()
    for name in files:version.update(name.encode());version.update((OUT/name).read_bytes())
    worker=(ROOT/'web/sw.js').read_text()
    version.update(worker.encode())
    (OUT/'sw.js').write_text('const VERSION='+json.dumps(version.hexdigest()[:16])+';\nconst FILES='+json.dumps(files)+';\n'+worker)
    expected=set(files)|{'sw.js'}
    actual={str(p.relative_to(OUT)) for p in OUT.rglob('*') if p.is_file()}
    if actual!=expected:raise ValueError(f'Unexpected output files: {actual-expected}')
    assert not any(Path(f).suffix in {'.ipa','.apk','.bin'} for f in files)
    imports=subprocess.run(['node','--input-type=module','-e',"import fs from 'node:fs'; const m=await WebAssembly.compile(fs.readFileSync(process.argv[1])); if(WebAssembly.Module.imports(m).length)throw Error('Unexpected Wasm imports'); console.log('Wasm imports: none');",str(OUT/wasm)],check=True)
    print(f'Static site: {OUT} ({len(expected)} files, {sum((OUT/f).stat().st_size for f in expected)/1024/1024:.1f} MiB)')

if __name__=='__main__':build()
