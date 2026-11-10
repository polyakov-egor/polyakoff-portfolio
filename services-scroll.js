/* Services reveals beneath the last Works card and continues in the shared scroll timeline. */
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
  // Safari and Firefox use the CSS glass surface without SVG backdrop refraction.
  if(footerCard && /\b(?:Chrome|Chromium)\//.test(window.navigator?.userAgent||'') &&
    window.CSS?.supports('backdrop-filter','url(#footer-glass-refraction)')){
    footerCard.classList.add('site-footer__card--refractive');
  }
  const originalParent=root.parentElement;
  const footerParent=footer?.parentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const smooth=value=>value*value*(3-2*value);
  const footerCardDuration=550, footerCardFade=.15, footerCardHysteresis=4;
  let layout=null,enhanced=false,visibility=null,deckVisibility=null,footerVisibility=null,footerY=null;
  let footerCardTarget=null,footerCardMotion=null,footerCardPhase=null,footerCardEdge=0;

  if(footerWordmarkImage){
    window.ChapterAssets?.register('services',()=>{
      footerWordmarkImage.fetchPriority='low';
      footerWordmarkImage.loading='eager';
      return footerWordmarkImage.decode?.().catch(()=>{});
    });
  }

  function wake(){window.dispatchEvent(new CustomEvent('services:ready'));}
  function wakeMotion(){window.dispatchEvent(new CustomEvent('services:motion'));}
  function resetFooterCard(){footerCardTarget=null;footerCardMotion=null;footerCardPhase=null;}
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
  function setFooterVisible(visible,cardAnimating=false){
    if(!footer)return;
    footer.classList.toggle('site-footer-is-visible',enhanced&&(visible||cardAnimating));
    if(footerVisibility===visible)return;
    footerVisibility=visible;
    footer.inert=!visible;
    footer.setAttribute('aria-hidden',String(!visible));
  }
  function updateFooterCard(entered,visible,now){
    let target=footerCardTarget;
    if(target===null){
      target=visible&&entered>=layout.footerCardStart;
    }else if(target){
      footerCardEdge=Math.max(footerCardEdge,entered);
      if(!visible||(entered<=layout.footerCardExit&&footerCardEdge-entered>=footerCardHysteresis))target=false;
    }else{
      footerCardEdge=Math.min(footerCardEdge,entered);
      if(visible&&entered>=layout.footerCardStart&&entered-footerCardEdge>=footerCardHysteresis)target=true;
    }
    // Remember the last turn so a small change in direction cannot reopen the card.
    if(target!==footerCardTarget)footerCardEdge=entered;
    let phase=Number(footerCardTarget);
    if(footerCardMotion){
      const progress=clamp((now-footerCardMotion.started)/footerCardDuration,0,1);
      phase=footerCardMotion.from+(phase-footerCardMotion.from)*progress;
      if(progress===1)footerCardMotion=null;
    }
    if(footerCardTarget===null){
      phase=Number(target);
    }else if(target!==footerCardTarget){
      footerCardMotion=phase===Number(target)?null:{from:phase,started:now};
    }
    footerCardTarget=target;
    if(phase!==footerCardPhase){
      const turn=smooth(phase);
      const opacity=smooth(clamp(phase/footerCardFade,0,1));
      footer.style.setProperty('--site-footer-card-offset',(1-turn).toFixed(4));
      footer.style.setProperty('--site-footer-card-opacity',opacity.toFixed(4));
      footerCardPhase=phase;
    }
    return Boolean(footerCardMotion);
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
      root.style.removeProperty('--services-glow-progress');
      root.classList.remove('services-is-visible','services-is-intro','services-glow-settled');
      footer?.style.removeProperty('--site-footer-scroll-y');
      footer?.style.removeProperty('--site-footer-card-shift');
      footer?.style.removeProperty('--site-footer-card-offset');
      footer?.style.removeProperty('--site-footer-card-opacity');
      footer?.style.removeProperty('--site-footer-wordmark-opacity');
      footer?.style.removeProperty('--site-footer-wordmark-filter');
      if(footerBackground&&backdrop)footer.prepend(footerBackground);
      backdrop?.style.removeProperty('--site-footer-reveal');
      footerY=null;
      hero.classList.remove('is-services','is-services-covered','is-services-deck-overlap');
      hero.style.removeProperty('--services-overlap-clip');
      const works=document.querySelector('[data-works-gallery]');
      if(works)works.inert=false;
      setVisible(true);
      setFooterVisible(true);
      resetFooterCard();
    }
  }
  function measure({width=hero.clientWidth,height=hero.clientHeight,worksStart=0,worksTravel=0,
    worksHeadingDistance,worksRevealDistance,distance}={}){
    const viewportHeight=Math.max(1,height||1);
    const oldLayout=layout;
    const oldLocal=oldLayout&&Number.isFinite(distance)?distance-oldLayout.start:null;
    setEnhanced(!reduced.matches);
    footerY=null;
    // Read only during layout, never during the shared scroll clock.
    const sectionHeight=measureHeight(root,viewportHeight);
    const footerHeight=measureHeight(footer,viewportHeight);
    const footerWordmarkTop=footerWordmark?.offsetTop||0;
    const footerWordmarkTravel=footerHeight-footerWordmarkTop;
    const footerCardStart=Math.min(footerHeight-1,footerWordmarkTop+.9*footerWordmarkTravel);
    const footerCardExit=footerWordmarkTop+.7*footerWordmarkTravel;
    if(oldLayout&&(oldLayout.height!==viewportHeight||oldLayout.footerHeight!==footerHeight||
      oldLayout.footerCardStart!==footerCardStart||oldLayout.footerCardExit!==footerCardExit))resetFooterCard();
    const footerWordmarkBlur=clamp(width*.03,24,42);
    const totalHeight=sectionHeight+footerHeight;
    const headingCenter=(heading?.offsetTop||0)+(heading?.offsetHeight||0)/2;
    const centeredY=Math.max(viewportHeight-totalHeight,viewportHeight/2-headingCenter);
    const deckTop=deck?.offsetTop||0,deckHeight=deck?.offsetHeight||0;
    const deckEntryY=Math.max(0,viewportHeight-centeredY-deckTop);
    const footerClearance=Math.min(viewportHeight*.16,Math.max(56,viewportHeight*.12));
    const openY=Math.max(viewportHeight-totalHeight,Math.min(centeredY,
      viewportHeight*.245-headingCenter,viewportHeight-footerClearance-deckTop-deckHeight));
    const openingTravel=centeredY-openY;
    // Begin beneath the departing Works card, keeping the original reading and footer distances.
    const introTravel=enhanced?Math.min(worksTravel,viewportHeight*(width<600?1.55:1.3)):0;
    const revealLead=Number.isFinite(worksRevealDistance)?worksTravel-worksRevealDistance:viewportHeight*.25;
    const revealStart=introTravel-clamp(revealLead,0,introTravel);
    const revealEnd=introTravel+openingTravel;
    const headingLead=Number.isFinite(worksHeadingDistance)?worksTravel-worksHeadingDistance:introTravel*.8;
    const headingStart=Math.min(revealStart,introTravel-clamp(headingLead,0,introTravel));
    const headingFade=Math.max(1,Math.min(viewportHeight*.29,revealStart-headingStart));
    const start=worksStart+worksTravel-introTravel;
    const travel=enhanced?totalHeight+centeredY-viewportHeight:0;
    layout={height:viewportHeight,sectionHeight,footerHeight,totalHeight,start,centeredY,
      deckTop,deckHeight,deckEntryY,introTravel,openingTravel,revealStart,revealEnd,headingStart,headingFade,travel,
      footerCardStart,footerCardExit,footerWordmarkTop,footerWordmarkBlur};
    let rebaseDistance=null;
    if(enhanced&&oldLayout&&Number.isFinite(oldLocal)&&oldLocal>=0&&oldLocal<=oldLayout.introTravel+oldLayout.travel+.5){
      if(oldLocal<oldLayout.revealStart){
        rebaseDistance=start+oldLocal/oldLayout.revealStart*revealStart;
      }else if(oldLocal<=oldLayout.revealEnd){
        const phase=(oldLocal-oldLayout.revealStart)/Math.max(1,oldLayout.revealEnd-oldLayout.revealStart);
        rebaseDistance=start+revealStart+phase*(revealEnd-revealStart);
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
    root.dataset.servicesRevealStart=revealStart.toFixed(3);
    root.dataset.servicesHeadingStart=headingStart.toFixed(3);
    root.dataset.servicesHeadingFade=headingFade.toFixed(3);
    return {...layout,rebaseDistance};
  }
  const restoreNavigation=()=>{resetFooterCard();wakeMotion();};
  window.addEventListener('keydown',event=>{
    if((event.key!=='Home'&&event.key!=='End')||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey)return;
    if(!event.target?.closest?.('input, textarea, select, [contenteditable="true"], [role="slider"], [role="dialog"], [data-lenis-prevent], .effect-controls, #hero-effect-panel'))restoreNavigation();
  });
  window.addEventListener('popstate',restoreNavigation);
  window.addEventListener('hashchange',restoreNavigation);

  function update(distance,{now=performance.now(),reducedMotion=reduced.matches}={}){
    if(!layout)return {active:false,covered:false};
    if(!enhanced||reducedMotion){
      setVisible(true);
      setFooterVisible(true);
      return {active:false,covered:false};
    }
    const {height,introTravel,centeredY,deckTop,deckHeight,deckEntryY,openingTravel,revealStart,revealEnd,headingStart,headingFade}=layout;
    const intro=distance<introTravel;
    const reveal=distance>=revealEnd?1:clamp((distance-revealStart)/Math.max(1,revealEnd-revealStart),0,1);
    const y=clamp(centeredY-openingTravel*reveal-Math.max(0,distance-revealEnd),height-layout.totalHeight,centeredY);
    const active=distance>headingStart&&y+layout.sectionHeight>.5;
    const headingOpacity=smooth(clamp((distance-headingStart)/headingFade,0,1));
    const deckShift=deckEntryY*(1-reveal);
    const deckY=y+deckTop+deckShift;
    const deckVisible=active&&reveal>0&&deckY<height&&deckY+deckHeight>0;
    const deckOverlap=intro&&deckVisible;
    const glowProgress=smooth(clamp((height-deckY)/Math.max(1,deckHeight*.35),0,1));
    let footerActive=false,footerAnimating=false;
    if(footer){
      const top=Math.min(layout.height,y+layout.sectionHeight);
      const entered=layout.height-top;
      footerActive=top<layout.height-.5;
      if(top!==footerY){
        footerY=top;
        footer.style.setProperty('--site-footer-scroll-y',`${top.toFixed(3)}px`);
        backdrop?.style.setProperty('--site-footer-reveal',clamp(1-top/layout.height,0,1).toFixed(4));
        // Counter the footer's translation so the card reveals at its settled viewport position.
        const cardShift=entered-layout.footerHeight;
        const wordmarkProgress=smooth(clamp((entered-layout.footerWordmarkTop)/Math.max(1,layout.footerHeight-layout.footerWordmarkTop),0,1));
        const wordmarkBlur=layout.footerWordmarkBlur*(1-wordmarkProgress);
        footer.style.setProperty('--site-footer-card-shift',`${cardShift.toFixed(3)}px`);
        footer.style.setProperty('--site-footer-wordmark-opacity',wordmarkProgress.toFixed(4));
        footer.style.setProperty('--site-footer-wordmark-filter',wordmarkProgress>0&&wordmarkBlur>=.01?`blur(${wordmarkBlur.toFixed(2)}px)`:'none');
      }
      if(footerCard)footerAnimating=updateFooterCard(entered,footerActive,now);
      setFooterVisible(footerActive,footerAnimating);
    }
    const covered=!intro;
    root.style.setProperty('--services-scroll-y',`${y.toFixed(3)}px`);
    root.style.setProperty('--services-heading-opacity',headingOpacity.toFixed(4));
    root.style.setProperty('--services-deck-entry-y',`${deckShift.toFixed(3)}px`);
    root.style.setProperty('--services-reveal-progress',smooth(clamp((reveal-.12)/.88,0,1)).toFixed(4));
    root.style.setProperty('--services-glow-progress',glowProgress.toFixed(4));
    root.classList.toggle('services-is-intro',intro);
    root.classList.toggle('services-glow-settled',glowProgress===1);
    root.classList.toggle('services-is-visible',active);
    hero.classList.toggle('is-services',active||footerActive);
    hero.classList.toggle('is-services-covered',covered);
    hero.classList.toggle('is-services-deck-overlap',deckOverlap);
    if(deckOverlap)hero.style.setProperty('--services-overlap-clip',`${(height-deckY).toFixed(3)}px`);
    const works=hero.querySelector('[data-works-gallery]');
    if(works)works.inert=covered;
    setVisible(active,deckVisible);
    root.dataset.servicesScroll=Math.max(0,distance).toFixed(3);
    root.dataset.servicesVisible=String(active);
    return {active,covered,footerAnimating};
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
  window.ServicesScrollChapter=Object.freeze({measure,update,setStart,restore:resetFooterCard});
  reduced.addEventListener('change',wake);
  wake();
})();
