// Test suite for the Lemmings game in index.html.
// Zero dependencies — run with: node tests/run-tests.mjs
//
// The game script is extracted from index.html and evaluated inside a vm
// sandbox with minimal DOM/canvas/audio stubs, then driven tick-by-tick via
// game.update(). Rendering is never exercised (canvas contexts are no-ops),
// so tests cover simulation logic: walking, falling, climbing, building,
// bashing, digging, blocking, bombing, nuking, exits, timer and persistence.

import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html=readFileSync(path.join(root,'index.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
if(!m){console.error('FATAL: could not extract <script> from index.html');process.exit(1);}

// ---------- DOM stubs ----------
function makeClassList(){
  const s=new Set();
  return {
    add:c=>s.add(c),
    remove:c=>s.delete(c),
    toggle:(c,force)=>{const on=force===undefined?!s.has(c):!!force;on?s.add(c):s.delete(c);return on;},
    contains:c=>s.has(c),
  };
}
function makeCtx2d(sandbox){
  return {
    fillStyle:'',strokeStyle:'',lineWidth:1,globalAlpha:1,font:'',textAlign:'',
    fillRect(){},clearRect(){},strokeRect(){},drawImage(){},fillText(){},
    createLinearGradient(){return{addColorStop(){}};},
    createImageData(w,h){return new sandbox.ImageData(w,h);},
    putImageData(){},
  };
}
function makeSandbox(){
  const sandbox={};
  sandbox.ImageData=class ImageData{
    constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);}
  };
  const els={};
  function makeEl(){
    const el={
      innerHTML:'',textContent:'',style:{},dataset:{},width:0,height:0,onclick:null,
      classList:makeClassList(),
      appendChild(){},addEventListener(){},
      getBoundingClientRect(){return{left:0,top:0,width:800,height:400};},
      getContext(){return makeCtx2d(sandbox);},
    };
    el.parentElement={classList:makeClassList()};
    return el;
  }
  sandbox.document={
    getElementById(id){if(!els[id])els[id]=makeEl();return els[id];},
    createElement(){return makeEl();},
    querySelectorAll(){return[];},
    querySelector(){return null;},
  };
  const audioParam={setValueAtTime(){},exponentialRampToValueAtTime(){}};
  sandbox.window={
    _handlers:{},
    addEventListener(type,fn){(this._handlers[type]=this._handlers[type]||[]).push(fn);},
    AudioContext:class{
      constructor(){this.state='running';this.currentTime=0;this.destination={};this.sampleRate=44100;}
      resume(){}
      createGain(){return{connect(){},gain:audioParam};}
      createOscillator(){return{connect(){},type:'',frequency:audioParam,start(){},stop(){}};}
      createBuffer(ch,len){return{getChannelData(){return new Float32Array(len);}};}
      createBufferSource(){return{buffer:null,connect(){},start(){}};}
    },
  };
  sandbox.requestAnimationFrame=()=>{};
  const store=new Map();
  sandbox.localStorage={
    getItem:k=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>store.set(k,String(v)),
    removeItem:k=>store.delete(k),
    clear:()=>store.clear(),
  };
  sandbox.__els=els;
  sandbox.__store=store;
  vm.createContext(sandbox);
  vm.runInContext(m[1]+'\n;globalThis.__T={game,Game,Lem,LEVELS,S,sfx,W,H,MAX_FALL,STEP_MS};',sandbox);
  return sandbox;
}

// ---------- test framework ----------
let passed=0,failed=0;
function test(name,fn){
  try{fn();passed++;console.log(`  ok   ${name}`);}
  catch(e){failed++;console.log(`  FAIL ${name}\n       ${e.message}`);}
}
function assert(cond,msg){if(!cond)throw new Error(msg||'assertion failed');}
function assertEq(a,b,msg){if(a!==b)throw new Error(`${msg||'values differ'}: expected ${b}, got ${a}`);}

// ---------- scenario helpers ----------
const sb=makeSandbox();
const T=sb.__T;
const {W}=T;
const S=T.S;

