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
  const statementRows = statements.map(prepareStatementRows);
  const logo = hero.querySelector('[data-return-hero]');
  const cursor = document.querySelector('.custom-cursor');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const referenceFrame = 1000 / 30;
  const rowStagger = 2 * referenceFrame;
  // Horizontal travel and apparent width, sampled separately from 053.mp4.
  // The centers are clamped to their resting positions at each end.
  const outgoingPoses = [
    [0, 1], [.052, .998], [.147, .988], [.261, .955], [.398, .895],
    [.536, .81], [.654, .705], [.758, .59], [.834, .483], [.9, .373],
    [.948, .255], [.986, .137], [1, .025], [1, 0],
  ];
  const incomingPoses = [
    [0, 0], [0, .008], [0, .03], [.014, .134], [.047, .273],
    [.108, .411], [.184, .541], [.278, .667], [.373, .753], [.476, .84],
    [.594, .909], [.722, .957], [.84, .987], [.939, 1], [1, 1],
  ];
  const rowDuration = (incomingPoses.length - 1) * referenceFrame;
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
  let activeStatement = 0;
  let swapDuration = rowDuration;
  let swap = null;
  let swapLanding = null;
  let gesture = 0;
  let blockedGesture = -1;
  let lastInputTime = -Infinity;
  let wheelIntent = 0;
  let touchActive = false;

  // Keep the original text and its responsive line breaks as the reading copy.
  // Measure only on layout, then rotate one paint-only layer per visual row.
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
    statement.append(reading, layer);
    return { statement, words, layer, lines: [], width: 0 };
  }

  function measureStatementRows() {
    for (const group of statementRows) {
      const { statement, words, layer, lines } = group;
      group.width = statement.offsetWidth;
      const rows = new Map();
      for (const word of words) {
        const top = word.offsetTop;
        const left = word.offsetLeft;
        if (!rows.has(top)) rows.set(top, { words: [], left, right: left });
        const row = rows.get(top);
        row.words.push(word.textContent);
        row.right = left + word.offsetWidth;
      }
      const measured = [...rows.values()];
      const labels = measured.map(row => row.words.join(' '));
      const sameLines = lines.length === labels.length &&
        lines.every(({ element }, index) => element.textContent === labels[index]);
      if (!sameLines) {
        lines.length = 0;
        for (const text of labels) {
          const element = document.createElement('span');
          element.className = 'redesign-about__row';
          element.textContent = text;
          lines.push({ element, halfWidth: 1 });
        }
        layer.replaceChildren(...lines.map(({ element }) => element));
      }
      lines.forEach((line, index) => {
        line.halfWidth = Math.max(1, (measured[index].right - measured[index].left) / 2);
        line.element.style.transformOrigin = '50% ' + (lines.length / 2 - index) * 100 + '%';
      });
    }
    const longestStatement = Math.max(...statementRows.map(group => group.lines.length));
    swapDuration = rowDuration + rowStagger * Math.max(0, longestStatement - 1);
  }

  function paintAboutStatements(width) {
    about.toggleAttribute('data-about-swapping', Boolean(swap));
    for (const [index, statement] of statements.entries()) {
      const hidden = String(activeStatement !== index);
      if (statement.getAttribute('aria-hidden') !== hidden) statement.setAttribute('aria-hidden', hidden);
    }
    if (!swap) return;

    const direction = swap.target ? 1 : -1;
    for (const [index, { width: statementWidth, lines }] of statementRows.entries()) {
      const incoming = index === swap.target;
      const side = incoming ? direction : -direction;
      const poses = incoming ? incomingPoses : outgoingPoses;
      const travel = Math.max(width * .33, statementWidth * .56);
      for (const [row, { element, halfWidth }] of lines.entries()) {
        const frame = Math.min(poses.length - 1, Math.max(0, (swap.elapsed - row * rowStagger) / referenceFrame));
        const lower = Math.floor(frame);
        const [startX, startWidth] = poses[lower];
        const [endX, endWidth] = poses[Math.min(lower + 1, poses.length - 1)];
        const blend = frame - lower;
        const fraction = startX + (endX - startX) * blend;
        const apparentWidth = startWidth + (endWidth - startWidth) * blend;
        const x = side * travel * (incoming ? 1 - fraction : fraction);

        // Project the row like a turned plane. Correct its projected center
        // so perspective cannot create a small move in the opposite direction.
        const tilt = side * .13 * Math.sqrt(1 - apparentWidth ** 2);
        const scaleX = Math.max(.001, apparentWidth * (1 - tilt ** 2));
        const centeredX = x + apparentWidth * halfWidth * tilt;
        element.style.transform = 'translateX(' + centeredX + 'px) matrix3d(' +
          scaleX + ',0,0,' + (tilt / halfWidth) + ',0,1,0,0,0,0,1,0,0,0,0,1)';
        element.style.opacity = smooth(progress(apparentWidth, 0, .025)).toFixed(4);
      }
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
    geometry = {
      width, height, shrinkEnd, first, second, worksStart,
      servicesStart: services?.start ?? Infinity,
      servicesHeadingStart: services ? services.start + services.headingStart : Infinity,
      servicesHeadingFade: services?.headingFade ?? 1,
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

  function paint(distance) {
    const { width, height, shrinkEnd, first, second, worksStart, servicesHeadingStart, servicesHeadingFade } = geometry;
    const shrink = smooth(distance / shrinkEnd);
    const departure = smooth(progress(distance, shrinkEnd, first));
    const turn = Math.pow(departure, .72);
    const bend = Math.sin(Math.PI * departure);
    const phone = width < 600;
    const frameScale = phone ? .64 : width < 1024 ? .677 : .625;
    const scale = (1 - (1 - frameScale) * shrink) * (1 - .26 * departure);
    const heroHidden = departure >= 1;
    const hideIntro = distance > 1;

    plane.setAttribute('aria-hidden', String(heroHidden));
    plane.classList.toggle('is-moving', shrink > 0 && !heroHidden);
    plane.style.setProperty('--redesign-hero-transform', shrink ? 'translate3d(' +
      (-width * 1.2 * departure) + 'px,' + (-height * ((phone ? .004 * shrink : 0) + .1 * departure)) +
      'px,0) rotateY(' + (57 * turn) + 'deg) rotateX(' + (-10 * bend) + 'deg) rotateZ(' + (-8 * departure) + 'deg) scale(' + scale + ')' : 'none');
    plane.style.setProperty('--redesign-hero-trim', phone ? (height * .086 * shrink) + 'px' : '0px');
    window.HeroPlaneBend?.set(scene, heroHidden ? 0 : bend);
    window.HeroDepthEffect?.setScrollGate(1 - smooth(progress(distance, 0, shrinkEnd * .4)));
    window.HeroWelcomeStack?.setVisible(!hideIntro);

    const arrival = smooth(progress(distance, shrinkEnd * .99, first));
    const remaining = 1 - arrival;
    const perspective = Math.pow(remaining, .68);
    const aboutX = width * .92 * Math.pow(remaining, 1.65);
    const aboutY = height * .29 * Math.pow(remaining, .82);
    const arrivalScale = .50 + .50 * Math.pow(arrival, 1.34);
    const worksEntry = progress(distance, second, worksStart);
    const copyExit = smooth(worksEntry);
    const aboutOpacity = Number(arrival > 0) * (1 - copyExit);
    about.style.setProperty('--redesign-about-transform',
      'translate3d(' + aboutX + 'px,' + aboutY + 'px,0) rotateY(' + (-53 * perspective) +
      'deg) rotateX(' + (17 * perspective) + 'deg) rotateZ(' + (8 * perspective) +
      'deg) scale(' + (arrivalScale * (1 - copyExit * .16)) + ')');
    about.style.setProperty('--redesign-about-opacity', aboutOpacity.toFixed(4));
    about.setAttribute('aria-hidden', String(aboutOpacity === 0));
    paintAboutStatements(width);

    const darken = smooth((distance - servicesHeadingStart) / servicesHeadingFade);
    const light = smooth(progress(distance, 0, shrinkEnd * .6)) * (1 - darken);
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
    hero.dataset.aboutStage = swap ? 'swapping' : activeStatement ? 'second' : arrival === 1 ? 'first' : 'entering';
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
      swap = null;
      swapLanding = null;
      hero.dataset.scrollProgress = '0';
      for (const element of [plane, about, ...statements]) element.removeAttribute('aria-hidden');
      plane.classList.remove('is-moving');
      plane.style.removeProperty('--redesign-hero-transform');
      plane.style.removeProperty('--redesign-hero-trim');
      about.style.removeProperty('--redesign-about-transform');
      about.style.removeProperty('--redesign-about-opacity');
      about.removeAttribute('data-about-swapping');
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
    const easeNative = native && !swap && resolved !== geometry.first && resolved !== geometry.second;
    const difference = resolved - lastDistance;
    const distance = easeNative && Math.abs(difference) > .5
      ? lastDistance + difference * (1 - Math.exp(-Math.max(1, elapsed) / 48))
      : resolved;
    lastDistance = distance;
    const entryProgress = paint(distance);
    const services = window.ServicesScrollChapter?.update(distance - servicesStart, { now });
    window.WorksScrollChapter?.update(distance - worksStart, { entryProgress, now });
    if (swap || Math.abs(distance - resolved) > .5 || services?.footerAnimating ||
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
  window.addEventListener('pageshow', () => measure(false));
  for (const name of ['works:ready', 'services:ready']) window.addEventListener(name, () => measure());
  for (const name of ['inspiration:ready', 'works:interaction', 'chapter-assets:ready']) window.addEventListener(name, schedule);
  reduced.addEventListener('change', () => measure(false));
  document.fonts?.ready.then(() => measure());
  measure(false);
})();
