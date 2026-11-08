/* One pinned viewport, independently tunable hero and about scroll distances.
   Layer layout and the WebGL input remain independent of this scroll timeline. */
(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  const journey = document.querySelector('.hero-journey');
  const scene = document.querySelector('.hero__scene');
  const scenery = document.querySelector('.hero__scenery');
  const wordmarkFrame = document.querySelector('.hero__wordmark-frame');
  const wordmarkScale = document.querySelector('.hero__wordmark-scale');
  const decorationScale = document.querySelector('.hero__decoration-scale');
  const portrait = document.querySelector('[data-layer="portrait"]');
  const depth = document.querySelector('[data-layer="depth"]');
  const intro = document.querySelector('.hero__intro');
  const introFrame = document.querySelector('.hero__intro-frame');
  const welcome = document.querySelector('.hero__welcome');
  const logo = document.querySelector('.hero__about-logo');
  const copy = document.querySelector('.about-copy');
  const content = copy?.querySelector('.about-copy__content');
  const lines = document.querySelector('.about-backdrop__lines');
  const lightLines = document.querySelector('.about-backdrop__light-lines');
  const siteBackdrop = document.querySelector('[data-site-backdrop]');
  if (!hero || !journey || !scene || !copy || !window.HeroSquircle) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const responseMs = 180;
  const aboutResponseMs = 260;
  const aboutTransitionMs = Math.max(0, Number(hero.dataset.aboutTransitionMs) || 0);
  const frames = [
    { width: 375, height: 812, size: 160, y: 210, radius: 32, textY: 450, blurStart: 651.5, blurEnd: 756.5 },
    { width: 768, height: 1024, size: 180, y: 289, radius: 40, textY: 569, blurStart: 919.5, blurEnd: 998 },
    { width: 1440, height: 800, size: 180, y: 191, radius: 40, textY: 471, blurStart: 693.5, blurEnd: 772 },
    { width: 1920, height: 960, size: 200, y: 240, radius: 52, textY: 540, blurStart: 827.5, blurEnd: 934 },
    { width: 2560, height: 1305, size: 240, y: 320, radius: 62.4, textY: 660, blurStart: 1145.1, blurEnd: 1268.1 }
  ];
  const clamp = value => Math.max(0, Math.min(1, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };
  const smoother = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
  const defaults = Object.freeze({
    whiteAt: .22, wordmarkBlur: 24, wordmarkFade: false, aboutTopBlur: 10,
    aboutFlightVariant: 'second', aboutFadeSpeed: 1, aboutStartOffset: 0,
    aboutWordForce: 1, aboutLetterForce: 1, aboutFadeBoundary: 1,
    aboutFadeSoftness: .12 / .205, aboutFadeShape: 'distance', aboutFadeOrigin: 'screen',
    aboutDetach: .14, aboutRotation: 1, aboutFadeGuide: false,
    aboutBackgroundStart: .32, aboutBackgroundDuration: .45,
    aboutTriggerMode: 'portrait', aboutTriggerGapPx: 100,
    aboutScrollDuration: 2.5, heroScrollDuration: 1,
    inspirationCardDurationMs: 800, aboutFillFeather: .7, musicActivity: 1.35,
    aboutRevealMode: 'gradient', aboutRevealScrollDuration: 1.8
  });
  const publishedDefaults = Object.freeze({ ...defaults, ...window.PublishedEffectPreset?.scroll });
  const settings = { ...publishedDefaults };
  const storageKey = 'ff.hero.scroll.settings.v1';
  function normalizeSettings(patch) {
    const next = {};
    if (!patch || typeof patch !== 'object') return next;
    const limits = {
      whiteAt: [.05, .9], wordmarkBlur: [0, 200], aboutTopBlur: [0, 40], aboutFadeSpeed: [.5, 2],
      aboutStartOffset: [-.5, .5], aboutWordForce: [0, 3], aboutLetterForce: [0, 3],
      aboutFadeBoundary: [.25, 2], aboutFadeSoftness: [.05, 1], aboutDetach: [0, .6], aboutRotation: [0, 2],
      aboutBackgroundStart: [0, 1], aboutBackgroundDuration: [.05, 1], aboutTriggerGapPx: [0, 400],
      aboutScrollDuration: [1, 3], heroScrollDuration: [1, 3],
      inspirationCardDurationMs: [350, 1800], aboutFillFeather: [.2, 1.5], musicActivity: [.5, 2.5], aboutRevealScrollDuration: [1, 3]
    };
    for (const [key, [min, max]] of Object.entries(limits)) {
      if (typeof patch[key] === 'number' && Number.isFinite(patch[key])) next[key] = Math.max(min, Math.min(max, patch[key]));
    }
    if (typeof patch.wordmarkFade === 'boolean') next.wordmarkFade = patch.wordmarkFade;
    if (patch.aboutFlightVariant === 'first' || patch.aboutFlightVariant === 'second') next.aboutFlightVariant = patch.aboutFlightVariant;
    if (['distance', 'circle', 'ellipse', 'linear', 'box'].includes(patch.aboutFadeShape)) next.aboutFadeShape = patch.aboutFadeShape;
    if (patch.aboutFadeOrigin === 'text' || patch.aboutFadeOrigin === 'screen') next.aboutFadeOrigin = patch.aboutFadeOrigin;
    if (typeof patch.aboutFadeGuide === 'boolean') next.aboutFadeGuide = patch.aboutFadeGuide;
    if (patch.aboutTriggerMode === 'portrait' || patch.aboutTriggerMode === 'viewport') next.aboutTriggerMode = patch.aboutTriggerMode;
    if (['gradient', 'wave', 'radial'].includes(patch.aboutRevealMode)) next.aboutRevealMode = patch.aboutRevealMode;
    return next;
  }
  try {
    Object.assign(settings, normalizeSettings(JSON.parse(window.localStorage.getItem(storageKey))));
    // Activate the requested plain gradient once for existing browser settings.
    // Later selections and named presets remain entirely user-controlled.
    const migrationKey = 'ff.hero.scroll.gradient-default.v1';
    if (window.localStorage.getItem(migrationKey) !== '1') {
      settings.aboutRevealMode = 'gradient';
      window.localStorage.setItem(storageKey, JSON.stringify(settings));
      window.localStorage.setItem(migrationKey, '1');
    }
  } catch { /* Keep the default if browser storage is unavailable. */ }
  if (window.PublishedEffectPresetNeedsMigration) Object.assign(settings, normalizeSettings(window.PublishedEffectPreset?.scroll));
  function applyTuningCss() {
    hero.style.setProperty('--about-fill-feather', String(settings.aboutFillFeather));
    document.documentElement.style.setProperty('--music-activity', String(settings.musicActivity));
  }
  applyTuningCss();
  let base, target, textTravel = 0, textHeight = 0, frame = 0, storyTop = 0, inspirationTravel = 0, worksTravel = 0, servicesTravel = 0, servicesStart = Infinity, logoEntryDistance = 50;
  let welcomeBottom = 24;
  let flightMetrics = null, aboutReturnAfter = null, aboutReturnFrom = null, servicesRebase = null, servicesIntroTravel = 0;
  let displayedDistance = null, lastTime = 0;
  let lastHeroPaint = null, lastAboutPaint = null, lastAboutHidden = null, lastNativeLanding = null;
  let lastLightPaint = null, lightTarget = null, lightTransitionStart = null;

  function place(element, x, y, width, height) {
    if (!element) return;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function flightOptions() {
    return {
      variant: settings.aboutFlightVariant, topBlur: settings.aboutTopBlur,
      fadeSpeed: settings.aboutFadeSpeed, startOffset: settings.aboutStartOffset,
      wordForce: settings.aboutWordForce, letterForce: settings.aboutLetterForce,
      fadeBoundary: settings.aboutFadeBoundary, fadeSoftness: settings.aboutFadeSoftness,
      fadeShape: settings.aboutFadeShape, fadeOrigin: settings.aboutFadeOrigin,
      detach: settings.aboutDetach, rotation: settings.aboutRotation, showGuide: settings.aboutFadeGuide,
      triggerMode: settings.aboutTriggerMode, triggerGapPx: settings.aboutTriggerGapPx
    };
  }

  function updateTravel(flight, preserveServiceAnchor = false) {
    if (!base || !target) return;
    const fallbackStart = Math.max(0, target.textY + textHeight - base.height * .97);
    flightMetrics = flight || { start: fallbackStart, end: fallbackStart + textHeight + base.height * .38 };
    const flightSpan = Math.max(1, flightMetrics.end - flightMetrics.start);
    const lightSpan = aboutTransitionMs ? 0 : settings.aboutBackgroundDuration * settings.aboutRevealScrollDuration;
    const lightEnd = flightMetrics.start + flightSpan * (settings.aboutBackgroundStart + lightSpan);
    const visualEnd = window.InspirationChapter && window.AboutTextFlight?.getVisualEnd?.();
    textTravel = typeof visualEnd === 'number' && Number.isFinite(visualEnd)
      ? Math.max(base.height * .2, visualEnd, lightEnd + base.height * .08)
      : Math.max(base.height * .2, target.textY + textHeight - base.height * .75, flightMetrics.end + base.height * .1, lightEnd + base.height * .1);
    aboutReturnAfter = window.AboutTextFlight?.getReturnAfter?.();
    aboutReturnFrom = Number.isFinite(visualEnd) ? visualEnd : textTravel;
    // Text and glyph flight share the About distance, which also sets the
    // backdrop trigger before its timed transition takes over.
    inspirationTravel = window.InspirationChapter?.measure({ width: base.width, height: base.height,
      anchor: { x: (base.width - target.size) / 2, y: target.y, size: target.size, radius: target.radius } })?.travel || 0;
    worksTravel = window.WorksScrollChapter?.measure({ width:base.width, height:base.height,
      start:base.height*settings.heroScrollDuration+textTravel*settings.aboutScrollDuration+inspirationTravel })?.travel || 0;
    measureServices(preserveServiceAnchor);
    writeJourneyBudget();
  }

  function measureServices(preserveServiceAnchor) {
    const worksStart=base.height*settings.heroScrollDuration+textTravel*settings.aboutScrollDuration+inspirationTravel;
    const services=window.ServicesScrollChapter?.measure({width:base.width,height:base.height,worksStart,worksTravel,
      distance:preserveServiceAnchor?Math.max(0,window.scrollY-storyTop):undefined});
    servicesTravel=services?.travel||0;
    servicesStart=services?.start??Infinity;
    servicesIntroTravel=services?.introTravel||0;
    servicesRebase=services?.rebaseDistance??null;
  }

  function writeJourneyBudget() {
    const worksStart=base.height*settings.heroScrollDuration+textTravel*settings.aboutScrollDuration+inspirationTravel;
    if(Number.isFinite(servicesStart)){
      servicesStart=worksStart+worksTravel-servicesIntroTravel;
      window.ServicesScrollChapter?.setStart?.(servicesStart);
    }
    journey.style.height=`${base.height+worksStart+worksTravel+servicesTravel}px`;
    window.WorksScrollChapter?.setStart?.(worksStart);
    hero.dataset.worksStart=worksStart.toFixed(3);
    if(Number.isFinite(servicesStart))hero.dataset.servicesStart=servicesStart.toFixed(3);
  }

  // Chapter anchors are instant coordinates. Keep a smooth-scroll engine's
  // retained destination aligned instead of letting old inertia undo them.
  function moveNative(top) {
    const next = Math.max(0, top), before = window.scrollY;
    // Browser zoom/device pixels can make a fractional checkpoint impossible
    // to represent. Accept a verified nearby landing without writing it again
    // on every frame; any real input/changed target invalidates this match.
    if (lastNativeLanding && Math.abs(lastNativeLanding.target - next) < .00001 &&
      Math.abs(lastNativeLanding.actual - before) < .00001 && Math.abs(before - next) < 1) return true;
    if (window.SiteSmoothScroll?.jump) window.SiteSmoothScroll.jump(next);
    else window.scrollTo({ top: next, behavior: 'instant' });
    const actual = window.scrollY;
    lastNativeLanding = { target: next, actual };
    return Math.abs(actual - before) < .00001 && Math.abs(actual - next) < 1;
  }

  function measure(layout = hero.heroLayout) {
    if (!layout) return;
    lastHeroPaint = null;
    lastAboutPaint = null;
    base = layout;
    const { width, height } = base;
    const logoBottom = Number.parseFloat(window.getComputedStyle?.(logo)?.bottom);
    logoEntryDistance = (Number.isFinite(logoBottom) ? logoBottom : width < 600 ? 88 : 24) + (logo.offsetHeight || 20) + 2;
    const welcomeInset = Number.parseFloat(window.getComputedStyle?.(welcome)?.bottom);
    welcomeBottom = Number.isFinite(welcomeInset) ? welcomeInset : width < 600 ? 106 : width < 768 ? 72 : 24;
    let a = frames[0], b = frames[1];
    for (let i = 1; i < frames.length; i++) {
      a = frames[i - 1]; b = frames[i];
      if (width <= b.width) break;
    }
    const t = clamp((width - a.width) / (b.width - a.width));
    const size = lerp(a.size, b.size, t);
    target = {
      size, radius: lerp(a.radius, b.radius, t),
      y: lerp((a.y + a.size / 2) / a.height, (b.y + b.size / 2) / b.height, t) * height - size / 2,
      textY: lerp(a.textY / a.height, b.textY / b.height, t) * height,
      font: width < 600 ? Math.min(32, 32 * (width - 32) / 343) : width < 1650 ? 40 : width < 2240 ? 48 : 56
    };
    copy.style.setProperty('--about-font-size', `${target.font}px`);
    const blurStart = lerp(a.blurStart / a.height, b.blurStart / b.height, t);
    const blurEnd = lerp(a.blurEnd / a.height, b.blurEnd / b.height, t);
    for (let i = 0; i <= 5; i++) copy.style.setProperty(`--about-mask-${i}`, `${lerp(blurStart, blurEnd, i / 5) * 100}%`);
    // Allow every visual row to rise into the reading band, then scatter.
    // Keep a short empty hold with the portrait/navigation for the next stage.
    const flight = window.AboutTextFlight?.measure({
      ...flightOptions(), width, height, textY: target.textY, portraitBottom: target.y + target.size,
      topBlurNear: height * (1 - blurEnd),
      topBlurFar: height * (1 - blurStart)
    });
    textHeight = content.offsetHeight;
    window.AboutCopyFade?.measure({ height, textY: target.textY, textHeight });
    updateTravel(flight, true);
    storyTop = journey.getBoundingClientRect().top + window.scrollY;
    if(Number.isFinite(servicesRebase)&&Math.abs(window.scrollY-storyTop-servicesRebase)>.5){
      moveNative(storyTop + servicesRebase);
    }
    for (const layer of [wordmarkScale, decorationScale, introFrame]) {
      if (!layer) continue;
      layer.style.width = `${width}px`;
      layer.style.height = `${height}px`;
    }

    // Updated about artwork: the supplied SVG carries its own new opacity.
    // Reuse it on every viewport so smaller screens keep the same line tone.
    const backgroundScale = Math.max(1, width / 2560, height / 1305);
    // The return-to-dark matte uses the same cached raster and crop as About.
    hero.style.setProperty('--dark-raster-width', `${2560 * backgroundScale}px`);
    hero.style.setProperty('--dark-raster-height', `${1305 * backgroundScale}px`);
    if (siteBackdrop) {
      siteBackdrop.style.setProperty('--dark-raster-width', `${2560 * backgroundScale}px`);
      siteBackdrop.style.setProperty('--dark-raster-height', `${1305 * backgroundScale}px`);
    }
    const backgroundTransform = `translate3d(${(width - 2560 * backgroundScale) / 2}px, ${(height - 1305 * backgroundScale) / 2}px, 0) scale(${backgroundScale})`;
    lines.style.transform = backgroundTransform;
    if (lightLines) {
      // Figma 736:3447: 2561×1646.01 vector at y=-170 inside a 1305px frame.
      // Keep line spacing on shorter viewports and center the artwork.
      lightLines.style.transform = backgroundTransform;
    }
    document.documentElement.classList.add('has-scroll-story');
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    // Resizing and restoring a page should never animate from stale dimensions.
    displayedDistance = Math.max(0, window.scrollY - storyTop);
    lastTime = 0;
    render();
  }

  function updateAboutLight(after, requestedAfter, now) {
    const span = Math.max(1, flightMetrics.end - flightMetrics.start);
    const start = settings.aboutBackgroundStart;
    if (!aboutTransitionMs) {
      const flightProgress = (after - flightMetrics.start) / span;
      return after > 0 ? smoother(start, start + settings.aboutBackgroundDuration * settings.aboutRevealScrollDuration, flightProgress) : 0;
    }
    const requestedTarget = Number(requestedAfter > 0 && requestedAfter >= flightMetrics.start + span * start);
    if (lightTarget === null || reducedMotion.matches) {
      lightTarget = requestedTarget;
      lightTransitionStart = null;
    }
    if (lightTransitionStart !== null && now - lightTransitionStart >= aboutTransitionMs - .000001) lightTransitionStart = null;
    if (lightTransitionStart === null && requestedTarget !== lightTarget) {
      lightTarget = requestedTarget;
      lightTransitionStart = now;
    }
    if (lightTransitionStart === null) return lightTarget;
    const progress = smoother(0, 1, (now - lightTransitionStart) / aboutTransitionMs);
    return lightTarget ? progress : 1 - progress;
  }

  function paintAboutText(progress, after, returning, inspirationVisible) {
    const reduced = reducedMotion.matches;
    const textOpacity = smooth(.56, .94, progress);
    if (!lastAboutPaint || lastAboutPaint.progress !== progress || lastAboutPaint.after !== after || lastAboutPaint.reduced !== reduced) {
      lastAboutPaint = { progress, after, reduced };
      copy.style.setProperty('--about-text-opacity', textOpacity);
      // Keep the reading plane moving as the portrait settles and flight begins.
      const entry = clamp((progress - .4) / .6);
      copy.style.setProperty('--about-text-y', `${lerp(base.height + 50, target.textY, entry) - after}px`);
      window.AboutTextFlight?.update(after, { ...flightOptions(), reducedMotion: reduced });
    }
    const visibility = returning && inspirationVisible ? 'visible' : '';
    if (copy.style.visibility !== visibility) copy.style.visibility = visibility;
    const hidden = String(inspirationVisible || textOpacity < .01);
    if (lastAboutHidden !== hidden) {
      lastAboutHidden = hidden;
      copy.setAttribute('aria-hidden', hidden);
    }
  }

  function render(now = typeof performance !== 'undefined' ? performance.now() : lastTime || 0) {
    frame = 0;
    if (!base || !target) return;
    // Lenis advances before the shared timeline reads the browser position.
    // No second always-running clock is needed when scrolling is at rest.
    window.SiteSmoothScroll?.raf?.(now);
    const requestedDistance = Math.max(0, window.scrollY - storyTop);
    const elapsed = lastTime ? Math.min(64, Math.max(0, now - lastTime)) : 16.67;
    lastTime = now;
    const morphDistance = base.height * settings.heroScrollDuration;
    const response = requestedDistance > morphDistance || displayedDistance > morphDistance ? aboutResponseMs : responseMs;
    // Native scroll remains intact. Only the visual timeline follows it with
    // a short frame-rate-independent ease, including direction changes.
    if (displayedDistance === null || reducedMotion.matches || window.SiteSmoothScroll?.usesSmoothedScroll?.()) displayedDistance = requestedDistance;
    else displayedDistance += (requestedDistance - displayedDistance) * (1 - Math.exp(-elapsed / response));
    if (Math.abs(requestedDistance - displayedDistance) < .25) displayedDistance = requestedDistance;
    const distance = displayedDistance;
    const p = clamp(distance / morphDistance);
    const raw = smooth(0, 1, p);
    const eased = reducedMotion.matches ? (p < .5 ? 0 : 1) : 1 - (1 - raw) ** 2;
    const after = Math.min(textTravel, Math.max(0, distance - morphDistance) / settings.aboutScrollDuration);
    const requestedAfter = Math.min(textTravel, Math.max(0, requestedDistance - morphDistance) / settings.aboutScrollDuration);
    const lightProgress = updateAboutLight(after, requestedAfter, now);
    const inspirationOwnedScene = hero.classList.contains('is-inspiration');
    // Later chapters keep advancing the shared clock, but the finished Hero
    // and About pose is immutable. Do not rebuild its clip or touch every
    // glyph/hidden layer on each Works/Services scroll frame.
    if (!lastHeroPaint || lastHeroPaint.p !== p || lastHeroPaint.after !== after || lastHeroPaint.reduced !== reducedMotion.matches) {
      lastHeroPaint = { p, after, reduced: reducedMotion.matches };
      const width = lerp(base.width, target.size, eased);
      const height = lerp(base.height, target.size, eased);
      const x = (base.width - width) / 2;
      // The finished portrait stays at its about anchor while only the text moves.
      // Releasing this card belongs to the later transition into the next screen.
      const y = lerp(0, target.y, eased);
      place(scene, x, y, width, height);
      scene.style.clipPath = p === 0 ? 'none' : `path('${window.HeroSquircle.path(width, height, target.radius * eased, 1)}')`;
      // Spread the color change over the whole interval instead of its last 10%.
      // The softer curve starts and finishes gently while keeping the saved end.
      const shade = Math.round(222 * smoother(0, settings.whiteAt, p));
      scene.style.backgroundColor = `rgb(${shade}, ${shade}, ${shade})`;
      const decorationOpacity = 1 - smooth(.02, .6, p);
      const artworkScale = `scale(${width / base.width}, ${height / base.height})`;
      if (introFrame) introFrame.style.transform = `translate3d(${x}px, ${y}px, 0) ${artworkScale}`;
      scenery.style.opacity = '1';
      for (const layer of [wordmarkScale, decorationScale]) {
        if (layer) layer.style.transform = artworkScale;
      }
      if (decorationScale) decorationScale.style.opacity = `${decorationOpacity}`;
      if (wordmarkFrame) {
        // Filter a card-sized surface AFTER scaling the image. Even a 200 px
        // viewport blur therefore stays 200 px instead of expanding to a huge
        // filter on the full-resolution artwork as the card gets smaller.
        const blurProgress = smooth(.02, .6, p);
        const blur = settings.wordmarkBlur * blurProgress;
        const faded = settings.wordmarkFade && decorationOpacity === 0;
        wordmarkFrame.style.opacity = settings.wordmarkFade ? `${decorationOpacity}` : '1';
        wordmarkFrame.style.filter = reducedMotion.matches || p === 0 || faded || blur < .001 ? 'none' : `blur(${blur.toFixed(3)}px)`;
      }
      const end = { x: -target.size * .15085, y: -target.size * .1, width: target.size * 1.300883, height: target.size * 1.535 };
      for (const layer of [portrait, depth]) {
        place(layer, lerp(base.portrait.x, end.x, eased), lerp(base.portrait.y, end.y, eased), lerp(base.portrait.width, end.width, eased), lerp(base.portrait.height, end.height, eased));
      }
      const introOpacity = 1 - smooth(.02, .25, p);
      const welcomeExit = reducedMotion.matches ? (p > 0 ? 1 : 0) : smoother(0, .25, p);
      const welcomeOpacity = 1 - welcomeExit;
      const welcomeY = y + height - base.height + welcomeBottom * (1 - height / base.height) - 12 * welcomeExit;
      intro.style.opacity = `${introOpacity}`;
      intro.setAttribute('aria-hidden', introOpacity < .01 ? 'true' : 'false');
      welcome.style.setProperty('--welcome-opacity', welcomeOpacity);
      welcome.style.setProperty('--welcome-scroll-y', `${welcomeY.toFixed(3)}px`);
      welcome.style.setProperty('--welcome-scroll-scale', String(width / base.width));
      welcome.setAttribute('aria-hidden', welcomeOpacity < .01 ? 'true' : 'false');
      window.HeroWelcomeStack?.setVisible(welcomeOpacity > .01);
      logo.style.opacity = '1';
      const logoEntry = reducedMotion.matches ? (p > 0 ? 1 : 0) : smoother(.02, .26, p);
      logo.style.transform = `translate3d(0, ${(logoEntryDistance * (1 - logoEntry)).toFixed(3)}px, 0)`;
      hero.dataset.scrollProgress = p.toFixed(4);
      hero.dataset.scrollTarget = clamp(requestedDistance / morphDistance).toFixed(4);
      hero.dataset.aboutScrollDuration = settings.aboutScrollDuration.toFixed(2);
      hero.dataset.heroScrollDuration = settings.heroScrollDuration.toFixed(2);
      hero.dataset.aboutActive = p >= .12 ? 'true' : 'false';
      hero.style.setProperty('--about-footer-progress', smooth(.12, .3, p));
      document.querySelector('.custom-cursor')?.classList.toggle('is-past-hero', p >= .12);
      window.HeroDepthEffect?.setScrollGate(1 - smooth(.15, .9, p));
    }
    if (lastLightPaint !== lightProgress) {
      lastLightPaint = lightProgress;
      hero.style.setProperty('--about-light-progress', lightProgress);
      hero.dataset.lightProgress = lightProgress.toFixed(4);
      window.AboutCopyFade?.update({ progress: lightProgress });
    }
    const inspirationStart = morphDistance + textTravel * settings.aboutScrollDuration;
    window.ChapterAssets?.update({ distance, requestedDistance, morphDistance, inspirationStart,
      worksStart: inspirationStart + inspirationTravel, servicesStart, height: base.height, reducedMotion: reducedMotion.matches });
    const returnLocalDistance = Number.isFinite(aboutReturnAfter) && !reducedMotion.matches
      ? Math.min(-1, (aboutReturnAfter - textTravel) * settings.aboutScrollDuration) : -1;
    const chapter=window.InspirationChapter?.update(distance-inspirationStart, {
      reducedMotion:reducedMotion.matches, requestedLocalDistance:requestedDistance-inspirationStart, returnLocalDistance, now, lightProgress });
    const inspirationVisible = hero.classList.contains('is-inspiration');
    const returnProgress = chapter?.aboutReturnProgress;
    const returning = Number.isFinite(returnProgress) && Number.isFinite(aboutReturnAfter) && !reducedMotion.matches;
    // The native landing stays pinned while the same flight plays backward with the flip.
    const returnLanding = textTravel + returnLocalDistance / settings.aboutScrollDuration;
    const textAfter = returning ? lerp(Math.max(aboutReturnFrom, returnLanding), returnLanding, returnProgress) : after;
    paintAboutText(returning ? 1 : p, textAfter, returning, inspirationVisible);
    // The flip renderer temporarily owns the same portrait/scene elements.
    // Restore the cached About pose once when its reverse transition releases
    // them; settings/measurement likewise invalidate the paint cache.
    const releasedScene = inspirationOwnedScene && !inspirationVisible;
    if (releasedScene) { lastHeroPaint = null; lastLightPaint = null; }
    if(chapter && chapter.travel!==inspirationTravel){inspirationTravel=chapter.travel;writeJourneyBudget();}
    const worksStart=inspirationStart+inspirationTravel;
    const inspirationAnchor=Number.isFinite(chapter?.settleLocalDistance)?inspirationStart+chapter.settleLocalDistance:null;
    const inspirationCorrection=chapter?.scrollAdjustment||0;
    const services=window.ServicesScrollChapter?.update((inspirationAnchor??(distance+inspirationCorrection))-servicesStart,{
      requestedLocalDistance:(inspirationAnchor??(requestedDistance+inspirationCorrection))-servicesStart,
      reducedMotion:reducedMotion.matches,now
    });
    const settledDistance=Number.isFinite(services?.settleLocalDistance)?servicesStart+services.settleLocalDistance:inspirationAnchor;
    const scrollAdjustment=inspirationCorrection+(services?.scrollAdjustment||0);
    const animating=chapter?.animating||services?.animating;
    // A timed flip or a category/headline checkpoint owns this gesture. Even
    // an already exact anchor must discard a retained destination beyond it.
    if (animating || chapter?.blockSmooth || services?.blockSmooth || settledDistance !== null || scrollAdjustment) window.SiteSmoothScroll?.cancel?.();
    const sceneDistance=settledDistance??(distance+scrollAdjustment);
    window.WorksScrollChapter?.update(sceneDistance-worksStart,{reducedMotion:reducedMotion.matches,now});
    const worksBlack=sceneDistance>=worksStart&&!reducedMotion.matches?1:window.InspirationClosing?.getBlackProgress?.()??0;
    hero.style.setProperty('--works-black-progress',String(worksBlack));
    window.HeroAboutReveal?.update({ progress: lightProgress, width: base.width, height: base.height,
      mode: settings.aboutRevealMode, feather: settings.aboutFillFeather, reducedMotion: reducedMotion.matches, blackProgress:worksBlack });
    let nativeCorrectionAccepted = false;
    if(scrollAdjustment){
      nativeCorrectionAccepted = moveNative(storyTop + requestedDistance + scrollAdjustment);
    }
    if(settledDistance!==null)displayedDistance=Math.max(0,settledDistance);
    else if(scrollAdjustment)displayedDistance=Math.max(0,displayedDistance+scrollAdjustment);
    // The chapter already rendered its exact held pose. A verified physical
    // landing (or zero correction) is settled too, even at fractional pixels.
    if(settledDistance!==null&&!animating&&(nativeCorrectionAccepted||!scrollAdjustment)) {
      displayedDistance=Math.max(0,window.scrollY-storyTop);
    }
    hero.dataset.inspirationStart = inspirationStart.toFixed(3);
    // Chapter anchor corrections happen after the outer hero/theme was painted.
    // Paint that corrected pose once before sleeping, even if native scroll
    // already equals the newly settled visual distance.
    if (releasedScene || displayedDistance !== requestedDistance || Math.abs(distance - displayedDistance) > .25 || animating || services?.footerAnimating || lightTransitionStart !== null || (scrollAdjustment && !nativeCorrectionAccepted) || window.WorksGallery?.isAnimating?.() || window.SiteSmoothScroll?.isAnimating?.()) schedule();
    else lastTime = 0;
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(render); }
  function setSettings(patch) {
    const previousAboutDuration = settings.aboutScrollDuration;
    const previousHeroDuration = settings.heroScrollDuration;
    const previousChapterStart = base ? base.height * previousHeroDuration + textTravel * previousAboutDuration : Infinity;
    const chapterOffset = displayedDistance !== null && displayedDistance > previousChapterStart ? displayedDistance - previousChapterStart : null;
    Object.assign(settings, normalizeSettings(patch));
    lastHeroPaint = null;
    lastAboutPaint = null;
    applyTuningCss();
    if (base && displayedDistance !== null &&
      (settings.aboutScrollDuration !== previousAboutDuration || settings.heroScrollDuration !== previousHeroDuration)) {
      const previousMorphDistance = base.height * previousHeroDuration;
      const morphDistance = base.height * settings.heroScrollDuration;
      // Keep the current pose in either stage, then ease toward the new mapping
      // at the actual native scroll position. This never scrolls the page.
      if (displayedDistance <= previousMorphDistance) {
        displayedDistance = displayedDistance / previousMorphDistance * morphDistance;
      } else {
        const after = Math.min(textTravel, (displayedDistance - previousMorphDistance) / previousAboutDuration);
        displayedDistance = morphDistance + after * settings.aboutScrollDuration;
      }
    }
    const flight = window.AboutTextFlight?.configure(flightOptions());
    updateTravel(flight);
    if (chapterOffset !== null && base) displayedDistance = base.height * settings.heroScrollDuration + textTravel * settings.aboutScrollDuration + chapterOffset;
    try { window.localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Changes still work for the current visit. */ }
    window.dispatchEvent(new CustomEvent('hero-scroll:settings', { detail: { ...settings } }));
    schedule();
    return { ...settings };
  }
  window.HeroScrollEffect = Object.freeze({
    getSettings: () => ({ ...settings }),
    getDefaults: () => ({ ...publishedDefaults }),
    setSettings,
    resetSettings: () => setSettings(publishedDefaults),
  });
  hero.addEventListener('hero:layout', event => measure(event.detail));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pageshow', () => {
    lightTarget = null;
    window.InspirationChapter?.restore?.();
    window.ServicesScrollChapter?.restore?.();
    measure();
  });
  window.addEventListener('inspiration:ready', schedule);
  window.addEventListener('works:ready', () => measure());
  window.addEventListener('works:interaction', schedule);
  window.addEventListener('services:ready', () => measure());
  window.addEventListener('services:motion', schedule);
  window.addEventListener('chapter-assets:ready', schedule);
  reducedMotion.addEventListener('change', schedule);
  if (document.fonts?.ready) document.fonts.ready.then(() => measure());
  measure();
})();