// A game with empty terrain, no auto-release and effectively no time limit,
// for hand-built physics scenarios.
function blankGame(){
  const g=new T.Game();
  g.loadLevel(0);
  g.terrainData.fill(0);
  g.lemmings.length=0;
  g.lemmingsOut=T.LEVELS[0].total; // entrance stays shut
  g.levelTime=10_000_000;
  return g;
}
function fill(g,x0,x1,y0,y1,type=1){
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)g.terrainData[y*W+x]=type;
}
function td(g,x,y){return g.terrainData[y*W+x];}
// Spawn a lemming standing at (x,y) — caller must ensure (x,y) is air and (x,y+1) solid.
function walker(g,x,y,props={}){
  const l=new T.Lem(x,y);
  l.state=S.WALK;
  Object.assign(l,props);
  g.lemmings.push(l);
  return l;
}
function run(g,ticks,each){
  for(let i=0;i<ticks&&g.gameState==='playing';i++){if(each)each(i);g.update();}
}
// Tick until cond() holds (checked before each tick); returns false on timeout.
function runUntil(g,maxTicks,cond,each){
  for(let i=0;i<maxTicks&&g.gameState==='playing';i++){
    if(cond())return true;
    if(each)each(i);
    g.update();
  }
  return cond();
}

console.log('Lemmings test suite\n');

// ---------- level solve (end-to-end) ----------
test('level 1 "Just Dig!" is solvable with diggers, no splats, all 10 saved',()=>{
  const g=new T.Game();
  g.loadLevel(0);
  // Dig staggered holes so no fall chains past MAX_FALL and none sits under
  // the entrance (x=400). Standing rows per layer: 119, 174, 229.
  const targets=[440,480,520];
  const dug=[false,false,false];
  const bandOf=y=>y<160?0:y<200?1:y<260?2:-1;
  let splats=0;
  for(let tick=0;tick<7200&&g.gameState==='playing';tick++){
    for(const l of g.lemmings){
      if(l.state===S.SPLAT)splats++;
      if(!l.active||l.dead||l.saved||l.state!==S.WALK)continue;
      const b=bandOf(Math.round(l.y));
      if(b>=0&&!dug[b]&&Math.abs(l.x-targets[b])<3){
        g.assignAbility(l,6);
        if(l.state===S.DIG)dug[b]=true;
      }
    }
    g.update();
  }
  assertEq(splats,0,'lemmings splatted');
  assertEq(g.lemmingsSaved,10,'saved count');
  assertEq(g.gameState,'results','level should have ended');
});

test('every level loads with a self-consistent, playable configuration',()=>{
  for(let i=0;i<T.LEVELS.length;i++){
    const lv=T.LEVELS[i];
    const g=new T.Game();
    g.loadLevel(i);
    assertEq(g.gameState,'playing',`level ${i+1} should start playing`);
    assert(lv.total>0,`level ${i+1}: must release some lemmings`);
    assert(lv.need>0&&lv.need<=lv.total,`level ${i+1}: need (${lv.need}) must be in 1..total`);
    assert(lv.time>0,`level ${i+1}: must have a positive time limit`);
    // A spawned lemming drops out of the hatch, so the entrance must be air.
    assert(!g.isSolid(lv.entrance.x,lv.entrance.y),`level ${i+1}: entrance must be open air`);
    // The exit has to sit inside the world bounds to ever be reachable.
    assert(lv.exit.x>0&&lv.exit.x<T.W&&lv.exit.y>0&&lv.exit.y<400,`level ${i+1}: exit must be in bounds`);
    const skillTotal=Object.keys(lv.skills).reduce((s,k)=>s+lv.skills[k],0);
    assert(skillTotal>0,`level ${i+1}: must grant at least one skill`);
  }
});

// ---------- walking physics ----------
test('walker passes under a low overhang instead of popping on top of it',()=>{
  const g=blankGame();
  fill(g,100,300,300,303);     // ground, standing row 299
  fill(g,180,240,294,295);     // cover 4px above the head-window edge
  const l=walker(g,150,299);
  let minY=999;
  const done=runUntil(g,400,()=>l.x>250||l.dead,
    ()=>{if(l.x>=180&&l.x<=240)minY=Math.min(minY,l.y);});
  assert(done&&!l.dead,'lemming died or stalled');
  assert(minY>=298,`lemming popped on top of the cover (minY=${minY})`);
  assert(l.x>250,`lemming did not pass under the cover (x=${l.x})`);
});

