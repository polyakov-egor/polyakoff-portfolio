/* Scroll triggers the timed flip; the existing story supplies its clock and
   the eased distance for the two following card changes. */
(() => {
  'use strict';
  const view = window.InspirationView;
  const hero = document.querySelector('.hero');
  const scene = document.querySelector('.hero__scene');
  const portrait = document.querySelector('[data-layer="portrait"]');
  const depth = document.querySelector('[data-layer="depth"]');
  const aboutCopy = document.querySelector('.about-copy');
  if (!view || !hero || !scene || !window.HeroSquircle) return;
  const { root, cards, words, backdrop, lines, flipFront, headingLeft, headingRight, eyebrow, counter, index } = view;
  const clamp = n => Math.max(0, Math.min(1, n));
  const lerp = (a,b,t) => a + (b-a)*t;
  const smooth = (a,b,n) => { const t=clamp((n-a)/(b-a)); return t*t*t*(t*(t*6-15)+10); };
  const easeOut = n => 1-(1-clamp(n))**3;
  // Gentle acceleration and braking keep the one-shot turn even at both ends.
  const flipEase = value => smooth(0,1,value);
  const frames = [
    { w:375,h:812,size:260,r:48,cy:349,back:180,peek:24,eyebrow:0,count:511,left:63,word:231,head:563,right:69,rightY:603,font:32,fontNext:32 },
    { w:768,h:1024,size:320,r:60,cy:420,back:220,peek:32,eyebrow:168,count:693.145,left:194,word:446,head:749,right:204,rightY:814,font:48,fontNext:48 },
    { w:1440,h:800,size:320,r:60,cy:400,back:220,peek:32,eyebrow:148,count:620.145,left:24,word:276,head:376,right:24,rightY:376,font:48,fontNext:48 },
    { w:1920,h:960,size:400,r:80,cy:480,back:250,peek:32,eyebrow:185,count:740.145,left:24,word:360,head:448,right:24,rightY:448,font:64,fontNext:64 },
    { w:2560,h:1305,size:400,r:80,cy:652,back:250,peek:32,eyebrow:369,count:924.145,left:24,word:360,head:620,right:24,rightY:620,font:64,fontNext:64 }
  ];
  let layout = null, closingTravel = 0, pendingRestore = false, lastPaint = null;
  const flip = { initialized:false, value:0, from:0, to:0, started:0, running:false, leadIn:0, lastRaw:null, reveal:0, revealedAt:0, restore:true };
  const chapterUnits = 2;
  const flipMs = 1000, revealMs = 650;
  const returnGate={active:false,waiting:false,wheelId:0,wheelAmount:0,wheelDirection:0,wheelArmed:false,touch:null};
  let canReturn=false;
  function beginFlip(target,now) {
    flip.from=flip.value;flip.to=target;flip.started=now;flip.running=true;
    if(target===0)flip.reveal=0;
  }
  const plates = cards.map(card => card.querySelector('.inspiration__glass'));
  const kinds = cards.map(card => card.querySelector('.inspiration__kind'));
  const media = cards.map(card => [...card.querySelectorAll('.inspiration__image')]);
  const ignoredNavigation = target => Boolean(target?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="slider"], [role="dialog"], .effect-controls, #hero-effect-panel'));
  // Scroll restoration can arrive after pageshow and the font/layout frames.
  // Only an actual page-navigation gesture turns that jump into a new entrance.
  window.addEventListener('pageshow',()=>{pendingRestore=true;returnGate.active=false;returnGate.waiting=false;canReturn=false;});
  window.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||ignoredNavigation(event.target))return;
    if(Number.isFinite(event.deltaY)&&Math.abs(event.deltaY)>.01&&Math.abs(event.deltaX||0)<=Math.abs(event.deltaY))pendingRestore=false;
  },{passive:true});
  window.addEventListener('touchstart',event=>{
    if(event.touches.length===1&&!ignoredNavigation(event.target))pendingRestore=false;
  },{passive:true});
  window.addEventListener('pointerdown',event=>{if(!ignoredNavigation(event.target))pendingRestore=false;},{passive:true});
  window.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||ignoredNavigation(event.target))return;
    if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))pendingRestore=false;
  });

  function wake(){window.dispatchEvent(new CustomEvent('inspiration:ready'));}
  function beginReturn(now){
    if(returnGate.active)return;
    returnGate.active=true;returnGate.waiting=false;canReturn=false;
    returnGate.wheelAmount=0;returnGate.wheelDirection=0;returnGate.wheelArmed=false;
    beginFlip(0,now);wake();
  }
  function releaseReturn(){returnGate.active=false;returnGate.waiting=false;wake();}
  function navigationDirection(event){
    if(['ArrowUp','PageUp','Home'].includes(event.key))return -1;
    if(['ArrowDown','PageDown','End'].includes(event.key))return 1;
    return event.key===' '?(event.shiftKey?-1:1):0;
  }
  // This listener follows the category controller. It consumes only the
  // boundary gesture that controller deliberately released from People.
  window.addEventListener('wheel',event=>{
    if(document.hidden||ignoredNavigation(event.target))return;
    const now=performance.now(),intent=window.SiteWheelIntent?.sample(event,now,layout?.height||1);
    if(!intent)return;
    if(intent.id!==returnGate.wheelId){
      returnGate.wheelId=intent.id;returnGate.wheelAmount=0;returnGate.wheelDirection=0;
      returnGate.wheelArmed=returnGate.active&&returnGate.waiting;
    }
    if(returnGate.active){
      if(returnGate.waiting&&returnGate.wheelArmed){
        if(returnGate.wheelDirection!==intent.direction){returnGate.wheelAmount=0;returnGate.wheelDirection=intent.direction;}
        returnGate.wheelAmount+=Math.abs(intent.delta);
        if(returnGate.wheelAmount>=24){releaseReturn();return;}
      }
      event.preventDefault();return;
    }
    if(intent.direction<0&&canReturn&&!event.defaultPrevented){event.preventDefault();beginReturn(now);}
  },{passive:false});
  window.addEventListener('touchstart',event=>{
    if(event.touches.length!==1||ignoredNavigation(event.target)){returnGate.touch=null;return;}
    const point=event.touches[0];
    returnGate.touch={x:point.clientX,y:point.clientY,fresh:returnGate.active&&returnGate.waiting};
  },{passive:true});
  window.addEventListener('touchmove',event=>{
    const touch=returnGate.touch;
    if(!touch||event.touches.length!==1||ignoredNavigation(event.target))return;
    const point=event.touches[0],dy=touch.y-point.clientY,dx=touch.x-point.clientX;
    if(Math.abs(dy)<3||Math.abs(dx)>Math.abs(dy))return;
    if(returnGate.active){
      if(returnGate.waiting&&touch.fresh){releaseReturn();return;}
      event.preventDefault();return;
    }
    if(dy<0&&canReturn&&!event.defaultPrevented){event.preventDefault();beginReturn(performance.now());}
  },{passive:false});
  for(const name of ['touchend','touchcancel'])window.addEventListener(name,()=>{returnGate.touch=null;},{passive:true});
  window.addEventListener('keydown',event=>{
    if(document.hidden||event.ctrlKey||event.metaKey||event.altKey||ignoredNavigation(event.target))return;
    // Home/End are explicit document navigation, not category boundary steps.
    // The gesture owner releases its anchor and the browser must keep its
    // default jump; do not recapture it as an animated People→About return.
    if(event.key==='Home'||event.key==='End'){
      returnGate.active=false;returnGate.waiting=false;canReturn=false;return;
    }
    const direction=navigationDirection(event);if(!direction)return;
    if(returnGate.active){
      if(returnGate.waiting&&!event.repeat){releaseReturn();return;}
      event.preventDefault();return;
    }
    if(direction<0&&canReturn&&!event.repeat&&!event.defaultPrevented){event.preventDefault();beginReturn(performance.now());}
  });

  function measure({ width, height, anchor }) {
    lastPaint=null;
    const stacked = width < 1024;
    // Interpolate within a composition, never between a tablet's lower
    // headings and a desktop's side headings.
    const family=stacked?frames.slice(0,2):frames.slice(2);
    let a=family[0],b=family[1];
    for(let i=1;i<family.length;i++){a=family[i-1];b=family[i];if(width<=b.w)break;}
    const t=clamp((width-a.w)/(b.w-a.w));
    const value = key => lerp(a[key],b[key],t);
    const typeScale=stacked?1:Math.min(1,width/1440);
    // Desktop centers the card; tablet/phone retain the reading composition
    // from their artboards, with both headings below the card.
    const cy=lerp(a.cy/a.h,b.cy/b.h,t)*height;
    const size=Math.min(value('size'),width-48);
    const cardY=cy-size/2;
    const left=stacked ? width/2+lerp(a.left-a.w/2,b.left-b.w/2,t) : 24;
    const word=stacked ? width/2+lerp(a.word-a.w/2,b.word-b.w/2,t) : 24+(value('word')-24)*typeScale;
    const font=value('font')*typeScale;
    const rowStep=lerp(a.rightY-a.head,b.rightY-b.head,t);
    const sourceGap=lerp(a.head-(a.cy+a.size/2),b.head-(b.cy+b.size/2),t);
    const headGap=stacked?Math.max(24,Math.min(sourceGap,height-80-(cardY+size)-rowStep-font)):0;
    const head=stacked ? cardY+size+headGap : cy+lerp(a.head-a.cy,b.head-b.cy,t)*typeScale;
    const rightY=stacked ? head+rowStep : head;
    layout={width,height,anchor:{...anchor},size,radius:value('r'),cardY,back:value('back'),peek:value('peek'),left,word,head,rightY,
      font,fontNext:value('fontNext')*typeScale,stacked,
      right:stacked ? width/2+lerp(a.right-a.w/2,b.right-b.w/2,t) : 24,
      // Measure from the 12px label's bottom to the active full-size card.
      eyebrow:cardY-(width<600?48:80)-12,
      counter:cardY+size+Math.min(lerp(a.count-a.cy-a.size/2,b.count-b.cy-b.size/2,t),stacked&&headGap<sourceGap?headGap*.55:Infinity),travel:height*chapterUnits+closingTravel+flip.leadIn};
    // Reflow changes measured coordinates, not the current timed transition.
    // Only pageshow/history and the explicit restore API reconstruct a stage.
    root.style.setProperty('--inspiration-card-size',`${size}px`);
    root.style.setProperty('--inspiration-card-radius',`${layout.radius}px`);
    headingLeft.style.left=`${left}px`;headingLeft.style.top=`${head}px`;
    headingRight.style.top=`${rightY}px`;
    if(stacked){headingRight.style.left=`${layout.right}px`;headingRight.style.right='auto';}
    else{headingRight.style.left='auto';headingRight.style.right='24px';}
    eyebrow.style.top=`${layout.eyebrow}px`;counter.style.top=`${layout.counter}px`;
    closingTravel=window.InspirationClosing?.measure({width,height,font,stacked,
      source:{left,word,head,right:layout.right,rightY}})?.travel||0;
    layout.travel=height*chapterUnits+closingTravel+flip.leadIn;
    const src='./assets/images/backgrounds/light.webp';
    if(lines.getAttribute('src')!==src) lines.setAttribute('src',src);
    const scale=Math.max(1,width/2560,height/1305);
    lines.style.transform=`translate3d(${(width-2560*scale)/2}px, ${(height-1305*scale)/2}px, 0) scale(${scale})`;
    return { travel:layout.travel };
  }

  const clipShapes=new WeakMap(),cardFaces=new WeakMap();
  function clipShape(element,width,height,radius) {
    const signature=`${width}|${height}|${radius}`;
    let shape=clipShapes.get(element);
    if(!shape||shape.signature!==signature){
      shape={signature,path:`path('${window.HeroSquircle.path(width,height,radius,1)}')`};
      clipShapes.set(element,shape);
    }
    if(element.style.clipPath!==shape.path)element.style.clipPath=shape.path;
  }
  function place(card,x,y,size,scale=1,radius=layout.radius) {
    card.style.width=`${size}px`;card.style.height=`${size}px`;
    card.style.transform=`translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    let face=cardFaces.get(card);
    if(!face){face=card.querySelector('.inspiration__tilt-face');if(face)cardFaces.set(card,face);}
    // A native-blurred face keeps its clip for the whole category change.
    // Never promote/remove an outer clip every frame around the 3D subtree.
    clipShape(face||card,size,size,radius);
    if(face&&card.style.clipPath!=='none')card.style.clipPath='none';
  }
  function pose(card,scale,y,opacity,z) {
    place(card,(layout.width-layout.size*scale)/2,y,layout.size,scale);
    card.style.opacity=String(opacity);card.style.zIndex=String(z);
    card.style.visibility=opacity>.0001?'visible':'hidden';
  }
  const ready = cardIndex => media[cardIndex].every(img=>window.ChapterAssets?.isImageReady
    ?window.ChapterAssets.isImageReady(img):img.complete&&img.naturalWidth>0);
  function update(localDistance,{reducedMotion=false,requestedLocalDistance=localDistance,now=0,lightProgress=1}={}) {
    if(!layout)return;
    const originalRaw=requestedLocalDistance;
    const held=window.InspirationGestures?.hold?.({height:layout.height,rawDistance:originalRaw,
      ready:!returnGate.active&&flip.to===1&&!flip.running&&flip.reveal===1,
      restore:!flip.initialized||flip.restore||pendingRestore});
    if(held?.restore)flip.restore=true;
    let raw=originalRaw;
    if(held?.owned){raw=held.rawDistance;localDistance=held.localDistance;}
    if(returnGate.active){raw=-1;localDistance=-1;}
    if(pendingRestore&&!flip.running&&(raw<0||ready(0)))flip.restore=true;
    const restoreStages=!flip.initialized||(flip.restore&&!flip.running);
    let scrollAdjustment=returnGate.active?-1-originalRaw:held?.scrollAdjustment||0;
    if(!flip.initialized || (flip.restore&&!flip.running)) {
      flip.value=flip.to=raw>=0&&ready(0)?1:0;flip.reveal=flip.value;flip.initialized=true;
      if(raw<0)flip.leadIn=0;
    }
    flip.restore=false;
    if(reducedMotion) {
      flip.running=false;flip.value=flip.to=raw>=0?1:0;flip.reveal=flip.value;flip.leadIn=0;
    } else {
      if(flip.to===0 && !flip.running && raw>=0&&localDistance>=0&&ready(0)) {
        flip.leadIn=Math.max(0,raw);beginFlip(1,now);
      } else if(flip.to===1 && raw<flip.leadIn-8 && (flip.lastRaw===null||raw<flip.lastRaw)) {
        beginReturn(now);scrollAdjustment=-1-originalRaw;raw=-1;localDistance=-1;
      }
      else if(flip.to===0 && flip.running && raw>flip.leadIn+8 && raw>flip.lastRaw) beginFlip(1,now);
      if(flip.running) {
        const duration=Math.max(1,flipMs*Math.abs(flip.to-flip.from));
        const elapsed=now>=flip.started+duration-.000001?1:clamp((now-flip.started)/duration);
        flip.value=lerp(flip.from,flip.to,flipEase(elapsed));
        if(elapsed===1) {
          flip.running=false;flip.value=flip.to;flip.revealedAt=now;
          if(flip.to===0) {
            // Remove the input consumed by the one-shot entrance. The card
            // is already at the about anchor, so this reset has no visual jump.
            if(raw>=0)scrollAdjustment=-raw-1;
            flip.leadIn=0;
          }
        }
      }
      if(flip.to===1&&!flip.running&&flip.value===1&&flip.reveal<1)flip.reveal=clamp((now-flip.revealedAt)/revealMs);
      if(flip.to===1&&(flip.running||flip.reveal<1))flip.leadIn=Math.max(flip.leadIn,raw);
      if(flip.to===1&&!flip.running&&flip.reveal===1&&flip.leadIn>0) {
        // The gesture triggered an action, not a hidden scroll interval.
        // Rebase at the identical settled pose so reload/history use the same
        // fixed card/Works distances, even after a long touchpad gesture.
        scrollAdjustment=2-flip.leadIn;
        localDistance+=scrollAdjustment;flip.leadIn=0;
      }
    }
    flip.lastRaw=raw;
    layout.travel=layout.height*chapterUnits+closingTravel+flip.leadIn;
    const animating=flip.running||(flip.to===1&&flip.reveal<1);
    const result={animating,travel:layout.travel,scrollAdjustment,
      // An old smooth-wheel destination must not drift through a timed
      // entrance/return or an undecoded first card behind the visible scene.
      blockSmooth:animating||returnGate.active||(raw>=0&&flip.to===0&&!ready(0))};
    if(held?.owned)result.settleLocalDistance=held.settleLocalDistance;
    if(returnGate.active){
      result.settleLocalDistance=-1;
      if(!flip.running&&flip.value===0&&!returnGate.waiting){
        returnGate.waiting=true;
        // A burst recognized during the automatic return belongs to that
        // covered screen, even if its residual events outlive the animation.
        returnGate.wheelAmount=0;returnGate.wheelDirection=0;returnGate.wheelArmed=false;
      }
    }
    root.dataset.returnGate=returnGate.active?(returnGate.waiting?'waiting':'returning'):'none';
    if(flip.value===0&&!flip.running&&flip.to===0){
      canReturn=false;
      if(lastPaint!=='before'){
        lastPaint='before';
        root.hidden=true;root.setAttribute('aria-hidden','true');scene.style.opacity='1';
        scene.style.backfaceVisibility='';scene.style.transformOrigin='0 0';
        window.InspirationFlipThickness?.update({visible:false});
        root.dataset.flipProgress='0.00000';root.dataset.flipRunning='false';root.dataset.growProgress='0.00000';root.classList.remove('is-flipping');
        hero.classList.remove('is-inspiration');hero.dataset.inspirationProgress='0';
      }
      window.InspirationHover?.update({active:-1,enabled:false});
      window.InspirationCardFlip?.reset?.();
      window.InspirationGestures?.update({height:layout.height,rawDistance:raw,origin:window.scrollY-originalRaw,now,
        enabled:false,entering:raw>=0,restore:restoreStages,explicitRestore:restoreStages,reducedMotion});
      window.InspirationClosing?.update(-1,{rawDistance:-1,now,restore:restoreStages,reducedMotion});
      return result;
    }
    const {width,height,anchor,size,cardY,radius}=layout;
    const units=Math.max(0,(localDistance-flip.leadIn)/height);
    const grow=flip.value;
    // Keep gesture ownership and return/checkpoint logic live on every shared
    // clock update. Only the immutable visual pose sleeps outside this chapter.
    const gesture=window.InspirationGestures?.update({height,rawDistance:held?.owned?raw:raw+scrollAdjustment,
      origin:window.scrollY-originalRaw,now,
      targetReady:ready,
      enabled:!animating&&(!scrollAdjustment||held?.owned)&&grow===1&&flip.to===1&&raw>=-8&&raw<=height*chapterUnits,
      entering:flip.to===1&&(animating||(!held?.owned&&Boolean(scrollAdjustment))),
      restore:restoreStages,explicitRestore:restoreStages,reducedMotion});
    const position=gesture?gesture.position:Math.max(0,Math.min(2,units));
    let first=ready(1)?clamp(position):0;
    let second=ready(2)&&first===1?clamp(position-1):0;
    if(animating){first=0;second=0;}
    result.animating=animating||Boolean(gesture?.busy);
    result.blockSmooth=result.blockSmooth||Boolean(gesture?.pending);
    canReturn=!result.animating&&!gesture?.pending&&grow===1&&position<.0001&&(!gesture||gesture.target===0);
    const active=second>=.5?2:first>=.5?1:0;
    const signature=[grow,flip.reveal,flip.to,flip.running,first,second,Boolean(gesture?.busy),lightProgress,ready(0)].join('|');
    if(signature!==lastPaint){
      lastPaint=signature;
      root.hidden=false;root.setAttribute('aria-hidden','false');hero.classList.add('is-inspiration');
      aboutCopy?.setAttribute('aria-hidden','true');
      hero.style.setProperty('--about-light-progress',Math.max(lightProgress,flip.value));
      const currentSize=lerp(anchor.size,size,grow),currentY=lerp(anchor.y,cardY,grow);
      const currentX=(width-currentSize)/2,currentRadius=lerp(anchor.radius,radius,grow);
      const angle=180*grow;
      scene.style.width=`${currentSize}px`;scene.style.height=`${currentSize}px`;
      scene.style.transformOrigin='50% 50%';scene.style.backfaceVisibility='hidden';
      scene.style.transform=`translate3d(${currentX}px, ${currentY}px, 0) perspective(1000px) rotateY(${angle}deg) translateZ(1px)`;
      clipShape(scene,currentSize,currentSize,currentRadius);
      // Use the original static portrait for this face. Keeping the WebGL hero
      // canvas outside the rotating planes prevents a composited white flash.
      scene.style.opacity='0';
      if(flipFront){
        flipFront.style.width=`${currentSize}px`;flipFront.style.height=`${currentSize}px`;
        flipFront.style.transform=`translate3d(${currentX}px, ${currentY}px, 0) perspective(1000px) rotateY(${angle}deg) translateZ(1px)`;
        clipShape(flipFront,currentSize,currentSize,currentRadius);
        flipFront.style.visibility=grow<.5?'visible':'hidden';
      }
      for(const element of [portrait,depth])if(element){
        element.style.width=`${currentSize*1.300883}px`;element.style.height=`${currentSize*1.535}px`;
        element.style.transform=`translate3d(${-currentSize*.15085}px, ${-currentSize*.1}px, 0)`;
      }
      root.style.setProperty('--inspiration-background-opacity',smooth(.5,1,grow));
      const headIn=flip.to===1?easeOut(flip.reveal*revealMs/650):smooth(.7,1,grow);
      headingLeft.style.opacity=String(headIn);headingRight.style.opacity=String(headIn);
      headingLeft.style.transform=`translate3d(${-(layout.word+layout.font*3.4+64)*(1-headIn)}px, 0, 0)`;
      headingRight.style.transform=`translate3d(${(layout.font*7.5+88)*(1-headIn)}px, 0, 0)`;
      eyebrow.style.opacity=String(headIn);counter.style.opacity=String(headIn);
      const plate=smooth(.5,.95,grow);
      for(let i=0;i<cards.length;i++){
        cards[i].style.setProperty('--inspiration-plate-opacity',i===0?plate:1);
        kinds[i].style.opacity=String(i===0?plate:1);
      }
      cards[1].style.setProperty('--inspiration-back-shade',second*.2);
      const backScale=layout.back/size,backY=cardY-layout.peek;
      const backExit=smooth(0,.55,second);
      pose(cards[0],lerp(1,backScale,first),lerp(cardY,backY,first)+Math.min(96,size*.24)*backExit,ready(0)&&grow>=.5?1-smooth(0,.55,second):0,1);
      cards[0].style.filter=backExit>0&&backExit<1?`blur(${(20*backExit).toFixed(3)}px)`:'none';
      cards[0].style.backfaceVisibility='hidden';
      if(grow<1) {
        place(cards[0],currentX,currentY,currentSize,1,currentRadius);
        cards[0].style.transformOrigin='50% 50%';
        cards[0].style.transform=`translate3d(${currentX}px, ${currentY}px, 0) perspective(1000px) rotateY(${angle-180}deg) translateZ(1px)`;
      } else cards[0].style.transformOrigin='0 0';
      const enteringY=cardY+Math.min(height*.32,size*.7);
      const musicScale=lerp(.72,1,first)*lerp(1,backScale,second);
      const musicY=lerp(enteringY,cardY,first)+(backY-cardY)*second;
      pose(cards[1],musicScale,musicY,smooth(0,.6,first),2);
      pose(cards[2],lerp(.72,1,second),lerp(enteringY,cardY,second),smooth(0,.6,second),3);
      cards[1].style.filter=first>0&&first<1?`blur(${(18*(1-first)**2).toFixed(3)}px)`:'none';
      cards[2].style.filter=second>0&&second<1?`blur(${(18*(1-second)**2).toFixed(3)}px)`:'none';
      const font=lerp(layout.font,layout.fontNext,first);
      const secondaryReveal=flip.to===1?clamp((flip.reveal*revealMs-650)/510):1;
      if(window.InspirationHeadings)window.InspirationHeadings.update({first,second,font,stacked:layout.stacked,reveal:secondaryReveal});
      else for(let i=0;i<words.length;i++){
        const weights=[1-smooth(.15,.65,first),smooth(.25,.75,first)*(1-smooth(.15,.65,second)),smooth(.25,.75,second)];
        const enter=i===0?1:i===1?first:second,exit=i===0?first:i===1?second:0;
        words[i].style.opacity=String(weights[i]);
        words[i].style.transform=`translate3d(0, ${(1-enter)*22-exit*22}px, 0)`;
        words[i].setAttribute('aria-hidden',String(i!==active));
      }
      for(let i=0;i<cards.length;i++)cards[i].setAttribute('aria-hidden',String(i!==active));
      root.style.setProperty('--inspiration-heading-size',`${font}px`);
      headingLeft.style.gap=`${Math.max(8,layout.word-layout.left-font*5)}px`;
      index.textContent=String(active+1).padStart(2,'0');
      root.dataset.stage=String(active+1);root.dataset.growProgress=grow.toFixed(5);
      root.dataset.flipProgress=grow.toFixed(5);root.dataset.flipRunning=String(flip.running);
      root.dataset.cardPosition=position.toFixed(5);root.dataset.cardRunning=String(Boolean(gesture?.busy));
      root.classList.toggle('is-flipping',flip.running);
      window.InspirationFlipThickness?.update({x:currentX,y:currentY,size:currentSize,radius:currentRadius,angle,
        visible:flip.running&&grow>0&&grow<1});
    }
    hero.dataset.inspirationProgress=clamp(localDistance/layout.travel).toFixed(5);
    const cardInteractable=!result.animating&&!gesture?.pending&&grow===1&&(first===0||first===1)&&(second===0||second===1)&&localDistance<=height*chapterUnits;
    window.InspirationHover?.update({active,enabled:cardInteractable});
    const cardFlip=window.InspirationCardFlip?.update({active,enabled:cardInteractable,now,reducedMotion,restore:restoreStages});
    // Click flips use the existing story clock without disabling category
    // navigation; a wheel/swipe can close the back and change the card at once.
    result.animating=result.animating||Boolean(cardFlip?.animating);
    const closing=window.InspirationClosing?.update(localDistance-flip.leadIn-height*chapterUnits,
      {rawDistance:(held?.owned?raw:raw+scrollAdjustment)-flip.leadIn-height*chapterUnits,
        now,restore:restoreStages,reducedMotion});
    result.animating=result.animating||Boolean(closing?.animating);
    result.blockSmooth=result.blockSmooth||Boolean(closing?.locked);
    if(closing?.scrollAdjustment)result.scrollAdjustment+=closing.scrollAdjustment;
    if(Number.isFinite(closing?.settleDistance))result.settleLocalDistance=flip.leadIn+height*chapterUnits+closing.settleDistance;
    return result;
  }

  for(const images of media)for(const img of images)img.addEventListener('load',()=>window.dispatchEvent(new CustomEvent('inspiration:ready')));
  window.addEventListener('chapter-assets:image-ready',event=>{if(event.detail?.chapter==='inspiration')wake();});
  window.InspirationChapter=Object.freeze({measure,update,restore:()=>{flip.restore=true;flip.running=false;returnGate.active=false;returnGate.waiting=false;}});
})();
