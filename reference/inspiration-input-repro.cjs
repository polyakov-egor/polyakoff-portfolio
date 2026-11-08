/* Real chapter renderer + shared Hero clock. Native inertia is injected after
   touch release, rather than pretending preventDefault cancels every UA tick. */
const assert = require('node:assert/strict');
const {rendererPage} = require('./inspiration-check.cjs');
const {turn,near} = require('./scroll-check.cjs');
const advance=(page,ms)=>{for(let left=ms;left>0;left-=Math.min(left,25))page.frame(Math.min(left,25));};
function input(f,type,properties={}) {
  const event={type,target:{closest:()=>null},prevented:false,cancelable:true,
    preventDefault(){if(this.cancelable)this.prevented=true;},...properties};
  Object.defineProperty(event,'defaultPrevented',{get(){return this.prevented;}});
  f.page.window.dispatchEvent(event);return event;
}
async function fixture(width=375,height=812) {
  const f=rendererPage(width,height,{visualEnd:true,worksTravel:height*8});
  await turn();f.page.frames();
  const start=Number(f.page.hero.dataset.inspirationStart);
  f.page.scroll(start-1);f.page.frames();
  f.page.scroll(start+10);f.page.frame();f.page.frames();
  assert.equal(f.view.root.dataset.gestureReady,'true');
  assert.equal(f.view.root.dataset.cardPosition,'0.00000');
  return {...f,start,height};
}
(async()=>{
  for(const[width,height]of[[375,812],[390,600],[1920,960]]){
    const f=await fixture(width,height),{page,view,start}=f;
    const closing=[];
    page.window.InspirationClosing={measure:()=>({travel:0}),update:(distance,options)=>{closing.push({distance,...options});}};
    input(f,'touchstart',{touches:[{identifier:1,clientX:100,clientY:500}]});
    const tiny=input(f,'touchmove',{touches:[{identifier:1,clientX:100,clientY:499}]});
    assert(tiny.prevented,'The first vertical move owns the touch before native panning begins');
    const accepted=input(f,'touchmove',{touches:[{identifier:1,clientX:100,clientY:450}]});
    assert(accepted.prevented);page.frame(0);
    assert.equal(view.root.dataset.gestureStage,'1');
    assert.equal(view.root.dataset.cardRunning,'true');
    input(f,'touchend',{touches:[]});
    // A queued UA scroll or a delayed frame must not reinterpret one swipe as
    // the terminal card or Works. Only an explicit new boundary gesture exits.
    page.scroll(start+height*3.5);page.frame(25);
    assert.equal(view.root.dataset.flipRunning,'false');
    assert.equal(view.root.dataset.gestureStage,'1','Inertial overshoot cannot settle directly to Detail');
    assert.equal(view.root.dataset.cardRunning,'true','The accepted timed change still has intermediate poses');
    near(page.window.scrollY-120-start,height,'Native scroll is rebased to this one target anchor');
    advance(page,800);page.frames();
    assert.equal(view.root.dataset.cardPosition,'1.00000');
    assert.equal(view.index.textContent,'02');
    assert(f.worksUpdates.every(distance=>distance<0),'Category momentum never enters Works');
    assert(closing.every(packet=>packet.distance<0&&packet.rawDistance<0),'Native correction is not added twice to the closing chapter');
  }

  // A long Hero/About fling can finish its physical correction before the
  // outer Hero/theme paint. It still needs the final corrected render before
  // the shared clock sleeps, otherwise a white chapter retains white chrome.
  {
    const height=713,f=rendererPage(1267,height,{visualEnd:true,worksTravel:height*8}),{page,view}=f;
    await turn();page.window.HeroScrollEffect.setSettings({heroScrollDuration:2.2,aboutScrollDuration:2.5});page.frames();
    const start=Number(page.hero.dataset.inspirationStart);
    input(f,'touchstart',{touches:[{clientX:100,clientY:600}]});
    page.scroll(start+height*6);advance(page,4000);page.frames();input(f,'touchend',{touches:[]});
    assert.equal(view.index.textContent,'01');assert.equal(view.root.dataset.flipRunning,'false');
    assert.equal(page.hero.dataset.scrollProgress,'1.0000','The outer Hero is painted at its corrected final size');
    assert.equal(page.hero.dataset.lightProgress,'1.0000','The About/theme layer reaches its final light endpoint');
    near(localDistance(page,start),2,'The fling ends at the People anchor');
    assert.equal(page.raf.size,0,'The final corrected paint does not create idle animation');
  }

  // One finger remains one switch even when held down beyond the duration,
  // while native queued frames continue trying to move the page underneath.
  {
    const f=await fixture(),{page,view,start,height}=f;
    input(f,'touchstart',{touches:[{identifier:1,clientX:100,clientY:600}]});
    input(f,'touchmove',{touches:[{identifier:1,clientX:100,clientY:550}]});page.frame(0);
    for(let i=0;i<24;i++){
      page.scroll(start+height*(i%2?3.1:-.1));page.frame(70);
      const move=input(f,'touchmove',{touches:[{identifier:1,clientX:100,clientY:500-i*10}]});
      assert(move.prevented,`The held finger never becomes a second swipe: step${i} ${JSON.stringify(view.root.dataset)}`);page.frame(0);
      assert.equal(view.root.dataset.flipRunning,'false','Native rebounds cannot reverse the entry card');
      assert.equal(view.root.hidden,false,'The Inspiration chapter never flashes to About');
    }
    input(f,'touchend',{touches:[]});page.frames();
    assert.equal(view.root.dataset.cardPosition,'1.00000');
    assert.equal(view.index.textContent,'02');
    input(f,'touchstart',{touches:[{identifier:2,clientX:100,clientY:600}]});
    input(f,'touchmove',{touches:[{identifier:2,clientX:100,clientY:550}]});advance(page,800);page.frames();
    assert.equal(view.index.textContent,'03','A separate deliberate swipe advances the next category');
  }

  // iOS browser-bar reflow and late Works preparation must preserve the
  // running category and its monotonic shared-clock pose, not snap to target
  // or render one frame at time zero before the next RAF jumps forwards.
  {
    const f=await fixture(390,844),{page,view}=f;
    input(f,'touchstart',{touches:[{clientX:100,clientY:500}]});
    input(f,'touchmove',{touches:[{clientX:100,clientY:450}]});page.frame(0);
    advance(page,180);const before=Number(view.root.dataset.cardPosition);
    assert(before>0&&before<1);assert.equal(view.root.dataset.cardRunning,'true');
    page.window.dispatchEvent({type:'works:ready'});
    near(Number(view.root.dataset.cardPosition),before,'Readiness remeasurement uses the current clock');
    page.resize(390,700);
    near(Number(view.root.dataset.cardPosition),before,'Toolbar resize keeps the category pose');
    assert.equal(view.root.dataset.cardRunning,'true','Resize does not settle the timed transition early');
    page.frame(100);const later=Number(view.root.dataset.cardPosition);
    assert(later>before&&later<1,'The original transition continues with the same clock after reflow');
    advance(page,600);page.frames();assert.equal(view.index.textContent,'02');
    input(f,'touchend',{touches:[]});
  }

  // Detail's explicit outward swipe releases native scrolling. A fresh
  // opposite swipe from Works lands on Detail; its own residual movement is
  // not also owed to Music or About. Only another fresh swipe changes cards.
  {
    const f=await fixture(),{page,view,start,height}=f;
    for(let i=0;i<2;i++){
      input(f,'touchstart',{touches:[{identifier:i,clientX:100,clientY:600}]});
      input(f,'touchmove',{touches:[{identifier:i,clientX:100,clientY:550}]});advance(page,800);
      input(f,'touchend',{touches:[]});page.frames();
    }
    assert.equal(view.index.textContent,'03');
    input(f,'touchstart',{touches:[{identifier:3,clientX:100,clientY:600}]});
    assert(!input(f,'touchmove',{touches:[{identifier:3,clientX:100,clientY:550}]}).prevented,'Detail exits natively');
    page.scroll(start+height*2+300);page.frames();
    assert(page.window.scrollY-120-start>height*2,'The native exit is not re-pinned');
    input(f,'touchend',{touches:[]});
    input(f,'touchstart',{touches:[{identifier:4,clientX:100,clientY:300}]});
    assert(!input(f,'touchmove',{touches:[{identifier:4,clientX:100,clientY:350}]}).prevented,'The return begins on the native Works side');
    page.scroll(start+height*.4);page.frame(0);page.frames();
    assert.equal(view.index.textContent,'03','The returning gesture first lands on Detail');
    near(page.window.scrollY-120-start,height*2-2,'The returning gesture cannot travel through hidden categories');
    assert(input(f,'touchmove',{touches:[{identifier:4,clientX:100,clientY:600}]}).prevented);
    assert.equal(view.index.textContent,'03');input(f,'touchend',{touches:[]});
    input(f,'touchstart',{touches:[{identifier:5,clientX:100,clientY:300}]});
    input(f,'touchmove',{touches:[{identifier:5,clientX:100,clientY:350}]});advance(page,800);page.frames();
    assert.equal(view.index.textContent,'02');
  }

  // Explicit browser navigation is allowed to jump outside the captured
  // chapter; the hold is for gestures, not a trap for Home/End/history.
  {
    const f=await fixture(),{page,view,start,height}=f;
    assert(!input(f,'keydown',{key:'End',repeat:false}).prevented,'End retains the native document jump');page.scroll(start+height*8);page.frames();
    assert(page.window.scrollY-120-start>height*2);
    assert(f.worksUpdates.some(distance=>distance>0),'End can reach Works');
    assert(!input(f,'keydown',{key:'Home',repeat:false}).prevented,'Home retains the native document jump');page.scroll(0);page.frames();
    assert.equal(view.root.hidden,true);near(page.window.scrollY,120,'Home can return to the beginning');
  }
  console.log('Integrated Inspiration input checks passed: first-move capture; inertia, delayed frames and held swipes; preserved reflow/readiness clock; native exits, quarantined re-entry and Home/End.');
})().catch(error=>{console.error(error);process.exitCode=1;});

function localDistance(page,start){return page.window.scrollY-120-start;}