test('walker steps up 3px and back down 3px without turning',()=>{
  const g=blankGame();
  fill(g,100,200,300,310);     // low ground
  fill(g,201,300,297,310);     // raised ground (+3)
  fill(g,301,400,300,310);     // low again
  const l=walker(g,150,299);
  let yAt250=-1,yAt350=-1;
  run(g,400,()=>{
    if(Math.round(l.x)===250)yAt250=l.y;
    if(Math.round(l.x)===350)yAt350=l.y;
  });
  assertEq(l.dir,1,'walker turned around');
  assertEq(yAt250,296,'height on raised section');
  assertEq(yAt350,299,'height after stepping back down');
});

test('walker reverses at a blocker',()=>{
  const g=blankGame();
  fill(g,100,300,300,310);
  const b=walker(g,250,299);b.state=S.BLOCK;
  const l=walker(g,150,299);
  let maxX=0;
  run(g,400,()=>{maxX=Math.max(maxX,l.x);});
  assert(maxX<246,`walker passed the blocker (maxX=${maxX})`);
  assertEq(l.dir,-1,'walker should have reversed');
  assert(l.x<200,'walker should have walked back');
});

// ---------- falling ----------
test('long fall splats a plain lemming but a floater survives',()=>{
  const g=blankGame();
  fill(g,100,300,350,360);
  const plain=walker(g,150,100);plain.state=S.FALL;
  const floaty=walker(g,160,100,{isFloater:true});floaty.state=S.FALL;
  let sawSplat=false;
  run(g,800,()=>{if(plain.state===S.SPLAT)sawSplat=true;});
  assert(sawSplat,'plain lemming should splat (fall 249 > MAX_FALL)');
  assert(plain.dead,'splatted lemming should die');
  assert(!floaty.dead,'floater should survive');
  assertEq(floaty.state,S.WALK,'floater should land walking');
  assertEq(Math.round(floaty.y),349,'floater landing height');
});

// ---------- skills ----------
test('basher tunnels through dirt and stops at steel without removing it',()=>{
  const g=blankGame();
  fill(g,100,400,300,320);     // floor
  fill(g,200,212,285,299);     // dirt wall
  fill(g,248,249,285,299);     // dirt pocket against steel
  fill(g,250,258,270,299,2);   // steel wall
  const steelBefore=g.terrainData.filter(t=>t===2).length;
  g.skills={5:2};
  const l=walker(g,150,299);
  const done=runUntil(g,2000,()=>(l.dir===-1&&l.x<240)||l.dead,()=>{
    if(l.state!==S.WALK)return;
    const x=Math.round(l.x);
    if((x>=197&&x<=199)||(x>=245&&x<=247))g.assignAbility(l,5);
  });
  assert(done&&!l.dead,'lemming died or never came back from the steel');
  assertEq(td(g,205,295),0,'dirt wall should be bashed through');
  const steelAfter=g.terrainData.filter(t=>t===2).length;
  assertEq(steelAfter,steelBefore,'steel must never be removed');
  assertEq(l.dir,-1,'lemming should turn back at the steel wall');
});

test('digger digs a shaft and stops on steel below',()=>{
  const g=blankGame();
  fill(g,100,300,300,330);     // dirt
  fill(g,100,300,331,340,2);   // steel slab underneath
  g.skills={6:1};
  const l=walker(g,150,299);
  let assigned=false;
  run(g,600,()=>{if(!assigned&&l.state===S.WALK){g.assignAbility(l,6);assigned=l.state===S.DIG;}});
  assert(assigned,'digger was never assigned');
  assertEq(td(g,150,305),0,'shaft should be dug out');
  assertEq(td(g,150,331),2,'steel below must survive');
  assert(!l.dead,'lemming died');
  assertEq(Math.round(l.y),330,'lemming should stand on the steel');
});

test('builder bridges a 40px gap',()=>{
  const g=blankGame();
  fill(g,100,200,300,320);     // near side
  fill(g,240,340,300,320);     // far side
  g.skills={4:1};
  const l=walker(g,150,299);
  const done=runUntil(g,1500,()=>l.x>260||l.dead,()=>{
    if(l.state===S.WALK&&Math.round(l.x)>=192&&Math.round(l.x)<200)g.assignAbility(l,4);
  });
  assert(done,'builder stalled');
  let bricks=0;
  for(let y=285;y<=299;y++)for(let x=205;x<=235;x++)if(td(g,x,y)===1)bricks++;
  assert(bricks>20,`expected a bridge over the gap, found ${bricks} brick pixels`);
  assert(!l.dead,'builder fell into the gap');
  assert(l.x>260,`builder should reach the far side (x=${l.x})`);
});

