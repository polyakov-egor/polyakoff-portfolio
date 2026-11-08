/* Run the real controller with a small browser/GL harness. These checks cover
   input and lifecycle behavior; visual shader output is verified in a browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'hero-depth.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'assets/images/hero-textures.js'), 'utf8');
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const near = (actual, expected, label) => assert(Math.abs(actual - expected) < .0002, `${label}: ${actual} != ${expected}`);
const plain = value => JSON.parse(JSON.stringify(value));
const settingsStorageKey = 'ff.hero.depth.settings.v1';
const defaultSettings = {strength: 1.4, smoothingMs: 240, depthAmount: 1, lighting: .2, enabled: true};
function webpDimensions(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset + 8 < bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4), payload = offset + 8;
    if (type === 'VP8X') return [bytes.readUIntLE(payload + 4, 3) + 1, bytes.readUIntLE(payload + 7, 3) + 1];
    if (type === 'VP8L') {
      assert.equal(bytes[payload], 0x2f);
      const bits = bytes.readUInt32LE(payload + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    if (type === 'VP8 ') return [bytes.readUInt16LE(payload + 6) & 0x3fff, bytes.readUInt16LE(payload + 8) & 0x3fff];
    offset = payload + length + length % 2;
  }
  throw new Error('WebP has no image dimensions');
}
const textureDimensions = Object.fromEntries(['portrait-2456.webp', 'depth-2456.webp', 'portrait-1280.webp', 'depth-1280.webp'].map(filename =>
  [filename, webpDimensions(fs.readFileSync(path.join(root, 'assets/images/hero', filename)))]));

function eventTarget(extra = {}) {
  const listeners = new Map();
  return Object.assign({
    listeners,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    async emit(name, event = {}) {
      for (const callback of listeners.get(name) || []) await callback(event);
    },
    dispatchEvent(event) {
      for (const callback of listeners.get(event.type) || []) callback(event);
      return true;
    },
    count(name) { return (listeners.get(name) || []).length; },
  }, extra);
}

function makeGl({compile = true} = {}) {
  const calls = {shaders: [], uploads: [], draws: 0, drawCovers: [], coverWrites: [], uniforms: new Map(), deletedTextures: 0, deletedPrograms: 0, deletedBuffers: 0,
    bufferPainted: false, presentationPainted: false, copies: 0, resets: {width: 0, height: 0}, exposedClears: 0, emptyHandoffs: 0, error: 0, errorReads: 0, viewportReads: 0};
  const gl = {calls};
  const constants = ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','TEXTURE0','TEXTURE_2D','UNPACK_PREMULTIPLY_ALPHA_WEBGL','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','RGBA','UNSIGNED_BYTE','ARRAY_BUFFER','STATIC_DRAW','FLOAT','MAX_VIEWPORT_DIMS','COLOR_BUFFER_BIT','TRIANGLES'];
  constants.forEach((name, index) => { gl[name] = index + 1; });
  gl.NO_ERROR = 0;
  Object.assign(gl, {
    createShader(type) { const shader = {type}; calls.shaders.push(shader); return shader; },
    shaderSource(shader, source) { shader.source = source; },
    compileShader() {}, getShaderParameter() { return compile; },
    getShaderInfoLog() { return 'Mock shader compilation failure'; }, deleteShader() {},
    createProgram() { return {}; }, attachShader() {}, linkProgram() {},
    getProgramParameter() { return true; }, getProgramInfoLog() { return ''; }, useProgram() {},
    createBuffer() { return {}; }, bindBuffer() {}, bufferData() {},
    getAttribLocation() { return 0; }, enableVertexAttribArray() {}, vertexAttribPointer() {},
    getUniformLocation(_program, name) { return name; },
    uniform1i(name, value) { calls.uniforms.set(name, value); },
    uniform1f(name, value) { calls.uniforms.set(name, value); },
    uniform2f(name, x, y) { calls.uniforms.set(name, [x, y]); if (name === 'u_cover') calls.coverWrites.push([x, y]); },
    createTexture() { return {}; }, activeTexture() {}, bindTexture() {}, pixelStorei() {}, texParameteri() {},
    texImage2D(...args) { calls.uploads.push(args.at(-1)); },
    getParameter() { calls.viewportReads++; return [8192, 8192]; }, viewport() {}, clearColor() {}, clear() { calls.bufferPainted = false; },
    drawArrays() {
      calls.draws++;
      calls.drawCovers.push(calls.uniforms.get('u_cover')?.slice() || [0, 0]);
      if (calls.failNextDraw) {calls.failNextDraw = false; calls.error = 1282; return;}
      calls.bufferPainted = true;
    },
    getError() {calls.errorReads++; const error = calls.error; calls.error = 0; return error;}, isContextLost() { return false; },
    deleteTexture() { calls.deletedTextures++; }, deleteBuffer() { calls.deletedBuffers++; }, deleteProgram() { calls.deletedPrograms++; },
  });
  return gl;
}

function makePage(options = {}) {
  const heroClasses = new Set();
  const gl = makeGl(options);
  const hero = eventTarget({classList: {
    add(name) {if (name === 'has-depth-effect' && !gl.calls.presentationPainted) gl.calls.emptyHandoffs++; heroClasses.add(name);},
    remove: name => heroClasses.delete(name),
  }, getBoundingClientRect: () => ({left: 0, top: 0, width: 1920, height: 960})});
  const renderer = eventTarget({width: 0, height: 0, getContext: (kind, attributes) => {
    assert.equal(kind, 'webgl', 'The detached drawing surface owns the GPU context');
    gl.calls.contextAttributes = attributes;
    return options.noGl ? null : gl;
  }});
  const output = {
    globalCompositeOperation: 'source-over',
    drawImage(source, x, y) {
      assert.equal(source, renderer, 'Only the completed private renderer is copied to the visible canvas');
      assert.deepEqual([x, y], [0, 0]);
      assert.equal(this.globalCompositeOperation, 'copy', 'A frame atomically replaces both opaque and transparent pixels');
      assert(gl.calls.bufferPainted, 'The GPU frame is copied synchronously before browser composition discards it');
      if (gl.calls.failNextCopy) {gl.calls.failNextCopy = false; throw new Error('Mock presentation failure');}
      gl.calls.copies++;
      gl.calls.presentationPainted = true;
    },
  };
  const canvas = eventTarget({dataset: {}, getBoundingClientRect: () => ({width: 1228, height: 1449}), getContext: (kind, attributes) => {
    assert.equal(kind, '2d', 'The visible scene must not expose a preserved WebGL compositor layer');
    gl.calls.outputContextAttributes = attributes;
    return options.noOutput ? null : output;
  }});
  const backingSize = {width: 0, height: 0};
  for (const axis of ['width', 'height']) Object.defineProperty(canvas, axis, {
    get: () => backingSize[axis],
    set(value) {
      // Native canvas dimension writes clear the buffer, even for equal values.
      backingSize[axis] = value;
      gl.calls.presentationPainted = false;
      gl.calls.resets[axis]++;
      if (heroClasses.has('has-depth-effect')) gl.calls.exposedClears++;
    },
  });
  const small = options.small ?? !!options.mobile;
  const portrait = eventTarget({
    src: './assets/images/hero/portrait-2456.webp',
    currentSrc: `http://localhost/assets/images/hero/portrait-${small ? 1280 : 2456}.webp`,
    dataset: {
      colorSmall: './assets/images/hero/portrait-1280.webp', colorLarge: './assets/images/hero/portrait-2456.webp',
      depthSmall: './assets/images/hero/depth-1280.webp', depthLarge: './assets/images/hero/depth-2456.webp',
    },
  });
  const button = eventTarget({hidden: true, attributes: {}, setAttribute(name, value) {this.attributes[name] = value;}});
  const document = eventTarget({hidden: false});
  const storage = options.storage || new Map();
  const window = eventTarget({isSecureContext: options.secure !== false, localStorage: {
    getItem(key) { if (options.blockStorage) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (options.blockStorage) throw new Error('Storage blocked'); storage.set(key, String(value)); },
  }});
  const orientation = eventTarget({angle: 0});
  const media = {
    reduced: eventTarget({matches: !!options.reduced}),
    fine: eventTarget({matches: !options.mobile}),
    coarse: eventTarget({matches: !!options.mobile}),
    small: eventTarget({matches: small}),
  };
  const raf = new Map();
  const observers = {};
  const createdImages = [];
  const waitingImages = [];
  const appendedScripts = [];
  let requestId = 0, frameTime = 0, permissionRequests = 0, context;
  document.querySelector = selector => ({'.hero': hero, '[data-layer="depth"]': canvas, '[data-layer="portrait"]': portrait, '[data-motion-enable]': button})[selector];
  document.createElement = name => {
    if (name === 'canvas') return renderer;
    assert.equal(name, 'script'); return {};
  };
  document.head = {append(script) {
    appendedScripts.push(script.src);
    queueMicrotask(() => {
      try { vm.runInContext(bundle, context); script.onload(); }
      catch (error) { script.onerror(error); }
    });
  }};
  class TextureImage {
    set src(value) {
      this.source = value;
      createdImages.push(this);
      if (value.startsWith('data:image/webp;base64,')) {
        [this.naturalWidth, this.naturalHeight] = webpDimensions(Buffer.from(value.slice(value.indexOf(',') + 1), 'base64'));
      } else {
        [this.naturalWidth, this.naturalHeight] = textureDimensions[value.split('/').at(-1)];
      }
      if (options.invalidDimensions) this.naturalWidth = 0;
      if (options.deferImages) waitingImages.push(() => this.onload());
      else queueMicrotask(() => this.onload());
    }
  }
  class Sensor {}
  if (options.ios) Sensor.requestPermission = async () => { permissionRequests++; return options.permission || 'granted'; };
  context = vm.createContext({
    document, window, screen: {orientation}, location: {protocol: options.file ? 'file:' : 'http:'},
    matchMedia(query) { return query.includes('reduced-motion') ? media.reduced : query.includes('max-width') ? media.small : query.includes('hover: hover') ? media.fine : media.coarse; },
    devicePixelRatio: 2, DeviceOrientationEvent: Sensor, Image: TextureImage, Float32Array, console,
    CustomEvent: class { constructor(type, options = {}) {this.type = type; this.detail = options.detail;} },
    requestAnimationFrame(callback) { const id = ++requestId; raf.set(id, callback); return id; },
    cancelAnimationFrame(id) { raf.delete(id); },
    ResizeObserver: class { constructor(callback) {observers.resize = callback;} observe() {} },
    IntersectionObserver: class { constructor(callback) {observers.intersection = callback;} observe() {} },
  });
  vm.runInContext(options.controller || controller, context);
  return {
    hero, heroClasses, canvas, renderer, output, portrait, button, document, window, orientation, media, raf, gl, context, observers, createdImages, appendedScripts, storage,
    get permissionRequests() { return permissionRequests; },
    finishImages(count = Infinity) { waitingImages.splice(0, count).forEach(finish => finish()); },
    async changeSize(small, {staleCurrentSrc = false} = {}) {
      media.small.matches = small;
      if (!staleCurrentSrc) portrait.currentSrc = `http://localhost/assets/images/hero/portrait-${small ? 1280 : 2456}.webp`;
      await media.small.emit('change');
    },
    runFrames(maximum = 1000) {
      let count = 0;
      while (raf.size && count < maximum) {
        const [id, callback] = raf.entries().next().value;
        raf.delete(id);
        callback(frameTime += 1000 / 60);
        count++;
      }
      assert.equal(raf.size, 0, 'Animation must settle instead of requesting frames forever');
      return count;
    },
    motion() { return [Number(canvas.dataset.motionX), Number(canvas.dataset.motionY)]; },
    composite() {if (!gl.calls.contextAttributes?.preserveDrawingBuffer) gl.calls.bufferPainted = false;},
  };
}

function assertCover(cover, width, height, label, color = 'portrait-2456.webp') {
  assert(cover.every(value => Number.isFinite(value) && value > 0 && value <= 1), `${label}: positive finite cover must be set before drawing, rather than sampling one dark pixel`);
  const imageAspect = textureDimensions[color][0] / textureDimensions[color][1];
  const viewAspect = width / height;
  near(cover[0], Math.min(1, viewAspect / imageAspect), `${label} horizontal cover`);
  near(cover[1], Math.min(1, imageAspect / viewAspect), `${label} vertical cover`);
}

(async () => {
  const mouse = makePage();
  await nextTurn();
  mouse.runFrames();
  assert.equal(mouse.canvas.dataset.state, 'ready');
  assert(mouse.heroClasses.has('has-depth-effect'));
  assert.equal(mouse.gl.calls.shaders.length, 2);
  assertCover(mouse.gl.calls.drawCovers[0], 1228, 1449, 'First GPU frame');
  assert(mouse.gl.calls.shaders.some(shader => shader.source.includes('texture2D(u_depth')));
  assert.equal(mouse.gl.calls.uploads.length, 2);
  assert(mouse.gl.calls.uploads[0].source.endsWith('portrait-2456.webp'));
  assert(mouse.gl.calls.uploads[1].source.endsWith('depth-2456.webp'));
  assert.equal(mouse.gl.calls.uploads[0], mouse.createdImages[0], 'The GPU color texture is the untouched loaded portrait image');
  assert.equal(mouse.gl.calls.uploads[1], mouse.createdImages[1], 'The GPU lighting depth is the untouched loaded map');
  const [colorWidth, colorHeight] = textureDimensions['portrait-2456.webp'];
  const [depthWidth, depthHeight] = textureDimensions['depth-2456.webp'];
  assert.deepEqual([mouse.gl.calls.uploads[0].naturalWidth, mouse.gl.calls.uploads[0].naturalHeight], [colorWidth, colorHeight], 'The color texture retains the supplied WebP dimensions');
  assert.deepEqual([mouse.gl.calls.uploads[1].naturalWidth, mouse.gl.calls.uploads[1].naturalHeight], [depthWidth, depthHeight], 'The depth texture retains its own dimensions independently of a portrait replacement');
  const depthFit = mouse.gl.calls.uniforms.get('u_depthFit');
  assert(depthFit.every(value => value > 0 && value <= 1));
  assert.equal(Math.max(...depthFit), 1, 'Depth fitting crops just one axis without stretching both');
  near(depthFit[0] / depthFit[1], (colorWidth / colorHeight) / (depthWidth / depthHeight), 'Depth UV aspect follows the actual color/depth image proportions');
  assert.equal(mouse.gl.calls.uniforms.get('u_depthStep')[0], 3 / colorWidth, 'Lighting samples horizontal depth steps in actual color-image UV space');
  assert.equal(mouse.gl.calls.uniforms.get('u_depthStep')[1], 3 / colorHeight, 'Lighting samples vertical depth steps in actual color-image UV space');
  // Keep a narrow mutation check: readiness alone did not detect the original
  // regression, because WebGL's untouched vec2 uniform defaults to zero.
  const unguardedController = controller.replace('!Number.isFinite(coverAspect) || ', '');
  assert.notEqual(unguardedController, controller, 'The first-cover regression guard is present');
  const unguarded = makePage({controller: unguardedController});
  await nextTurn();
  unguarded.runFrames();
  assert.equal(unguarded.canvas.dataset.state, 'ready', 'A zero-cover GPU frame can otherwise look successfully initialized');
  assert.throws(() => assertCover(unguarded.gl.calls.drawCovers[0], 1228, 1449, 'Unguarded first frame'), /positive finite cover/, 'The regression check rejects the prior black-rectangle behavior');

  const coverOnly = makePage();
  await nextTurn();coverOnly.runFrames();
  const coverOnlyResets = {...coverOnly.gl.calls.resets};
  const initialCoverWrites = coverOnly.gl.calls.coverWrites.length;
  coverOnly.canvas.getBoundingClientRect = () => ({width: 1229, height: 1449});
  coverOnly.observers.resize();coverOnly.runFrames();
  assert.deepEqual(coverOnly.gl.calls.resets, coverOnlyResets, 'A small aspect change keeps the same backing buckets');
  assert.equal(coverOnly.gl.calls.coverWrites.length, initialCoverWrites + 1, 'CSS aspect changes still update cover without reallocating');
  assertCover(coverOnly.gl.calls.drawCovers.at(-1), 1229, 1449, 'Same-bucket resize frame');
  coverOnly.observers.resize();coverOnly.runFrames();
  assert.equal(coverOnly.gl.calls.coverWrites.length, initialCoverWrites + 1, 'Unchanged aspect retains the cached cover');
  assert(mouse.canvas.width * mouse.canvas.height <= 6e6, 'Rendering stays within its pixel budget');
  assert(mouse.gl.calls.uniforms.get('u_strength').every(value => value > 0 && value < .02), 'Displacement remains subtle');
  const settingsApi = mouse.window.HeroDepthEffect;
  assert.equal(typeof settingsApi.getSettings, 'function');
  assert.equal(typeof settingsApi.setSettings, 'function');
  assert.equal(typeof settingsApi.resetSettings, 'function');
  assert.equal(typeof settingsApi.getDefaults, 'function');
  assert.deepEqual(plain(settingsApi.getSettings()), defaultSettings);
  const exposedDefaults = settingsApi.getDefaults();
  assert.deepEqual(plain(exposedDefaults), defaultSettings, 'Depth defaults expose the complete original profile');
  exposedDefaults.strength = 50; exposedDefaults.enabled = false;
  assert.notEqual(settingsApi.getDefaults(), exposedDefaults, 'Depth defaults are returned as fresh snapshots');
  assert.deepEqual(plain(settingsApi.getDefaults()), defaultSettings, 'Mutating a defaults snapshot cannot affect the controller');
  assert.deepEqual(plain(settingsApi.getSettings()), defaultSettings, 'Reading or mutating defaults leaves current settings intact');
  near(mouse.gl.calls.uniforms.get('u_strength')[0], .006 * 1.4, 'Default horizontal motion is 40% stronger');
  near(mouse.gl.calls.uniforms.get('u_strength')[1], .004 * 1.4, 'Default vertical motion is 40% stronger');
  assert.equal(mouse.gl.calls.uniforms.get('u_depthAmount'), 1);
  assert.equal(mouse.gl.calls.uniforms.get('u_lighting'), .2, 'Lighting defaults to 20 percent');
  const liveResources = [mouse.gl.calls.shaders.length, mouse.gl.calls.uploads.length];
  const settingsEvents = [];
  mouse.window.addEventListener('hero-depth:settings', event => settingsEvents.push(plain(event.detail)));
  settingsApi.setSettings({strength: 2.1, smoothingMs: 360, depthAmount: 1.5, lighting: .65});
  assert.deepEqual(plain(settingsApi.getDefaults()), defaultSettings, 'Live tuning does not overwrite the original depth defaults');
  near(mouse.gl.calls.uniforms.get('u_strength')[0], .006 * 2.1, 'Live strength updates the existing shader uniform');
  assert.equal(mouse.gl.calls.uniforms.get('u_depthAmount'), 1.5);
  assert.equal(mouse.gl.calls.uniforms.get('u_lighting'), .65, 'Live lighting updates the existing shader uniform');
  assert.deepEqual([mouse.gl.calls.shaders.length, mouse.gl.calls.uploads.length], liveResources, 'Settings do not recompile shaders or upload textures again');
  assert.deepEqual(settingsEvents.at(-1), {strength: 2.1, smoothingMs: 360, depthAmount: 1.5, lighting: .65, enabled: true});
  const externalCopy = settingsApi.getSettings();
  externalCopy.strength = 100;
  assert.equal(settingsApi.getSettings().strength, 2.1, 'Settings snapshots cannot mutate internal state');
  settingsApi.setSettings({strength: -5, smoothingMs: 20, depthAmount: -2, lighting: -5});
  assert.deepEqual(plain(settingsApi.getSettings()), {strength: 0, smoothingMs: 80, depthAmount: 0, lighting: 0, enabled: true});
  assert.equal(mouse.gl.calls.uniforms.get('u_depthAmount'), 0);
  assert.equal(mouse.gl.calls.uniforms.get('u_lighting'), 0, 'Lighting can be switched fully off');
  settingsApi.setSettings({strength: 50, smoothingMs: 900, depthAmount: 10, lighting: 5});
  assert.deepEqual(plain(settingsApi.getSettings()), {strength: 3, smoothingMs: 600, depthAmount: 2, lighting: 1, enabled: true});
  assert.equal(mouse.gl.calls.uniforms.get('u_depthAmount'), 2);
  assert.equal(mouse.gl.calls.uniforms.get('u_lighting'), 1, 'Lighting is bounded to its maximum');
  settingsApi.setSettings({strength: NaN, smoothingMs: Infinity, depthAmount: '1', lighting: NaN, enabled: 'false'});
  settingsApi.setSettings({lighting: Infinity});
  settingsApi.setSettings({lighting: '.5'});
  settingsApi.setSettings(null);
  assert.deepEqual(plain(settingsApi.getSettings()), {strength: 3, smoothingMs: 600, depthAmount: 2, lighting: 1, enabled: true}, 'Invalid live values are ignored safely');
  assert.deepEqual(plain(settingsApi.resetSettings()), defaultSettings);
  assert.deepEqual(JSON.parse(mouse.storage.get(settingsStorageKey)), defaultSettings);
  assert.deepEqual([mouse.gl.calls.shaders.length, mouse.gl.calls.uploads.length], liveResources);
  mouse.runFrames();
  const errorReadsBeforePointer = mouse.gl.calls.errorReads;
  await mouse.hero.emit('pointermove', {pointerType: 'mouse', clientX: 1920, clientY: 0});
  assert(mouse.runFrames() > 1, 'Mouse response is eased, rather than snapping');
  near(mouse.motion()[0], 1, 'Right side normalizes to +1');
  near(mouse.motion()[1], -1, 'Top side normalizes to -1');
  assert.equal(mouse.gl.calls.errorReads, errorReadsBeforePointer, 'Pointer frames avoid synchronous GPU error queries');
  await mouse.hero.emit('pointerleave');
  mouse.runFrames();
  near(mouse.motion()[0], 0, 'Leaving returns x to neutral');
  near(mouse.motion()[1], 0, 'Leaving returns y to neutral');
  const settledDraws = mouse.gl.calls.draws;
  assert.equal(mouse.runFrames(), 0);
  assert.equal(mouse.gl.calls.draws, settledDraws);

  await mouse.hero.emit('pointermove', {pointerType: 'mouse', clientX: 1800, clientY: 700});
  settingsApi.setSettings({enabled: false});
  assert.equal(mouse.canvas.dataset.state, 'disabled');
  assert(!mouse.heroClasses.has('has-depth-effect'));
  assert.equal(mouse.raf.size, 0, 'Disabling cancels pending animation');
  await mouse.hero.emit('pointermove', {pointerType: 'mouse', clientX: 100, clientY: 100});
  assert.equal(mouse.raf.size, 0, 'Disabled input cannot restart animation');
  settingsApi.setSettings({enabled: true});
  await nextTurn();
  mouse.runFrames();
  assert.equal(mouse.canvas.dataset.state, 'ready');
  assert(mouse.heroClasses.has('has-depth-effect'));
  near(mouse.motion()[0], 0, 'Re-enabling restores a neutral view');

  await mouse.hero.emit('pointermove', {pointerType: 'mouse', clientX: 1800, clientY: 900});
  mouse.document.hidden = true;
  await mouse.document.emit('visibilitychange');
  assert.equal(mouse.raf.size, 0);
  mouse.document.hidden = false;
  await mouse.document.emit('visibilitychange');
  mouse.runFrames();
  near(mouse.motion()[0], 0, 'Returning from a hidden tab resets stale mouse input');
  mouse.observers.intersection([{isIntersecting: false}]);
  assert.equal(mouse.raf.size, 0, 'Offscreen hero does not render');
  mouse.observers.intersection([{isIntersecting: true}]);
  mouse.runFrames();

  mouse.media.reduced.matches = true;
  await mouse.media.reduced.emit('change');
  assert.equal(mouse.canvas.dataset.state, 'reduced-motion');
  assert(!mouse.heroClasses.has('has-depth-effect'));
  assert.equal(mouse.raf.size, 0);
  assert.equal(mouse.gl.calls.deletedTextures, 4, 'Disable and reduced-motion fallback both release uploaded textures');
  mouse.media.reduced.matches = false;
  await mouse.media.reduced.emit('change');
  await nextTurn();
  mouse.runFrames();
  assert.equal(mouse.canvas.dataset.state, 'ready');
  let prevented = false;
  await mouse.renderer.emit('webglcontextlost', {preventDefault() {prevented = true;}});
  assert(prevented);
  assert.equal(mouse.canvas.dataset.state, 'context-lost');
  assert(!mouse.heroClasses.has('has-depth-effect'));
  await mouse.renderer.emit('webglcontextrestored');
  await nextTurn();
  mouse.runFrames();
  assert.equal(mouse.canvas.dataset.state, 'ready');
  assert.equal(mouse.createdImages.length, 2, 'GPU recreation never reloads the original images');

  const reduced = makePage({reduced: true});
  await nextTurn();
  assert.equal(reduced.canvas.dataset.state, 'reduced-motion');
  assert.equal(reduced.createdImages.length, 0, 'Reduced motion avoids texture loads');
  assert.equal(reduced.gl.calls.shaders.length, 0);
  reduced.window.HeroDepthEffect.setSettings({enabled: false});
  reduced.window.HeroDepthEffect.setSettings({enabled: true});
  await nextTurn();
  assert.equal(reduced.canvas.dataset.state, 'reduced-motion', 'Reduced motion takes priority over enabling the effect');
  assert.equal(reduced.raf.size, 0);
  assert.equal(reduced.gl.calls.shaders.length, 0);
  const racing = makePage({deferImages: true});
  await nextTurn();
  racing.media.reduced.matches = true;
  await racing.media.reduced.emit('change');
  racing.finishImages();
  await nextTurn();
  assert.equal(racing.canvas.dataset.state, 'reduced-motion', 'Late texture completion cannot override reduced motion');
  assert.equal(racing.gl.calls.shaders.length, 0);
  const unsupported = makePage({noGl: true});
  await nextTurn();
  assert.equal(unsupported.canvas.dataset.state, 'unsupported');
  assert(!unsupported.heroClasses.has('has-depth-effect'));
  const brokenShader = makePage({compile: false});
  await nextTurn();
  assert.equal(brokenShader.canvas.dataset.state, 'unavailable');
  assert.equal(brokenShader.raf.size, 0);

  const sharedStorage = new Map();
  const customized = makePage({storage: sharedStorage});
  await nextTurn();
  customized.runFrames();
  const savedSettings = {strength: 1.9, smoothingMs: 420, depthAmount: .7, lighting: .45, enabled: true};
  customized.window.HeroDepthEffect.setSettings(savedSettings);
  const reopened = makePage({storage: sharedStorage});
  await nextTurn();
  reopened.runFrames();
  assert.deepEqual(plain(reopened.window.HeroDepthEffect.getSettings()), savedSettings, 'Settings survive a new page load');
  near(reopened.gl.calls.uniforms.get('u_strength')[0], .006 * 1.9, 'Restored settings reach the new GPU program');
  assert.equal(reopened.gl.calls.uniforms.get('u_depthAmount'), .7);
  assert.equal(reopened.gl.calls.uniforms.get('u_lighting'), .45, 'Persisted lighting reaches the new GPU program');
  reopened.window.HeroDepthEffect.resetSettings();
  const resetPage = makePage({storage: sharedStorage});
  await nextTurn();
  assert.deepEqual(plain(resetPage.window.HeroDepthEffect.getSettings()), defaultSettings, 'Reset persists the defaults');
  for (const invalid of ['{bad json', 'null', '"a string"', '{"strength":"3","smoothingMs":null,"depthAmount":1e400,"lighting":".5","enabled":"false"}']) {
    const invalidPage = makePage({storage: new Map([[settingsStorageKey, invalid]])});
    await nextTurn();
    invalidPage.runFrames();
    assert.equal(invalidPage.canvas.dataset.state, 'ready');
    assert.deepEqual(plain(invalidPage.window.HeroDepthEffect.getSettings()), defaultSettings, `Invalid saved settings are safe: ${invalid}`);
  }
  const clippedSaved = makePage({storage: new Map([[settingsStorageKey, '{"strength":100,"smoothingMs":-20,"depthAmount":-4,"lighting":9,"enabled":false}']])});
  await nextTurn();
  assert.deepEqual(plain(clippedSaved.window.HeroDepthEffect.getSettings()), {strength: 3, smoothingMs: 80, depthAmount: 0, lighting: 1, enabled: false});
  assert.equal(clippedSaved.canvas.dataset.state, 'disabled');
  assert.equal(clippedSaved.raf.size, 0);
  assert.equal(clippedSaved.createdImages.length, 0, 'Saved disabled state avoids loading GPU textures');
  const olderSettings = {strength: 1.8, smoothingMs: 300, depthAmount: .8, enabled: true};
  const migratedPage = makePage({storage: new Map([[settingsStorageKey, JSON.stringify(olderSettings)]])});
  await nextTurn();
  migratedPage.runFrames();
  assert.deepEqual(plain(migratedPage.window.HeroDepthEffect.getSettings()), {...olderSettings, lighting: .2}, 'Existing v1 settings receive the new lighting default without losing their values');
  assert.equal(migratedPage.gl.calls.uniforms.get('u_lighting'), .2);
  const blockedStorage = makePage({blockStorage: true});
  await nextTurn();
  blockedStorage.runFrames();
  assert.equal(blockedStorage.window.HeroDepthEffect.setSettings({strength: 2}).strength, 2, 'Unavailable localStorage does not break in-memory settings');
  blockedStorage.runFrames();

  const phone = makePage({mobile: true, ios: true});
  await nextTurn();
  phone.runFrames();
  assert.equal(phone.permissionRequests, 0, 'iOS permission must not be requested automatically');
  assert.equal(phone.window.count('deviceorientation'), 0);
  assert.equal(phone.button.hidden, false);
  await phone.button.emit('click');
  assert.equal(phone.permissionRequests, 1);
  assert.equal(phone.window.count('deviceorientation'), 1);
  assert.equal(phone.button.hidden, true);
  await phone.window.emit('deviceorientation', {beta: 25, gamma: 3});
  phone.runFrames();
  near(phone.motion()[0], 0, 'Initial phone angle becomes x baseline');
  near(phone.motion()[1], 0, 'Initial phone angle becomes y baseline');
  const gyroUploads = phone.gl.calls.uploads.length;
  phone.window.HeroDepthEffect.setSettings({lighting: .75});
  assert.equal(phone.gl.calls.uniforms.get('u_lighting'), .75);
  await phone.window.emit('deviceorientation', {beta: 120, gamma: 100});
  phone.runFrames();
  near(phone.motion()[0], 1, 'Large gamma movement is clamped');
  near(phone.motion()[1], 1, 'Large beta movement is clamped');
  assert.deepEqual(phone.gl.calls.uniforms.get('u_motion'), [1, 1], 'Gyroscope updates the shared motion uniform used by lighting');
  assert.equal(phone.gl.calls.uploads.length, gyroUploads, 'Changing light and tilting the phone reuses both textures');
  phone.orientation.angle = 90;
  await phone.orientation.emit('change');
  phone.runFrames();
  await phone.window.emit('deviceorientation', {beta: 25, gamma: 3});
  await phone.window.emit('deviceorientation', {beta: 35, gamma: 3});
  phone.runFrames();
  near(phone.motion()[0], 1, 'Landscape beta rotates onto screen x');
  near(phone.motion()[1], 0, 'Landscape beta does not move screen y');
  await phone.window.emit('deviceorientation', {beta: 25, gamma: 13});
  phone.runFrames();
  near(phone.motion()[0], 0, 'Landscape gamma does not move screen x');
  near(phone.motion()[1], -1, 'Landscape gamma rotates onto negative screen y');
  phone.orientation.angle = 0;
  await phone.orientation.emit('change');
  phone.runFrames();
  await phone.window.emit('deviceorientation', {beta: 179, gamma: 0});
  await phone.window.emit('deviceorientation', {beta: -179, gamma: 0});
  phone.runFrames();
  near(phone.motion()[1], .2, 'Angle wraparound uses the short two-degree movement');
  const phoneApi = phone.window.HeroDepthEffect;
  const phoneSettings = plain(phoneApi.getSettings());
  phoneApi.setScrollGate(0);
  await phone.window.emit('deviceorientation', {beta: 80, gamma: 30});
  assert.equal(phone.raf.size, 0, 'Scrolling past the hero blocks gyro rendering');
  assert.equal(phone.button.hidden, true);
  phoneApi.setScrollGate(.5);
  phone.runFrames();
  await phone.window.emit('deviceorientation', {beta: 80, gamma: 30});
  phone.runFrames();
  near(phone.motion()[0], 0, 'Gyroscope recalibrates after scroll resume');
  near(phone.motion()[1], 0, 'Gyroscope resume starts from a neutral tilt');
  await phone.window.emit('deviceorientation', {beta: 90, gamma: 40});
  phone.runFrames();
  near(phone.gl.calls.uniforms.get('u_motion')[0], .5, 'Scroll gate fades gyro displacement and lighting together');
  near(phone.gl.calls.uniforms.get('u_motion')[1], .5, 'Scroll gate also fades vertical gyro input');
  assert.deepEqual(plain(phoneApi.getSettings()), phoneSettings);
  const denied = makePage({mobile: true, ios: true, permission: 'denied'});
  await nextTurn();
  denied.runFrames();
  await denied.button.emit('click');
  assert.equal(denied.window.count('deviceorientation'), 0, 'Denied permission never attaches the sensor');
  assert.equal(denied.button.hidden, false, 'A denied request remains retryable');

  const scrollSettings = {...defaultSettings, strength: 2.2, lighting: .65};
  const scrollStorage = new Map([[settingsStorageKey, JSON.stringify(scrollSettings)]]);
  const scrolling = makePage({storage: scrollStorage});
  await nextTurn();
  scrolling.runFrames();
  const scrollApi = scrolling.window.HeroDepthEffect;
  assert.equal(scrollApi.getScrollGate(), 1);
  const scrollResources = [scrolling.gl.calls.shaders.length, scrolling.gl.calls.uploads.length];
  const storageBeforeScroll = [...scrollStorage];
  let scrollSettingsEvents = 0;
  scrolling.window.addEventListener('hero-depth:settings', () => scrollSettingsEvents++);
  await scrolling.hero.emit('pointermove', {pointerType: 'mouse', clientX: 1920, clientY: 0});
  scrolling.runFrames();
  assert.equal(scrollApi.setScrollGate(.5), .5);
  scrolling.runFrames();
  near(scrolling.gl.calls.uniforms.get('u_motion')[0], .5, 'Half scroll gate halves horizontal displacement and light input');
  near(scrolling.gl.calls.uniforms.get('u_motion')[1], -.5, 'Half scroll gate halves vertical displacement and light input');
  await scrolling.hero.emit('pointermove', {pointerType: 'mouse', clientX: 0, clientY: 960});
  assert(scrolling.raf.size > 0);
  scrollApi.setScrollGate(0);
  assert.equal(scrolling.raf.size, 0, 'Zero gate cancels even a pending frame');
  assert.equal(scrolling.canvas.dataset.state, 'scroll-paused');
  assert(!scrolling.heroClasses.has('has-depth-effect'), 'Zero gate reveals the neutral original image');
  assert.deepEqual(scrolling.gl.calls.uniforms.get('u_motion'), [0, 0]);
  assert.equal(scrolling.gl.calls.deletedTextures, 0, 'Scroll pause keeps GPU textures for a cheap resume');
  await scrolling.hero.emit('pointermove', {pointerType: 'mouse', clientX: 1800, clientY: 900});
  await scrolling.hero.emit('pointerleave');
  await scrolling.window.emit('blur');
  scrolling.observers.intersection([{isIntersecting: false}]);
  scrolling.observers.intersection([{isIntersecting: true}]);
  scrolling.document.hidden = true;
  await scrolling.document.emit('visibilitychange');
  scrolling.document.hidden = false;
  await scrolling.document.emit('visibilitychange');
  assert.equal(scrolling.raf.size, 0, 'Paused input and visibility changes do not restart rendering');
  for (const invalid of [NaN, Infinity, '.5', null]) assert.equal(scrollApi.setScrollGate(invalid), 0);
  assert.equal(scrollApi.setScrollGate(-10), 0);
  scrolling.canvas.getBoundingClientRect = () => ({width: 500, height: 800});
  scrolling.observers.resize();
  assert.equal(scrolling.raf.size, 0);
  assert.equal(scrollApi.setScrollGate(10), 1);
  scrolling.runFrames();
  assert.equal(scrolling.canvas.dataset.state, 'ready');
  assert(scrolling.heroClasses.has('has-depth-effect'));
  assert(scrolling.canvas.width >= 750 && scrolling.canvas.width < 878, 'Resume keeps at least the current desired width in one small backing bucket');
  assert(scrolling.canvas.height >= 1200 && scrolling.canvas.height < 1328, 'Resume keeps at least the current desired height in one small backing bucket');
  near(scrolling.motion()[0], 0, 'Resume discards the stale mouse pose');
  near(scrolling.motion()[1], 0, 'Resume returns neutral without a snap to old input');
  assert.deepEqual([scrolling.gl.calls.shaders.length, scrolling.gl.calls.uploads.length], scrollResources, 'Scroll resume does not recompile or re-upload');
  assert.deepEqual(plain(scrollApi.getSettings()), scrollSettings, 'Scroll gate never changes saved user preferences');
  assert.deepEqual([...scrollStorage], storageBeforeScroll, 'Scroll gate never writes localStorage');
  assert.equal(scrollSettingsEvents, 0, 'Scroll gate does not masquerade as a settings change');

  scrollApi.setScrollGate(0);
  await scrolling.renderer.emit('webglcontextlost', {preventDefault() {}});
  await scrolling.renderer.emit('webglcontextrestored');
  await nextTurn();
  assert.equal(scrolling.canvas.dataset.state, 'scroll-paused', 'Context restoration respects a closed gate');
  assert.equal(scrolling.raf.size, 0);
  assert(!scrolling.heroClasses.has('has-depth-effect'));
  scrollApi.setScrollGate(1);
  scrolling.runFrames();
  assert.equal(scrolling.canvas.dataset.state, 'ready');
  scrollApi.setSettings({enabled: false});
  scrollApi.setScrollGate(0);
  scrollApi.setScrollGate(1);
  await nextTurn();
  assert.equal(scrolling.canvas.dataset.state, 'disabled', 'Scroll cannot override the user disabling the effect');
  assert.equal(scrolling.raf.size, 0);
  reduced.window.HeroDepthEffect.setScrollGate(0);
  reduced.window.HeroDepthEffect.setScrollGate(1);
  await nextTurn();
  assert.equal(reduced.canvas.dataset.state, 'reduced-motion', 'Scroll cannot override reduced motion');
  assert.equal(reduced.raf.size, 0);

  const scrollLoading = makePage({file: true, deferImages: true});
  const scrollLoadingApi = scrollLoading.window.HeroDepthEffect;
  scrollLoadingApi.setScrollGate(0);
  await nextTurn();
  assert.equal(scrollLoading.createdImages.length, 2);
  scrollLoading.finishImages();
  await nextTurn();
  assert.equal(scrollLoading.canvas.dataset.state, 'scroll-paused', 'Late offline texture loading cannot reveal a paused hero');
  assert.equal(scrollLoading.gl.calls.draws, 0);
  assert.equal(scrollLoading.raf.size, 0);
  assert(!scrollLoading.heroClasses.has('has-depth-effect'));
  const offlineScrollResources = [scrollLoading.gl.calls.shaders.length, scrollLoading.gl.calls.uploads.length];
  scrollLoadingApi.setScrollGate(1);
  scrollLoading.runFrames();
  assert.equal(scrollLoading.canvas.dataset.state, 'ready');
  assert.deepEqual([scrollLoading.gl.calls.shaders.length, scrollLoading.gl.calls.uploads.length], offlineScrollResources);
  const freshScrollPage = makePage({storage: scrollStorage});
  await nextTurn();
  assert.equal(freshScrollPage.window.HeroDepthEffect.getScrollGate(), 1, 'Scroll gate is transient and resets on a new page');

  const continuous = makePage();
  await nextTurn();
  continuous.runFrames();
  assert.equal(continuous.gl.calls.contextAttributes.preserveDrawingBuffer, false, 'The private GPU surface has no retained page compositor layer');
  assert.equal(continuous.canvas.dataset.renderer, 'webgl-bitmap');
  assert.equal(continuous.gl.calls.copies, continuous.gl.calls.draws, 'Each successful GPU draw is synchronously presented once');
  assert.deepEqual([continuous.renderer.width, continuous.renderer.height], [continuous.canvas.width, continuous.canvas.height], 'Private and visible buffers share exact dimensions');
  continuous.composite();
  assert(!continuous.gl.calls.bufferPainted, 'The private GPU drawing buffer may be discarded normally');
  assert(continuous.gl.calls.presentationPainted, 'The visible 2D bitmap survives later compositor passes without idle RAF');
  assert.equal(continuous.raf.size, 0);
  const stableDraws = continuous.gl.calls.draws;
  continuous.observers.resize();
  continuous.observers.resize();
  assert.equal(continuous.gl.calls.draws, stableDraws, 'Unchanged observer/visibility notifications do not repaint the retained bitmap');
  const continuousResources = [continuous.gl.calls.shaders.length, continuous.gl.calls.uploads.length];
  await continuous.hero.emit('pointermove', {pointerType: 'mouse', clientX: 1920, clientY: 0});
  continuous.runFrames();
  const posedMotion = continuous.motion();
  let cssWidth = 1100, cssHeight = 1350;
  continuous.canvas.getBoundingClientRect = () => ({width: cssWidth, height: cssHeight});
  const allocationStart = {...continuous.gl.calls.resets};
  const copiesStart = continuous.gl.calls.copies;
  let synchronousPaints = 0, deferredPaints = 0;
  for (let index = 0; index < 12; index++) {
    continuous.window.HeroDepthEffect.setScrollGate(1 - index * .04);
    cssWidth -= 23;
    cssHeight -= 27;
    const beforeDraw = continuous.gl.calls.draws;
    continuous.observers.resize();
    if (continuous.gl.calls.draws > beforeDraw) synchronousPaints++;
    else deferredPaints++;
    assert(continuous.gl.calls.presentationPainted && continuous.heroClasses.has('has-depth-effect'), 'No cleared buffer is exposed after a scroll resize callback');
    assert(continuous.raf.size <= 1, 'Scroll and resize coalesce their pending animation frame');
    continuous.composite();
    assert(continuous.gl.calls.presentationPainted, 'CSS recomposition retains the repainted portrait');
  }
  assert(synchronousPaints > 0 && deferredPaints > 0, 'Only actual backing reallocations require synchronous paint; CSS-only changes share RAF');
  const widthResets = continuous.gl.calls.resets.width - allocationStart.width;
  const heightResets = continuous.gl.calls.resets.height - allocationStart.height;
  assert(widthResets + heightResets < 24, 'Continuous morph allocates fewer buffers than resizing both axes on all12 samples');
  assert.equal(continuous.gl.calls.viewportReads, 1, 'GPU viewport limits are cached once per context');
  continuous.runFrames();
  const gateAtResize = continuous.window.HeroDepthEffect.getScrollGate();
  near(continuous.motion()[0], posedMotion[0] * gateAtResize, 'Synchronous resize keeps the current pose rather than advancing easing for every geometry write');
  const morphMetrics = {samples: 12, previousDimensionWrites: 24, dimensionWrites: widthResets + heightResets, synchronousPaints, deferredPaints, bitmapCopies: continuous.gl.calls.copies - copiesStart};
  const resetsBeforeHeightChange = {...continuous.gl.calls.resets};
  cssHeight += 128;
  continuous.observers.resize();
  assert.equal(continuous.gl.calls.resets.width, resetsBeforeHeightChange.width, 'Changing only height does not clear the width buffer again');
  assert.equal(continuous.gl.calls.resets.height, resetsBeforeHeightChange.height + 1);
  assert.equal(continuous.gl.calls.exposedClears, 0, 'The fallback poster covers every actual drawing-buffer reset');
  assert.equal(continuous.gl.calls.emptyHandoffs, 0, 'The poster is hidden only after a successful GPU paint');
  assert.deepEqual([continuous.gl.calls.shaders.length, continuous.gl.calls.uploads.length], continuousResources);
  continuous.window.HeroDepthEffect.setScrollGate(0);
  cssWidth = cssHeight = 200;
  continuous.observers.resize();
  assert(!continuous.heroClasses.has('has-depth-effect'), 'The finished small portrait remains the static source image');
  assert.equal(continuous.raf.size, 0);
  continuous.window.HeroDepthEffect.setScrollGate(1);
  assert(continuous.gl.calls.presentationPainted && continuous.heroClasses.has('has-depth-effect'), 'Reverse scroll repaints the new size before hiding the static poster');
  continuous.runFrames();
  cssWidth += 128;
  continuous.gl.calls.failNextDraw = true;
  continuous.observers.resize();
  assert.equal(continuous.canvas.dataset.state, 'unavailable');
  assert(!continuous.heroClasses.has('has-depth-effect'), 'A failed resize paint leaves the fallback poster visible');
  assert.equal(continuous.raf.size, 0);

  const failedCopy = makePage();
  await nextTurn();
  failedCopy.runFrames();
  failedCopy.gl.calls.failNextCopy = true;
  await failedCopy.hero.emit('pointermove', {pointerType: 'mouse', clientX: 1900, clientY: 900});
  failedCopy.runFrames();
  assert.equal(failedCopy.canvas.dataset.state, 'unavailable');
  assert(!failedCopy.heroClasses.has('has-depth-effect'), 'A failed bitmap copy reveals the intact source portrait');
  assert.equal(failedCopy.raf.size, 0, 'Presentation failure does not start an idle redraw loop');

  const noOutput = makePage({noOutput: true});
  await nextTurn();
  assert.equal(noOutput.canvas.dataset.state, 'unsupported');
  assert(!noOutput.heroClasses.has('has-depth-effect'), 'Missing 2D output leaves the original portrait visible');

  const resolution = makePage();
  await nextTurn();
  for (const [width, height] of [[561, 705], [1228, 1449], [1572, 1855], [2550, 2950], [4000, 7000]]) {
    resolution.canvas.getBoundingClientRect = () => ({width, height});
    resolution.observers.resize();
    resolution.runFrames();
    const previousDpr = Math.min(2, 1.5, Math.sqrt(6e6 / (width * height)), 8192 / width, 8192 / height);
    assert(resolution.canvas.width >= Math.round(width * previousDpr), 'Buckets never lower the previous horizontal raster resolution');
    assert(resolution.canvas.height >= Math.round(height * previousDpr), 'Buckets never lower the previous vertical raster resolution');
  }

  const responsive = makePage({deferImages: true});
  await nextTurn();
  responsive.finishImages();await nextTurn();responsive.runFrames();
  const responsiveSettings = plain(responsive.window.HeroDepthEffect.getSettings());
  const responsiveStorage = [...responsive.storage];
  await responsive.changeSize(true, {staleCurrentSrc: true});
  await nextTurn();
  assert(responsive.portrait.currentSrc.endsWith('portrait-2456.webp'), 'The test models picture.currentSrc lagging a media change');
  assert.equal(responsive.canvas.dataset.state, 'loading');
  assert(!responsive.heroClasses.has('has-depth-effect'), 'The native responsive portrait covers a loading texture pair');
  assert.equal(responsive.raf.size, 0);
  assert.deepEqual(responsive.createdImages.slice(2).map(image => image.source), ['./assets/images/hero/portrait-1280.webp', './assets/images/hero/depth-1280.webp']);
  responsive.finishImages(1);await nextTurn();
  assert.equal(responsive.gl.calls.uploads.length, 2, 'One loaded small texture cannot replace half of the GPU pair');
  responsive.finishImages();await nextTurn();responsive.runFrames();
  assert.equal(responsive.canvas.dataset.state, 'ready');
  assert.deepEqual(responsive.gl.calls.uploads.slice(-2).map(image => image.source), ['./assets/images/hero/portrait-1280.webp', './assets/images/hero/depth-1280.webp']);
  assertCover(responsive.gl.calls.drawCovers.at(-1), 1228, 1449, 'Small responsive pair first frame', 'portrait-1280.webp');
  const [smallColorW, smallColorH] = textureDimensions['portrait-1280.webp'];
  const [smallDepthW, smallDepthH] = textureDimensions['depth-1280.webp'];
  const smallFit = responsive.gl.calls.uniforms.get('u_depthFit');
  near(smallFit[0] / smallFit[1], (smallColorW / smallColorH) / (smallDepthW / smallDepthH), 'Responsive depth UV uses the matching color/map dimensions');
  await responsive.changeSize(false);await nextTurn();responsive.runFrames();
  assert.equal(responsive.createdImages.length, 4, 'Returning to a decoded desktop pair does not load it twice');
  assert(responsive.gl.calls.uploads.at(-2).source.endsWith('portrait-2456.webp'));
  const responsiveUploads = responsive.gl.calls.uploads.length;
  await responsive.changeSize(false);await nextTurn();
  assert.equal(responsive.gl.calls.uploads.length, responsiveUploads, 'Duplicate media notifications keep the current ready GPU pair');
  assert.deepEqual(plain(responsive.window.HeroDepthEffect.getSettings()), responsiveSettings);
  assert.deepEqual([...responsive.storage], responsiveStorage, 'Responsive source selection never changes saved effects');

  const initialSmall = makePage({small: true});
  await nextTurn();initialSmall.runFrames();
  assert.deepEqual(initialSmall.createdImages.map(image => image.source), ['./assets/images/hero/portrait-1280.webp', './assets/images/hero/depth-1280.webp'], 'A narrow initial viewport never loads desktop textures');
  assertCover(initialSmall.gl.calls.drawCovers[0], 1228, 1449, 'Initial small viewport', 'portrait-1280.webp');

  const racingSizes = makePage({deferImages: true});
  await nextTurn();
  await racingSizes.changeSize(true);await nextTurn();
  racingSizes.finishImages(2);await nextTurn();
  assert.equal(racingSizes.gl.calls.uploads.length, 0, 'A stale large-image completion cannot initialize the new narrow viewport');
  racingSizes.finishImages();await nextTurn();racingSizes.runFrames();
  assert.equal(racingSizes.gl.calls.uploads.length, 2);
  assert(racingSizes.gl.calls.uploads[0].source.endsWith('portrait-1280.webp'));

  const bounceSizes = makePage({deferImages: true});
  await nextTurn();
  await bounceSizes.changeSize(true);await nextTurn();
  await bounceSizes.changeSize(false);await nextTurn();
  assert.equal(bounceSizes.createdImages.length, 4, 'A breakpoint bounce shares the original pending pair');
  bounceSizes.finishImages(2);await nextTurn();bounceSizes.runFrames();
  assert(bounceSizes.gl.calls.uploads[0].source.endsWith('portrait-2456.webp'));
  bounceSizes.finishImages();await nextTurn();
  assert.equal(bounceSizes.gl.calls.uploads.length, 2, 'A late small pair cannot replace the current full pair');

  const pausedResize = makePage();
  await nextTurn();pausedResize.runFrames();
  pausedResize.window.HeroDepthEffect.setScrollGate(0);
  await pausedResize.changeSize(true);await nextTurn();
  assert.equal(pausedResize.canvas.dataset.state, 'scroll-paused', 'A new responsive pair respects the frozen mini portrait');
  assert.equal(pausedResize.raf.size, 0);
  assert(!pausedResize.heroClasses.has('has-depth-effect'));
  pausedResize.window.HeroDepthEffect.setScrollGate(1);pausedResize.runFrames();
  assertCover(pausedResize.gl.calls.drawCovers.at(-1), 1228, 1449, 'Small responsive resume', 'portrait-1280.webp');

  const disabledResize = makePage({storage: new Map([[settingsStorageKey, JSON.stringify({enabled: false})]])});
  await disabledResize.changeSize(true);await nextTurn();
  assert.equal(disabledResize.createdImages.length, 0, 'Disabled depth does not load textures on a breakpoint change');
  const reducedResize = makePage({reduced: true});
  await reducedResize.changeSize(true);await nextTurn();
  assert.equal(reducedResize.createdImages.length, 0, 'Reduced motion does not load responsive depth textures');
  const invalidTexture = makePage({invalidDimensions: true});
  await nextTurn();
  assert.equal(invalidTexture.canvas.dataset.state, 'unavailable');
  assert.equal(invalidTexture.gl.calls.draws, 0, 'Invalid image dimensions never produce a black first GPU frame');
  assert(!invalidTexture.heroClasses.has('has-depth-effect'));

  const offline = makePage({file: true});
  await nextTurn();
  offline.runFrames();
  assert.equal(offline.canvas.dataset.state, 'ready');
  assert.deepEqual(offline.appendedScripts, ['./assets/images/hero-textures.js']);
  assert(offline.gl.calls.uploads.every(image => image.source.startsWith('data:image/webp;base64,')), 'Offline WebGL uploads WebP data URLs, not tainted file URLs');
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  for (const [key, filename] of [['color','portrait-2456.webp'], ['depth','depth-2456.webp'], ['colorSmall','portrait-1280.webp'], ['depthSmall','depth-1280.webp']]) {
    const url = offline.context.window.HERO_TEXTURES[key];
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    assert.equal(sha(bytes), sha(fs.readFileSync(path.join(root, 'assets/images/hero', filename))), `Offline ${key} bytes must equal the responsive WebP asset`);
  }
  await offline.changeSize(true);await nextTurn();offline.runFrames();
  assert.equal(offline.gl.calls.uploads.at(-2).source, offline.context.window.HERO_TEXTURES.colorSmall);
  assert.equal(offline.gl.calls.uploads.at(-1).source, offline.context.window.HERO_TEXTURES.depthSmall);
  assert.equal(offline.appendedScripts.length, 1, 'Offline resizing reuses the one WebP bundle');
  assertCover(offline.gl.calls.drawCovers.at(-1), 1228, 1449, 'Offline small responsive frame', 'portrait-1280.webp');
  const offlineRace = makePage({file: true, deferImages: true});
  await offlineRace.changeSize(true);await nextTurn();
  assert.equal(offlineRace.appendedScripts.length, 1, 'Concurrent responsive loading requests share one offline bundle');
  offlineRace.finishImages(2);await nextTurn();
  assert.equal(offlineRace.gl.calls.uploads.length, 0);
  offlineRace.finishImages();await nextTurn();offlineRace.runFrames();
  assert.equal(offlineRace.gl.calls.uploads[0].source, offlineRace.context.window.HERO_TEXTURES.colorSmall);
  console.log('Depth performance metrics:', JSON.stringify(morphMetrics));
  console.log('Depth checks passed: GPU/input/lifecycle, responsive WebP/offline identity and crossing races, settings and scroll gates, atomic private-GPU-to-retained-bitmap presentation, quantized/coalesced resize, static-card resume, draw/copy-error fallback, reduced-motion and gyro safety.');
})().catch(error => { console.error(error); process.exitCode = 1; });
