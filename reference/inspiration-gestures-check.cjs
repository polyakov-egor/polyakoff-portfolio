const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../inspiration-gestures.js'),'utf8');
function fixture({height=800,raw=2,enabled=true,entering=false,reducedMotion=false}={}){
  let time=1000,wakes=0;const scrolls=[];
  const events=()=>({listeners:new Map(),addEventListener(k,v){if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(v);},dispatchEvent(event){for(const fn of this.listeners.get(event.type)||[])fn(event);}});
  const document=events();document.hidden=false;
  const window=events();window.scrollY=2000+raw;window.InspirationView={root:{dataset:{}}};
  window.scrollTo=options=>{scrolls.push({...options});window.scrollY=options.top;};
  const nativeTarget={closest(){return null;}},control={closest(){return {};}};
  const scope={window,document,performance:{now:()=>time},CustomEvent:class {constructor(type){this.type=type;}},requestAnimationFrame(){assert.fail('Gesture module must not create its own animation clock');}};
  window.addEventListener('inspiration:ready',()=>wakes++);
  vm.runInNewContext(source,scope);
  const api=window.InspirationGestures;
  let ctx={height,enabled,entering,reducedMotion};
  function update(patch={}){ctx={...ctx,...patch};return api.update({...ctx,rawDistance:window.scrollY-2000,now:time});}
  update({restore:true});ctx.restore=false;
  function event(type,props={}){
    const e={type,target:nativeTarget,prevented:false,preventDefault(){this.prevented=true;},...props};
    window.dispatchEvent(e);return e;
  }
  function wheel(dy=120,ms=230,props={}){
    time+=ms;const e=event('wheel',{deltaX:0,deltaY:dy,deltaMode:0,...props});
    if(!e.prevented&&!e.ctrlKey&&!e.metaKey&&!e.altKey)window.scrollY+=dy*(e.deltaMode===1?16:e.deltaMode===2?ctx.height:1);
    return e;
  }
  function advance(ms,patch={}){time+=ms;return update(patch);}
  function key(value,props={}){return event('keydown',{key:value,repeat:false,...props});}
  function startTouch(x=100,y=600){return event('touchstart',{touches:[{clientX:x,clientY:y}]});}
  function moveTouch(x,y){return event('touchmove',{touches:[{clientX:x,clientY:y}]});}
  return {api,window,document,scrolls,control,event,wheel,key,startTouch,moveTouch,update,advance,get time(){return time;},get wakes(){return wakes;}};
}
const near=(a,b,msg)=>assert(Math.abs(a-b)<1e-8,`${msg}: ${a} versus ${b}`);

// Timed adjacent changes, using a single shared clock and fixed native anchors.
{
  const f=fixture();const e=f.wheel();assert(e.prevented);
  assert.equal(f.scrolls.length,1);assert.equal(f.scrolls[0].top,2800);assert.equal(f.scrolls[0].behavior,'instant');
  let p=f.update();assert.equal(p.position,0);assert.equal(p.target,1);assert(p.busy);
  p=f.advance(400);near(p.position,.875,'The whole animation responds immediately and eases into its landing');assert(p.busy);
  p=f.advance(400);assert.equal(p.position,1);assert(!p.busy);
  assert.equal(f.scrolls.length,1,'Settled frames do not repeat native anchoring');
  const wakeCount=f.wakes;for(let i=0;i<20;i++)f.advance(16);assert.equal(f.wakes,wakeCount,'Idle updates schedule no extra frames');
  f.wheel(120);p=f.advance(800);assert.equal(p.position,2);assert.equal(f.scrolls.at(-1).top,3598);
  f.wheel(-120);p=f.advance(800);assert.equal(p.position,1,'A fresh upward gesture changes exactly one category');
  f.wheel(-120);p=f.advance(800);assert.equal(p.position,0);assert.equal(f.scrolls.at(-1).top,2002);
}

// Long wheels/trackpad momentum and extra input while animating never chain.
{
  const f=fixture();f.wheel(100);f.update();
  for(let i=0;i<26;i++){assert(f.wheel(80,50).prevented);f.update();}
  assert.equal(f.update().position,1);assert.equal(f.scrolls.length,1,'A burst lasting beyond the animation still advances once');
  assert(f.wheel(50,150).prevented);assert.equal(f.update().target,1,'Momentum after the animation is still the same gesture');
  f.wheel(80,221);assert.equal(f.update().target,2,'A quiet period arms the next gesture');
}
{
  const f=fixture();for(const dy of [8,10]){assert(f.wheel(dy,50).prevented);assert.equal(f.scrolls.length,0);}
  f.wheel(8,50);assert.equal(f.scrolls.length,1,'Small trackpad deltas accumulate only to one deliberate switch');
  const line=fixture();line.wheel(2,230,{deltaMode:1});assert.equal(line.update().target,1,'Line-mode mouse input is normalized');
  const page=fixture();page.wheel(1,230,{deltaMode:2});assert.equal(page.update().target,1,'Page-mode mouse input is normalized');
}