test('climber scales a wall and walks on from the top',()=>{
  const g=blankGame();
  fill(g,100,300,300,310);
  fill(g,200,209,260,299);     // 40px wall
  const l=walker(g,150,299,{isClimber:true});
  let minY=999;
  const done=runUntil(g,800,()=>l.x>=250||l.dead,()=>{minY=Math.min(minY,l.y);});
  assert(done&&!l.dead,'climber died or stalled');
  assert(minY<=260,`lemming never reached the wall top (minY=${minY})`);
  assert(l.x>=250,`climber should continue past the wall (x=${l.x})`);
});

test('bomber blasts a crater in dirt but not steel, and skills deplete',()=>{
  const g=blankGame();
  fill(g,100,300,300,309);
  fill(g,140,160,310,312,2);   // steel under the blast
  fill(g,100,300,313,330);
  g.skills={2:1};
  // Blockers stay put, so the crater lands at a known spot.
  const l=walker(g,150,299);l.state=S.BLOCK;
  const other=walker(g,120,299);other.state=S.BLOCK;
  g.assignAbility(l,2);
  assertEq(l.bomberTimer,300,'bomber timer should arm');
  g.assignAbility(other,2);    // no charges left
  assertEq(other.bomberTimer,0,'second bomber must not arm with 0 charges');
  run(g,340);
  assert(l.dead,'bomber should be dead');
  assert(!other.dead,'bystander outside the blast must survive');
  assertEq(td(g,150,303),0,'crater should remove dirt');
  assertEq(td(g,150,311),2,'steel must survive the blast');
  assertEq(td(g,120,305),1,'dirt outside the radius must survive');
});

test('clicking a splatting lemming wastes no ability',()=>{
  const g=blankGame();
  fill(g,100,300,300,310);
  g.skills={0:5};               // climbers can normally be assigned in any state
  g.selectAbility(0);
  const l=walker(g,150,299);
  l.state=S.SPLAT;l.splatFrame=0;
  g.scrollX=0;
  g.handleClick(150,293);       // right on top of the lemming (its body is at y-6)
  assert(!l.isClimber,'a dying (splatting) lemming must not receive abilities');
  assertEq(g.skills[0],5,'no climber charge should be spent');
});

// ---------- nuke ----------
test('nuke closes the entrance and ends the level once everyone is gone',()=>{
  const g=new T.Game();
  g.loadLevel(0);
  for(let i=0;i<360;i++)g.update();
  const out=g.lemmingsOut;
  assert(out>=5&&out<10,`expected a partial release, got ${out}`);
  g.startNuke();
  for(let i=0;i<800&&g.gameState==='playing';i++)g.update();
  assertEq(g.lemmingsOut,out,'entrance must stop releasing during a nuke');
  assertEq(g.countActive(),0,'all lemmings should be gone');
  assertEq(g.gameState,'results','nuked level must still end');
});

// ---------- main loop (fixed timestep) ----------
test('stepSim runs the sim at a fixed 60Hz regardless of frame rate',()=>{
  const STEP=T.STEP_MS;
  const g=blankGame();
  fill(g,100,300,300,310);
  walker(g,200,299).state=S.BLOCK;   // keep one lemming live so the level stays playing
  g._acc=0;g.fastMode=false;
  assertEq(g.stepSim(STEP),1,'one 60Hz frame should run exactly one tick');
  g._acc=0;
  const hitch=g.stepSim(5*STEP);
  assert(hitch>=4&&hitch<=5,`a 5-frame hitch should run ~5 ticks (not 1), got ${hitch}`);
  g._acc=0;g.fastMode=true;
  assertEq(g.stepSim(STEP),3,'fast mode should run 3 ticks per frame');
  g.fastMode=false;g._acc=0;
  const huge=g.stepSim(100000);
  assert(huge>0&&huge<=16,`a long background gap must be clamped (no catch-up spiral), got ${huge}`);
});

