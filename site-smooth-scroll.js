/* Lenis owns wheel smoothing; the existing story owns its only RAF clock.
   Native touch/keyboard input and timed chapter gestures retain their owners. */
(() => {
  'use strict';
  if (window.SiteSmoothScroll) return;
  const html = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');
  const nativeSurface = '#hero-effect-panel, .effect-controls__panel, textarea, [contenteditable="true"], [data-lenis-prevent]';
  const navigationKeys = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ']);
  let instance = null, wheelMode = false;
  const entered = () => !window.SitePreloader?.isBlocking?.();
  const isAnimating = () => Boolean(instance && !document.hidden && instance.isScrolling === 'smooth');
  const wake = () => window.dispatchEvent(new CustomEvent('inspiration:ready'));

  function cancel() {
    if (!instance) return;
    const actual = instance.actualScroll;
    if (Math.abs(instance.targetScroll - actual) > .01) {
      instance.scrollTo(actual, { immediate: true, force: true });
    } else if (instance.isScrolling === 'smooth') {
      // scrollTo has an early return when its target is already equal. These
      // public lifecycle methods also discard that last retained animation.
      instance.stop(); instance.start();
    }
  }
  function jump(top) {
    if (!Number.isFinite(top)) return;
    top = Math.max(0, top);
    if (!instance) { window.scrollTo({ top, behavior: 'instant' }); return; }
    cancel();
    if (Math.abs(instance.actualScroll - top) > .01 || Math.abs(instance.targetScroll - top) > .01) {
      instance.scrollTo(top, { immediate: true, force: true });
    }
  }
  function virtualScroll({ deltaX = 0, deltaY = 0, event }) {
    if (!event) return false;
    const touch = event.type?.startsWith('touch');
    if (event.defaultPrevented || !entered() || document.hidden || touch ||
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        Math.abs(deltaX) > Math.abs(deltaY) || event.target?.closest?.(nativeSurface)) {
      cancel();
      if (touch) wheelMode = false;
      return false;
    }
    if (!Number.isFinite(deltaY) || Math.abs(deltaY) < .01) return false;
    // Prime a sleeping clock before Lenis starts a new destination. Otherwise
    // its first delta time would include the whole idle interval and jump.
    if (!isAnimating() && instance) {
      // Browser pixel rounding and instant chapter rebases can land slightly
      // away from the last animated value. Start the next gesture at the
      // actual viewport, never a stale value across a nearby chapter boundary.
      instance.stop(); instance.start();
      instance.raf(performance.now());
    }
    wheelMode = true;
    wake();
    return true;
  }
  function configure() {
    if (!entered()) return;
    if (reduced.matches || coarse.matches || typeof window.Lenis !== 'function' || !window.HeroScrollEffect) {
      cancel(); instance?.destroy(); instance = null; wheelMode = false;
      html.dataset.scrollEngine = 'native'; wake(); return;
    }
    if (instance) return;
    instance = new window.Lenis({
      autoRaf: false, autoResize: true, smoothWheel: true, syncTouch: false,
      lerp: .085, wheelMultiplier: 1, anchors: false, allowNestedScroll: false,
      prevent: node => Boolean(node.matches?.(nativeSurface)), virtualScroll,
    });
    html.dataset.scrollEngine = 'lenis';
  }
  function nativeInput() { cancel(); wheelMode = false; }
  window.SiteSmoothScroll = Object.freeze({
    jump, cancel, isAnimating,
    usesSmoothedScroll: () => Boolean(instance && wheelMode && !document.hidden),
    raf: time => {
      // A wheel can arrive after this display frame's timestamp was sampled.
      // Never feed Lenis a negative delta relative to the event-time prime:
      // interpolation would briefly run backwards across a chapter boundary.
      if (isAnimating()) instance.raf(Math.max(time, instance.time));
    },
    getState: () => ({ enabled: Boolean(instance), version: instance ? '1.3.27' : null,
      wheelMode, animating: isAnimating(), actual: window.scrollY,
      target: instance?.targetScroll ?? window.scrollY }),
  });
  // Capturing happens before native defaults; it never prevents a key, click,
  // touch or horizontal card drag from reaching the existing controllers.
  window.addEventListener('keydown', event => { if (navigationKeys.has(event.key)) nativeInput(); }, true);
  window.addEventListener('pointerdown', nativeInput, { capture: true, passive: true });
  window.addEventListener('touchstart', nativeInput, { capture: true, passive: true });
  window.addEventListener('blur', nativeInput);
  window.addEventListener('pagehide', nativeInput);
  document.addEventListener('visibilitychange', nativeInput);
  reduced.addEventListener('change', configure);
  coarse.addEventListener('change', configure);
  window.addEventListener('pageshow', () => { nativeInput(); instance?.resize(); });
  window.addEventListener('site:entered', configure, { once: true });
  configure();
})();
