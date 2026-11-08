/* The real view, headings, renderer and hero/about clock run together here.
   A narrow Works budget stub keeps this suite focused on the handoff contract;
   the helix has separate shared-viewport checks. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {makePage, turn, near, scrollStorageKey} = require('./scroll-check.cjs');
const root = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function assetContract() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'reference/inspiration-assets.json'),'utf8'));
  const view = fs.readFileSync(path.join(root,'inspiration-view.js'),'utf8');
  const css = fs.readFileSync(path.join(root,'inspiration.css'),'utf8');
  for (const file of manifest.files) {
    const absolute = path.join(root,file.path);
    assert(fs.statSync(absolute).size === file.bytes && file.bytes > 0, `The exact non-empty Figma asset is local: ${file.path}`);
  }
  for (const file of ['people.png','music-base.png','music-overlay.png','detail.png']) assert(view.includes(`'${file}'`), `The view assigns ${file} to its design slot`);
  for (const icon of ['heart','note','eye']) assert(view.includes(`icon: '${icon}'`), `The ${icon} SVG is assigned to its semantic card`);
  assert(view.includes('CREATIVE MINDS') && view.includes('WORK PLAYLIST') && view.includes('FOUND DETAILS'), 'The three original card titles are retained');
  assert(view.includes('Attention to') && view.includes('sparks inspiration'), 'The split headline text is retained');
  assert(!/https?:\/\//.test(view), 'Runtime markup has no temporary remote Figma URLs');
  assert(view.includes('<div class="inspiration__flip-front"')&&view.includes('src="./assets/images/hero/portrait-2456.webp"'),'Flip front reuses the approved responsive hero portrait');
  assert(view.includes('portrait-1280.webp'),'The static hero face keeps its compact phone source');
  assert(fs.statSync(path.join(root,'assets/images/hero/portrait-2456.webp')).size>0,'The static hero face is a non-empty local asset');
  const frontImage=/\.inspiration__flip-front\s*>\s*img\s*\{([^}]+)\}/.exec(css)?.[1]||'';
  for(const declaration of ['left: -15.085%','top: -10%','width: 130.0883%','height: 153.5%'])assert(frontImage.includes(declaration),'Static face preserves the mini-portrait crop: '+declaration);
  assert(/\.inspiration__flip-front\s*\{[^}]*backface-visibility:\s*hidden/.test(css),'Static front is a real hidden-backface plane');
  assert(/backdrop-filter:\s*blur\(64px\)/.test(css), 'Card plates keep the specified real backdrop blur');
  assert(!/\.inspiration\s+img\s*\{/.test(css), 'No broad raster sizing rule overrides SVG icon roots');
}

/* Use the real view markup for renderer checks instead of duplicating its
   articles/images in a hand-maintained fixture. */
