/* Exercise the real bootstrap against independently controlled network, decode,
   font and renderer barriers. Timers cannot turn unfinished work into100%. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'site-preloader.js'), 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class Node {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.dataset = {}; this.attributes = {}; this.children = [];
    this.handlers = new Map(); this.queries = new Map(); this.hidden = false; this.disabled = false;
    this.inert = false; this.textContent = ''; this.ownerDocument = null;
    const values = new Map(); this.style = { setProperty: (name, value) => values.set(name, String(value)), getPropertyValue: name => values.get(name) || '' };
    const classes = new Set(); this.classList = { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) };
  }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentElement = this; } }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())];
  }
  addEventListener(type, callback, options = {}) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push({ callback, once: options?.once, capture: options === true || Boolean(options?.capture) });
  }
  removeEventListener(type, callback, options = {}) {
    const capture = options === true || Boolean(options?.capture);
    this.handlers.set(type, (this.handlers.get(type) || []).filter(item => item.callback !== callback || item.capture !== capture));
  }
  dispatch(type, properties = {}) {
    const event = { type, target: this, cancelable: true, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...properties };
    for (const item of [...(this.handlers.get(type) || [])]) {
      item.callback(event);
      if (item.once) this.removeEventListener(type, item.callback, item.capture);
      if (event.stopped) break;
    }
    return event;
  }
  dispatchEvent(event) { return this.dispatch(event.type, event); }
  querySelectorAll(selector) { return this.queries.get(selector) || []; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  focus(options) { this.ownerDocument.activeElement = this; this.ownerDocument.focuses.push({ element: this, options }); }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
}
function fixture({ depth = 'loading', failedCSS = false, failedImage = false, reduced = false } = {}) {
  const document = new Node('document'), window = new Node('window');
  const make = tag => { const node = new Node(tag); node.ownerDocument = document; return node; };
  const html = make('html'), body = make('body'), main = make('main'), hero = make('section'), overlay = make('section');
  const button = make('button'), label = make('span'), progress = make('div'), status = make('p'), retry = make('button'), canvas = make('canvas');
  document.documentElement = html; document.body = body; document.activeElement = body; document.focuses = []; document.hidden = false;
  document.readyState = 'loading'; html.append(body); body.append(overlay, main); main.append(hero); overlay.append(button, progress, status, retry); button.append(label);
  const register = (parent, selector, ...nodes) => parent.queries.set(selector, nodes);
  register(document, '[data-site-preloader]', overlay); register(document, 'body > main', main); register(document, '.hero', hero);
  for (const [name, node] of [['enter', button], ['label', label], ['progress', progress], ['status', status], ['retry', retry]]) register(overlay, `[data-preloader-${name}]`, node);
  hero.heroLayout = { width: 375, height: 812 }; hero.dataset.scrollProgress = '0.0000';
  canvas.dataset.state = depth; hero.append(canvas); register(hero, '[data-layer="depth"]', canvas);
  const makeImage = (url, slow = false) => {
    const image = make('img'); image.src = image.currentSrc = url; image.complete = true; image.naturalWidth = 1280;
    image.decodeCalls = 0; image.decodeGate = slow ? deferred() : null;
    image.decode = () => { image.decodeCalls++; return image.decodeGate?.promise || Promise.resolve(); };
    return image;
  };
  const portrait = makeImage('/portrait-1280.webp', true), wordmark = makeImage('/wordmark-mobile.png');
  const background = makeImage('/dark.webp'), icon = makeImage('/logo.svg'), duplicate = makeImage('/logo.svg');
  const light = makeImage('/logo-dark.svg'); light.classList.add('theme-icon__light');
  const ring = makeImage('/preloader/ring.svg');
  const backdrop = make('div'); body.append(backdrop); backdrop.append(background);
  register(document, '[data-site-backdrop]', backdrop); register(backdrop, '.about-backdrop__lines', background);
  hero.append(portrait, wordmark, icon, duplicate, light); overlay.append(ring);
  if (failedImage) portrait.naturalWidth = 0;
  register(overlay, 'img', ring);
  register(hero, '.hero__scene img, .hero__welcome img, .hero__footer img, .hero__motion img', portrait, wordmark, icon, duplicate, light);
  const links = [make('link'), make('link')]; links.forEach((link, i) => { link.href = `/style-${i}.css`; link.sheet = {}; });
  if (failedCSS) links[1].sheet = null;
  const scripts = [make('script')]; scripts[0].src = '/hero-scroll.js';
  register(document, 'link[rel="stylesheet"]', ...links); register(document, 'script[src]', ...scripts);
  const fontLoads = [], fontsReady = deferred();
  document.fonts = { ready: fontsReady.promise, load(font, sample) { const gate = deferred(); fontLoads.push({ font, sample, ...gate }); return gate.promise; } };
  let ensureCalls = 0, reloads = 0, time = 0, timerId = 0, frameId = 0;
  const timers = new Map(), raf = new Map(), observers = [], scrolls = [], entered = [];
  window.history = { scrollRestoration: 'auto' }; window.location = { reload() { reloads++; } };
  window.HeroDepthEffect = {}; window.HeroWelcomeStack = {}; window.HeroScrollEffect = {};
  window.ChapterAssets = { ensure() { ensureCalls++; throw Error('Next chapters must remain deferred'); } };
  window.scrollTo = options => scrolls.push(options);
  window.requestAnimationFrame = callback => { raf.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = id => raf.delete(id);
  window.matchMedia = () => ({ matches: reduced });
  window.addEventListener('site:entered', () => entered.push(true));
  Object.defineProperty(window, 'localStorage', { get() { throw Error('Preloader must not read or rewrite effect settings'); } });
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(node) { this.node = node; }
    disconnect() { this.node = null; }
  }
  const context = { window, document, MutationObserver,
    CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, due: time + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(source, context, { filename: 'site-preloader.js' });
  const api = window.SitePreloader;
  function frame() { time += 1000 / 60; const jobs = [...raf.values()]; raf.clear(); jobs.forEach(callback => callback(time)); }
  async function frames(count) { for (let i = 0; i < count; i++) { frame(); await turn(); } }
  function advance(milliseconds) {
    time += milliseconds;
    for (let loop = 0; loop < 8; loop++) {
      const due = [...timers].filter(([, timer]) => timer.due <= time);
      if (!due.length) return;
      for (const [id, timer] of due) { timers.delete(id); timer.callback(); }
    }
    assert.fail('Timer work must stay bounded');
  }
  function setDepth(value) { canvas.dataset.state = value; for (const observer of observers) if (observer.node === canvas) observer.callback([]); }
  function fontsDone() { for (const task of fontLoads) task.resolve([{}]); fontsReady.resolve(); }
  async function finishResources() { portrait.decodeGate?.resolve(); fontsDone(); setDepth('ready'); await turn(); }
  const mount = () => document.dispatch('DOMContentLoaded');
  return { api, window, document, html, main, hero, overlay, button, label, progress, status, retry, canvas, portrait,
    wordmark, background, ring, duplicate, light, fontLoads, fontsReady, links, scripts, entered, scrolls, raf, timers,
    mount, frames, advance, setDepth, fontsDone, finishResources,
    get reloads() { return reloads; }, get ensureCalls() { return ensureCalls; } };
}
async function complete(f) {
  for (let i = 0; i < 240 && (f.api.getState().phase !== 'complete' || f.api.getState().displayedProgress < 100); i++) await f.frames(1);
  assert.equal(f.api.getState().phase, 'complete', '100% is a genuine completed frame before ENTER');
  assert.equal(f.label.textContent, '100%'); assert(f.button.disabled);
}
async function ready(f) {
  await f.finishResources();
  await complete(f);
  await f.frames(2);
  assert.equal(f.api.getState().phase, 'ready'); assert.equal(f.label.textContent, 'ENTER'); assert(!f.button.disabled);
}

(async () => {
  const f = fixture();
  assert(f.api.isBlocking()); assert(f.html.classList.contains('is-site-loading'));
  assert.equal(f.window.history.scrollRestoration, 'manual');
  assert(f.window.dispatch('wheel').prevented, 'Wheel cannot move the page behind the loader');
  assert(f.window.dispatch('touchmove').prevented, 'Touch cannot skip the loader');
  assert(f.window.dispatch('keydown', { key: 'PageDown' }).prevented);
  assert(!f.window.dispatch('keydown', { key: 'r', ctrlKey: true }).prevented, 'Browser shortcuts remain available');
  f.mount(); await turn();
  assert(f.main.inert);
  assert.equal(f.api.getState().phase, 'loading'); assert(f.api.getState().progress < 100);
  const factual = f.api.getState().progress;
  assert.equal(f.api.getState().displayedProgress, 0, 'Settled resources change the target, never snap the visible ring');
  await f.frames(1);
  assert(f.api.getState().displayedProgress > 0 && f.api.getState().displayedProgress < factual, 'A real animation frame gives an intermediate progress value');
  let previousVisual = f.api.getState().displayedProgress;
  for (let i = 0; i < 140; i++) {
    await f.frames(1);
    const current = f.api.getState();
    assert(current.displayedProgress >= previousVisual && current.displayedProgress <= current.progress, 'Visible progress is monotonic and cannot exceed settled work');
    previousVisual = current.displayedProgress;
  }
  assert.equal(f.raf.size, 0, 'Progress stops rendering once it reaches the real loading target');
  assert(f.window.dispatch('keydown', { key: 'Enter' }).prevented);
  f.button.dispatch('click'); assert.equal(f.api.getState().phase, 'loading', 'An early Enter or click is never queued');
  const partial = f.api.getState().progress;
  f.advance(30001); await turn();
  assert.equal(f.api.getState().progress, partial, 'Elapsed time cannot invent loading progress');
  assert.equal(f.retry.hidden, false); assert.equal(f.api.getState().phase, 'loading');
  f.portrait.decodeGate.resolve(); await turn();
  assert.equal(f.api.getState().phase, 'loading', 'Decoded image alone cannot expose ENTER');
  f.fontsDone(); await turn();
  assert.equal(f.api.getState().phase, 'loading', 'Fonts and images still wait for the rendered depth frame');
  await f.frames(140);
  assert(f.api.getState().progress < 100); assert.equal(f.raf.size, 0, 'Waiting on real resources does not poll in a RAF loop');
  f.setDepth('resizing'); await turn(); assert.equal(f.api.getState().phase, 'loading');
  f.setDepth('ready'); await turn();
  await complete(f);
  assert.equal(f.label.textContent, '100%'); assert.equal(f.api.getState().phase, 'complete');
  f.window.dispatch('keydown', { key: 'Enter' });
  await f.frames(2);
  assert.equal(f.api.getState().phase, 'ready', 'An Enter during loading/100% never auto-enters later');
  await f.api.whenReady;
  assert.equal(f.ensureCalls, 0, 'The first-screen loader never forces later chapter downloads');
  assert.equal(f.duplicate.decodeCalls, 0, 'Duplicate URLs do not repeat decoding tasks');
  assert.equal(f.light.decodeCalls, 0, 'Invisible light-theme icon does not block first-screen entry');
  assert.equal(f.background.decodeCalls, 1, 'The body-level fixed dark background remains a real readiness barrier');
  assert(f.document.focuses.every(call => call.options?.preventScroll), 'Loader focus never scrolls the document');
  const enter = f.window.dispatch('keydown', { key: 'Enter' }); assert(enter.prevented);
  assert.equal(f.api.getState().phase, 'entering'); assert(f.main.inert);
  assert(f.html.classList.contains('is-site-entering'));
  f.hero.dispatch('animationend', { animationName: 'unrelated-animation' });
  assert.equal(f.api.getState().phase, 'entering', 'Unrelated animations cannot unlock the page');
  f.hero.dispatch('animationend', { animationName: 'site-hero-enter' });
  assert.equal(f.api.getState().phase, 'entered'); assert(!f.api.isBlocking()); assert(!f.main.inert); assert(f.overlay.hidden);
  assert(!f.html.classList.contains('is-site-loading') && !f.html.classList.contains('is-site-entering'), 'Reveal/filter classes are removed after entry');
  assert.equal(f.entered.length, 1); assert.equal(f.document.activeElement, f.document.body);
  assert(!f.window.dispatch('wheel').prevented && !f.window.dispatch('touchmove').prevented);
  assert(!f.window.dispatch('keydown', { key: 'PageDown' }).prevented, 'Native scrolling keys resume after entry');
  f.window.dispatch('resize'); await turn(); assert.equal(f.api.getState().phase, 'entered');
  assert.equal(f.timers.size, 0, 'No loader animation/slow timers remain after entry');
  assert.equal(f.raf.size, 0, 'No progress RAF survives entry');

  const click = fixture(); click.mount(); await ready(click);
  click.button.dispatch('click'); assert.equal(click.api.getState().phase, 'entering');
  click.advance(1301); assert.equal(click.api.getState().phase, 'entered', 'A bounded timeout finishes if animationend is missing');
  click.hero.dispatch('animationend', { animationName: 'site-hero-enter' }); assert.equal(click.entered.length, 1);

  const slowFont = fixture({ depth: 'ready' }); slowFont.mount();
  slowFont.portrait.decodeGate.resolve(); slowFont.fontsReady.resolve();
  for (const font of slowFont.fontLoads.slice(0, -1)) font.resolve([{}]);
  await turn(); await slowFont.frames(4);
  assert.equal(slowFont.api.getState().phase, 'loading', 'One undecoded font alone must keep ENTER unavailable');
  assert(slowFont.api.getState().progress < 100 && slowFont.button.disabled);
  slowFont.fontLoads.at(-1).resolve([{}]); await turn(); await complete(slowFont); await slowFont.frames(2);
  assert.equal(slowFont.api.getState().phase, 'ready');

  const resize = fixture(); resize.mount(); await ready(resize);
  const oldDecodeCalls = resize.portrait.decodeCalls, oldFontCalls = resize.fontLoads.length;
  resize.window.dispatch('resize'); await turn();
  assert.equal(resize.api.getState().phase, 'loading'); assert(resize.button.disabled);
  assert.equal(resize.portrait.decodeCalls, oldDecodeCalls, 'Resize disables entry immediately but does not decode a stale picture candidate synchronously');
  assert.equal(resize.fontLoads.length, oldFontCalls, 'The new readiness cycle begins on the scheduled frame');
  resize.button.dispatch('click'); assert.equal(resize.api.getState().phase, 'loading', 'A ready resize revalidates before accepting input');
  // Model native picture selection between resize dispatch and the next frame.
  // The still-valid old image must not be decoded during that unstable window.
  resize.portrait.currentSrc = resize.portrait.src = '/portrait-2456.webp'; resize.portrait.complete = false;
  resize.portrait.decodeGate = deferred(); resize.setDepth('loading');
  await resize.frames(1);
  assert(resize.fontLoads.length > oldFontCalls, 'The deferred cycle is now tracking the new viewport resources');
  resize.portrait.complete = true; resize.portrait.dispatch('load'); resize.portrait.decodeGate.resolve(); resize.fontsDone(); await turn();
  assert.equal(resize.api.getState().phase, 'loading', 'New responsive image still waits for its matching depth frame');
  resize.setDepth('ready'); await turn(); await complete(resize); await resize.frames(2); assert.equal(resize.api.getState().phase, 'ready');

  const hidden = fixture(); hidden.document.hidden = true; hidden.mount(); await hidden.finishResources();
  await hidden.frames(2);
  assert.equal(hidden.api.getState().phase, 'complete');
  assert.equal(hidden.api.getState().displayedProgress, 0, 'A background tab does not animate invisible progress');
  assert.equal(hidden.raf.size, 0, 'The progress loop sleeps while the document is hidden');
  hidden.document.hidden = false; hidden.document.dispatch('visibilitychange');
  await hidden.frames(1);
  assert(hidden.api.getState().displayedProgress > 0 && hidden.api.getState().displayedProgress < 100, 'Returning to the tab resumes smoothly instead of jumping by the hidden duration');
  await complete(hidden); await hidden.frames(2);
  assert.equal(hidden.api.getState().phase, 'ready'); assert.equal(hidden.raf.size, 0);

  for (const options of [{ failedCSS: true }, { failedImage: true }]) {
    const failed = fixture(options); failed.mount(); await turn();
    assert.equal(failed.api.getState().phase, 'error'); assert(failed.retry.hidden === false);
    assert(failed.api.getState().progress < 100); assert(failed.button.disabled);
    assert.equal(failed.raf.size, 0, 'A failed resource stops the visual progress animation');
    failed.button.dispatch('click'); assert.equal(failed.api.getState().phase, 'error');
    failed.retry.dispatch('click'); assert.equal(failed.reloads, 1, 'Failure exposes a real reload retry');
  }
  const failedScript = fixture();
  failedScript.document.dispatch('error', { target: failedScript.scripts[0] });
  failedScript.mount(); await turn();
  assert.equal(failedScript.api.getState().phase, 'error', 'A captured first-screen script load failure cannot produce a ready screen');
  const fallback = fixture({ depth: 'unsupported', reduced: true }); fallback.mount(); fallback.fontsDone(); await turn();
  assert.equal(fallback.api.getState().phase, 'loading', 'Static depth fallback cannot bypass portrait decode');
  fallback.portrait.decodeGate.resolve(); await turn(); await fallback.frames(4);
  assert.equal(fallback.api.getState().phase, 'ready'); fallback.button.dispatch('click');
  fallback.advance(211); assert.equal(fallback.api.getState().phase, 'entered', 'Reduced-motion fallback enters without a long blur wait');
  assert.equal(fallback.ensureCalls, 0);

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'site-preloader.css'), 'utf8');
  assert(html.indexOf('src="./site-preloader.js"') < html.indexOf('rel="stylesheet"'), 'The blocking bootstrap claims first paint before deferred scenes');
  assert(!/\.is-site-loading[^{}]*main\s*\{[^}]*display\s*:\s*none/.test(css), 'Hidden content retains real layout for the depth renderer');
  assert(/html\.is-site-entering\s+\.hero\s*\{/.test(css), 'Blur reveal targets the hero, never its fixed-position ancestor main');
  console.log('Preloader checks passed: smooth bounded progress and sleeping RAF, real decode/font/depth barriers, no timer progress or queued Enter, genuine100% frame, click/key entry and cleanup, failure/retry, responsive revalidation, hidden/reduced fallback and retained lazy chapters.');
})().catch(error => { console.error(error); process.exitCode = 1; });
