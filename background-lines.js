/* Cursor light and short click/tap waves on the existing SVG lines.
   No grid replacement, scroll interception, dependencies or permanent RAF loop. */
(() => {
  'use strict';
  if (window.BackgroundLineEffect) return;
  const hero = document.querySelector('.hero');
  const decoration = document.querySelector('.hero__decoration-scale');
  const backdrop = document.querySelector('.about-backdrop');
  const sourceHero = document.querySelector('[data-layer="scanlines"]');
  const sourceDark = document.querySelector('.about-backdrop__lines');
  const sourceLight = document.querySelector('.about-backdrop__light-lines');
  const works = document.querySelector('.works-viewport');
  if (!hero || !decoration || !backdrop || !sourceHero || !sourceDark || !sourceLight) return;

  const defaults = Object.freeze({ enabled: true, mode: 'distortion', hoverStrength: .35, rippleStrength: .4, radius: 150,
    ambientEnabled: true, ambientDirection: 'up', ambientStrength: .3, ambientSpeed: .35 });
  const publishedDefaults = Object.freeze({ ...defaults, ...window.PublishedEffectPreset?.background });
  const settings = { ...publishedDefaults };
  const storageKey = 'ff.background.lines.settings.v1';
  const maxPixels = 2.8e6, maxRipples = 6, rippleMs = 1150, trailMs = 360;
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  function normalize(patch) {
    const next = {};
    if (!patch || typeof patch !== 'object') return next;
    if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
    if (patch.mode === 'distortion' || patch.mode === 'light') next.mode = patch.mode;
    if (typeof patch.ambientEnabled === 'boolean') next.ambientEnabled = patch.ambientEnabled;
    if (['up', 'down', 'left', 'right'].includes(patch.ambientDirection)) next.ambientDirection = patch.ambientDirection;
    for (const [name, min, max] of [['hoverStrength', 0, 1], ['rippleStrength', 0, 1], ['radius', 60, 320], ['ambientStrength', 0, 1], ['ambientSpeed', .05, 1]]) {
      if (typeof patch[name] === 'number' && Number.isFinite(patch[name])) next[name] = clamp(patch[name], min, max);
    }
    return next;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    // Start the newly requested deformation independently of the discarded
    // light experiment. Preserve preferences once this version has been tuned.
    Object.assign(settings, saved && saved.mode === undefined ? publishedDefaults : normalize(saved));
    if (saved && saved.mode === undefined) localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch { /* Session-only fallback. */ }
  if (window.PublishedEffectPresetNeedsMigration) Object.assign(settings, normalize(window.PublishedEffectPreset?.background));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = [];
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }
  function canvas(parent, kind) {
    const node = document.createElement('canvas');
    node.className = 'background-lines';
    node.dataset.backgroundLines = kind;
    node.setAttribute('aria-hidden', 'true');
    parent.append(node);
    return node;
  }
  function buffer() { return document.createElement('canvas'); }
  const heroCanvas = canvas(decoration, 'hero'), aboutCanvas = canvas(backdrop, 'about');
  const heroContext = heroCanvas.getContext('2d'), aboutContext = aboutCanvas.getContext('2d');
  if (!heroContext || !aboutContext) { heroCanvas.remove(); aboutCanvas.remove(); return; }
  const masks = { hero: buffer(), dark: buffer(), light: buffer(), mixed: buffer() };
  const maskArtwork = {};
  for (const [key, asset] of Object.entries(window.BackgroundLineMasks || {})) {
    const image = new Image();
    maskArtwork[key] = { image, width: asset.width, height: asset.height, failed: false };
    listen(image, 'load', relayout);
    listen(image, 'error', () => { maskArtwork[key].failed = true; relayout(); });
    image.src = asset.src;
  }
  let width = 1, height = 1, ratio = 1, left = 0, top = 0;
  let scene = { x: 0, y: 0, width: 1, height: 1, baseWidth: 1, baseHeight: 1, decorationOpacity: 1, lightProgress: 0 };
  let raf = 0, last = 0, alive = true, visible = true, layoutPending = true;
  let maskReady = { hero: false, dark: false, light: false }, mixedAt = -1;
  let inside = false, pointer = null, spot = null, power = 0, press = null;
  let activeWorks = null;
  let warpReady = Boolean(window.BackgroundLineWarp);
  const ambient = { x: 0, y: 0, time: 0 };
  let lastAmbientPaint = -Infinity;
  const trails = [], ripples = [];
  const interactive = 'button,a,input,select,textarea,summary,[role="button"],[contenteditable="true"],.effect-controls,.hero__welcome,.hero__motion,.works-card';
  const canRun = () => alive && settings.enabled && visible && !document.hidden;

  function clear() {
    heroContext.clearRect(0, 0, heroCanvas.width, heroCanvas.height);
    aboutContext.clearRect(0, 0, aboutCanvas.width, aboutCanvas.height);
  }
  function status(value) {
    for (const node of [heroCanvas, aboutCanvas]) {
      const ready = settings.mode === 'distortion' ? warpReady : node === heroCanvas ? maskReady.hero : maskReady.dark || maskReady.light;
      const keys = node === heroCanvas ? [/scanlines-2k\.svg(?:[?#]|$)/.test(sourceHero.src) ? 'wide' : 'base'] : ['dark', 'light'];
      const unavailable = keys.every(key => !maskArtwork[key] || maskArtwork[key].failed);
      node.dataset.maskReady = String(ready);
      node.dataset.mode = settings.mode;
      node.dataset.state = value === 'off' ? value : !ready ? (settings.mode === 'distortion' || unavailable ? 'unavailable' : 'loading') : value;
      node.dataset.ripples = String(ripples.length);
    }
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; last = 0; inside = false; power = 0; press = null; pointer = null; spot = null;
    trails.length = 0; ripples.length = 0;
    window.BackgroundLineWarp?.reset();
    clear(); status(settings.enabled ? 'idle' : 'off');
  }
  function wake() { if (canRun() && !raf) raf = requestAnimationFrame(frame); }

  function buildMask(source, target, artwork, opacity) {
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, target.width, target.height);
    if (!artwork?.image.complete || !artwork.image.naturalWidth || artwork.failed) return false;
    try {
      const matrix = new DOMMatrix(source.style.transform || undefined);
      ctx.setTransform(ratio * matrix.a, ratio * matrix.b, ratio * matrix.c, ratio * matrix.d, ratio * matrix.e, ratio * matrix.f);
      ctx.globalAlpha = opacity;
      ctx.drawImage(artwork.image, 0, 0, artwork.width, artwork.height);
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // The local JS bundle embeds clean, filterless SVG masks. No external
      // SVG sampling/readback: direct file:// pages work without canvas CORS.
      return true;
    } catch { artwork.failed = true; ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0); return false; }
  }

  function measure() {
    layoutPending = false;
    const rect = hero.getBoundingClientRect();
    width = Math.max(1, hero.heroLayout?.width || rect.width);
    height = Math.max(1, hero.heroLayout?.height || rect.height);
    left = rect.left; top = rect.top;
    updateViewportSurface();
    ratio = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(maxPixels / (width * height)));
    const pixelWidth = settings.mode === 'light' ? Math.max(1, Math.round(width * ratio)) : 1;
    const pixelHeight = settings.mode === 'light' ? Math.max(1, Math.round(height * ratio)) : 1;
    for (const node of [heroCanvas, aboutCanvas, ...Object.values(masks)]) {
      if (node.width !== pixelWidth) node.width = pixelWidth;
      if (node.height !== pixelHeight) node.height = pixelHeight;
    }
    for (const node of [heroCanvas, aboutCanvas]) { node.style.width = `${width}px`; node.style.height = `${height}px`; }
    if (settings.mode === 'light') {
      const heroKey = /scanlines-2k\.svg(?:[?#]|$)/.test(sourceHero.src) ? 'wide' : 'base';
      maskReady = { hero: buildMask(sourceHero, masks.hero, maskArtwork[heroKey], .64),
        dark: buildMask(sourceDark, masks.dark, maskArtwork.dark, .64),
        light: buildMask(sourceLight, masks.light, maskArtwork.light, .54) };
    }
    window.BackgroundLineWarp?.measure();
    mixedAt = -1;
  }

  function mixedMask() {
    const t = clamp(scene.lightProgress);
    if (t === mixedAt) return masks.mixed;
    const ctx = masks.mixed.getContext('2d');
    ctx.clearRect(0, 0, masks.mixed.width, masks.mixed.height);
    // Add weighted alpha, so line phase follows both original backdrop layers
    // continuously throughout the existing dark-to-light transition.
    ctx.globalCompositeOperation = 'lighter';
    if (maskReady.dark) { ctx.globalAlpha = 1 - t; ctx.drawImage(masks.dark, 0, 0); }
    if (maskReady.light) { ctx.globalAlpha = t; ctx.drawImage(masks.light, 0, 0); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; mixedAt = t;
    return masks.mixed;
  }

  function localPoint(point, isHero) {
    const x = point.x - left, y = point.y - top;
    if (!isHero) return { x, y, sx: 1, sy: 1 };
    const sx = Math.max(.001, scene.width / scene.baseWidth), sy = Math.max(.001, scene.height / scene.baseHeight);
    return { x: (x - scene.x) / sx, y: (y - scene.y) / sy, sx, sy };
  }
  function glow(ctx, point, radius, alpha, color, isHero) {
    if (alpha < .0001) return;
    const p = localPoint(point, isHero);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1 / p.sx, 1 / p.sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(.25, `rgba(${color},${alpha * .8})`);
    g.addColorStop(.7, `rgba(${color},${alpha * .18})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(-radius, -radius, radius * 2, radius * 2); ctx.restore();
  }
  function ring(ctx, pulse, age, color, isHero) {
    const t = clamp(age / rippleMs), p = localPoint(pulse, isHero);
    const reach = Math.min(280, Math.max(160, Math.min(width, height) * .36));
    const radius = 6 + reach * (1 - (1 - t) ** 1.25), band = 28;
    const outer = radius + band;
    const alpha = settings.rippleStrength * .65 * (1 - t) ** 1.5;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1 / p.sx, 1 / p.sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, outer);
    g.addColorStop(0, `rgba(${color},0)`);
    g.addColorStop(Math.max(0, (radius - band) / outer), `rgba(${color},0)`);
    g.addColorStop(radius / outer, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(-outer, -outer, outer * 2, outer * 2); ctx.restore();
  }
  function paint(ctx, node, mask, isHero, now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, node.width, node.height);
    if (isHero && (!maskReady.hero || scene.decorationOpacity < .001)) return;
    if (!isHero && !maskReady.dark && !maskReady.light) return;
    const shade = isHero ? 255 : Math.round(255 - 210 * clamp(scene.lightProgress));
    const color = `${shade},${shade},${shade}`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    for (const trace of trails) glow(ctx, trace, settings.radius * .8, settings.hoverStrength * .09 * (1 - (now - trace.time) / trailMs), color, isHero);
    if (spot && power > .001) glow(ctx, spot, settings.radius, settings.hoverStrength * .6 * power, color, isHero);
    for (const pulse of ripples) ring(ctx, pulse, now - pulse.time, color, isHero);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    raf = 0;
    if (!canRun()) { stop(); return; }
    if (layoutPending) measure();
    const dt = last ? Math.min(64, Math.max(0, now - last)) : 16.67;
    last = now;
    const deformation = settings.mode === 'distortion';
    const ambientRunning = deformation && settings.ambientEnabled && settings.ambientStrength > 0 && !reduced.matches;
    if (ambientRunning) {
      const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const direction = directions[settings.ambientDirection];
      ambient.x += direction[0] * settings.ambientSpeed * 60 * dt / 1000;
      ambient.y += direction[1] * settings.ambientSpeed * 60 * dt / 1000;
      ambient.time += dt / 1000;
    }
    for (let i = trails.length - 1; i >= 0; i--) if (now - trails[i].time >= (deformation ? 2150 : trailMs)) trails.splice(i, 1);
    for (let i = ripples.length - 1; i >= 0; i--) if (now - ripples[i].time >= (deformation ? 4000 : rippleMs)) ripples.splice(i, 1);
    const want = inside && settings.hoverStrength > 0 ? 1 : 0;
    power = reduced.matches ? want : power + (want - power) * (1 - Math.exp(-dt / (deformation ? (want ? 180 : 450) : (want ? 95 : 150))));
    if (Math.abs(power - want) < .002) power = want;
    if (pointer && spot) {
      const ease = reduced.matches ? 1 : 1 - Math.exp(-dt / 85);
      spot.x += (pointer.x - spot.x) * ease; spot.y += (pointer.y - spot.y) * ease;
      if (Math.hypot(pointer.x - spot.x, pointer.y - spot.y) < .2) { spot.x = pointer.x; spot.y = pointer.y; }
    }
    if (settings.mode === 'distortion') {
      const surface = activeWorks ? { width: activeWorks.width, height: activeWorks.height, left: activeWorks.left, top: activeWorks.top } : { width, height, left, top };
      // Idle drift is smooth at 30 fps; direct interaction still paints at the
      // display refresh rate. The native scroll and pointer handlers stay light.
      if (!ambientRunning || inside || power > .001 || ripples.length || trails.length || now - lastAmbientPaint >= 32) {
        warpReady = Boolean(window.BackgroundLineWarp?.render({ ...surface, ratio, scene, scope: activeWorks ? 'works' : 'hero',
          spot, power, ripples, trails, ambient, now, settings, reducedMotion: reduced.matches }));
        lastAmbientPaint = now;
      }
    } else {
      paint(heroContext, heroCanvas, masks.hero, true, now);
      paint(aboutContext, aboutCanvas, mixedMask(), false, now);
    }
    status(reduced.matches ? 'reduced' : 'active');
    const moving = pointer && spot && (pointer.x !== spot.x || pointer.y !== spot.y);
    if (!reduced.matches && (ambientRunning || moving || power !== want || trails.length || ripples.length)) wake();
    else { last = 0; status(power ? 'hover' : 'idle'); }
  }

  function backgroundTarget(event) {
    return event.target instanceof Element && (hero.contains(event.target) || works?.contains(event.target)) && !event.target.closest(interactive);
  }
  function inputSurface(event) { activeWorks = works?.contains(event.target) ? works.getBoundingClientRect() : null; }
  function updateViewportSurface() {
    if (!works) return;
    const rect = works.getBoundingClientRect();
    activeWorks = rect.top <= height * .5 && rect.top + rect.height > height * .5 ? rect : null;
  }
  function move(event) {
    if (press && event.pointerId === press.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) press = null;
    if (!canRun() || event.pointerType === 'touch' || !settings.hoverStrength) return;
    if (!backgroundTarget(event)) { leave(); return; }
    inputSurface(event);
    const now = performance.now();
    if (!inside || !spot) { spot = { x: event.clientX, y: event.clientY }; }
    if (!reduced.matches && pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12) {
      trails.push({ ...pointer, time: now }); if (trails.length > 6) trails.shift();
    }
    pointer = { x: event.clientX, y: event.clientY }; inside = true; wake();
  }
  function leave() { inside = false; if (power || trails.length) wake(); }
  function down(event) {
    if (!canRun() || reduced.matches || !settings.rippleStrength || event.isPrimary === false || event.button !== 0 || !backgroundTarget(event)) { press = null; return; }
    inputSurface(event);
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, scroll: window.scrollY, time: performance.now() };
  }
  function up(event) {
    const start = press; press = null;
    if (!start || !canRun() || reduced.matches || event.pointerId !== start.id || !backgroundTarget(event)) return;
    if (performance.now() - start.time > 650 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10 || Math.abs(window.scrollY - start.scroll) > 8) return;
    ripples.push({ x: event.clientX, y: event.clientY, time: performance.now() });
    if (ripples.length > (settings.mode === 'distortion' ? 4 : maxRipples)) ripples.shift();
    wake();
  }
  function relayout() { layoutPending = true; if (settings.enabled) wake(); }
  function updateScene(patch) {
    Object.assign(scene, patch);
    if (power || ripples.length || trails.length) wake();
  }
  function setSettings(patch) {
    const previous = settings.enabled;
    const previousMode = settings.mode;
    Object.assign(settings, normalize(patch));
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Still usable without persistence. */ }
    if (settings.mode !== previousMode) { stop(); layoutPending = true; }
    if (!settings.enabled) stop();
    else { if (!previous) layoutPending = true; wake(); }
    window.dispatchEvent(new CustomEvent('background-lines:settings', { detail: { ...settings } }));
    return { ...settings };
  }
  window.BackgroundLineEffect = Object.freeze({
    getDefaults: () => ({ ...publishedDefaults }), getSettings: () => ({ ...settings }),
    setSettings, resetSettings: () => setSettings(publishedDefaults), updateScene,
    destroy() {
      alive = false; stop(); for (const remove of listeners) remove(); observer?.disconnect();
      window.BackgroundLineWarp?.destroy();
      heroCanvas.remove(); aboutCanvas.remove();
      for (const node of Object.values(masks)) { node.width = 1; node.height = 1; }
      delete window.BackgroundLineEffect;
    }
  });

  // Initial scroll render may precede this deferred script (including history
  // restoration). Read its already-painted scene once, then use explicit data.
  const sceneNode = document.querySelector('.hero__scene');
  if (hero.heroLayout && sceneNode) {
    const transform = new DOMMatrix(sceneNode.style.transform || undefined);
    scene = { ...scene, baseWidth: hero.heroLayout.width, baseHeight: hero.heroLayout.height,
      x: transform.e, y: transform.f, width: parseFloat(sceneNode.style.width) || hero.heroLayout.width,
      height: parseFloat(sceneNode.style.height) || hero.heroLayout.height,
      decorationOpacity: parseFloat(decoration.style.opacity) || (hero.dataset.scrollProgress === '1.0000' ? 0 : 1),
      lightProgress: Number(hero.dataset.lightProgress) || 0 };
  }
  listen(window, 'pointermove', move, { passive: true });
  listen(window, 'pointerdown', down, { passive: true });
  listen(window, 'pointerup', up, { passive: true });
  listen(window, 'pointercancel', () => { press = null; leave(); }, { passive: true });
  listen(window, 'scroll', () => { press = null; if (works) { updateViewportSurface(); wake(); } }, { passive: true });
  listen(document.documentElement, 'pointerleave', leave);
  listen(window, 'blur', stop);
  listen(window, 'focus', wake);
  listen(window, 'pagehide', stop);
  listen(window, 'pageshow', relayout);
  listen(document, 'visibilitychange', () => { if (document.hidden) stop(); else relayout(); });
  listen(reduced, 'change', () => { stop(); wake(); });
  listen(hero, 'hero:layout', relayout);
  for (const source of [sourceHero, sourceDark, sourceLight]) listen(source, 'load', relayout);
  const intersections = new Map();
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) intersections.set(entry.target, entry.isIntersecting);
    updateViewportSurface();
    visible = [...intersections.values()].some(Boolean); if (!visible) stop(); else relayout();
  }) : null;
  observer?.observe(hero);
  if (works) observer?.observe(works);
  if (settings.enabled) wake(); else status('off');
})();
