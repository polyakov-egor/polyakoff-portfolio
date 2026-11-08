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
  const shift=(parseFloat(f.viewport.style.getPropertyValue('--works-enter-px'))||0)+(parseFloat(f.viewport.style.getPropertyValue('--works-card-offset-px'))||0);
  return f.window.WorksGallery.getProjectedCards(Number(f.journey.dataset.helixProgress)||0).map(pose=>({left:pose.minX,top:pose.minY+shift,width:pose.maxX-pose.minX,height:pose.maxY-pose.minY}));
}
for(const [width,height] of [[375,812],[768,1024],[1440,800],[1920,960],[2560,1305]]){
  const f=fixture(width,height);
  assert.equal(f.ready.length,1,'Works announces readiness once to the story owner');
  const measured=f.api.measure({width,height,start:2700});
  const galleryTravel=measured.galleryTravel,travel=Math.max(galleryTravel+measured.exitTravel,measured.blackEnd)+height;
  assert.equal(measured.travel,travel);
  assert(measured.galleryTravel<height*(width<600?6:8),'Browsing now uses the faster final-exit pace');
  const priorPace=width<600?.13852626085281367:width<1100?.2743629407882692:.13409726858139054;
  assert(Math.abs(measured.phasePerViewport-priorPace)<1e-9,'Wider spacing preserves the previous camera pace at every breakpoint');
  assert(Math.abs(measured.exitTravel-(Number(f.journey.dataset.clearProgress)-43.2/56.592)/measured.phasePerViewport*height)<.01,'Departure length follows actual enlarged imagery at the unchanged camera speed');
  assert.equal(measured.emptyHold,height);
  assert(Math.abs(Number(f.journey.dataset.totalTravel)-travel)<.001);
  assert(measured.holdDistance>0&&measured.holdDistance<height*4,'The headline hold follows actual imagery through the entrance, including tall phone viewports');
  assert.equal(f.updates.length,0,'Prefetch and geometry measurement do not paint an invisible gallery');
  f.api.update(height*.01,{now:90});
  const layoutTransforms=f.list.children.map(node=>node.style.transform);
  assert(layoutTransforms.every(value=>/^matrix3d\(/.test(value)&&!value.includes('NaN')),'Every fallback image receives a finite true projective quad');
  const projected=f.window.WorksGallery.getProjectedBounds(.13);
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
  assert(before.every(box=>box.top>=height-.01),'The real helix entrance remains below the viewport');
  for(const fraction of [.01,.05]) {
    f.api.update(height*fraction,{now:108+fraction*100});
    assert(screenBounds(f).some(box=>box.top<height&&box.top+box.height>0),`Actual project imagery appears after only ${fraction} viewport of the normal exit`);
  }
  const imageTop=()=>Math.min(...screenBounds(f).filter(box=>box.left+box.width>0&&box.left<width).map(box=>box.top));
  f.api.update(measured.holdDistance-.5,{now:114});
  assert(imageTop()>height*.54,'Heading stays centered until actual artwork reaches its lower edge');
  f.api.update(measured.holdDistance+.5,{now:115});
  assert(imageTop()<height*.54,'Heading may recede only after the first image reaches its lower edge');
  assert.equal(f.closingUpdates.at(-1).holdDistance,measured.holdDistance,'The callback uses the cached image crossing');
  assert.equal(f.closingUpdates.at(-1).galleryUpdates,f.updates.length,'The closing heading updates after the projected gallery');
  f.api.update(height*.25,{now:116});
  const entering=screenBounds(f);
  assert(f.hero.classList.contains('is-works'),'The next scroll directly starts the Works layer');
  assert.equal(f.hero.style.getPropertyValue('--works-exit-px'),`${height*.25}px`,'The normal Works entrance follows native scroll distance');
  assert.equal(f.viewport.style.getPropertyValue('--works-enter-px'),'0px','Only images enter from below; the viewport does not hide the orbit with a vertical slide');
  assert(entering.some((box,i)=>box.top<before[i].top),'Projected works start moving on the entrance scroll');
  assert.equal(f.inspiration.getAttribute('aria-hidden'),'false','Inspiration stays readable while part of its screen is still present');
  assert.equal(f.journey.dataset.chapterStart,'2700.000');
  const transforms=f.list.children.map(node=>node.style.transform),measuredUpdates=f.updates.length;
  f.api.setStart(2850);
  assert.equal(f.updates.length,measuredUpdates,'Boundary rebasing does not update or measure the gallery');
  assert.deepEqual(f.list.children.map(node=>node.style.transform),transforms,'Boundary rebasing retains cached poses');
  f.api.setStart(NaN);f.api.update(height*.25,{now:124});
  assert.equal(f.journey.dataset.chapterStart,'2850.000','Cheap boundary rebasing keeps finite input and ignores invalid values');
  f.api.update(height*.85,{now:132});
  assert(screenBounds(f).some(box=>box.top<height&&box.top+box.height>0),'Real project images enter before the preceding full screen has scrolled out');
  f.api.update(height,{now:140});
  assert.equal(f.hero.style.getPropertyValue('--works-exit-px'),`${height}px`,'The normal Works entrance completes after one viewport');
  assert.equal(f.viewport.style.getPropertyValue('--works-enter-px'),'0px','Works then occupies the exact pinned screen');
  assert.equal(f.inspiration.getAttribute('aria-hidden'),'true');
  assert.equal(f.journey.dataset.exitProgress,'1.00000');
  assert.equal(f.viewport.style.getPropertyValue('--works-card-offset-px'),'0px','The gallery uses its own cached entrance rather than a second translating correction');
  const orbit=[];
  for(const fraction of [0,.25,.5,1,2,3]){
    f.api.update(height*fraction,{now:144+fraction});
    const box=screenBounds(f)[0];
    orbit.push({distance:height*fraction,centerX:box.left+box.width/2,top:box.top,offset:f.closingUpdates.at(-1).headingProgress,helix:Number(f.journey.dataset.helixProgress)});
  }
  assert(Math.abs(orbit[3].centerX-orbit[0].centerX)>width*.12,'The first viewport includes a noticeable sideways helix orbit');
  assert(orbit[3].helix>.23,'Actual camera progress, rather than a fake object slide, drives the early orbit');
  assert(orbit.every(item=>item.offset>=0&&item.offset<=1),'The centered title receives a bounded recede/fade progress');
  assert(Math.abs(orbit[5].helix-(.13+measured.phasePerViewport*3))<.00001,'Every screen of scrolling advances the same helix phase');
  for(let i=1;i<orbit.length;i++){
    const step=(orbit[i].helix-orbit[i-1].helix)/((orbit[i].distance-orbit[i-1].distance)/height);
    assert(Math.abs(step-measured.phasePerViewport)<.00005,'Entry and browsing have a constant world-space speed');
  }
  f.api.update(height*(3-.0001),{now:150});
  const joinBefore=Number(f.journey.dataset.helixProgress);
  f.api.update(height*(3+.0001),{now:150});
  const joinAfter=Number(f.journey.dataset.helixProgress);
  assert(Math.abs((orbit[5].helix-joinBefore)-(joinAfter-orbit[5].helix))<.00002,'No hidden 3H easing splice changes the camera speed');
  for(let i=1;i<orbit.length;i++){
    assert(orbit[i].offset>=orbit[i-1].offset,'Header ascent is monotonic across the early orbit');
    assert.equal(f.journey.dataset.headingOffset,'0.000','The title no longer scrolls upward');
  }
  f.api.update(height*3,{now:150});
  const imageBefore=f.list.children.map(node=>node.style.transform),heldBefore=f.closingUpdates.at(-1).headingProgress;
  f.api.update(height*.7,{now:150});f.api.update(height*3,{now:151});
  assert.deepEqual(f.list.children.map(node=>node.style.transform),imageBefore,'Reverse restores exactly the same early camera pose');
  assert.equal(f.closingUpdates.at(-1).headingProgress,heldBefore,'Reverse restores exactly the same cached header ascent');
  f.api.update(galleryTravel,{now:148});
  assert(Math.abs(Number(f.journey.dataset.helixProgress)-43.2/56.592)<.00001,'The twelfth work retains its pose at the former endpoint');
  const phaseBefore=Number(f.journey.dataset.helixProgress);
  f.api.update(galleryTravel+height*.5,{now:149});
  assert(Math.abs((Number(f.journey.dataset.helixProgress)-phaseBefore)/.5-measured.phasePerViewport)<.00005,'Departure uses the exact same camera speed as arrival');
  f.api.update(measured.blackStart,{now:149});
  assert.equal(Number(f.journey.dataset.blackProgress),0,'Black transition starts near the final group of works');
  assert(screenBounds(f).some(box=>box.top<height&&box.top+box.height>0),'Several works are still onscreen when the background starts darkening');
  const midBlack=f.api.update((measured.blackStart+measured.blackEnd)/2,{now:149});
  assert(Math.abs(midBlack.blackProgress-.5)<.000001,'The early background transition is smooth and scroll-driven');
  const fullBlack=f.api.update(measured.blackEnd,{now:149});
  assert.equal(fullBlack.blackProgress,1,'Background finishes black before the remaining works leave');
  assert(screenBounds(f).some(box=>box.top<height&&box.top+box.height>0),'The last cards remain visible over the black background');
  const reverseBlack=f.api.update((measured.blackStart+measured.blackEnd)/2,{now:149});
  assert.equal(reverseBlack.blackProgress,midBlack.blackProgress,'Reverse restores the same background midpoint');
  const clear=f.api.update(galleryTravel+measured.exitTravel,{now:149});
  assert.equal(clear.blackProgress,1,'The background is already black when every work has gone');
  assert.equal(clear.finished,true);
  const sleepingUpdates=f.updates.length;
  for(let i=0;i<100;i++)f.api.update(travel+height*i/100,{now:150+i});
  assert.equal(f.updates.length,sleepingUpdates,'Scrolling later chapters never updates the sleeping gallery');
  assert.equal(f.viewport.getAttribute('aria-hidden'),'true','The fully departed gallery is inaccessible');
  assert(screenBounds(f).every(box=>box.top+box.height<0),'Every image, including the last, fully clears above the screen');
  const completed=f.api.update(travel,{now:150});
  assert.equal(completed.blackProgress,1,'The final hold is a completely black screen');
  assert.equal(f.journey.dataset.scrollProgress,'1.00000');
  const completedBounds=screenBounds(f);
  f.api.update(galleryTravel+height,{now:151});f.api.update(travel,{now:152});
  assert.deepEqual(screenBounds(f),completedBounds,'Reverse/forward exactly restores the completed exit');
  f.api.update(galleryTravel*.5,{now:164});
  assert.equal(f.viewport.getAttribute('aria-hidden'),'false','Rewinding wakes the gallery in the same owner frame');
  assert(f.updates.at(-1)[1].scrollVelocity<0,'Reverse scrolling preserves velocity direction');
  const geometry=f.window.WorksGallery.getProjectedCards(Number(f.journey.dataset.helixProgress));
  assert(geometry.some(pose=>pose.front)&&geometry.some(pose=>!pose.front),'Orbit distinguishes actual front and back surfaces');
  assert(new Set(geometry.map(pose=>Math.round(pose.angle*100))).size===12,'Cards follow tangent orientations instead of billboarding');
  const front=geometry.find(pose=>pose.front&&pose.visible),back=geometry.find(pose=>!pose.front&&pose.visible);
  const projectPill=f.viewport.querySelector('.works-project'),projectTitle=projectPill.querySelector('.works-project__name');
  assert.equal(projectPill.getAttribute('aria-hidden'),'true','No project label is shown without hover, focus or tap');
  if(back){f.list.children[back.index].dispatchEvent({type:'click'});assert.equal(projectPill.getAttribute('aria-hidden'),'true','Back-facing works never activate the project pill');}
  if(front){
    f.list.children[front.index].dispatchEvent({type:'focus'});
    assert.equal(projectPill.getAttribute('aria-hidden'),'false','Keyboard focus on a visible front work opens its project details');
    assert.equal(projectTitle.textContent,f.window.WorksGallery.getProjects()[front.index%6].name);
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
  f.api.update(0,{now:180});
  assert.equal(f.closingUpdates.at(-1).distance,0,'Reverse returns the heading to its centered checkpoint');
  assert.deepEqual(screenBounds(f),before,'Reverse exactly restores the full spatial gallery entrance');
  assert.equal(f.hero.style.getPropertyValue('--works-exit-px'),'0px');
  assert.equal(f.viewport.style.getPropertyValue('--works-enter-px'),'0px');
  assert.equal(f.inspiration.getAttribute('aria-hidden'),'false');
  assert(!f.hero.classList.contains('is-works'));
  assert.equal(f.viewport.getAttribute('aria-hidden'),'true');
  const resized=f.api.measure({width:1200,height:713,start:3100});
  assert(resized.holdDistance>0&&resized.holdDistance<resized.galleryTravel,'Resize recalculates the image-dependent heading boundary within browsing');
  const resizedEdge=f.window.InspirationClosing.getCreationBounds().bottom;
  const resizedTop=()=>Math.min(...screenBounds(f).filter(box=>box.left+box.width>0&&box.left<1200).map(box=>box.top));
  f.api.update(resized.holdDistance-.5,{now:185});
  assert(resizedTop()>resizedEdge,'Resized heading still waits for the actual leading image');
  f.api.update(resized.holdDistance+.5,{now:186});
  assert(resizedTop()<resizedEdge,'Resized crossing follows geometry rather than an obsolete one-screen deadline');
  const resizedAgain=f.api.measure({width:1200,height:713,start:3100});
  assert.equal(resizedAgain.travel,Math.max(resizedAgain.galleryTravel+resizedAgain.exitTravel,resizedAgain.blackEnd)+713,'Resize recalculates the unified Works pace, full exit and black hold');
  const restored=fixture(width,height).api.measure({width,height,start:2700});
  assert.equal(restored.holdDistance,measured.holdDistance,'A fresh history/reload state computes the same threshold without traversing the timeline');
  f.reduced.matches=true;f.reduced.dispatchEvent({type:'change'});
  assert.equal(f.ready.length,2,'Reduced-motion change asks the owner to measure again');
  assert.equal(f.api.measure({width,height,start:2700}).travel,0);
  f.api.update(100,{reducedMotion:true});
  assert.equal(f.closingUpdates.at(-1).reducedMotion,true,'Static mode also clears the animated heading handoff');
  assert.equal(f.viewport.parentElement,f.journey,'Reduced motion restores the static Works grid');
  assert(!f.viewport.classList.contains('works-is-enhanced'));
  assert(f.duplicates.every(node=>node.getAttribute('aria-hidden')===null));
  f.reduced.matches=false;f.api.measure({width,height,start:2700});f.api.update(height,{now:200});
  assert.equal(f.viewport.parentElement,f.hero,'Returning to normal motion restores the shared viewport');
}
const css=fs.readFileSync(path.join(root,'works-scroll.css'),'utf8');
assert(/\.works-journey\.works-is-shared\s*\{[^}]*height:\s*0/.test(css),'Enhanced marker has zero height');
assert(/\.hero\s*>\s*\.works-viewport\.works-is-enhanced\s*\{[^}]*position:\s*absolute/.test(css),'Works occupies the hero viewport instead of another scrolling screen');
assert(!css.includes('position: sticky'),'Works no longer releases and repins a second viewport');
assert(!css.includes('--works-handoff')&&!/(?:\.inspiration|\.works-cards|\.works-backdrop)\s*\{[^}]*opacity\s*:/.test(css),'Section, gallery and backdrop opacity are never animated for the exit; fixed artwork/icon opacity stays intact');
assert(!/\.hero\.is-works\s*>\s*\.inspiration\s*\{[^}]*transform:/.test(css),'The preceding stack has already exited; Works does not move its background or pinned heading again');
assert(/--works-enter-px/.test(css)&&/--works-card-offset-px/.test(css),'Works follows spatially and cancels only its cached duplicate entrance offset');
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
for(const [width,height] of [[375,812],[1920,960]]){
  const parity=fixture(width,height),duration=height*2.3;
  const metrics=parity.api.measure({width,height,backgroundScrollDistance:duration});
  assert(Math.abs(metrics.fadeTravel-duration)<1e-8,'The return to black receives the exact About native-scroll duration');
  const quarter=parity.api.update(metrics.blackStart+duration*.25,{now:100});
  assert(Math.abs(quarter.blackProgress-.103515625)<1e-8,'Both background directions use the same quintic curve');
  parity.api.update(metrics.blackEnd,{now:110});
  assert.equal(parity.api.update(metrics.blackStart+duration*.25,{now:120}).blackProgress,quarter.blackProgress,'Returning through the same native distance restores the same gradient');
}
const hoverExit=fixture(1920,960),hoverMetrics=hoverExit.api.measure({width:1920,height:960});
hoverExit.api.update(hoverMetrics.galleryTravel*.5,{now:10});
const hoverCard=hoverExit.list.children.find(card=>card.classList.contains('is-front')&&card.classList.contains('is-in-view'));
hoverCard.dispatchEvent({type:'pointerenter',pointerType:'mouse'});
hoverExit.api.update(hoverMetrics.galleryTravel*.5,{now:20});
hoverExit.api.update(hoverMetrics.galleryTravel*.5,{now:340});
assert.equal(hoverExit.window.WorksGallery.isAnimating(),false,'The selected card settles on the shared clock');
for(const now of [400,420,750,1080])hoverExit.api.update(-1,{now});
assert.equal(hoverExit.window.WorksGallery.isAnimating(),false,'Hover reset finishes after reversing out of Works instead of keeping an idle RAF alive');
console.log('Works handoff checks passed: normalized camera, unified camera pace, matching About/Works background, hover reset on chapter exit, full exit, cached geometry and reversible layout.');