function installViewDOM({document, nodes, element, context}, viewport) {
  const read = {allowed: true};
  const voidTags = new Set(['img','br','input','meta','link','hr','source']);
  const decode = value => value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  function matches(node, selector) {
    if (selector.includes(',')) return selector.split(',').some(value => matches(node, value.trim()));
    if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith('#')) return node.attributes.id === selector.slice(1);
    const attribute = /^\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(selector);
    if (attribute) return attribute[1] in node.attributes && (attribute[2] === undefined || node.attributes[attribute[1]] === attribute[2]);
    return node.tagName === selector.toUpperCase();
  }
  function enhance(node, tag = 'div') {
    if (node._inspirationDOM) return node;
    node._inspirationDOM = true; node.tagName = tag.toUpperCase(); node.hidden = false;
    node.getAttribute = name => node.attributes[name] ?? null;
    const previousSet = node.setAttribute;
    node.setAttribute = function(name, value) {
      previousSet.call(this, name, value);
      if (name === 'class') this.className = String(value);
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_,c) => c.toUpperCase())] = String(value);
    };
    node.style.getPropertyValue = name => node.style.values.get(name) || '';
    node.style.removeProperty = name => node.style.values.delete(name);
    Object.defineProperty(node, 'parentElement', {get() {return this.parent;}, configurable:true});
    Object.defineProperty(node, 'nextSibling', {get() {return this.parent?.children[this.parent.children.indexOf(this)+1] || null;}, configurable:true});
    node.append = function(...children) {
      for (const child of children) {
        child.remove?.(); child.parent = this; this.children.push(child);
      }
    };
    node.remove = function() {if(this.parent) this.parent.children.splice(this.parent.children.indexOf(this),1); this.parent = null;};
    node.insertBefore = function(child, reference) {child.remove?.(); child.parent = this; const index = this.children.indexOf(reference); this.children.splice(index < 0 ? this.children.length : index,0,child); return child;};
    node.insertAdjacentElement = function(position, child) {assert.equal(position,'afterend'); this.parent.insertBefore(child,this.nextSibling); return child;};
    node.querySelectorAll = function(selector) {return this.children.flatMap(child => [...(matches(child,selector) ? [child] : []),...child.querySelectorAll(selector)]);};
    node.querySelector = function(selector) {return this.querySelectorAll(selector)[0] || null;};
    const className = () => node.className.split(/\s+/).filter(Boolean);
    node.classList = {
      add(...names) {node.className = [...new Set([...className(),...names])].join(' ');},
      remove(...names) {node.className = className().filter(name=>!names.includes(name)).join(' ');},
      contains(name) {return className().includes(name);},
      toggle(name,on) {const enabled=on??!this.contains(name);this[enabled?'add':'remove'](name);return enabled;},
    };
    let ownText = typeof node.textContent === 'string' ? node.textContent : '';
    Object.defineProperty(node,'textContent',{get(){return ownText+this.children.map(child=>child.textContent||'').join('');},set(value){ownText=String(value);this.children=[];},configurable:true});
    if (!node.getBoundingClientRect) node.getBoundingClientRect = () => {assert(read.allowed,'Inspiration update must use measured coordinates, not layout reads');return {left:0,top:0,width:parseFloat(node.style.width)||viewport.width,height:parseFloat(node.style.height)||viewport.height};};
    Object.defineProperty(node,'innerHTML',{set(markup){
      this.children=[];const stack=[this];
      for(const token of markup.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<\/?[^>]+>|[^<]+/g)) {
        const raw=token[0];
        if(raw.startsWith('</')) {stack.pop();continue;}
        if(raw.startsWith('<')) {
          const tag=/^<([\w-]+)/.exec(raw)?.[1];if(!tag)continue;
          const child=create(tag);
          for(const attribute of raw.matchAll(/\s+([\w-]+)(?:="([^"]*)")?/g))child.setAttribute(attribute[1],decode(attribute[2]||''));
          stack.at(-1).append(child);if(!voidTags.has(tag)&&!raw.endsWith('/>'))stack.push(child);
        } else if(raw.trim()) {const child=create('#text');child.textContent=decode(raw);stack.at(-1).append(child);}
      }
    },configurable:true});
    for(const child of node.children)enhance(child);
    return node;
  }
  const create = tag => enhance(element(),tag);
  for(const node of new Set(Object.values(nodes)))enhance(node);
  const hero=nodes['.hero'];
  const originalQuery=document.querySelector;
  document.createElement=create;
  document.querySelector=selector=>originalQuery(selector)||hero.querySelector(selector);
  document.querySelectorAll=selector=>hero.querySelectorAll(selector);
  context.getComputedStyle=node=>({getPropertyValue:name=>node.style.getPropertyValue(name)});
  vm.runInContext(fs.readFileSync(path.join(root,'inspiration-view.js'),'utf8'),context,{filename:'inspiration-view.js'});
  const assets=JSON.parse(fs.readFileSync(path.join(root,'reference/inspiration-assets.json'),'utf8')).files;
  for(const image of hero.querySelectorAll('img')) {
    const src=(image.getAttribute('src')||'').replace(/^\.\//,'');
    const asset=assets.find(file=>file.path===src);
    image.complete=true;image.naturalWidth=Number(asset?.width)||16;image.naturalHeight=Number(asset?.height)||16;
  }
  return read;
}
function rendererPage(width,height,options={}) {
  const fixture={scrollAdjustments:[],worksUpdates:[],hoverUpdates:[],clock:0};
  const page=makePage(width,height,options.initialScroll||0,options.storage||new Map(),true,{beforeScroll(args){
    fixture.read=installViewDOM(args,{width,height});
    const documentEvents=new Map();
    args.document.hidden=false;
    args.document.addEventListener=(name,callback)=>{if(!documentEvents.has(name))documentEvents.set(name,[]);documentEvents.get(name).push(callback);};
    args.document.dispatchEvent=event=>{for(const callback of documentEvents.get(event.type)||[])callback(event);};
    args.context.performance={now:()=>fixture.clock};
    args.window.scrollTo=({top,behavior})=>{fixture.scrollAdjustments.push({top,behavior});args.window.scrollY=top;};
    if(options.visualEnd)args.window.AboutTextFlight.getVisualEnd=()=>args.window.AboutTextFlight.getMetrics().end*.8;
    if(options.worksTravel)args.window.WorksScrollChapter={measure:()=>({travel:options.worksTravel}),setStart(start){fixture.worksStart=start;},update(distance){fixture.worksUpdates.push(distance);}};
    args.window.InspirationHover={update(options){fixture.hoverUpdates.push({...options});}};
    for(const file of ['inspiration-headings.js','inspiration-gestures.js','inspiration.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),args.context,{filename:file});
    fixture.view=args.window.InspirationView;fixture.api=args.window.InspirationChapter;
  }});
  const originalFrame=page.frame;
  page.frame=(step=1000/60)=>{fixture.clock+=step;return originalFrame(step);};
  page.wheel=(dy=120,quiet=230,props={})=>{
    page.frame(quiet);
    const event={type:'wheel',deltaX:0,deltaY:dy,deltaMode:0,target:{closest:()=>null},prevented:false,preventDefault(){this.prevented=true;},...props};
    Object.defineProperty(event,'defaultPrevented',{get(){return this.prevented;}});
    page.window.dispatchEvent(event);
    if(!event.prevented&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      const multiplier=event.deltaMode===1?16:event.deltaMode===2?page.hero.heroLayout.height:1;
      page.scroll(page.window.scrollY-120+event.deltaY*multiplier);
    }
    return event;
  };
  return {page,...fixture};
}
function cardPose(card) {
  const translate=/translate3d\(([-\d.e+]+)px, ([-\d.e+]+)px, 0\)/.exec(card.style.transform||'');
  assert(translate,'Complete card translation: '+card.style.transform);
  const x=Number(translate[1]),y=Number(translate[2]),size=parseFloat(card.style.width);
  const scale=Number(/scale\(([-\d.e+]+)\)/.exec(card.style.transform||'')?.[1]||1);
  const angle=Number(/rotateY\(([-\d.e+]+)deg\)/.exec(card.style.transform||'')?.[1]||0);
  return {x,y,scale,angle,size,visibleSize:size*scale,opacity:Number(card.style.opacity),visibility:card.style.visibility};
}
const journeyHeight=page=>parseFloat(page.nodes['.hero-journey'].style.height);
const chapterStart=page=>Number(page.hero.dataset.inspirationStart);
const localScroll=(page,distance)=>page.window.scrollY-120-chapterStart(page);
const advance=(page,ms)=>{for(let remaining=ms;remaining>0;remaining-=Math.min(remaining,50))page.frame(Math.min(remaining,50));};
function oldPose(page) {
  const n=page.nodes,pick=selector=>plain(n[selector].style);
  return {card:page.card(),portrait:pick('[data-layer="portrait"]'),depth:pick('[data-layer="depth"]'),intro:pick('.hero__intro'),labels:pick('.hero__intro-frame'),welcome:pick('.hero__welcome'),wordmark:pick('.hero__wordmark-frame'),decoration:pick('.hero__decoration-scale'),after:page.flightUpdates.at(-1).after,gate:page.gate(),light:page.hero.dataset.lightProgress,textY:page.copy.style.values.get('--about-text-y'),textOpacity:page.copy.style.values.get('--about-text-opacity')};
}
function snapshot(page,view){return JSON.stringify({scene:page.card(),opacity:page.nodes['.hero__scene'].style.opacity,cards:view.cards.map(c=>({pose:cardPose(c),clip:c.style.clipPath,aria:c.getAttribute('aria-hidden')})),words:view.words.map(c=>({opacity:c.style.opacity,transform:c.style.transform,aria:c.getAttribute('aria-hidden')})),count:view.index.textContent,head:[view.headingLeft.style.opacity,view.headingLeft.style.transform,view.headingRight.style.opacity,view.headingRight.style.transform]});}
function enter(page,start,gesture=10){page.scroll(start-1);page.frames();page.scroll(start+gesture);page.frame();page.frames();}

module.exports={installViewDOM,assetContract,rendererPage};
if(require.main===module)(async()=>{
  assetContract();
  // The optional chapter leaves every preceding pose unchanged. Its real
  // gesture module, renderer and shared clock run together below.
  for(const [width,height] of [[375,812],[768,1024],[1440,800],[1920,960],[2560,1305]]) {
    const baseline=makePage(width,height,0,new Map(),true),f=rendererPage(width,height,{worksTravel:height*8}),{page,view,read}=f;
    await turn();
    const start=chapterStart(page),oldBoundary=journeyHeight(baseline)-height;
    near(start,oldBoundary,'Without a visual-end provider the conservative about boundary is preserved');
    near(journeyHeight(page),height+start+height*2+height*8,'Inspiration has two fixed native anchors before Works');
    for(const distance of [0,height*.13,height*.7,height,(height+start)/2,start-1]) {
      baseline.scroll(distance);page.scroll(distance);baseline.frames();page.frames();
      assert.deepEqual(oldPose(page),oldPose(baseline),'Existing hero/about poses before the chapter are unchanged');
      assert.equal(view.root.hidden,true);
    }
    const nodeCount=view.root.querySelectorAll('img').length+view.root.querySelectorAll('article').length;
    read.allowed=false;page.layout(false);page.scroll(start+10);page.frame();
    assert.equal(view.root.hidden,true,'Raw input cannot hide a still-visible last about glyph');
    assert.equal(view.root.dataset.flipRunning,'false');
    for(let waited=0;view.root.dataset.flipRunning!=='true'&&waited<600;waited+=10)page.frame(10);
    assert.equal(view.root.dataset.flipRunning,'true','The held gesture triggers after the eased text endpoint');
    near(Number(view.root.dataset.flipProgress),0);
    const held=page.window.scrollY,sourceWidth=parseFloat(page.nodes['.hero__scene'].style.width);
    assert.equal(view.flipFront.querySelector('img').getAttribute('src'),'./assets/images/hero/portrait-2456.webp');
    near(Number(page.nodes['.hero__scene'].style.opacity),0,'The WebGL canvas is excluded from rotating planes');
    assert.equal(view.flipFront.style.visibility,'visible');near(cardPose(view.cards[0]).opacity,0);
    advance(page,250);
    const quarter=cardPose(view.cards[0]),frontQuarter=cardPose(view.flipFront);
    assert(quarter.angle>-180&&quarter.angle<-90);
    near(frontQuarter.angle-quarter.angle,180,'Front and back share the vertical-axis turn');
    for(const key of ['x','y','size'])near(frontQuarter[key],quarter[key],'Both image planes share '+key);
    near(quarter.opacity,0,'No girl crossfade before the edge');assert.equal(view.flipFront.style.visibility,'visible');
    assert(parseFloat(page.nodes['.hero__scene'].style.width)>sourceWidth);
    near(Number(view.headingLeft.style.opacity),0,'Headings wait for the rotation');
    advance(page,240);assert.equal(view.flipFront.style.visibility,'visible');near(cardPose(view.cards[0]).opacity,0);
    advance(page,10);
    near(cardPose(view.flipFront).angle,90);near(cardPose(view.cards[0]).angle,-90);
    near((view.flipFront.style.visibility==='visible'?1:0)+cardPose(view.cards[0]).opacity,1,'Exactly one opaque face is presented at the floating-point edge');
    assert.equal(view.cards[0].style.backfaceVisibility,'hidden');
    advance(page,10);assert.equal(view.flipFront.style.visibility,'hidden');near(cardPose(view.cards[0]).opacity,1);
    advance(page,490);
    near(Number(view.root.dataset.flipProgress),1,'Flip completes after 1000 ms without more scrolling');
    assert.equal(view.root.dataset.flipRunning,'false');near(Number(view.headingLeft.style.opacity),0);
    if(width>=1024)for(const i of [1,2])near(Number(view.words[i].style.opacity),0,'Secondary desktop words remain masked');
    advance(page,325);
    assert(Number(view.headingLeft.style.opacity)>0&&Number(view.headingLeft.style.opacity)<1,'Main titles enter with their own ease-out');
    near(page.window.scrollY,held,'Intro does not advance native card anchors prematurely');
    const leftOffset=Number(/translate3d\(([-\d.e+]+)px/.exec(view.headingLeft.style.transform)[1]);
    assert(leftOffset<0&&Math.abs(leftOffset)<700,'Main entry uses a short measured slide rather than the entire viewport');
    if(width>=1024)for(const i of [1,2])near(Number(view.words[i].style.opacity),0);
    advance(page,325);
    near(Number(view.headingLeft.style.opacity),1,'Main titles finish at 650 ms after the flip');
    near(Number(view.headingRight.style.opacity),1);
    if(width>=1024)for(const i of [1,2])near(Number(view.words[i].style.opacity),0,'Secondary reveal begins only after main entry');
    advance(page,45);
    if(width>=1024)for(const i of [1,2])near(Number(view.words[i].style.opacity),0,'Inactive categories stay outside the single-line mask');
    advance(page,90);
    if(width>=1024)for(const i of [1,2])near(Number(view.words[i].style.opacity),0,'The first category remains the only visible option');
    near(page.window.scrollY,held,'Native correction waits for the secondary cascade');
    advance(page,375);page.frames();
    near(localScroll(page),2,'Completed intro returns to the fixed People anchor');
    assert.equal(f.scrollAdjustments.length,1);assert.equal(f.scrollAdjustments[0].behavior,'instant');
    assert(f.worksUpdates.every(value=>value<0),'Intro rebasing never flashes Works');
    assert.equal(page.raf.size,0,'The single shared clock sleeps once the reveal settles');
    near(journeyHeight(page),height+start+height*2+height*8,'No consumed lead-in remains in the budget');
    near(page.gate(),0);assert.equal(view.root.querySelectorAll('img').length+view.root.querySelectorAll('article').length,nodeCount,'Animation does not allocate DOM clones');
  }

  // One gesture invokes one 800 ms card transition. The image resolves from
  // a smaller blurred transparent card below, with no rotation of its own.
  for(const t of [
    {w:375,h:812,size:260,y:219,back:180,peek:24,font:32,head:563},
    {w:768,h:1024,size:320,y:260,back:220,peek:32,font:48,head:749},
    {w:1440,h:800,size:320,y:240,back:220,peek:32,font:48,head:376},
    {w:1920,h:960,size:400,y:280,back:250,peek:32,font:64,head:448},
    {w:2560,h:1305,size:400,y:452,back:250,peek:32,font:64,head:620},
  ]) {
    const f=rendererPage(t.w,t.h),{page,view,read}=f;await turn();const start=chapterStart(page);
    read.allowed=false;page.layout(false);enter(page,start,t.h*.45);
    const people=cardPose(view.cards[0]);
    near(people.visibleSize,t.size);near(people.x,(t.w-t.size)/2);near(people.y,t.y);
    near(t.y-(parseFloat(view.eyebrow.style.top)+12),t.w<600?48:80,'Eyebrow bottom has the exact gap to the active card');
    near(parseFloat(view.root.style.values.get('--inspiration-heading-size')),t.font);near(parseFloat(view.headingLeft.style.top),t.head);
    assert.equal(view.index.textContent,'01');assert.equal(page.copy.attributes['aria-hidden'],'true');
    assert.deepEqual(f.hoverUpdates.at(-1),{active:0,enabled:true},'People has the active hover gate');
    const firstSnapshot=snapshot(page,view);
    for(const active of [1,2]) {
      const event=page.wheel(120);assert(event.prevented,'A category gesture consumes native distance');page.frame(0);
      near(localScroll(page),active===1?t.h:t.h*2-2,'The target gets a fixed native anchor');
      assert.equal(view.root.dataset.cardRunning,'true');
      const incoming=cardPose(view.cards[active]);near(incoming.opacity,0);near(incoming.scale,.72);near(incoming.angle,0);
      near(incoming.y,t.y+Math.min(t.h*.32,t.size*.7),'New card starts a short distance below its slot');
      assert.equal(f.hoverUpdates.at(-1).enabled,false,'Hover is gated while the card resolves');
      advance(page,100);
      const phase=100/800,p=1-(1-phase)**3,partial=cardPose(view.cards[active]);
      near(Number(view.root.dataset.cardPosition),active-1+p,'The held-scroll transition responds with its timed ease-out');
      assert(partial.opacity>0&&partial.opacity<1,'The image first appears from transparency');
      near(partial.scale,.72+.28*p);near(partial.angle,0,'Incoming cards never rotate');
      near(parseFloat(view.cards[active].style.filter.slice(5)),18*(1-p)**2,'Blur decreases with the same timed pose');
      assert(partial.y>t.y&&partial.y<incoming.y,'The image resolves upward into the front slot');
      if(active===2){assert(cardPose(view.cards[0]).y>t.y-t.peek,'Oldest back card exits downward');assert(parseFloat(view.cards[0].style.filter.slice(5))>0,'Oldest back card blurs during its exit');}
      advance(page,700);page.frames();
      const current=cardPose(view.cards[active]),previous=cardPose(view.cards[active-1]);
      near(current.visibleSize,t.size);near(current.y,t.y);near(current.opacity,1);near(current.angle,0);assert.equal(view.cards[active].style.filter,'none');
      near(previous.visibleSize,t.back);near(previous.y,t.y-t.peek,'Only the immediately preceding card peeks above');
      assert.equal(view.index.textContent,String(active+1).padStart(2,'0'));
      assert.equal(view.cards.filter(c=>c.getAttribute('aria-hidden')==='false').length,1);
      assert.equal(view.words[active].getAttribute('aria-hidden'),'false');
      for(let i=0;i<3;i++)near(Number(view.words[i].style.opacity),i===active?1:0,'Only the active masked category is painted');
      assert.deepEqual(f.hoverUpdates.at(-1),{active,enabled:true},'Music and Detail receive exactly the same settled hover gate');
      if(active===2)near(cardPose(view.cards[0]).opacity,0,'Oldest image is hidden instead of peeking');
      assert.equal(page.raf.size,0);
    }
    const detailSnapshot=snapshot(page,view);
    for(const active of [1,0]){assert(page.wheel(-120).prevented);page.frame(0);advance(page,800);page.frames();assert.equal(view.index.textContent,String(active+1).padStart(2,'0'));}
    assert.equal(snapshot(page,view),firstSnapshot,'Two reverse gestures reconstruct People exactly');
    for(const active of [1,2]){assert(page.wheel(120).prevented);page.frame(0);advance(page,800);page.frames();assert.equal(view.index.textContent,String(active+1).padStart(2,'0'));}
    assert.equal(snapshot(page,view),detailSnapshot,'Repeated gestures reconstruct the same final stack');
    for(const active of [1,0]){page.wheel(-120);page.frame(0);advance(page,800);page.frames();}
    const beforeReverse=f.scrollAdjustments.length;const reverseEvent=page.wheel(-120);assert(reverseEvent.prevented,'People-up triggers a quarantined return instead of scrolling About');page.frame(0);
    assert.equal(view.root.dataset.flipRunning,'true');const reverseScroll=page.window.scrollY;
    advance(page,450);assert(Number(view.root.dataset.flipProgress)>0&&Number(view.root.dataset.flipProgress)<1);near(page.window.scrollY,reverseScroll);
    page.frames();assert.equal(view.root.hidden,true);near(Number(page.nodes['.hero__scene'].style.opacity),1);
    assert.equal(f.scrollAdjustments.length,beforeReverse+1,'The return rebases once to the About endpoint');
    near(localScroll(page),-1,'The return holds exactly one pixel before Inspiration');assert.equal(page.copy.attributes['aria-hidden'],'false');assert.equal(page.raf.size,0);
  }

  // A long entrance gesture cannot skip cards or leave a hidden distance on
  // reload. Fresh gestures after the headings are handled by the same module.
  {
    const f=rendererPage(1920,960,{worksTravel:960*8}),{page,view}=f;await turn();const start=chapterStart(page);
    page.scroll(start-1);page.frames();page.scroll(start+20);page.frame();assert.equal(view.root.dataset.flipRunning,'true');advance(page,200);
    page.scroll(start+960*4);page.frame();page.frames();
    assert.equal(view.index.textContent,'01');near(localScroll(page),2);near(journeyHeight(page),960+start+960*2+960*8);
    assert.equal(f.scrollAdjustments.length,1);assert(f.worksUpdates.every(value=>value<0));
    const reloaded=rendererPage(1920,960,{initialScroll:page.window.scrollY,worksTravel:960*8});await turn();reloaded.page.frames();
    assert.equal(reloaded.view.index.textContent,'01');assert.equal(reloaded.view.root.dataset.flipRunning,'false');assert.equal(reloaded.scrollAdjustments.length,0);
    near(journeyHeight(reloaded.page),journeyHeight(page));
    assert(page.wheel(120).prevented);page.frame(0);
    for(let i=0;i<12;i++){assert(page.wheel(120,50).prevented);page.frame(0);}
    page.frames();assert.equal(view.index.textContent,'02','A long momentum burst changes only one card');
    assert.equal(f.scrollAdjustments.length,2,'Momentum does not inject repeated anchors');
    page.wheel(120,230);page.frame(0);page.frames();assert.equal(view.index.textContent,'03','A fresh gesture changes exactly the next card');
  }

  // Native rebounds do not count as a deliberate People-up navigation.
  {
    const f=rendererPage(1920,960),{page,view}=f;await turn();const start=chapterStart(page);
    enter(page,start,20);page.scroll(start-9);page.frame();advance(page,100);
    page.scroll(start+2);page.frame();assert.equal(view.root.dataset.flipRunning,'false');page.frames();
    assert.equal(view.root.hidden,false);near(localScroll(page),2);
    assert(page.wheel(-120).prevented);page.frame();assert.equal(view.root.dataset.flipRunning,'true');page.frames();
    assert.equal(view.root.hidden,true);near(localScroll(page),-1);assert.equal(page.raf.size,0);
  }

  // A missing back image holds the intact source instead of exposing an empty
  // reverse; loading it starts the same timed action at the held position.
  {
    const f=rendererPage(1920,960),{page,view}=f;await turn();const start=chapterStart(page),girl=view.cards[0].querySelector('.inspiration__image');
    girl.complete=false;page.scroll(start+10);page.frames();assert.equal(view.root.hidden,true);near(Number(page.nodes['.hero__scene'].style.opacity),1);
    page.scroll(start+960*3);page.frames();assert.equal(view.root.hidden,true,'A loading-time gesture burst still preserves the intact front');
    girl.complete=true;girl.dispatchEvent({type:'load'});page.frame();assert.equal(view.root.dataset.flipRunning,'true');page.frames();
    near(cardPose(view.cards[0]).opacity,1);assert.equal(view.index.textContent,'01','Loading-time momentum cannot seed Detail before the first card');near(localScroll(page),2);
  }

  // History and responsive layout changes restore a settled category without
  // replaying an entrance, and reduced motion uses the same fixed anchors.
  {
    const first=rendererPage(1920,960);await turn();const start=chapterStart(first.page);
    const restored=rendererPage(1920,960,{initialScroll:120+start+960});await turn();restored.page.frames();
    assert.equal(restored.view.index.textContent,'02');assert.equal(restored.view.root.dataset.flipRunning,'false');assert.equal(restored.page.raf.size,0);
    restored.page.layout(true);restored.read.allowed=true;restored.page.resize(1440,800);restored.page.frames();
    assert.equal(restored.view.index.textContent,'02','Resize preserves the settled current category');
    restored.page.window.dispatchEvent({type:'pageshow'});restored.page.frames();assert.equal(restored.page.raf.size,0);
    restored.page.reduced.matches=true;restored.page.reduced.dispatchEvent({type:'change'});restored.page.frames();
    near(Number(restored.view.root.dataset.flipProgress),1);assert.equal(restored.page.raf.size,0);
  }

  // The visual-end provider removes only the old empty about tail. Live panel
  // duration changes preserve the first rebased pose and settle the shared RAF.
  {
    const f=rendererPage(1920,960,{visualEnd:true});await turn();const metrics=f.page.window.AboutTextFlight.getMetrics();
    const tuning=f.page.window.HeroScrollEffect.getSettings();
    const lightEnd=metrics.start+(metrics.end-metrics.start)*(tuning.aboutBackgroundStart+tuning.aboutBackgroundDuration*tuning.aboutRevealScrollDuration);
    near(chapterStart(f.page),960+Math.max(metrics.end*.8,lightEnd+960*.08)*2.5);
    enter(f.page,chapterStart(f.page),30);
    f.page.window.HeroScrollEffect.setSettings({aboutScrollDuration:3});f.page.frame();
    near(Number(f.view.root.dataset.flipProgress),1,'Live duration changes preserve the completed pose on their first frame');f.page.frames();assert.equal(f.page.raf.size,0);
  }

  // Intermediate desktop widths keep both phrases outside the card, while
  // short tablets compress only lower gaps instead of colliding with the UI.
  for(const [width,height] of [[1024,713],[1200,713],[1024,600],[1200,600],[768,713]]) {
    const {page,view,read}=rendererPage(width,height);await turn();const start=chapterStart(page);
    read.allowed=false;page.layout(false);enter(page,start,10);
    for(const active of [0,1,2]) {
      if(active){page.wheel(120);page.frame(0);advance(page,800);page.frames();}
      const card=cardPose(view.cards[active]),font=parseFloat(view.root.style.values.get('--inspiration-heading-size'));
      const left=parseFloat(view.headingLeft.style.left),leftY=parseFloat(view.headingLeft.style.top),rightY=parseFloat(view.headingRight.style.top),footerTop=height-44;
      assert([left,leftY,rightY,font].every(Number.isFinite));assert(leftY+font<footerTop&&rightY+font<footerTop);assert(parseFloat(view.counter.style.top)+12<footerTop);
      if(width<1024){assert(leftY>=card.y+card.visibleSize+24-.001);assert(rightY>=leftY+font);assert(parseFloat(view.counter.style.top)+12<leftY);}
      else{
        near(left,24);near(parseFloat(view.headingRight.style.right),24);
        const leftEnd=left+font*5+parseFloat(view.headingLeft.style.gap)+font*[2.95,2.55,2.32][active];
        assert(leftEnd<card.x,'Side title remains outside the active card');assert(width-24-font*7.5>card.x+card.visibleSize);
      }
    }
  }
  console.log('Inspiration checks passed: timed masked header cascade, one-gesture 800ms cards from opacity/zoom/blur, equal hover gates, exact adaptive assets/stack, automatic flip/quarantined reverse, loading/history/budget and one idle clock.');
})().catch(error=>{console.error(error);process.exitCode=1;});
