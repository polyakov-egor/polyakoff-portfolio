/* Services and the footer follow native vertical scroll inside the same stable
   story viewport. The Services carousel owns only horizontal drags and clicks. */
(() => {
  'use strict';
  const root=document.querySelector('[data-services]');
  const heading=root?.querySelector('.services__heading');
  const deck=root?.querySelector('[data-services-deck]');
  const footer=document.querySelector('[data-site-footer]');
  const backdrop=document.querySelector('[data-site-backdrop]');
  const footerBackground=footer?.querySelector('[data-site-footer-background]');
  const hero=document.querySelector('.hero');
  if(!root||!hero)return;
  const originalParent=root.parentElement;
  const footerParent=footer?.parentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const smooth=value=>value*value*(3-2*value);
  let layout=null,enhanced=false,visibility=null,deckVisibility=null,footerVisibility=null,footerY=null;

  function wake(){window.dispatchEvent(new CustomEvent('services:ready'));}
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
      root.classList.remove('services-is-visible','services-is-intro');
      footer?.style.removeProperty('--site-footer-scroll-y');
      if(footerBackground&&backdrop)footer.prepend(footerBackground);
      backdrop?.style.removeProperty('--site-footer-reveal');
      footerY=null;
      hero.classList.remove('is-services','is-services-covered');
      const works=document.querySelector('[data-works-gallery]');
      if(works)works.inert=false;
      setVisible(true);
      setFooterVisible(true);
    }
  }
  function measure({width=hero.clientWidth,height=hero.clientHeight,worksStart=0,worksTravel=0,distance}={}){
    const viewportHeight=Math.max(1,height||1);
    const oldLayout=layout;
    const oldLocal=oldLayout&&Number.isFinite(distance)?distance-oldLayout.start:null;
    setEnhanced(!reduced.matches);
    if(oldLayout?.height!==viewportHeight)footerY=null;
    // Read only during layout, never during the shared scroll clock.
    const sectionHeight=measureHeight(root,viewportHeight);
    const footerHeight=measureHeight(footer,viewportHeight);
    const totalHeight=sectionHeight+footerHeight;
    const headingCenter=(heading?.offsetTop||0)+(heading?.offsetHeight||0)/2;
    const centeredY=Math.max(viewportHeight-totalHeight,viewportHeight/2-headingCenter);
    const deckTop=deck?.offsetTop||0,deckHeight=deck?.offsetHeight||0;
    const deckEntryY=Math.max(0,viewportHeight+12-centeredY-deckTop);
    // The title borrows the tail of Works. Only the subsequent native
    // movement of Services and the footer extends the document.
    const introTravel=enhanced?Math.min(worksTravel,viewportHeight*(width<600?1.55:1.3)):0;
    const start=worksStart+worksTravel-introTravel;
    const travel=enhanced?totalHeight+centeredY-viewportHeight:0;
    layout={height:viewportHeight,sectionHeight,footerHeight,totalHeight,start,centeredY,
      deckTop,deckHeight,deckEntryY,introTravel,travel};
    let rebaseDistance=null;
    if(enhanced&&oldLayout&&Number.isFinite(oldLocal)&&oldLocal>=0&&oldLocal<=oldLayout.introTravel+oldLayout.travel+.5){
      if(oldLocal<oldLayout.introTravel){
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
    return {...layout,rebaseDistance};
  }
  function update(distance,{reducedMotion=reduced.matches}={}){
    if(!layout)return {active:false,covered:false};
    if(!enhanced||reducedMotion){
      setVisible(true);
      setFooterVisible(true);
      return {active:false,covered:false};
    }
    const {height,introTravel,centeredY,deckTop,deckHeight,deckEntryY}=layout;
    const intro=distance<introTravel;
    const after=Math.max(0,distance-introTravel);
    const y=clamp(centeredY-after,height-layout.totalHeight,centeredY);
    const active=distance>.5&&y+layout.sectionHeight>.5;
    const headingOpacity=smooth(clamp(distance/Math.max(1,Math.min(introTravel,height*.55)),0,1));
    const deckShift=deckEntryY*(1-smooth(clamp(after/(height*.55),0,1)));
    const deckY=y+deckTop+deckShift;
    const deckVisible=active&&!intro&&deckY<height&&deckY+deckHeight>0;
    let footerActive=false;
    if(footer){
      const top=Math.min(layout.height,y+layout.sectionHeight);
      footerActive=top<layout.height-.5;
      if(top!==footerY){
        footerY=top;
        footer.style.setProperty('--site-footer-scroll-y',`${top.toFixed(3)}px`);
        backdrop?.style.setProperty('--site-footer-reveal',clamp(1-top/layout.height,0,1).toFixed(4));
      }
      setFooterVisible(footerActive);
    }
    const covered=!intro;
    root.style.setProperty('--services-scroll-y',`${y.toFixed(3)}px`);
    root.style.setProperty('--services-heading-opacity',headingOpacity.toFixed(4));
    root.style.setProperty('--services-deck-entry-y',`${deckShift.toFixed(3)}px`);
    root.classList.toggle('services-is-intro',intro);
    root.classList.toggle('services-is-visible',active);
    hero.classList.toggle('is-services',active||footerActive);
    hero.classList.toggle('is-services-covered',covered);
    const works=hero.querySelector('[data-works-gallery]');
    if(works)works.inert=covered;
    setVisible(active,deckVisible);
    root.dataset.servicesScroll=Math.max(0,distance).toFixed(3);
    root.dataset.servicesVisible=String(active);
    return {active,covered};
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
  window.ServicesScrollChapter=Object.freeze({measure,update,setStart});
  reduced.addEventListener('change',wake);
  wake();
})();
