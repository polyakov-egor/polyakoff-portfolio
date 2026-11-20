/* Exercise the real bootstrap against independently controlled network, decode,
   font and renderer barriers. Motion and timers cannot complete unfinished work. */
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
    const values = new Map(); this.style = { setProperty: (name, value) => values.set(name, String(value)), getPropertyValue: name => values.get(name) || '', removeProperty: name => values.delete(name) };
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
  const stage = make('div'), rotor = make('div'), status = make('p'), retry = make('button'), canvas = make('canvas');
  rotor.dataset.word = 'load'; rotor.dataset.nextWord = 'load';
  document.documentElement = html; document.body = body; document.activeElement = body; document.focuses = []; document.hidden = false;
  document.readyState = 'loading'; html.append(body); body.append(overlay, main); main.append(hero); overlay.append(stage, status, retry); stage.append(rotor);
  const register = (parent, selector, ...nodes) => parent.queries.set(selector, nodes);
  register(document, '[data-site-preloader]', overlay); register(document, 'body > main', main); register(document, '.hero', hero);
  for (const [name, node] of [['rotor', rotor], ['status', status], ['retry', retry]]) register(overlay, `[data-preloader-${name}]`, node);
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
  const loaderBackground = makeImage('/preloader/background.png');
  const loadWord = makeImage('/preloader/load.svg'), doneWord = makeImage('/preloader/done.svg');
  const backdrop = make('div'); body.append(backdrop); backdrop.append(background);
  register(document, '[data-site-backdrop]', backdrop); register(backdrop, '.about-backdrop__lines', background);
  hero.append(portrait, wordmark, icon, duplicate, light); overlay.append(loaderBackground); rotor.append(loadWord, doneWord);
  if (failedImage) portrait.naturalWidth = 0;
  register(overlay, 'img', loaderBackground, loadWord, doneWord);
  register(hero, '.hero__scene img, .redesign-hero-art img, .hero__welcome img, .hero__footer img, .hero__motion img', portrait, wordmark, icon, duplicate, light);
  const links = [make('link'), make('link')]; links.forEach((link, i) => { link.href = `/style-${i}.css`; link.sheet = {}; });
  if (failedCSS) links[1].sheet = null;
  const scripts = [make('script')]; scripts[0].src = '/hero-scroll.js';
  register(document, 'link[rel="stylesheet"]', ...links); register(document, 'script[src]', ...scripts);
  const fontLoads = [], fontsReady = deferred();
  document.fonts = { ready: fontsReady.promise, load(font, sample) { const gate = deferred(); fontLoads.push({ font, sample, ...gate }); return gate.promise; } };
  let ensureCalls = 0, reloads = 0, time = 0, timerId = 0, frameId = 0;
  const timers = new Map(), raf = new Map(), observers = [], scrolls = [], entered = [], animations = [];
  rotor.animate = (keyframes, timing) => {
    const task = deferred();
    const animation = {
      keyframes, timing, started: time, currentTime: 0, playState: 'running', finished: task.promise,
      pause() { if (this.playState === 'running') this.playState = 'paused'; },
      play() { if (this.playState === 'paused') this.playState = 'running'; },
      cancel() {
        if (this.playState === 'idle') return;
        this.playState = 'idle';
        task.reject(new DOMException('Animation cancelled', 'AbortError'));
      },
      finish() {
        if (this.playState === 'idle' || this.playState === 'finished') return;
        this.playState = 'finished';
        task.resolve(this);
      },
    };
    animations.push(animation);
    return animation;
  };
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
  window.performance = { now: () => time };
  const context = { window, document, MutationObserver, DOMException, performance: window.performance,
    requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame,
    CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, due: time + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(source, context, { filename: 'site-preloader.js' });
  const api = window.SitePreloader;
  function frame() { advance(1000 / 60); const jobs = [...raf.values()]; raf.clear(); jobs.forEach(callback => callback(time)); }
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
  return { api, window, document, html, main, hero, overlay, rotor, status, retry, canvas, portrait,
    wordmark, background, loaderBackground, loadWord, doneWord, duplicate, light, fontLoads, fontsReady, links, scripts, entered, scrolls, raf, timers, animations,
    mount, frames, advance, setDepth, fontsDone, finishResources,
    get reloads() { return reloads; }, get ensureCalls() { return ensureCalls; } };
}
async function reachReady(f) {
  await f.finishResources();
  await f.frames(1);
  assert.equal(f.api.getState().phase, 'loading', 'Readiness waits for both paints after assets settle');
  assert(f.api.getState().progress < 100);
  await f.frames(1);
  assert.equal(f.api.getState().phase, 'ready');
  assert.equal(f.api.getState().progress, 100);
  await f.api.whenReady;
}

