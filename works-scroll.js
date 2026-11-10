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
  let travel = 0, galleryTravel = 0, exitTravel = 0, emptyHold = 0;
  let height = 1, start = 0, entranceStart = 0, entrancePeek = 0, holdDistance = 0;
  let clearProgress = 1.15, phasePerViewport = .14;
  let headingAscent=[];
  let enhanced = false;
  // Use one world-space camera speed for entry, browsing and departure. Its
  // pace matches the previous two-screen final exit, without its acceleration.
  const paceReferenceProgress = 43.2 / 56.592;
  const titleRevealPhase = window.WorksGallery.leadFrontalPhase - .01;
  const previewStart = .62, previewTailMs = 500;
  let previewMotion = null, previewHandoffDistance = 1;
  let titleHidePhase = Infinity;

  function helixProgress(distance) {
    return Math.min(clearProgress,entrancePeek+Math.max(0,distance)/height*phasePerViewport);
  }

  function easePreview(progress) {
    const t=clamp(progress);
    return t*t*(3-2*t);
  }

  function samplePreview(motion, now) {
    const progress=now>=motion.end-.000001?1:easePreview((now-motion.start)/(motion.end-motion.start));
    return motion.from+(motion.timing.to-motion.from)*progress;
  }

  function updatePreview(timing, now) {
    if (!timing) {
      previewMotion=null;
      return;
    }
    if (previewMotion?.timing!==timing) {
      // A reverse can start while the forward tail is still moving. Use the
      // phase at that instant instead of jumping to the fully revealed edge.
      let from=0;
      if (timing.to===0) {
        from=previewMotion?samplePreview(previewMotion,Math.max(timing.started,previewMotion.sampledAt)):1;
      }
      const start=timing.started+(timing.to?timing.durationMs*previewStart:0);
      const end=timing.started+timing.durationMs+(timing.to?previewTailMs:0);
      previewMotion={timing,from,start,end,sampledAt:now};
    }
    previewMotion.sampledAt=Math.max(previewMotion.sampledAt,now);
    return samplePreview(previewMotion,previewMotion.sampledAt);
  }

  function measureHeadingHold() {
    const imageTop=distance=>window.WorksGallery.getProjectedBounds?.(helixProgress(distance))?.minY??Infinity;
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
    const leadTop=distance=>window.WorksGallery.getProjectedBounds?.(helixProgress(distance))?.minY??height;
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

  function measureClearProgress(getBounds,from){
    const clear=value=>(getBounds?.(value)||window.WorksGallery.getProjectedCards?.(value))?.every(pose=>pose.maxY< -Math.max(16,height*.02));
    let low=from;
    for(let high=from+.02;high<=2.001;high+=.02){
      high=Math.min(high,2);
      if(clear(high)){
        for(let i=0;i<22;i++){const middle=(low+high)/2;if(clear(middle))high=middle;else low=middle;}
        return high;
      }
      low=high;if(high===2)break;
    }
    return 2;
  }

  function measureLastWorkCrossing(low, high, edge, bound) {
    const getBounds=window.WorksGallery.getProjectedMotionBounds;
    if(!getBounds||!Number.isFinite(low))return high;
    for(let i=0;i<22;i++){
      const middle=(low+high)/2;
      const bounds=getBounds(middle);
      if(bounds[bounds.length-1]?.[bound]<=edge)high=middle;else low=middle;
    }
    return high;
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

  function measure({ width = hero.clientWidth, height: suppliedHeight = hero.clientHeight, start: suppliedStart = 0 } = {}) {
    height = Math.max(1, suppliedHeight);
    start = suppliedStart;
    setEnhanced(!reduced.matches);
    emptyHold = reduced.matches || document.querySelector('[data-services]') ? 0 : height;
    journey.style.removeProperty('height');
    const scale = Math.max(1, width / 2560, height / 1305);
    if (artwork) artwork.style.transform = `translate3d(${(width - 2560 * scale) / 2}px, ${(height - 1305 * scale) / 2}px, 0) scale(${scale})`;
    const galleryLayout=window.WorksGallery.measure({ width, height });
    entranceStart=galleryLayout?.entranceStartPhase??0;
    entrancePeek=galleryLayout?.entrancePeekPhase??entranceStart;
    const finalProgress=galleryLayout?.lastFrontalPhase??paceReferenceProgress;
    titleHidePhase=finalProgress;
    clearProgress=measureClearProgress(window.WorksGallery.getProjectedMotionBounds,finalProgress);
    const paceClearProgress=measureClearProgress(window.WorksGallery.getPaceReferenceBounds,paceReferenceProgress);
    phasePerViewport=Math.max(.001,(paceClearProgress-paceReferenceProgress)/2);
    const distanceAt=progress=>Math.max(0,(progress-entrancePeek)/phasePerViewport*height);
    galleryTravel=reduced.matches?0:distanceAt(finalProgress);
    exitTravel=reduced.matches?0:Math.max(0,(clearProgress-finalProgress)/phasePerViewport*height);
    const servicesHeadingDistance=reduced.matches?0:distanceAt(measureLastWorkCrossing(titleHidePhase-.055,titleHidePhase,height*.42,'minY'));
    const servicesRevealDistance=reduced.matches?0:distanceAt(measureLastWorkCrossing(titleHidePhase,clearProgress,height*.15,'maxY'));
    travel=galleryTravel+exitTravel+emptyHold;
    holdDistance=reduced.matches?0:measureHeadingHold();
    // A strong scroll can cover the remaining preview distance early. Finish
    // blending before either title cue so the rest of the timeline stays fixed.
    previewHandoffDistance=Math.max(1,Math.min(height*.25,holdDistance,distanceAt(titleRevealPhase)));
    measureHeadingAscent();
    journey.dataset.headingHoldDistance=holdDistance.toFixed(3);
    journey.dataset.totalTravel=travel.toFixed(3);
    journey.dataset.galleryTravel=galleryTravel.toFixed(3);
    journey.dataset.clearProgress=clearProgress.toFixed(6);
    journey.dataset.phasePerViewport=phasePerViewport.toFixed(6);
    // Keep the static accessibility grid independent of the pinned timeline.
    if (reduced.matches) {
      previewMotion=null;
      window.WorksGallery.setVisible?.(true);
      hero.classList.remove('is-works');
      viewport.classList.remove('has-works-title');
      viewport.classList.remove('works-is-preview');
      hero.style.setProperty('--works-exit-px', '0px');
      viewport.removeAttribute('aria-hidden');
      window.WorksGallery.update(0, { reducedMotion: true });
    }
    return { travel, galleryTravel, exitTravel, emptyHold, holdDistance, phasePerViewport, servicesHeadingDistance, servicesRevealDistance };
  }

  function update(localDistance, { reducedMotion = reduced.matches, titleRollProgress = 0, titleRollTiming = null, now = 0 } = {}) {
    if (!enhanced || reducedMotion) {
      previewMotion=null;
      window.InspirationClosing?.updateWorks(localDistance,{holdDistance,height,headingProgress:0,reducedMotion:true});
      return {finished:false};
    }
    const active = localDistance > 0;
    const previewProgress=updatePreview(titleRollTiming,now)??Number(active||titleRollProgress>=1);
    const preview = !active && previewProgress > 0;
    const galleryVisible = preview || (active && localDistance < galleryTravel + exitTravel);
    window.WorksGallery.setVisible?.(galleryVisible,{interactive:active&&galleryVisible});
    const progress = clamp(Math.max(0, localDistance) / Math.max(1, travel));
    const exit=Math.min(height,Math.max(0,localDistance));
    const scrollBlend=active?easePreview(localDistance/previewHandoffDistance):0;
    const previewDeficit=(entrancePeek-entranceStart)*(1-previewProgress);
    const helix=helixProgress(localDistance)-previewDeficit*(1-scrollBlend);
    hero.classList.toggle('is-works', active);
    const titleVisible=active&&galleryVisible&&helix>=titleRevealPhase&&helix<titleHidePhase;
    viewport.classList.toggle('has-works-title',titleVisible);
    viewport.classList.toggle('works-is-preview',preview);
    hero.style.setProperty('--works-exit-px', `${exit}px`);
    viewport.setAttribute('aria-hidden', String(!active||!galleryVisible));
    const inspiration=hero.querySelector('.inspiration');
    if(inspiration)inspiration.setAttribute('aria-hidden',String(exit>=height||inspiration.hidden));
    if (galleryVisible) window.WorksGallery.update(helix, { reducedMotion: false, now });
    const headingProgress=headingOffset(Math.max(0,localDistance));
    window.InspirationClosing?.updateWorks(localDistance,{holdDistance,height,headingProgress,reducedMotion:false});
    journey.dataset.scrollProgress = progress.toFixed(5);
    journey.dataset.scrollTarget = progress.toFixed(5);
    journey.dataset.helixProgress = helix.toFixed(5);
    journey.dataset.exitProgress=(exit/height).toFixed(5);
    journey.dataset.chapterStart = start.toFixed(3);
    journey.dataset.headingOffset='0.000';
    journey.dataset.headingProgress=headingProgress.toFixed(5);
    journey.dataset.galleryFinished=String(localDistance>=galleryTravel+exitTravel);
    const previewAnimating=Boolean(previewMotion&&scrollBlend<1&&previewMotion.from!==previewMotion.timing.to&&
      previewMotion.sampledAt<previewMotion.end-.000001);
    return {finished:localDistance>=galleryTravel+exitTravel,previewAnimating};
  }

  // A triggered entrance can consume a gesture while it finishes. Its owner
  // rebases only this boundary; the cached geometry stays intact.
  function setStart(value) { if (Number.isFinite(value)) start = value; }
  window.WorksScrollChapter = Object.freeze({ measure, update, setStart });
  // The renderer may be prefetched while About is visible. Preparation can
  // retain resources without starting an invisible gallery paint.
  window.WorksGallery.setVisible?.(reduced.matches);
  // hero-scroll is loaded first and adds this chapter's budget on readiness.
  window.dispatchEvent(new CustomEvent('works:ready'));
  reduced.addEventListener('change', () => window.dispatchEvent(new CustomEvent('works:ready')));
})();
