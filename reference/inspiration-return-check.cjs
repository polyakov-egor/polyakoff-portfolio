/* The actual shared renderer must discard a return gesture while the card is
   still covering About. Input belongs to About only after that screen is shown
   and a new gesture starts; no previous wheel/touch/key displacement is owed. */
const assert=require('node:assert/strict');
const {rendererPage}=require('./inspiration-check.cjs');
const {turn,near}=require('./scroll-check.cjs');
const start=f=>Number(f.page.hero.dataset.inspirationStart);
const local=f=>f.page.window.scrollY-120-start(f);
const after=f=>f.page.flightUpdates.at(-1).after;
const advance=(page,ms)=>{for(let left=ms;left>0;left-=Math.min(left,25))page.frame(Math.min(left,25));};

async function fixture(width=1920,height=960,options={}){
  const f=rendererPage(width,height,{visualEnd:true,worksTravel:height*8,...options});
  await turn();f.page.frames();
  const boundary=start(f);
  f.page.scroll(boundary-1);f.page.frames();
  f.page.scroll(boundary+10);f.page.frame();f.page.frames();
  assert.equal(f.view.index.textContent,'01');
  assert.equal(f.view.root.dataset.flipRunning,'false');
  near(local(f),2,'Fixture enters the exact People anchor');
  f.read.allowed=false;f.page.layout(false);
  f.returnAfter=options.returnAfter;
  return f;
}
function endpoint(f){
  if(Number.isFinite(f.returnAfter))return f.returnAfter;
  const settings=f.page.window.HeroScrollEffect.getSettings();
  return (start(f)-1-f.page.hero.heroLayout.height*settings.heroScrollDuration)/settings.aboutScrollDuration;
}
function held(f,label){
  const settings=f.page.window.HeroScrollEffect.getSettings();
  const distance=f.page.hero.heroLayout.height*settings.heroScrollDuration+endpoint(f)*settings.aboutScrollDuration;
  near(local(f),distance-start(f),`${label}: native input stays at the About landing`);
  assert(after(f)>=endpoint(f)-.5,`${label}: old momentum cannot rewind past the landing`);
  assert(f.worksUpdates.every(distance=>distance<0),`${label}: the return never enters Works`);
}
function event(f,type,properties={},elapsed=0){
  f.page.frame(elapsed);
  const value={type,target:{closest:()=>null},prevented:false,preventDefault(){this.prevented=true;},...properties};
  Object.defineProperty(value,'defaultPrevented',{get(){return this.prevented;}});
  f.page.window.dispatchEvent(value);return value;
}

