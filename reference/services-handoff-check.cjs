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
const footerStyle=fs.readFileSync(path.join(__dirname,'../site-footer.css'),'utf8');
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
    const intro=page.document.createElement('div');
    card.className='site-footer__card';wordmark.className='site-footer__wordmark';
    intro.className='site-footer__intro';
    footer.className='site-footer';footer.setAttribute('data-site-footer','');main.append(footer);
    footer.prepend=node=>footer.insertBefore(node,footer.children[0]);
    background.setAttribute('data-site-footer-background','');footer.append(background,intro,wordmark,card);
    geometry(footer,'offsetHeight',()=>footerHeight);
    geometry(intro,'offsetTop',()=>footerHeight*(width===768?.70:.55));
    geometry(intro,'offsetHeight',()=>footerHeight*.06);
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
  assert.match(serviceStyle,/\.hero\.is-services-deck-overlap[^{}]+\.services__deck\s*\{\s*pointer-events: auto/,
    'The visible deck receives input without raising its paint layer');
  assert.match(serviceStyle,/\.hero\.is-services-deck-overlap[^{}]+\.works-gallery-canvas\s*\{\s*clip-path: inset/,
    'The canvas no longer captures pointer input in the transparent region below the works');
  assert.match(footerStyle,/\.site-footer-is-shared \.site-footer__card\s*\{[^}]*transform-origin: 50% 0%[^}]*perspective\(600px\) translateY\(calc\(40px \*[^}]*rotateX\(calc\(-20deg \*[^}]*scale\(calc\(1 - \.1 \*/s,
    'The footer card uses the Winline gallery translation, tilt, scale and perspective');
  for(const [width,height,sectionHeight]of[[375,812,1230],[768,1024,1300],[1280,560,1172],[1440,800,1172],[1920,960,1390],[2560,1305,1460]]){
    const f=await pageWithServices(width,height,sectionHeight),{page,services,deck,deckTop,deckHeight,headingCenter}=f;
    const worksStart=Number(page.hero.dataset.worksStart),worksTravel=Number(f.journey.dataset.totalTravel);
    const start=Number(page.hero.dataset.servicesStart),intro=introLead(width,height),clear=start+intro;
    const headingFrom=start+Number(services.dataset.servicesHeadingStart);
    const fade=Number(services.dataset.servicesHeadingFade);
    const centeredY=height/2-headingCenter,readingTravel=sectionHeight+centeredY-height;
    const openingTravel=Number(services.dataset.servicesOpeningTravel);
    const revealFrom=start+Number(services.dataset.servicesRevealStart),open=clear+openingTravel;
    const opacity=()=>styleNumber(services,'--services-heading-opacity');
    const reveal=()=>styleNumber(services,'--services-reveal-progress');
    const glow=()=>styleNumber(services,'--services-glow-progress');
    const deckY=()=>y(services)+deckTop+styleNumber(services,'--services-deck-entry-y');
    near(Number(services.dataset.servicesIntroTravel),intro,'The title has a responsive lead under the final Works cards');
    roundedNear(clear,worksStart+worksTravel,'Works keeps its original clear boundary');
    assert(headingFrom>start&&revealFrom<clear&&revealFrom>=headingFrom+fade-.003,'The later plain heading still fully appears before the deck reveal');
    near(Number(services.dataset.servicesTravel),readingTravel,'Only the native reading distance extends the story');
    roundedNear(parseFloat(page.nodes['.hero-journey'].style.height),clear+height+readingTravel,'Overlap does not add a blank scroll interval');
    assert.equal(services.parentElement,page.hero,'Enhanced Services shares the stable mobile/desktop viewport');

    jump(f,start-1);assert(services.inert);assert.equal(services.getAttribute('aria-hidden'),'true');
    near(opacity(),0,'The title is hidden before its reveal begins');
    page.scroll(headingFrom-1);page.frames();
    near(opacity(),0,'The title stays hidden until the last work reaches the later cue');
    const headingWork=page.window.WorksGallery.getProjectedMotionBounds(Number(f.journey.dataset.helixProgress)).at(-1);
    assert(Math.abs(headingWork.minY-height*.42)<3,'The title starts as the final Works card approaches center');
    let previousOpacity=0;
    for(const fraction of[.2,.5,.8,.99]){
      page.scroll(headingFrom+fade*fraction);page.frames();
      near(y(services)+headingCenter,height/2,'The fading heading stays at the viewport center');
      assert(opacity()>previousOpacity,'The centered title becomes progressively visible');
      near(reveal(),0,'Pagination and glow remain hidden before the deck reveal');
      near(glow(),0,'The plain heading has no glow before the deck reveal');
      previousOpacity=opacity();
      assert(services.classList.contains('services-is-intro'));
      assert(!services.inert);
      assert(deck.inert&&deckY()>=height-.003,'The deck starts at the viewport edge and cannot intercept input');
      assert.equal(f.visible.at(-1),false,'The deck renderer sleeps behind the final Works frame');
      assert.equal(f.viewport.inert,false,'Works remains the interactive top layer through its final card');
      assert.equal(page.raf.size,0,'A settled Services pose creates no extra RAF');
    }
    page.scroll(revealFrom-1);page.frames();
    near(opacity(),1,'The heading is fully legible as the last card reaches the cue');
    near(y(services)+headingCenter,height/2,'The plain heading stays centered until the last card reaches the cue');
    near(reveal(),0,'Pagination and glow are still hidden at the cue');
    assert(services.classList.contains('services-is-intro')&&deck.inert&&!f.viewport.inert);
    const progress=Number(f.journey.dataset.helixProgress);
    const lastCard=page.window.WorksGallery.getProjectedMotionBounds(progress).at(-1);
    assert(lastCard.minX<width&&lastCard.maxX>0&&Math.abs(lastCard.maxY-height*.15)<3,
      'The reveal is tied to the last projected card reaching the upper band');
    const overlap=(clear+revealFrom)/2;
    page.scroll(overlap);page.frames();
    assert(deckY()<height&&y(services)<centeredY&&!deck.inert,'The deck can be used while the final Works card departs');
    assert.equal(f.visible.at(-1),true,'The deck renderer wakes as soon as the cards enter view');
    assert(services.classList.contains('services-is-intro')&&!f.viewport.inert,'Works still paints above the rising deck');
    assert(page.hero.classList.contains('is-services-deck-overlap'));
    roundedNear(styleNumber(page.hero,'--services-overlap-clip'),height-deckY(),'The Works canvas hit area ends where the visible deck starts');
    assert(!f.wheel(clear-overlap+18,500).prevented,'The same wheel gesture may carry through the overlap');
    page.frames();
    roundedNear(page.window.scrollY-120,clear+18,'No checkpoint alters the native position');
    assert(!services.classList.contains('services-is-intro')&&f.viewport.inert,'Works stops receiving input only after it clears');

    const middle=(revealFrom+open)/2;
    page.scroll(middle);page.frames();
    const pose=[y(services),reveal(),glow(),deckY()];
    roundedNear(y(services),centeredY-openingTravel*.5,'Half the scrub distance moves the heading half way');
    assert(reveal()>0&&reveal()<1&&!deck.inert,'A partly open deck remains interactive before pagination is fully visible');
    near(glow(),1,'The visible deck reaches full heading glow before the opening completes');
    advance(page,600);
    assert.deepEqual([y(services),reveal(),glow(),deckY()],pose,'Stopping scroll pauses the deck at its intermediate pose');

    page.scroll(open);page.frames();
    near(reveal(),1,'Pagination and glow are visible at the complete frame');
    assert(!deck.inert&&deckY()+deckHeight<=height-50,'The entire active card fits above the footer at the composed frame');
    roundedNear(y(services),centeredY-openingTravel,'The composed frame aligns with native continuation');
    assert.equal(f.visible.at(-1),true,'The visible deck wakes its carousel');

    const cardTarget={closest:selector=>selector.includes('button')?deck:null};
    assert(!f.wheel(middle-open,500,{target:cardTarget}).prevented,'Reverse scroll remains native over the card button');
    page.frames();
    assert.deepEqual([y(services),reveal(),glow(),deckY()],pose,'Reverse restores the exact same intermediate pose');
    assert(!f.wheel(revealFrom-1-middle,500).prevented,'The next reverse gesture returns to Works');
    page.frames();
    near(reveal(),0,'Reverse fully restores the plain centered heading');
    assert(!f.viewport.inert&&services.classList.contains('services-is-intro'));

    jump(f,middle);
    assert.deepEqual([y(services),reveal(),glow(),deckY()],pose,'History restores the actual intermediate position');
    jump(f,open);
    assert(!f.wheel(55,500).prevented,'Scroll after the composed frame continues natively');
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
    jump(f,headingFrom+fade*.5);
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
      jump(f,Number(page.hero.dataset.servicesStart)+intro);
      send(f,'touchstart',{touches:[{clientX:100,clientY:200}]});
      assert(!send(f,'touchmove',{touches:[{clientX:100,clientY:175}]}).defaultPrevented,'A vertical swipe is native during reveal');
      send(f,'touchend',{touches:[]});
    }else if(width===1920){
      const currentClear=Number(page.hero.dataset.servicesStart)+intro;
      jump(f,currentClear);
      assert(!send(f,'keydown',{key:'PageDown'}).defaultPrevented,'PageDown stays native during reveal');
      assert(!send(f,'keydown',{key:'End'}).defaultPrevented,'End stays native during reveal');
      page.scroll(currentClear+nextReading);page.frames();
      roundedNear(page.window.scrollY-120,currentClear+nextReading,'No Services animation captures the End position');
    }
  }
  for(const [width,height,sectionHeight,footerHeight]of[[375,812,1230,812],[768,1024,1300,1100],[1920,960,1390,960]]){
    const f=await pageWithServices(width,height,sectionHeight,footerHeight),{page,services,footer,backdrop,background}=f;
    let smoothCancels=0;
    page.window.SiteSmoothScroll={usesSmoothedScroll:()=>true,cancel:()=>smoothCancels++};
    const reveal=()=>Number(backdrop.style.getPropertyValue('--site-footer-reveal'));
    const cardShift=()=>styleNumber(footer,'--site-footer-card-shift');
    const cardOffset=()=>styleNumber(footer,'--site-footer-card-offset');
    const cardOpacity=()=>styleNumber(footer,'--site-footer-card-opacity');
    const cardY=()=>footerY(footer)+footerHeight*.7+cardShift()+40*cardOffset();
    const cardRestY=height-footerHeight*.3;
    const wordmarkOpacity=()=>styleNumber(footer,'--site-footer-wordmark-opacity');
    const wordmarkFilter=()=>footer.style.getPropertyValue('--site-footer-wordmark-filter');
    const start=Number(page.hero.dataset.servicesStart),intro=introLead(width,height);
    const readingTravel=sectionHeight+height/2-f.headingCenter-height;
    const footerStart=start+intro+readingTravel;
    const finish=footerStart+footerHeight;
    const cardStart=footerStart+height*.4;
    roundedNear(parseFloat(page.nodes['.hero-journey'].style.height)-height,finish,'The footer extends the native budget by its natural height exactly once');
    assert.equal(footer.parentElement,page.hero,'The footer shares the pinned mobile and desktop viewport');
    assert.equal(background.parentElement,backdrop,'The footer art joins the fixed global background');
    assert(footer.classList.contains('site-footer-is-shared'));

    jump(f,footerStart-1);
    near(footerY(footer),height,'The footer waits just below Services');
    assert(cardY()>height,'The hidden card is below the viewport with the footer');
    near(cardOffset(),1,'The card starts at the full tilt and scale offset');
    near(cardOpacity(),0,'The card starts transparent');
    near(reveal(),0,'The fixed footer art is hidden during Services');
    assert(footer.inert);assert.equal(footer.getAttribute('aria-hidden'),'true');
    const reads=f.reads;
    page.scroll(footerStart+height*.2);page.frames();
    near(footerY(footer),y(services)+sectionHeight,'Footer starts where Services ends');
    near(reveal(),.2,'The fixed footer art reveals with the visible fraction');
    assert(!services.inert);assert(!footer.inert);
    assert(footer.classList.contains('site-footer-is-visible'));
    near(cardOpacity(),0,'The card stays hidden when the footer first enters');
    page.scroll(cardStart-1);page.frames();
    near(cardOpacity(),0,'The card waits until the footer reaches the 60% viewport line');
    assert.equal(page.raf.size,0,'The shared clock sleeps just before the reveal');
    const beforeTriggerY=cardY();
    const cancelsBeforeEntry=smoothCancels;
    page.scroll(cardStart+1);page.frame(0);
    near(cardOpacity(),0,'The entry threshold starts the card at the first pose');
    assert(Math.abs(cardY()-beforeTriggerY)<.05,'The position compensation eases continuously across the trigger');
    roundedNear(cardY(),cardRestY+40,'The Winline motion starts 40px below the settled card position');
    assert(page.raf.size>0,'The card keeps the shared clock awake while scroll stands still');
    advance(page,109);
    near(cardOpacity(),0,'The Winline reveal preserves its 110ms delay');
    near(cardOffset(),1,'The card stays in the starting pose during the delay');
    advance(page,66);
    roundedNear(cardOffset(),(.95)**5,'The turn uses the Winline power4.out curve');
    roundedNear(cardOpacity(),1-(1-65/585)**5,'The parallel Winline fade uses its own power4.out curve');
    assert.equal(footer.style.getPropertyValue('--site-footer-card-filter'),'','The reveal never applies a foreground filter to the card');
    if(width===1920){
      const entryPose=[cardOffset(),cardOpacity()];
      page.scroll(footerStart-1);page.frame(0);
      assert.deepEqual([cardOffset(),cardOpacity()],entryPose,'An interrupted entry keeps its current pose');
      assert(!footer.classList.contains('site-footer-is-visible'),'The footer can leave the viewport during playback');
      assert(page.raf.size>0,'Leaving during playback does not cancel the reveal');
      advance(page,100);
      assert(cardOpacity()>entryPose[1]&&cardOffset()<entryPose[0],'The same reveal keeps playing offscreen');
      page.scroll(cardStart+1);page.frame(0);
      advance(page,420);
    }else advance(page,520);
    near(cardOpacity(),1,'The fade reaches full opacity 585ms into the animation');
    roundedNear(cardOffset(),.55**5,'The movement continues past the fade');
    advance(page,714);
    assert(page.raf.size>0,'The opening timeline runs for 1300ms after the delay');
    advance(page,2);
    near(cardOffset(),0,'The card opens fully without further scrolling');
    near(cardOpacity(),1,'The card is fully opaque at the opening endpoint');
    near(page.window.scrollY-120,cardStart+1,'The card does not move or pin the scroll position');
    assert.equal(smoothCancels,cancelsBeforeEntry,'The footer motion never cancels smooth scrolling');
    assert.equal(page.raf.size,0,'The shared clock sleeps once the footer stops animating');
    page.scroll(footerStart+footerHeight*.8);page.frames();
    const wordmarkPose=[wordmarkOpacity(),wordmarkFilter()];
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
    page.scroll(cardStart-1);page.frames();
    near(cardOpacity(),1,'The revealed card stays opaque when scrolling back');
    near(cardOffset(),0,'The revealed card stays upright when scrolling back');
    const leavingY=cardY();
    page.scroll(footerStart+height*.2);page.frames();
    assert(cardY()>leavingY,'The revealed card moves out with the footer');
    page.scroll(footerStart-1);page.frames();
    assert(cardY()>height,'The card is already outside the viewport when the footer is hidden');
    assert(!footer.classList.contains('site-footer-is-visible'));
    assert(footer.inert);assert(!services.inert);
    page.scroll(cardStart+1);page.frames();
    near(cardOpacity(),1,'Returning to the cue never replays the entrance');
    near(cardOffset(),0,'The original turn has already settled');
    assert.equal(page.raf.size,0);
    page.scroll(footerStart-1);page.frames();
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
  console.log('Services and footer handoff checks passed: overlapping scroll-linked deck reveal, responsive full-card alignment, native continuation, reverse and restored poses, cached geometry and reduced-motion flow.');
})().catch(error=>{console.error(error);process.exitCode=1;});