// Every wheel burst while the card/headings enter is discarded. People stays
// intact until a new deliberate burst starts after its settled visible frame.
{
  const f=fixture({raw:-40,enabled:false});assert(!f.wheel(120).prevented);f.update({entering:true});
  assert(f.wheel(80,40).prevented);assert.equal(f.update().queued,0,'Entrance momentum does not queue Music');
  for(let i=0;i<8;i++){
    assert(f.wheel(100,230).prevented);assert.equal(f.update().queued,0,'Even separate pre-reveal gestures do not queue');
  }
  assert.equal(f.scrolls.length,0,'Pre-reveal input never creates a category anchor');
  f.window.scrollY=2002;f.update({enabled:false,entering:true});
  const p=f.update({enabled:true,entering:false});assert.equal(p.target,0);assert(!p.busy);assert.equal(f.scrolls.length,0);
  assert(f.wheel(100,40).prevented);assert.equal(f.update().target,0,'The same tail after visibility is still consumed');
  assert.equal(f.advance(800).position,0,'No delayed switch can fire on a later frame');
  f.wheel(120,230);assert.equal(f.update().target,1,'A post-reveal fresh gesture switches to Music');
  assert.equal(f.advance(800).position,1);assert.equal(f.scrolls.length,1);
}
{
  const f=fixture({enabled:false,entering:true});assert(f.wheel(-120).prevented);assert.equal(f.update().queued,0);
  f.update({enabled:true,entering:false});assert.equal(f.window.scrollY,2002,'Pre-reveal upward input cannot queue a reverse flip');
  assert.equal(f.advance(800).position,0);assert.equal(f.scrolls.length,0);
}
{
  const f=fixture({enabled:false,entering:true});f.startTouch();
  assert(f.moveTouch(100,500).prevented);f.update({enabled:true,entering:false});
  assert(f.moveTouch(100,300).prevented);assert.equal(f.update().target,0,'A swipe begun behind the entrance cannot switch once visible');
  f.event('touchend',{touches:[]});f.startTouch();f.moveTouch(100,550);assert.equal(f.update().target,1,'A new visible-screen swipe works');
}
{
  const f=fixture({enabled:false,entering:true});assert(f.key('PageDown').prevented);
  f.update({enabled:true,entering:false});assert(f.key('PageDown',{repeat:true}).prevented);
  assert.equal(f.update().target,0,'Held entrance keys cannot switch categories');
  f.event('keyup',{key:'PageDown'});f.key('PageDown');assert.equal(f.update().target,1,'A new post-reveal keypress works');
}

// Boundary gestures return to native scrolling immediately; a return tail stops
// at Detail instead of silently changing categories inside the same gesture.
{
  const f=fixture({raw:1598});assert.equal(f.update().position,2);
  const e=f.wheel(80);assert(!e.prevented,'The first Detail-down wheel remains native');assert.equal(f.window.scrollY,3678);
  f.update({enabled:false});assert(!f.wheel(50,50).prevented,'Remaining native exit momentum continues normally');
  f.window.scrollY=3700;f.update({enabled:false});
  assert(!f.wheel(-160,230).prevented);f.update({enabled:true});
  assert(f.wheel(-80,40).prevented);assert.equal(f.update().target,2,'A native return gesture cannot skip past Detail');
  f.wheel(-120,230);assert.equal(f.update().target,1);
}
{
  const f=fixture();assert(!f.wheel(-60).prevented,'People-up releases the first native delta');assert(f.window.scrollY<2000);
  f.update({enabled:false});assert(!f.wheel(-20,50).prevented);
}

// Controls, browser zoom and horizontal motion do not become category switches.
{
  const f=fixture();
  for(const props of [{ctrlKey:true},{metaKey:true},{altKey:true},{target:f.control},{deltaX:200}]){
    assert(!f.wheel(20,230,props).prevented);
  }
  assert.equal(f.scrolls.length,0);assert.equal(f.update().target,0);
}

// Touch swipes behave like gestures, preserve horizontal/native boundary swipes,
// and never count an already-running native swipe a second time on re-entry.
{
  const f=fixture();f.startTouch();assert(f.moveTouch(100,585).prevented);assert.equal(f.scrolls.length,0);
  assert(f.moveTouch(100,560).prevented);assert.equal(f.update().target,1);
  assert(f.moveTouch(100,300).prevented);assert.equal(f.scrolls.length,1);
  f.event('touchend',{touches:[]});f.advance(800);
  f.startTouch();f.moveTouch(100,550);assert.equal(f.advance(800).position,2);
  f.event('touchend',{touches:[]});f.startTouch();assert(!f.moveTouch(100,590).prevented,'Detail forwards touch exits before a touchmove is cancelled');
  f.event('touchend',{touches:[]});f.startTouch();assert(!f.moveTouch(220,590).prevented,'Horizontal touch gestures remain native');
}
{
  const f=fixture({raw:1700,enabled:false});f.startTouch();f.window.scrollY=3550;f.update({enabled:true});
  assert(f.moveTouch(100,650).prevented);assert.equal(f.update().target,2,'An outside swipe stops on Detail without another switch');
}

