/* Real wheel classifier/category owner: a new visible-card intent can be
   handed to the next transition without replaying momentum or hidden input. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {rendererPage}=require('./inspiration-check.cjs');
const {turn,near}=require('./scroll-check.cjs');
const source=fs.readFileSync(path.join(__dirname,'../inspiration-gestures.js'),'utf8');

function fixture({raw=2,enabled=true,entering=false,targetReady=()=>true}={}){
  let time=1000;
  const scrolls=[],closes=[],root={dataset:{}};
  const events=()=>({listeners:new Map(),addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);},
    dispatchEvent(event){for(const fn of this.listeners.get(event.type)||[])fn(event);}});
  const document=events(),window=events();document.hidden=false;
  window.scrollY=2000+raw;window.InspirationView={root};
  window.scrollTo=options=>{scrolls.push(options);window.scrollY=options.top;};
  window.InspirationCardFlip={resetForNavigation:(...args)=>closes.push(args)};
  vm.runInNewContext(source,{window,document,performance:{now:()=>time},
    CustomEvent:class{constructor(type){this.type=type;}},
    requestAnimationFrame(){assert.fail('Input handoff must use the existing chapter clock');},
    setTimeout(){assert.fail('Input handoff must not add release timers');}});
  let context={height:800,enabled,entering,targetReady};
  const update=(patch={})=>{context={...context,...patch};return window.InspirationGestures.update({...context,origin:2000,rawDistance:window.scrollY-2000,now:time});};
  update({restore:true});context.restore=false;
  function advance(ms,patch={}){
    if(ms===0)return update(patch);
    let result;
    for(let left=ms;left>0;){const step=Math.min(left,20);time+=step;left-=step;result=update(patch);}
    return result;
  }
  function input(type,props={},step=0){
    if(step)advance(step);
    const event={type,target:{closest:()=>null},prevented:false,preventDefault(){this.prevented=true;},...props};
    Object.defineProperty(event,'defaultPrevented',{get(){return this.prevented;}});
    window.dispatchEvent(event);
    return event;
  }
  function wheel(delta=120,step=230,props={}){
    const event=input('wheel',{deltaY:delta,deltaX:0,deltaMode:0,...props},step);
    const intent=window.SiteWheelIntent.sample(event,time,800);
    if(!event.prevented&&intent)window.scrollY+=intent.delta;
    return {event,intent,state:update()};
  }
  function touch(direction=1){
    input('touchstart',{touches:[{clientX:100,clientY:400}]});
    input('touchmove',{touches:[{clientX:100,clientY:400-direction*50}]});
    input('touchend',{touches:[]});
    return update();
  }
  function key(direction=1){
    const value=direction>0?'PageDown':'PageUp';
    input('keydown',{key:value,repeat:false});input('keyup',{key:value});return update();
  }
  return{root,window,document,scrolls,closes,update,advance,input,wheel,touch,key,get time(){return time;}};
}

function queueLate(kind,direction){
  const f=fixture({raw:direction>0?2:1598});
  f.wheel(120*direction);
  assert.equal(f.update().target,1);
  f.advance(660);
  const pending=kind==='wheel'?f.wheel(120*direction,0).state:kind==='touch'?f.touch(direction):f.key(direction);
  assert.equal(pending.target,1,`${kind}: the current transition remains whole`);
  assert.equal(pending.queued,direction,`${kind}: one late deliberate intent is retained`);
  assert.equal(f.scrolls.length,1,'Buffering input does not move the native anchor early');
  let result=f.advance(140);
  assert.equal(result.position,1,'The current card reaches its endpoint before the next starts');
  assert.equal(result.target,direction>0?2:0,`${kind}: the next adjacent card starts at the handoff`);
  assert(result.busy,`${kind}: the second movement remains a complete animation`);
  assert.equal(result.queued,0,'The buffered intent is spent once');
  result=f.advance(800);
  assert.equal(result.position,direction>0?2:0);assert(!result.busy);
  assert.equal(f.scrolls.length,2,'Exactly two gestures create exactly two card anchors');
  assert.equal(f.closes.length,2,'An open back face would return once per accepted navigation');
}
for(const kind of['wheel','touch','key'])for(const direction of[1,-1])queueLate(kind,direction);

// A whole rising/decaying trackpad impulse remains one gesture, including an
// isolated late spike. No quiet period is inserted by this fixture.
for(const step of[8,16]){
  const f=fixture();f.wheel(120,230);const started=f.time;
  for(const delta of[80,60,40,20,12,8,4,2,1,.4])f.wheel(delta,step);
  while(f.time<started+900)f.wheel(.3,step);
  assert.equal(f.update().position,1);
  assert.equal(f.update().queued,0);assert.equal(f.scrolls.length,1);
  f.wheel(34,step);f.wheel(.3,step);f.wheel(.3,step);
  assert.equal(f.update().target,1,'One rogue tail spike cannot launch a card');
  assert.equal(f.update().queued,0);
}

// A fresh but early gesture belongs to the still-moving current card. Its
// residual low-amplitude tail cannot silently become a late handoff.
for(const kind of['wheel','touch','key']){
  const f=fixture();f.wheel();f.advance(400);
  const result=kind==='wheel'?f.wheel(120,0).state:kind==='touch'?f.touch():f.key();
  assert.equal(result.queued,0,`${kind}: early busy input is not reserved`);
  if(kind==='wheel'){
    for(const delta of[60,30,12,8,4,2,1,.3])f.wheel(delta,16);
    while(f.time<2100)f.wheel(.3,16);
  }else f.advance(1000);
  assert.equal(f.update().target,1);assert.equal(f.scrolls.length,1);
}

// The queue has one bounded adjacent slot. Extra late input cannot add a third
// switch or spill a Detail exit into the following screen.
{
  const f=fixture();f.wheel();f.advance(600);
  f.wheel(120,0);f.wheel(120,70);f.wheel(120,70);
  assert.equal(f.update().queued,1);
  f.advance(60);assert.equal(f.update().target,2);assert.equal(f.update().queued,0);
  f.advance(1600);assert.equal(f.update().position,2);assert.equal(f.scrolls.length,2);
}
for(const direction of[1,-1]){
  const f=fixture({raw:800});f.wheel(120*direction);f.advance(660);
  f.wheel(120*direction,0);
  assert.equal(f.update().queued,0,'A native exit beyond People/Detail is never buffered');
  f.advance(940);assert.equal(f.update().position,direction>0?2:0);
  assert.equal(f.scrolls.length,1,'The late boundary input never moves the next/previous chapter');
}

// Visibility/lifecycle boundaries discard the handoff. Restoring an owner must
// not replay a gesture the user made before hiding or navigating the page.
for(const boundary of['hidden','blur','restore']){
  const f=fixture();f.wheel();f.advance(660);f.wheel(120,0);
  assert.equal(f.update().queued,1);
  if(boundary==='hidden'){f.document.hidden=true;f.document.dispatchEvent({type:'visibilitychange'});}
  else if(boundary==='blur')f.window.dispatchEvent({type:'blur'});
  else f.update({restore:true,explicitRestore:true});
  assert.equal(f.update().queued,0,`${boundary}: pending input is cleared`);
  f.document.hidden=false;f.document.dispatchEvent({type:'visibilitychange'});
  f.advance(2000);assert.equal(f.update().target,1);assert.equal(f.scrolls.length,1);
}

// Decode/entry waits cannot borrow the late-card handoff. There is no visible
// settled card on which to interpret a new intent in these states.
{
  let ready=false;const f=fixture({targetReady:()=>ready});f.wheel();f.advance(660);f.wheel();
  assert(f.update().pending);assert.equal(f.update().queued,0);assert.equal(f.scrolls.length,0);
  ready=true;f.advance(0);f.advance(800);assert.equal(f.update().position,1);assert.equal(f.scrolls.length,1);
}
{
  const f=fixture({enabled:false,entering:true});f.wheel();f.advance(660);f.wheel();
  assert.equal(f.update().queued,0);assert.equal(f.scrolls.length,0);
  f.update({enabled:true,entering:false});f.wheel(.3,16);f.advance(1500);
  assert.equal(f.update().target,0,'The consumed entrance tail cannot preselect Music');
}

// Physical wheel notches spaced below the former220ms silence requirement
// remain distinct, while equal60/120Hz deltas still count as one stream.
for(const delta of[100,120])for(const mode of[0,1]){
  const f=fixture(),value=mode===1?3:delta;
  const ids=[];
  for(let i=0;i<9;i++)ids.push(f.wheel(value,100,{deltaMode:mode}).intent.id);
  assert.equal(new Set(ids).size,ids.length,`mode${mode}/${value}: each separated physical notch is fresh`);
  assert.equal(f.update().target,2,'Continued deliberate notches hand off to the next card');
  assert.equal(f.scrolls.length,2,'Repeated notches do not skip to the native exit');
}
for(const step of[8,16]){
  const f=fixture(),ids=[];
  for(let i=0;i<140;i++)ids.push(f.wheel(120,step).intent.id);
  assert.equal(new Set(ids).size,1,'High-rate constant momentum is not discrete wheel notches');
  assert.equal(f.update().target,1);assert.equal(f.scrolls.length,1);
}

async function checkVisibleEntrance(){
  for(const [width,height]of[[375,812],[768,1024],[1440,800],[1920,960],[2560,1305]])for(const overshoot of[false,true]){
    const {page,view,read}=rendererPage(width,height,{visualEnd:true,worksTravel:height*8});
    await turn();page.frames();
    const start=Number(page.hero.dataset.inspirationStart);
    page.scroll(start-1);page.frames();read.allowed=false;page.layout(false);
    if(overshoot){assert(!page.wheel(height*5,230).prevented);page.frame(0);}
    else {page.scroll(start+10);page.frame();}
    for(let count=0;view.root.dataset.flipRunning!=='true'&&count<80;count++)page.frame(10);
    assert.equal(view.root.dataset.flipRunning,'true');
    const advance=ms=>{for(let left=ms;left>0;){const step=Math.min(left,25);page.frame(step);left-=step;}};
    advance(1000);assert.equal(view.root.dataset.flipRunning,'false');
    // The native anchor correction is painted on the following shared frame;
    // permit that rebase, but never the removed invisible510ms reveal phase.
    advance(650);page.frame(1000/60);page.frame(1000/60);
    near(Number(view.headingLeft.style.opacity),1,'Visible heading is fully arrived');
    assert.equal(view.root.dataset.gestureReady,'true',`${width}/${overshoot?'overshoot':'normal'}: entry has no invisible510ms/rebase lock after the heading settles (raf=${page.raf.size}, local=${page.window.scrollY-120-start}, flip=${view.root.dataset.flipProgress})`);
    near(page.window.scrollY-120-start,2,'Entry is already rebased to the People anchor');
    page.wheel(120,230);page.frame(0);advance(800);page.frames();
    assert.equal(view.index.textContent,'02','The first new visible-screen gesture changes People to Music');
    assert.equal(view.root.dataset.gestureQueued,'0');
  }
}

if(require.main===module)checkVisibleEntrance().then(()=>{
  console.log('Responsive Inspiration input passed:650ms visible entry, one late adjacent handoff across wheel/touch/key and reverse, no momentum/early/hidden/boundary replay, bounded queue and discrete physical notches.');
}).catch(error=>{console.error(error);process.exitCode=1;});
