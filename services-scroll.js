/* Services keeps its natural page height inside the same stable story viewport.
   Only native vertical distance moves this panel; its carousel owns horizontal
   drags and clicks, never another wheel/touch scroll checkpoint. */
(() => {
  'use strict';
  const root=document.querySelector('[data-services]');
  const hero=document.querySelector('.hero');
  if(!root||!hero)return;
  const originalParent=root.parentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  let layout=null,enhanced=false,measuredHeight=0,visibility=null;

  function wake(){window.dispatchEvent(new CustomEvent('services:ready'));}
  function setVisible(visible){
    if(visibility!==visible){
      visibility=visible;root.inert=!visible;
      root.setAttribute('aria-hidden',String(!visible));
    }
    window.ServicesScreens?.get(root)?.setVisible(visible);
  }
  function setEnhanced(enabled){
    if(enhanced===enabled)return;
    enhanced=enabled;
    root.classList.toggle('services-is-shared',enabled);
    if(enabled)hero.append(root);
    else {
      originalParent?.append(root);
      root.style.removeProperty('--services-scroll-y');
      root.classList.remove('services-is-visible');
      hero.classList.remove('is-services','is-services-covered');
      const works=document.querySelector('[data-works-gallery]');
      if(works)works.inert=false;
      setVisible(true);
    }
  }
  function measure({width=hero.clientWidth,height=hero.clientHeight,worksStart=0,worksTravel=0,distance}={}){
    const viewportHeight=Math.max(1,height||1);
    const oldLayout=layout;
    const oldLocal=oldLayout&&Number.isFinite(distance)?distance-oldLayout.start:null;
    setEnhanced(!reduced.matches);
    // Read only during layout, never during the shared scroll clock.
    measuredHeight=Math.max(viewportHeight,root.offsetHeight||viewportHeight);
    // Give the last work a little more breathing room before Services enters,
    // while preserving the panel's natural internal spacing and native pace.
    const entryGap=enhanced?(width<600?48:80):0;
    const start=worksStart+Math.max(0,worksTravel-viewportHeight)+entryGap;
    layout={width,height:viewportHeight,sectionHeight:measuredHeight,start,
      entryGap,travel:enhanced?Math.max(0,measuredHeight-viewportHeight)+entryGap:0};
    // Preserve the same reading position when fonts or orientation change the
    // story's earlier budgets. Explicit history/scroll jumps remain native.
    const rebaseDistance=enhanced&&oldLayout&&Number.isFinite(oldLocal)&&oldLocal>=0&&oldLocal<=oldLayout.sectionHeight
      ? start+oldLocal/oldLayout.sectionHeight*measuredHeight : null;
    root.dataset.servicesStart=start.toFixed(3);
    root.dataset.servicesHeight=measuredHeight.toFixed(3);
    root.dataset.servicesTravel=layout.travel.toFixed(3);
    root.dataset.servicesEntryGap=entryGap.toFixed(3);
    return {...layout,rebaseDistance};
  }
  function update(distance,{reducedMotion=reduced.matches}={}){
    if(!layout)return {active:false,covered:false};
    if(!enhanced||reducedMotion){setVisible(true);return {active:false,covered:false};}
    const y=clamp(layout.height-distance,-layout.sectionHeight,layout.height);
    const active=distance>.5&&y+layout.sectionHeight>.5;
    const covered=distance>=layout.height-.5;
    root.style.setProperty('--services-scroll-y',`${y.toFixed(3)}px`);
    root.classList.toggle('services-is-visible',active);
    hero.classList.toggle('is-services',active);
    hero.classList.toggle('is-services-covered',covered);
    const works=hero.querySelector('[data-works-gallery]');
    if(works)works.inert=covered;
    setVisible(active);
    root.dataset.servicesScroll=Math.max(0,distance).toFixed(3);
    root.dataset.servicesVisible=String(active);
    return {active,covered};
  }
  // Font wrapping and responsive layout can change a section's natural height.
  // Notify the existing owner instead of creating a second animation loop.
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>{
    if(layout&&Math.abs((root.offsetHeight||layout.height)-measuredHeight)>.5)wake();
  }).observe(root);
  function setStart(start){if(layout&&Number.isFinite(start)){layout.start=start;root.dataset.servicesStart=start.toFixed(3);}}
  window.ServicesScrollChapter=Object.freeze({measure,update,setStart});
  reduced.addEventListener('change',wake);
  wake();
})();