// Keyboard repeats do not skip categories, while normal boundary keys and
// browser shortcuts retain native behavior.
{
  const f=fixture();assert(f.key('ArrowDown').prevented);assert.equal(f.update().target,1);
  assert(f.key('ArrowDown',{repeat:true}).prevented);assert.equal(f.scrolls.length,1);
  f.advance(800);assert(f.key('ArrowDown',{repeat:true}).prevented);assert.equal(f.update().target,1);
  f.key('PageDown');assert.equal(f.advance(800).position,2);
  assert(!f.key('PageDown').prevented);assert(!f.key('PageDown',{repeat:true}).prevented);
  assert(!f.key('Home').prevented);assert(!f.key('ArrowUp',{target:f.control}).prevented);
  assert(f.key(' ',{shiftKey:true}).prevented);assert.equal(f.advance(800).position,1);
}

// Restore/resize and reduced motion produce exact settled stages with no RAF.
{
  const f=fixture({raw:1500});assert.equal(f.update().position,2);
  assert.equal(f.update({height:1100,restore:true}).position,2,'A responsive resize keeps the current settled category');
  f.window.scrollY=2000+1050;assert.equal(f.update({restore:true}).position,1,'History restoration reads the nearest physical category');
  assert.equal(f.scrolls.length,0,'Restoration never injects a scroll action');
}
{
  const f=fixture({reducedMotion:true});f.wheel();const p=f.update();assert.equal(p.position,1);assert(!p.busy);
}
{
  const f=fixture();f.wheel();f.update();f.advance(100);f.document.hidden=true;f.document.dispatchEvent({type:'visibilitychange'});
  assert.equal(f.update().position,1);assert(!f.update().busy,'A hidden page settles rather than keeping its own clock alive');
  assert(!f.wheel().prevented,'A hidden page does not trap user input');
}

// Live duration tuning preserves phase, then applies the new remaining time.
{
  const f=fixture();let milliseconds=800;
  f.window.HeroScrollEffect={getSettings:()=>({inspirationCardDurationMs:milliseconds})};
  f.wheel();f.update();const quarter=f.advance(200).position;
  near(quarter,.578125,'Configured800msdurationstartswiththecorrecteaseoutphase');
  milliseconds=1600;near(f.update().position,quarter,'Live slower tuning keeps the current card pose');
  near(f.advance(400).position,.875,'Remaining progress uses the slower duration');
  milliseconds=350;near(f.update().position,.875,'Live faster tuning keeps the current card pose');
  assert.equal(f.advance(175).position,1);assert.equal(f.scrolls.length,1,'Tuning never injects additional native category anchors');
}

// A back-face reset shares the accepted navigation gesture rather than using
// the first wheel/swipe just to close and requiring a second one to advance.
{
  const f=fixture(),closes=[];
  f.window.InspirationCardFlip={resetForNavigation:(direction,time)=>closes.push({direction,time})};
  f.wheel();assert.equal(f.update().target,1);assert.equal(closes.length,1);assert.equal(closes[0].direction,1);
  f.wheel(120,40);assert.equal(closes.length,1,'Input while switching does not restart the closing spring');
  f.advance(800);f.wheel(-120);assert.equal(f.update().target,0);assert.equal(closes.at(-1).direction,-1);
  f.advance(800);const boundary=f.wheel(-80);assert(!boundary.prevented);assert.equal(closes.length,3,'People-up closes the back while releasing the same native return');
  const detail=fixture({raw:1598}),detailCloses=[];
  detail.window.InspirationCardFlip={resetForNavigation:direction=>detailCloses.push(direction)};
  assert(!detail.wheel(80).prevented);assert.deepEqual(detailCloses,[1],'Detail-down also resets before its native exit');
  const touch=fixture(),touchCloses=[];
  touch.window.InspirationCardFlip={resetForNavigation:direction=>touchCloses.push(direction)};
  touch.startTouch();touch.moveTouch(100,550);assert.equal(touch.update().target,1);assert.deepEqual(touchCloses,[1]);
  const key=fixture(),keyCloses=[];
  key.window.InspirationCardFlip={resetForNavigation:direction=>keyCloses.push(direction)};
  key.key('PageDown');assert.equal(key.update().target,1);assert.deepEqual(keyCloses,[1]);
}
console.log('Inspiration gestures passed: one switch per gesture, concurrent back-face return, native boundaries, entrance guards, restore/reduced and one shared clock.');
