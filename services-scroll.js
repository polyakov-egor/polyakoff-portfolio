/* The centered heading and the complete Services screen are scroll stops.
   The shared story clock owns the timed entrance and native continuation. */
(() => {
  'use strict';
  const root=document.querySelector('[data-services]');
  const heading=root?.querySelector('.services__heading');
  const deck=root?.querySelector('[data-services-deck]');
  const footer=document.querySelector('[data-site-footer]');
  const backdrop=document.querySelector('[data-site-backdrop]');
  const footerBackground=footer?.querySelector('[data-site-footer-background]');
  const footerCard=footer?.querySelector('.site-footer__card');
  const footerWordmark=footer?.querySelector('.site-footer__wordmark');
  const footerWordmarkImage=footerWordmark?.querySelector('img');
  const hero=document.querySelector('.hero');
  if(!root||!hero)return;
  const originalParent=root.parentElement;
  const footerParent=footer?.parentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const smooth=value=>value*value*(3-2*value);
  const motionDuration=500, wheelThreshold=24;
  let layout=null,enhanced=false,visibility=null,deckVisibility=null,footerVisibility=null,footerY=null;
  let stage=null,motion=null,lastDistance=null,allowRestore=true;
  let wheelId=0,wheelUsed=true,wheelAmount=0,touch=null,keyRelease='';

  if(footerWordmarkImage){
    window.ChapterAssets?.register('services',()=>{
      footerWordmarkImage.fetchPriority='low';
      footerWordmarkImage.loading='eager';
      return footerWordmarkImage.decode?.().catch(()=>{});
    });
  }

  function wake(){window.dispatchEvent(new CustomEvent('services:ready'));}
  function wakeMotion(){window.dispatchEvent(new CustomEvent('services:motion'));}
  function restore(){
    allowRestore=true;stage=null;motion=null;lastDistance=null;
    wheelUsed=true;wheelAmount=0;touch=null;keyRelease='';
  }
  function measureHeight(element,height){return element?Math.max(height,element.offsetHeight||height):0;}
  function setVisible(visible,deckVisible=visible){
    if(visibility!==visible){
      visibility=visible;root.inert=!visible;
      root.setAttribute('aria-hidden',String(!visible));
    }
    if(deckVisibility!==deckVisible){
      deckVisibility=deckVisible;
      if(deck)deck.inert=!deckVisible;
      window.ServicesScreens?.get(root)?.setVisible(deckVisible);
    }
  }
  function setFooterVisible(visible){
    if(!footer)return;
    footer.classList.toggle('site-footer-is-visible',enhanced&&visible);
    if(footerVisibility===visible)return;
    footerVisibility=visible;
    footer.inert=!visible;
    footer.setAttribute('aria-hidden',String(!visible));
  }
  function setEnhanced(enabled){
    if(enhanced===enabled)return;
    enhanced=enabled;
    root.classList.toggle('services-is-shared',enabled);
    footer?.classList.toggle('site-footer-is-shared',enabled);
    if(enabled){
      hero.append(root);
      if(footer)hero.append(footer);
      if(footerBackground)backdrop?.append(footerBackground);
    }
    else {
      originalParent?.append(root);
      if(footer)footerParent?.append(footer);
      root.style.removeProperty('--services-scroll-y');
      root.style.removeProperty('--services-heading-opacity');
      root.style.removeProperty('--services-deck-entry-y');
      root.style.removeProperty('--services-reveal-progress');
      root.classList.remove('services-is-visible','services-is-intro');
      footer?.style.removeProperty('--site-footer-scroll-y');
      footer?.style.removeProperty('--site-footer-card-shift');
      footer?.style.removeProperty('--site-footer-card-offset');
      footer?.style.removeProperty('--site-footer-card-opacity');
      footer?.style.removeProperty('--site-footer-wordmark-opacity');
      footer?.style.removeProperty('--site-footer-wordmark-filter');
      if(footerBackground&&backdrop)footer.prepend(footerBackground);
      backdrop?.style.removeProperty('--site-footer-reveal');
      footerY=null;
      hero.classList.remove('is-services','is-services-covered');
      const works=document.querySelector('[data-works-gallery]');
      if(works)works.inert=false;
      setVisible(true);
      setFooterVisible(true);
      restore();
    }
  }
  function measure({width=hero.clientWidth,height=hero.clientHeight,worksStart=0,worksTravel=0,distance}={}){
    const viewportHeight=Math.max(1,height||1);
    const oldLayout=layout;
    const oldLocal=oldLayout&&Number.isFinite(distance)?distance-oldLayout.start:null;
    setEnhanced(!reduced.matches);
    footerY=null;
    // Read only during layout, never during the shared scroll clock.
    const sectionHeight=measureHeight(root,viewportHeight);
    const footerHeight=measureHeight(footer,viewportHeight);
    const footerCardTop=footerCard?.offsetTop||0;
    const footerWordmarkTop=footerWordmark?.offsetTop||0;
    const footerWordmarkBlur=clamp(width*.03,24,42);
    const totalHeight=sectionHeight+footerHeight;
    const headingCenter=(heading?.offsetTop||0)+(heading?.offsetHeight||0)/2;
    const centeredY=Math.max(viewportHeight-totalHeight,viewportHeight/2-headingCenter);
    const deckTop=deck?.offsetTop||0,deckHeight=deck?.offsetHeight||0;
    const deckEntryY=Math.max(0,viewportHeight+12-centeredY-deckTop);
    const footerClearance=Math.min(viewportHeight*.16,Math.max(56,viewportHeight*.12));
    const openY=Math.max(viewportHeight-totalHeight,Math.min(centeredY,
      viewportHeight*.245-headingCenter,viewportHeight-footerClearance-deckTop-deckHeight));
    const openingTravel=centeredY-openY;
    // The title borrows the tail of Works. Only the subsequent native
    // movement of Services and the footer extends the document.
    const introTravel=enhanced?Math.min(worksTravel,viewportHeight*(width<600?1.55:1.3)):0;
    const start=worksStart+worksTravel-introTravel;
    const travel=enhanced?totalHeight+centeredY-viewportHeight:0;
    layout={height:viewportHeight,sectionHeight,footerHeight,totalHeight,start,centeredY,
      deckTop,deckHeight,deckEntryY,introTravel,openingTravel,travel,
      footerCardTop,footerWordmarkTop,footerWordmarkBlur};
    if(!stage&&!motion&&oldLayout?.height!==viewportHeight)lastDistance=null;
    let rebaseDistance=null;
    if(enhanced&&oldLayout&&Number.isFinite(oldLocal)&&oldLocal>=0&&oldLocal<=oldLayout.introTravel+oldLayout.travel+.5){
      if(stage||motion){
        rebaseDistance=start+introTravel+((motion?.from??stage)==='open'?openingTravel:0);
      }else if(oldLocal<oldLayout.introTravel){
        rebaseDistance=start+oldLocal/oldLayout.introTravel*introTravel;
      }else{
        const oldReadingTravel=oldLayout.travel-oldLayout.footerHeight;
        const readingTravel=travel-footerHeight;
        const oldAfter=oldLocal-oldLayout.introTravel;
        const after=oldAfter<=oldReadingTravel&&oldReadingTravel>0
          ?oldAfter/oldReadingTravel*readingTravel
          :readingTravel+clamp((oldAfter-oldReadingTravel)/Math.max(1,oldLayout.footerHeight),0,1)*footerHeight;
        rebaseDistance=start+introTravel+after;
      }
    }
    root.dataset.servicesStart=start.toFixed(3);
    root.dataset.servicesHeight=sectionHeight.toFixed(3);
    root.dataset.servicesTravel=layout.travel.toFixed(3);
    root.dataset.servicesIntroTravel=introTravel.toFixed(3);
    root.dataset.servicesOpeningTravel=openingTravel.toFixed(3);
    return {...layout,rebaseDistance};
  }
  function hold(next){
    stage=next;wheelUsed=true;wheelAmount=0;
    if(touch)touch.used=true;
  }
  function restoredStage(distance){
    // History jumps skip the timed interval's intermediate poses.
    // The next deliberate gesture can take ownership from the displayed stop.
    const {introTravel,openingTravel}=layout;
    if(distance<introTravel-.75||distance>introTravel+openingTravel+.75)return null;
    return distance<introTravel+openingTravel/2?'center':'open';
  }
  function noteInput(){
    if(allowRestore&&enhanced&&layout&&lastDistance!==null)stage=restoredStage(lastDistance);
    allowRestore=false;
  }
  function navigate(direction,time){
    if(motion)return false;
    const next=stage==='center'&&direction>0?'open':stage==='open'&&direction<0?'center':null;
    if(next){
      motion={from:stage,to:next,started:time};
      wakeMotion();
      return false;
    }
    stage=null;
    wakeMotion();
    return true;
  }
  function eligible(){return enhanced&&!reduced.matches&&!document.hidden&&!window.SitePreloader?.isBlocking?.()&&Boolean(stage||motion);}
  const nested=target=>Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"], [role="slider"], [role="dialog"], [data-lenis-prevent], .effect-controls, #hero-effect-panel'));
  const modified=event=>event.ctrlKey||event.metaKey||event.altKey;

  window.addEventListener('wheel',event=>{
    if(modified(event)||event.shiftKey||nested(event.target))return;
    const time=performance.now(),intent=window.SiteWheelIntent?.sample(event,time,layout?.height||1);
    if(!intent||event.defaultPrevented)return;
    noteInput();
    if(intent.id!==wheelId){wheelId=intent.id;wheelUsed=false;wheelAmount=0;}
    if(!eligible())return;
    if(motion||wheelUsed){wheelUsed=true;event.preventDefault();return;}
    wheelAmount+=intent.delta;
    if(Math.abs(wheelAmount)<wheelThreshold){event.preventDefault();return;}
    wheelUsed=true;
    if(!navigate(Math.sign(wheelAmount),time))event.preventDefault();
  },{passive:false});
  window.addEventListener('touchstart',event=>{
    if(event.touches.length!==1||nested(event.target)){touch=null;return;}
    noteInput();
    const point=event.touches[0];
    touch={x:point.clientX,y:point.clientY,used:Boolean(motion),horizontal:false};
  },{passive:true});
  window.addEventListener('touchmove',event=>{
    if(!touch||touch.horizontal||event.defaultPrevented||event.touches.length!==1)return;
    const point=event.touches[0],dy=touch.y-point.clientY,dx=touch.x-point.clientX;
    if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){touch.horizontal=true;return;}
    if(!eligible()||Math.abs(dy)<=Math.abs(dx))return;
    const direction=Math.sign(dy);
    if(!touch.used&&!motion&&((stage==='open'&&direction>0)||(stage==='center'&&direction<0))){
      // Safari must see the first movement unprevented to keep this pan native.
      touch.used=true;
      navigate(direction,performance.now());
      return;
    }
    if(!touch.used&&!motion&&Math.abs(dy)>=8){
      touch.used=true;
      navigate(direction,performance.now());
    }
    event.preventDefault();
  },{passive:false});
  const endTouch=()=>{touch=null;};
  window.addEventListener('touchend',endTouch,{passive:true});
  window.addEventListener('touchcancel',endTouch,{passive:true});
  window.addEventListener('keydown',event=>{
    if(modified(event)||nested(event.target)||event.defaultPrevented)return;
    if(event.key==='Home'||event.key==='End'){restore();wakeMotion();return;}
    if(event.key===' '&&event.target?.closest?.('button, a, [role="button"]'))return;
    const direction=event.key==='ArrowDown'||event.key==='PageDown'||(event.key===' '&&!event.shiftKey)?1:
      event.key==='ArrowUp'||event.key==='PageUp'||(event.key===' '&&event.shiftKey)?-1:0;
    if(!direction)return;
    noteInput();
    if(!eligible())return;
    if(event.repeat){if(keyRelease!==event.key)event.preventDefault();return;}
    keyRelease='';
    if(navigate(direction,performance.now()))keyRelease=event.key;
    else event.preventDefault();
  });
  window.addEventListener('keyup',event=>{if(event.key===keyRelease)keyRelease='';});
  window.addEventListener('blur',()=>{endTouch();wheelUsed=true;keyRelease='';});
  const restoreNavigation=()=>{restore();wakeMotion();};
  window.addEventListener('popstate',restoreNavigation);
  window.addEventListener('hashchange',restoreNavigation);

  function update(distance,{requestedLocalDistance=distance,now=performance.now(),reducedMotion=reduced.matches}={}){
    if(!layout)return {active:false,covered:false};
    if(!enhanced||reducedMotion){
      setVisible(true);
      setFooterVisible(true);
      return {active:false,covered:false};
    }
    const {height,introTravel,centeredY,deckTop,deckHeight,deckEntryY,openingTravel}=layout;
    const openAt=introTravel+openingTravel;
    if(!allowRestore&&!stage&&!motion&&lastDistance!==null){
      if(lastDistance<introTravel-.75&&distance>=introTravel-.75&&requestedLocalDistance>=introTravel-.75)hold('center');
      else if(lastDistance>openAt+.75&&distance<=openAt+.75&&requestedLocalDistance<=openAt+.75)hold('open');
    }
    let reveal,settleLocalDistance,scrollAdjustment=0;
    if(motion){
      const opening=motion.to==='open';
      const phase=clamp((now-motion.started)/motionDuration,0,1);
      const eased=1-(1-phase)**3;
      reveal=opening?eased:1-eased;
      settleLocalDistance=motion.from==='open'?openAt:introTravel;
      if(phase===1){stage=motion.to;motion=null;}
    }
    if(stage&&!motion)settleLocalDistance=stage==='open'?openAt:introTravel;
    if(Number.isFinite(settleLocalDistance)){
      distance=settleLocalDistance;
      if(Math.abs(settleLocalDistance-requestedLocalDistance)>.25)scrollAdjustment=settleLocalDistance-requestedLocalDistance;
    }
    lastDistance=distance;
    const intro=distance<introTravel;
    const after=Math.max(0,distance-introTravel);
    const restored=allowRestore&&restoredStage(distance);
    const posedStage=stage||restored;
    reveal=reveal??(posedStage?Number(posedStage==='open'):clamp(after/Math.max(1,openingTravel),0,1));
    const y=clamp(centeredY-(motion||restored?openingTravel*reveal:after),height-layout.totalHeight,centeredY);
    const active=distance>.5&&y+layout.sectionHeight>.5;
    const headingOpacity=smooth(clamp(distance/Math.max(1,Math.min(introTravel,height*.55)),0,1));
    const deckShift=deckEntryY*(1-reveal);
    const deckY=y+deckTop+deckShift;
    const deckVisible=active&&!intro&&!motion&&reveal>=1&&deckY<height&&deckY+deckHeight>0;
    let footerActive=false;
    if(footer){
      const top=Math.min(layout.height,y+layout.sectionHeight);
      footerActive=top<layout.height-.5;
      if(top!==footerY){
        footerY=top;
        footer.style.setProperty('--site-footer-scroll-y',`${top.toFixed(3)}px`);
        backdrop?.style.setProperty('--site-footer-reveal',clamp(1-top/layout.height,0,1).toFixed(4));
        const entered=layout.height-top;
        const cardPhase=clamp(entered/layout.footerHeight,0,1);
        // The form entrance uses quintic ease-out and completes the fade before the motion.
        const cardOffset=(1-cardPhase)**5;
        const cardOpacity=1-(1-clamp(cardPhase/.45,0,1))**5;
        const cardRestInset=layout.footerHeight-layout.footerCardTop;
        const cardTop=Math.max(top,layout.height-cardRestInset*(1-cardOffset))+40*cardOffset;
        const cardShift=cardTop-top-layout.footerCardTop;
        const wordmarkProgress=smooth(clamp((entered-layout.footerWordmarkTop)/Math.max(1,layout.footerHeight-layout.footerWordmarkTop),0,1));
        const wordmarkBlur=layout.footerWordmarkBlur*(1-wordmarkProgress);
        footer.style.setProperty('--site-footer-card-shift',`${cardShift.toFixed(3)}px`);
        footer.style.setProperty('--site-footer-card-offset',cardOffset.toFixed(4));
        footer.style.setProperty('--site-footer-card-opacity',cardOpacity.toFixed(4));
        footer.style.setProperty('--site-footer-wordmark-opacity',wordmarkProgress.toFixed(4));
        footer.style.setProperty('--site-footer-wordmark-filter',wordmarkProgress>0&&wordmarkBlur>=.01?`blur(${wordmarkBlur.toFixed(2)}px)`:'none');
      }
      setFooterVisible(footerActive);
    }
    const covered=!intro;
    root.style.setProperty('--services-scroll-y',`${y.toFixed(3)}px`);
    root.style.setProperty('--services-heading-opacity',headingOpacity.toFixed(4));
    root.style.setProperty('--services-deck-entry-y',`${deckShift.toFixed(3)}px`);
    root.style.setProperty('--services-reveal-progress',smooth(clamp((reveal-.12)/.88,0,1)).toFixed(4));
    root.classList.toggle('services-is-intro',intro);
    root.classList.toggle('services-is-visible',active);
    hero.classList.toggle('is-services',active||footerActive);
    hero.classList.toggle('is-services-covered',covered);
    const works=hero.querySelector('[data-works-gallery]');
    if(works)works.inert=covered;
    setVisible(active,deckVisible);
    root.dataset.servicesScroll=Math.max(0,distance).toFixed(3);
    root.dataset.servicesVisible=String(active);
    root.dataset.servicesStage=motion?(motion.to==='open'?'opening':'closing'):stage||restored||'native';
    return {active,covered,animating:Boolean(motion),blockSmooth:Boolean(stage||motion),settleLocalDistance,scrollAdjustment};
  }
  // Font wrapping and responsive layout can change a section's natural height.
  // Notify the existing owner instead of creating a second animation loop.
  if(typeof ResizeObserver==='function'){
    const resize=new ResizeObserver(()=>{
      if(layout&&(Math.abs(measureHeight(root,layout.height)-layout.sectionHeight)>.5||
        Math.abs(measureHeight(footer,layout.height)-layout.footerHeight)>.5))wake();
    });
    resize.observe(root);
    if(footer)resize.observe(footer);
  }
  function setStart(start){if(layout&&Number.isFinite(start)){layout.start=start;root.dataset.servicesStart=start.toFixed(3);}}
  window.ServicesScrollChapter=Object.freeze({measure,update,setStart,restore});
  reduced.addEventListener('change',wake);
  wake();
})();
