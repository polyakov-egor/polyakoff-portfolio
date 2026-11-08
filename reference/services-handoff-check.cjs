/* Actual Hero/About/Inspiration/Works clock plus Services and the site footer.
   Native history jumps bypass category input so every handoff pose can be
   sampled deterministically without inventing a second animation driver. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {fixture,advance}=require('./inspiration-closing-check.cjs');
const {turn,near}=require('./scroll-check.cjs');
const source=fs.readFileSync(path.join(__dirname,'../services-scroll.js'),'utf8');
const serviceStyle=fs.readFileSync(path.join(__dirname,'../services-scroll.css'),'utf8');
const worksStyle=fs.readFileSync(path.join(__dirname,'../works-scroll.css'),'utf8');
const styleNumber=(node,name)=>parseFloat(node.style.getPropertyValue(name));
const y=root=>styleNumber(root,'--services-scroll-y');
const footerY=footer=>styleNumber(footer,'--site-footer-scroll-y');
const introLead=(width,height)=>height*(width<600?1.55:1.3);
const roundedNear=(actual,expected,label)=>assert(Math.abs(actual-expected)<.003,`${label}: ${actual} != ${expected}`);

async function pageWithServices(width,height,naturalHeight,naturalFooterHeight=0){
  const f=fixture(width,height);await turn();f.page.frames();
  const {page}=f,root=page.document.createElement('section'),main=page.document.createElement('main');
  root.className='services';root.setAttribute('data-services','');main.append(root);
  const header=page.document.createElement('header'),heading=page.document.createElement('h2');
  const deck=page.document.createElement('div');
  header.className='services__header';heading.className='services__heading';
  deck.className='services__deck';deck.setAttribute('data-services-deck','');
  header.append(heading);root.append(header,deck);
  const headingTop=width<600?191:width<1024?150:width<1680?120:220;
  const headingHeight=Math.min(width<600?64:width<1680?96:128,height*.2);
  const headingCenter=headingTop+headingHeight/2;
  const deckTop=headingTop+headingHeight+Math.min(width<600?80:width<1680?90:140,height*.12);
  const deckHeight=Math.min(width<600?310:width<1680?400:420,height*.43);
  let sectionHeight=naturalHeight,footerHeight=naturalFooterHeight,reads=0;
  function geometry(node,property,value){
    Object.defineProperty(node,property,{get(){assert(f.read.allowed,'Only layout may read Services geometry');reads++;return value();}});
  }
  geometry(root,'offsetHeight',()=>sectionHeight);
  geometry(heading,'offsetTop',()=>headingTop);geometry(heading,'offsetHeight',()=>headingHeight);
  geometry(deck,'offsetTop',()=>deckTop);geometry(deck,'offsetHeight',()=>deckHeight);
  page.nodes['[data-services]']=root;
  const footer=naturalFooterHeight?page.document.createElement('footer'):null;
  const backdrop=footer?page.document.createElement('div'):null;
  const background=footer?page.document.createElement('img'):null;
  if(footer){
    const card=page.document.createElement('div'),wordmark=page.document.createElement('picture');
    card.className='site-footer__card';wordmark.className='site-footer__wordmark';
    footer.className='site-footer';footer.setAttribute('data-site-footer','');main.append(footer);
    footer.prepend=node=>footer.insertBefore(node,footer.children[0]);
    background.setAttribute('data-site-footer-background','');footer.append(background,wordmark,card);
    geometry(footer,'offsetHeight',()=>footerHeight);
    geometry(card,'offsetTop',()=>footerHeight*.7);
    geometry(wordmark,'offsetTop',()=>footerHeight*.6);
    page.nodes['[data-site-footer]']=footer;
    page.nodes['[data-site-backdrop]']=backdrop;
  }
  const visible=[];page.window.ServicesScreens={get:element=>element===root?{setVisible:value=>visible.push(value)}:null};
  vm.runInContext(source,page.context,{filename:'services-scroll.js'});page.frames();
  return {...f,services:root,deck,deckTop,deckHeight,headingCenter,footer,backdrop,background,main,visible,get reads(){return reads;},
    setHeight:value=>sectionHeight=value,setFooterHeight:value=>footerHeight=value};
}
function jump(f,distance){
  f.read.allowed=true;f.page.layout(true);
  f.page.window.dispatchEvent({type:'pageshow',persisted:true});f.page.scroll(distance);f.page.frames();
  f.read.allowed=false;f.page.layout(false);
}
function send(f,type,properties={}){
  const event={type,target:{closest:()=>null},preventDefault(){this.defaultPrevented=true;},defaultPrevented:false,...properties};
  f.page.window.dispatchEvent(event);
  return event;
}

(async()=>{
  const introLayer=Number(/\.hero > \.services\.services-is-intro\s*\{[^}]*z-index:\s*(\d+)/.exec(serviceStyle)?.[1]);
  const worksLayer=Number(/\.hero > \.works-viewport\.works-is-enhanced\s*\{[^}]*z-index:\s*(\d+)/.exec(worksStyle)?.[1]);
  assert(introLayer<worksLayer,'The incoming Services title is painted below the last Works card');
  for(const [width,height,sectionHeight]of[[375,812,1230],[768,1024,1300],[1280,560,1172],[1440,800,1172],[1920,960,1390],[2560,1305,1460]]){
    const f=await pageWithServices(width,height,sectionHeight),{page,services,deck,deckTop,deckHeight,headingCenter}=f;
    const worksStart=Number(page.hero.dataset.worksStart),worksTravel=Number(f.journey.dataset.totalTravel);
    const start=Number(page.hero.dataset.servicesStart),intro=introLead(width,height),clear=start+intro;
    const fade=height*.55;
    const centeredY=height/2-headingCenter,readingTravel=sectionHeight+centeredY-height;
    const openingTravel=Number(services.dataset.servicesOpeningTravel);
    const opacity=()=>styleNumber(services,'--services-heading-opacity');
    const reveal=()=>styleNumber(services,'--services-reveal-progress');
    const deckY=()=>y(services)+deckTop+styleNumber(services,'--services-deck-entry-y');
    near(Number(services.dataset.servicesIntroTravel),intro,'The title has a responsive lead under the final Works cards');
    roundedNear(clear,worksStart+worksTravel,'Services begins moving as the last card clears');
    near(Number(services.dataset.servicesTravel),readingTravel,'Only the native reading distance extends the story');
    roundedNear(parseFloat(page.nodes['.hero-journey'].style.height),clear+height+readingTravel,'Overlap does not add a blank scroll interval');
    assert.equal(services.parentElement,page.hero,'Enhanced Services shares the stable mobile/desktop viewport');

    jump(f,start-1);assert(services.inert);assert.equal(services.getAttribute('aria-hidden'),'true');
    near(opacity(),0,'The title is hidden before its reveal begins');
    let previousOpacity=0;
    for(const fraction of[.2,.5,.8,.99]){
      page.scroll(start+fade*fraction);page.frames();
      near(y(services)+headingCenter,height/2,'The fading heading stays at the viewport center');
      assert(opacity()>previousOpacity,'The centered title becomes progressively visible');
      near(reveal(),0,'Pagination and glow remain hidden throughout the Works overlap');
      previousOpacity=opacity();
      assert(services.classList.contains('services-is-intro'));
      assert(!services.inert);
      assert(deck.inert&&deckY()>height,'The deck is kept below the fold and cannot intercept input during the reveal');
      assert.equal(f.visible.at(-1),false,'The deck renderer sleeps behind the final Works frame');
      assert.equal(f.viewport.inert,false,'Works remains the interactive top layer through its final card');
      assert.equal(page.raf.size,0,'A settled Services pose creates no extra RAF');
    }
    page.scroll(start+fade+height*.06);page.frames();
    near(opacity(),1,'The heading is fully legible while Works is still finishing');
    near(y(services)+headingCenter,height/2,'The full-opacity heading holds at center until Works clears');
    assert(services.classList.contains('services-is-intro')&&deck.inert&&!f.viewport.inert);
    const progress=Number(f.journey.dataset.helixProgress);
    const cards=page.window.WorksGallery.getProjectedCardBounds(progress);
    assert(cards.some(card=>card.maxX>0&&card.minX<width&&card.maxY>0&&card.minY<height),
      'An actual Works card is still on screen when the title reaches full opacity');
    jump(f,clear-35);
    assert(!f.wheel(180,500).prevented,'The gesture that clears Works remains native up to the heading stop');
    page.frame();
    for(let i=0;i<15&&services.dataset.servicesStage!=='center';i++){f.wheel(8,16);page.frame(0);}
    assert.equal(services.dataset.servicesStage,'center','The last work leaves a settled center title');
    assert(f.wheel(5,16).prevented,'The old gesture cannot launch the deck');
    page.frames();
    roundedNear(y(services),centeredY,'The heading stays centered after the final card');
    near(opacity(),1,'The title stays fully visible');
    near(reveal(),0,'The settled title has no glow or pagination');
    assert(!services.classList.contains('services-is-intro'));
    assert(deck.inert&&deckY()>height,'The deck does not pop into the viewport at the boundary');
    assert(f.viewport.inert&&page.hero.classList.contains('is-services-covered'),'Works cannot intercept input after the final card');

    assert(f.wheel(120,500).prevented,'One fresh gesture starts timed entry');
    page.frame(0);advance(page,250);
    assert.equal(services.dataset.servicesStage,'opening');
    roundedNear(y(services),centeredY-openingTravel*.875,'Cubic ease-out covers 87.5% of the entry in 250 ms');
    assert(reveal()>0&&reveal()<1&&deck.inert,'Pagination and glow follow the timed entry while card input waits');
    roundedNear(page.window.scrollY-120,clear,'Native distance cannot scrub the timed entry');
    page.scroll(clear+openingTravel*2);page.frame(0);
    roundedNear(page.window.scrollY-120,clear,'A delayed native momentum tick is rebased');
    advance(page,225);
    assert.equal(services.dataset.servicesStage,'opening');
    assert(f.wheel(44,16).prevented,'An additional gesture during the animation is consumed');
    advance(page,9);
    assert.equal(services.dataset.servicesStage,'open','The deck settles after 500 ms');
    assert(f.wheel(12,16).prevented,'The opening gesture tail cannot continue past the composed frame');
    page.frames();
    assert.equal(services.dataset.servicesStage,'open');
    near(reveal(),1,'Pagination and glow are visible at the complete frame');
    assert(!deck.inert&&deckY()+deckHeight<=height-50,'The entire active card fits above the footer at the first stop');
    roundedNear(y(services),centeredY-openingTravel,'The deck and header settle to the actual native pose');
    roundedNear(page.window.scrollY-120,clear+openingTravel,'The first step has exactly one native landing');
    assert.equal(f.visible.at(-1),true,'The visible deck wakes its carousel');

    const cardTarget={closest:selector=>selector.includes('button')?deck:null};
    assert(f.wheel(-120,500,{target:cardTarget}).prevented,'Reverse can begin over the card button');
    page.frame(0);advance(page,250);
    assert.equal(services.dataset.servicesStage,'closing');
    roundedNear(y(services),centeredY-openingTravel*.125,'Cubic ease-out covers 87.5% of the return in 250 ms');
    advance(page,249);
    assert.equal(services.dataset.servicesStage,'closing','The return remains active until 500 ms');
    advance(page,2);
    assert.equal(services.dataset.servicesStage,'center','The return settles at 500 ms');
    page.frames();
    assert.equal(services.dataset.servicesStage,'center');
    near(reveal(),0,'Reverse fully restores the plain heading');
    assert(!f.wheel(-80,500).prevented,'The next reverse gesture returns to Works');
    page.frames();
    assert(!f.viewport.inert&&services.classList.contains('services-is-intro'));

    jump(f,clear+openingTravel);
    assert.equal(services.dataset.servicesStage,'open','History can restore the composed frame');
    assert(!f.wheel(55,500).prevented,'A fresh scroll after the composed frame continues natively');
    page.frames();
    roundedNear(y(services),centeredY-openingTravel-55,'Native continuation starts at the same pose');
    const reads=f.reads;
    for(const fraction of[.25,.5,.75,1]){
      const after=openingTravel+(readingTravel-openingTravel)*fraction;page.scroll(clear+after);page.frames();
      roundedNear(y(services),centeredY-after,'Reading the complete panel remains native');
      assert(!services.inert);
    }
    near(y(services)+sectionHeight,height,'The final approach text can reach the viewport bottom');
    assert.equal(f.reads,reads,'No natural-height measurement happens during scrolling');
    jump(f,start+fade*.5);
    near(opacity(),.5,'History restoration keeps the earlier Works overlap reversible');
    jump(f,start-1);
    assert(services.inert);assert.equal(f.viewport.inert,false);
    assert.equal(f.visible.at(-1),false,'Leaving the chapter pauses its carousel RAF/input');

    jump(f,clear+readingTravel*.65);
    f.read.allowed=true;page.layout(true);f.setHeight(sectionHeight+90);
    page.window.dispatchEvent({type:'services:ready'});page.frames();
    const nextStart=Number(page.hero.dataset.servicesStart),nextReading=readingTravel+90;
    roundedNear(page.window.scrollY-120-nextStart,intro+nextReading*.65,'Natural-height reflow retains the Services reading position');
    assert.equal(page.raf.size,0);

    jump(f,nextStart+intro+nextReading*.95);
    assert(f.viewport.inert,'The reduced-motion toggle starts with a covered inert Works viewport');
    f.read.allowed=true;page.layout(true);
    page.reduced.matches=true;page.reduced.dispatchEvent({type:'change'});page.frames();
    assert.equal(services.parentElement,f.main,'Reduced motion restores the actual normal-flow section');
    assert(!services.inert);assert.equal(services.getAttribute('aria-hidden'),'false');
    assert(!deck.inert,'The reduced-motion carousel keeps its normal-flow input');
    assert.equal(f.viewport.inert,false,'Static Works must not inherit the covered chapter input lock');
    near(Number(services.dataset.servicesTravel),0,'Static flow is not included twice in the pinned budget');
    page.reduced.matches=false;page.reduced.dispatchEvent({type:'change'});page.frames();
    assert.equal(services.parentElement,page.hero,'Re-enabling motion returns to the shared stable viewport');
    jump(f,Number(page.hero.dataset.servicesStart)+intro*.5);
    assert.equal(f.viewport.inert,false,'The shared Works viewport becomes interactive on reverse/partial re-entry');

    if(width<600){
      const currentClear=Number(page.hero.dataset.servicesStart)+intro;
      jump(f,currentClear+openingTravel*.1);
      assert.equal(services.dataset.servicesStage,'center','History inside the animation restores a complete stop');
      send(f,'touchstart',{touches:[{clientX:100,clientY:200}]});
      assert(send(f,'touchmove',{touches:[{clientX:100,clientY:175}]}).defaultPrevented,'A vertical touch starts timed entry');
      page.frame(0);advance(page,750);page.frames();
      assert.equal(services.dataset.servicesStage,'open');
      assert(send(f,'touchmove',{touches:[{clientX:100,clientY:160}]}).defaultPrevented,'The original finger cannot scroll past its landing');
      send(f,'touchend',{touches:[]});
      send(f,'touchstart',{touches:[{clientX:100,clientY:200}]});
      assert(!send(f,'touchmove',{touches:[{clientX:100,clientY:196}]}).defaultPrevented,'The first move of a fresh native exit swipe is never cancelled');
      send(f,'touchend',{touches:[]});
    }else if(width===1920){
      const currentClear=Number(page.hero.dataset.servicesStart)+intro;
      jump(f,currentClear);
      assert(send(f,'keydown',{key:'PageDown'}).defaultPrevented,'PageDown triggers a complete deck entry');
      page.frame(0);advance(page,100);
      assert(!send(f,'keydown',{key:'End'}).defaultPrevented,'End can bypass a running Services hold');
      page.scroll(currentClear+nextReading);page.frames();
      assert.equal(services.dataset.servicesStage,'native','An old animation cannot recapture End');
    }
  }
  for(const [width,height,sectionHeight,footerHeight]of[[375,812,1230,812],[768,1024,1300,1100],[1920,960,1390,960]]){
    const f=await pageWithServices(width,height,sectionHeight,footerHeight),{page,services,footer,backdrop,background}=f;
    const reveal=()=>Number(backdrop.style.getPropertyValue('--site-footer-reveal'));
    const cardShift=()=>styleNumber(footer,'--site-footer-card-shift');
    const cardOffset=()=>styleNumber(footer,'--site-footer-card-offset');
    const cardOpacity=()=>styleNumber(footer,'--site-footer-card-opacity');
    const cardY=()=>footerY(footer)+footerHeight*.7+cardShift();
    const wordmarkOpacity=()=>styleNumber(footer,'--site-footer-wordmark-opacity');
    const wordmarkFilter=()=>footer.style.getPropertyValue('--site-footer-wordmark-filter');
    const start=Number(page.hero.dataset.servicesStart),intro=introLead(width,height);
    const readingTravel=sectionHeight+height/2-f.headingCenter-height;
    const footerStart=start+intro+readingTravel;
    const finish=footerStart+footerHeight;
    roundedNear(parseFloat(page.nodes['.hero-journey'].style.height)-height,finish,'The footer extends the native budget by its natural height exactly once');
    assert.equal(footer.parentElement,page.hero,'The footer shares the pinned mobile and desktop viewport');
    assert.equal(background.parentElement,backdrop,'The footer art joins the fixed global background');
    assert(footer.classList.contains('site-footer-is-shared'));

    jump(f,footerStart-1);
    near(footerY(footer),height,'The footer waits just below Services');
    near(cardY(),height+40,'The card starts with an extra 40 px lift below the viewport');
    near(cardOffset(),1,'The card starts at the full tilt and scale offset');
    near(cardOpacity(),0,'The card starts transparent');
    near(reveal(),0,'The fixed footer art is hidden during Services');
    assert(footer.inert);assert.equal(footer.getAttribute('aria-hidden'),'true');
    const reads=f.reads;
    page.scroll(footerStart+footerHeight*.12);page.frames();
    const entryPose=[cardShift(),cardOffset(),cardOpacity()];
    assert(cardY()<height&&cardOffset()>.5,'The card is visible while it still has more than half of the starting tilt');
    roundedNear(cardOffset(),.88**5,'Card tilt and scale follow the form entrance easing');
    roundedNear(cardOpacity(),1-(1-.12/.45)**5,'Card opacity finishes faster than the tilt');
    page.scroll(footerStart+height*.4);page.frames();
    near(footerY(footer),y(services)+sectionHeight,'Footer starts where Services ends');
    near(reveal(),.4,'The fixed footer art reveals with the visible fraction');
    assert(!services.inert);assert(!footer.inert);
    assert(footer.classList.contains('site-footer-is-visible'));
    const earlyCardY=cardY();
    assert(earlyCardY<height&&wordmarkOpacity()===0,'The card enters with the footer while the wordmark waits out of sight');
    page.scroll(footerStart+footerHeight*.8);page.frames();
    const wordmarkPose=[wordmarkOpacity(),wordmarkFilter()];
    assert(cardY()<earlyCardY&&cardY()>height-footerHeight*.3,'The card slides toward its final position');
    near(cardOpacity(),1,'The card is fully opaque before it settles');
    near(wordmarkOpacity(),.5,'The wordmark fades in as it comes into view');
    assert.match(wordmarkFilter(),/^blur\([\d.]+px\)$/,'The incoming wordmark is blurred');

    for(const distance of[finish,finish+125]){
      page.scroll(distance);page.frames();
      near(footerY(footer)+footerHeight,height,'The final footer frame stays aligned through end-of-page overscroll');
      near(reveal(),1,'The final footer variant is fully shown');
      near(cardShift(),0,'The card settles into its layout position');
      near(cardOffset(),0,'The card settles upright at its full size');
      near(cardOpacity(),1,'The card remains fully opaque at rest');
      near(wordmarkOpacity(),1,'The wordmark ends at full opacity');
      assert.equal(wordmarkFilter(),'none','No blur remains on the settled wordmark');
      assert(services.inert);assert(!footer.inert);
      assert(page.hero.classList.contains('is-services'),'Shared date and navigation remain above the footer');
      assert(f.viewport.inert,'Works stays excluded from input throughout the footer');
      assert.equal(f.visible.at(-1),false,'Services carousel is paused behind the footer');
    }
    page.scroll(footerStart+footerHeight*.8);page.frames();
    assert.deepEqual([wordmarkOpacity(),wordmarkFilter()],wordmarkPose,'Reverse scrolling restores the same wordmark pose');
    page.scroll(footerStart+footerHeight*.12);page.frames();
    assert.deepEqual([cardShift(),cardOffset(),cardOpacity()],entryPose,'Reverse scrolling restores the same card pose');
    page.scroll(footerStart-1);page.frames();
    assert(footer.inert);assert(!services.inert);
    near(reveal(),0,'Reverse scroll restores the previous dark art');
    assert.equal(f.reads,reads,'Scrolling across the footer seam never reads layout geometry');

    jump(f,footerStart+footerHeight*.65);
    f.read.allowed=true;page.layout(true);f.setHeight(sectionHeight+75);f.setFooterHeight(footerHeight+140);
    page.window.dispatchEvent({type:'services:ready'});page.frames();
    const nextStart=Number(page.hero.dataset.servicesStart);
    roundedNear(page.window.scrollY-120-nextStart,intro+readingTravel+75+(footerHeight+140)*.65,'Footer preserves the reading position through Services and footer reflow');
    assert.equal(page.raf.size,0);

    page.reduced.matches=true;page.reduced.dispatchEvent({type:'change'});page.frames();
    assert.deepEqual(f.main.children,[services,footer],'Reduced motion restores Services and footer in natural order');
    assert.equal(footer.children[0],background,'The same art returns to the static footer');
    assert.equal(backdrop.style.getPropertyValue('--site-footer-reveal'),'','Reduced motion clears the fixed footer art reveal');
    assert.equal(footer.style.getPropertyValue('--site-footer-card-shift'),'');
    assert.equal(footer.style.getPropertyValue('--site-footer-card-offset'),'');
    assert.equal(footer.style.getPropertyValue('--site-footer-card-opacity'),'');
    assert.equal(footer.style.getPropertyValue('--site-footer-wordmark-opacity'),'');
    assert.equal(wordmarkFilter(),'');
    assert(!footer.inert);assert.equal(footer.getAttribute('aria-hidden'),'false');
    assert(!footer.classList.contains('site-footer-is-shared'));
    near(Number(services.dataset.servicesTravel),0,'The normal-flow footer is not included in the reduced-motion pinned budget');
  }
  console.log('Services and footer handoff checks passed: plain center title under Works, one-gesture timed deck entry, responsive full-card landing, native continuation, reverse and restored poses, cached geometry and reduced-motion flow.');
})().catch(error=>{console.error(error);process.exitCode=1;});
