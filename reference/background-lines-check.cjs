/* Exercise the real line-light controller with deterministic input and time.
   Browser QA covers the visual result; this harness covers input/lifecycle. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const storageKey = 'ff.background.lines.settings.v1';

function events(extra = {}) {
  const listeners = new Map();
  return Object.assign({
    listeners,
    addEventListener(type, fn, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, options });
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) || []).filter(entry => entry.fn !== fn));
    },
    dispatchEvent(event) {
      for (const { fn } of [...(listeners.get(event.type) || [])]) fn(event);
      return true;
    },
    emit(type, patch = {}) { this.dispatchEvent({ type, ...patch }); },
  }, extra);
}

function fakeContext(canvas) {
  const calls = [];
  const gradient = () => ({ addColorStop: (...args) => calls.push(['stop', ...args]) });
  const context = {
    canvas, calls,
    createRadialGradient: (...args) => { calls.push(['radial', ...args]); return gradient(); },
    createLinearGradient: (...args) => { calls.push(['linear', ...args]); return gradient(); },
    getImageData: (_x, _y, width, height) => {
      calls.push(['readback', width, height]);
      const data = new Uint8ClampedArray(width * height * 4);
      data.set([0, 0, 0, 255, 255, 255, 255, 40, 128, 128, 128, 100]);
      return { width, height, data };
    },
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData(pixels) { calls.push(['pixels', ...pixels.data.slice(0, 12)]); },
  };
  return new Proxy(context, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push([key, ...args]);
    },
    set(target, key, value) { target[key] = value; calls.push(['set', key, value]); return true; },
  });
}

function node(tag, className = '') {
  const element = events({
    tagName: tag.toUpperCase(), className, children: [], style: {}, dataset: {}, attributes: new Map(),
    clientWidth: 1920, clientHeight: 960,
    setAttribute(key, value) { this.attributes.set(key, String(value)); },
    getAttribute(key) { return this.attributes.get(key) ?? null; },
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } },
    appendChild(child) { this.append(child); return child; },
    insertBefore(child, before) { const i = before ? this.children.indexOf(before) : this.children.length; assert(i >= 0); child.parentElement = this; this.children.splice(i, 0, child); },
    get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; },
    remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; },
    matches(selector) {
      if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
      if (selector === '[data-layer="scanlines"]') return this.dataset.layer === 'scanlines';
      return this.tagName === selector.toUpperCase();
    },
    closest(selector) {
      const selectors = selector.split(',').map(value => value.trim());
      for (let current = this; current; current = current.parentElement) {
        if (selectors.some(value => current.matches(value))) return current;
      }
      return null;
    },
    contains(child) { for (let current = child; current; current = current.parentElement) if (current === this) return true; return false; },
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    getBoundingClientRect() { return { left: 0, top: 0, x: 0, y: 0, width: this.clientWidth, height: this.clientHeight, right: this.clientWidth, bottom: this.clientHeight }; },
  });
  element.style.setProperty = (key, value) => { element.style[key] = String(value); };
  element.classList = {
    add(...values) { element.className = [...new Set([...element.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
    remove(...values) { element.className = element.className.split(/\s+/).filter(value => !values.includes(value)).join(' '); },
    contains(value) { return element.className.split(/\s+/).includes(value); },
    toggle(value, force) { const on = force ?? !this.contains(value); this[on ? 'add' : 'remove'](value); return on; },
  };
  if (tag === 'canvas') {
    element.width = 300; element.height = 150;
    element.context = fakeContext(element);
    element.getContext = kind => kind === '2d' ? element.context : null;
  }
  return element;
}

class Matrix {
  constructor(text = '') {
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    const translate = text.match(/translate3d\(([-.\d]+)px, ([-.\d]+)px, 0\)/);
    const scale = text.match(/scale\(([-.\d]+), ([-.\d]+)\)/);
    if (translate) { this.e = +translate[1]; this.f = +translate[2]; }
    if (scale) { this.a = +scale[1]; this.d = +scale[2]; }
  }
}

function page(options = {}) {
  let now = 0, sequence = 0;
  const frames = new Map(), storage = options.storage || new Map(), created = [], loads = [], intersections = [];
  if ((options.mode || options.ambient !== undefined) && !storage.has(storageKey)) storage.set(storageKey, JSON.stringify({ mode: options.mode || 'distortion', ...(options.ambient !== undefined ? {ambientEnabled: options.ambient} : {}) }));
  const body = node('body');
  const hero = node('section', 'hero'); hero.heroLayout = { width: options.width || 1920, height: options.height || 960 };
  hero.clientWidth = hero.heroLayout.width; hero.clientHeight = hero.heroLayout.height;
  const decoration = node('div', 'hero__decoration-scale');
  const about = node('div', 'about-backdrop');
  const scene = node('div', 'hero__scene'); scene.style.width = `${hero.clientWidth}px`; scene.style.height = `${hero.clientHeight}px`;
  const scanlines = node('img', 'scene-layer'); scanlines.dataset.layer = 'scanlines';
  const dark = node('img', 'about-backdrop__lines');
  const light = node('img', 'about-backdrop__light-lines');
  for (const [image, width, height] of [[scanlines, 1929.78, 1654.79], [dark, 2569.78, 1654.79], [light, 2569.78, 1654.79]]) {
    image.naturalWidth = width; image.naturalHeight = height; image.width = width; image.height = height; image.complete = true;
    image.src = `./assets/images/${image === scanlines ? 'scanlines.svg' : image === dark ? 'about-lines-black-2k.svg' : 'about-lines-light-2k.svg'}`;
    image.currentSrc = image.src;
    image.style.transform = 'translate3d(-4.39px, -347.395px, 0) scale(1, 1)';
  }
  decoration.append(scanlines); about.append(dark, light); scene.append(decoration); hero.append(about, scene); body.append(hero);
  const works = options.withWorks ? node('section', 'works-viewport') : null;
  if (works) {
    works.rect = {left: 0, top: 1600, x: 0, y: 1600, width: 1920, height: 960, right: 1920, bottom: 2560};
    works.getBoundingClientRect = () => works.rect;
    body.append(works);
  }
  const motion = events({ matches: !!options.reduced });
  const document = events({
    hidden: !!options.hidden, visibilityState: options.hidden ? 'hidden' : 'visible',
    body, documentElement: node('html'),
    querySelector: selector => body.querySelector(selector),
    createElement(tag) { const element = node(tag); created.push(element); return element; },
  });
  const window = events({
    devicePixelRatio: options.dpr || 1, innerWidth: 1920, innerHeight: 960, scrollY: 0,
    matchMedia: () => motion,
    localStorage: {
      getItem(key) { if (options.blockStorage) throw new Error('Unavailable'); return storage.get(key) ?? null; },
      setItem(key, value) { if (options.blockStorage) throw new Error('Unavailable'); storage.set(key, String(value)); },
    },
  });
  const warpCalls = { measure: 0, reset: 0, destroy: 0, renders: [] };
  if (!options.missingWarp && !options.realWarp) window.BackgroundLineWarp = {
    measure() { warpCalls.measure++; }, reset() { warpCalls.reset++; }, destroy() { warpCalls.destroy++; },
    render(state) { warpCalls.renders.push(plain(state)); return true; },
  };
  const context = vm.createContext({
    window, document, DOMMatrix: Matrix, DOMMatrixReadOnly: Matrix, localStorage: window.localStorage,
    Element: class { static [Symbol.hasInstance](value) { return !!value?.tagName; } },
    Image: class {
      constructor() {
        const image = events({ complete: false, naturalWidth: 0, naturalHeight: 0 });
        Object.defineProperty(image, 'src', {
          get: () => image.source || '',
          set(value) {
            image.source = value;
            loads.push(() => {
              if (options.failImages || !value.startsWith('data:image/svg+xml;base64,')) {
                image.onerror?.(new Error('Expected an origin-clean SVG mask'));
                image.emit('error'); return;
              }
              const text = Buffer.from(value.split(',')[1], 'base64').toString('utf8');
              image.naturalWidth = Number(text.match(/\bwidth="([\d.]+)"/)[1]);
              image.naturalHeight = Number(text.match(/\bheight="([\d.]+)"/)[1]);
              image.complete = true;
              image.onload?.(); image.emit('load');
            });
          },
        });
        return image;
      }
    },
    matchMedia: window.matchMedia, performance: { now: () => now },
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } },
    getComputedStyle: element => ({ transform: element.style.transform || 'none', width: `${element.width || 1920}px`, height: `${element.height || 960}px` }),
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} },
    IntersectionObserver: class { constructor(callback) { this.callback = callback; intersections.push(this); } observe() {} disconnect() {} },
  });
  if (options.taintedMask) {
    const createElement = document.createElement;
    document.createElement = tag => {
      const element = createElement(tag);
      if (tag === 'canvas') element.context.getImageData = () => {
        const error = new Error('The canvas has been tainted by cross-origin data.');
        error.name = 'SecurityError'; throw error;
      };
      return element;
    };
  }
  const source = fs.readFileSync(path.join(root, 'background-lines.js'), 'utf8');
  const bundlePath = path.join(root, 'assets/images/line-masks.js');
  if (!options.missingMasks && fs.existsSync(bundlePath)) vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), context, { filename: 'line-masks.js' });
  if (options.realWarp) vm.runInContext(fs.readFileSync(path.join(root, 'background-line-warp.js'), 'utf8'), context, { filename: 'background-line-warp.js' });
  const load = () => vm.runInContext(source, context, { filename: 'background-lines.js' });
  load();
  return {
    window, document, motion, hero, decoration, about, scene, scanlines, dark, light, storage, frames, created, load, warpCalls, works,
    api: () => window.BackgroundLineEffect,
    advance(milliseconds, step = 16) {
      for (const callback of loads.splice(0)) callback();
      const end = now + milliseconds;
      while (now < end) {
        now = Math.min(end, now + step);
        const pending = [...frames.values()]; frames.clear();
        for (const callback of pending) callback(now);
      }
    },
    input(type, patch = {}) {
      window.emit(type, { target: hero, clientX: 350, clientY: 400, pointerType: 'mouse', pointerId: 1, button: 0, isPrimary: true, ...patch });
    },
    hide(value) { document.hidden = value; document.visibilityState = value ? 'hidden' : 'visible'; document.emit('visibilitychange'); },
    reduce(value) { motion.matches = value; motion.emit('change'); },
    intersect(target, value) { for (const observer of intersections) observer.callback([{target, isIntersecting: value}]); },
  };
}

const test = page({ mode: 'light' });
assert(test.api(), 'The effect initializes only over the existing line artwork');
assert.deepEqual(plain(test.api().getDefaults()), { enabled: true, mode: 'distortion', hoverStrength: .35, rippleStrength: .4, radius: 150, ambientEnabled: true, ambientDirection: 'up', ambientStrength: .3, ambientSpeed: .35 });
assert.equal(test.decoration.children.filter(child => child.tagName === 'CANVAS').length, 1);
assert.equal(test.about.children.filter(child => child.tagName === 'CANVAS').length, 1);
const canvases = test.created.filter(child => child.dataset.backgroundLines);
assert.equal(canvases.length, 2, 'Only two visible overlays are allocated');
assert(canvases.every(canvas => canvas.getAttribute('aria-hidden') === 'true'));
test.advance(32);
assert.equal(test.frames.size, 0, 'The initial empty frame settles without a permanent RAF loop');
assert(canvases.every(canvas => canvas.dataset.state === 'idle'));
const buffers = test.created.filter(child => child.tagName === 'CANVAS' && !child.dataset.backgroundLines);
assert.equal(buffers.length, 4, 'Three cached line masks and one blended mask are reused');
for (const [index, alpha] of [[0, .64], [1, .64], [2, .54]]) {
  const imageDraw = buffers[index].context.calls.find(call => call[0] === 'drawImage');
  assert(imageDraw, 'Each existing source has a cached line mask');
  assert(imageDraw[1].src.startsWith('data:image/svg+xml;base64,'), 'The mask uses an origin-clean SVG data URL, including standalone file mode');
  assert(buffers[index].context.calls.some(call => call[0] === 'set' && call[1] === 'globalAlpha' && call[2] === alpha), 'The cached white mask retains the tuned line alpha');
  const transform = buffers[index].context.calls.find(call => call[0] === 'setTransform' && call.length === 7 && call[5] !== 0);
  assert(transform, 'Line masks reuse the transformed SVG geometry');
  assert.equal(transform[5], -4.39, 'The existing SVG horizontal offset is preserved');
  assert.equal(transform[6], -347.395, 'The existing SVG vertical phase is preserved');
}
const readbacks = () => buffers.reduce((sum, canvas) => sum + canvas.context.calls.filter(call => call[0] === 'readback').length, 0);
assert.equal(readbacks(), 0, 'Mask preparation does not rely on getImageData');

test.api().setSettings({ enabled: false, hoverStrength: 3, rippleStrength: -.5, radius: 10000 });
assert.deepEqual(plain(test.api().getSettings()), { enabled: false, mode: 'light', hoverStrength: 1, rippleStrength: 0, radius: 320, ambientEnabled: true, ambientDirection: 'up', ambientStrength: .3, ambientSpeed: .35 });
assert.deepEqual(JSON.parse(test.storage.get(storageKey)), plain(test.api().getSettings()));
assert.equal(test.frames.size, 0, 'Disabling stops scheduled frames immediately');
assert(canvases.every(canvas => canvas.dataset.state === 'off'));
test.api().setSettings({ enabled: 'yes', hoverStrength: NaN, rippleStrength: Infinity, radius: '100' });
assert.equal(test.api().getSettings().enabled, false, 'Wrong types do not silently change settings');
assert.equal(test.api().getSettings().radius, 320);
test.api().resetSettings();
test.advance(32);
assert.deepEqual(plain(test.api().getSettings()), plain(test.api().getDefaults()));
test.api().setSettings({ mode: 'light' }); test.advance(32);

test.input('pointermove'); test.advance(2000);
assert(canvases.every(canvas => canvas.dataset.state === 'hover'));
assert.equal(test.frames.size, 0, 'A stationary hover paints once then sleeps');
const heroContext = canvases.find(canvas => canvas.dataset.backgroundLines === 'hero').context;
assert(heroContext.calls.some(call => call[0] === 'radial'), 'Hover uses a soft radial field');
assert(heroContext.calls.some(call => call[0] === 'set' && call[1] === 'globalCompositeOperation' && call[2] === 'destination-in'), 'The light is clipped to a cached line mask');
assert.equal(readbacks(), 0, 'Building and re-enabling masks need no pixel readback');
const cachedReads = readbacks();

test.input('pointerdown'); test.input('pointerup'); test.advance(16);
assert(canvases.every(canvas => canvas.dataset.ripples === '1'));
test.advance(4200);
assert(canvases.every(canvas => canvas.dataset.ripples === '0'));
assert.equal(test.frames.size, 0, 'Completed click wave releases its animation loop');
assert.equal(readbacks(), cachedReads, 'Animation frames never rebuild or read back mask pixels');
for (let i = 0; i < 20; i++) { test.input('pointerdown'); test.input('pointerup'); }
test.advance(16);
assert(canvases.every(canvas => canvas.dataset.ripples === '6'), 'The preserved lighting mode keeps its bounded six-wave budget');
test.advance(4200);

const button = node('button'); test.hero.append(button);
test.input('pointerdown', { target: button }); test.input('pointerup', { target: button }); test.advance(1500);
assert(canvases.every(canvas => canvas.dataset.ripples === '0'), 'Navigation/control clicks do not emit background waves');
for (const tag of ['a', 'input', 'select', 'textarea', 'summary']) {
  const control = node(tag); test.hero.append(control);
  test.input('pointerdown', { target: control }); test.input('pointerup', { target: control }); test.advance(16);
  assert(canvases.every(canvas => canvas.dataset.ripples === '0'), `${tag} is excluded`);
}
test.input('pointermove', { target: button }); test.advance(4000);
assert(canvases.every(canvas => canvas.dataset.state === 'idle'), 'Entering controls fades the prior hover and releases RAF');

test.input('pointerdown', { pointerType: 'touch' });
test.input('pointerup', { pointerType: 'touch' }); test.advance(16);
assert(canvases.every(canvas => canvas.dataset.ripples === '1'), 'A short tap emits a wave');
test.advance(4200);
test.input('pointerdown', { pointerType: 'touch' });
test.input('pointerup', { pointerType: 'touch', clientY: 450 }); test.advance(16);
assert(canvases.every(canvas => canvas.dataset.ripples === '0'), 'A moved finger is not treated as a tap');
test.input('pointerdown', { pointerType: 'touch' });
test.input('pointermove', { pointerType: 'touch', clientY: 450 });
test.input('pointermove', { pointerType: 'touch', clientY: 400 });
test.input('pointerup', { pointerType: 'touch', clientY: 400 }); test.advance(16);
assert(canvases.every(canvas => canvas.dataset.ripples === '0'), 'An out-and-back finger gesture remains canceled even when it ends at the starting point');
test.api().setSettings({ hoverStrength: 0 }); test.advance(32);
test.input('pointerdown', { pointerType: 'touch' });
test.input('pointermove', { pointerType: 'touch', clientY: 450 });
test.input('pointerup', { pointerType: 'touch', clientY: 400 }); test.advance(16);
assert(canvases.every(canvas => canvas.dataset.ripples === '0'), 'Gesture cancellation also works when cursor hover is disabled');
test.api().resetSettings(); test.api().setSettings({ mode: 'light' }); test.advance(32);
test.input('pointerdown', { pointerType: 'touch' }); test.window.scrollY = 20; test.window.emit('scroll');
test.input('pointerup', { pointerType: 'touch' }); test.advance(16);
assert(canvases.every(canvas => canvas.dataset.ripples === '0'), 'Native touch scroll suppresses the pending tap');
test.input('pointerdown', { pointerType: 'touch' }); test.input('pointercancel', { pointerType: 'touch' });
test.input('pointerup', { pointerType: 'touch' }); test.advance(16);
assert(canvases.every(canvas => canvas.dataset.ripples === '0'), 'Canceled touch input cannot leave a pending wave');
test.input('pointerdown'); test.input('pointerup', { pointerId: 9 }); test.advance(16);
assert(canvases.every(canvas => canvas.dataset.ripples === '0'), 'A different pointer cannot complete the gesture');

test.input('pointermove'); test.advance(16); test.hide(true);
assert.equal(test.frames.size, 0, 'Hidden document clears RAF and effects immediately');
assert(canvases.every(canvas => canvas.dataset.ripples === '0'));
test.input('pointerdown'); test.input('pointerup');
assert.equal(test.frames.size, 0, 'Hidden pages do not wake on input');
test.hide(false); test.advance(32);
test.reduce(true); test.advance(32);
test.input('pointerdown'); test.input('pointerup'); test.advance(32);
assert(canvases.every(canvas => canvas.dataset.ripples === '0'), 'Reduced motion keeps click waves static/off');
test.input('pointermove'); test.advance(32);
assert.equal(test.frames.size, 0, 'Reduced-motion hover is immediate and settles');
test.reduce(false); test.advance(32);

for (const [type, entries] of test.window.listeners) {
  if (/^(pointer|scroll)/.test(type)) assert(entries.every(entry => entry.options?.passive), `${type} never intercepts native input`);
}
const initialChildren = test.created.length; test.load();
assert.equal(test.created.length, initialChildren, 'Initialization is idempotent');
test.api().setSettings({ enabled: false });
const persisted = page({ storage: test.storage });
assert.equal(persisted.api().getSettings().enabled, false, 'The effect toggle survives reload');
assert.equal(persisted.frames.size, 0, 'A saved disabled state allocates no animation frames');
persisted.api().destroy();
test.api().destroy();
assert.equal(test.window.BackgroundLineEffect, undefined);
assert.equal(test.frames.size, 0);
assert(canvases.every(canvas => !canvas.parentElement), 'Destroy removes decorative overlays');
assert([...test.window.listeners.values()].every(entries => entries.length === 0), 'Destroy removes all global listeners');

const large = page({ mode: 'light', width: 7680, height: 4320, dpr: 3 });
large.advance(32);
for (const canvas of large.created.filter(child => child.tagName === 'CANVAS')) {
  assert(canvas.width * canvas.height <= 2.8e6 + canvas.width + canvas.height, 'Every backing buffer stays within the 2.8MP budget plus integer rounding');
  assert(canvas.width / 7680 <= 1.25 && canvas.height / 4320 <= 1.25, 'Backing scale never exceeds 1.25 DPR');
}
large.api().destroy();
const blocked = page({ mode: 'light', blockStorage: true });
blocked.api().setSettings({ enabled: false });
assert.equal(blocked.api().getSettings().enabled, false, 'Unavailable storage preserves session controls');
blocked.api().destroy();

const distortion = page({ambient: false});
assert.equal(distortion.api().getSettings().mode, 'distortion', 'The newly requested deformation is the default');
distortion.advance(32);
assert(distortion.warpCalls.measure > 0, 'The actual controller measures its deformation backend');
assert(distortion.warpCalls.renders.length > 0, 'The default mode invokes the deformation backend');
assert(distortion.created.filter(canvas => canvas.tagName === 'CANVAS').every(canvas => canvas.width === 1 && canvas.height === 1), 'Deformation mode releases the unused lighting backing buffers');
distortion.input('pointermove'); distortion.advance(2000);
assert.equal(distortion.warpCalls.renders.at(-1).power, 1, 'The eased pointer strength reaches the deformation renderer');
assert.deepEqual(distortion.warpCalls.renders.at(-1).spot, {x: 350, y: 400});
assert(distortion.created.every(canvas => !canvas.context?.calls.some(call => call[0] === 'radial')), 'Deformation does not add the discarded glow painting');
assert.equal(distortion.frames.size, 0, 'A stationary deformation also sleeps');
distortion.api().updateScene({x: 20, y: 30, width: 500, height: 200, decorationOpacity: .5, lightProgress: .9}); distortion.advance(16);
assert.equal(distortion.warpCalls.renders.at(-1).scene.x, 20);
assert.equal(distortion.warpCalls.renders.at(-1).scene.lightProgress, .9, 'The renderer receives the same theme transition as the original lines');
distortion.input('pointerdown'); distortion.input('pointerup'); distortion.advance(16);
assert.equal(distortion.warpCalls.renders.at(-1).ripples.length, 1, 'Click waves feed the deformation field');
for (let i = 0; i < 12; i++) { distortion.input('pointerdown'); distortion.input('pointerup'); }
distortion.advance(16);
assert.equal(distortion.warpCalls.renders.at(-1).ripples.length, 4, 'The raised deformation pulse has its own bounded four-pulse budget');
distortion.advance(4200);
assert.equal(distortion.warpCalls.renders.at(-1).ripples.length, 0, 'Deformation waves expire with the same bounded input lifecycle');
const beforeReduceReset = distortion.warpCalls.reset;
distortion.reduce(true); distortion.advance(32);
assert(distortion.warpCalls.reset > beforeReduceReset, 'Reduced-motion changes restore the original geometry before repainting');
assert.equal(distortion.warpCalls.renders.at(-1).reducedMotion, true, 'The backend receives the reduced-motion constraint');
distortion.reduce(false); distortion.advance(32);
const beforeDisableReset = distortion.warpCalls.reset;
distortion.api().setSettings({enabled: false});
assert(distortion.warpCalls.reset > beforeDisableReset, 'Disabling restores the original line geometry immediately');
const stoppedCount = distortion.warpCalls.renders.length;
distortion.input('pointermove'); distortion.advance(1000);
assert.equal(distortion.warpCalls.renders.length, stoppedCount, 'A disabled deformation is not rendered');
distortion.api().setSettings({enabled: true, mode: 'light'}); distortion.advance(32);
assert.equal(distortion.warpCalls.renders.length, stoppedCount, 'Selecting lighting stops deformation rendering');
distortion.api().setSettings({mode: 'distortion'}); distortion.advance(32);
assert(distortion.warpCalls.renders.length > stoppedCount, 'The deformation can be selected again without reloading');
distortion.api().setSettings({mode: 'unknown'});
assert.equal(distortion.api().getSettings().mode, 'distortion', 'Unknown modes cannot become live settings');
distortion.api().destroy();
assert.equal(distortion.warpCalls.destroy, 1, 'Destroy tears down the geometry renderer once');

const drifting = page(); drifting.advance(2000);
assert.equal(drifting.api().getSettings().ambientEnabled, true, 'Gentle background motion is enabled by default');
assert.equal(drifting.frames.size, 1, 'Ambient motion owns a single continuous animation chain');
assert(drifting.warpCalls.renders.length >= 45 && drifting.warpCalls.renders.length <= 65, 'Pure ambient motion paints at about thirty frames per second');
let phase = drifting.warpCalls.renders.at(-1).ambient;
assert(phase.y < -39 && phase.y > -44 && phase.x === 0, 'Default drift travels upward at the selected CSS-pixel speed');
for (const [direction, dx, dy] of [['right', 21, 0], ['down', 0, 21], ['left', -21, 0]]) {
  drifting.api().setSettings({ambientDirection: direction});
  const before = drifting.warpCalls.renders.at(-1).ambient;
  drifting.advance(1000); const after = drifting.warpCalls.renders.at(-1).ambient;
  assert(Math.abs(after.x - before.x - dx) < 1.5 && Math.abs(after.y - before.y - dy) < 1.5, 'Each direction moves the same smooth phase without a reset');
}
phase = drifting.warpCalls.renders.at(-1).ambient;
drifting.hide(true); drifting.advance(60000);
assert.equal(drifting.frames.size, 0, 'Ambient motion pauses in a hidden tab');
drifting.hide(false); drifting.advance(48);
const resumed = drifting.warpCalls.renders.at(-1).ambient;
assert(Math.hypot(resumed.x - phase.x, resumed.y - phase.y) < 2, 'Returning to the tab does not fast-forward a minute of ambient motion');
drifting.api().setSettings({ambientEnabled: false}); drifting.advance(32);
assert.equal(drifting.frames.size, 0, 'Turning off ambient motion restores idle sleep');
drifting.api().setSettings({ambientEnabled: true, ambientStrength: 0}); drifting.advance(32);
assert.equal(drifting.frames.size, 0, 'Zero ambient strength does not consume a continuous RAF');
drifting.api().setSettings({ambientStrength: .3, mode: 'light'}); drifting.advance(32);
assert.equal(drifting.frames.size, 0, 'The preserved lighting mode never runs the ambient deformation loop');
drifting.api().setSettings({mode: 'distortion'}); drifting.advance(48);
assert.equal(drifting.frames.size, 1);
drifting.reduce(true); drifting.advance(32);
assert.equal(drifting.frames.size, 0, 'Reduced motion disables autonomous background drift');
drifting.api().setSettings({ambientDirection: 'diagonal', ambientStrength: -1, ambientSpeed: 100});
assert.equal(drifting.api().getSettings().ambientDirection, 'left', 'Unsupported directions are ignored');
assert.equal(drifting.api().getSettings().ambientStrength, 0);
assert.equal(drifting.api().getSettings().ambientSpeed, 1);
drifting.api().setSettings({ambientSpeed: -.1}); assert.equal(drifting.api().getSettings().ambientSpeed, .05);
assert.deepEqual(JSON.parse(drifting.storage.get(storageKey)), plain(drifting.api().getSettings()), 'Ambient direction, strength, speed and toggle persist with the complete profile');
drifting.api().destroy();

const surfaces = page({withWorks: true}); surfaces.advance(64);
assert.equal(surfaces.warpCalls.renders.at(-1).scope, 'hero');
surfaces.works.rect = {...surfaces.works.rect, top: 0, y: 0, bottom: 960};
surfaces.window.scrollY = 1600; surfaces.window.emit('scroll'); surfaces.intersect(surfaces.works, true); surfaces.advance(64);
assert.equal(surfaces.warpCalls.renders.at(-1).scope, 'works', 'Native scrolling into works moves autonomous motion to that viewport without a pointer event');
assert.equal(surfaces.warpCalls.renders.at(-1).height, 960);
surfaces.works.rect = {...surfaces.works.rect, top: 1600, y: 1600, bottom: 2560};
surfaces.window.scrollY = 0; surfaces.window.emit('scroll'); surfaces.intersect(surfaces.hero, true); surfaces.advance(64);
assert.equal(surfaces.warpCalls.renders.at(-1).scope, 'hero', 'Scrolling back restores autonomous motion to hero/about without moving the cursor');
surfaces.api().destroy();

const oldBackgroundStorage = new Map([[storageKey, JSON.stringify({enabled: false, hoverStrength: 0, rippleStrength: 0, radius: 300})]]);
const migrated = page({storage: oldBackgroundStorage});
assert.deepEqual(plain(migrated.api().getSettings()), plain(migrated.api().getDefaults()), 'Old experiment storage without a mode starts fresh with deformation');
assert.deepEqual(JSON.parse(oldBackgroundStorage.get(storageKey)), plain(migrated.api().getDefaults()), 'The one-time background-only migration is persisted');
migrated.api().destroy();

const integrated = page({realWarp: true});
integrated.advance(32); integrated.input('pointermove'); integrated.advance(96);
const integratedHero = integrated.created.find(canvas => canvas.dataset.lineWarp === 'hero');
assert(integratedHero && !integratedHero.hidden, 'Real pointer input reaches the real deformation renderer');
assert(Number(integratedHero.dataset.bentRows) > 0, 'The complete input/controller/backend path changes actual line geometry');
assert.equal(integrated.scanlines.style.visibility, 'hidden', 'The successful replacement hides the original SVG');
integrated.api().setSettings({enabled: false});
assert.equal(integratedHero.hidden, true, 'Turning off the real controller hides its deformed replacement');
assert.notEqual(integrated.scanlines.style.visibility, 'hidden', 'Turning off the real controller restores the source artwork');
integrated.api().destroy();

const standalone = page({ mode: 'light', taintedMask: true });
standalone.advance(32); standalone.input('pointermove'); standalone.advance(2000);
for (const canvas of standalone.created.filter(child => child.dataset.backgroundLines)) {
  assert(canvas.context.calls.some(call => call[0] === 'radial'), 'Hover still paints when canvas readback is unavailable');
  assert(canvas.context.calls.some(call => call[0] === 'drawImage'), 'The mask remains usable without external-file readback');
}
standalone.api().destroy();
for (const unavailable of [page({ mode: 'light', missingMasks: true }), page({ mode: 'light', failImages: true })]) {
  unavailable.advance(32); unavailable.input('pointermove'); unavailable.advance(2000);
  for (const canvas of unavailable.created.filter(child => child.dataset.backgroundLines)) {
    assert.equal(canvas.dataset.maskReady, 'false', 'A missing or failed source exposes its readiness');
    assert.equal(canvas.dataset.state, 'unavailable', 'Unavailable artwork never falsely reports an active/hovering effect');
    assert(!canvas.context.calls.some(call => call[0] === 'radial'), 'The failed-artwork path does not paint an unmasked light patch');
  }
  assert.equal(unavailable.frames.size, 0, 'Failed artwork does not spin a retry loop');
  unavailable.api().destroy();
}

const maskBundle = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/images/line-masks.js'), 'utf8'), { window: maskBundle });
const entries = maskBundle.BackgroundLineMasks;
assert(entries, 'The portable mask bundle exposes its data URL entries');
for (const [key, file] of Object.entries({ base: 'scanlines.svg', wide: 'scanlines-2k.svg', dark: 'about-lines-black-2k.svg', light: 'about-lines-light-2k.svg' })) {
  const entry = entries[key];
  assert(entry?.src?.startsWith('data:image/svg+xml;base64,'), `${key}: image is embedded and has no external request`);
  const original = fs.readFileSync(path.join(root, 'assets/images', file), 'utf8');
  const svg = Buffer.from(entry.src.split(',')[1], 'base64').toString('utf8');
  const paths = text => [...text.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1]);
  const attr = (text, name) => text.match(new RegExp(`<svg\\b[^>]*\\b${name}="([^"]+)"`))[1];
  assert.deepEqual(paths(svg), paths(original), `${key}: every line path keeps its original geometry`);
  assert.equal(attr(svg, 'viewBox'), attr(original, 'viewBox'), `${key}: the viewBox and line phase are preserved`);
  assert.equal(Number(attr(svg, 'width')), entry.width);
  assert.equal(Number(attr(svg, 'height')), entry.height);
  assert.equal(attr(svg, 'width'), attr(original, 'width'));
  assert.equal(attr(svg, 'height'), attr(original, 'height'));
  assert(!/<(?:defs|filter|image|script)\b|\b(?:filter|href)\s*=/.test(svg), `${key}: no shadows, external dependencies, or scripts`);
  for (const match of svg.matchAll(/\b(?:opacity|fill-opacity)="([^"]+)"/g)) assert.equal(Number(match[1]), 1, `${key}: all explicit mask opacity is fully opaque`);
  assert.match(svg, /fill="(?:white|#fff(?:fff)?)"/, `${key}: the line mask paints pure white`);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(html.indexOf('line-masks.js') >= 0 && html.indexOf('line-masks.js') < html.indexOf('background-lines.js'), 'The embedded masks load before the controller in file and HTTP previews');

const css = fs.readFileSync(path.join(root, 'background-lines.css'), 'utf8');
assert.match(css, /pointer-events:\s*none/, 'The overlays never block existing interactive elements');
assert.match(css, /about-backdrop\s*>\s*\.background-lines/);
console.log('Background line checks passed: settings, native input, tap/scroll distinction, bounded waves, masking, lifecycle and idle RAF.');
module.exports = { page, plain, storageKey };
