/* One clock owns the scroll-linked chapters and the timed About crossfade. */
(() => {
  'use strict';

  const hero = document.querySelector('#hero');
  const journey = hero.closest('.hero-journey');
  const backdrop = document.querySelector('[data-site-backdrop]');
  const plane = hero.querySelector('.redesign-hero-plane');
  const scene = plane.querySelector('.hero__scene');
  const about = journey.querySelector('.redesign-about');
  const statements = [...about.querySelectorAll('[data-about-statement]')];
  const logo = hero.querySelector('[data-return-hero]');
  const cursor = document.querySelector('.custom-cursor');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fadeDuration = 360;
  const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' ']);
  const clamp = value => Math.min(1, Math.max(0, value));
  const smooth = value => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const progress = (value, start, end) => clamp((value - start) / (end - start));

  let geometry;
  let storyTop = 0;
  let frame = 0;
  let lastDistance = 0;
  let lastTime = 0;
  let aboutMix = 0;
  let fade = null;
  let fadeLanding = null;
  let gesture = 0;
  let blockedGesture = -1;
  let lastInputTime = -Infinity;
  let wheelIntent = 0;
  let touchActive = false;

  function jump(distance) {
    const top = Math.max(0, storyTop + distance);
    if (window.SiteSmoothScroll) window.SiteSmoothScroll.jump(top);
    else if (Math.abs(window.scrollY - top) > .75) window.scrollTo({ top, behavior: 'instant' });
  }

  function measure(rebase = true) {
    const size = hero.heroLayout;
    if (!size) return;
    const { width, height } = size;
    const enabled = !reduced.matches;
    const old = geometry;
    storyTop = journey.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(0, window.scrollY - storyTop);
    document.documentElement.classList.toggle('has-scroll-story', enabled);
    if (enabled && about.parentNode !== hero) hero.insertBefore(about, logo);
    if (!enabled && about.parentNode !== journey) hero.after(about);

    const shrinkEnd = height * .68;
    const first = shrinkEnd + height * .82;
    const second = first + height * .16;
    const worksStart = second + height * .56;
    const works = window.WorksScrollChapter?.measure({ width, height, start: worksStart });
    const worksTravel = works?.travel ?? 0;
    const services = window.ServicesScrollChapter?.measure({
      width, height, worksStart, worksTravel, distance: rebase && old ? distance : undefined,
      worksHeadingDistance: works?.servicesHeadingDistance, worksRevealDistance: works?.servicesRevealDistance,
    });
    geometry = { width, height, shrinkEnd, first, second, worksStart, servicesStart: services?.start ?? Infinity };
    hero.dataset.aboutFirst = first.toFixed(2);
    hero.dataset.aboutSecond = second.toFixed(2);
    hero.dataset.worksStart = worksStart.toFixed(2);
    if (enabled) journey.style.height = (height + worksStart + worksTravel + (services?.travel ?? 0)) + 'px';
    else journey.style.removeProperty('height');

    let landing = distance;
    if (old && enabled && rebase) {
      if (fade) landing = fade.target ? first : second;
      else if (Number.isFinite(services?.rebaseDistance)) landing = services.rebaseDistance;
      else if (distance <= old.worksStart) landing = distance / old.worksStart * worksStart;
      else landing = worksStart + distance - old.worksStart;
      if (Math.abs(landing - distance) > 1) jump(landing);
    }
    lastDistance = landing;
    if (!fade) aboutMix = Number(landing >= second - 1);
    lastTime = 0;
    schedule();
  }

  function beginFade(target, now) {
    fade = { target, started: now };
    fadeLanding = null;
    blockedGesture = gesture;
    jump(target ? geometry.first : geometry.second);
    schedule();
  }

  function resolveDistance(requested, now) {
    const { first, second } = geometry;
    if (fade) {
      const { target, started } = fade;
      const elapsed = clamp((now - started) / fadeDuration);
      const mix = smooth(elapsed);
      aboutMix = target ? mix : 1 - mix;
      if (elapsed < 1) {
        const held = target ? first : second;
        if (Math.abs(requested - held) > 1) jump(held);
        return held;
      }
      fade = null;
      blockedGesture = gesture;
      const landing = target ? second : first;
      fadeLanding = target ? 'second' : 'first';
      jump(landing);
      return landing;
    }

    // Pin the end of a long gesture at the readable About states. The next
    // deliberate wheel gesture or swipe can enter the timed interval.
    const deliberateInput = touchActive || now - lastInputTime < 350;
    if (fadeLanding && deliberateInput && gesture === blockedGesture) {
      const held = geometry[fadeLanding];
      if (Math.abs(requested - held) > 1) jump(held);
      return held;
    }
    fadeLanding = null;
    if (deliberateInput && lastDistance < first - 2 && requested >= first) {
      blockedGesture = gesture;
      aboutMix = 0;
      jump(first);
      return first;
    }
    if (deliberateInput && lastDistance > second + 2 && requested <= second) {
      blockedGesture = gesture;
      aboutMix = 1;
      jump(second);
      return second;
    }

    const inSwapRange = requested > first + 2 && requested < second - 2;
    const movedThroughSwap = deliberateInput &&
      ((lastDistance <= first + 2 && requested > first + 2) ||
       (lastDistance >= second - 2 && requested < second - 2));
    if (inSwapRange || movedThroughSwap) {
      if (gesture !== blockedGesture || !deliberateInput) beginFade(aboutMix === 0 ? 1 : 0, now);
      const held = aboutMix === 0 ? first : second;
      if (Math.abs(requested - held) > 1) jump(held);
      return held;
    }
    aboutMix = Number(requested >= second - 2);
    return requested;
  }

  function paint(distance) {
    const { width, height, shrinkEnd, first, second, worksStart } = geometry;
    const shrink = smooth(distance / shrinkEnd);
    const departure = smooth(progress(distance, shrinkEnd, first));
    const phone = width < 600;
    const frameScale = phone ? .64 : width < 1024 ? .677 : .625;
    const scale = (1 - (1 - frameScale) * shrink) * (1 - .26 * departure);
    const heroHidden = departure >= 1;
    const hideIntro = distance > 1;

    plane.setAttribute('aria-hidden', String(heroHidden));
    plane.classList.toggle('is-moving', shrink > 0 && !heroHidden);
    plane.style.setProperty('--redesign-hero-transform', shrink ? 'translate3d(' +
      (-width * 1.2 * departure) + 'px,' + (-height * ((phone ? .004 * shrink : 0) + .1 * departure)) +
      'px,0) rotateY(' + (42 * departure) + 'deg) rotateZ(' + (-5 * departure) + 'deg) scale(' + scale + ')' : 'none');
    plane.style.setProperty('--redesign-hero-trim', phone ? (height * .086 * shrink) + 'px' : '0px');
    window.HeroPlaneBend?.set(scene, heroHidden ? 0 : Math.sin(Math.PI * departure));
    window.HeroDepthEffect?.setScrollGate(1 - smooth(progress(distance, 0, shrinkEnd * .4)));
    window.HeroWelcomeStack?.setVisible(!hideIntro);

    const arrival = smooth(progress(distance, shrinkEnd * 1.08, first));
    const worksEntry = progress(distance, second, worksStart);
    const copyExit = smooth(worksEntry);
    const aboutOpacity = Number(arrival > 0) * (1 - copyExit);
    about.style.setProperty('--redesign-about-transform', 'translate3d(' + ((1 - arrival) * width * 1.1) +
      'px,' + ((1 - arrival) * height * .18) + 'px,0) rotateY(' + ((1 - arrival) * -24) +
      'deg) rotateZ(' + ((1 - arrival) * 5) + 'deg) scale(' + (1 - copyExit * .16) + ')');
    about.style.setProperty('--redesign-about-opacity', aboutOpacity.toFixed(4));
    about.style.setProperty('--redesign-about-swap', aboutMix.toFixed(4));
    about.setAttribute('aria-hidden', String(aboutOpacity === 0));
    statements[0].setAttribute('aria-hidden', String(aboutMix >= .5));
    statements[1].setAttribute('aria-hidden', String(aboutMix < .5));

    const light = smooth(progress(distance, 0, shrinkEnd * .6)) * (1 - smooth(worksEntry * 1.45));
    backdrop?.style.setProperty('--redesign-light', light.toFixed(4));
    // Use one of the two ink colors at the midpoint so fixed labels stay legible.
    hero.style.setProperty('--redesign-ink', light >= .56 ? '1' : '0');
    const logoProgress = smooth(progress(distance, shrinkEnd * .14, shrinkEnd * .72));
    logo.style.opacity = String(logoProgress);
    logo.style.transform = 'translate3d(0,' + ((1 - logoProgress) * 32) + 'px,0)';
    const aboutActive = String(logoProgress >= .85);
    if (hero.dataset.aboutActive !== aboutActive) hero.dataset.aboutActive = aboutActive;
    cursor?.classList.toggle('is-past-hero', hideIntro);
    hero.dataset.scrollProgress = progress(distance, 0, shrinkEnd).toFixed(4);
    hero.dataset.aboutStage = fade ? 'crossfade' : aboutMix ? 'second' : arrival === 1 ? 'first' : 'entering';
    hero.dataset.lightProgress = light.toFixed(4);
    return worksEntry;
  }

  function render(now) {
    frame = 0;
    if (!geometry) return;
    window.SiteSmoothScroll?.raf(now);
    const requested = Math.max(0, window.scrollY - storyTop);
    const staticLayout = reduced.matches;
    const { height, worksStart, servicesStart } = geometry;
    window.ChapterAssets?.update({ distance: requested, worksStart, servicesStart, height, reducedMotion: staticLayout });
    if (staticLayout) {
      fade = null;
      fadeLanding = null;
      hero.dataset.scrollProgress = '0';
      for (const element of [plane, about, ...statements]) element.removeAttribute('aria-hidden');
      plane.classList.remove('is-moving');
      plane.style.removeProperty('--redesign-hero-transform');
      plane.style.removeProperty('--redesign-hero-trim');
      about.style.removeProperty('--redesign-about-transform');
      about.style.removeProperty('--redesign-about-opacity');
      about.style.removeProperty('--redesign-about-swap');
      logo.style.removeProperty('opacity');
      logo.style.removeProperty('transform');
      backdrop?.style.removeProperty('--redesign-light');
      hero.style.removeProperty('--redesign-ink');
      delete hero.dataset.aboutActive;
      cursor?.classList.remove('is-past-hero');
      window.HeroPlaneBend?.set(scene, 0);
      window.HeroDepthEffect?.setScrollGate(1);
      window.HeroWelcomeStack?.setVisible(true);
      window.ServicesScrollChapter?.update(0, { now, reducedMotion: true });
      return;
    }

    const resolved = resolveDistance(requested, now);
    // Lenis already smooths wheel deltas. A short, local interpolation keeps
    // native touch and keyboard scrolling smooth without a competing wheel RAF.
    const elapsed = lastTime ? Math.min(45, now - lastTime) : 16;
    lastTime = now;
    const native = !window.SiteSmoothScroll?.usesSmoothedScroll();
    const easeNative = native && !fade && resolved !== geometry.first && resolved !== geometry.second;
    const difference = resolved - lastDistance;
    const distance = easeNative && Math.abs(difference) > .5
      ? lastDistance + difference * (1 - Math.exp(-Math.max(1, elapsed) / 48))
      : resolved;
    lastDistance = distance;
    const entryProgress = paint(distance);
    const services = window.ServicesScrollChapter?.update(distance - servicesStart, { now });
    window.WorksScrollChapter?.update(distance - worksStart, { entryProgress, now });
    if (fade || Math.abs(distance - resolved) > .5 || services?.footerAnimating ||
      window.WorksGallery?.isAnimating?.() || window.SiteSmoothScroll?.isAnimating()) schedule();
    else lastTime = 0;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function onWheel(event) {
    if (!geometry || reduced.matches || event.defaultPrevented || window.SitePreloader?.isBlocking?.() ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
      !event.deltaY || event.target?.closest?.('[data-lenis-prevent], textarea, [contenteditable="true"]')) return;
    const now = performance.now();
    const intent = window.SiteWheelIntent.sample(event, now, geometry.height);
    if (!intent) return;
    const { direction } = intent;
    if (intent.id !== wheelIntent) {
      wheelIntent = intent.id;
      gesture++;
    }
    lastInputTime = now;
    const current = window.scrollY - storyTop;
    const forward = direction > 0 && Math.abs(current - geometry.first) <= 2;
    const backward = direction < 0 && Math.abs(current - geometry.second) <= 2;
    const carriedMomentum = fadeLanding && gesture === blockedGesture && Math.abs(current - geometry[fadeLanding]) <= 2;
    if (!fade && !forward && !backward && !carriedMomentum) return;
    if (event.cancelable) event.preventDefault();
    window.SiteSmoothScroll?.cancel();
    if (!fade && (forward || backward) && gesture !== blockedGesture) beginFade(forward ? 1 : 0, now);
  }

  // The preloader and the existing Lenis adapter use this readiness marker.
  window.HeroScrollEffect = Object.freeze({ mode: 'redesign' });
  hero.addEventListener('hero:layout', () => measure());
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || !scrollKeys.has(event.key) ||
      event.target?.closest?.('button, input, textarea, select, [contenteditable="true"]')) return;
    if (!event.repeat) gesture++;
    lastInputTime = performance.now();
  });
  window.addEventListener('touchstart', () => {
    gesture++;
    touchActive = true;
    lastInputTime = performance.now();
  }, { passive: true });
  for (const type of ['touchend', 'touchcancel']) {
    window.addEventListener(type, () => {
      touchActive = false;
      lastInputTime = performance.now();
    }, { passive: true });
  }
  window.addEventListener('pageshow', () => measure(false));
  for (const name of ['works:ready', 'services:ready']) window.addEventListener(name, () => measure());
  for (const name of ['inspiration:ready', 'works:interaction', 'chapter-assets:ready']) window.addEventListener(name, schedule);
  reduced.addEventListener('change', () => measure(false));
  document.fonts?.ready.then(() => measure());
  measure(false);
})();
