/* Real Hero/chapters, not a second imitation of wheel intent. Trackpads can
   start a new acceleration before their preceding momentum becomes silent. */
const assert=require('node:assert/strict');
const {fixture:closingFixture,enter,advance}=require('./inspiration-closing-check.cjs');
const {rendererPage}=require('./inspiration-check.cjs');
const {turn,near}=require('./scroll-check.cjs');

const chapterStart=f=>Number(f.page.hero.dataset.inspirationStart);
const local=f=>f.page.window.scrollY-120-chapterStart(f);
const burst=(wheel,direction=1)=>[7,24,48,64,40,20].map((delta,index)=>wheel(delta*direction,index===0?100:16));
const tail=wheel=>[20,12,8,4,2,1].map(delta=>wheel(delta,16));

async function centered(width=1920,height=960){
  const f=closingFixture(width,height);await turn();f.page.frames();enter(f);
  assert(f.page.window.SiteWheelIntent,'The real shared intent dependency is installed');
  for(const expected of ['02','03']){
    f.wheel(120,230);f.page.frame(0);advance(f.page,1200);f.page.frames();
    assert.equal(f.view.index.textContent,expected);
  }
  f.wheel(height*2,230);
  for(let i=0;f.root.dataset.locked!=='true'&&i<90;i++)f.wheel(80,40);
  assert.equal(f.root.dataset.locked,'true');
  near(local(f),height*3-2,'The merge stops at the visible centered heading');
  tail(f.wheel);
  return f;
}

async function returned(width=1920,height=960,{newBurstDuringReturn=false}={}){
  const f=rendererPage(width,height,{visualEnd:true,worksTravel:height*8});
  await turn();f.page.frames();
  const start=chapterStart(f);
  f.page.scroll(start-1);f.page.frames();f.page.scroll(start+10);f.page.frame();f.page.frames();
  assert.equal(f.view.index.textContent,'01');
  f.page.wheel(-120,230);f.page.frame(0);
  assert.equal(f.view.root.dataset.flipRunning,'true');
  const after=f.page.flightUpdates.at(-1).after;
  if(newBurstDuringReturn){
    for(const delta of [-40,-20,-10,-5,-2,-1])assert(f.page.wheel(delta,30).prevented);
    assert(burst(f.page.wheel,-1).every(event=>event.prevented),'A fresh intent during the return is spent on the covered screen');
  }
  for(let i=0;f.view.root.dataset.returnGate!=='waiting'&&i<100;i++){
    assert(f.page.wheel(-1,20).prevented,'The return tail cannot rewind hidden About');
    assert(f.page.flightUpdates.at(-1).after>=after-.5,'About keeps its endpoint behind the returning card');
  }
  assert.equal(f.view.root.dataset.returnGate,'waiting');
  assert.equal(f.view.root.hidden,true);
  near(local(f),-1,'The returned About begins exactly at its own endpoint');
  for(const delta of [-8,-4,-2,-1])assert(f.page.wheel(delta,16).prevented);
  return f;
}

(async()=>{
  // Neither the category handler nor a noisy sign reversal can spend the same
  // closing gesture twice. Renewed trackpad acceleration needs no220ms gap.
  for(const[width,height]of[[375,812],[1920,960]])for(const direction of [1,-1]){
    const f=await centered(width,height),before=f.page.window.scrollY;
    assert(f.wheel(-.1,16).prevented,'A tiny negative tail cannot bypass the merge checkpoint');
    assert(f.wheel(100,16).prevented,'One isolated momentum spike does not count as a new gesture');
    assert(f.wheel(1,16).prevented);
    near(f.page.window.scrollY,before,'The old burst never enters the title roll');
    const events=burst(f.wheel,direction);
    assert(events[0].prevented,'A single rising sample is still quarantined');
    if(direction>0){
      assert(events.slice(1).some(event=>!event.prevented),'Confirmed forward intent releases the same trackpad burst');
      f.page.frame(100);
      assert(Number(f.root.dataset.morphProgress)>0&&Number(f.root.dataset.morphProgress)<1,
        'The released burst starts the timed title before 220ms');
      assert(local(f)>height*3,'The gesture that starts the title also moves native scroll');
      assert(f.viewport.classList.contains('works-is-preview')||f.page.hero.classList.contains('is-works'),
        'Works starts moving during the same title change');
      assert(!f.wheel(height*.5,16).prevented,'The remaining burst can continue into Works');
      f.page.frames();
      assert.equal(f.root.dataset.morphProgress,'1.00000');
      assert.equal(f.root.dataset.locked,'false','The creation title adds no second scroll checkpoint');
      assert(f.page.hero.classList.contains('is-works'),'The same renewed burst advances into Works');
    }else{
      assert(events.some(event=>!event.prevented),'A deliberate reverse releases native scroll');
      f.page.frames();
      assert.equal(f.root.dataset.locked,'false');
      assert(local(f)<height*3-8,'A deliberate reversed burst traverses the merge backward');
    }
  }

  // New intent is directional: tiny opposite samples cannot borrow the
  // accumulated displacement of a deliberate same-direction gesture.
  {
    const f=await centered();
    assert(f.wheel(8,230).prevented);
    assert(f.wheel(-.1,16).prevented);
    assert(f.wheel(8,16).prevented);
    assert(f.wheel(8,16).prevented);
    assert(!f.wheel(8,16).prevented,'The event completing the clean 24px intent starts the title and scrolls natively');
    f.page.frame(100);
    assert(Number(f.root.dataset.morphProgress)>0);
    assert(local(f)>960*3,'Small confirmed trackpad movement reaches the shared entrance');
  }

  // About and Inspiration are separate consumers. A newly recognized gesture
  // during the automatic return cannot be saved up for the hidden About.
  for(const[width,height]of[[375,812],[1920,960]])for(const direction of [-1,1]){
    const f=await returned(width,height,{newBurstDuringReturn:true}),before=f.page.flightUpdates.at(-1).after;
    for(let i=0;i<8;i++)assert(f.page.wheel(-1,16).prevented,'Residual input after reveal is still the consumed return intent');
    near(local(f),-1,'Residual input never changes hidden/about native progress');
    const events=burst(f.page.wheel,direction);
    assert(events[0].prevented);
    assert(events.some(event=>!event.prevented),'A new acceleration after About is visible owns its new displacement');
    if(direction<0){
      f.page.frames();
      assert(local(f)<-20);assert(f.page.flightUpdates.at(-1).after<before-5);
      assert.equal(f.view.root.hidden,true);
      assert.equal(f.view.root.dataset.returnGate,'none');
    }else{
      f.page.frame(0);
      assert.equal(f.view.root.dataset.flipRunning,'true','Forward intent starts just the portrait-to-People entrance');
      advance(f.page,2400);f.page.frames();
      assert.equal(f.view.index.textContent,'01','Entry momentum cannot preselect Music');
      assert.equal(f.view.root.dataset.cardPosition,'0.00000');
    }
    assert(f.worksUpdates.every(distance=>distance<0),'Return/entry intent never reaches Works');
  }
  console.log('Trackpad boundary checks passed: renewed sub220ms bursts, shared title/Works entrance, tiny reverse/rogue spike rejection and About return quarantine.');
})().catch(error=>{console.error(error);process.exitCode=1;});