// ---------- UI state ----------
test('timer renders as M:SS and turns red in the last 30 seconds',()=>{
  const g=new T.Game();
  g.loadLevel(0);
  const tEl=sb.__els['s-time'];
  g.updateHeader();
  assertEq(tEl.textContent,'2:00','initial time');
  assertEq(tEl.style.color,'','normal color');
  g.levelTime=29*60;
  g.updateHeader();
  assertEq(tEl.textContent,'0:29','low time');
  assertEq(tEl.style.color,'#ff6644','low-time warning color');
});

test('ability selection toggles and rejects empty skills',()=>{
  const g=new T.Game();
  g.loadLevel(0);                 // skills: {6:10}
  g.selectAbility(6);
  assertEq(g.selectedAbility,6,'digger should select');
  g.selectAbility(6);
  assertEq(g.selectedAbility,-1,'second press should deselect');
  g.selectAbility(0);             // no climbers in level 1
  assertEq(g.selectedAbility,-1,'empty skill must not select');
});

test('a selected ability auto-deselects when its last charge is spent',()=>{
  const g=blankGame();
  fill(g,100,300,300,310);
  g.skills={6:1};                 // a single digger
  g.selectAbility(6);
  assertEq(g.selectedAbility,6,'digger should select');
  const l=walker(g,150,299);
  g.assignAbility(l,6);           // spends the last charge
  assertEq(l.state,S.DIG,'digger should be assigned');
  assertEq(g.selectedAbility,-1,'an exhausted ability should auto-deselect');
});

test('keyboard shortcuts work and leave browser shortcuts alone',()=>{
  const g=new T.Game();
  g.loadLevel(0);
  // Each Game registers its own keydown listener; drive the newest one.
  const h=sb.window._handlers.keydown[sb.window._handlers.keydown.length-1];
  const ev=(key,mods={})=>({key,repeat:false,preventDefault(){},...mods});
  h(ev('p',{metaKey:true}));
  assertEq(g.paused,false,'Cmd+P must not toggle pause');
  h(ev('f',{ctrlKey:true}));
  assertEq(g.fastMode,false,'Ctrl+F must not toggle fast-forward');
  h(ev('p'));
  assertEq(g.paused,true,'P should pause');
  h(ev(' '));
  assertEq(g.paused,false,'Space should unpause');
  const r=g.releaseRate;
  h(ev('+',{ctrlKey:true,altKey:true}));   // AltGr layouts report Ctrl+Alt
  assertEq(g.releaseRate,r+5,'AltGr-produced + must still adjust rate');
  h(ev('7'));
  assertEq(g.selectedAbility,6,'key 7 should select the digger');
  h(ev('Escape'));
  assertEq(g.selectedAbility,-1,'Escape should deselect');
});

test('R restarts the current level',()=>{
  const g=new T.Game();
  g.loadLevel(0);
  for(let i=0;i<200;i++)g.update();           // let some lemmings spawn
  assert(g.lemmingsOut>0,'some lemmings should have been released');
  const h=sb.window._handlers.keydown[sb.window._handlers.keydown.length-1];
  h({key:'r',repeat:false,preventDefault(){}});
  assertEq(g.lemmingsOut,0,'restart should reset the release count');
  assertEq(g.gameState,'playing','game should still be playing after a restart');
});

test('release rate clamps to [10,99]',()=>{
  const g=new T.Game();
  g.loadLevel(0);
  for(let i=0;i<30;i++)g.adjustRate(-5);
  assertEq(g.releaseRate,10,'lower clamp');
  for(let i=0;i<30;i++)g.adjustRate(5);
  assertEq(g.releaseRate,99,'upper clamp');
});

// ---------- persistence ----------
test('level unlocks persist via localStorage',()=>{
  sb.__store.clear();
  const g=new T.Game();
  assertEq(g.unlockedLevels,1,'fresh game starts with 1 unlocked');
  g.loadLevel(0);
  g.lemmingsSaved=T.LEVELS[0].need;
  g.lemmingsOut=T.LEVELS[0].total;
  g.endLevel();
  assertEq(g.unlockedLevels,2,'win should unlock the next level');
  assertEq(sb.__store.get('lemmings.unlocked'),'2','unlock should be written to storage');
  const g2=new T.Game();
  assertEq(g2.unlockedLevels,2,'new session should restore unlocks');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