(async()=>{
  for(const [width,height] of [[375,812],[768,1024],[1440,800],[1920,960],[2560,1305]]){
    const f=await fixture(width,height),{page,view}=f;
    const first=page.wheel(-height*3,230);
    assert(first.prevented,'The first People-up gesture triggers the return without moving About');
    page.frame(0);assert.equal(view.root.dataset.flipRunning,'true');held(f,'Initial reverse');
    let steps=0;
    while(!view.root.hidden&&steps<100){
      // A direction rebound inside one burst must not change the destination
      // or queue scroll for the screen that is still behind the card.
      const tail=page.wheel(steps%7===3?height:-height*2,30);
      assert(tail.prevented,'Every momentum event during the reverse is consumed');
      page.frame(0);held(f,'Reverse momentum');steps++;
    }
    assert(steps<100,'The reverse finishes without further navigation');
    assert.equal(view.root.hidden,true);assert.equal(page.copy.getAttribute('aria-hidden'),'false');
    const visibleAfter=after(f),position=page.window.scrollY;
    const tail=page.wheel(-height,30);assert(tail.prevented,'The same burst cannot immediately rewind the revealed About');
    page.frame(0);held(f,'Visible About tail');near(page.window.scrollY,position);
    near(after(f),visibleAfter,'The revealed About starts at the same endpoint');
    page.frames();assert.equal(page.raf.size,0,'The waiting gate adds no idle animation clock');
    const next=page.wheel(-120,300);assert(!next.prevented,'A fresh gesture belongs to the now-visible About');
    page.frames();assert(after(f)<visibleAfter-20,'Only the fresh About gesture rewinds text');
    assert(local(f)<-100,'About consumes just its own new displacement');
  }

  // About visibly reassembles during the flip. Its visual distance can move
  // while the original gesture and native landing remain pinned.
  {
    const returnAfter=280;
    const f=await fixture(1920,960,{returnAfter}),{page,view}=f;
    const forwardBoundary=start(f);
    const settings=page.window.HeroScrollEffect.getSettings();
    const desired=960*settings.heroScrollDuration+returnAfter*settings.aboutScrollDuration;
    assert(page.wheel(-3000,230).prevented);
    page.frame(0);
    near(page.window.scrollY-120,desired,'Reverse targets the measured reading point');
    const scattered=after(f);
    assert(scattered>returnAfter,'The readable pose is not painted immediately at the start of the flip');
    for(let time=250;time<1000;time+=250){
      const previous=after(f);
      advance(page,250);
      assert.equal(view.root.hidden,false,'About rebuilds before the portrait finishes turning');
      assert.equal(page.copy.style.visibility,'visible','The animated text is visible behind the flipping card');
      assert.equal(page.copy.getAttribute('aria-hidden'),'true','The interim glyphs remain outside the accessibility reading order');
      assert(after(f)>returnAfter&&after(f)<previous,'Each quarter of the flip rewinds to an intermediate flight pose');
      near(page.window.scrollY-120,desired,'The visual flight cannot move the native landing');
      const expected=scattered+(returnAfter-scattered)*(1-Number(view.root.dataset.flipProgress));
      assert(Math.abs(after(f)-expected)<.01,'The glyph flight uses the same eased progress as the flip');
    }
    advance(page,250);
    assert.equal(view.root.hidden,true);
    near(after(f),returnAfter,'The first visible About frame reaches the exact reading pose');
    page.frames();
    assert.equal(view.root.hidden,true);
    assert.equal(page.copy.style.visibility,'','The normal About visibility resumes after the flip');
    assert.equal(page.copy.getAttribute('aria-hidden'),'false');
    near(after(f),returnAfter,'About is readable on the first settled frame');
    near(start(f),forwardBoundary,'The forward flip threshold stays at the end of About');
    assert.equal(page.raf.size,0,'The readable pose does not need an idle RAF');
    assert(!page.wheel(-80,300).prevented,'A fresh reverse gesture continues the native About scroll');
    page.frames();assert(after(f)<returnAfter-20);
    page.scroll(forwardBoundary-5);page.frames();
    assert.equal(view.root.hidden,true,'About remains active before the original forward threshold');
    page.scroll(forwardBoundary+6);page.frames();
    assert.equal(view.root.hidden,false,'The original forward threshold triggers People again');
    assert.equal(page.copy.style.visibility,'','Forward Inspiration never reveals the About plane');
    assert.equal(view.index.textContent,'01');
  }

  // One swipe can span the whole reverse. It is never reinterpreted as the
  // first movement on About, even when the finger remains down after reveal.
  {
    const f=await fixture(1920,960,{returnAfter:280}),{page,view}=f;
    event(f,'touchstart',{touches:[{clientX:500,clientY:300}]});
    assert(event(f,'touchmove',{touches:[{clientX:500,clientY:380}]},30).prevented);
    page.frame(0);held(f,'Initial swipe');
    for(let i=0;!view.root.hidden&&i<100;i++){
      assert(event(f,'touchmove',{touches:[{clientX:500,clientY:400+i}]},30).prevented);
      page.frame(0);held(f,'Held swipe');
    }
    assert.equal(view.root.hidden,true);
    const visibleAfter=after(f);
    near(visibleAfter,f.returnAfter,'The reverse swipe reveals the measured reading pose');
    assert(event(f,'touchmove',{touches:[{clientX:500,clientY:550}]},30).prevented,'The original finger remains quarantined');
    event(f,'touchend',{touches:[]});
    event(f,'touchstart',{touches:[{clientX:500,clientY:300}]});
    const next=event(f,'touchmove',{touches:[{clientX:500,clientY:380}]},30);
    assert(!next.prevented,'A new swipe starts About navigation');
    page.scroll(page.window.scrollY-120-80);page.frames();
    assert(after(f)<visibleAfter-20);
  }

  // Auto-repeat from the key that started the reverse is not a new command.
  {
    const f=await fixture(1920,960,{returnAfter:280}),{page,view}=f;
    assert(event(f,'keydown',{key:'PageUp',repeat:false}).prevented);
    page.frame(0);held(f,'Initial key');
    for(let i=0;!view.root.hidden&&i<100;i++){
      assert(event(f,'keydown',{key:'PageUp',repeat:true},30).prevented);
      page.frame(0);held(f,'Key repeat');
    }
    assert.equal(view.root.hidden,true);
    const visibleAfter=after(f);
    near(visibleAfter,f.returnAfter,'Keyboard return reveals the same measured pose');
    assert(event(f,'keydown',{key:'PageUp',repeat:true},30).prevented,'Held key repeats remain consumed after reveal');
    event(f,'keyup',{key:'PageUp'});
    const next=event(f,'keydown',{key:'PageUp',repeat:false},30);
    assert(!next.prevented,'A new non-repeat keypress starts About navigation');
    page.scroll(page.window.scrollY-120-120);page.frames();
    assert(after(f)<visibleAfter-20);
  }

  // Reflow during the automatic return changes the anchor, not the amount of
  // About text that has already been consumed. Restoring outside the gate is
  // still ordinary history and must not replay the card transition.
  {
    const f=await fixture(1920,960,{returnAfter:280}),{page,view}=f;
    page.wheel(-960*2);page.frame(0);advance(page,150);
    page.layout(true);f.read.allowed=true;page.resize(1440,800);page.frames();
    held(f,'Return resize');assert.equal(view.root.hidden,true);assert.equal(page.raf.size,0);
    const restored=rendererPage(1440,800,{visualEnd:true,initialScroll:page.window.scrollY-200});
    await turn();restored.page.frames();
    assert.equal(restored.view.root.hidden,true,'History already inside About stays in About');
    assert.equal(restored.scrollAdjustments.length,0,'About history does not rebase to the Inspiration anchor');
  }
  console.log('Inspiration return checks passed: synchronized About glyph rebuild, exact readable landing, unchanged forward trigger, wheel/swipe/key quarantine, fresh-input release, resize/history and no idle clock.');
})().catch(error=>{console.error(error);process.exitCode=1;});
