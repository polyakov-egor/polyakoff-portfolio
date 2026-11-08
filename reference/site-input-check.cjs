/* Exercise the production Hero/About/Inspiration/closing/Works controllers
   together. Native browser actions are emulated only after all listeners have
   had their chance to cancel an event, so hidden chapter locks are observable. */
const assert=require('node:assert/strict');
const {fixture}=require('./inspiration-closing-check.cjs');
const {turn,near}=require('./scroll-check.cjs');

const target={closest:()=>null};
const advance=(page,ms)=>{for(let left=ms;left>0;left-=Math.min(left,25))page.frame(Math.min(left,25));};
const start=f=>Number(f.page.hero.dataset.inspirationStart);
const worksStart=f=>Number(f.page.hero.dataset.worksStart);

function event(f,type,props={}){
  const e={type,target,cancelable:true,prevented:false,preventDefault(){if(this.cancelable)this.prevented=true;},...props};
  Object.defineProperty(e,'defaultPrevented',{get(){return this.prevented;}});
  f.page.window.dispatchEvent(e);return e;
}
function wheel(f,dy=40,elapsed=16,props={}){
  const {page}=f;page.frame(elapsed);
  const e=event(f,'wheel',{deltaX:0,deltaY:dy,deltaMode:0,...props});
  if(!e.prevented&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    const unit=e.deltaMode===1?16:e.deltaMode===2?page.hero.heroLayout.height:1;
    page.scroll(Math.max(0,page.window.scrollY+e.deltaY*unit)-120);
  }
  return e;
}
function key(f,value,props={}){
  const e=event(f,'keydown',{key:value,repeat:false,...props});
  if(!e.prevented&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(value==='Home')f.page.scroll(-120);
    if(value==='End')f.page.scroll(parseFloat(f.page.nodes['.hero-journey'].style.height)-f.height);
  }
  return e;
}
function restoreAt(f,distance){
  // History restoration is a native way to visit a chapter without spending a
  // category gesture. It also catches old owners recapturing another screen.
  f.read.allowed=true;f.page.layout(true);
  f.page.window.dispatchEvent({type:'pageshow',persisted:true});
  f.page.scroll(distance);f.page.frames();
  f.read.allowed=false;f.page.layout(false);
}
function enterPeople(f){
  restoreAt(f,start(f)-1);
  wheel(f,12,500);f.page.frame();f.page.frames();
  assert.equal(f.view.index.textContent,'01');
  assert.equal(f.view.root.dataset.gestureReady,'true');
  near(f.page.window.scrollY-120-start(f),2,'People enters at its own native anchor');
}
function nativeSequence(f,label,eventTarget=target){
  const {page}=f;
  // Includes a sustained decaying trackpad tail followed by a new stroke with
  // no 220ms quiet gap. Outside the category chapter every packet is native.
  const packets=[42,31,22,15,9,5,3,1,.5,.2,55,38,19,5,-36,-17,-4];
  let expected=page.window.scrollY;
  for(const dy of packets){
    assert(!wheel(f,dy,16,{target:eventTarget}).prevented,`${label}: normal and repeated trackpad input is not cancelled`);
    expected=Math.max(0,expected+dy);page.frame(0);
    near(page.window.scrollY,expected,`${label}: no hidden chapter changes the native displacement`);
  }
  for(const [deltaMode,dy,pixels]of[[1,2,32],[2,.025,f.height*.025]]){
    assert(!wheel(f,dy,16,{target:eventTarget,deltaMode}).prevented,`${label}: line/page wheel retains browser defaults`);
    expected+=pixels;page.frame(0);near(page.window.scrollY,expected,`${label}: native wheel mode is not double-normalized`);
  }
  for(const modifier of ['ctrlKey','metaKey','altKey']){
    const before=page.window.scrollY;
    assert(!wheel(f,120,16,{target:eventTarget,[modifier]:true}).prevented,`${label}: ${modifier}+wheel is left to the browser`);
    page.frames();near(page.window.scrollY,before,`${label}: browser shortcut does not create a chapter anchor`);
  }
  assert(!wheel(f,.5,16,{target:eventTarget,deltaX:70}).prevented,`${label}: a horizontal trackpad gesture is not cancelled`);
  page.frames();near(page.window.scrollY,expected+.5,`${label}: horizontal input does not acquire an old vertical chapter`);
}

