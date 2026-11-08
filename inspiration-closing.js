/* The shared story clock owns this chapter. Only measurement reads layout;
   rendering changes transforms and the final native-scroll checkpoint. */
(() => {
  'use strict';
  const view = window.InspirationView;
  const hero = document.querySelector('.hero');
  const cards = view?.root.querySelector('.inspiration__cards');
  if (!hero || !view || !cards) return;
  const clamp = (n, a=0, b=1) => Math.max(a, Math.min(b, n));
  const lerp = (a,b,t) => a+(b-a)*t;
  const smooth = n => { const t=clamp(n);return t*t*t*(t*(t*6-15)+10); };
  const number = (n, fallback=0) => Number.isFinite(n) ? n : fallback;
  const px = n => `${number(n).toFixed(4)}px`;
  const create = (tag, className, text='') => {
    const element=document.createElement(tag);element.className=className;
    if(text)element.textContent=text;return element;
  };
  const root=create('div','inspiration-closing');
  const stage=create('div','inspiration-closing__stage');
  const oldLayer=create('div','inspiration-closing__old-layer');
  const newLayer=create('div','inspiration-closing__new-layer');
  const left=create('p','inspiration-closing__phrase inspiration-closing__phrase--left');
  const lead=create('span','inspiration-closing__lead','Attention to');
  const detail=create('span','inspiration-closing__detail','detail');
  const right=create('p','inspiration-closing__phrase inspiration-closing__phrase--right','sparks inspiration');
  const ghosts=['people','music'].map(text=>create('p','inspiration-closing__ghost',text));
  const creation=create('p','inspiration-closing__creation');
  creation.setAttribute('aria-label','From inspiration to creation');
  creation.append(create('span','inspiration-closing__creation-line','From inspiration'),create('span','inspiration-closing__creation-line','to creation'));
  left.setAttribute('aria-label','Attention to detail');
  for(const ghost of ghosts)ghost.setAttribute('aria-hidden','true');
  left.append(lead,detail);oldLayer.append(left,right,...ghosts);newLayer.append(creation);stage.append(oldLayer,newLayer);root.append(stage);
  root.hidden=true;root.setAttribute('aria-hidden','true');hero.append(root);

  let layout=null, active=false, worksProgress=0, worksReduced=false, morph=0;
  let lastRender=null, lastExitOffset=null;
  let pose={leftX:0,leftY:0,rightX:0,rightY:0,gap:16,wordX:0,ghostOpacity:0,ghostY:0};
  const originalAria=[view.headingLeft,view.headingRight].map(element=>element.getAttribute('aria-hidden'));
  const checkpoint={side:null,departing:null,allowRestore:true};
  let roll=null;
  let context={height:1};
  let wheelId=0,wheelAmount=0,wheelDirection=0,wheelArmed=false;
  let touch=null;
  const threshold=24,rollMs=550;

  function wake(){window.dispatchEvent(new CustomEvent('inspiration:ready'));}
  function ignored(target){return Boolean(target?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="slider"], [role="dialog"], .effect-controls, #hero-effect-panel'));}
  function eligible(){return Boolean(checkpoint.side)&&!document.hidden;}
  function clearInput(){
    wheelAmount=0;wheelDirection=0;wheelArmed=false;
    if(touch)touch.canRelease=false;
  }
  function lock(side){
    if(checkpoint.side===side)return;
    checkpoint.side=side;checkpoint.departing=null;clearInput();
  }
  function navigate(direction,now){
    if(direction===(checkpoint.side==='light'?1:-1)){
      roll={started:now,to:direction>0?1:0};
      clearInput();wake();return true;
    }
    checkpoint.departing=checkpoint.side;checkpoint.side=null;wake();return false;
  }
  function reclaim(direction){
    if(checkpoint.departing==='dark'&&direction<0)lock('dark');
    if(checkpoint.departing==='light'&&direction>0)lock('light');
  }
  function restoreHeadings(){
    for(const [i,element] of [view.headingLeft,view.headingRight].entries()){
      element.style.visibility='';
      if(originalAria[i]===null)element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden',originalAria[i]);
    }
  }
  function reset(){
    if(!active&&root.hidden)return;
    active=false;worksProgress=0;worksReduced=false;morph=0;root.hidden=true;root.setAttribute('aria-hidden','true');
    lastRender=null;lastExitOffset=null;
    restoreHeadings();cards.style.transform='';
    view.eyebrow.style.transform='';view.counter.style.transform='';
    root.dataset.progress='0.00000';root.dataset.locked='false';
  }
  function rollRadius(){
    return Math.max(layout.font+layout.rowStep,layout.creationHeight)*1.1;
  }
  function render(){
    if(!layout||!active)return;
    const signature=[pose.leftX,pose.leftY,pose.rightX,pose.rightY,pose.gap,pose.wordX,pose.ghostOpacity,pose.ghostY,morph,worksProgress,worksReduced].join('|');
    if(signature===lastRender)return;
    lastRender=signature;
    left.style.transform=`translate3d(${px(pose.leftX)}, ${px(pose.leftY)}, 0)`;
    right.style.transform=`translate3d(${px(pose.rightX)}, ${px(pose.rightY)}, 0)`;
    left.style.setProperty('--inspiration-closing-gap',px(pose.gap));
    for(let i=0;i<ghosts.length;i++){
      const wheel=window.InspirationHeadings?.getWordPose?.(i,2,layout.font);
      const fade=pose.ghostOpacity/.2;
      ghosts[i].style.transform=`translate3d(${px(pose.wordX+(wheel?.x||0))}, ${px(pose.ghostY+(wheel?.y??(-(2-i)*layout.font*1.25)))}, 0) rotate(${wheel?.rotation||0}deg)`;
      ghosts[i].style.filter=wheel?.blur?`blur(${wheel.blur}px)`:'none';
      ghosts[i].style.color=wheel?.color||'#1d1d1d';
      ghosts[i].style.opacity=String(wheel?wheel.opacity*fade:pose.ghostOpacity);
    }
    // The reference rolls two neighboring faces around one compact cylinder.
    // Their baselines stay close: the old face turns edge-on as the next face
    // turns toward the reader. Sliding two equally tilted planes apart instead
    // creates the widely separated/skewed pair reported in the screenshot.
    const eased=smooth(morph),diagonal=-8*Math.sin(Math.PI*eased);
    const radius=rollRadius();
    const rollPose=angle=>{
      const radians=angle*Math.PI/180;
      return `translate3d(0, ${px(-radius*Math.sin(radians))}, ${px(radius*(Math.cos(radians)-1))}) rotateZ(${diagonal.toFixed(4)}deg) rotateX(${angle.toFixed(4)}deg)`;
    };
    root.classList.toggle('is-morphing',morph>0&&morph<1);
    oldLayer.style.transform=rollPose(eased*90);
    newLayer.style.transform=rollPose((eased-1)*90);
    // Only the nearly edge-on face dims, as in 102.mp4. The readable faces
    // remain solid; there is no viewport-wide mask clipping the incoming line.
    oldLayer.style.opacity=String(1-smooth((eased-.55)/.45));
    newLayer.style.opacity=String(smooth(eased/.45));
    oldLayer.style.visibility=morph>=1?'hidden':'visible';
    oldLayer.setAttribute('aria-hidden',String(morph>=.5));
    newLayer.style.visibility=morph<=0?'hidden':'visible';
    newLayer.setAttribute('aria-hidden',String(morph<.5));
    const recession=smooth(worksProgress),scale=worksReduced?1:1-.25*recession;
    // Translation stays at the measured center. Scaling about the text's own
    // center makes it recede in place instead of pulling toward a corner.
    creation.style.transform=`translate3d(${px((layout.width-layout.creationWidth)/2)}, ${px((layout.height-layout.creationHeight)/2)}, 0) scale(${scale.toFixed(5)})`;
    creation.style.opacity=String(1-recession);
    creation.style.visibility=worksProgress>=1?'hidden':'visible';
    creation.setAttribute('aria-hidden',String(worksProgress>=1));
    root.dataset.morphProgress=morph.toFixed(5);
    root.dataset.rollRadius=radius.toFixed(4);
  }

  function measure({width,height,font,stacked,source={}}={}){
    lastRender=null;lastExitOffset=null;
    width=Math.max(1,number(width,layout?.width||1));
    height=Math.max(1,number(height,layout?.height||1));
    font=Math.max(1,number(font,layout?.font||64));
    stacked=Boolean(stacked);
    root.dataset.layout=stacked?'stacked':'desktop';
    root.style.setProperty('--inspiration-closing-font',px(font));
    // Hidden elements cannot be measured. Make the overlay inert and invisible
    // only for this synchronous layout pass, then restore its previous state.
    const wasHidden=root.hidden;root.hidden=false;root.style.visibility='hidden';
    const planeTransforms=[oldLayer.style.transform||'',newLayer.style.transform||'',creation.style.transform||''];
    oldLayer.style.transform='none';newLayer.style.transform='none';
    creation.style.transform='none';
    const leadWidth=lead.getBoundingClientRect().width;
    const detailWidth=detail.getBoundingClientRect().width;
    const rightWidth=right.getBoundingClientRect().width;
    const creationRect=creation.getBoundingClientRect();
    oldLayer.style.transform=planeTransforms[0];newLayer.style.transform=planeTransforms[1];
    creation.style.transform=planeTransforms[2];
    root.hidden=wasHidden;root.style.visibility='';
    const targetGap=font*.25;
    const leftWidth=leadWidth+targetGap+detailWidth;
    const rowStep=stacked?Math.max(font,number(source.rightY)-number(source.head)):0;
    const finalY=(height-font-rowStep)/2;
    const finalLeft=stacked?(width-leftWidth)/2:(width-leftWidth-targetGap-rightWidth)/2;
    const finalRight=stacked?(width-rightWidth)/2:finalLeft+leftWidth+targetGap;
    const sourceLeft=number(source.left,24),sourceHead=number(source.head,finalY);
    const sourceWord=number(source.word,sourceLeft+leadWidth+targetGap);
    const sourceRight=stacked?number(source.right,finalRight):width-number(source.right,24)-rightWidth;
    layout={width,height,font,stacked,leadWidth,detailWidth,rightWidth,leftWidth,targetGap,rowStep,finalY,finalLeft,finalRight,creationWidth:creationRect.width,creationHeight:creationRect.height,
      sourceLeft,sourceHead,sourceWord,sourceRight,sourceRightY:number(source.rightY,sourceHead),sourceGap:Math.max(0,number(source.gap,Math.max(8,sourceWord-sourceLeft-font*5)))};
    context.height=height;
    root.dataset.layout=stacked?'stacked':'desktop';
    root.dataset.finalLeft=finalLeft.toFixed(4);root.dataset.finalRight=finalRight.toFixed(4);
    root.dataset.finalY=finalY.toFixed(4);root.dataset.rowStep=rowStep.toFixed(4);
    return {travel:height*1.5};
  }

  function update(distance,{rawDistance=distance,now=0,restore=false,reducedMotion=false}={}){
    if(!layout)return {progress:0,scrollAdjustment:0,locked:false};
    distance=number(distance,-1);rawDistance=number(rawDistance,distance);
    const {height,stacked}=layout;
    context.height=height;
    const end=height*1.5;
    if(distance<0&&!checkpoint.side&&!roll){
      checkpoint.departing=null;reset();return {progress:0,scrollAdjustment:0,locked:false};
    }
    // Native history and Home/End can land inside the reserved interval.
    // Restore an endpoint without starting a transition or rebasing history.
    if(restore||checkpoint.allowRestore||reducedMotion){
      checkpoint.side=null;checkpoint.departing=null;roll=null;
      morph=Number(distance>=height*1.25);
    }else{
      if((checkpoint.departing==='light'&&rawDistance<height-8)||
         (checkpoint.departing==='dark'&&rawDistance>end+8))checkpoint.departing=null;
      if(!roll&&!checkpoint.side){
        if(morph===1&&!checkpoint.departing&&rawDistance<end-2&&distance<=end+2){
          lock('dark');roll={started:now,to:0};
        }else if(morph===0&&!checkpoint.departing&&distance>=height-2&&rawDistance>=height-2){
          lock('light');
        }
      }
      if(roll){
        const elapsed=now-roll.started;
        const phase=elapsed>=rollMs-.000001?1:clamp(elapsed/rollMs);
        morph=roll.to?phase:1-phase;
        if(phase===1){
          lock(roll.to?'dark':'light');
          roll=null;
        }
      }
    }
    if(checkpoint.side)distance=checkpoint.side==='light'?height:end-2;
    if(distance<0){reset();return {progress:0,scrollAdjustment:0,locked:false};}

    let scrollAdjustment=0,settleDistance;
    // Both sides stay inside the title chapter while the common clock rolls
    // the title and backdrop. Works can only advance after a fresh gesture.
    if(checkpoint.side){
      scrollAdjustment=(checkpoint.side==='light'?height-2:end-2)-rawDistance;
      settleDistance=distance;
    }
    // Fractional chapter starts can leave a sub-pixel arithmetic remainder
    // after the native anchor is already exact. It must not keep the shared
    // RAF awake trying to scroll by an unrepresentable distance forever.
    if(Math.abs(scrollAdjustment)<.001)scrollAdjustment=0;
    const progress=clamp(distance/height),merge=smooth(progress),offset=clamp(distance,0,height);
    if(!active){active=true;root.hidden=false;root.setAttribute('aria-hidden','false');}
    for(const element of [view.headingLeft,view.headingRight]){
      if(element.style.visibility!=='hidden')element.style.visibility='hidden';
      if(element.getAttribute('aria-hidden')!=='true')element.setAttribute('aria-hidden','true');
    }
    if(offset!==lastExitOffset){
      lastExitOffset=offset;
      cards.style.transform=`translate3d(0, ${px(-offset)}, 0)`;
      view.eyebrow.style.transform=`translate3d(-50%, ${px(-offset)}, 0)`;
      view.counter.style.transform=`translate3d(-50%, ${px(-offset)}, 0)`;
    }
    const gap=lerp(layout.sourceGap,layout.targetGap,merge);
    const leftX=lerp(layout.sourceLeft,layout.finalLeft,merge);
    const leftY=stacked?Math.max(layout.finalY,layout.sourceHead-offset):lerp(layout.sourceHead,layout.finalY,merge);
    const rightY=stacked?Math.max(layout.finalY+layout.rowStep,layout.sourceRightY-offset):lerp(layout.sourceRightY,layout.finalY,merge);
    pose={leftX,leftY,rightX:lerp(layout.sourceRight,layout.finalRight,merge),rightY,gap,wordX:leftX+layout.leadWidth+gap,
      ghostOpacity:stacked?0:.2*(1-smooth(progress/.2)),ghostY:leftY-40*smooth(progress/.2)};
    root.dataset.progress=progress.toFixed(5);root.dataset.locked=String(Boolean(checkpoint.side));
    root.dataset.reducedMotion=String(Boolean(reducedMotion));render();
    return {progress,scrollAdjustment,locked:Boolean(checkpoint.side),settleDistance,animating:Boolean(roll)};
  }

  function updateWorks(localDistance,{headingProgress=0,reducedMotion=false}={}){
    if(!layout)return;
    // Works measures the first image crossing the cached text bounds. Until
    // that collision the completed phrase remains fixed at screen center.
    worksProgress=number(localDistance)>0?clamp(number(headingProgress)):0;
    worksReduced=Boolean(reducedMotion);
    root.dataset.worksProgress=worksProgress.toFixed(5);render();
  }

  function getCreationBounds(){
    if(!layout)return null;
    const left=(layout.width-layout.creationWidth)/2,top=(layout.height-layout.creationHeight)/2;
    return {left,top,right:left+layout.creationWidth,bottom:top+layout.creationHeight,width:layout.creationWidth,height:layout.creationHeight};
  }

  function updateTheme(sample){
    if(!active||!layout)return;
    const angle=smooth(morph)*Math.PI/2;
    const {width,height}=layout;
    const ink=angle=>sample(width/2,height/2-rollRadius()*Math.sin(angle))>.5?'#1d1d1d':'#fff';
    oldLayer.style.color=ink(angle);
    newLayer.style.color=ink(angle-Math.PI/2);
  }

  window.addEventListener('wheel',event=>{
    if(ignored(event.target))return;
    const now=performance.now();
    const intent=window.SiteWheelIntent?.sample(event,now,context.height);
    if(!intent)return;
    checkpoint.allowRestore=false;
    if(intent.id!==wheelId){
      if(!event.defaultPrevented)reclaim(intent.direction);
      wheelId=intent.id;wheelAmount=0;wheelDirection=0;wheelArmed=eligible()&&!roll&&!event.defaultPrevented;
    }
    if(!eligible()||event.defaultPrevented)return;
    // A tiny reversed momentum sample cannot unlock the checkpoint and let
    // its following forward tail enter the title roll. Both directions need
    // a new deliberate intent, accumulated only while the heading is ready.
    if(wheelArmed&&!roll){
      if(wheelDirection!==intent.direction){wheelAmount=0;wheelDirection=intent.direction;}
      wheelAmount+=Math.abs(intent.delta);
      if(wheelAmount>=threshold&&!navigate(intent.direction,now))return;
    }
    // Momentum from the gesture that centered the heading cannot enter Works.
    event.preventDefault();
  },{passive:false});
  window.addEventListener('touchstart',event=>{
    if(event.touches.length!==1||ignored(event.target)){touch=null;return;}
    checkpoint.allowRestore=false;
    const point=event.touches[0];
    touch={x:point.clientX,y:point.clientY,canRelease:eligible()&&!roll,canReclaim:Boolean(checkpoint.departing),horizontal:false};
  },{passive:true});
  window.addEventListener('touchmove',event=>{
    if(!touch||event.touches.length!==1||ignored(event.target)||event.defaultPrevented)return;
    const point=event.touches[0],dy=touch.y-point.clientY,dx=touch.x-point.clientX;
    if(touch.horizontal)return;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>8){touch.horizontal=true;return;}
    if(Math.abs(dy)<.01||Math.abs(dx)>Math.abs(dy))return;
    const direction=Math.sign(dy);
    if(!checkpoint.side&&touch.canReclaim){reclaim(direction);touch.canRelease=eligible();}
    touch.canReclaim=false;
    if(!eligible())return;
    const timed=direction===(checkpoint.side==='light'?1:-1);
    if(!roll&&touch.canRelease&&(!timed||Math.abs(dy)>=8)){
      touch.canRelease=false;
      if(!navigate(direction,performance.now()))return;
    }
    event.preventDefault();
  },{passive:false});
  const endTouch=()=>{touch=null;};
  window.addEventListener('touchend',endTouch,{passive:true});
  window.addEventListener('touchcancel',endTouch,{passive:true});
  window.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||ignored(event.target))return;
    if(event.key==='Home'||event.key==='End'){
      checkpoint.allowRestore=true;checkpoint.side=null;roll=null;clearInput();wake();return;
    }
    const direction=event.key==='ArrowDown'||event.key==='PageDown'||(event.key===' '&&!event.shiftKey)?1:
      event.key==='ArrowUp'||event.key==='PageUp'||(event.key===' '&&event.shiftKey)?-1:0;
    if(!direction)return;
    checkpoint.allowRestore=false;
    if(!event.repeat&&!event.defaultPrevented)reclaim(direction);
    if(!eligible()||event.defaultPrevented)return;
    if(roll||event.repeat||navigate(direction,performance.now()))event.preventDefault();
  });
  // Browsers may restore native scroll after pageshow and font measurement.
  // Keep that late restore free until the first actual navigation gesture.
  window.addEventListener('pageshow',()=>{checkpoint.allowRestore=true;});
  window.addEventListener('blur',()=>{touch=null;clearInput();});
  window.InspirationClosing=Object.freeze({measure,update,updateWorks,getCreationBounds,updateTheme,getBlackProgress:()=>smooth(morph)});
})();
