/* Original GPU particle portrait: transform-feedback motion, retained bitmap. */
(() => {
  'use strict';
  if (window.HeroParticles) return;
  const hero = document.querySelector('.hero');
  const portrait = hero?.querySelector('[data-layer="portrait"]');
  const host = hero?.querySelector('.hero__portrait-breath');
  if (!hero || !portrait || !host) return;

  // The preset backdrop describes the existing dark Hero. Keep this portrait
  // surface transparent so the surname remains visible behind the cutout.
  const common = { noiseScale: .006, noiseStrength: .04, damping: .957, lifespan: 980,
    backgroundColor: '#000000', cursorStrength: .32, cursorRadius: 30, imageOpacity: 1,
    showImage: true, cursorInteraction: true, paused: false, enabled: true };
  const presets = {
    1: { ...common, particleCount: 350000, particleSize: 5.1, particleOpacity: .75, speed: 1.7 },
    2: { ...common, particleCount: 210000, particleSize: 1.9, particleOpacity: .90, speed: 1.8,
      noiseStrength: .03, damping: .873, cursorStrength: .29, cursorRadius: 40 },
  };
  const settings = { ...presets[1] };
  const ranges = { particleCount: [1000, 500000], particleSize: [.1, 16], particleOpacity: [0, 1],
    speed: [0, 5], noiseScale: [.0001, .1], noiseStrength: [0, 1], damping: [.5, .9999],
    lifespan: [100, 10000], cursorStrength: [0, 3], cursorRadius: [1, 300], imageOpacity: [0, 1] };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 1099px)');
  const controller = new AbortController();
  const signal = controller.signal;
  const canvas = document.createElement('canvas');
  canvas.className = 'scene-layer scene-layer--particles';
  canvas.dataset.layer = 'particles';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', pointerEvents: 'auto', touchAction: 'pan-y' });
  host.append(canvas);
  const privateCanvas = document.createElement('canvas');
  const output = canvas.getContext('2d', { alpha: true });
  const images = new Map();
  let preset = 1, requestedActive = !window.SitePreloader?.isBlocking?.(), visible = true;
  let destroyed = false, loading = false, frame = 0, lastTime = 0, generation = 0;
  let gl, updateProgram, pointProgram, feedback, texture, anchorBuffer, buffers = [], vaos = [];
  let updateUniforms, pointUniforms, currentBuffer = 0, count = 0, sourceImage, sourceKey = '';
  let bounds, heroRect = { left: 0, top: 0 }, elapsed = 0;
  const pointer = { inside: false, x: 0, y: 0, vx: 0, vy: 0, time: 0 };
  const state = { status: 'waiting', ready: false, presented: false, error: null, frames: 0,
    renderer: 'webgl2-transform-feedback-bitmap', profile: null, limits: null };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const eligible = () => !destroyed && requestedActive && visible && !document.hidden &&
    !reduced.matches && settings.enabled && !settings.paused && !window.SitePreloader?.isBlocking?.();
  const snapshot = () => ({ ...state, error: state.error && { ...state.error },
    limits: state.limits && { ...state.limits }, active: eligible(), requestedActive, preset, count,
    requestedCount: settings.particleCount });
  function notify() {
    canvas.dataset.state = state.status;
    canvas.dataset.particleCount = String(count);
    window.dispatchEvent(new CustomEvent('hero-particles:state', { detail: snapshot() }));
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; lastTime = 0; pointer.inside = false; }
  function fallback(code, message) {
    stop(); state.ready = false; state.presented = false;
    state.status = code; state.error = message ? { code, message } : null;
    hero.classList.remove('has-particle-effect'); notify();
  }
  function release() {
    if (gl && !gl.isContextLost()) {
      for (const vao of vaos) gl.deleteVertexArray(vao);
      for (const buffer of buffers) gl.deleteBuffer(buffer);
      if (anchorBuffer) gl.deleteBuffer(anchorBuffer);
      if (texture) gl.deleteTexture(texture);
      if (feedback) gl.deleteTransformFeedback(feedback);
      if (updateProgram) gl.deleteProgram(updateProgram);
      if (pointProgram) gl.deleteProgram(pointProgram);
    }
    buffers = []; vaos = []; anchorBuffer = texture = feedback = updateProgram = pointProgram = null;
    count = 0;
  }
  function profile() {
    const url = (small.matches ? portrait.dataset.colorSmall : portrait.dataset.colorLarge) || portrait.currentSrc || portrait.src;
    return { url, small: small.matches, key: `${small.matches ? 'small' : 'large'}:${url}` };
  }
  async function imageSource(next) {
    if (location.protocol !== 'file:') return next.url;
    if (!window.HERO_TEXTURES && !window.HeroDepthTextures) {
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[src*="hero-textures.js"]');
        const script = existing || document.createElement('script');
        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', () => reject(new Error('Offline portrait bundle failed')), { once: true });
        if (!existing) { script.src = './assets/images/hero-textures.js'; document.head.append(script); }
      });
    }
    const bundle = window.HERO_TEXTURES || window.HeroDepthTextures;
    const source = next.small ? bundle?.colorSmall : bundle?.color;
    if (!source) throw new Error('Offline responsive portrait is unavailable');
    return source;
  }
  function loadImage(next) {
    if (!images.has(next.key)) {
      const pending = imageSource(next).then(src => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error('Empty portrait'));
        image.onerror = () => reject(new Error('Portrait image failed to load'));
        image.src = src;
      }));
      images.set(next.key, pending);
      pending.catch(() => { if (images.get(next.key) === pending) images.delete(next.key); });
    }
    return images.get(next.key);
  }

  const updateVertex = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 position;
    layout(location=1) in vec2 velocity;
    layout(location=2) in float age;
    layout(location=3) in vec2 anchor;
    uniform vec2 size, cursor, cursorVelocity;
    uniform float dt, time, noiseScale, noiseStrength, speed, damping, lifespan, radius, cursorStrength;
    uniform bool cursorActive;
    out vec2 nextPosition;
    out vec2 nextVelocity;
    out float nextAge;
    void main() {
      vec2 pixel = position * size;
      vec2 q = pixel * noiseScale;
      float t = time * .32;
      // A curl of two smooth periodic potentials; no per-frame CPU particles.
      vec2 curl = vec2(.8*sin(q.x+t)*cos(q.y*.8-t), -cos(q.x+t)*sin(q.y*.8-t));
      curl += .45 * vec2(-.47,-.63) * cos(q.x*.63-q.y*.47+t);
      vec2 force = curl * noiseStrength * speed * 1200. + (anchor-position) * size * 7.;
      if (cursorActive) {
        vec2 away = pixel-cursor;
        float distance = length(away);
        float influence = pow(max(0., 1.-distance/radius), 2.);
        force += (away/max(1.,distance)*2200. + cursorVelocity*.5) * influence * cursorStrength;
      }
      nextVelocity = (velocity + force*dt) * pow(damping, dt*60.);
      nextPosition = position + nextVelocity*dt/size;
      nextAge = age + dt*1000.;
      if (nextAge >= lifespan || any(lessThan(nextPosition,vec2(-.05))) || any(greaterThan(nextPosition,vec2(1.05)))) {
        nextPosition = anchor; nextVelocity = vec2(0); nextAge = mod(nextAge,lifespan);
      }
    }`;
  const emptyFragment = `#version 300 es
    precision highp float; out vec4 color; void main(){ color=vec4(0); }`;
  const pointVertex = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 position;
    layout(location=3) in vec2 anchor;
    uniform float pointSize;
    out vec2 uv;
    void main(){ uv=anchor; gl_Position=vec4(position.x*2.-1.,1.-position.y*2.,0,1); gl_PointSize=pointSize; }`;
  const pointFragment = `#version 300 es
    precision highp float;
    uniform sampler2D image;
    uniform float opacity;
    uniform vec2 cover;
    in vec2 uv; out vec4 color;
    void main(){
      float edge=1.-smoothstep(.70,1.,length(gl_PointCoord-.5)*2.);
      vec4 sampleColor=texture(image,(uv-.5)*cover+.5);
      float alpha=sampleColor.a*opacity*edge;
      color=vec4(sampleColor.rgb*alpha,alpha);
    }`;
  function program(vertexSource, fragmentSource, varyings) {
    const result = gl.createProgram();
    for (const [kind, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
      const shader = gl.createShader(kind); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); gl.deleteProgram(result); throw new Error(message || 'Particle shader failed');
      }
      gl.attachShader(result, shader); gl.deleteShader(shader);
    }
    if (varyings) gl.transformFeedbackVaryings(result, varyings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(result); gl.deleteProgram(result); throw new Error(message || 'Particle program failed');
    }
    return result;
  }
  function imageCover(image) {
    const imageAspect = image.naturalWidth/image.naturalHeight, viewAspect = bounds.width/bounds.height;
    const x = Math.min(1, viewAspect/imageAspect), y = Math.min(1, imageAspect/viewAspect);
    return { x, y, left: image.naturalWidth*(1-x)/2, top: image.naturalHeight*(1-y)/2,
      width: image.naturalWidth*x, height: image.naturalHeight*y };
  }
  function seed(image) {
    const mask = document.createElement('canvas');
    mask.width = Math.min(512, image.naturalWidth); mask.height = Math.round(mask.width * bounds.height/bounds.width);
    const context = mask.getContext('2d', { willReadFrequently: true });
    const cover = imageCover(image);
    context.drawImage(image, cover.left, cover.top, cover.width, cover.height, 0, 0, mask.width, mask.height);
    const rgba = context.getImageData(0, 0, mask.width, mask.height).data;
    const opaque = [];
    for (let i = 0; i < mask.width * mask.height; i++) if (rgba[i*4+3] >= 8) opaque.push(i);
    if (!opaque.length) throw new Error('Portrait has no nontransparent pixels');
    const anchors = new Float32Array(settings.particleCount * 2);
    const motion = new Float32Array(settings.particleCount * 5);
    let randomState = 0x9e3779b9;
    const random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; };
    for (let i = 0; i < settings.particleCount; i++) {
      const pixel = opaque[Math.floor(random() * opaque.length)];
      const x = (pixel % mask.width + random()) / mask.width, y = (Math.floor(pixel / mask.width) + random()) / mask.height;
      anchors[i*2] = motion[i*5] = x; anchors[i*2+1] = motion[i*5+1] = y;
      motion[i*5+4] = random() * settings.lifespan;
    }
    return { anchors, motion };
  }
  function initialize(image) {
    gl ||= privateCanvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is unavailable');
    release();
    const pointRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    state.limits = { maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxPointSize: pointRange[1],
      maxFeedbackComponents: gl.getParameter(gl.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS) };
    if (image.naturalWidth > state.limits.maxTextureSize || image.naturalHeight > state.limits.maxTextureSize) throw new Error('Portrait exceeds the GPU texture limit');
    updateProgram = program(updateVertex, emptyFragment, ['nextPosition','nextVelocity','nextAge']);
    pointProgram = program(pointVertex, pointFragment);
    const locations = (owner, names) => Object.fromEntries(names.split(' ').map(name => [name, gl.getUniformLocation(owner, name)]));
    updateUniforms = locations(updateProgram, 'size cursor cursorVelocity dt time noiseScale noiseStrength speed damping lifespan radius cursorStrength cursorActive');
    pointUniforms = locations(pointProgram, 'pointSize image opacity cover');
    const initial = seed(image);
    anchorBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, anchorBuffer); gl.bufferData(gl.ARRAY_BUFFER, initial.anchors, gl.STATIC_DRAW);
    for (let i = 0; i < 2; i++) {
      const buffer = gl.createBuffer(); buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, initial.motion, gl.DYNAMIC_COPY);
      const vao = gl.createVertexArray(); vaos.push(vao); gl.bindVertexArray(vao);
      for (const [attribute, components, offset] of [[0,2,0],[1,2,8],[2,1,16]]) {
        gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, components, gl.FLOAT, false, 20, offset);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, anchorBuffer); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 8, 0);
    }
    feedback = gl.createTransformFeedback();
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    count = settings.particleCount; currentBuffer = 0; elapsed = 0; sourceImage = image;
    const allocationError = gl.getError();
    if (allocationError !== gl.NO_ERROR) throw new Error(`GPU particle allocation failed (WebGL 0x${allocationError.toString(16)})`);
  }
  function present(dt) {
    if (!bounds || !sourceImage || !output || !count) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(6000000 / (bounds.width * bounds.height)));
    const width = Math.max(1, Math.round(bounds.width*dpr)), height = Math.max(1, Math.round(bounds.height*dpr));
    if (privateCanvas.width !== width || privateCanvas.height !== height) {
      privateCanvas.width = width; privateCanvas.height = height; gl.viewport(0, 0, width, height);
    }
    gl.useProgram(updateProgram); gl.bindVertexArray(vaos[currentBuffer]);
    const u = updateUniforms;
    gl.uniform2f(u.size, bounds.width, bounds.height); gl.uniform2f(u.cursor, pointer.x, pointer.y); gl.uniform2f(u.cursorVelocity, pointer.vx, pointer.vy);
    for (const [key, value] of Object.entries({ dt, time: elapsed, noiseScale: settings.noiseScale, noiseStrength: settings.noiseStrength,
      speed: settings.speed, damping: settings.damping, lifespan: settings.lifespan, radius: settings.cursorRadius, cursorStrength: settings.cursorStrength })) gl.uniform1f(u[key], value);
    gl.uniform1i(u.cursorActive, pointer.inside && settings.cursorInteraction ? 1 : 0);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffers[1-currentBuffer]);
    gl.enable(gl.RASTERIZER_DISCARD); gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, count); gl.endTransformFeedback(); gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    currentBuffer = 1-currentBuffer;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(pointProgram); gl.bindVertexArray(vaos[currentBuffer]); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(pointUniforms.image, 0); gl.uniform1f(pointUniforms.opacity, settings.particleOpacity);
    const cover = imageCover(sourceImage);
    gl.uniform2f(pointUniforms.cover, cover.x, cover.y);
    gl.uniform1f(pointUniforms.pointSize, Math.min(settings.particleSize*dpr, state.limits.maxPointSize));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.drawArrays(gl.POINTS, 0, count); gl.disable(gl.BLEND);
    if (!state.ready) {
      const drawError = gl.getError();
      if (drawError !== gl.NO_ERROR) throw new Error(`The first GPU particle frame failed (WebGL 0x${drawError.toString(16)})`);
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    output.globalAlpha = 1; output.clearRect(0, 0, width, height);
    if (settings.showImage && settings.imageOpacity > 0) {
      output.globalAlpha = settings.imageOpacity;
      output.drawImage(sourceImage, cover.left, cover.top, cover.width, cover.height, 0, 0, width, height);
    }
    output.globalAlpha = 1; output.drawImage(privateCanvas, 0, 0);
    state.frames++;
    if (!state.presented || !state.ready) {
      state.presented = state.ready = true; state.status = 'ready'; state.error = null;
      hero.classList.add('has-particle-effect'); notify();
    }
  }
  function tick(now) {
    frame = 0;
    if (!eligible() || !state.ready) return;
    const dt = lastTime ? Math.min(.04, Math.max(0, now-lastTime)/1000) : 0;
    lastTime = now; elapsed += dt;
    pointer.vx *= Math.exp(-dt*12); pointer.vy *= Math.exp(-dt*12);
    try { present(dt); } catch (error) { fallback('error', error.message); return; }
    frame = requestAnimationFrame(tick);
  }
  async function start() {
    if (loading || !eligible() || !bounds) return;
    if (state.ready && sourceKey === profile().key && count === settings.particleCount) {
      state.status = 'ready'; notify(); if (!frame) frame = requestAnimationFrame(tick); return;
    }
    const run = ++generation, next = profile(); loading = true; state.status = 'loading'; state.error = null; notify();
    try {
      const image = await loadImage(next);
      if (destroyed || run !== generation) return;
      loading = false;
      if (!eligible() || next.key !== profile().key) { sync(); return; }
      if (!output) throw new Error('The retained particle canvas is unavailable');
      initialize(image); sourceKey = next.key; state.profile = next.small ? 'small' : 'large'; state.ready = false;
      present(0); lastTime = 0;
      if (eligible() && !frame) frame = requestAnimationFrame(tick);
    } catch (error) { if (run === generation) { loading = false; release(); fallback('unsupported', error.message); } }
  }
  function sync() {
    if (destroyed) return;
    if (reduced.matches || !settings.enabled) { generation++; loading = false; fallback(reduced.matches ? 'reduced-motion' : 'disabled'); return; }
    if (!eligible()) { stop(); state.status = state.ready ? 'paused' : 'waiting'; notify(); return; }
    start();
  }
  function layout() {
    const next = hero.heroLayout?.portrait;
    if (!next || next.width <= 0 || next.height <= 0) return;
    const cropChanged = bounds && Math.abs(bounds.width/bounds.height-next.width/next.height) > .0001;
    bounds = { ...next }; heroRect = hero.getBoundingClientRect();
    canvas.style.width = `${bounds.width}px`; canvas.style.height = `${bounds.height}px`;
    canvas.style.transform = `translate3d(${bounds.x}px,${bounds.y}px,0)`;
    if (cropChanged) { stop(); generation++; loading = false; state.ready = false; }
    sync();
  }
  function setSettings(patch) {
    if (!patch || typeof patch !== 'object' || destroyed) return { ...settings, preset };
    const oldCount = settings.particleCount;
    for (const [key, [min, max]] of Object.entries(ranges)) {
      if (typeof patch[key] === 'number' && Number.isFinite(patch[key])) settings[key] = key === 'particleCount' ? Math.round(clamp(patch[key], min, max)) : clamp(patch[key], min, max);
    }
    for (const key of ['showImage','cursorInteraction','paused','enabled']) if (typeof patch[key] === 'boolean') settings[key] = patch[key];
    if (typeof patch.backgroundColor === 'string' && /^#[\da-f]{6}$/i.test(patch.backgroundColor)) settings.backgroundColor = patch.backgroundColor;
    if (oldCount !== settings.particleCount) { stop(); generation++; loading = false; state.ready = false; }
    window.dispatchEvent(new CustomEvent('hero-particles:settings', { detail: { ...settings, preset } }));
    sync(); return { ...settings, preset };
  }
  function setPreset(value) {
    const next = Number(value);
    if ((next !== 1 && next !== 2) || destroyed) return { ...settings, preset };
    preset = next; return setSettings(presets[preset]);
  }
  function setActive(value) {
    const next = Boolean(value); if (requestedActive === next) return snapshot();
    requestedActive = next; sync(); return snapshot();
  }
  hero.addEventListener('pointermove', event => {
    if (!eligible() || !bounds || event.target?.closest?.('[data-effect-controls]')) return;
    const x = event.clientX-heroRect.left-bounds.x, y = event.clientY-heroRect.top-bounds.y;
    const time = event.timeStamp, dt = Math.max(8, time-pointer.time)/1000;
    pointer.vx = pointer.inside ? clamp((x-pointer.x)/dt, -1200, 1200) : 0;
    pointer.vy = pointer.inside ? clamp((y-pointer.y)/dt, -1200, 1200) : 0;
    Object.assign(pointer, { inside: true, x, y, time });
  }, { passive: true, signal });
  hero.addEventListener('pointerleave', () => { pointer.inside = false; }, { passive: true, signal });
  hero.addEventListener('hero:layout', layout, { signal });
  document.addEventListener('visibilitychange', sync, { signal });
  window.addEventListener('site:entered', () => {
    requestedActive = (window.HeroDepthEffect?.getScrollGate?.() ?? 1) >= .9999; sync();
  }, { once: true, signal });
  window.addEventListener('blur', () => { pointer.inside = false; }, { signal });
  reduced.addEventListener('change', sync, { signal });
  small.addEventListener('change', () => { stop(); generation++; loading = false; state.ready = false; sync(); }, { signal });
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }); observer.observe(hero);
  privateCanvas.addEventListener('webglcontextlost', event => { event.preventDefault(); generation++; loading = false; release(); fallback('context-lost', 'Particle WebGL context was lost'); }, { signal });
  privateCanvas.addEventListener('webglcontextrestored', sync, { signal });
  window.HeroParticles = Object.freeze({
    getPresets: () => ({ 1: { ...presets[1] }, 2: { ...presets[2] } }),
    getSettings: () => ({ ...settings, preset }), setPreset, setSettings, setActive, getState: snapshot,
    destroy() {
      if (destroyed) return;
      destroyed = true; generation++; stop(); controller.abort(); observer.disconnect(); release();
      images.clear(); sourceImage = null;
      canvas.width = canvas.height = privateCanvas.width = privateCanvas.height = 1;
      gl?.getExtension('WEBGL_lose_context')?.loseContext(); gl = null;
      canvas.remove(); hero.classList.remove('has-particle-effect');
      state.ready = state.presented = false; state.status = 'destroyed'; notify();
    },
  });
  layout(); sync();
})();