async function finishDone(f) {
  assert.equal(f.rotor.dataset.nextWord, 'done', 'Final rotation brings DONE onto the front');
  const animation = f.animations.at(-1);
  assert.equal(animation.playState, 'running');
  animation.finish();
  await turn();
  assert.equal(f.api.getState().phase, 'done');
  assert.equal(f.rotor.dataset.word, 'done');
}

async function beginEntry(f) {
  assert.equal(f.api.getState().phase, 'done', 'DONE is visible before the hero reveal');
  f.advance(100);
  await turn();
  assert.equal(f.api.getState().phase, 'done', 'The completed loader holds on DONE');
  for (let i = 0; i < 40 && f.api.getState().phase === 'done'; i++) await f.frames(1);
  assert.equal(f.api.getState().phase, 'entering', 'The hero enters automatically without a click or key');
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
  assert.equal(f.rotor.dataset.word, 'load');
  assert.equal(f.api.getState().phase, 'loading');
  assert(f.api.getState().progress < 100);
  const partial = f.api.getState().progress;
  f.advance(1999); await turn();
  assert.equal(f.animations.length, 0, 'First LOAD stays centered for two seconds');
  f.advance(1); await turn();
  assert.equal(f.animations.length, 1, 'A slow load rolls LOAD after two seconds');
  const firstRoll = f.animations[0];
  assert.equal(firstRoll.playState, 'running');
  assert.equal(f.rotor.dataset.nextWord, 'load');
  assert.equal(f.api.getState().progress, partial, 'Decorative flips do not add progress');
  f.advance(600); firstRoll.finish(); await turn();
  f.advance(1399); await turn();
  assert.equal(f.animations.length, 1, 'Repeated flips keep a two-second cadence');
  f.advance(1); await turn();
  assert.equal(f.animations.length, 2);
  assert.equal(f.animations[1].started - firstRoll.started, 2000, 'Cadence is measured between LOAD starts');
  const runningLoad = f.animations[1];
  f.document.hidden = true; f.document.dispatch('visibilitychange');
  assert.equal(runningLoad.playState, 'paused', 'Hidden tabs pause in-flight animation');
  f.advance(30001); await turn();
  assert.equal(f.animations.length, 2, 'Hidden tabs do not start decorative rolls');
  assert.equal(f.api.getState().progress, partial, 'Elapsed time cannot invent loading progress');
  assert.equal(f.retry.hidden, false, 'A stalled load offers retry');
  f.document.hidden = false; f.document.dispatch('visibilitychange');
  assert.equal(runningLoad.playState, 'running', 'Returning to the tab resumes the interrupted roll');
  f.window.dispatch('keydown', { key: 'Enter' });
  f.portrait.decodeGate.resolve(); await turn();
  assert.equal(f.api.getState().phase, 'loading', 'Decoded image alone is insufficient');
  f.fontsDone(); await turn();
  assert.equal(f.api.getState().phase, 'loading', 'Fonts and images still wait for the rendered depth frame');
  await f.frames(4);
  assert(f.api.getState().progress < 100); assert.equal(f.raf.size, 0, 'Waiting on real resources does not poll in a RAF loop');
  f.setDepth('resizing'); await turn(); assert.equal(f.api.getState().phase, 'loading');
  await reachReady(f);
  assert.equal(f.animations.length, 2, 'A running LOAD roll finishes before DONE starts');
  assert.equal(f.rotor.dataset.nextWord, 'load');
  assert.equal(f.retry.hidden, true);
  f.window.dispatch('keydown', { key: 'Enter' });
  assert.equal(f.api.getState().phase, 'ready', 'Early keys cannot skip the final flip');
  runningLoad.finish(); await turn();
  assert.equal(f.animations.length, 3, 'DONE is the only roll started after readiness');
  await finishDone(f);
  assert.equal(f.ensureCalls, 0, 'The loader leaves later chapter downloads deferred');
  assert.equal(f.duplicate.decodeCalls, 0, 'Duplicate image URLs do not repeat decoding tasks');
  assert.equal(f.light.decodeCalls, 0, 'Invisible light-theme icon does not block first-screen entry');
  assert.equal(f.background.decodeCalls, 1, 'The fixed dark background remains a readiness barrier');
  assert.equal(f.loaderBackground.decodeCalls, 1, 'The loader decodes its own backdrop');
  assert.equal(f.loadWord.decodeCalls, 1, 'The supplied LOAD art is decoded');
  assert.equal(f.doneWord.decodeCalls, 1, 'The supplied DONE art is decoded before the final flip');
  assert(f.document.focuses.every(call => call.options?.preventScroll), 'Loader focus never scrolls the document');
  f.window.dispatch('keydown', { key: 'Enter' });
  await beginEntry(f);
  assert(f.main.inert && f.html.classList.contains('is-site-entering'));
  f.hero.dispatch('animationend', { animationName: 'unrelated-animation' });
  assert.equal(f.api.getState().phase, 'entering', 'Unrelated animations cannot unlock the page');
  f.hero.dispatch('animationend', { animationName: 'site-hero-enter' });
  assert.equal(f.api.getState().phase, 'entered'); assert(!f.api.isBlocking()); assert(!f.main.inert); assert(f.overlay.hidden);
  assert(!f.html.classList.contains('is-site-loading') && !f.html.classList.contains('is-site-entering'), 'Reveal classes clear on entry');
  assert.equal(f.entered.length, 1); assert.equal(f.document.activeElement, f.document.body);
  assert(!f.window.dispatch('wheel').prevented && !f.window.dispatch('touchmove').prevented);
  assert(!f.window.dispatch('keydown', { key: 'PageDown' }).prevented, 'Native scrolling keys resume after entry');
  f.window.dispatch('resize'); await turn(); assert.equal(f.api.getState().phase, 'entered');
  assert.equal(f.timers.size, 0, 'No timer remains after entry');
  assert.equal(f.raf.size, 0, 'No loader RAF remains after entry');

  const timeout = fixture(); timeout.mount(); await reachReady(timeout);
  await finishDone(timeout); await beginEntry(timeout);
  timeout.advance(1301); assert.equal(timeout.api.getState().phase, 'entered', 'A bounded timeout finishes if animationend is missing');
  timeout.hero.dispatch('animationend', { animationName: 'site-hero-enter' }); assert.equal(timeout.entered.length, 1);

  const slowFont = fixture({ depth: 'ready' }); slowFont.mount();
  slowFont.portrait.decodeGate.resolve(); slowFont.fontsReady.resolve();
  for (const font of slowFont.fontLoads.slice(0, -1)) font.resolve([{}]);
  await turn(); await slowFont.frames(4);
  assert.equal(slowFont.api.getState().phase, 'loading', 'One undecoded font alone keeps the loader active');
  assert(slowFont.api.getState().progress < 100);
  await reachReady(slowFont); await finishDone(slowFont);

  for (const during of ['ready', 'done']) {
    const resize = fixture(); resize.mount(); await reachReady(resize);
    if (during === 'done') await finishDone(resize);
    const oldDecodeCalls = resize.portrait.decodeCalls, oldFontCalls = resize.fontLoads.length;
    const oldFinalRoll = resize.animations.at(-1);
    resize.window.dispatch('resize'); await turn();
    assert.equal(resize.api.getState().phase, 'loading', `A resize during ${during} cancels pending entry and revalidates`);
    assert.equal(resize.rotor.dataset.word, 'load');
    assert.equal(resize.portrait.decodeCalls, oldDecodeCalls, 'Resize does not decode a stale picture candidate synchronously');
    assert.equal(resize.fontLoads.length, oldFontCalls, 'The new cycle waits for responsive picture selection');
    if (during === 'ready') assert.equal(oldFinalRoll.playState, 'idle', 'An unfinished DONE flip is cancelled');
    resize.portrait.currentSrc = resize.portrait.src = '/portrait-2456.webp';
    resize.portrait.complete = false;
    resize.portrait.decodeGate = deferred(); resize.setDepth('loading');
    await resize.frames(1);
    assert(resize.fontLoads.length > oldFontCalls, 'The deferred cycle tracks the new viewport resources');
    resize.advance(400); await turn();
    assert.equal(resize.api.getState().phase, 'loading', 'A stale DONE timer cannot unlock the revalidated screen');
    assert.equal(resize.entered.length, 0);
    resize.portrait.complete = true; resize.portrait.dispatch('load'); resize.portrait.decodeGate.resolve(); resize.fontsDone(); await turn();
    assert.equal(resize.api.getState().phase, 'loading', 'New image still waits for matching depth frame');
    await reachReady(resize); await finishDone(resize);
  }

  const hidden = fixture(); hidden.document.hidden = true; hidden.mount();
  await reachReady(hidden);
  assert.equal(hidden.animations.length, 0, 'A hidden tab does not play the final flip');
  hidden.document.hidden = false; hidden.document.dispatch('visibilitychange'); await turn();
  await finishDone(hidden);
  hidden.document.hidden = true; hidden.document.dispatch('visibilitychange');
  hidden.advance(1000); await turn();
  assert.equal(hidden.api.getState().phase, 'done', 'A hidden tab waits to finish its DONE hold');
  hidden.document.hidden = false; hidden.document.dispatch('visibilitychange'); await turn();
  await beginEntry(hidden);

  for (const options of [{ failedCSS: true }, { failedImage: true }]) {
    const failed = fixture(options); failed.mount(); await turn();
    assert.equal(failed.api.getState().phase, 'error'); assert.equal(failed.retry.hidden, false);
    assert(failed.api.getState().progress < 100);
    failed.advance(4000); await turn();
    assert.equal(failed.animations.length, 0, 'A failed resource stops animation');
    assert.equal(failed.raf.size, 0, 'A failed resource does not poll');
    failed.retry.dispatch('click'); assert.equal(failed.reloads, 1, 'Failure exposes a real reload retry');
  }
  const failedScript = fixture();
  failedScript.document.dispatch('error', { target: failedScript.scripts[0] });
  failedScript.mount(); await turn();
  assert.equal(failedScript.api.getState().phase, 'error', 'A captured first-screen script failure keeps the loader visible');

  const fallback = fixture({ depth: 'unsupported', reduced: true }); fallback.mount(); fallback.fontsDone(); await turn();
  fallback.advance(2000); await turn();
  assert.equal(fallback.animations.length, 0, 'Reduced motion skips decorative rolls');
  assert.equal(fallback.api.getState().phase, 'loading', 'Static depth fallback still waits for portrait decode');
  fallback.portrait.decodeGate.resolve(); await turn(); await fallback.frames(2);
  assert.equal(fallback.api.getState().phase, 'done'); assert.equal(fallback.rotor.dataset.word, 'done');
  assert.equal(fallback.animations.length, 0, 'Reduced motion switches directly to DONE');
  await beginEntry(fallback);
  fallback.advance(211); assert.equal(fallback.api.getState().phase, 'entered', 'Reduced motion enters with a short reveal');
  assert.equal(fallback.ensureCalls, 0);

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'site-preloader.css'), 'utf8');
  const bootstrap = html.search(/<script src="\.\/site-preloader\.js(?:\?[^" ]+)?"/);
  assert(bootstrap >= 0 && bootstrap < html.indexOf('rel="stylesheet"'), 'The blocking bootstrap claims first paint before deferred scenes');
  const section = html.match(/<section\b[^>]*data-site-preloader[\s\S]*?<\/section>/)?.[0] || '';
  assert(section.includes('data-preloader-rotor') && section.includes('data-preloader-retry'), 'Real loader markup contains the animated words and error retry');
  assert(!/data-preloader-(enter|label|progress)|site-preloader__ring/.test(section), 'Manual entry, percentage and ring are absent from the loader markup');
  assert(!/\.is-site-loading[^{}]*main\s*\{[^}]*display\s*:\s*none/.test(css), 'Hidden content retains real layout for the depth renderer');
  assert(/html\.is-site-entering\s+\.hero\s*\{/.test(css), 'Blur reveal targets the hero without filtering the fixed-position ancestor main');
  console.log('Preloader checks passed for LOAD cadence, real asset and paint barriers, DONE auto-entry, resize/retry, scroll lock, hidden tabs, reduced motion and retained lazy chapters.');
})().catch(error => { console.error(error); process.exitCode = 1; });
