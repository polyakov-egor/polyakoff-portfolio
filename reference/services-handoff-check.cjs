/* Actual Hero/About/Inspiration/Works clock plus the oversized Services panel.
   Native history jumps bypass category input so every handoff pose can be
   sampled deterministically without inventing a second animation driver. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {fixture}=require('./inspiration-closing-check.cjs');
const {turn,near}=require('./scroll-check.cjs');
const source=fs.readFileSync(path.join(__dirname,'../services-scroll.js'),'utf8');
const y=root=>Number(root.style.getPropertyValue('--services-scroll-y').replace('px',''));
const roundedNear=(actual,expected,label)=>assert(Math.abs(actual-expected)<.003,`${label}: ${actual} != ${expected}`);

async function pageWithServices(width,height,naturalHeight){
  const f=fixture(width,height);await turn();f.page.frames();
  const {page}=f,root=page.document.createElement('section'),main=page.document.createElement('main');
  root.className='services';root.setAttribute('data-services','');main.append(root);
  let sectionHeight=naturalHeight,reads=0;
  Object.defineProperty(root,'offsetHeight',{get(){assert(f.read.allowed,'Only layout may read Services geometry');reads++;return sectionHeight;}});
  page.nodes['[data-services]']=root;
  const visible=[];page.window.ServicesScreens={get:element=>element===root?{setVisible:value=>visible.push(value)}:null};
  vm.runInContext(source,page.context,{filename:'services-scroll.js'});page.frames();
  return {...f,services:root,main,visible,get reads(){return reads;},setHeight:value=>sectionHeight=value};
}
function jump(f,distance){
  f.read.allowed=true;f.page.layout(true);
  f.page.window.dispatchEvent({type:'pageshow',persisted:true});f.page.scroll(distance);f.page.frames();
  f.read.allowed=false;f.page.layout(false);
}

(async()=>{
  for(const [width,height,sectionHeight]of[[375,812,1230],[768,1024,1300],[1440,800,1172],[1920,960,1390],[2560,1305,1460]]){
    const f=await pageWithServices(width,height,sectionHeight),{page,services}=f;
    const worksStart=Number(page.hero.dataset.worksStart),worksTravel=Number(f.journey.dataset.totalTravel);
    const servicesStart=Number(page.hero.dataset.servicesStart);
    const entryGap=width<600?48:80;
    near(Number(services.dataset.servicesEntryGap),entryGap,'The responsive gap is measured once for this layout');
    roundedNear(servicesStart,worksStart+worksTravel-height+entryGap,'Services enters after a small extra gap at the final Works viewport');
    near(Number(services.dataset.servicesTravel),sectionHeight-height+entryGap,'The extra gap and remaining natural height extend the story exactly once');
    roundedNear(parseFloat(page.nodes['.hero-journey'].style.height),worksStart+worksTravel+sectionHeight+entryGap,'Budget includes natural Services height and the gap with exactly one shared viewport');
    assert.equal(services.parentElement,page.hero,'Enhanced Services shares the stable mobile/desktop viewport');

    jump(f,servicesStart-1);assert(services.inert);assert.equal(services.getAttribute('aria-hidden'),'true');
    for(const fraction of[0,.2,.5,.8,1]){
      const local=height*fraction;page.scroll(servicesStart+local);page.frames();
      near(y(services),height-local,'Entry follows native vertical displacement');
      assert.equal(services.inert,local<=0);
      assert.equal(services.getAttribute('aria-hidden'),String(local<=0));
      assert.equal(f.viewport.inert,local>=height,'The old canvas cannot receive taps once covered');
      assert.equal(page.hero.classList.contains('is-services-covered'),local>=height);
      assert.equal(page.raf.size,0,'A settled Services pose creates no extra RAF');
    }
    const reads=f.reads;
    for(const fraction of[.25,.5,.75,1]){
      const local=height+(sectionHeight-height)*fraction;page.scroll(servicesStart+local);page.frames();
      near(y(services),height-local,'Reading the complete panel remains native');
      assert(!services.inert);
    }
    near(y(services)+sectionHeight,height,'The final approach text can reach the viewport bottom');
    assert.equal(f.reads,reads,'No natural-height measurement happens during scrolling');
    for(const local of[height,.5*height,0,-1]){
      page.scroll(servicesStart+local);page.frames();near(y(services),Math.min(height,height-local),'Reverse traversal restores the same entry poses');
    }
    assert(services.inert);assert.equal(f.viewport.inert,false);
    assert.equal(f.visible.at(-1),false,'Leaving the chapter pauses its carousel RAF/input');

    // An earlier budget/section reflow while Services is visible must retain
    // the reader's progress rather than landing back in Works.
    jump(f,servicesStart+sectionHeight*.65);
    f.read.allowed=true;page.layout(true);f.setHeight(sectionHeight+90);
    page.window.dispatchEvent({type:'services:ready'});page.frames();
    const nextStart=Number(page.hero.dataset.servicesStart),nextHeight=sectionHeight+90;
    near(page.window.scrollY-120-nextStart,nextHeight*.65,'Natural-height reflow retains the Services reading position');
    assert.equal(page.raf.size,0);

    jump(f,nextStart+nextHeight*.95);
    assert(f.viewport.inert,'The reduced-motion toggle starts with a covered inert Works viewport');
    f.read.allowed=true;page.layout(true);
    page.reduced.matches=true;page.reduced.dispatchEvent({type:'change'});page.frames();
    assert.equal(services.parentElement,f.main,'Reduced motion restores the actual normal-flow section');
    assert(!services.inert);assert.equal(services.getAttribute('aria-hidden'),'false');
    assert.equal(f.viewport.inert,false,'Static Works must not inherit the covered chapter input lock');
    near(Number(services.dataset.servicesTravel),0,'Static flow is not included twice in the pinned budget');
    page.reduced.matches=false;page.reduced.dispatchEvent({type:'change'});page.frames();
    assert.equal(services.parentElement,page.hero,'Re-enabling motion returns to the shared stable viewport');
    jump(f,Number(page.hero.dataset.servicesStart)+height*.5);
    assert.equal(f.viewport.inert,false,'The shared Works viewport becomes interactive on reverse/partial re-entry');
  }
  console.log('Services handoff checks passed: final-Works overlap, full natural content, reversible native poses, hidden input/RAF gate, covered-canvas exclusion, cached geometry, reflow anchor and reduced-motion flow.');
})().catch(error=>{console.error(error);process.exitCode=1;});
