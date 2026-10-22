// Local-only replay of Explosive Round, day one, through the production renderer.
const report = document.createElement('pre');
report.id = 'barrel-receipt';
report.style = 'position:fixed;bottom:50px;left:0;z-index:100;background:#000;color:#fff;font:11px monospace;max-width:100%;max-height:25vh;overflow:auto;pointer-events:none';
document.body.append(report);
let trial = null;
const parameters=new URLSearchParams(location.search);
const trialDay=Number(parameters.get('day')||1);
const equipped=parameters.get('equipment')==='1';
const results = [];
const summary = values => {
  const sorted = [...values].sort((a,b) => a-b);
  return {n:sorted.length, median:sorted[Math.floor(sorted.length*.5)],
    p95:sorted[Math.floor(sorted.length*.95)], p99:sorted[Math.floor(sorted.length*.99)], max:sorted.at(-1)};
};
function render() {
  const start = performance.now();
  originalRender();
  if (!trial || screen !== 'game') return;
  trial.render.push(performance.now()-start);
  if (trial.last) trial.intervals.push(start-trial.last);
  trial.last = start;
}
function tick() {
  if (!trial) { originalTick(); return; }
  const start = performance.now();
  if (equipped && trial.throwing) {
    if(trial.gesture) {
      core.drag(...trial.gesture.target);
      if(++trial.gesture.age===65) {core.release();trial.gesture=null;}
    } else if (trial.ticks%120===0) {
      state();
      for(let p=20;p<2420;p+=12) if(draw[p]===1 && draw[p+1]>35 && draw[p+1]<360) {
        if(core.pickup(draw[p+1],draw[p+2])) {
          const target=trial.actions%3===0?[120,60]:trial.actions%3===1?[233,100]:[300,120];
          trial.gesture={target,age:0};trial.actions++;core.drag(...target);
        }
        break;
      }
    }
  } else if (trial.throwing && trial.ticks % 90 === 0) {
    state();
    for(let p=20;p<2420;p+=12) if(draw[p]===1 && draw[p+1]>40 && draw[p+1]<350) {
      const x=draw[p+1], y=draw[p+2];
      core.pickup(x,y); core.drag(x,100); core.release_at(x,100);
      break;
    }
  }
  originalTick();
  trial.tick.push(performance.now()-start);
  trial.ticks++;
  let actors=0, smoke=0, fragments=0, additive=0;
  for(let p=20;p<2420;p+=12) if(draw[p]) actors++;
  for(let p=3701;p<5237;p+=6) if(draw[p]) {smoke++; additive += !!draw[p+5];}
  for(let p=5237;p<5837;p+=4) if(draw[p]) fragments++;
  trial.maxActors=Math.max(trial.maxActors,actors);
  trial.maxSmoke=Math.max(trial.maxSmoke,smoke);
  trial.maxFragments=Math.max(trial.maxFragments,fragments);
  trial.maxAdditive=Math.max(trial.maxAdditive,additive);
  trial.hookFrames+=draw[12]>=0;
  trial.gateFrames+=draw[14]>=0;
  if(trial.ticks%120===0) report.textContent=JSON.stringify({status:'running',ticks:trial.ticks,actors,smoke,fragments,render:summary(trial.render)},null,2);
  if(trial.ticks===2400) {
    clock.stop();
    results.push({throwing:trial.throwing,elapsed:performance.now()-trial.started,
      ticks:trial.ticks, render:summary(trial.render), tick:summary(trial.tick),
      intervals:summary(trial.intervals), slowFrames:trial.intervals.filter(x=>x>25).length,
      maxActors:trial.maxActors,maxSmoke:trial.maxSmoke,maxFragments:trial.maxFragments,
      maxAdditive:trial.maxAdditive,canvas:[canvas.width,canvas.height],day:trialDay,equipped,
      actions:trial.actions,hookFrames:trial.hookFrames,gateFrames:trial.gateFrames,
      userAgent:navigator.userAgent,scope:'Desktop browser, muted, seeded campaign level11 with test-only castle HP'});
    trial=null;
    report.textContent=JSON.stringify({status:'complete',results},null,2);
    document.querySelector('#qa-actions').hidden=false;
  }
}
async function startTrial(throwing) {
  if(!previewMuted) throw Error('Use mute=1');
  document.querySelector('#qa-actions').hidden=true;
  clock.stop();menuClock.stop();
  const previous=createRun(data,'campaign',10,'normal',42);
  previous.day=trialDay;
  if(equipped) {previous.inventory[1]=0;previous.inventory[2]=0;}
  run=prepareDay(data,previous);
  await loadBattleImages(run.config.enemyTypeTable,run);
  for(let i=0;i<60;i++) random(run);
  run.landscapeSeed=run.seed;
  landscape=new Landscape(run.config.durationSeconds,()=>random(run));
  startBattle(core,data,run,run.seed);
  const savePointer=core.save_ptr(), saveLength=core.save_len();
  const bytes=new Uint8Array(core.memory.buffer,savePointer,saveLength).slice();
  const view=new DataView(bytes.buffer);
  view.setFloat32(23*4,1000000,true);view.setFloat32(24*4,1000000,true);
  const loadPointer=core.load_buffer(bytes.length);
  new Uint8Array(core.memory.buffer,loadPointer,bytes.length).set(bytes);
  if(core.restore()!==1) throw Error('Invalid test snapshot');
  settings.power=false;
  state();startPlay();
  trial={throwing,started:performance.now(),ticks:0,last:0,render:[],tick:[],intervals:[],maxActors:0,maxSmoke:0,maxFragments:0,maxAdditive:0,gesture:null,actions:0,hookFrames:0,gateFrames:0};
}
boot().then(()=>{
  const actions=document.createElement('div');actions.id='qa-actions';
  actions.style='position:fixed;bottom:0;left:0;z-index:100';
  for(const throwing of [false,true]){
    const b=document.createElement('button');b.textContent=throwing?'Measure barrel throws':'Measure walking barrels';
    b.onclick=()=>startTrial(throwing).catch(e=>{report.textContent=String(e.stack);actions.hidden=false;});
    actions.append(b);
  }
  document.body.append(actions);report.textContent=`Ready: 40-second level11/day${trialDay} trial${equipped?' with gate/hook':''}`;
});
