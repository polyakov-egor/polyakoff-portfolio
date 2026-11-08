/* A small depth-dependent view shift, following the Winline HR portrait approach.
   No ripples or idle motion. Soft directional lighting preserves deep shadows
   and the central face. The supplied WebP keeps its alpha; maps fit in UV space. */
(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  const canvas = document.querySelector('[data-layer="depth"]');
  const portrait = document.querySelector('[data-layer="portrait"]');
  const motionButton = document.querySelector('[data-motion-enable]');
  if (!hero || !canvas || !portrait) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const coarsePointer = matchMedia('(pointer: coarse)');
  const smallPortrait = matchMedia('(max-width: 1099px)');
  const renderSettings = Object.freeze({ horizontal: .006, vertical: .004, depthPower: 1.35, maxDpr: 1.5 });
  const defaults = Object.freeze({ strength: 1.4, smoothingMs: 240, depthAmount: 1, lighting: .2, enabled: true });
  const publishedDefaults = Object.freeze({ ...defaults, ...window.PublishedEffectPreset?.depth });
  const settings = { ...publishedDefaults };
  const storageKey = 'ff.hero.depth.settings.v1';
  const limits = { strength: [0, 3], smoothingMs: [80, 600], depthAmount: [0, 2], lighting: [0, 1] };
  function normalizeSettings(patch) {
    const next = {};
    if (!patch || typeof patch !== 'object') return next;
    for (const [name, [min, max]] of Object.entries(limits)) {
      if (typeof patch[name] === 'number' && Number.isFinite(patch[name])) next[name] = Math.max(min, Math.min(max, patch[name]));
    }
    if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
    return next;
  }
  try { Object.assign(settings, normalizeSettings(JSON.parse(window.localStorage.getItem(storageKey)))); } catch { /* Storage may be unavailable in a private/local preview. */ }
  if (window.PublishedEffectPresetNeedsMigration) Object.assign(settings, normalizeSettings(window.PublishedEffectPreset?.depth));
  const state = { ready: false, visible: true, frame: 0, lastTime: 0, current: [0, 0], target: [0, 0], sensor: false, baseline: null };
  let gl, program, quad, uniforms, images, renderCanvas, output, textures = [], generation = 0;
  let viewportLimit, coverAspect = NaN;
  let loadedTextureKey = '', offlineBundle;
  const texturePairs = new Map();
  // Scroll is a transient presentation state, independent of saved preferences.
  let scrollGate = 1;
  const clamp = value => Math.max(-1, Math.min(1, value));

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = vec2(a_position.x * .5 + .5, .5 - a_position.y * .5);
      gl_Position = vec4(a_position, 0., 1.);
    }
  `;
  const fragmentSource = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_color;
    uniform sampler2D u_depth;
    uniform vec2 u_cover;
    uniform vec2 u_depthFit;
    uniform vec2 u_motion;
    uniform vec2 u_strength;
    uniform float u_depthPower;
    uniform float u_depthAmount;
    uniform float u_lighting;
    uniform vec2 u_depthStep;
    float rawDepth(vec2 uv) {
      vec2 depthUV = (uv - .5) * u_depthFit + .5;
      return texture2D(u_depth, clamp(depthUV, .001, .999)).r;
    }
    float depthAt(vec2 uv) {
      float depth = rawDepth(uv);
      return pow(clamp((depth - .08) / .85, 0., 1.), u_depthPower);
    }
    vec4 relight(vec4 source, vec2 uv) {
      if (u_lighting <= 0. || dot(u_motion, u_motion) < .00000001 || source.a <= .001) return source;
      vec3 straightColor = source.rgb / source.a;
      float luminance = dot(straightColor, vec3(.2126, .7152, .0722));
      // Deep shadows and the central face remain exactly as in the source.
      float faceRadius = length((uv - vec2(.5, .395)) / vec2(.17, .23));
      float faceUnprotected = smoothstep(1., 1.15, faceRadius);
      if (luminance <= .035 || faceUnprotected <= 0.) return source;
      float brightMask = smoothstep(.035, .14, luminance);
      float dx = (rawDepth(uv + vec2(u_depthStep.x, 0.)) - rawDepth(uv - vec2(u_depthStep.x, 0.))) / (2. * u_depthStep.x);
      float dy = (rawDepth(uv + vec2(0., u_depthStep.y)) - rawDepth(uv - vec2(0., u_depthStep.y))) / (2. * u_depthStep.y);
      vec2 slope = clamp(vec2(dx, dy) * .055, vec2(-.8), vec2(.8));
      vec3 normal = normalize(vec3(-slope, 1.));
      float normalDelta = dot(normal.xy, vec2(u_motion.x, u_motion.y * .45));
      float sideTerm = (uv.x - .5) * 2. * u_motion.x + (uv.y - .4) * .45 * u_motion.y;
      float signal = clamp(normalDelta * 1.4 + sideTerm * .6, -1., 1.);
      // Multiplicative only: never add ambient light into black/shadow pixels.
      float gain = 1. + signal * u_lighting * .15 * brightMask * faceUnprotected;
      source.rgb = min(source.rgb * gain, vec3(source.a));
      return source;
    }
    void main() {
      vec2 baseUV = (v_uv - .5) * u_cover + .5;
      vec2 uv = baseUV;
      // Inverse sampling prevents holes as near and far areas shift differently.
      for (int i = 0; i < 3; i++) {
        uv = baseUV - u_motion * u_strength * (.12 + depthAt(uv) * u_depthAmount);
      }
      gl_FragColor = relight(texture2D(u_color, clamp(uv, .001, .999)), uv);
    }
  `;

  function setFallback(reason) {
    generation++;
    state.ready = false;
    cancelAnimationFrame(state.frame);
    state.frame = 0;
    hero.classList.remove('has-depth-effect');
    canvas.dataset.state = reason;
    motionButton.hidden = true;
    releaseGpu();
  }

  function releaseGpu() {
    if (gl && !gl.isContextLost()) {
      textures.forEach(texture => gl.deleteTexture(texture));
      if (quad) gl.deleteBuffer(quad);
      if (program) gl.deleteProgram(program);
    }
    textures = [];
    quad = program = uniforms = null;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (![image.naturalWidth, image.naturalHeight].every(value => Number.isFinite(value) && value > 0)) {
          reject(new Error('Portrait texture has invalid dimensions'));
        } else resolve(image);
      };
      image.onerror = () => reject(new Error('Portrait texture did not load'));
      image.src = source;
    });
  }

  function textureProfile() {
    const small = smallPortrait.matches;
    // Match <picture>'s media directly: currentSrc can still point at the old
    // resource during its media-change event. Explicit paired URLs avoid a
    // small color image ever being combined with the large depth texture.
    const color = (small ? portrait.dataset.colorSmall : portrait.dataset.colorLarge) || portrait.currentSrc || portrait.src;
    const depth = (small ? portrait.dataset.depthSmall : portrait.dataset.depthLarge) || `./assets/images/hero/depth-${small ? 1280 : 2456}.webp`;
    return {small, color, depth, key: JSON.stringify([small, color, depth])};
  }

  async function textureSources(profile) {
    if (location.protocol !== 'file:') return [profile.color, profile.depth];
    // WebGL cannot use ordinary file:// images as textures. A local classic
    // script supplies the same responsive WebP bytes as origin-clean URLs.
    if (!window.HERO_TEXTURES && !window.HeroDepthTextures) {
      offlineBundle ||= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = './assets/images/hero-textures.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      }).catch(error => {
        offlineBundle = null;
        throw error;
      });
      await offlineBundle;
    }
    const bundle = window.HERO_TEXTURES || window.HeroDepthTextures;
    const sources = profile.small ? [bundle?.colorSmall, bundle?.depthSmall] : [bundle?.color, bundle?.depth];
    if (sources.some(source => typeof source !== 'string' || !source)) throw new Error('Responsive portrait texture pair is unavailable');
    return sources;
  }

  function loadTexturePair(profile) {
    if (!texturePairs.has(profile.key)) {
      const pending = textureSources(profile).then(sources => Promise.all(sources.map(loadImage)));
      texturePairs.set(profile.key, pending);
      pending.catch(() => {
        if (texturePairs.get(profile.key) === pending) texturePairs.delete(profile.key);
      });
    }
    return texturePairs.get(profile.key);
  }

  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(result);
      gl.deleteShader(result);
      throw new Error(message);
    }
    return result;
  }

  function upload(image, unit) {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
  }

  function initGpu() {
    releaseGpu();
    // Keep the WebGL drawing surface out of the page's compositing tree. A
    // preserved WebGL layer beneath the welcome card's backdrop filter can
    // expose stale transparent GPU tiles while the portrait is moving. Copy
    // each complete frame to the ordinary retained 2D canvas in the same task:
    // the depth shader and its motion stay unchanged, with no idle redraw loop.
    output ||= canvas.getContext('2d', { alpha: true });
    if (!output) return setFallback('unsupported');
    if (!renderCanvas) {
      renderCanvas = document.createElement('canvas');
      renderCanvas.addEventListener('webglcontextlost', event => { event.preventDefault(); setFallback('context-lost'); });
      renderCanvas.addEventListener('webglcontextrestored', start);
    }
    gl = renderCanvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) return setFallback('unsupported');
    viewportLimit = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    coverAspect = NaN;
    const vertex = shader(gl.VERTEX_SHADER, vertexSource);
    const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    uniforms = Object.fromEntries(['color', 'depth', 'cover', 'depthFit', 'motion', 'strength', 'depthPower', 'depthAmount', 'lighting', 'depthStep'].map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
    images.forEach((image, unit) => textures.push(upload(image, unit)));
    gl.uniform1i(uniforms.color, 0);
    gl.uniform1i(uniforms.depth, 1);
    applyUniformSettings();
    const colorAspect = images[0].naturalWidth / images[0].naturalHeight;
    const depthAspect = images[1].naturalWidth / images[1].naturalHeight;
    gl.uniform2f(uniforms.depthFit, Math.min(1, colorAspect / depthAspect), Math.min(1, depthAspect / colorAspect));
    gl.uniform2f(uniforms.depthStep, 3 / images[0].naturalWidth, 3 / images[0].naturalHeight);
    state.ready = true;
    state.current = [0, 0];
    state.target = [0, 0];
    state.lastTime = 0;
    state.baseline = null;
    if (scrollGate > 0) resize();
    else pauseForScroll();
    updateMotionButton();
  }

  function resize() {
    if (!state.ready || reducedMotion.matches || !settings.enabled || scrollGate <= 0) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const maxSize = viewportLimit;
    const dpr = Math.min(devicePixelRatio || 1, renderSettings.maxDpr, Math.sqrt(6e6 / (rect.width * rect.height)), maxSize[0] / rect.width, maxSize[1] / rect.height);
    // CSS still follows every scroll frame exactly. Round the backing surface
    // upward instead of clearing/reallocating both canvases for every CSS pixel.
    const bucket = coarsePointer.matches ? 64 : 128;
    const desiredWidth = Math.max(1, Math.round(rect.width * dpr));
    const desiredHeight = Math.max(1, Math.round(rect.height * dpr));
    let width = Math.min(maxSize[0], Math.ceil(desiredWidth / bucket) * bucket);
    let height = Math.min(maxSize[1], Math.ceil(desiredHeight / bucket) * bucket);
    if (width * height > 6e6) {
      // At the existing pixel ceiling, keep the old exact resolution rather
      // than reducing either axis to make an oversized bucket fit the budget.
      width = desiredWidth;
      height = desiredHeight;
    }
    const resized = canvas.width !== width || canvas.height !== height || renderCanvas.width !== width || renderCanvas.height !== height;
    const viewAspect = rect.width / rect.height;
    const coverChanged = !Number.isFinite(coverAspect) || Math.abs(viewAspect - coverAspect) > .000001;
    const needsPresentation = resized || canvas.dataset.state !== 'ready';
    if (!needsPresentation && !coverChanged) return;
    if (resized) {
      // Width/height writes clear WebGL's drawing buffer. Keep the neutral PNG
      // visible until its replacement is painted in this same observer turn.
      hero.classList.remove('has-depth-effect');
      canvas.dataset.state = 'resizing';
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      if (renderCanvas.width !== width) renderCanvas.width = width;
      if (renderCanvas.height !== height) renderCanvas.height = height;
    }
    try {
      if (resized) gl.viewport(0, 0, width, height);
      if (coverChanged) {
        const imageAspect = images[0].naturalWidth / images[0].naturalHeight;
        gl.uniform2f(uniforms.cover, Math.min(1, viewAspect / imageAspect), Math.min(1, imageAspect / viewAspect));
        coverAspect = viewAspect;
      }
      // ResizeObserver runs before paint, after animation-frame callbacks. A RAF
      // here would leave the cleared buffer visible for the intervening frame.
      if (needsPresentation && !paint(true)) return;
    } catch {
      setFallback('unavailable');
      return;
    }
    if (!needsPresentation || state.current.some((value, axis) => Math.abs(state.target[axis] - value) >= .0001)) schedule();
    else {
      // A scroll gate may already have queued this same settled pose. The
      // synchronous resize paint just presented it, so no second copy is needed.
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      state.lastTime = 0;
    }
  }

  function schedule() {
    if (!state.ready || !settings.enabled || scrollGate <= 0 || !state.visible || document.hidden || reducedMotion.matches || state.frame) return;
    state.frame = requestAnimationFrame(render);
  }

  function render(now) {
    state.frame = 0;
    if (!state.ready || !settings.enabled || scrollGate <= 0 || !state.visible || document.hidden || reducedMotion.matches) return;
    const delta = state.lastTime ? Math.min(64, now - state.lastTime) : 16.67;
    state.lastTime = now;
    const easing = 1 - Math.exp(-delta / settings.smoothingMs);
    let unsettled = false;
    for (let axis = 0; axis < 2; axis++) {
      state.current[axis] += (state.target[axis] - state.current[axis]) * easing;
      if (Math.abs(state.target[axis] - state.current[axis]) < .0001) state.current[axis] = state.target[axis];
      else unsettled = true;
    }
    if (!paint()) return;
    if (unsettled) schedule();
    else state.lastTime = 0;
  }

  function paint(checkError = false) {
    if (!state.ready || !settings.enabled || scrollGate <= 0 || !state.visible || document.hidden || reducedMotion.matches) return false;
    const motionX = state.current[0] * scrollGate;
    const motionY = state.current[1] * scrollGate;
    try {
      gl.uniform2f(uniforms.motion, motionX, motionY);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      // A per-frame getError synchronizes the GPU and JS. Validate allocations
      // here; context-loss events and copy exceptions handle runtime failures.
      if (checkError && gl.getError() !== gl.NO_ERROR) {
        setFallback('unavailable');
        return false;
      }
      // `copy` replaces transparent pixels too, without exposing a separate
      // clear of the visible canvas or leaving trails from the previous pose.
      output.globalCompositeOperation = 'copy';
      output.drawImage(renderCanvas, 0, 0);
      output.globalCompositeOperation = 'source-over';
    } catch {
      setFallback('unavailable');
      return false;
    }
    if (canvas.dataset.state !== 'ready') {
      canvas.dataset.state = 'ready';
      canvas.dataset.renderer = 'webgl-bitmap';
      hero.classList.add('has-depth-effect');
    }
    canvas.dataset.motionX = motionX.toFixed(4);
    canvas.dataset.motionY = motionY.toFixed(4);
    return true;
  }

  function reset() {
    state.target[0] = state.target[1] = 0;
    state.baseline = null;
    schedule();
  }

  function pauseForScroll() {
    cancelAnimationFrame(state.frame);
    state.frame = 0;
    state.current = [0, 0];
    state.target = [0, 0];
    state.baseline = null;
    state.lastTime = 0;
    hero.classList.remove('has-depth-effect');
    motionButton.hidden = true;
    canvas.dataset.motionX = canvas.dataset.motionY = '0.0000';
    if (state.ready || !canvas.dataset.state) canvas.dataset.state = 'scroll-paused';
    if (state.ready) gl.uniform2f(uniforms.motion, 0, 0);
  }

  function setScrollGate(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return scrollGate;
    const next = Math.max(0, Math.min(1, value));
    if (next === scrollGate) return scrollGate;
    const previous = scrollGate;
    scrollGate = next;
    canvas.dataset.scrollGate = next.toFixed(4);
    if (next === 0) pauseForScroll();
    else {
      // A hidden/shrunken canvas may have changed size during the pause.
      if (previous === 0 && state.ready) resize();
      else schedule();
      updateMotionButton();
    }
    return scrollGate;
  }

  hero.addEventListener('pointermove', event => {
    if (!settings.enabled || scrollGate <= 0 || !finePointer.matches || event.pointerType === 'touch' || event.target?.closest?.('[data-effect-controls]')) return;
    const rect = hero.getBoundingClientRect();
    state.target[0] = clamp((event.clientX - rect.left) / rect.width * 2 - 1);
    state.target[1] = clamp((event.clientY - rect.top) / rect.height * 2 - 1);
    schedule();
  }, { passive: true });
  hero.addEventListener('pointerleave', event => {
    // Keep the last pose while tuning, so strength changes remain visible.
    if (!event.relatedTarget?.closest?.('[data-effect-controls]')) reset();
  });
  window.addEventListener('blur', reset);

  function onOrientation(event) {
    if (!settings.enabled || scrollGate <= 0 || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma) || !state.visible || document.hidden || reducedMotion.matches) return;
    if (!state.baseline) state.baseline = { beta: event.beta, gamma: event.gamma };
    const difference = (angle, center) => ((angle - center + 540) % 360) - 180;
    const x = difference(event.gamma, state.baseline.gamma) / 10;
    const y = difference(event.beta, state.baseline.beta) / 10;
    const angle = (screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI / 180;
    const quiet = value => Math.abs(value) < .035 ? 0 : value;
    const nextX = clamp(quiet(x * Math.cos(angle) + y * Math.sin(angle)));
    const nextY = clamp(quiet(y * Math.cos(angle) - x * Math.sin(angle)));
    canvas.dataset.input = 'orientation';
    if (Math.abs(nextX - state.target[0]) < .002 && Math.abs(nextY - state.target[1]) < .002) return;
    state.target[0] = nextX;
    state.target[1] = nextY;
    schedule();
  }

  function listenToSensor() {
    if (state.sensor) return;
    state.sensor = true;
    window.addEventListener('deviceorientation', onOrientation, { passive: true });
    motionButton.hidden = true;
    motionButton.setAttribute('aria-pressed', 'true');
  }

  function updateMotionButton() {
    const available = state.ready && settings.enabled && scrollGate > 0 && !reducedMotion.matches && coarsePointer.matches && window.isSecureContext && typeof DeviceOrientationEvent !== 'undefined';
    const needsPermission = available && typeof DeviceOrientationEvent.requestPermission === 'function';
    motionButton.hidden = !needsPermission || state.sensor;
    if (available && !needsPermission) listenToSensor();
  }

  motionButton.addEventListener('click', async () => {
    if (!settings.enabled || scrollGate <= 0 || !state.ready || reducedMotion.matches) return;
    try {
      // This call stays directly in the click handler: iOS requires activation.
      const permission = typeof DeviceOrientationEvent.requestPermission === 'function'
        ? await DeviceOrientationEvent.requestPermission() : 'granted';
      if (permission === 'granted') listenToSensor();
      else motionButton.setAttribute('aria-label', 'Device tilt access was not granted. Try again to enable motion.');
    } catch {
      motionButton.setAttribute('aria-label', 'Device tilt is unavailable. Try again to enable motion.');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(state.frame); state.frame = 0; }
    else { state.lastTime = 0; reset(); resize(); }
  });
  window.addEventListener('orientationchange', reset);
  screen.orientation?.addEventListener('change', reset);
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    state.visible = entry.isIntersecting;
    if (!state.visible) { cancelAnimationFrame(state.frame); state.frame = 0; reset(); }
    else { state.lastTime = 0; resize(); }
  }).observe(hero);

  async function start() {
    const run = ++generation;
    if (reducedMotion.matches) return setFallback('reduced-motion');
    if (!settings.enabled) return setFallback('disabled');
    const profile = textureProfile();
    if (state.ready && loadedTextureKey === profile.key) return;
    state.ready = false;
    cancelAnimationFrame(state.frame);
    state.frame = 0;
    hero.classList.remove('has-depth-effect');
    canvas.dataset.state = 'loading';
    motionButton.hidden = true;
    try {
      const pair = await loadTexturePair(profile);
      if (run !== generation || profile.key !== textureProfile().key || reducedMotion.matches || !settings.enabled) return;
      images = pair;
      loadedTextureKey = profile.key;
      initGpu();
    } catch {
      if (run === generation) setFallback('unavailable');
    }
  }
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) setFallback('reduced-motion');
    else start();
  });
  finePointer.addEventListener('change', reset);
  coarsePointer.addEventListener('change', updateMotionButton);
  smallPortrait.addEventListener('change', () => { start(); });

  function applyUniformSettings() {
    gl.uniform2f(uniforms.strength, renderSettings.horizontal * settings.strength, renderSettings.vertical * settings.strength);
    gl.uniform1f(uniforms.depthPower, renderSettings.depthPower);
    gl.uniform1f(uniforms.depthAmount, settings.depthAmount);
    gl.uniform1f(uniforms.lighting, settings.lighting);
  }

  function setSettings(patch) {
    const next = normalizeSettings(patch);
    const wasEnabled = settings.enabled;
    Object.assign(settings, next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Keep working in memory if storage is blocked. */ }
    if (!settings.enabled) setFallback('disabled');
    else if (!wasEnabled) start();
    else if (state.ready) { applyUniformSettings(); schedule(); }
    window.dispatchEvent(new CustomEvent('hero-depth:settings', { detail: { ...settings } }));
    return { ...settings };
  }
  window.HeroDepthEffect = Object.freeze({
    getDefaults: () => ({ ...publishedDefaults }),
    getSettings: () => ({ ...settings }),
    setSettings,
    resetSettings: () => setSettings(publishedDefaults),
    getScrollGate: () => scrollGate,
    setScrollGate,
  });
  start();
})();
