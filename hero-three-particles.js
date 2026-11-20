(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  const host = hero?.querySelector('.hero__portrait-breath');
  const portrait = host?.querySelector('[data-layer="portrait"]');
  if (!portrait) return;

  const defaults = Object.freeze({
    enabled: true, particleCount: 160000, particleSize: 4.5, particleOpacity: .9,
    speed: 1.5, noiseScale: .005, noiseStrength: .10, damping: .873, lifespan: 960,
    imageOpacity: 1, cursorStrength: .36, cursorRadius: 60,
    showImage: true, cursorInteraction: true, paused: false,
  });
  const limits = {
    particleCount: [10000, 500000], particleSize: [.1, 6], particleOpacity: [0, 1],
    speed: [0, 4], noiseScale: [.0001, .02], noiseStrength: [0, .5], damping: [.8, .999],
    lifespan: [10, 2000], imageOpacity: [0, 1], cursorStrength: [0, .4], cursorRadius: [1, 300],
  };
  const settings = { ...defaults };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 1099px)');
  const phone = matchMedia('(max-width: 599px)');
  const images = new Map();
  let engineModule, current, pendingKey, failure;
  let generation = 0, frame = 0, lastFrame = 0, frames = 0;
  let visible = true, status = 'waiting';
  let atTop = (window.HeroDepthEffect?.getScrollGate?.() ?? 1) >= .9999;
  let entered = !window.SitePreloader?.isBlocking?.();
  let bounds = hero.heroLayout?.portrait;
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, time: 0, active: false };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const getSettings = () => ({ ...settings });
  const inHero = () => entered && atTop && visible;
  const getState = () => ({
    status, inHero: inHero(), frames, count: current?.renderer.count ?? 0,
    error: status === 'unavailable' ? failure?.error.message : undefined,
  });
  const canPresent = () => settings.enabled && !reduced.matches && inHero() && !document.hidden && Boolean(bounds);
  const canAnimate = () => canPresent() && !settings.paused;

  function notify() {
    window.dispatchEvent(new CustomEvent('hero-three-particles:state', { detail: getState() }));
  }

  function showStatus(next) {
    if (status === next) return;
    status = next;
    notify();
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    clearPointer();
  }

  function clearPointer() {
    pointer.active = false;
    pointer.vx = pointer.vy = 0;
  }

  function dropPortrait() {
    if (!current) return;
    const previous = current;
    current = null;
    hero.classList.remove('has-three-particle-portrait');
    window.HeroDepthEffect?.setParticlePortraitVisible(false);
    previous.canvas.remove();
    previous.renderer.dispose();
  }

  function invalidatePending() {
    generation++;
    pendingKey = null;
  }

  function fallback(error, key) {
    failure = { key, error };
    invalidatePending();
    stop();
    dropPortrait();
    showStatus('unavailable');
  }

  function positionCanvas(canvas) {
    canvas.style.width = `${bounds.width}px`;
    canvas.style.height = `${bounds.height}px`;
    canvas.style.transform = `translate3d(${bounds.x}px,${bounds.y}px,0)`;
  }

  function portraitSource() {
    const bundle = window.HERO_TEXTURES || window.HeroDepthTextures;
    if (location.protocol === 'file:' && bundle) return small.matches ? bundle.colorSmall : bundle.color;
    return small.matches ? portrait.dataset.colorSmall : portrait.dataset.colorLarge;
  }

  function loadPortrait(source) {
    if (!images.has(source)) {
      const image = new Image();
      image.src = source;
      const pending = image.decode().then(() => image);
      images.set(source, pending);
      pending.catch(() => images.delete(source));
    }
    return images.get(source);
  }

  function animate(now) {
    frame = 0;
    if (!current || !canAnimate()) return;
    const dt = lastFrame ? clamp((now - lastFrame) / 1000, 0, .05) : 1 / 60;
    lastFrame = now;
    const momentumFade = Math.exp(-dt * 8);
    pointer.vx *= momentumFade;
    pointer.vy *= momentumFade;
    try {
      current.renderer.render(dt, pointer);
      frames++;
    } catch (error) {
      fallback(error, current.key);
      return;
    }
    frame = requestAnimationFrame(animate);
  }

  async function prepare(source, key) {
    const run = ++generation;
    pendingKey = key;
    showStatus('loading');
    let canvas, renderer;
    try {
      engineModule ??= import('./hero-three-particle-engine.js?v=2');
      const [{ createParticleRenderer }, image] = await Promise.all([engineModule, loadPortrait(source)]);
      if (run !== generation) return;
      if (!canPresent()) {
        pendingKey = null;
        sync();
        return;
      }

      canvas = document.createElement('canvas');
      canvas.className = 'scene-layer scene-layer--three-particles';
      canvas.dataset.layer = 'three-particles';
      canvas.setAttribute('aria-hidden', 'true');
      positionCanvas(canvas);
      // The engine shares live controls. Count changes get a new simulation.
      const renderSettings = Object.create(settings);
      Object.defineProperty(renderSettings, 'maxDpr', { get: () => phone.matches ? 1 : 1.25 });
      renderer = createParticleRenderer({ canvas, image, width: bounds.width, height: bounds.height, settings: renderSettings });
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        if (canvas === current?.canvas) fallback(new Error('Particle WebGL context was lost'), current.key);
      });

      const previous = current;
      current = { key, canvas, renderer };
      if (previous) {
        previous.canvas.replaceWith(canvas);
        previous.renderer.dispose();
      } else host.append(canvas);
      pendingKey = null;
      failure = null;
      frames++;
      hero.classList.add('has-three-particle-portrait');
      window.HeroDepthEffect?.setParticlePortraitVisible(true);
      sync();
    } catch (error) {
      if (current?.canvas !== canvas) renderer?.dispose();
      if (run === generation) fallback(error, key);
    }
  }

  function sync() {
    if (!settings.enabled || reduced.matches) {
      invalidatePending();
      stop();
      dropPortrait();
      showStatus(reduced.matches ? 'reduced' : 'disabled');
      return;
    }
    if (!canPresent()) {
      stop();
      showStatus(current ? 'paused' : 'waiting');
      return;
    }
    const source = portraitSource();
    const key = `${small.matches ? 'small' : 'large'}:${settings.particleCount}`;
    if (failure?.key === key) {
      showStatus('unavailable');
      return;
    }
    if (current?.key !== key) {
      if (pendingKey !== key) prepare(source, key);
      else showStatus('loading');
      return;
    }
    if (pendingKey && pendingKey !== key) invalidatePending();
    if (settings.paused) {
      stop();
      showStatus('paused');
      return;
    }
    showStatus('active');
    if (!frame) frame = requestAnimationFrame(animate);
  }

  function updateLayout() {
    bounds = hero.heroLayout?.portrait;
    if (current && bounds) {
      positionCanvas(current.canvas);
      try { current.renderer.resize(bounds.width, bounds.height); }
      catch (error) { fallback(error, current.key); }
    }
    sync();
  }

  function setSettings(patch) {
    const priorSize = settings.particleSize;
    const priorOpacity = settings.particleOpacity;
    for (const [name, [min, max]] of Object.entries(limits)) {
      const value = patch?.[name];
      if (Number.isFinite(value)) settings[name] = clamp(name === 'particleCount' || name === 'lifespan' ? Math.round(value) : value, min, max);
    }
    if (typeof patch?.enabled === 'boolean') {
      if (!settings.enabled && patch.enabled) { failure = null; engineModule = null; }
      settings.enabled = patch.enabled;
    }
    for (const name of ['showImage', 'cursorInteraction', 'paused']) {
      if (typeof patch?.[name] === 'boolean') settings[name] = patch[name];
    }
    if (!settings.cursorInteraction) clearPointer();
    hero.style.setProperty('--hero-three-image-opacity', settings.showImage ? settings.imageOpacity : 0);
    window.dispatchEvent(new CustomEvent('hero-three-particles:settings', { detail: getSettings() }));
    sync();
    if (settings.paused && current && canPresent() &&
        (priorSize !== settings.particleSize || priorOpacity !== settings.particleOpacity)) {
      try { current.renderer.redraw(); }
      catch (error) { fallback(error, current.key); }
    }
    return getSettings();
  }

  function movePointer(event) {
    if (!settings.cursorInteraction || !canAnimate() || event.target?.closest?.('[data-effect-controls]')) return;
    const rect = hero.getBoundingClientRect();
    const x = event.clientX - rect.left - bounds.x;
    const y = event.clientY - rect.top - bounds.y;
    const elapsed = event.timeStamp - pointer.time;
    if (pointer.active && elapsed < 180) {
      const dt = Math.max(8, elapsed) / 1000;
      pointer.vx = .26 * pointer.vx + .74 * clamp((x - pointer.x) / dt, -3200, 3200);
      pointer.vy = .26 * pointer.vy + .74 * clamp((y - pointer.y) / dt, -3200, 3200);
    } else pointer.vx = pointer.vy = 0;
    Object.assign(pointer, { active: true, x, y, time: event.timeStamp });
  }

  window.HeroThreeParticles = Object.freeze({
    getSettings, getState, setSettings, resetSettings: () => setSettings(defaults),
    getLimits: () => Object.fromEntries(Object.entries(limits).map(([name, bounds]) => [name, [...bounds]])),
    setAtTop(value) {
      if (atTop === value) return;
      atTop = value;
      sync();
      notify();
    },
  });

  hero.addEventListener('pointermove', movePointer, { passive: true });
  for (const type of ['pointerleave', 'pointerup', 'pointercancel']) {
    hero.addEventListener(type, clearPointer, { passive: true });
  }
  hero.addEventListener('hero:layout', updateLayout);
  window.addEventListener('site:entered', () => { entered = true; sync(); notify(); }, { once: true });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('blur', clearPointer);
  reduced.addEventListener('change', sync);
  small.addEventListener('change', sync);
  phone.addEventListener('change', updateLayout);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); notify(); }).observe(hero);
  sync();
})();
