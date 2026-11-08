/* Real shared wheel classifier + category owner. Physical finger impulses may
   overlap an uninterrupted 60/120Hz momentum stream; no quiet gap is invented. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../inspiration-gestures.js'),'utf8');
function fixture({height=800,raw=2,enabled=true,entering=false,targetReady=()=>true}={}){
  let time=1000;const scrolls=[],closes=[];
  const events=()=>({listeners:new Map(),addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);},
    dispatchEvent(event){for(const fn of this.listeners.get(event.type)||[])fn(event);}});
  const document=events();document.hidden=false;
  const window=events();window.scrollY=2000+raw;window.InspirationView={root:{dataset:{}}};
  window.scrollTo=options=>{scrolls.push(options);window.scrollY=options.top;};
  window.InspirationCardFlip={resetForNavigation:(...args)=>closes.push(args)};
  vm.runInNewContext(source,{window,document,performance:{now:()=>time},
    CustomEvent:class{constructor(type){this.type=type;}},
    requestAnimationFrame(){assert.fail('Wheel classification adds no animation clock');},
    setTimeout(){assert.fail('Wheel classification needs no background timers');}});
  let context={height,enabled,entering,targetReady};
  const update=(patch={})=>{context={...context,...patch};return window.InspirationGestures.update({...context,origin:2000,rawDistance:window.scrollY-2000,now:time});};
  update({restore:true});context.restore=false;
  function wheel(delta,step=16,properties={}){
    time+=step;
    const event={type:'wheel',deltaY:delta,deltaX:0,deltaMode:0,target:{closest:()=>null},prevented:false,
      preventDefault(){this.prevented=true;},...properties};
    Object.defineProperty(event,'defaultPrevented',{get(){return this.prevented;}});
    window.dispatchEvent(event);
    const intent=window.SiteWheelIntent.sample(event,time,height);
    if(!event.prevented&&intent)window.scrollY+=intent.delta;
    return {event,intent,state:update()};
  }
  return{window,document,scrolls,closes,wheel,update,sample:(event)=>window.SiteWheelIntent.sample(event,time,height),
    advance(ms,patch={}){time+=ms;return update(patch);},get time(){return time;}};
}
const pulse60=[8,16,35,65,90,70,50,32,20,12,8,6,4,3,2,1,.6,.3];
const renewed60=[5,15,35,65,95,75,52,34,21,12,7,4,2,1,.4];
const low120=[1,2,4,8,12,16];
function send(f,values,step=16,sign=1){return values.map(value=>f.wheel(sign*value,step));}

// A shared descriptor is normalized once, regardless of listener order.
{
  const f=fixture(),event={deltaY:2,deltaX:0,deltaMode:1};
  const a=f.sample(event),b=f.window.SiteWheelIntent.sample(event,f.time+99,1600);
  assert.strictEqual(a,b);assert.equal(a.delta,32);assert.equal(a.direction,1);assert(a.fresh);assert(Object.isFrozen(a));
  assert.equal(f.sample({deltaY:1,deltaX:0,deltaMode:2}).delta,800);
  for(const event of[{deltaY:1,deltaX:2},{deltaY:NaN},{deltaY:Infinity},{deltaY:1,ctrlKey:true},{deltaY:1,metaKey:true},{deltaY:1,altKey:true},{deltaY:0}]){
    assert.equal(f.sample(event),null);
  }
}

// New physical impulses start the next whole animation before momentum has
// gone silent. The same holds for a deliberate reverse at both event rates.
for(const step of[16,8]){
  const f=fixture();send(f,pulse60,step);send(f,Array(step===8?112:56).fill(.3),step);
  assert.equal(f.update().position,1);assert.equal(f.scrolls.length,1);
  const next=send(f,step===8?low120:renewed60,step);
  assert(next.some(result=>result.intent.fresh),'Renewed acceleration creates a new intent without an idle gap');
  assert.equal(f.update().target,2);assert(f.update().busy,'The second card change starts its complete timed animation');
  send(f,[12,8,4,2,1,.4,.2],step);send(f,Array(step===8?112:56).fill(.2),step);
  assert.equal(f.update().position,2);
  const reverse=send(f,step===8?low120:renewed60,step,-1);
  assert(reverse.some(result=>result.intent.fresh));assert.equal(f.update().target,1);
  f.advance(800);assert.equal(f.update().position,1);assert.equal(f.scrolls.length,3);
}

// A new intent recognized during an animation is spent there. It cannot be
// queued or silently fire when that animation's 800ms endpoint is reached.
{
  const f=fixture();send(f,pulse60);send(f,Array(10).fill(.3));
  const during=send(f,renewed60);
  assert(during.some(result=>result.intent.fresh));assert(f.update().busy);
  send(f,Array(100).fill(.2));assert.equal(f.update().position,1);assert.equal(f.scrolls.length,1);
  send(f,renewed60);assert.equal(f.update().target,2);
}

// Continuous input, one rogue spike and alternating native rebounds remain
// one intent, even after the accepted transition has already finished.
for(const values of[
  Array(150).fill(80),
  [...pulse60,...Array(56).fill(.3),34,.2,.2,.2,...Array(20).fill(.2)],
  Array.from({length:120},(_,i)=>i%7===0?1920:960),
]){
  const f=fixture(),results=send(f,values);
  assert.equal(new Set(results.map(result=>result.intent.id)).size,1);
  assert.equal(f.update().target,1);assert.equal(f.scrolls.length,1);
}
{
  const f=fixture(),values=Array.from({length:100},(_,i)=>i%7===0?-1920:960);
  const ids=[];for(const value of values){f.advance(16);ids.push(f.sample({deltaY:value,deltaX:0,deltaMode:0}).id);}
  assert.equal(new Set(ids).size,1,'A large sign rebound without a settled tail is not a fresh gesture');
}

// Native exits need deliberate displacement too. Tiny sign noise is absorbed;
// the threshold event and the rest of that one intent stay native together.
for(const [raw,sign]of[[2,-1],[1598,1]]){
  const f=fixture({raw});assert(f.wheel(sign*.1,230).event.prevented);
  assert(f.wheel(sign*8).event.prevented);assert(f.wheel(sign*8).event.prevented);
  assert(!f.wheel(sign*8).event.prevented);assert(!f.wheel(sign*4).event.prevented);
  assert.equal(f.closes.length,1,'The boundary navigation begins once, at its threshold');
}

// The helper observes native input before visibility but never reserves it.
{
  const f=fixture({enabled:false,entering:true});send(f,pulse60);send(f,Array(56).fill(.3));
  f.update({enabled:true,entering:false});send(f,Array(20).fill(.3));
  assert.equal(f.update().target,0);send(f,renewed60);assert.equal(f.update().target,1);
}
{
  let ready=false;const f=fixture({targetReady:()=>ready});send(f,pulse60);send(f,Array(56).fill(.3));
  assert(f.update().pending);assert(!f.update().busy);assert.equal(f.scrolls.length,0);
  send(f,renewed60);assert.equal(f.closes.length,1,'Decode wait consumes renewed input without queueing');
  ready=true;f.advance(0);assert(f.update().busy);f.advance(800);assert.equal(f.update().position,1);
  assert.equal(f.scrolls.length,1);assert.equal(f.update().queued,0);
}
console.log('Trackpad intent checks passed: shared event cache, 60/120Hz renewed swipes/reverse without silence, no continuous-tail/spike/rebound repeats, deliberate native exits, entrance and decoded-asset quarantine.');
