/* One clock owns the reversible Hero mask, About text and chapter handoffs. */
(() => {
  'use strict';

  const hero = document.querySelector('#hero');
  const journey = hero.closest('.hero-journey');
  const backdrop = document.querySelector('[data-site-backdrop]');
  const plane = hero.querySelector('.redesign-hero-plane');
  const scene = plane.querySelector('.hero__scene');
  const about = journey.querySelector('.redesign-about');
  const statements = [...about.querySelectorAll('[data-about-statement]')];
  const statementRows = statements.map(prepareStatementRows);
  const logo = hero.querySelector('[data-return-hero]');
  const navigationItems = hero.querySelectorAll(':scope > .hero__footer :is(.glass-button, .music-control, .language-control)');
  const worksTitle = document.querySelector('.works__title');
  const inkTargets = [logo, ...navigationItems, worksTitle].filter(Boolean);
  const cursor = document.querySelector('.custom-cursor');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const blindsCatchUpMs = 650;
  const bandCount = 5;
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
  let smokeAmount = 0;
  let lastSmokeDistance = null;

  // Keep the original text and its responsive line breaks as the reading copy.
  // Measure only on layout. Paint copies keep the same wrapping during a wipe.
  function prepareStatementRows(statement) {
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
        word.textContent = token;
        fragment.append(word);
        words.push(word);
      }
      text.replaceWith(fragment);
    }
    const layer = document.createElement('span');
    layer.className = 'redesign-about__rows';
    layer.setAttribute('aria-hidden', 'true');
    const haze = document.createElement('span');
    haze.className = 'redesign-about__haze';
    haze.setAttribute('aria-hidden', 'true');
    statement.append(reading, layer, haze);
    return { words, layer, haze, lines: [] };
  }

  function measureStatementRows() {
    for (const group of statementRows) {
      const { words, layer, haze, lines } = group;
      const rows = new Map();
      for (const word of words) {
        const top = word.offsetTop;
        if (!rows.has(top)) rows.set(top, []);
        rows.get(top).push(word.textContent);
      }
      const labels = [...rows.values()].map(row => row.join(' '));
      const sameLines = lines.length === labels.length &&
        lines.every(({ element }, index) => element.textContent === labels[index]);
      if (!sameLines) {
        lines.length = 0;
        for (const text of labels) {
          const element = document.createElement('span');
          element.className = 'redesign-about__row';
          element.textContent = text;
          lines.push({ element });
        }
        layer.replaceChildren(...lines.map(({ element }) => element));
        haze.replaceChildren(...lines.map(({ element }) => element.cloneNode(true)));
      }
    }
  }

  function paintAboutStatements(distance) {
    const swapProgress = progress(distance, geometry.first, geometry.second);
    const swapping = swapProgress > 0 && swapProgress < 1;
    activeStatement = Number(swapProgress >= .5);
    about.toggleAttribute('data-about-swapping', swapping);
    about.dataset.swapProgress = swapProgress.toFixed(4);
    for (const [index, statement] of statements.entries()) {
      const hidden = String(activeStatement !== index);
      if (statement.getAttribute('aria-hidden') !== hidden) statement.setAttribute('aria-hidden', hidden);
    }
    if (!swapping) return;
    // The reference replaces stationary letters along one soft frontier.
    // Its position belongs to scroll, so reverse input retraces the same image.
    const feather = .035;
    const edge = swapProgress * (1 + 4 * feather) - 2 * feather;
    const percent = value => (clamp(value) * 100).toFixed(4) + '%';
    for (const [index, { layer, haze }] of statementRows.entries()) {
      layer.style.clipPath = index === 1
        ? 'inset(0 ' + percent(1 - edge + feather) + ' 0 0)'
        : 'inset(0 0 0 ' + percent(edge + feather) + ')';
      const mask = 'linear-gradient(to right, transparent ' + percent(edge - feather) +
        ', #000 ' + percent(edge) + ', transparent ' + percent(edge + feather) + ')';
      haze.style.maskImage = mask;
      haze.style.webkitMaskImage = mask;
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
    if (enabled) measureStatementRows();

    const heroExitEnd = height * 1.7136;
    const aboutEntryStart = heroExitEnd * .54;
    const first = height * 2.38;
    const second = first + height * 1.1;
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
      perspective: window.innerWidth * .76,
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
      if (Number.isFinite(services?.rebaseDistance)) landing = services.rebaseDistance;
      else if (distance <= old.worksStart) landing = distance / old.worksStart * worksStart;
      else landing = worksStart + distance - old.worksStart;
      if (Math.abs(landing - distance) > 1) jump(landing);
    }
    lastDistance = landing;
    activeStatement = Number(landing >= second - 1);
    lastSmokeDistance = landing;
    smokeAmount = 0;
    lastTime = 0;
    schedule();
  }

  function paintBackdrop(distance, elapsed) {
    const { height, second, worksHandoff, darkenEnd, themeSamples } = geometry;
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
    const light = darken < 1 ? smooth(progress(distance, 0, height * .43)) : 0;
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
    const { width, height, heroExitEnd, aboutEntryStart, first, aboutExitStart, aboutExitEnd, perspective } = geometry;
    const departure = smooth(progress(distance, 0, heroExitEnd));
    const bend = Math.sin(Math.PI * departure) ** .85;
    const phone = width < 600;
    const frameScale = phone ? .64 : width < 1024 ? .677 : .625;
    const scale = frameScale * .53 + (1 - frameScale * .53) * (1 - departure) ** 1.28;
    const heroHidden = departure >= 1;
    const hideIntro = distance > 1;

    plane.setAttribute('aria-hidden', String(heroHidden));
    plane.classList.toggle('is-moving', departure > 0 && !heroHidden);
    const transform = departure ? 'translate3d(' +
      (-width * 1.2 * departure) + 'px,' + (-height * .38 * departure) +
      'px,0) rotateY(' + (62 * departure) + 'deg) rotateX(' + (-13 * bend) + 'deg) rotateZ(' + (-13 * departure) + 'deg) scale(' + scale + ')' : 'none';
    const trim = phone ? height * .086 * departure : 0;
    plane.style.setProperty('--redesign-hero-transform', transform);
    plane.style.setProperty('--redesign-hero-trim', trim + 'px');
    window.HeroFlightMask?.update({ width, height, transform, bend, trim, departure, perspective });
    window.HeroPlaneBend?.set(scene, heroHidden ? 0 : bend);
    window.HeroDepthEffect?.setScrollGate(1 - smooth(progress(distance, 0, height * .27)));
    window.HeroWelcomeStack?.setVisible(!hideIntro);

    const arrival = smooth(progress(distance, aboutEntryStart, first));
    const remaining = 1 - arrival;
    const copyExit = smooth(progress(distance, aboutExitStart, aboutExitEnd));
    const aboutVisible = arrival > 0 && copyExit < 1;
    const aboutX = width * .68 * remaining;
    const aboutY = height * .29 * remaining;
    const aboutScale = 1 - .6 * remaining - .75 * copyExit;
    about.style.setProperty('--redesign-about-transform',
      'translate3d(' + aboutX + 'px,' + aboutY + 'px,0) rotateY(' + (-65 * remaining) +
      'deg) rotateX(' + (22 * remaining) + 'deg) rotateZ(' + (10 * remaining) +
      'deg) scale(' + aboutScale + ')');
    about.style.setProperty('--redesign-about-alpha', String(1 - copyExit ** 1.35));
    about.toggleAttribute('data-about-exiting', copyExit > 0);
    about.setAttribute('aria-hidden', String(!aboutVisible));
    about.toggleAttribute('data-about-entry-smoke', arrival > 0 && arrival < 1);
    paintAboutStatements(distance);
    const logoProgress = smooth(progress(distance, height * .095, height * .49));
    logo.style.opacity = String(logoProgress);
    logo.style.transform = 'translate3d(0,' + ((1 - logoProgress) * 32) + 'px,0)';
    const aboutActive = String(logoProgress >= .85);
    if (hero.dataset.aboutActive !== aboutActive) hero.dataset.aboutActive = aboutActive;
    cursor?.classList.toggle('is-past-hero', hideIntro);
    hero.dataset.scrollProgress = progress(distance, 0, heroExitEnd).toFixed(4);
    hero.dataset.aboutStage = about.hasAttribute('data-about-swapping') ? 'swapping' : activeStatement ? 'second' : arrival === 1 ? 'first' : 'entering';
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
      smokeAmount = 0;
      lastSmokeDistance = null;
      window.AboutSmoke?.set({ amount: 0, phase: 0, width: geometry.width });
      window.HeroFlightMask?.reset();
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
      about.removeAttribute('data-about-exiting');
      about.removeAttribute('data-about-entry-smoke');
      delete about.dataset.swapProgress;
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

    // Lenis already smooths wheel deltas. A short, local interpolation keeps
    // native touch and keyboard scrolling smooth without a competing wheel RAF.
    const elapsed = lastTime ? Math.max(0, now - lastTime) : 16;
    lastTime = now;
    const native = !window.SiteSmoothScroll?.usesSmoothedScroll();
    const difference = requested - lastDistance;
    const interpolated = native && Math.abs(difference) > .5
      ? lastDistance + difference * (1 - Math.exp(-Math.max(1, Math.min(45, elapsed)) / 48))
      : requested;
    const distance = Math.abs(interpolated - requested) <= .5 ? requested : interpolated;
    lastDistance = distance;
    paint(distance);
    const smokeDistance = lastSmokeDistance === null ? distance : lastSmokeDistance;
    const smokeTravel = Math.abs(distance - smokeDistance);
    const smokeTarget = distance >= geometry.aboutEntryStart && distance <= geometry.second && smokeTravel > .05
      ? Math.max(.25, clamp(smokeTravel / height * 36)) : 0;
    smokeAmount = smokeTarget > smokeAmount ? smokeTarget : smokeAmount * Math.exp(-elapsed / 110);
    lastSmokeDistance = distance;
    if (smokeAmount < .005) smokeAmount = 0;
    window.AboutSmoke?.set({ amount: smokeAmount, phase: progress(distance, geometry.aboutEntryStart, geometry.second), width: geometry.width });
    const blindsMoving = paintBackdrop(distance, elapsed);
    const entryProgress = progress(distance, geometry.second, worksStart);
    const services = window.ServicesScrollChapter?.update(distance - servicesStart, { now });
    window.WorksScrollChapter?.update(distance - worksStart, { entryProgress, titleReady: distance >= geometry.worksHandoff, now });
    if (smokeAmount || blindsMoving || Math.abs(distance - requested) > .5 || services?.footerAnimating ||
      window.WorksGallery?.isAnimating?.() || window.SiteSmoothScroll?.isAnimating()) schedule();
    else lastTime = 0;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  // The preloader and the existing Lenis adapter use this readiness marker.
  window.HeroScrollEffect = Object.freeze({ mode: 'redesign' });
  hero.addEventListener('hero:layout', () => measure());
  window.addEventListener('scroll', schedule, { passive: true });
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
