/* LOAD turns while the first screen prepares. DONE follows the real asset
   and layout barriers. Later chapters retain their own prefetch. */
(() => {
  'use strict';
  if (window.SitePreloader) return;
  const html = document.documentElement;
  const failedResources = new Set();
  const blockingKeys = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ']);
  const state = { phase: 'loading', completed: 0, total: 0, progress: 0, failed: [] };
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const loadTurnInterval = 2000, turnDuration = 560, doneHold = 220;
  let overlay, rotor, status, retry, main, hero;
  let generation = 0, changedViewport = false, slowTimer = 0, revealTimer = 0, resizeFrame = 0;
  let loadTimer = 0, doneTimer = 0, turn = null;
  let resolveReady;
  const whenReady = new Promise(resolve => { resolveReady = resolve; });
  const isBlocking = () => state.phase !== 'entered';
  const firstScreen = () => window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  const twoFrames = () => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  const source = image => image.currentSrc || image.src || '';
  html.classList.add('is-site-loading');
  html.dataset.preloaderState = 'loading';
  // Claim restoration before deferred scene owners can initialize at an old
  // history position. No fixed body or zero-size/hidden Hero is introduced.
  try { window.history.scrollRestoration = 'manual'; } catch { /* Optional browser capability. */ }
  firstScreen();
  window.SitePreloader = Object.freeze({ isBlocking, whenReady,
    getState: () => ({ ...state, failed: [...state.failed] }) });

  function recordResourceError(event) {
    const target = event.target;
    if (target?.tagName === 'SCRIPT' || target?.tagName === 'LINK') {
      const url = target.src || target.href;
      if (url) failedResources.add(url);
    }
  }
  document.addEventListener('error', recordResourceError, true);
  function blockScroll(event) {
    if (!isBlocking()) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }
  function keyDown(event) {
    if (!isBlocking() || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation();
      (retry && !retry.hidden ? retry : overlay)?.focus({ preventScroll: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.target === retry && !retry.hidden) window.location.reload();
    } else if (blockingKeys.has(event.key)) blockScroll(event);
  }
  window.addEventListener('wheel', blockScroll, { capture: true, passive: false });
  window.addEventListener('touchmove', blockScroll, { capture: true, passive: false });
  window.addEventListener('keydown', keyDown, true);
  const onPageShow = () => { if (isBlocking()) firstScreen(); };
  window.addEventListener('pageshow', onPageShow);
  const onResize = () => {
    if (!isBlocking() || state.phase === 'entering') return;
    changedViewport = true;
    if (state.phase === 'ready' || state.phase === 'done') {
      // Let the browser select the new <picture> candidates before decode().
      // A synchronous decode during media selection can abort a valid image.
      phase('loading');
      stopTurns();
      resizeFrame = window.requestAnimationFrame(() => { resizeFrame = 0; prepare(); });
    }
  };
  window.addEventListener('resize', onResize);

  function clearTurnTimers() {
    clearTimeout(loadTimer);
    clearTimeout(doneTimer);
    loadTimer = 0;
    doneTimer = 0;
  }

  function stopTurns() {
    clearTurnTimers();
    turn?.cancel();
    turn = null;
    rotor.dataset.word = 'load';
    rotor.dataset.nextWord = 'load';
  }

  function playTurn(word, onFinish) {
    rotor.dataset.nextWord = word;
    if (reduced?.matches || typeof rotor.animate !== 'function') {
      rotor.dataset.word = word;
      onFinish();
      return;
    }
    const animation = rotor.animate([
      { transform: 'translateZ(-20px) rotateX(0deg)' },
      { transform: 'translateZ(-20px) rotateX(-90deg)' }
    ], { duration: turnDuration, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' });
    turn = animation;
    animation.finished.then(() => {
      if (turn !== animation) return;
      // Both faces have the same screen position at their resting angle.
      rotor.dataset.word = word;
      turn = null;
      animation.cancel();
      onFinish();
    }, () => {});
  }

  function scheduleLoadTurn() {
    if (!rotor || loadTimer || document.hidden || reduced?.matches || state.phase !== 'loading') return;
    loadTimer = setTimeout(() => {
      loadTimer = 0;
      if (state.phase !== 'loading' || document.hidden) return;
      if (!turn) playTurn('load', presentDone);
      scheduleLoadTurn();
    }, loadTurnInterval);
  }

  function presentDone() {
    if (state.phase !== 'ready' || turn || document.hidden) return;
    playTurn('done', () => {
      phase('done');
      scheduleEntry();
    });
  }

  function scheduleEntry() {
    if (doneTimer || document.hidden || state.phase !== 'done') return;
    doneTimer = setTimeout(() => {
      doneTimer = 0;
      if (!document.hidden) enter();
    }, doneHold);
  }

  function paintProgress() {
    state.progress = state.total ? Math.floor(state.completed / state.total * 100) : 0;
    if (overlay) overlay.dataset.progress = String(state.progress);
  }
  const onVisibility = () => {
    if (document.hidden) {
      clearTurnTimers();
      turn?.pause();
      return;
    }
    if (turn?.playState === 'paused') turn.play();
    scheduleLoadTurn();
    presentDone();
    scheduleEntry();
  };
  document.addEventListener('visibilitychange', onVisibility);
  function phase(value) {
    state.phase = value;
    html.dataset.preloaderState = value;
    if (overlay) overlay.dataset.state = value;
  }
  function imageReady(image) {
    return new Promise((resolve, reject) => {
      let decoding = false, finished = false;
      const clean = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
      const failed = () => { if (!finished) { finished = true; clean(); reject(new Error('Image unavailable')); } };
      async function loaded() {
        if (finished || decoding) return;
        if (!image.complete || !image.naturalWidth) { if (image.complete) failed(); return; }
        decoding = true;
        const current = source(image);
        try { if (typeof image.decode === 'function') await image.decode(); }
        catch { decoding = false; if (current !== source(image)) { loaded(); return; } failed(); return; }
        decoding = false;
        if (current !== source(image)) { loaded(); return; }
        if (!image.naturalWidth) { failed(); return; }
        finished = true; clean(); resolve();
      }
      image.addEventListener('load', loaded);
      image.addEventListener('error', failed);
      loaded();
    });
  }
  function depthReady() {
    const canvas = hero.querySelector('[data-layer="depth"]');
    if (!canvas || !window.HeroDepthEffect) return Promise.reject(new Error('Portrait renderer unavailable'));
    // 'ready' is published only after drawArrays AND the retained bitmap copy.
    // Static fallback is valid because portrait.decode is a separate barrier.
    const finished = new Set(['ready','disabled','reduced-motion','unsupported','unavailable','context-lost']);
    return new Promise(resolve => {
      const inspect = () => { if (finished.has(canvas.dataset.state)) { observer?.disconnect(); resolve(); } };
      const observer = typeof MutationObserver === 'function' ? new MutationObserver(inspect) : null;
      observer?.observe(canvas, { attributes: true, attributeFilter: ['data-state'] });
      inspect();
    });
  }
  function criticalImages() {
    const background = document.querySelector('[data-site-backdrop]')?.querySelector('.about-backdrop__lines');
    const nodes = [...overlay.querySelectorAll('img'),
      ...(background ? [background] : []),
      ...hero.querySelectorAll('.hero__scene img, .hero__welcome img, .hero__footer img, .hero__motion img')];
    const unique = new Map();
    for (const image of nodes) {
      if (image.classList.contains('theme-icon__light') || !source(image)) continue;
      // Copies share one fetch; responsive DOM nodes still validate their own
      // currentSrc after decode, including a rotation during loading.
      const url = source(image);
      if (!unique.has(url)) unique.set(url, image);
    }
    return [...unique.values()];
  }
  async function prepare() {
    const run = ++generation;
    changedViewport = false;
    clearTimeout(slowTimer);
    phase('loading');
    state.completed = 0; state.total = 0; state.failed = [];
    paintProgress();
    scheduleLoadTurn();
    overlay.removeAttribute('data-failed-task');
    overlay.removeAttribute('data-failed-resource');
    retry.hidden = true;
    overlay.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading the first screen';
    const tasks = [];
    const add = (name, load, url = '') => tasks.push({ name, load, url });
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      add('stylesheet', () => {
        if (failedResources.has(link.href) || !link.sheet) throw new Error('Stylesheet unavailable');
      });
    }
    add('scripts', () => {
      const failed = [...document.querySelectorAll('script[src]')].some(script => failedResources.has(script.src));
      if (failed || !window.HeroWelcomeStack || !window.HeroScrollEffect || !hero.heroLayout) throw new Error('First-screen code unavailable');
    });
    const images = criticalImages();
    for (const image of images) add('image', () => imageReady(image), source(image));
    if (document.fonts?.load) {
      for (const [font, sample] of [['400 12px "Roboto Mono"','I’M EGOR 00:00'], ['300 14px "Roboto"','Welcome to the club buddy!'], ['300 14px "Noto Sans SC"','欢迎加入俱乐部，伙计！我是叶戈尔。'], ['400 48px "Inter Tight"','I’m a designer']]) {
        add('font', async () => {
          const faces = await document.fonts.load(font, sample);
          if (!faces.length) throw new Error('Font unavailable');
        });
      }
      add('font-layout', () => document.fonts.ready);
    }
    add('portrait-frame', depthReady);
    // One final real rendering/layout barrier is included in the denominator.
    state.total = tasks.length + 1;
    paintProgress();
    slowTimer = setTimeout(() => {
      if (run !== generation || state.phase !== 'loading') return;
      overlay.dataset.state = 'slow';
      status.textContent = 'Still loading. Check your connection or retry.';
      retry.hidden = false;
    }, 30000);
    try {
      await Promise.all(tasks.map(async task => {
        try { await task.load(); }
        catch (error) {
          if (run === generation) {
            state.failed.push(task.name);
            overlay.dataset.failedTask = task.name;
            overlay.dataset.failedResource = task.url;
          }
          throw error;
        }
        if (run !== generation || state.phase !== 'loading') return;
        state.completed++; paintProgress();
      }));
      if (run !== generation || state.phase !== 'loading') return;
      // A responsive texture switch can start after a resize task observed the
      // previous frame. Recheck the renderer after every asset/font barrier.
      await depthReady();
      if (run !== generation || state.phase !== 'loading') return;
      await twoFrames();
      if (run !== generation || state.phase !== 'loading') return;
      if (changedViewport) { prepare(); return; }
      if (!hero.heroLayout || Number(hero.dataset.scrollProgress) !== 0) throw new Error('First screen not in position');
      state.completed++; paintProgress();
      clearTimeout(slowTimer);
      clearTurnTimers();
      phase('ready');
      retry.hidden = true;
      overlay.setAttribute('aria-busy', 'false');
      status.textContent = 'First screen ready';
      resolveReady();
      presentDone();
    } catch {
      if (run !== generation) return;
      clearTimeout(slowTimer);
      phase('error');
      stopTurns();
      overlay.setAttribute('aria-busy', 'false');
      status.textContent = 'Couldn’t load the first screen. Please retry.';
      retry.hidden = false;
    }
  }
  function finishEnter() {
    if (state.phase !== 'entering') return;
    clearTimeout(revealTimer);
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    phase('entered');
    html.classList.remove('is-site-entering','is-site-loading');
    main.inert = false;
    overlay.hidden = true;
    // Finish without leaving focus in the now-hidden dialog or scrolling a
    // focusable element into view. The first screen stays in its normal shell.
    if (overlay.contains(document.activeElement)) document.activeElement.blur();
    hero.removeEventListener('animationend', animationEnd);
    document.removeEventListener('error', recordResourceError, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('wheel', blockScroll, true);
    window.removeEventListener('touchmove', blockScroll, true);
    window.removeEventListener('keydown', keyDown, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pageshow', onPageShow);
    window.dispatchEvent(new CustomEvent('site:entered'));
  }
  function animationEnd(event) {
    if (event.target === hero && ['site-hero-enter','site-hero-enter-reduced'].includes(event.animationName)) finishEnter();
  }
  function enter() {
    if (state.phase !== 'done') return;
    const canvas = hero.querySelector('[data-layer="depth"]');
    if (canvas?.dataset.state === 'loading' || criticalImages().some(image => !image.complete || !image.naturalWidth)) {
      stopTurns();
      prepare();
      return;
    }
    phase('entering');
    html.classList.add('is-site-entering');
    html.classList.remove('is-site-loading');
    hero.addEventListener('animationend', animationEnd);
    revealTimer = setTimeout(finishEnter, reduced?.matches ? 210 : 1300);
  }
  function mount() {
    document.removeEventListener('readystatechange', startLoadingMotion);
    overlay = document.querySelector('[data-site-preloader]');
    rotor = overlay?.querySelector('[data-preloader-rotor]');
    main = document.querySelector('body > main');
    hero = document.querySelector('.hero');
    if (!rotor || !main || !hero) {
      clearTurnTimers();
      if (overlay) overlay.hidden = true;
      phase('entered'); html.classList.remove('is-site-loading'); return;
    }
    status = overlay.querySelector('[data-preloader-status]');
    retry = overlay.querySelector('[data-preloader-retry]');
    main.inert = true;
    firstScreen();
    overlay.focus({ preventScroll: true });
    retry.addEventListener('click', () => window.location.reload());
    prepare();
  }
  function startLoadingMotion() {
    if (document.readyState !== 'interactive') return;
    rotor = document.querySelector('[data-site-preloader]')?.querySelector('[data-preloader-rotor]');
    scheduleLoadTurn();
  }
  if (document.readyState === 'loading') {
    // The loader can already turn while deferred first-screen scripts download.
    document.addEventListener('readystatechange', startLoadingMotion);
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else mount();
})();
