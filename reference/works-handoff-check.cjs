const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function fixture(width, height) {
  function element(tag='div', className='') {
    const values=new Map(),attributes=new Map(),listeners=new Map();
    const node={tagName:tag.toUpperCase(),className,dataset:{},children:[],parentElement:null,
      style:{setProperty:(key,value)=>values.set(key,String(value)),getPropertyValue:key=>values.get(key)||'',removeProperty:key=>values.delete(key)},
      append(...children){for(const child of children){if(child.parentElement)child.parentElement.children.splice(child.parentElement.children.indexOf(child),1);child.parentElement=this;this.children.push(child);}},
      get firstChild(){return this.children[0]||null;},removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentElement=null;return child;},
      setAttribute:(key,value)=>attributes.set(key,String(value)),getAttribute:key=>attributes.get(key)??null,removeAttribute:key=>attributes.delete(key),
      addEventListener(key,listener){if(!listeners.has(key))listeners.set(key,[]);listeners.get(key).push(listener);},
      dispatchEvent(event){for(const callback of listeners.get(event.type)||[])callback(event);return true;},
      querySelectorAll(selector){return this.children.flatMap(child=>[...(matches(child,selector)?[child]:[]),...child.querySelectorAll(selector)]);},
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
      getBoundingClientRect(){throw new Error('Works frames must use cached geometry');},
    };
    function classes(){return node.className.split(/\s+/).filter(Boolean);}
    node.classList={contains:name=>classes().includes(name),add(...names){node.className=[...new Set([...classes(),...names])].join(' ');},remove(...names){node.className=classes().filter(name=>!names.includes(name)).join(' ');},toggle(name,on){const enabled=on??!this.contains(name);this[enabled?'add':'remove'](name);return enabled;}};
    return node;
  }
  function matches(node,selector){
    if(selector.includes(','))return selector.split(',').some(value=>matches(node,value.trim()));
    if(selector.startsWith('.'))return node.classList.contains(selector.slice(1));
    if(selector.startsWith('['))return node.getAttribute(selector.slice(1,-1))!==null;
    return node.tagName===selector.toUpperCase();
  }
  const body=element('body'),hero=element('section','hero'),journey=element('section','works-journey'),inspiration=element('section','inspiration');
  const viewport=element('div','works-viewport'),list=element('div','works-cards'),artwork=element('img','works-backdrop__lines');
  viewport.setAttribute('data-works-gallery','');list.setAttribute('data-works-cards','');
  const commonUI=['hero__datetime','hero__footer','hero__about-logo'].map(name=>element('div',name));
  const duplicates=commonUI.map(node=>element('div',node.className));
  inspiration.hidden=false;hero.append(inspiration,...commonUI);viewport.append(artwork,list,...duplicates);journey.append(viewport);body.append(hero,journey);
  const document={querySelector:selector=>body.querySelector(selector),createElement:element,hidden:false};
  const window=element('window'),reduced=element();reduced.matches=false;
  const ready=[];window.addEventListener('works:ready',()=>ready.push(true));
  const timers=new Map();let timerId=0;
  const context=vm.createContext({document,window,matchMedia:()=>reduced,CustomEvent:class{constructor(type){this.type=type;}},setTimeout(callback){timers.set(++timerId,callback);return timerId;},clearTimeout(id){timers.delete(id);},requestAnimationFrame(){throw new Error('Works shares the owner RAF');}});
  vm.runInContext(fs.readFileSync(path.join(root,'works-gallery.js'),'utf8'),context);
  const gallery=window.WorksGallery,updates=[];
  window.WorksGallery={...gallery,update(...args){updates.push(args);return gallery.update(...args);}};
  const closingUpdates=[];
  window.InspirationClosing={getCreationBounds:()=>({top:height*.46,bottom:height*.54}),updateWorks(distance,options){closingUpdates.push({distance,...options,galleryUpdates:updates.length});}};
  vm.runInContext(fs.readFileSync(path.join(root,'works-scroll.js'),'utf8'),context);
  return {width,height,window,reduced,hero,journey,viewport,list,artwork,inspiration,commonUI,duplicates,updates,closingUpdates,ready,api:window.WorksScrollChapter};
}
function screenBounds(f){
  return f.window.WorksGallery.getProjectedCards(Number(f.journey.dataset.helixProgress)||0).map(pose=>({left:pose.minX,top:pose.minY,width:pose.maxX-pose.minX,height:pose.maxY-pose.minY}));
}
function checkTitleTiming(f, measured, now){
  const leadPhase=f.window.WorksGallery.leadFrontalPhase;
  const {entrancePeekPhase,lastFrontalPhase:lastPhase}=f.window.WorksGallery.getLayout();
  const [lead]=f.window.WorksGallery.getProjectedCards(leadPhase);
  assert.equal(lead.index,0);
  assert(Math.abs(lead.angle)<1e-8&&lead.visible,'Title timing follows the first work approaching the center head-on');
  const titleDistance=(leadPhase-.01-entrancePeekPhase)/measured.phasePerViewport*f.height;
  const last=f.window.WorksGallery.getProjectedCards(lastPhase).at(-1);
  assert(Math.abs(last.angle)<1e-8&&last.visible,'The exit cue is the last work facing the viewer');
  const hideTitleDistance=(lastPhase-entrancePeekPhase)/measured.phasePerViewport*f.height;
  assert(measured.servicesHeadingDistance>titleDistance&&measured.servicesHeadingDistance<hideTitleDistance,
    'The Services heading starts behind the approaching final work');
  const servicesHeadingPhase=entrancePeekPhase+measured.servicesHeadingDistance/f.height*measured.phasePerViewport;
  const lastTop=f.window.WorksGallery.getProjectedMotionBounds(servicesHeadingPhase).at(-1).minY;
  assert(Math.abs(lastTop-f.height*.42)<.002,'The final work reaches the heading before it fades in');
  assert(measured.servicesRevealDistance>hideTitleDistance&&measured.servicesRevealDistance<measured.galleryTravel+measured.exitTravel,
    'The Services deck starts between the last frontal work and the complete exit');
  const servicesRevealPhase=entrancePeekPhase+measured.servicesRevealDistance/f.height*measured.phasePerViewport;
  const lastBottom=f.window.WorksGallery.getProjectedMotionBounds(servicesRevealPhase).at(-1).maxY;
  assert(Math.abs(lastBottom-f.height*.15)<.002,'The last work still occupies the top 15% at the Services reveal cue');
  for(const [distance,visible] of [[titleDistance-1,false],[titleDistance+1,true],[hideTitleDistance-1,true],
    [hideTitleDistance+1,false],[hideTitleDistance-1,true],[titleDistance-1,false]]){
    f.api.update(distance,{now:now+=16});
    assert.equal(f.viewport.classList.contains('has-works-title'),visible,'Last Works follows the first and last works in both scroll directions');
  }
  return now;
}
for(const [width,height] of [[375,812],[768,1024],[1440,800],[1913,936],[1920,960],[2560,1305]]){
  const f=fixture(width,height);
  assert.equal(f.ready.length,1,'Works announces readiness once to the story owner');
  const measured=f.api.measure({width,height,start:2700});
  assert.equal(f.list.children.length,7,'The rendered spiral has seven work cards');
  assert.deepEqual(f.list.children.map(card=>card.dataset.sequence),['1','2','3','4','5','6','7']);
  const galleryTravel=measured.galleryTravel,travel=galleryTravel+measured.exitTravel+height;
  assert.equal(measured.travel,travel);
  assert(measured.galleryTravel<height*4,'The seven-card sequence shortens the browsing distance');
  const priorPace=width<600?.13852626085281367:width<1100?.2743629407882692:.13409726858139054;
  assert(Math.abs(measured.phasePerViewport-priorPace)<1e-9,'Wider spacing preserves the previous camera pace at every breakpoint');
  const lastFrontalPhase=f.window.WorksGallery.getLayout().lastFrontalPhase;
  assert(Math.abs(measured.exitTravel-(Number(f.journey.dataset.clearProgress)-lastFrontalPhase)/measured.phasePerViewport*height)<.01,'Departure follows the seventh work at the unchanged camera speed');
  assert.equal(measured.emptyHold,height);
  assert(Math.abs(Number(f.journey.dataset.totalTravel)-travel)<.001);
  assert(measured.holdDistance>0&&measured.holdDistance<height*4,'The headline hold follows actual imagery through the entrance, including tall phone viewports');
  assert.equal(f.updates.length,0,'Prefetch and geometry measurement do not paint an invisible gallery');
  f.api.update(height*.01,{now:90});
  const layoutTransforms=f.list.children.map(node=>node.style.transform);
  assert(layoutTransforms.every(value=>/^matrix3d\(/.test(value)&&!value.includes('NaN')),'Every fallback image receives a finite true projective quad');
  const projected=f.window.WorksGallery.getProjectedBounds(f.window.WorksGallery.getLayout().entrancePeekPhase);
  assert(Number.isFinite(projected.minY)&&Number.isFinite(projected.maxY));
  assert.deepEqual(f.list.children.map(node=>node.style.transform),layoutTransforms,'Raw projection queries never mutate image poses');
  assert.equal(f.viewport.parentElement,f.hero,'Both chapters occupy the same pinned viewport');
  assert(f.journey.classList.contains('works-is-shared'),'The original flow marker has no viewport budget');
  assert(f.duplicates.every(node=>node.getAttribute('aria-hidden')==='true'),'Only common hero UI remains accessible');
  assert(f.commonUI.every(node=>node.parentElement===f.hero),'Clock/footer/logo never reparent or scroll out');
  f.api.update(0,{now:100});
  const before=screenBounds(f);
  assert.equal(f.closingUpdates.at(-1).distance,0,'The closing heading receives the reset boundary too');
  assert(!f.hero.classList.contains('is-works'));
  const visibleSlice=({left,top,width:boxWidth,height:boxHeight})=>Math.min(
    Math.min(left+boxWidth,width)-Math.max(left,0),Math.min(top+boxHeight,height)-Math.max(top,0));
  assert(before.every(box=>visibleSlice(box)<.15),'The raw helix starts beyond the viewport edge');
  f.api.update(-height*.25,{entryProgress:.5,now:650});
  const [partial]=screenBounds(f),partialPhase=f.updates.at(-1)[0];
  f.api.update(-height*.25,{entryProgress:.5,now:900});
  assert.equal(f.updates.at(-1)[0],partialPhase,'Elapsed title time cannot move the orbit at a fixed scroll coordinate');
  f.api.update(-height*.125,{entryProgress:.75,now:900});
  assert(f.updates.at(-1)[0]>partialPhase,'Scroll advances the camera independently of elapsed title time');
  f.api.update(-height*.25,{entryProgress:.5,now:910});
  assert.equal(f.updates.at(-1)[0],partialPhase,'Reversing the scroll restores the same arrival pose');
  f.api.update(0,{entryProgress:1,now:1050});
  const [peek,nextPeek]=screenBounds(f),peekPhase=f.updates.at(-1)[0];
  assert(partialPhase<peekPhase&&visibleSlice(partial)>0,'The late title frames expose the first card before the camera reaches the hold');
  assert(Math.abs(partial.left-peek.left)>3&&Math.abs(partial.width-peek.width)>.1,'The first card moves and turns on the orbit during the preview');
  assert(visibleSlice(peek)>=35.85,'The resting preview keeps the leading card recognizable at every breakpoint');
  assert(visibleSlice(nextPeek)>=24,'The second card is already entering at the preview hold');
  if(width===1913){
    assert(Math.abs(peek.left-100)<6&&Math.abs(peek.top-664)<6&&Math.abs(peek.left+peek.width-250)<6&&Math.abs(peek.top+peek.height-895)<6,
      'The leading card lands in the reference silhouette');
    assert(Math.abs(nextPeek.top-825)<6&&nextPeek.top+nextPeek.height>height,'Only the upper part of the second card is visible in the reference pose');
  }
  assert(f.viewport.classList.contains('works-is-preview')&&!f.hero.classList.contains('is-works'));
  assert.equal(f.viewport.getAttribute('aria-hidden'),'true');
  assert(f.list.children.every(card=>card.getAttribute('tabindex')==='-1'));
  assert(!f.viewport.classList.contains('has-works-title'));
  f.api.update(.001,{entryProgress:1,now:1151});
  assert(Math.abs(f.updates.at(-1)[0]-peekPhase)<1e-6,'The first Works scroll starts from the preview phase');
  for(const fraction of [.01,.05]) {
    f.api.update(height*fraction,{now:1156+fraction*100});
    assert(screenBounds(f).some(box=>box.top<height&&box.top+box.height>0),`Actual project imagery appears after only ${fraction} viewport of the normal exit`);
  }
  const imageTop=()=>Math.min(...screenBounds(f).filter(box=>box.left+box.width>0&&box.left<width).map(box=>box.top));
  f.api.update(measured.holdDistance-.5,{now:1162});
  assert(imageTop()>height*.54,'Heading stays centered until actual artwork reaches its lower edge');
  f.api.update(measured.holdDistance+.5,{now:1163});
  assert(imageTop()<height*.54,'Heading may recede only after the first image reaches its lower edge');
  assert.equal(f.closingUpdates.at(-1).holdDistance,measured.holdDistance,'The callback uses the cached image crossing');
  assert.equal(f.closingUpdates.at(-1).galleryUpdates,f.updates.length,'The closing heading updates after the projected gallery');
  f.api.update(height*.25,{now:1164});
  const entering=screenBounds(f);
  assert(f.hero.classList.contains('is-works'),'The next scroll directly starts the Works layer');
  assert.equal(f.hero.style.getPropertyValue('--works-exit-px'),`${height*.25}px`,'The normal Works entrance follows native scroll distance');
  assert(entering.some((box,i)=>box.top<before[i].top),'Projected works start moving on the entrance scroll');
  assert.equal(f.inspiration.getAttribute('aria-hidden'),'false','Inspiration stays readable while part of its screen is still present');
  assert.equal(f.journey.dataset.chapterStart,'2700.000');
  const transforms=f.list.children.map(node=>node.style.transform),measuredUpdates=f.updates.length;
  f.api.setStart(2850);
  assert.equal(f.updates.length,measuredUpdates,'Boundary rebasing does not update or measure the gallery');
  assert.deepEqual(f.list.children.map(node=>node.style.transform),transforms,'Boundary rebasing retains cached poses');
  f.api.setStart(NaN);f.api.update(height*.25,{now:1172});
  assert.equal(f.journey.dataset.chapterStart,'2850.000','Cheap boundary rebasing keeps finite input and ignores invalid values');
  f.api.update(height*.85,{now:1180});
  assert(screenBounds(f).some(box=>box.top<height&&box.top+box.height>0),'Real project images enter before the preceding full screen has scrolled out');
  f.api.update(height,{now:1188});
  assert.equal(f.hero.style.getPropertyValue('--works-exit-px'),`${height}px`,'The normal Works entrance completes after one viewport');
  assert.equal(f.inspiration.getAttribute('aria-hidden'),'true');
  assert.equal(f.journey.dataset.exitProgress,'1.00000');
  const orbit=[];
  const orbitEnd=galleryTravel/height*.9;
  for(const fraction of [0,.25,.5,orbitEnd*.7,orbitEnd*.85,orbitEnd]){
    f.api.update(height*fraction,{entryProgress:1,now:1192+fraction});
    const box=screenBounds(f)[0];
    orbit.push({distance:height*fraction,centerX:box.left+box.width/2,top:box.top,offset:f.closingUpdates.at(-1).headingProgress,helix:Number(f.journey.dataset.helixProgress)});
  }
  assert(Math.max(...orbit.map(pose=>Math.abs(pose.centerX-orbit[0].centerX)))>width*.12,'The visible helix includes a noticeable sideways orbit');
  assert(orbit[3].helix>.23,'Actual camera progress, rather than a fake object slide, drives the early orbit');
  assert(orbit.every(item=>item.offset>=0&&item.offset<=1),'The centered title receives a bounded recede/fade progress');
  assert(Math.abs(orbit[5].helix-(orbit[0].helix+measured.phasePerViewport*orbitEnd))<.00002,'Every screen of scrolling advances the same helix phase');
  for(let i=1;i<orbit.length;i++){
    const step=(orbit[i].helix-orbit[i-1].helix)/((orbit[i].distance-orbit[i-1].distance)/height);
    assert(Math.abs(step-measured.phasePerViewport)<.00005,'Entry and browsing have a constant world-space speed');
  }
  f.api.update(height*(orbitEnd-.0001),{now:1198});
  const joinBefore=Number(f.journey.dataset.helixProgress);
  f.api.update(height*(orbitEnd+.0001),{now:1198});
  const joinAfter=Number(f.journey.dataset.helixProgress);
  assert(Math.abs((orbit[5].helix-joinBefore)-(joinAfter-orbit[5].helix))<.00002,'No hidden easing splice changes the camera speed');
  for(let i=1;i<orbit.length;i++){
    assert(orbit[i].offset>=orbit[i-1].offset,'Header ascent is monotonic across the early orbit');
    assert.equal(f.journey.dataset.headingOffset,'0.000','The title no longer scrolls upward');
  }
  let now=checkTitleTiming(f,measured,1198);
  function settleAt(distance){
    f.api.update(distance,{now:now+=16});
    for(let frame=0;frame<45&&f.window.WorksGallery.isAnimating();frame++)f.api.update(distance,{now:now+=16});
    assert(!f.window.WorksGallery.isAnimating(),'A stationary scroll pose lets the shared clock sleep');
  }
  const settledOrbit=height*orbitEnd;
  settleAt(settledOrbit);
  const imageBefore=f.list.children.map(node=>node.style.transform),heldBefore=f.closingUpdates.at(-1).headingProgress;
  f.api.update(height*.7,{now:now+=16});settleAt(settledOrbit);
  assert.deepEqual(f.list.children.map(node=>node.style.transform),imageBefore,'Reverse restores exactly the same curved camera pose');
  assert.equal(f.closingUpdates.at(-1).headingProgress,heldBefore,'Reverse restores exactly the same cached header ascent');
  f.api.update(galleryTravel,{now:now+=16});
  assert(Math.abs(Number(f.journey.dataset.helixProgress)-lastFrontalPhase)<.00001,'Browsing ends with the seventh work centered');
  const phaseBefore=Number(f.journey.dataset.helixProgress);
  const exitSample=Math.min(height*.5,measured.exitTravel*.5);
  f.api.update(galleryTravel+exitSample,{now:now+=16});
  assert(Math.abs((Number(f.journey.dataset.helixProgress)-phaseBefore)/(exitSample/height)-measured.phasePerViewport)<.0001,'Departure uses the exact same camera speed as arrival');
  assert.equal(measured.travel,travel,'Works uses the camera trajectory and its standalone hold, with no background travel');
  const clear=f.api.update(galleryTravel+measured.exitTravel,{now:now+=16});
  assert.equal(clear.finished,true);
  assert(!f.viewport.classList.contains('has-works-title'),'Last Works clears before Services takes over');
  const sleepingUpdates=f.updates.length;
  for(let i=0;i<100;i++)f.api.update(travel+height*i/100,{now:now+=16});
  assert.equal(f.updates.length,sleepingUpdates,'Scrolling later chapters never updates the sleeping gallery');
  assert.equal(f.viewport.getAttribute('aria-hidden'),'true','The fully departed gallery is inaccessible');
  assert(screenBounds(f).every(box=>box.top+box.height<0),'Every image, including the last, fully clears above the screen');
  f.api.update(travel,{now:now+=16});
  assert.equal(f.journey.dataset.scrollProgress,'1.00000');
  const completedBounds=screenBounds(f);
  f.api.update(galleryTravel+height,{now:now+=16});f.api.update(travel,{now:now+=16});
  assert.deepEqual(screenBounds(f),completedBounds,'Reverse/forward exactly restores the completed exit');
  f.api.update(galleryTravel*.5,{now:now+=16});
  assert.equal(f.viewport.getAttribute('aria-hidden'),'false','Rewinding wakes the gallery in the same owner frame');
  const geometry=f.window.WorksGallery.getProjectedCards(Number(f.journey.dataset.helixProgress));
  assert(geometry.some(pose=>pose.front)&&geometry.some(pose=>!pose.front),'Orbit distinguishes actual front and back surfaces');
  assert(new Set(geometry.map(pose=>Math.round(pose.angle*100))).size===7,'Cards follow tangent orientations instead of billboarding');
  const front=geometry.find(pose=>pose.front&&pose.visible),back=geometry.find(pose=>!pose.front&&pose.visible);
  const projectPill=f.viewport.querySelector('.works-project'),projectTitle=projectPill.querySelector('.works-project__name');
  assert.equal(projectPill.getAttribute('aria-hidden'),'true','No project label is shown without hover, focus or tap');
  if(back){f.list.children[back.index].dispatchEvent({type:'click'});assert.equal(projectPill.getAttribute('aria-hidden'),'true','Back-facing works never activate the project pill');}
  if(front){
    f.list.children[front.index].dispatchEvent({type:'focus'});
    assert.equal(projectPill.getAttribute('aria-hidden'),'false','Keyboard focus on a visible front work opens its project details');
    assert.equal(projectTitle.textContent,f.window.WorksGallery.getProjects()[Number(f.list.children[front.index].dataset.project)-1].name);
    assert.equal(projectPill.querySelector('.works-project__button').getAttribute('aria-disabled'),'true','Project navigation stays explicitly unconnected');
    const canvas=f.viewport.querySelector('.works-gallery-canvas'),center=front.vertices[4*25+12];
    canvas.getBoundingClientRect=()=>({left:0,top:0});
    f.window.dispatchEvent({type:'blur'});
    canvas.dispatchEvent({type:'pointerdown',pointerType:'touch',clientX:center.x,clientY:center.y});
    canvas.dispatchEvent({type:'pointerup',pointerType:'touch',clientX:center.x,clientY:center.y});
    assert.equal(projectPill.getAttribute('aria-hidden'),'false','A tap on a front image reveals the pill on touch devices');
    f.window.dispatchEvent({type:'blur'});
    canvas.dispatchEvent({type:'pointerdown',pointerType:'touch',clientX:center.x,clientY:center.y});
    canvas.dispatchEvent({type:'pointerup',pointerType:'touch',clientX:center.x,clientY:center.y+50});
    assert.equal(projectPill.getAttribute('aria-hidden'),'true','A scrolling swipe does not accidentally reveal project details');
  }
  f.api.update(0,{entryProgress:1,now:now+=16});
  assert.equal(f.closingUpdates.at(-1).distance,0,'Reverse returns the heading to its centered checkpoint');
  assert.deepEqual(screenBounds(f)[0],peek,'Reverse restores the same small preview at the title checkpoint');
  assert.equal(f.hero.style.getPropertyValue('--works-exit-px'),'0px');
  assert.equal(f.inspiration.getAttribute('aria-hidden'),'false');
  assert(!f.hero.classList.contains('is-works'));
  assert.equal(f.viewport.getAttribute('aria-hidden'),'true');
  f.api.update(0,{now:now+=16});
  assert.deepEqual(screenBounds(f),before,'Rolling back to the previous title clears the preview');
  assert(!f.viewport.classList.contains('works-is-preview'));
  f.window.InspirationClosing.getCreationBounds=()=>({top:713*.46,bottom:713*.54});
  const resized=f.api.measure({width:1200,height:713,start:3100});
  assert(resized.holdDistance>0&&resized.holdDistance<resized.galleryTravel,'Resize recalculates the image-dependent heading boundary within browsing');
  const resizedEdge=f.window.InspirationClosing.getCreationBounds().bottom;
  const resizedTop=()=>Math.min(...screenBounds(f).filter(box=>box.left+box.width>0&&box.left<1200).map(box=>box.top));
  f.api.update(resized.holdDistance-.5,{now:now+=16});
  assert(resizedTop()>resizedEdge,'Resized heading still waits for the actual leading image');
  f.api.update(resized.holdDistance+.5,{now:now+=16});
  assert(resizedTop()<resizedEdge,'Resized crossing follows geometry rather than an obsolete one-screen deadline');
  const resizedAgain=f.api.measure({width:1200,height:713,start:3100});
  assert.equal(resizedAgain.travel,resizedAgain.galleryTravel+resizedAgain.exitTravel+713,'Resize recalculates the unified Works pace, full exit and standalone hold');
  const restored=fixture(width,height).api.measure({width,height,start:2700});
  assert.equal(restored.holdDistance,measured.holdDistance,'A fresh history/reload state computes the same threshold without traversing the timeline');
  f.reduced.matches=true;f.reduced.dispatchEvent({type:'change'});
  assert.equal(f.ready.length,2,'Reduced-motion change asks the owner to measure again');
  assert.equal(f.api.measure({width,height,start:2700}).travel,0);
  f.api.update(100,{reducedMotion:true});
  assert.equal(f.closingUpdates.at(-1).reducedMotion,true,'Static mode also clears the animated heading handoff');
  assert.equal(f.viewport.parentElement,f.journey,'Reduced motion restores the static Works grid');
  assert(!f.viewport.classList.contains('works-is-enhanced'));
  assert(!f.viewport.classList.contains('has-works-title'),'The reduced-motion grid uses its static title styling');
  assert(f.duplicates.every(node=>node.getAttribute('aria-hidden')===null));
  f.reduced.matches=false;f.api.measure({width,height,start:2700});f.api.update(height,{now:now+=16});
  assert.equal(f.viewport.parentElement,f.hero,'Returning to normal motion restores the shared viewport');
}
const shortPhone=fixture(414,700);
checkTitleTiming(shortPhone,shortPhone.api.measure({width:414,height:700}),150);
const portraitTablet=fixture(820,1180);
portraitTablet.api.measure({width:820,height:1180});
portraitTablet.api.update(0,{entryProgress:1});
const [tabletPeek,tabletNext]=screenBounds(portraitTablet);
assert(tabletPeek.left+tabletPeek.width>=36&&tabletPeek.top>1180*.55&&tabletNext.top<1180,
  'Tall tablets settle at an earlier point on the orbit with both cards visible below the headline');
const narrowTablet=fixture(1024,768);
narrowTablet.api.measure({width:1024,height:768});
narrowTablet.api.update(0,{entryProgress:1});
const [narrowPeek]=screenBounds(narrowTablet);
assert(narrowPeek.left>=0&&narrowPeek.width>150&&narrowPeek.top<768-40,
  'When the second card cannot enter in time, the leading card stays recognizable');
const css=fs.readFileSync(path.join(root,'works-scroll.css'),'utf8');
assert(/\.works-journey\.works-is-shared\s*\{[^}]*height:\s*0/.test(css),'Enhanced marker has zero height');
assert(/\.hero\s*>\s*\.works-viewport\.works-is-enhanced\s*\{[^}]*position:\s*absolute/.test(css),'Works occupies the hero viewport instead of another scrolling screen');
assert(!css.includes('position: sticky'),'Works no longer releases and repins a second viewport');
assert(!css.includes('--works-handoff')&&!/(?:\.inspiration|\.works-cards|\.works-backdrop)\s*\{[^}]*opacity\s*:/.test(css),'Section, gallery and backdrop opacity are never animated for the exit; fixed artwork/icon opacity stays intact');
assert(!/\.hero\.is-works\s*>\s*\.inspiration\s*\{[^}]*transform:/.test(css),'The preceding stack has already exited; Works does not move its background or pinned heading again');
assert(!/--works-(enter|card-offset)-px/.test(css),'The gallery and its layer never translate separately from the orbit');
assert(/\.hero\.is-works\s*>\s*\.hero__about-logo\s*\{[^}]*z-index:\s*1000/.test(css),'Common UI stays above gallery cards');
assert(/\.hero > \.works-viewport\.works-is-enhanced \.works-backdrop\s*\{\s*display:\s*none/.test(css),'The enhanced Works layer keeps its backdrop transparent to show the heading below');
assert(/\.hero\.is-works \.inspiration__backdrop\s*\{\s*display:\s*none/.test(css),'The preceding Inspiration backdrop cannot cover the returning black gradient');
const closingCss=fs.readFileSync(path.join(root,'inspiration-closing.css'),'utf8');
assert(/\.inspiration-closing\s*\{[^}]*z-index:\s*6/.test(closingCss),'Creation heading is below the Works viewport at z7');
const reference=fixture(1267,713),tall=fixture(1267,920);
reference.api.measure({width:1267,height:713});tall.api.measure({width:1267,height:920});
assert.equal(reference.window.WorksGallery.getLayout().focal,tall.window.WorksGallery.getLayout().focal,'A taller viewport no longer zooms the approved camera');
const a=reference.window.WorksGallery.getProjectedCards(.68),b=tall.window.WorksGallery.getProjectedCards(.68);
for(let i=0;i<a.length;i++){assert(Math.abs((a[i].maxX-a[i].minX)-(b[i].maxX-b[i].minX))<.001,'Card width stays identical at equal CSS width');assert(Math.abs((a[i].maxY-a[i].minY)-(b[i].maxY-b[i].minY))<.001,'Card height stays identical at equal CSS width');}
const hoverExit=fixture(1920,960),hoverMetrics=hoverExit.api.measure({width:1920,height:960});
hoverExit.api.update(hoverMetrics.galleryTravel*.5,{now:10});
const hoverCard=hoverExit.list.children.find(card=>card.classList.contains('is-front')&&card.classList.contains('is-in-view'));
hoverCard.dispatchEvent({type:'pointerenter',pointerType:'mouse'});
hoverExit.api.update(hoverMetrics.galleryTravel*.5,{now:20});
hoverExit.api.update(hoverMetrics.galleryTravel*.5,{now:340});
assert.equal(hoverExit.window.WorksGallery.isAnimating(),false,'The selected card settles on the shared clock');
for(const now of [400,420,750,1080])hoverExit.api.update(-1,{now});
assert.equal(hoverExit.window.WorksGallery.isAnimating(),false,'Hover reset finishes after reversing out of Works instead of keeping an idle RAF alive');
console.log('Works handoff checks passed: normalized camera, unified camera pace, hover reset on chapter exit, full exit, cached geometry and reversible layout.');
