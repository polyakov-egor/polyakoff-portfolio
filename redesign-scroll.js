/* One clock owns the scroll-linked chapters and the timed About statement change. */
(() => {
  'use strict';

  const hero = document.querySelector('#hero');
  const journey = hero.closest('.hero-journey');
  const backdrop = document.querySelector('[data-site-backdrop]');
  const plane = hero.querySelector('.redesign-hero-plane');
  const scene = plane.querySelector('.hero__scene');
  const about = journey.querySelector('.redesign-about');
  const statements = [...about.querySelectorAll('[data-about-statement]')];
  const statementWords = statements.map(prepareStatementWords);
  const logo = hero.querySelector('[data-return-hero]');
  const navigationItems = hero.querySelectorAll(':scope > .hero__footer :is(.glass-button, .music-control, .language-control)');
  const worksTitle = document.querySelector('.works__title');
  const inkTargets = [logo, ...navigationItems, worksTitle].filter(Boolean);
  const cursor = document.querySelector('.custom-cursor');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wordDuration = 420;
  const wordStagger = 90;
  const blindsCatchUpMs = 650;
  const bandCount = 5;
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
  let paintedBlinds = null;
  let activeStatement = 0;
  let swapDuration = wordDuration;
  let swap = null;
  let swapLanding = null;
  let gesture = 0;
  let blockedGesture = -1;
  let lastInputTime = -Infinity;
  let wheelIntent = 0;
  let touchActive = false;

  // Preserve the source text, spaces and responsive breaks while revealing words.
  function prepareStatementWords(statement) {
    const reading = document.createElement('span');
    reading.className = 'redesign-about__reading';
    reading.append(...statement.childNodes);
    const walker = document.createTreeWalker(reading, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const words = [];
    for (const text of textNodes) {
      if (!text.data.trim()) continue;
      const fragment = document.createDocumentFragment();
      for (const token of text.data.match(/\s+|\S+/g)) {
        if (!token.trim()) { fragment.append(token); continue; }
        const word = document.createElement('span');
        word.className = 'redesign-about__word';
        word.textContent = token;
        fragment.append(word);
        words.push(word);
      }
      text.replaceWith(fragment);
    }
    statement.append(reading);
    return words;
  }

  function resetStatementWords() {
    for (const words of statementWords) for (const word of words) {
      word.style.removeProperty('transform');
      word.style.removeProperty('visibility');
    }
  }

  function paintAboutStatements() {
    about.toggleAttribute('data-about-swapping', Boolean(swap));
    const visibleStatement = swap ? swap.target : activeStatement;
    for (const [index, statement] of statements.entries()) {
      const hidden = String(visibleStatement !== index);
      if (statement.getAttribute('aria-hidden') !== hidden) statement.setAttribute('aria-hidden', hidden);
    }
    if (!swap) { resetStatementWords(); return; }

    // The previous phrase cuts immediately. Whole words arrive in source order.
    for (const [index, word] of statementWords[swap.target].entries()) {
      const elapsed = swap.elapsed - index * wordStagger;
      const remaining = (1 - clamp(elapsed / wordDuration)) ** 3;
      word.style.visibility = elapsed < 0 ? 'hidden' : 'visible';
      word.style.transform = 'translateY(' + (.18 * remaining) + 'em) rotate(' + (10 * remaining) + 'deg)';
    }
  }

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

    const first = height * 2.04;
    const heroExitEnd = first * .84;
    const aboutEntryStart = height * .43;
    const second = first + height * .16;
    const worksStart = second + height * .76;
    // On phones the lead card dips past the left edge before returning.
    const phoneExitLead = .56 + .05 * progress(width, 320, 375);
    const aboutExitStart = worksStart + height * (width < 600 ? phoneExitLead : width < 1024 ? .14 : .09);
    const aboutExitEnd = aboutExitStart + height * .36;
    const works = window.WorksScrollChapter?.measure({ width, height, start: worksStart });
    const worksHandoff = worksStart + (works?.leadHandoffDistance ?? height * .305);
    const darkenEnd = worksHandoff + height * .38;
    const worksTravel = works?.travel ?? 0;
    const services = window.ServicesScrollChapter?.measure({
      width, height, worksStart, worksTravel, distance: rebase && old ? distance : undefined,
      worksHeadingDistance: works?.servicesHeadingDistance, worksRevealDistance: works?.servicesRevealDistance,
    });
    const heroTop = hero.getBoundingClientRect().top;
    geometry = {
      width, height, heroExitEnd, aboutEntryStart, first, second, worksStart, aboutExitStart, aboutExitEnd,
      worksHandoff, darkenEnd,
      themeSamples: inkTargets.map(element => {
        const rect = element.getBoundingClientRect();
        const center = element === logo ? logo.offsetTop + logo.offsetHeight / 2 : rect.top - heroTop + rect.height / 2;
        return { element, y: clamp(center / height) };
      }),
      servicesStart: services?.start ?? Infinity,
    };
    hero.dataset.aboutFirst = first.toFixed(2);
    hero.dataset.aboutSecond = second.toFixed(2);
    hero.dataset.worksStart = worksStart.toFixed(2);
    if (enabled) journey.style.height = (height + worksStart + worksTravel + (services?.travel ?? 0)) + 'px';
    else journey.style.removeProperty('height');

    let landing = distance;
    if (old && enabled && rebase) {
      if (swap) landing = swap.target ? first : second;
      else if (Number.isFinite(services?.rebaseDistance)) landing = services.rebaseDistance;
      else if (distance <= old.worksStart) landing = distance / old.worksStart * worksStart;
      else landing = worksStart + distance - old.worksStart;
      if (Math.abs(landing - distance) > 1) jump(landing);
    }
    lastDistance = landing;
    if (!swap) activeStatement = Number(landing >= second - 1);
    lastTime = 0;
    schedule();
  }

  function startAboutSwap(target, now) {
    swapDuration = wordDuration + wordStagger * Math.max(0, statementWords[target].length - 1);
    resetStatementWords();
    swap = { target, started: now, elapsed: 0 };
    swapLanding = null;
    blockedGesture = gesture;
    jump(target ? geometry.first : geometry.second);
    schedule();
  }

  function resolveDistance(requested, now) {
    const { first, second } = geometry;
    if (swap) {
      const { target, started } = swap;
      const elapsed = clamp((now - started) / swapDuration);
      swap.elapsed = elapsed * swapDuration;
      activeStatement = elapsed < .5 ? 1 - target : target;
      if (elapsed < 1) {
        const held = target ? first : second;
        if (Math.abs(requested - held) > 1) jump(held);
        return held;
      }
      swap = null;
      blockedGesture = gesture;
      const landing = target ? second : first;
      swapLanding = target ? 'second' : 'first';
      jump(landing);
      return landing;
    }

    // Pin the end of a long gesture at the readable About states. The next
    // deliberate wheel gesture or swipe can enter the timed interval.
    const deliberateInput = touchActive || now - lastInputTime < 350;
    if (swapLanding && deliberateInput && gesture === blockedGesture) {
      const held = geometry[swapLanding];
      if (Math.abs(requested - held) > 1) jump(held);
      return held;
    }
    swapLanding = null;
    if (deliberateInput && lastDistance < first - 2 && requested >= first) {
      blockedGesture = gesture;
      activeStatement = 0;
      jump(first);
      return first;
    }
    if (deliberateInput && lastDistance > second + 2 && requested <= second) {
      blockedGesture = gesture;
      activeStatement = 1;
      jump(second);
      return second;
    }

    const inSwapRange = requested > first + 2 && requested < second - 2;
    const movedThroughSwap = deliberateInput &&
      ((lastDistance <= first + 2 && requested > first + 2) ||
       (lastDistance >= second - 2 && requested < second - 2));
    if (inSwapRange || movedThroughSwap) {
      if (gesture !== blockedGesture || !deliberateInput) startAboutSwap(activeStatement === 0 ? 1 : 0, now);
      const held = activeStatement === 0 ? first : second;
      if (Math.abs(requested - held) > 1) jump(held);
      return held;
    }
    activeStatement = Number(requested >= second - 2);
    return requested;
  }

  function paintBackdrop(distance, elapsed) {
    const { aboutEntryStart, second, worksHandoff, darkenEnd, themeSamples } = geometry;
    const target = progress(distance, worksHandoff, darkenEnd);
    if (paintedBlinds === null || distance <= second) {
      // An initial/restored position or the settled About must use its own backdrop.
      paintedBlinds = target;
    } else {
      // Slow input follows scroll directly. Fast input is limited in either direction.
      const difference = target - paintedBlinds;
      const step = elapsed / blindsCatchUpMs;
      paintedBlinds = Math.abs(difference) <= step ? target : paintedBlinds + Math.sign(difference) * step;
    }
    const darken = paintedBlinds;
    const light = darken < 1 ? smooth(progress(distance, 0, aboutEntryStart)) : 0;
    const edges = [];
    if (darken > 0 && darken < 1) {
      const maxDelay = .48;
      const stops = [];
      const percent = fraction => (fraction * 100).toFixed(4) + '%';
      // Build the mask from the top edge, with a later start for lower bands.
      for (let i = 0; i < bandCount; i++) {
        const delay = maxDelay * i / (bandCount - 1);
        const cover = smooth((darken - delay) / (1 - maxDelay));
        const start = i / bandCount;
        const edge = (i + cover) / bandCount;
        const end = (i + 1) / bandCount;
        edges.push(edge);
        if (cover > 0) stops.push('transparent ' + percent(start) + ' ' + percent(edge));
        if (cover < 1) stops.push('#000 ' + percent(edge) + ' ' + percent(end));
      }
      backdrop?.style.setProperty('--redesign-light-mask', 'linear-gradient(to bottom, ' + stops.join(', ') + ')');
    } else {
      backdrop?.style.removeProperty('--redesign-light-mask');
    }
    backdrop?.style.setProperty('--redesign-light', light.toFixed(4));

    const inkAt = y => {
      const band = Math.min(bandCount - 1, Math.floor(y * bandCount));
      return light >= .52 && (!edges.length || y >= edges[band]) ? '1' : '0';
    };
    hero.style.setProperty('--redesign-ink', inkAt(.5));
    for (const { element, y } of themeSamples) {
      const ink = inkAt(y);
      if (element.style.getPropertyValue('--redesign-ink') !== ink) element.style.setProperty('--redesign-ink', ink);
    }
    hero.dataset.lightProgress = (light * (1 - smooth(darken))).toFixed(4);
    return darken !== target;
  }

  function paint(distance) {
    const { width, height, heroExitEnd, aboutEntryStart, first, aboutExitStart, aboutExitEnd } = geometry;
    const departure = smooth(progress(distance, 0, heroExitEnd));
    const bend = Math.sin(Math.PI * departure) ** .85;
    const phone = width < 600;
    const frameScale = phone ? .64 : width < 1024 ? .677 : .625;
    const scale = frameScale * .53 + (1 - frameScale * .53) * (1 - departure) ** 1.28;
    const heroHidden = departure >= 1;
    const hideIntro = distance > 1;

    plane.setAttribute('aria-hidden', String(heroHidden));
    plane.classList.toggle('is-moving', departure > 0 && !heroHidden);
    plane.style.setProperty('--redesign-hero-transform', departure ? 'translate3d(' +
      (-width * 1.2 * departure) + 'px,' + (-height * .38 * departure) +
      'px,0) rotateY(' + (62 * departure) + 'deg) rotateX(' + (-13 * bend) + 'deg) rotateZ(' + (-13 * departure) + 'deg) scale(' + scale + ')' : 'none');
    plane.style.setProperty('--redesign-hero-trim', phone ? (height * .086 * departure) + 'px' : '0px');
    window.HeroPlaneBend?.set(scene, heroHidden ? 0 : bend);
    window.HeroDepthEffect?.setScrollGate(1 - smooth(progress(distance, 0, height * .27)));
    window.HeroWelcomeStack?.setVisible(!hideIntro);

    const arrival = smooth(progress(distance, aboutEntryStart, first));
    const remaining = 1 - arrival;
    const copyExit = smooth(progress(distance, aboutExitStart, aboutExitEnd));
    const aboutVisible = arrival > 0 && copyExit < 1;
    const aboutX = width * .84 * remaining;
    const aboutY = height * .29 * remaining;
    const aboutScale = 1 - .5 * remaining - .75 * copyExit;
    about.style.setProperty('--redesign-about-transform',
      'translate3d(' + aboutX + 'px,' + aboutY + 'px,0) rotateY(' + (-53 * remaining) +
      'deg) rotateX(' + (17 * remaining) + 'deg) rotateZ(' + (8 * remaining) +
      'deg) scale(' + aboutScale + ')');
    about.style.setProperty('--redesign-about-alpha', String(1 - copyExit ** 1.35));
    about.toggleAttribute('data-about-exiting', copyExit > 0);
    about.setAttribute('aria-hidden', String(!aboutVisible));
    paintAboutStatements();
    const logoProgress = smooth(progress(distance, height * .095, height * .49));
    logo.style.opacity = String(logoProgress);
    logo.style.transform = 'translate3d(0,' + ((1 - logoProgress) * 32) + 'px,0)';
    const aboutActive = String(logoProgress >= .85);
    if (hero.dataset.aboutActive !== aboutActive) hero.dataset.aboutActive = aboutActive;
    cursor?.classList.toggle('is-past-hero', hideIntro);
    hero.dataset.scrollProgress = progress(distance, 0, heroExitEnd).toFixed(4);
    hero.dataset.aboutStage = swap ? 'swapping' : activeStatement ? 'second' : arrival === 1 ? 'first' : 'entering';
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
      swap = null;
      swapLanding = null;
      paintedBlinds = null;
      lastTime = 0;
      hero.dataset.scrollProgress = '0';
      for (const element of [plane, about, ...statements]) element.removeAttribute('aria-hidden');
      plane.classList.remove('is-moving');
      plane.style.removeProperty('--redesign-hero-transform');
      plane.style.removeProperty('--redesign-hero-trim');
      about.style.removeProperty('--redesign-about-transform');
      about.style.removeProperty('--redesign-about-alpha');
      about.removeAttribute('data-about-swapping');
      resetStatementWords();
      about.removeAttribute('data-about-exiting');
      logo.style.removeProperty('opacity');
      logo.style.removeProperty('transform');
      backdrop?.style.removeProperty('--redesign-light');
      backdrop?.style.removeProperty('--redesign-light-mask');
      hero.style.removeProperty('--redesign-ink');
      for (const element of inkTargets) element.style.removeProperty('--redesign-ink');
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
    const elapsed = lastTime ? Math.max(0, now - lastTime) : 16;
    lastTime = now;
    const native = !window.SiteSmoothScroll?.usesSmoothedScroll();
    const easeNative = native && !swap && resolved !== geometry.first && resolved !== geometry.second;
    const difference = resolved - lastDistance;
    const distance = easeNative && Math.abs(difference) > .5
      ? lastDistance + difference * (1 - Math.exp(-Math.max(1, Math.min(45, elapsed)) / 48))
      : resolved;
    lastDistance = distance;
    paint(distance);
    const blindsMoving = paintBackdrop(distance, elapsed);
    const entryProgress = progress(distance, geometry.second, worksStart);
    const services = window.ServicesScrollChapter?.update(distance - servicesStart, { now });
    window.WorksScrollChapter?.update(distance - worksStart, { entryProgress, titleReady: distance >= geometry.worksHandoff, now });
    if (swap || blindsMoving || Math.abs(distance - resolved) > .5 || services?.footerAnimating ||
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
    const carriedMomentum = swapLanding && gesture === blockedGesture && Math.abs(current - geometry[swapLanding]) <= 2;
    if (!swap && !forward && !backward && !carriedMomentum) return;
    if (event.cancelable) event.preventDefault();
    window.SiteSmoothScroll?.cancel();
    if (!swap && (forward || backward) && gesture !== blockedGesture) startAboutSwap(forward ? 1 : 0, now);
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
  window.addEventListener('pageshow', () => {
    paintedBlinds = null;
    measure(false);
  });
  document.addEventListener('visibilitychange', () => {
    lastTime = 0;
    if (!document.hidden) schedule();
  });
  for (const name of ['works:ready', 'services:ready']) window.addEventListener(name, () => measure());
  for (const name of ['inspiration:ready', 'works:interaction', 'chapter-assets:ready']) window.addEventListener(name, schedule);
  reduced.addEventListener('change', () => measure(false));
  document.fonts?.ready.then(() => measure());
  measure(false);
})();
