/* The Works helix shares the hero's sticky viewport. Its native scroll budget
   starts exactly at the end of Inspiration, without an unpinned screen. */
(() => {
  'use strict';
  const journey = document.querySelector('.works-journey');
  const viewport = document.querySelector('[data-works-gallery]');
  const artwork = document.querySelector('.works-backdrop__lines');
  const hero = document.querySelector('.hero');
  if (!journey || !viewport || !hero || !window.WorksGallery) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.max(0, Math.min(1, value));
  let travel = 0, galleryTravel = 0, exitTravel = 0, fadeTravel = 0, emptyHold = 0;
  let height = 1, start = 0, previous = null, previousTime = 0, entranceOffset = 0, holdDistance = 0;
  let clearProgress = 1.15, phasePerViewport = .14, blackStart = 0, blackEnd = 0;
  let headingAscent=[];
  let enhanced = false;
  // Use one world-space camera speed for entry, browsing and departure. Its
  // pace matches the previous two-screen final exit, without its acceleration.
  const entranceProgress = .13;
  const finalProgress = 43.2 / 56.592;
  const blackStartProgress = .64;

  function helixProgress(distance) {
    return Math.min(clearProgress,entranceProgress+Math.max(0,distance)/height*phasePerViewport);
  }

  function projectedEntrance(distance) {
    const helix=helixProgress(distance);
    const bounds=window.WorksGallery.getProjectedBounds?.(helix);
    const entry=clamp((helix-.13)/(.30-.13));
    return {bounds,offset:entranceOffset*(1-entry)**3};
  }

  function measureHeadingHold() {
    const imageTop=distance=>{
      const {bounds,offset}=projectedEntrance(distance);
      if (!bounds||!Number.isFinite(bounds.minY)) return Infinity;
      return bounds.minY+offset;
    };
    // Cache the first crossing rather than recording it during scrolling, so
    // history restores, fast gestures and reverse playback share one boundary.
    const edge=window.InspirationClosing?.getCreationBounds?.()?.bottom||height*.54;
    const limit=Math.min(galleryTravel,height*4),step=height/32;
    if (imageTop(0)<=edge) return 0;
    let low=0;
    for (let high=step;high<=limit+step/2;high+=step) {
      high=Math.min(high,limit);
      if (imageTop(high)<=edge) {
        for(let i=0;i<24;i++){
          const middle=(low+high)/2;
          if(imageTop(middle)<=edge)high=middle;else low=middle;
        }
        return high;
      }
      if(high===limit)break;
      low=high;
    }
    return height;
  }

  function measureHeadingAscent() {
    const leadTop=distance=>{
      const {bounds,offset}=projectedEntrance(distance);
      return Number.isFinite(bounds?.minY)?bounds.minY+offset:height;
    };
    const origin=leadTop(holdDistance),samples=512;
    headingAscent=Array.from({length:samples+1},()=>0);
    let ascent=0;
    for(let i=1;i<=samples;i++){
      const distance=galleryTravel*i/samples;
      if(distance>holdDistance)ascent=Math.max(ascent,origin-leadTop(distance));
      headingAscent[i]=ascent;
    }
  }

  function headingOffset(distance) {
    if(distance<=holdDistance||!headingAscent.length)return 0;
    const sample=clamp(distance/Math.max(1,galleryTravel))*(headingAscent.length-1);
    const index=Math.floor(sample),next=Math.min(index+1,headingAscent.length-1);
    const ascent=headingAscent[index]+(headingAscent[next]-headingAscent[index])*(sample-index);
    return clamp(ascent/(height*.25));
  }

  function measureClearProgress(getBounds=window.WorksGallery.getProjectedCardBounds){
    const clear=value=>(getBounds?.(value)||window.WorksGallery.getProjectedCards?.(value))?.every(pose=>pose.maxY< -Math.max(16,height*.02));
    let low=finalProgress;
    for(let high=finalProgress+.02;high<=2.001;high+=.02){
      high=Math.min(high,2);
      if(clear(high)){
        for(let i=0;i<22;i++){const middle=(low+high)/2;if(clear(middle))high=middle;else low=middle;}
        return high;
      }
      low=high;if(high===2)break;
    }
    return 2;
  }

  function setEnhanced(enabled) {
    if (enabled === enhanced) return;
    enhanced = enabled;
    journey.classList.toggle('works-is-shared', enabled);
    if(enabled)journey.setAttribute('aria-hidden','true');else journey.removeAttribute('aria-hidden');
    viewport.classList.toggle('works-is-enhanced', enabled);
    if (enabled) hero.append(viewport);
    else {journey.append(viewport);viewport.inert=false;}
    // The enhanced chapter uses the single hero clock/footer; the static grid
    // keeps the original copies in its own document flow.
    for (const node of viewport.querySelectorAll('.hero__datetime, .hero__footer, .hero__about-logo')) {
      if (enabled) node.setAttribute('aria-hidden', 'true');
      else node.removeAttribute('aria-hidden');
    }
  }

  function measure({ width = hero.clientWidth, height: suppliedHeight = hero.clientHeight, start: suppliedStart = 0, backgroundScrollDistance } = {}) {
    height = Math.max(1, suppliedHeight);
    start = suppliedStart;
    setEnhanced(!reduced.matches);
    emptyHold = reduced.matches || document.querySelector('[data-services]') ? 0 : height;
    journey.style.removeProperty('height');
    const scale = Math.max(1, width / 2560, height / 1305);
    if (artwork) artwork.style.transform = `translate3d(${(width - 2560 * scale) / 2}px, ${(height - 1305 * scale) / 2}px, 0) scale(${scale})`;
    const galleryLayout=window.WorksGallery.measure({ width, height });
    entranceOffset=Number.isFinite(galleryLayout?.entranceOffset)?galleryLayout.entranceOffset:0;
    clearProgress=measureClearProgress();
    const paceClearProgress=measureClearProgress(window.WorksGallery.getPaceReferenceBounds);
    phasePerViewport=Math.max(.001,(paceClearProgress-finalProgress)/2);
    const distanceAt=progress=>Math.max(0,(progress-entranceProgress)/phasePerViewport*height);
    galleryTravel=reduced.matches?0:distanceAt(finalProgress);
    exitTravel=reduced.matches?0:Math.max(0,(clearProgress-finalProgress)/phasePerViewport*height);
    // Reuse About's actual native scroll interval, including all its duration
    // controls. Both directions now traverse the same gradient at the same pace.
    fadeTravel=reduced.matches?0:Math.max(1,Number.isFinite(backgroundScrollDistance)?backgroundScrollDistance:height*1.8);
    // A taller gap profile can clear the last image sooner. Retain About's
    // fade duration and leave a visible last card above the finished black.
    blackStart=reduced.matches?0:Math.max(0,Math.min(distanceAt(blackStartProgress),galleryTravel+exitTravel-fadeTravel-height*.25));
    blackEnd=blackStart+fadeTravel;
    travel=reduced.matches?0:Math.max(galleryTravel+exitTravel,blackEnd)+emptyHold;
    holdDistance=reduced.matches?0:measureHeadingHold();
    measureHeadingAscent();
    journey.dataset.headingHoldDistance=holdDistance.toFixed(3);
    journey.dataset.totalTravel=travel.toFixed(3);
    journey.dataset.galleryTravel=galleryTravel.toFixed(3);
    journey.dataset.clearProgress=clearProgress.toFixed(6);
    journey.dataset.blackStart=blackStart.toFixed(3);
    journey.dataset.blackEnd=blackEnd.toFixed(3);
    journey.dataset.backgroundScrollDistance=fadeTravel.toFixed(3);
    journey.dataset.phasePerViewport=phasePerViewport.toFixed(6);
    previous = null; previousTime = 0;
    // Keep the static accessibility grid independent of the pinned timeline.
    if (reduced.matches) {
      window.WorksGallery.setVisible?.(true);
      hero.classList.remove('is-works');
      hero.style.setProperty('--works-exit-px', '0px');
      viewport.style.removeProperty('--works-enter-px');
      viewport.style.removeProperty('--works-card-offset-px');
      viewport.removeAttribute('aria-hidden');
      window.WorksGallery.update(0, { reducedMotion: true });
    }
    return { travel, galleryTravel, exitTravel, fadeTravel, emptyHold, holdDistance, blackStart, blackEnd, phasePerViewport };
  }

  function update(localDistance, { reducedMotion = reduced.matches, now = 0 } = {}) {
    if (!enhanced || reducedMotion) {
      window.InspirationClosing?.updateWorks(localDistance,{holdDistance,height,headingProgress:0,reducedMotion:true});
      return {blackProgress:0,finished:false};
    }
    const active = localDistance > 0;
    // Keep the shared background/chrome timeline alive, but stop the gallery
    // itself before entry and as soon as the last projected plane has cleared.
    const galleryVisible = active && localDistance < galleryTravel + exitTravel;
    window.WorksGallery.setVisible?.(galleryVisible);
    const progress = clamp(Math.max(0, localDistance) / Math.max(1, travel));
    // The gallery's own entrance supplies the rise from below. Moving its
    // whole viewport as well would conceal the orbit behind a vertical slide.
    const exit=Math.min(height,Math.max(0,localDistance));
    const helix=helixProgress(Math.max(0,localDistance));
    hero.classList.toggle('is-works', active);
    hero.style.setProperty('--works-exit-px', `${exit}px`);
    viewport.style.setProperty('--works-enter-px', '0px');
    viewport.style.setProperty('--works-card-offset-px', '0px');
    viewport.setAttribute('aria-hidden', String(!galleryVisible));
    const inspiration=hero.querySelector('.inspiration');
    if(inspiration)inspiration.setAttribute('aria-hidden',String(exit>=height||inspiration.hidden));
    const elapsed = previousTime && now ? Math.max(1, Math.min(64, now - previousTime)) : 16.67;
    const velocity = previous === null || !active ? 0 : (progress - previous) * 1000 / elapsed;
    if (galleryVisible) window.WorksGallery.update(helix, { reducedMotion: false, scrollVelocity: velocity, now });
    const headingProgress=headingOffset(Math.max(0,localDistance));
    const blackPosition=clamp((localDistance-blackStart)/Math.max(1,fadeTravel));
    const blackProgress=localDistance>=blackEnd?1:localDistance<=blackStart?0:blackPosition*blackPosition*blackPosition*(blackPosition*(blackPosition*6-15)+10);
    window.InspirationClosing?.updateWorks(localDistance,{holdDistance,height,headingProgress,reducedMotion:false});
    previous = progress; previousTime = now;
    journey.dataset.scrollProgress = progress.toFixed(5);
    journey.dataset.scrollTarget = progress.toFixed(5);
    journey.dataset.helixProgress = helix.toFixed(5);
    journey.dataset.exitProgress=(exit/height).toFixed(5);
    journey.dataset.chapterStart = start.toFixed(3);
    journey.dataset.headingOffset='0.000';
    journey.dataset.headingProgress=headingProgress.toFixed(5);
    journey.dataset.blackProgress=blackProgress.toFixed(5);
    journey.dataset.galleryFinished=String(localDistance>=galleryTravel+exitTravel);
    return {blackProgress,finished:localDistance>=galleryTravel+exitTravel};
  }

  // A triggered entrance can consume a gesture while it finishes. Its owner
  // rebases only this boundary; cached geometry and gallery velocity stay intact.
  function setStart(value) { if (Number.isFinite(value)) start = value; }
  window.WorksScrollChapter = Object.freeze({ measure, update, setStart });
  // The renderer may be prefetched while About is visible. Preparation can
  // retain resources without starting an invisible gallery paint.
  window.WorksGallery.setVisible?.(reduced.matches);
  // hero-scroll is loaded first and adds this chapter's budget on readiness.
  window.dispatchEvent(new CustomEvent('works:ready'));
  reduced.addEventListener('change', () => window.dispatchEvent(new CustomEvent('works:ready')));
})();