(async()=>{
  for(const [width,height]of[[1440,800],[390,844]]){
    const f=fixture(width,height),{page,view}=f;await turn();page.frames();
    const morph=height*page.window.HeroScrollEffect.getSettings().heroScrollDuration;

    restoreAt(f,morph*.22);
    const heroBefore=Number(page.hero.dataset.scrollProgress);
    nativeSequence(f,`${width}: Hero`);
    assert(Number(page.hero.dataset.scrollProgress)>heroBefore,'Hero actually renders the native displacement');

    restoreAt(f,0);
    nativeSequence(f,`${width}: wheel above welcome`,page.nodes['.hero__welcome']);
    assert.equal(view.root.hidden,true,'Welcome-area scrolling cannot jump to the category chapter');

    restoreAt(f,(morph+start(f))/2);
    const aboutBefore=page.flightUpdates.at(-1).after;
    nativeSequence(f,`${width}: About`);
    assert(page.flightUpdates.at(-1).after>aboutBefore,'About actually advances its text instead of swallowing input');

    restoreAt(f,worksStart(f)+height*2);
    assert(page.hero.classList.contains('is-works'),'The real projected Works renderer is active');
    const transforms=f.list.children.map(card=>card.style.transform),phase=Number(f.journey.dataset.helixProgress);
    nativeSequence(f,`${width}: Works canvas`,f.viewport.querySelector('.works-gallery-canvas'));
    assert(Number(f.journey.dataset.helixProgress)>phase,'Actual Works orbit follows native scrolling');
    assert.notDeepEqual(f.list.children.map(card=>card.style.transform),transforms,'Real Works planes change pose');

    enterPeople(f);
    for(const props of [{ctrlKey:true},{metaKey:true},{altKey:true},{deltaX:300}]){
      const before=page.window.scrollY;
      assert(!wheel(f,1,16,props).prevented,'Browser shortcuts and horizontal input also bypass active categories');
      page.frames();assert.equal(view.index.textContent,'01','Bypassed input does not switch a hidden category');
      if(!props.deltaX)near(page.window.scrollY,before,'Pinch/shortcut does not move a category anchor');
    }

    // First accepted gesture starts one complete transition. Additional fresh
    // strokes during the timed animation may not queue Detail behind Music.
    assert(wheel(f,120,500).prevented);page.frame(0);
    for(let i=0;i<3;i++){assert(wheel(f,130,140).prevented);page.frame(0);}
    page.frames();assert.equal(view.index.textContent,'02','Busy-category input does not chain into a second switch');
    assert.equal(view.root.dataset.gestureQueued,'0');
    advance(page,1500);page.frames();assert.equal(view.index.textContent,'02','No delayed category action remains after busy input');

    enterPeople(f);
    const stroke=[8,16,35,65,90,70,50,32,20,12,8,6,4,3,2,1,.6,.3];
    const nextStroke=[5,15,35,65,95,75,52,34,21,12,7,4,2,1,.4];
    const stream=(values,direction=1)=>{for(const value of values){wheel(f,value*direction,16);page.frame(0);}};
    stream(stroke);stream(Array(56).fill(.3));
    assert.equal(view.index.textContent,'02','A long inertial tail still belongs to the original People-to-Music stroke');
    // No frame drain or sleep is allowed here: the next physical stroke begins
    // while the preceding momentum is still delivering a packet every16ms.
    stream(nextStroke);stream(Array(56).fill(.3));
    assert.equal(view.index.textContent,'03','A renewed trackpad stroke works without waiting220ms for silence');
    stream(nextStroke,-1);stream(Array(56).fill(.3),-1);
    assert.equal(view.index.textContent,'02','A deliberate opposite stroke works during the preceding inertial tail');
    assert.equal(view.root.dataset.gestureQueued,'0');

    // Native Home/End must release a category even during an active action;
    // the old anchor may not recapture the page on a later animation frame.
    assert(wheel(f,120,500).prevented);page.frame(0);
    assert.equal(view.root.dataset.cardRunning,'true','End is tested while a category transition is still active');
    assert(!key(f,'End').prevented,'End is explicit native document navigation');
    page.frames();assert.equal(f.journey.dataset.galleryFinished,'true');
    const endpoint=page.window.scrollY;advance(page,1000);page.frames();near(page.window.scrollY,endpoint,'End cannot be pulled back into Inspiration');
    assert(!key(f,'Home').prevented,'Home is explicit native document navigation');
    page.frames();near(page.window.scrollY,0,'Home reaches the actual document top');
    assert.equal(Number(page.hero.dataset.scrollProgress),0);

    enterPeople(f);assert(wheel(f,120,500).prevented);page.frame(0);
    assert.equal(view.root.dataset.cardRunning,'true');
    assert(!key(f,'Home').prevented,'Home also bypasses a running category action');
    page.frames();near(page.window.scrollY,0,'A running card cannot recapture Home');

    enterPeople(f);
    event(f,'touchstart',{touches:[{identifier:1,clientX:150,clientY:600}]});
    event(f,'touchmove',{touches:[{identifier:1,clientX:150,clientY:597}]});
    event(f,'touchcancel',{touches:[]});
    assert(!event(f,'touchmove',{touches:[{identifier:1,clientX:150,clientY:520}]}).prevented,'Cancelled touch ownership cannot trap a later orphan move');
    event(f,'touchstart',{touches:[{identifier:2,clientX:150,clientY:600}]});
    assert(event(f,'touchmove',{touches:[{identifier:2,clientX:150,clientY:550}]}).prevented,'A new swipe after cancellation is accepted');
    event(f,'touchend',{touches:[]});page.frame(0);page.frames();
    assert.equal(view.index.textContent,'02','The replacement swipe changes exactly one category');
    event(f,'touchstart',{touches:[{identifier:3,clientX:130,clientY:600},{identifier:4,clientX:180,clientY:600}]});
    assert(!event(f,'touchmove',{touches:[{identifier:3,clientX:110,clientY:590},{identifier:4,clientX:200,clientY:590}]}).prevented,'Two-finger browser zoom is not cancelled');
    event(f,'touchcancel',{touches:[]});

    enterPeople(f);
    assert(wheel(f,2,500,{deltaMode:1}).prevented,'A line-mode mouse gesture triggers one complete category action');
    page.frame(0);page.frames();assert.equal(view.index.textContent,'02');
    assert(wheel(f,.05,500,{deltaMode:2}).prevented,'A page-mode wheel gesture is normalized in the active chapter');
    page.frame(0);page.frames();assert.equal(view.index.textContent,'03');

    // Loading belongs to one accepted request. Swipes while its target is not
    // decoded are discarded, and completing a later image must not replay one.
    enterPeople(f);
    const music=view.cards[1].querySelectorAll('.inspiration__image');
    for(const image of music){image.complete=false;image.naturalWidth=0;}
    assert(wheel(f,120,500).prevented);page.frame(0);page.frames();
    assert.equal(view.index.textContent,'01','An unloaded Music image does not reveal an incomplete card');
    for(let i=0;i<3;i++){wheel(f,140,400);page.frame(0);page.frames();}
    assert.equal(view.index.textContent,'01');assert.equal(view.root.dataset.gestureQueued,'0');
    for(const image of music){image.complete=true;image.naturalWidth=768;image.dispatchEvent({type:'load'});}
    page.frame(0);page.frames();assert.equal(view.index.textContent,'02','Decoded target performs only its original requested transition');
    advance(page,1600);page.frames();assert.equal(view.index.textContent,'02','Loading-time input cannot replay Detail');

    // Input arriving before People is visible must belong only to the entry.
    restoreAt(f,start(f)-1);wheel(f,height*3,500);page.frame(0);
    for(let i=0;view.root.dataset.gestureReady!=='true'&&i<130;i++){
      wheel(f,90,i%4===0?230:25);page.frame(0);
      assert.equal(view.index.textContent,'01','Entry input cannot skip the first visible category');
      assert.equal(view.root.dataset.gestureQueued,'0');
    }
    assert.equal(view.root.dataset.gestureReady,'true','The production entry eventually exposes People');
    page.frames();assert.equal(view.index.textContent,'01');
    assert.equal(page.raf.size,0,'The integrated site sleeps after all input settles');
  }
  console.log('Whole-site input checks passed: real Hero/About/Works native trackpad bursts, welcome/canvas targets, shortcuts/horizontal and wheel modes, Home/End, cancelled/new touches, busy/loading/entry isolation and no idle clock.');
})().catch(error=>{console.error(error);process.exitCode=1;});
