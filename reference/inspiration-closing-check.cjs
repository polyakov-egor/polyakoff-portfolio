/* Run the production closing layer with the real inspiration renderer,
   hero/about clock and projected Works gallery. No browser layout is read
   after measurement and no second animation clock is introduced. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {makePage,turn,near}=require('./scroll-check.cjs');
const {installViewDOM}=require('./inspiration-check.cjs');
const site=path.join(__dirname,'..');

function fixture(width,height,initialScroll=0){
  const f={clock:0,reads:0,adjustments:[],width,height};
  const page=makePage(width,height,initialScroll,new Map(),true,{beforeScroll(args){
    f.read=installViewDOM(args,{width,height});
    const originalCreate=args.document.createElement;
    args.document.createElement=tag=>{
      const node=originalCreate(tag),originalRead=node.getBoundingClientRect;
      node.getBoundingClientRect=()=>{
        if(!node.className.startsWith('inspiration-closing__'))return originalRead();
        assert(f.read.allowed,'Closing render must use cached text widths');f.reads++;
        let plane=node.parent;
        while(plane&&!/inspiration-closing__(?:old|new)-layer/.test(plane.className))plane=plane.parent;
        if(plane)assert(!plane.style.transform||plane.style.transform==='none','Remeasure neutralizes the rolled plane before reading natural text bounds');
        let ancestor=node;while(ancestor&&!ancestor.className.split(' ').includes('inspiration-closing'))ancestor=ancestor.parent;
        const font=parseFloat(ancestor?.style.getPropertyValue('--inspiration-closing-font'))||64;
        if(node.className==='inspiration-closing__creation'){
          assert(!node.style.transform||node.style.transform==='none','Remeasure neutralizes recession before reading natural creation bounds');
          const stacked=ancestor?.dataset.layout==='stacked';
          return {left:0,top:0,width:font*(stacked?7.3:11.7),height:stacked?font*2+8:font};
        }
        const known=font===48?{lead:240,detail:111,right:360}:font===32?{lead:160,detail:74,right:240}:{lead:320*font/64,detail:146*font/64,right:479*font/64};
        const key=node.className.endsWith('__lead')?'lead':node.className.endsWith('__detail')?'detail':'right';
        return {left:0,top:0,width:known[key],height:font};
      };
      return node;
    };
    const create=(tag,className)=>{const node=args.document.createElement(tag);node.className=className;return node;};
    const journey=create('section','works-journey'),viewport=create('div','works-viewport'),list=create('div','works-cards');
    viewport.setAttribute('data-works-gallery','');list.setAttribute('data-works-cards','');viewport.append(list);journey.append(viewport);
    args.nodes['.works-journey']=journey;args.nodes['[data-works-gallery]']=viewport;
    f.journey=journey;f.viewport=viewport;f.list=list;
    args.document.hidden=false;args.document.addEventListener=()=>{};
    args.context.performance={now:()=>f.clock};
    args.window.scrollTo=({top})=>{f.adjustments.push(top);args.window.scrollY=top;};
    for(const file of ['inspiration-headings.js','inspiration-gestures.js','inspiration-closing.js','inspiration.js','works-gallery.js','works-scroll.js']){
      vm.runInContext(fs.readFileSync(path.join(site,file),'utf8'),args.context,{filename:file});
    }
    f.api=args.window.InspirationClosing;f.view=args.window.InspirationView;
  }});
  const frame=page.frame;
  page.frame=(step=1000/60)=>{f.clock+=step;return frame(step);};
  const resize=page.resize;
  page.resize=(nextWidth,nextHeight)=>{f.width=nextWidth;f.height=nextHeight;return resize(nextWidth,nextHeight);};
  f.page=page;f.root=page.hero.querySelector('.inspiration-closing');
  f.left=f.root.querySelector('.inspiration-closing__phrase--left');
  f.right=f.root.querySelector('.inspiration-closing__phrase--right');
  f.creation=f.root.querySelector('.inspiration-closing__creation');
  f.oldLayer=f.root.querySelector('.inspiration-closing__old-layer');
  f.newLayer=f.root.querySelector('.inspiration-closing__new-layer');
  f.wheel=(dy=120,quiet=230,properties={})=>{
    page.frame(quiet);
    const event={type:'wheel',deltaX:0,deltaY:dy,deltaMode:0,target:{closest:()=>null},prevented:false,preventDefault(){this.prevented=true;},...properties};
    Object.defineProperty(event,'defaultPrevented',{get(){return this.prevented;}});
    page.window.dispatchEvent(event);
    if(!event.prevented&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      const multiplier=event.deltaMode===1?16:event.deltaMode===2?height:1;
      page.scroll(page.window.scrollY-120+event.deltaY*multiplier);
    }
    return event;
  };
  return f;
}
const position=node=>{
  const match=/translate3d\(([-\d.]+)(?:px)?, ([-\d.]+)(?:px)?, (?:[-\d.]+)(?:px)?\)/.exec(node.style.transform);
  assert(match,'A complete cached heading pose exists');return {x:Number(match[1]),y:Number(match[2])};
};
const begin=page=>Number(page.hero.dataset.inspirationStart);
const advance=(page,ms)=>{for(let left=ms;left>0;left-=Math.min(left,50))page.frame(Math.min(left,50));};
function enter(f){const {page}=f,start=begin(page);page.scroll(start-1);page.frames();page.scroll(start+10);page.frame();page.frames();}
function input(f,type,properties={}){
  const event={type,target:{closest:()=>null},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...properties};
  f.page.window.dispatchEvent(event);return event;
}

module.exports={fixture,enter,advance};
if(require.main===module)(async()=>{
  // Exact Figma final compositions and deterministic partial/reverse poses.
  for(const [width,height,font,stacked,source,final] of [
    [1920,960,64,false,{left:24,word:360,head:448,right:24,rightY:448,gap:16},{left:471.5,right:969.5,y:448,row:0}],
    [768,1024,48,true,{left:194,word:446,head:749,right:204,rightY:814,gap:12},{left:202.5,right:204,y:455.5,row:65}],
    [375,812,32,true,{left:63,word:231,head:563,right:69,rightY:603,gap:8},{left:66.5,right:67.5,y:370,row:40}],
  ]){
    const f=fixture(width,height);await turn();f.page.frames();
    assert.equal(f.api.measure({width,height,font,stacked,source}).travel,height*1.5,'Closing reserves one screen for the merge and half a screen for the title roll');
    const reads=f.reads;f.read.allowed=false;
    f.api.update(height,{rawDistance:height,restore:true});
    near(position(f.left).x,final.left,'Final first phrase is optically centered');
    near(position(f.right).x,final.right,'Final second phrase is optically centered');
    near(position(f.left).y,final.y,'Final headline block is vertically centered');
    near(position(f.right).y,final.y+final.row,'Stacked row pitch matches the artboard');
    near(parseFloat(f.view.root.querySelector('.inspiration__cards').style.transform.match(/, ([-\d.]+)px/)[1]),-height,'Cards leave upward through one viewport');
    assert.equal(f.view.headingLeft.style.visibility,'hidden');
    assert.equal(f.view.headingRight.getAttribute('aria-hidden'),'true');
    f.api.update(height*.33,{rawDistance:height*.33});
    const partial=[f.left.style.transform,f.right.style.transform];
    if(stacked)assert(position(f.left).y>=final.y,'Stacked headline stops at its center without crossing it');
    f.api.update(height*.7,{rawDistance:height*.7});
    f.api.update(height*.33,{rawDistance:height*.33});
    assert.deepEqual([f.left.style.transform,f.right.style.transform],partial,'Reverse exactly restores the same intermediate composition');
    f.api.updateWorks(-100,{holdDistance:height*.9,height});
    assert.deepEqual([f.left.style.transform,f.right.style.transform],partial,'A negative Works callback does not overwrite partial closing geometry');
    f.api.update(height,{rawDistance:height,restore:true});
    const held=[f.left.style.transform,f.right.style.transform];
    f.api.updateWorks(height*.9,{holdDistance:height*.9,height});
    assert.deepEqual([f.left.style.transform,f.right.style.transform],held,'Headline remains centered up to the cached artwork boundary');
    f.api.updateWorks(height*1.05,{headingProgress:.25});
    near(position(f.left).y,final.y,'The joined phrase is never carried upward by Works');
    assert.equal(f.left.style.opacity,undefined,'Works affects only the completed creation phrase');
    f.api.updateWorks(0,{holdDistance:height*.9,height});
    assert.deepEqual([f.left.style.transform,f.right.style.transform],held,'Reverse restores the exact centered pose');
    f.api.update(-1,{rawDistance:-1});
    assert.equal(f.root.hidden,true);assert.equal(f.view.headingLeft.style.visibility,'');
    assert.equal(f.view.headingLeft.getAttribute('aria-hidden'),null);
    assert.equal(f.view.root.querySelector('.inspiration__cards').style.transform,'');
    assert.equal(f.reads,reads,'All scroll, reverse and Works frames perform zero layout reads');
  }

  // The new message rolls through the centered band for 550ms on the shared
  // clock. Native overshoot cannot change either plane or the backdrop pose.
  for(const [width,height,font,stacked,source] of [
    [375,812,32,true,{left:63,word:231,head:563,right:69,rightY:603,gap:8}],
    [768,1024,48,true,{left:194,word:446,head:749,right:204,rightY:814,gap:12}],
    [1920,960,64,false,{left:24,word:360,head:448,right:24,rightY:448,gap:16}],
    [2560,1305,64,false,{left:24,word:360,head:620,right:24,rightY:620,gap:16}],
  ]){
    const f=fixture(width,height);await turn();f.page.frames();
    f.api.measure({width,height,font,stacked,source});
    const reads=f.reads;f.read.allowed=false;
    const pose=()=>JSON.stringify({old:f.oldLayer.style.transform,new:f.newLayer.style.transform,creation:f.creation.style.transform,
      oldOpacity:Number(f.oldLayer.style.opacity).toFixed(5),newOpacity:Number(f.newLayer.style.opacity).toFixed(5),
      oldVisible:f.oldLayer.style.visibility,newVisible:f.newLayer.style.visibility,morph:f.root.dataset.morphProgress});
    input(f,'wheel',{deltaX:0,deltaY:120,deltaMode:0});
    f.api.update(height,{rawDistance:height});
    assert.equal(f.root.dataset.morphProgress,'0.00000','The joined original title is intact at the merge checkpoint');
    near(f.api.getBlackProgress(),0,'The background stays light until the title starts to turn');
    assert.equal(f.oldLayer.style.visibility,'visible');assert.equal(f.newLayer.style.visibility,'hidden');
    const time=f.clock;
    assert(input(f,'keydown',{key:'PageDown'}).defaultPrevented);
    const forward=(elapsed,raw=height)=>f.api.update(raw,{rawDistance:raw,now:time+elapsed});
    forward(137.5,height*2);
    near(Number(f.root.dataset.morphProgress),.25,'A quarter of the title roll is reached at 137.5ms');
    near(f.api.getBlackProgress(),.103515625,'The bottom-up reveal uses the same quintic progress as the title');
    const quarter=pose();
    assert(position(f.oldLayer).y<0&&position(f.newLayer).y>0,'Outgoing and incoming titles pass through opposite sides of the reading band');
    assert(/rotateX\((?!0\.0000)[\d.]+deg\)/.test(f.oldLayer.style.transform),'Both full-line planes tilt during the roll');
    forward(275,height*.9);
    near(Number(f.root.dataset.morphProgress),.5);
    f.api.updateTheme((_, y)=>y<height/2?1:0);
    assert.equal(f.oldLayer.style.color,'#1d1d1d','The upper face stays dark over the remaining light');
    assert.equal(f.newLayer.style.color,'#fff','The lower face turns white over the rising dark surface');
    assert(f.oldLayer.style.transform.includes('rotateX(45.0000deg)')&&f.newLayer.style.transform.includes('rotateX(-45.0000deg)'),
      'At the handoff the neighboring faces have opposing pitches, matching the reference roll');
    assert(f.oldLayer.style.transform.includes('rotateZ(-8.0000deg)')&&f.newLayer.style.transform.includes('rotateZ(-8.0000deg)'),
      'The full-line pair shares the short diagonal bank seen in the first reference transition');
    assert(position(f.newLayer).y-position(f.oldLayer).y<Math.max(font+(stacked?(source.rightY-source.head):0),font*2+8)*2,
      'The titles stay in one compact reading band instead of sliding several line heights apart');
    near(Number(f.oldLayer.style.opacity),1,'The outgoing readable face stays solid');
    near(Number(f.newLayer.style.opacity),1,'The incoming readable face stays solid');
    assert.equal(f.oldLayer.getAttribute('aria-hidden'),'true');assert.equal(f.newLayer.getAttribute('aria-hidden'),'false','Only the incoming readable message is announced after halfway');
    forward(550);
    assert.equal(f.root.dataset.morphProgress,'1.00000');assert.equal(f.oldLayer.style.visibility,'hidden');assert.equal(f.newLayer.style.visibility,'visible');
    near(f.api.getBlackProgress(),1,'The background is dark before Works can enter');
    assert(f.oldLayer.style.transform.includes('rotateX(90.0000deg)')&&f.newLayer.style.transform.includes('rotateX(0.0000deg)'),
      'The outgoing title becomes edge-on while the new title settles flat');
    near(Number(f.oldLayer.style.opacity),0,'The old edge darkens out before Works');
    assert.equal(f.root.classList.contains('is-morphing'),false,'The completed new title leaves the temporary center mask');
    assert.equal(f.creation.getAttribute('aria-label'),'From inspiration to creation');
    f.clock=time+600;
    assert(input(f,'keydown',{key:'PageUp'}).defaultPrevented);
    f.api.update(height*2,{rawDistance:height*2,now:f.clock+412.5});
    assert.equal(pose(),quarter,'The reverse animation reconstructs the exact same intermediate roll');
    near(f.api.getBlackProgress(),.103515625,'Reverse restores the identical matte position');
    f.api.update(height*1.5,{rawDistance:height*1.5,now:f.clock+550});
    assert.equal(f.root.dataset.morphProgress,'0.00000');
    f.api.update(height*1.5,{rawDistance:height*1.5,restore:true});
    const titleWidth=font*(stacked?7.3:11.7),titleHeight=stacked?font*2+8:font;
    near(position(f.creation).x,(width-titleWidth)/2,'New title is centered from its measured width');
    near(position(f.creation).y,(height-titleHeight)/2,'Mobile two-line and larger one-line new titles share a centered block');
    const titleBounds=f.api.getCreationBounds();
    near(titleBounds.left,(width-titleWidth)/2,'Cached image collision bounds match the natural centered title');
    near(titleBounds.bottom,(height+titleHeight)/2,'Collision uses the bottom edge of the complete title block');
    f.api.updateWorks(100,{headingProgress:.5});
    near(position(f.creation).y,(height-titleHeight)/2,'Works leaves the completed new title fixed at screen center');
    assert(f.creation.style.transform.endsWith('scale(0.87500)'),'Half of the collision interval recedes halfway toward75%');
    near(Number(f.creation.style.opacity),.5,'The same collision progress fades the title smoothly');
    assert.equal(f.oldLayer.style.visibility,'hidden','The previous title cannot reappear when Works begins');
    f.api.updateWorks(200,{headingProgress:1});
    assert(f.creation.style.transform.endsWith('scale(0.75000)'),'The completed recession stops at75%');
    near(Number(f.creation.style.opacity),0,'The completed title is fully transparent');
    assert.equal(f.creation.style.visibility,'hidden');assert.equal(f.creation.getAttribute('aria-hidden'),'true');
    f.api.updateWorks(100,{headingProgress:.5});
    assert(f.creation.style.transform.endsWith('scale(0.87500)'),'Reverse restores the exact intermediate scale');
    near(Number(f.creation.style.opacity),.5);
    f.api.updateWorks(0,{headingProgress:1});
    near(position(f.creation).y,(height-titleHeight)/2,'Returning from Works restores the exact new-title center');
    assert(f.creation.style.transform.endsWith('scale(1.00000)'));near(Number(f.creation.style.opacity),1);assert.equal(f.creation.style.visibility,'visible');
    f.api.update(height*1.1,{rawDistance:height*1.1,reducedMotion:true});assert.equal(f.root.dataset.morphProgress,'0.00000');
    near(f.api.getBlackProgress(),0);
    f.api.update(height*1.3,{rawDistance:height*1.3,reducedMotion:true});assert.equal(f.root.dataset.morphProgress,'1.00000','Reduced motion replaces the tilted roll with a deterministic midpoint swap');
    near(f.api.getBlackProgress(),1,'Reduced motion switches background at the same midpoint');
    f.api.update(-1,{rawDistance:-1});assert.equal(f.root.hidden,true);
    near(f.api.getBlackProgress(),0,'Reversing before the closing chapter clears its black field');
    assert.equal(f.reads,reads,'The complete title roll, reverse, Works handoff and reduced motion use cached geometry');
  }

  // Real hero/about + timed category gestures + new one-screen close + actual
  // Works projection, including a large gesture and its momentum tail.
  for(const [width,height] of [[375,812],[768,1024],[1920,960],[2560,1305]]){
    const f=fixture(width,height),{page}=f;await turn();page.frames();
    const start=begin(page),worksBudget=Number(f.journey.dataset.totalTravel)||height*(width<600?6:8);
    near(parseFloat(page.nodes['.hero-journey'].style.height),height+start+height*3.5+worksBudget,'Journey includes exactly the merge screen and half-screen title roll');
    f.read.allowed=false;page.layout(false);enter(f);
    for(const expected of ['02','03']){f.wheel(120);page.frame(0);advance(page,1200);page.frames();assert.equal(f.view.index.textContent,expected);}
    assert.equal(f.root.hidden,true,'The final Detail card remains intact until a new downward gesture');
    const exiting=f.wheel(height*2);assert.equal(exiting.prevented,false,'The next gesture starts ordinary closing scroll');
    // Continue one real momentum burst while the damped visual catches up.
    for(let frame=0;f.root.dataset.locked!=='true'&&frame<90;frame++)f.wheel(80,40);
    assert.equal(f.root.dataset.progress,'1.00000');assert.equal(f.root.dataset.locked,'true');
    near(page.window.scrollY-120-start,height*3-2,'An oversized gesture stops at the centered heading checkpoint');
    assert(!page.hero.classList.contains('is-works'),'Overshoot cannot enter Works before a distinct gesture');
    const held=[f.left.style.transform,f.right.style.transform];
    const tail=f.wheel(80,40);assert.equal(tail.prevented,true,'Momentum from the closing gesture is absorbed');page.frames();
    assert.deepEqual([f.left.style.transform,f.right.style.transform],held);
    const next=f.wheel(60,230);assert.equal(next.prevented,true,'A fresh gesture is consumed to start the complete title roll');
    advance(page,275);
    assert(!page.hero.classList.contains('is-works'),'Works stays hidden while the next gesture begins the title roll');
    assert(Number(f.root.dataset.morphProgress)>0&&Number(f.root.dataset.morphProgress)<1);
    page.scroll(start+height*4);page.frame(0);
    near(Number(f.root.dataset.morphProgress),.5,'The title roll follows elapsed time even when native input overshoots Works');
    near(Number(page.hero.style.getPropertyValue('--works-black-progress')),.5,'The actual hero clock starts the dark return at the closing title');
    assert(!page.hero.classList.contains('is-works'),'Works cannot appear halfway through the new message');
    assert(!f.viewport.classList.contains('works-is-preview'),'The title can roll into view before the first project edge enters');
    const hold=Number(f.journey.dataset.headingHoldDistance),worksStart=start+height*3.5;
    const peekPhases=[];
    for(let frame=0;frame<11;frame++){
      assert(f.wheel(6,25).prevented,'Residual input cannot leave the timed title transition');
      if(f.viewport.classList.contains('works-is-preview'))peekPhases.push(Number(f.journey.dataset.helixProgress));
    }
    assert(peekPhases.length>=8&&peekPhases[0]<peekPhases.at(-1),'The timed title gives the orbit over 175ms to enter');
    near(page.window.scrollY-120,worksStart-2,'A single gesture lands immediately before Works at the completed title');
    assert.equal(f.root.dataset.morphProgress,'1.00000');
    near(Number(page.hero.style.getPropertyValue('--works-black-progress')),1,'The backdrop still finishes with the title at 550ms');
    assert(f.viewport.classList.contains('works-is-preview'),'The completed title lets the first project edge peek in');
    assert(!page.hero.classList.contains('is-works'),'The peek consumes no Works scroll distance');
    assert.equal(f.viewport.getAttribute('aria-hidden'),'true','The preview does not introduce focusable projects');
    assert(f.wheel(2,40).prevented,'The triggering gesture tail cannot enter Works after completion');
    const tailPhases=[peekPhases.at(-1)];
    for(const interval of [60,100,100,100,100]){
      advance(page,interval);
      tailPhases.push(Number(f.journey.dataset.helixProgress));
    }
    const steps=tailPhases.slice(1).map((phase,index)=>phase-tailPhases[index]);
    assert(steps.every((step,index)=>step>0&&(index===0||step<steps[index-1])),
      'The helix progressively slows during the 500ms after the title settles');
    assert(steps.at(-1)<steps.at(-2)/5,'The final 100ms cover less than a fifth of the preceding interval');
    const end=tailPhases.at(-1);
    near(end,page.window.WorksGallery.getLayout().entrancePeekPhase,'The independent tail ends at the preview hold');
    assert.equal(page.raf.size,0,'The shared clock sleeps at the completed preview');
    assert.equal(f.wheel(120,230).prevented,false,'A fresh forward gesture leaves the completed title for Works');
    page.scroll(worksStart+2);page.frames();
    assert(page.hero.classList.contains('is-works'),'Actual Works enters immediately after the new-title interval');
    assert(!f.viewport.classList.contains('works-is-preview'),'Actual Works takes over the same visible layer');
    assert.equal(f.root.dataset.morphProgress,'1.00000');
    near(Number(page.hero.style.getPropertyValue('--works-black-progress')),1,'Works enters over the already dark backdrop');
    const creationHeld=f.creation.style.transform;
    page.scroll(worksStart+hold-.5);page.frames();
    assert.equal(f.creation.style.transform,creationHeld,'New title holds at center until images reach its cached lower edge');
    page.scroll(worksStart+hold+height*.2);page.frames();
    near(position(f.creation).y,position({style:{transform:creationHeld}}).y,'The actual gallery collision never shifts the title upward');
    assert(Number(f.creation.style.opacity)<1,'Images reaching the title start its fade');
    assert(/scale\(0\./.test(f.creation.style.transform),'The title recedes after the actual gallery collision');
    page.scroll(worksStart+2);page.frames();
    assert.equal(f.creation.style.transform,creationHeld,'Works reverse restores the completed new title');
    f.wheel(-height,230);page.frames();
    assert.equal(f.root.dataset.morphProgress,'0.00000','Crossing back from Works completes the reverse animation');
    assert(!f.viewport.classList.contains('works-is-preview'),'The first project edge clears when the previous title returns');
    assert.equal(f.root.dataset.progress,'1.00000','Reverse lands at the centered old headline');
    near(Number(page.hero.style.getPropertyValue('--works-black-progress')),0,'Reverse restores light before the title roll');
    if(width===1920){
      const phase=()=>Number(f.journey.dataset.helixProgress);
      const peek=page.window.WorksGallery.getLayout().entrancePeekPhase;
      assert(f.wheel(60,230).prevented,'A fresh gesture restarts the title and preview');
      advance(page,550);
      const beforeReverse=phase();
      assert(beforeReverse<peek&&page.raf.size===1,'The live preview has room to move after the title');
      assert(f.wheel(-60,0).prevented,'A fresh reverse can start while the preview is still moving');
      page.frame(0);
      near(phase(),beforeReverse,'Starting reverse latches the live camera pose without jumping ahead');
      advance(page,275);
      assert(phase()<beforeReverse,'The camera retraces the same entrance during the reverse roll');
      advance(page,275);
      assert(!f.viewport.classList.contains('works-is-preview'));
      assert.equal(f.root.dataset.morphProgress,'0.00000');

      assert(f.wheel(60,230).prevented);
      advance(page,550);
      const beforeAdvance=phase();
      assert.equal(f.wheel(30,0).prevented,false,'The preview tail leaves the next forward gesture native');
      page.frame(50);
      assert(page.hero.classList.contains('is-works')&&phase()>beforeAdvance&&phase()<peek,
        `Native Works advances the live pose while blending the preview (class=${page.hero.className}, phase=${phase()}, before=${beforeAdvance}, peek=${peek})`);
      advance(page,450);
      assert(phase()>peek,'The native movement is fully added to the original peek after the tail');
      f.wheel(-height,230);page.frames();
      assert.equal(f.root.dataset.morphProgress,'0.00000');
    }
    assert.equal(f.wheel(-120,230).prevented,false,'Fresh reverse input resumes the native merge');
    page.scroll(start+height*2+height*.4);page.frames();
    assert(Number(f.root.dataset.progress)<1,'Reverse traverses the merge');
    page.scroll(start+height*2-10);page.frames();assert.equal(f.root.hidden,true,'Reverse restores the original category headline');
    assert.equal(page.raf.size,0,'The shared clock goes idle after each settled chapter');
  }

  // A history restore already inside Works does not capture an old gesture.
  const baseline=fixture(1920,960);await turn();baseline.page.frames();
  const start=begin(baseline.page),restored=fixture(1920,960,120+start+960*4);await turn();restored.page.frames();
  assert.equal(restored.root.dataset.locked,'false');assert(restored.page.hero.classList.contains('is-works'));
  assert.equal(restored.adjustments.length,0,'Restoring deep Works never scrolls the document to the checkpoint');

  // History inside the reserved interval selects an endpoint, with no
  // frozen tilted planes or forced change to the browser scroll position.
  {
    const f=fixture(1920,960,120+start+960*3.25+1);await turn();f.page.frames();
    near(Number(f.root.dataset.morphProgress),1,'History resolves the midpoint to the complete new title');
    assert.equal(f.root.dataset.locked,'false');assert(!f.page.hero.classList.contains('is-works'));
    assert.equal(f.adjustments.length,0,'A title-roll restore never captures a fresh checkpoint');
    assert.equal(f.page.raf.size,0,'Restored title has no autonomous animation clock');
    f.page.resize(375,812);f.page.frames();
    const local=f.page.window.scrollY-120-begin(f.page),expected=Number(local>=812*3.25);
    near(Number(f.root.dataset.morphProgress),expected,'Resize retains a complete pose using the new geometry');
    near(position(f.creation).x,(375-32*7.3)/2,'Resize uses the measured mobile line width');
    near(position(f.creation).y,(812-72)/2,'Mobile two-line title remains fixed at the measured center during Works');
    assert.equal(f.adjustments.length,0);assert.equal(f.page.raf.size,0);
  }

  // Browser history can restore its native position only after pageshow and
  // the font/layout pass have already rendered the top of the document.
  // No wheel/touch/key input precedes this late native scroll event.
  for(const restoredUnits of [3.3,3.5+.05]){
    const f=fixture(1920,960),{page}=f;await turn();page.frames();
    page.window.dispatchEvent({type:'pageshow'});page.frames();
    const target=begin(page)+960*restoredUnits;
    page.scroll(target);page.frames();
    assert.equal(f.adjustments.length,0,'A late native history restore is never rebased to the merge checkpoint');
    near(page.window.scrollY-120,target,'Late native history retains the exact restored document distance');
    assert.equal(f.root.dataset.locked,'false','Late history does not capture a new centered-heading gesture');
    near(Number(f.root.dataset.morphProgress),1,'Late history restores the completed new phrase');
    assert.equal(page.hero.classList.contains('is-works'),restoredUnits>3.5,'Late history restores Works only beyond the title-roll boundary');
    assert.equal(page.raf.size,0);

    if(restoredUnits>3.5){
      page.scroll(0);page.frames();
      assert.equal(f.root.hidden,true,'Returning to the top clears the restored closing layer');
      const realInput=f.wheel(120,230);assert.equal(realInput.prevented,false,'The first real wheel at the top remains native');page.frames();
      enter(f);
      for(const expected of ['02','03']){f.wheel(120);page.frame(0);advance(page,1200);page.frames();assert.equal(f.view.index.textContent,expected);}
      f.wheel(960*2,230);page.frames();
      assert.equal(f.root.dataset.locked,'true','After real navigation, the centered-heading checkpoint is active again');
      near(page.window.scrollY-120-begin(page),960*3-2,'Fresh input still stops at the merge before the title roll');
      assert(!page.hero.classList.contains('is-works'));
    }
  }

  // Small trackpad deltas, touch gesture boundaries, keyboard repeat and panel
  // controls use the same checkpoint without hijacking native input outside it.
  {
    const f=fixture(1920,960);await turn();f.page.frames();
    const send=(type,properties={})=>input(f,type,properties);
    const wheel=(dy,delay)=>{f.clock+=delay;return send('wheel',{deltaX:0,deltaY:dy,deltaMode:0});};
    const lock=()=>{f.api.update(600,{restore:true});f.api.update(960);assert.equal(f.root.dataset.locked,'true');};
    wheel(120,230);lock();assert(wheel(8,20).defaultPrevented,'The current tiny trackpad tail remains consumed');
    assert(wheel(6,230).defaultPrevented,'A new small gesture waits for deliberate displacement');
    assert(wheel(10,12).defaultPrevented);
    assert(wheel(10,12).defaultPrevented,'Cumulative small deltas are consumed by the timed roll');
    assert(f.api.update(958,{now:f.clock+275}).animating,'Cumulative displacement starts a real transition');
    f.api.update(958,{now:f.clock+550});
    assert.equal(f.root.dataset.morphProgress,'1.00000');
    assert(!wheel(120,800).defaultPrevented,'A fresh forward gesture exits the dark title');
    assert(!f.api.update(1437.75,{now:f.clock+16}).animating,'A fractional departure landing cannot start an accidental reverse');
    assert(wheel(-120,230).defaultPrevented,'A genuinely opposite gesture can reclaim the dark checkpoint');
    assert(f.api.update(1437.75,{now:f.clock+275}).animating);
    assert(!send('keydown',{key:'End'}).defaultPrevented,'An explicit End can bypass a running title transition');
    assert(!f.api.update(5000,{now:f.clock+300}).animating);
    wheel(120,230);lock();
    assert(!send('wheel',{deltaX:0,deltaY:120,deltaMode:0,target:{closest:()=>({})}}).defaultPrevented,'Control-panel scrolling is left native');
    assert.equal(f.api.update(960,{rawDistance:958}).locked,true,'Scrolling a control does not release the page checkpoint');
    assert(send('keydown',{key:'PageDown',repeat:true}).defaultPrevented,'Held key repeat cannot skip the centered composition');
    assert(send('keydown',{key:'PageDown',repeat:false}).defaultPrevented,'A new keypress starts the title roll');
    assert(f.api.update(958,{now:f.clock+275}).animating);
    f.api.update(600,{restore:true});
    send('touchstart',{touches:[{clientX:200,clientY:500}]});lock();
    assert(send('touchmove',{touches:[{clientX:200,clientY:430}]}).defaultPrevented,'The swipe that reached the center cannot skip it');
    send('touchend',{touches:[]});
    send('touchstart',{touches:[{clientX:200,clientY:500}]});
    assert(send('touchmove',{touches:[{clientX:200,clientY:470}]}).defaultPrevented,'A distinct next swipe starts the title roll');
    assert(f.api.update(958,{now:f.clock+275}).animating);
    f.api.update(958,{now:f.clock+550});
    send('touchend',{touches:[]});
    send('touchstart',{touches:[{clientX:200,clientY:500}]});
    assert(!send('touchmove',{touches:[{clientX:200,clientY:497}]}).defaultPrevented,'The first clear movement of a native exit swipe remains native');
  }
  console.log('Inspiration closing checks passed: adaptive merge, timed reversible title/background, centered creation hold and 75% recession/fade, cached geometry, restore, resize/reduced and one idle clock.');
})().catch(error=>{console.error(error);process.exitCode=1;});
