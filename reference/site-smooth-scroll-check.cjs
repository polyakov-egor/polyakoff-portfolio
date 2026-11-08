/* Run the actual vendored Lenis and the portfolio adapter together. Browser
   geometry/events are controlled; the scroll interpolation is not mocked. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const vendor = fs.readFileSync(path.join(root, 'assets/vendor/lenis-1.3.27/lenis.min.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'site-smooth-scroll.js'), 'utf8');
const near = (a,b,why) => assert(Math.abs(a-b)<.02, `${why}: ${a} != ${b}`);
class Events {
  constructor() { this.handlers = new Map(); }
  addEventListener(type, fn, options={}) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push({fn, once:Boolean(options?.once), capture:options===true||Boolean(options?.capture)});
  }
  removeEventListener(type, fn) { this.handlers.set(type,(this.handlers.get(type)||[]).filter(v=>v.fn!==fn)); }
  dispatchEvent(event) {
    event.target ||= this;
    const handlers=[...(this.handlers.get(event.type)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture));
    for (const item of handlers) {
      item.fn(event);
      if(item.once)this.removeEventListener(event.type,item.fn);
    }
    return !event.defaultPrevented;
  }
}
class Element extends Events {
  constructor() {
    super(); this.dataset={}; this.attributes=new Map(); this.classList=new Set(); this.classList.remove=name=>this.classList.delete(name); this.style={setProperty(){},removeProperty(){}};
    this.clientWidth=1280;this.clientHeight=800;this.scrollWidth=1280;this.scrollHeight=20800;this.nativeSurface=false;
  }
  hasAttribute(name){return this.attributes.has(name);}
  matches(){return this.nativeSurface;}
  closest(){return this.nativeSurface?this:null;}
}
class Window extends Events {}
class CustomEvent { constructor(type, options={}){this.type=type;this.detail=options.detail;} stopPropagation(){} }
function fixture({blocked=false,reduced=false,coarse=false,missingVendor=false,missingStory=false}={}) {
  const window=new Window(), document=new Events(), html=new Element(), target=new Element();
  document.documentElement=html;document.hidden=false;document.querySelector=()=>null;document.getElementById=()=>null;
  window.document=document;window.scrollY=0;window.scrollX=0;window.innerHeight=800;window.innerWidth=1280;
  let time=1000, frameId=0, timerId=0, readyBlocked=blocked, writes=0, wakes=0;
  const frames=new Map(),timers=new Map(),media=new Map();
  for(const [query,matches]of[['(prefers-reduced-motion: reduce)',reduced],['(pointer: coarse)',coarse]]){
    const item=new Events();item.matches=matches;media.set(query,item);
  }
  window.matchMedia=query=>media.get(query)||{matches:false,addEventListener(){}};
  window.SitePreloader={isBlocking:()=>readyBlocked};
  if(!missingStory)window.HeroScrollEffect={};
  window.scrollTo=({top})=>{writes++;window.scrollY=Math.max(0,Math.min(20000,Number(top)||0));};
  window.addEventListener('inspiration:ready',()=>{wakes++;});
  // Existing chapter handlers are installed before Lenis is constructed.
  window.addEventListener('wheel',event=>{if(event.chapterConsumes)event.preventDefault();});
  const context={window,document,Window,Element,HTMLElement:Element,HTMLAnchorElement:class extends Element{},CustomEvent,
    navigator:{userAgent:'Desktop test'},performance:{now:()=>time},console,URL,
    ResizeObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame(callback){frames.set(++frameId,callback);return frameId;},cancelAnimationFrame(id){frames.delete(id);},
    setTimeout(callback,delay){timers.set(++timerId,{callback,due:time+delay});return timerId;},clearTimeout(id){timers.delete(id);},
  };
  const sandbox=vm.createContext(context);
  if(!missingVendor){vm.runInContext(vendor,sandbox);window.Lenis=sandbox.Lenis;}
  vm.runInContext(adapter,sandbox,{filename:'site-smooth-scroll.js'});
  const api=window.SiteSmoothScroll;
  function input(type,props={}) {
    const event={type,target,cancelable:true,defaultPrevented:false,deltaX:0,deltaY:120,deltaMode:0,
      composedPath:()=>[target,html,window],preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...props};
    window.dispatchEvent(event);return event;
  }
  function frame(ms=1000/60) {
    time+=ms;api.raf(time);
    const jobs=[...frames.values()];frames.clear();jobs.forEach(job=>job(time));
  }
  function settle() { for(let i=0;i<250&&api.isAnimating();i++)frame();assert(!api.isAnimating(),'Real Lenis reaches rest within a bounded number of shared frames');frame(); }
  return {api,window,document,html,target,frames,timers,media,input,frame,settle,
    enter(){readyBlocked=false;window.dispatchEvent(new CustomEvent('site:entered'));},
    preference(query,value){const m=media.get(query);m.matches=value;m.dispatchEvent({type:'change'});},
    idle(ms){time+=ms;},get writes(){return writes;},get wakes(){return wakes;}};
}

const deferred=fixture({blocked:true});
assert(!deferred.api.getState().enabled,'Preloader must finish before Lenis can attach input listeners');
assert.equal(deferred.frames.size,0);
deferred.enter();assert(deferred.api.getState().enabled);
assert.equal(deferred.html.dataset.scrollEngine,'lenis');
for(let i=0;i<20;i++)deferred.frame();
assert.equal(deferred.writes,0,'A stationary shared clock must not rewrite the page scroll');
assert.equal(deferred.frames.size,0,'Lenis autoRaf stays disabled; no independent idle loop');

const f=fixture();
const wheel=f.input('wheel');assert(wheel.defaultPrevented,'Lenis owns a normal desktop wheel');
assert.equal(f.api.getState().target,120);assert(f.api.isAnimating());assert(f.api.usesSmoothedScroll());
f.frame();assert(f.window.scrollY>0&&f.window.scrollY<120,'Real vendor interpolation produces intermediate positions');
f.settle();near(f.window.scrollY,120,'Wheel reaches its destination');
assert(f.api.usesSmoothedScroll(),'The completed wheel retains its smoothing owner, avoiding a second scene damping tail');
assert.equal(f.frames.size,0);
f.idle(60000);f.input('wheel');f.frame();
assert(f.window.scrollY>120&&f.window.scrollY<240,'A new wheel after a long idle starts smoothly instead of consuming the entire idle delta');
const cancelledAt=f.window.scrollY;
const consumed=f.input('wheel',{chapterConsumes:true,deltaY:2000});
assert(consumed.defaultPrevented);assert(!f.api.isAnimating());near(f.api.getState().target,cancelledAt,'A chapter-consumed event clears an old Lenis target');
for(let i=0;i<25;i++)f.frame();near(f.window.scrollY,cancelledAt,'Old inertia cannot bleed into a hidden chapter');

// A RAF callback queued earlier in the same browser frame carries an older
// timestamp than performance.now() used to prime a just-arrived wheel. Lenis
// must never receive a negative delta time: its real damp() extrapolates in
// the opposite direction and can cross the nearby People entrance again.
for(const delta of [-705.813,705.813]){
  const p=fixture(),actual=2487.128;
  p.api.jump(actual);p.input('wheel',{deltaY:delta});
  near(p.api.getState().target,actual+delta,'New wheel target preserves direction before the shared callback');
  for(const staleTimestamp of [999,999.4,1000]){
    p.api.raf(staleTimestamp); // The wheel primed the vendor clock at1000ms.
    assert.equal(p.window.scrollY,actual,'An older/same-frame RAF cannot extrapolate opposite to the wheel');
  }
  p.frame(16);
  assert((p.window.scrollY-actual)*Math.sign(delta)>0,'The next chronological frame moves in the requested direction');
  assert(Math.abs(p.window.scrollY-actual)<Math.abs(delta),'The next frame remains a smooth intermediate position');
  p.settle();near(p.window.scrollY,actual+delta,'Monotonic timestamps preserve the full destination');
}

// A browser-rounded/late native rebase can place About at599px while an idle
// Lenis still remembers605px across the600px People entrance. A negative
// wheel must move backwards from599, never first advance across that boundary.
// No native scroll event is dispatched: that missing/late event is the bug.
for(const[retained,actual,delta]of[[605,599,-16],[595,601,16]]){
  const p=fixture();p.api.jump(retained);assert(!p.api.isAnimating());
  p.window.scrollY=actual;p.idle(60000);
  const e=p.input('wheel',{deltaY:delta});assert(e.defaultPrevented);
  near(p.window.scrollY,actual,'Priming an idle wheel never moves the native viewport');
  near(p.api.getState().target,actual+delta,'The new wheel destination starts at the actual anchor, not the remembered position');
  let previous=actual;
  for(let i=0;i<12;i++){
    p.frame();
    assert((p.window.scrollY-previous)*Math.sign(delta)>=0,'The first and subsequent frames move only in the requested direction');
    assert((p.window.scrollY-actual)*Math.sign(delta)>=0,'No frame crosses back into the adjacent chapter before moving away');
    previous=p.window.scrollY;
  }
  p.settle();near(p.window.scrollY,actual+delta,'The resynchronized gesture keeps its full requested distance');

  const held=fixture();held.api.jump(retained);held.window.scrollY=actual;
  const consumed=held.input('wheel',{chapterConsumes:true,deltaY:delta});
  assert(consumed.defaultPrevented);assert(!held.api.isAnimating());
  near(held.api.getState().target,actual,'A consumed chapter gesture clears a stale idle destination instead of adding its delta');
  for(let i=0;i<8;i++)held.frame();near(held.window.scrollY,actual,'A consumed gesture leaves the chapter anchor unchanged');
}

for(const [kind,props] of [
  ['horizontal',{deltaX:180,deltaY:20}],['zoom',{ctrlKey:true}],['shift',{shiftKey:true}],
  ['native panel',{nested:true}],['touch',{type:'touchmove',targetTouches:[{clientX:20,clientY:20}]}],
]){
  const p=fixture();p.input('wheel');p.frame();const before=p.window.scrollY;
  p.target.nativeSurface=Boolean(props.nested);
  const e=p.input(props.type||'wheel',props);
  assert(!e.defaultPrevented,`${kind} keeps its native default`);
  assert(!p.api.isAnimating(),`${kind} discards a previous desktop wheel destination`);
  for(let i=0;i<6;i++)p.frame();near(p.window.scrollY,before,`${kind} does not replay old wheel inertia`);
}

for(const[type,props]of[['keydown',{key:'PageDown'}],['pointerdown',{button:0}],['touchstart',{targetTouches:[{clientX:10,clientY:10}]}]]){
  const p=fixture();p.input('wheel');p.frame();
  const event=p.input(type,props);assert(!event.defaultPrevented,`${type} reaches the existing/native controller`);
  assert(!p.api.isAnimating());assert(!p.api.usesSmoothedScroll());
}

const jump=fixture();jump.input('wheel',{deltaY:900});jump.frame();
jump.api.jump(900);near(jump.window.scrollY,900,'A chapter anchor moves immediately');
near(jump.api.getState().target,900,'Anchor updates Lenis target as well as browser position');
assert(!jump.api.isAnimating(),'Jump discards the animation even when requested anchor equals its old destination');
jump.api.jump(-25);near(jump.window.scrollY,0,'Negative jumps clamp to document start');
const beforeBad=jump.writes;jump.api.jump(NaN);assert.equal(jump.writes,beforeBad);

const exact=fixture();exact.input('wheel',{deltaY:200});exact.window.scrollY=200;
assert(exact.api.isAnimating());exact.api.cancel();
assert(!exact.api.isAnimating(),'An exact zero-delta checkpoint still stops the vendor early-return animation');
near(exact.api.getState().target,200,'Exact checkpoint remains aligned');

const hidden=fixture();hidden.input('wheel');hidden.frame();hidden.document.hidden=true;
hidden.document.dispatchEvent({type:'visibilitychange'});
assert(!hidden.api.isAnimating());assert(!hidden.api.usesSmoothedScroll());
const hiddenAt=hidden.window.scrollY;for(let i=0;i<20;i++)hidden.frame();near(hidden.window.scrollY,hiddenAt,'Hidden tab does not advance inertia');
hidden.document.hidden=false;hidden.document.dispatchEvent({type:'visibilitychange'});hidden.idle(30000);
hidden.input('wheel');hidden.frame();assert(hidden.window.scrollY>hiddenAt&&hidden.window.scrollY<hiddenAt+120);
hidden.input('pagehide');assert(!hidden.api.isAnimating());
hidden.window.scrollY=500;hidden.input('pageshow');near(hidden.api.getState().target,500,'History restore revalidates actual native position and dimensions');

for(const options of [{reduced:true},{coarse:true},{missingVendor:true},{missingStory:true}]){
  const p=fixture(options);assert(!p.api.getState().enabled);assert.equal(p.html.dataset.scrollEngine,'native');
  const e=p.input('wheel');assert(!e.defaultPrevented,'Unsupported or native-preferred modes retain browser scrolling');
  p.api.jump(321);near(p.window.scrollY,321,'Native fallback still supports chapter anchor jumps');
}
const preference=fixture();preference.input('wheel');preference.frame();
preference.preference('(prefers-reduced-motion: reduce)',true);
assert(!preference.api.getState().enabled);assert(!preference.html.classList.has('lenis'),'Preference changes destroy vendor listeners/classes');
assert(!preference.input('wheel').defaultPrevented);
preference.preference('(prefers-reduced-motion: reduce)',false);assert(preference.api.getState().enabled);
preference.preference('(pointer: coarse)',true);assert(!preference.api.getState().enabled);
preference.preference('(pointer: coarse)',false);assert(preference.api.getState().enabled);

console.log('Lenis checks passed: actual vendor interpolation, monotonic same-frame timestamps, dormant shared RAF, deferred init, consumed-gesture cancellation, immediate/exact and late native anchors, idle/hidden/history handling, native touch/keyboard/pan and reduced/coarse/missing-runtime fallbacks.');
