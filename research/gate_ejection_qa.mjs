// Disposable loopback fixture: original captive state, production boot/engine/renderer.
function tick() { originalTick(); }
function render() { originalRender(); }
const receipt = document.createElement('pre');
receipt.id = 'gate-receipt';
const output = document.createElement('section');
output.style = 'position:fixed;inset:0;z-index:1000;background:#18201d;color:white;padding:12px;overflow:auto;font:14px monospace';
output.append(receipt);
document.body.append(output);
boot().then(async () => {
  if (!previewMuted) throw Error('Use mute=1');
  clock.stop(); menuClock.stop();
  run = prepareDay(data, createRun(data, 'campaign', 0, 'normal', 73));
  await loadBattleImages([5], run);
  startBattle(core, data, run, 73);
  core.configure(0,120);core.configure(1,-10000);
  const p=core.save_ptr(), bytes=new Uint8Array(core.memory.buffer,p,core.save_len()).slice();
  const v=new DataView(bytes.buffer);
  v.setFloat32(27*4,9999,true);v.setFloat32(31*4,22,true);
  v.setFloat32(32*4,-1,true);v.setInt32(33*4,0,true);v.setUint32(32336,1,true);
  [8,5,50,1,0,1,0].forEach((n,i)=>v.setUint32((235+i)*4,n,true));
  [233,130,300,0,0,300,0,45,.9,.8,-1,.75,0,0,130,-1,1,99,0,260]
    .forEach((n,i)=>v.setFloat32((242+i)*4,n,true));
  v.setUint32(61748,0,true);
  new Uint8Array(core.memory.buffer,core.load_buffer(bytes.length),bytes.length).set(bytes);
  if(!core.restore()) throw Error('Fixture rejected');
  for(let i=0;i<333;i++)core.step();
  core.step();state();
  const enabled=new URLSearchParams(location.search).get('fixBallistaGate')==='1';
  const heading=document.createElement('h2');heading.textContent=enabled?'Optional correction: remains emerge from the gate':'Original: remains emerge beside the gate';
  output.prepend(heading);
  const launchX=draw[21], sacrifices=draw[6];
  if(sacrifices!==1 || (enabled ? launchX<231||launchX>233 : launchX<128||launchX>131))
    throw Error(`Incorrect ejection: ${launchX}, ${sacrifices}`);
  for(let i=0;i<6;i++)core.step();
  state(true);screen='game';landscape=new Landscape(120);
  const sprite=assets.get(data.enemyAnimations[5][5][Math.floor(draw[6079])]);
  const nativeDraw=ctx.drawImage, records=[];
  for(const mirror of [false,true]) {
    run.config.mirrorLevel=mirror;
    const anchors=[];
    ctx.drawImage=function(image,...args) {
      if(image===sprite) {
        const t=ctx.getTransform();anchors.push([t.e/(canvas.width/480),t.f/(canvas.height/320)]);
      }
      return nativeDraw.call(this,image,...args);
    };
    render();ctx.drawImage=nativeDraw;
    if(anchors.length!==1)throw Error(`Expected one visible gate actor, got ${anchors.length}`);
    const expected=mirror?480-draw[6076]-draw[5841]:draw[6076]+draw[5841];
    if(Math.abs(anchors[0][0]-expected)>.001)throw Error('Mirrored renderer differs from core');
    records.push({mirror,anchor:anchors[0],logicalX:draw[6076]});
    const figure=document.createElement('figure');figure.style='display:inline-block;margin:8px 4px';
    const label=document.createElement('figcaption');label.textContent=mirror?'Castle on left':'Castle on right';
    const copy=document.createElement('canvas');copy.width=480;copy.height=320;
    copy.getContext('2d').drawImage(canvas,0,0,480,320);figure.append(label,copy);output.insertBefore(figure,receipt);
  }
  if(Math.abs(records[0].anchor[0]+records[1].anchor[0]-480)>.001)throw Error('Mirror mismatch');
  receipt.textContent=JSON.stringify({status:'pass',fixBallistaGate:enabled,muted:previewMuted,
    launchX,sacrifices,frames:340,records,scope:'Seeded desktop fixture, both orientations; no device-performance claim'},null,2);
}).catch(error=>{receipt.textContent=String(error.stack);});
