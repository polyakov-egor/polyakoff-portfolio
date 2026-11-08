/* Services and the footer follow native vertical scroll inside the same stable
   story viewport. The Services carousel owns only horizontal drags and clicks. */
(() => {
  'use strict';
  const root=document.querySelector('[data-services]');
  const footer=document.querySelector('[data-site-footer]');
  const backdrop=document.querySelector('[data-site-backdrop]');
  const footerBackground=footer?.querySelector('[data-site-footer-background]');
  const hero=document.querySelector('.hero');
  if(!root||!hero)return;
  const originalParent=root.parentElement;
  const footerParent=footer?.parentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  let layout=null,enhanced=false,visibility=null,footerVisibility=null,footerY=null;

  function wake(){window.dispatchEvent(new CustomEvent('services:ready'));}
  function measureHeight(element,height){return element?Math.max(height,element.offsetHeight||height):0;}
  function setVisible(visible){
    if(visibility!==visible){
      visibility=visible;root.inert=!visible;
      root.setAttribute('aria-hidden',String(!visible));
    }
    window.ServicesScreens?.get(root)?.setVisible(visible);
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
      root.classList.remove('services-is-visible');
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
    // Give the last work a little more breathing room before Services enters,
    // while preserving the panel's natural internal spacing and native pace.
    const entryGap=enhanced?(width<600?48:80):0;
    const start=worksStart+Math.max(0,worksTravel-viewportHeight)+entryGap;
    layout={width,height:viewportHeight,sectionHeight,footerHeight,totalHeight,start,
      entryGap,travel:enhanced?totalHeight-viewportHeight+entryGap:0};
    // Preserve the same reading position when fonts or orientation change the
    // story's earlier budgets. Explicit history/scroll jumps remain native.
    let rebaseDistance=null;
    if(enhanced&&oldLayout&&Number.isFinite(oldLocal)&&oldLocal>=0&&oldLocal<=oldLayout.totalHeight){
      if(oldLocal<=oldLayout.sectionHeight)rebaseDistance=start+oldLocal/oldLayout.sectionHeight*sectionHeight;
      else rebaseDistance=start+sectionHeight+(oldLocal-oldLayout.sectionHeight)/oldLayout.footerHeight*footerHeight;
    }
    root.dataset.servicesStart=start.toFixed(3);
    root.dataset.servicesHeight=sectionHeight.toFixed(3);
    root.dataset.servicesTravel=layout.travel.toFixed(3);
    root.dataset.servicesEntryGap=entryGap.toFixed(3);
    return {...layout,rebaseDistance};
  }
  function update(distance,{reducedMotion=reduced.matches}={}){
    if(!layout)return {active:false,covered:false};
    if(!enhanced||reducedMotion){
      setVisible(true);
      setFooterVisible(true);
      return {active:false,covered:false};
    }
    // Keep the last frame in place during mobile overscroll at the document end.
    const bottom=footer?layout.height-layout.totalHeight:-layout.sectionHeight;
    const y=clamp(layout.height-distance,bottom,layout.height);
    const active=distance>.5&&y+layout.sectionHeight>.5;
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
    const covered=distance>=layout.height-.5;
    root.style.setProperty('--services-scroll-y',`${y.toFixed(3)}px`);
    root.classList.toggle('services-is-visible',active);
    hero.classList.toggle('is-services',active||footerActive);
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
