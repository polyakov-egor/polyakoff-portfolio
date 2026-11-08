const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const files = Object.fromEntries(['hero-layout.js', 'squircle.js', 'about-copy.js', 'hero-scroll.js'].map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
const turn = () => new Promise(resolve => setImmediate(resolve));
const near = (actual, expected, label) => assert(Math.abs(actual - expected) < .001, `${label}: ${actual} != ${expected}`);
const scrollStorageKey = 'ff.hero.scroll.settings.v1';
const depthStorageKey = 'ff.hero.depth.settings.v1';
const tuneDefaults = {startOffset: 0, wordForce: 1, letterForce: 1, fadeBoundary: 1, fadeSoftness: .12 / .205, fadeShape: 'distance', fadeOrigin: 'screen', detach: .14, rotation: 1, triggerMode: 'portrait', triggerGapPx: 100};
const tuneKeys = Object.keys(tuneDefaults);
const scrollTuneDefaults = {...Object.fromEntries(tuneKeys.map(key => [`about${key[0].toUpperCase()}${key.slice(1)}`, tuneDefaults[key]])), aboutFadeGuide: false};
const themeDefaults = {aboutBackgroundStart: .32, aboutBackgroundDuration: .45};
const fullProfile = profile => ({...scrollTuneDefaults, ...themeDefaults, heroScrollDuration: 1, aboutScrollDuration: 1, inspirationCardDurationMs: 800, aboutFillFeather: .7, musicActivity: 1.35, aboutRevealMode: 'gradient', aboutRevealScrollDuration: 1.8, ...profile});

function element(className = '', dataset = {}) {
  const listeners = new Map(), values = new Map(), classes = new Set(className.split(' ').filter(Boolean));
  const node = {
    className, dataset: {...dataset}, children: [], attributes: {},
    style: {values, setProperty(name, value) {values.set(name, String(value));}},
    classList: {add: name => classes.add(name), contains: name => classes.has(name), toggle(name, on) {if (on) classes.add(name); else classes.delete(name);}},
    setAttribute(name, value) {this.attributes[name] = String(value);},
    removeAttribute(name) {delete this.attributes[name];},
    append(child) {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
      child.parent = this;
      this.children.push(child);
    },
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;},
    querySelectorAll(selector) {
      const matches = candidate => selector === '[id]' ? !!candidate.attributes.id : candidate.className.split(' ').includes(selector.slice(1));
      const found = [];
      for (const child of this.children) {if (matches(child)) found.push(child); found.push(...child.querySelectorAll(selector));}
      return found;
    },
    cloneNode(deep) {
      const copy = element(this.className, this.dataset);
      copy.attributes = {...this.attributes};
      copy.textContent = this.textContent;
      if (deep) this.children.forEach(child => copy.append(child.cloneNode(true)));
      return copy;
    },
    addEventListener(name, callback) {if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback);},
    dispatchEvent(event) {for (const callback of listeners.get(event.type) || []) callback(event); return true;},
  };
  return node;
}

function makePage(width = 1920, height = 960, initialScroll = 0, storage = new Map(), flightEnabled = false, options = {}) {
  const nodes = Object.fromEntries([
    '.hero', '.hero-journey', '.hero__scene', '.hero__scenery', '.hero__intro', '.hero__intro-frame',
    '.hero__wordmark-frame', '.hero__wordmark-scale', '.hero__decoration-scale',
    '.hero__welcome', '.hero__about-logo', '.hero__datetime', '.hero__footer', '.about-copy', '.about-backdrop__lines', '.custom-cursor',
  ].map(selector => [selector, element(selector.slice(1))]));
  const hero = nodes['.hero'], journey = nodes['.hero-journey'], copy = nodes['.about-copy'];
  let layoutAllowed = true;
  const readLayout = () => assert(layoutAllowed, 'Scroll frames must use cached geometry rather than reading DOM layout');
  hero.append(nodes['.hero__scene']);
  hero.append(nodes['.hero__intro-frame']);
  nodes['.hero__intro-frame'].append(nodes['.hero__intro']);
  for (const selector of ['.hero__datetime', '.hero__footer', '.hero__welcome', '.hero__about-logo']) hero.append(nodes[selector]);
  const layers = ['wordmark', 'scanlines', 'portrait', 'depth'].map(name => element('scene-layer', {layer: name}));
  layers.forEach(layer => {nodes[`[data-layer="${layer.dataset.layer}"]`] = layer;});
  nodes['.hero__scene'].append(nodes['.hero__scenery']);
  nodes['.hero__scenery'].append(nodes['.hero__wordmark-frame']);
  nodes['.hero__wordmark-frame'].append(nodes['.hero__wordmark-scale']);
  nodes['.hero__wordmark-scale'].append(nodes['[data-layer="wordmark"]']);
  nodes['.hero__scenery'].append(nodes['.hero__decoration-scale']);
  nodes['.hero__decoration-scale'].append(nodes['[data-layer="scanlines"]']);
  nodes['.hero__scene'].append(nodes['[data-layer="portrait"]']);
  nodes['.hero__scene'].append(nodes['[data-layer="depth"]']);
  const content = element('about-copy__content');
  content.setAttribute('id', 'copy-content');
  const heading = element('visually-hidden');
  heading.setAttribute('id', 'about-title');
  heading.textContent = 'About me';
  content.append(heading);
  copy.append(content);
  Object.defineProperty(content, 'offsetHeight', {get: () => {readLayout(); return parseFloat(copy.style.values.get('--about-font-size') || 40) * 1.2 * 10;}});
  const document = {querySelector: selector => nodes[selector] || null, querySelectorAll: selector => selector === '[data-layer]' ? layers : [], createElement: () => element(), documentElement: element('html'), fonts: {ready: Promise.resolve()}};
  const window = element('window');
  window.scrollY = initialScroll;
  const storageWrites = [], scrollSettingsEvents = [], depthSettingsCalls = [];
  window.localStorage = {
    getItem(key) {return storage.has(key) ? storage.get(key) : null;},
    setItem(key, value) {storage.set(key, String(value)); storageWrites.push({key, value: String(value)});},
  };
  const depthDefaults = {strength: 1.4, smoothingMs: 240, depthAmount: 1, lighting: .2, enabled: true};
  const depthSettings = {...depthDefaults};
  try {Object.assign(depthSettings, JSON.parse(window.localStorage.getItem(depthStorageKey)));} catch {}
  const setDepthSettings = patch => {
    depthSettingsCalls.push({...patch});
    Object.assign(depthSettings, patch);
    window.localStorage.setItem(depthStorageKey, JSON.stringify(depthSettings));
    window.dispatchEvent({type: 'hero-depth:settings', detail: {...depthSettings}});
    return {...depthSettings};
  };
  window.HeroDepthEffect = {
    setScrollGate(value) {gates.push(value);},
    getSettings: () => ({...depthSettings}),
    setSettings: setDepthSettings,
    resetSettings: () => setDepthSettings(depthDefaults),
  };
  const flightMeasures = [], flightUpdates = [], flightConfigurations = [];
  if (flightEnabled) {
    const tuning = {...tuneDefaults, variant: 'second'};
    let cached = {start: 0, end: 0, span: 1}, measuredHeight = 0, anchor = null;
    const metrics = () => {
      if (tuning.variant === 'second' && tuning.triggerMode === 'portrait' && anchor && Number.isFinite(anchor.bottom)) {
        const rawStart = anchor.textY - anchor.bottom - tuning.triggerGapPx;
        const start = Math.max(0, rawStart);
        const span = 1305 * .38 * anchor.lineHeight / 67.2;
        return {start, span, rawStart, end: Math.max(0, rawStart + anchor.rowDelta) + span, activeTriggerMode: 'portrait', triggerY: anchor.bottom + tuning.triggerGapPx, lineHeight: anchor.lineHeight};
      }
      const start = tuning.variant === 'first' ? cached.start : Math.max(0, cached.start + tuning.startOffset * measuredHeight);
      return {...cached, start, end: cached.end + start - cached.start, activeTriggerMode: 'viewport', triggerY: null, lineHeight: anchor?.lineHeight};
    };
    window.AboutTextFlight = {
      configure(options = {}) {Object.assign(tuning, options); flightConfigurations.push({...options}); return {...metrics(), ...tuning};},
      getMetrics: metrics,
      getState: () => ({...metrics(), ...tuning}),
      measure(layout) {
        for (const key of [...tuneKeys, 'variant']) if (layout[key] !== undefined) tuning[key] = layout[key];
        const fontSize = parseFloat(copy.style.values.get('--about-font-size'));
        const contentHeight = content.offsetHeight;
        const start = Math.max(0, layout.textY + contentHeight - layout.height * .97);
        const span = layout.height * .38;
        anchor = {textY: layout.textY, bottom: layout.portraitBottom, lineHeight: fontSize * 1.2, rowDelta: contentHeight - fontSize * 1.2};
        cached = {start, end: start + anchor.rowDelta + span, span};
        measuredHeight = layout.height;
        const measuredMetrics = metrics();
        const masks = [0, 5].map(index => parseFloat(copy.style.values.get(`--about-mask-${index}`)));
        flightMeasures.push({layout: {...layout}, fontSize, contentHeight, metrics: measuredMetrics, masks});
        return {...measuredMetrics};
      },
      update(after, options = {}) {flightUpdates.push({after, ...options});},
    };
  }
  window.addEventListener('hero-scroll:settings', event => scrollSettingsEvents.push({...event.detail}));
  let storyTop = 120;
  hero.getBoundingClientRect = () => {readLayout(); return {left: 0, top: 0, width, height};};
  journey.getBoundingClientRect = () => {readLayout(); return {top: storyTop - window.scrollY};};
  const reduced = element();
  reduced.matches = false;
  const observers = [], raf = new Map(), gates = [];
  let nextFrame = 0, time = 0;
  const context = vm.createContext({
    document, window, matchMedia: () => reduced,
    requestAnimationFrame(callback) {const id = ++nextFrame; raf.set(id, callback); return id;},
    cancelAnimationFrame(id) {raf.delete(id);},
    ResizeObserver: class {constructor(callback) {this.callback = callback; observers.push(this);} observe(target) {this.target = target;}},
    CustomEvent: class {constructor(type, options = {}) {this.type = type; this.detail = options.detail;}},
  });
  for (const filename of ['hero-layout.js', 'squircle.js', 'about-copy.js', 'hero-scroll.js']) {
    if (filename === 'hero-scroll.js') options.beforeScroll?.({window, document, nodes, context, element});
    vm.runInContext(files[filename], context, {filename});
  }
  const page = {
    nodes, hero, copy, content, layers, window, document, context, raf, gates, reduced,
    storage, storageWrites, scrollSettingsEvents, depthSettingsCalls, flightMeasures, flightUpdates, flightConfigurations,
    layout(enabled) {layoutAllowed = enabled;},
    scroll(distance) {window.scrollY = storyTop + distance; window.dispatchEvent({type: 'scroll'});},
    resize(nextWidth, nextHeight) {width = nextWidth; height = nextHeight; observers.forEach(observer => observer.callback([]));},
    frame(step = 1000 / 60) {
      time += step;
      const pending = [...raf.values()];
      raf.clear();
      for (const callback of pending) callback(time);
      return pending.length;
    },
    frames(step = 1000 / 60) {
      const samples = [];
      for (let count = 0; raf.size && count < 180; count++) {
        page.frame(step);
        samples.push({position: page.position(), progress: Number(hero.dataset.scrollProgress), card: page.card()});
      }
      assert.equal(raf.size, 0, 'The damped hero/about timeline must settle within 180 frames without idle RAF');
      assert.equal(page.frame(step), 0, 'A settled timeline must not schedule more animation frames');
      return samples;
    },
    position() {return [parseFloat(nodes['.hero__scene'].style.width), parseFloat(nodes['.hero__scene'].style.height)];},
    card() {
      const {width, height, transform, clipPath} = nodes['.hero__scene'].style;
      return {width, height, transform, clipPath};
    },
    shade() {return Number(nodes['.hero__scene'].style.backgroundColor.match(/\d+/)[0]);},
    wordmarkBlur() {
      const filter = nodes['.hero__wordmark-frame'].style.filter;
      if (filter === 'none') return 0;
      const match = /^blur\(([\d.]+)px\)$/.exec(filter || '');
      assert(match && Number.isFinite(Number(match[1])), `The wordmark filter must be a finite CSS blur: ${filter}`);
      return Number(match[1]);
    },
    visibleWordmarkBlur() {return page.wordmarkBlur();},
    gate() {return gates.at(-1);},
  };
  return page;
}

// Existing coordinate regressions intentionally exercise both original 1:1
// physical/virtual scales. The generic makePage above retains real defaults.
function makeUnitDurationPage(...args) {
  const storage = args[3] || new Map();
  let profile = {};
  const raw = storage.get(scrollStorageKey);
  if (raw !== undefined) {
    try {
      profile = JSON.parse(raw);
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return makePage(...args);
    } catch {return makePage(...args);}
  }
  storage.set(scrollStorageKey, JSON.stringify({...profile, heroScrollDuration: 1, aboutScrollDuration: 1}));
  args[3] = storage;
  return makePage(...args);
}
function resetUnitDuration(api) {
  api.resetSettings();
  return api.setSettings({heroScrollDuration: 1, aboutScrollDuration: 1});
}

module.exports = {makePage, makeUnitDurationPage, turn, near, scrollStorageKey, depthStorageKey};

if (require.main === module) (async () => {
  const page = makeUnitDurationPage();
  await turn();
  assert.equal(page.hero.dataset.scrollProgress, '0.0000');
  assert.deepEqual(page.position(), [1920, 960]);
  assert.equal(page.nodes['.hero__scene'].style.clipPath, 'none');
  assert.equal(page.gate(), 1);
  assert.equal(page.copy.attributes['aria-hidden'], 'true');
  near(page.window.HeroScrollEffect.getSettings().whiteAt, .22, 'White background uses the default early endpoint');
  near(page.window.HeroScrollEffect.getSettings().wordmarkBlur, 24, 'Additional wordmark blur defaults to 24 viewport pixels');
  assert.equal(page.window.HeroScrollEffect.getSettings().wordmarkFade, false, 'The default exit keeps wordmark opacity and adds blur only');
  near(page.window.HeroScrollEffect.getSettings().aboutTopBlur, 10, 'Top glyph blur defaults to 10 viewport pixels');
  assert.equal(page.window.HeroScrollEffect.getSettings().aboutFlightVariant, 'second', 'The word-first flight is the default');
  near(page.window.HeroScrollEffect.getSettings().aboutFadeSpeed, 1, 'Sequential glyph fade uses its default speed');
  assert.equal(page.nodes['.hero__wordmark-frame'].style.filter, 'none', 'The opening hero preserves its original wordmark rendering');
  assert.equal(page.nodes['[data-layer="wordmark"]'].style.filter, undefined, 'The image keeps its own original filter state');
  near(Number(page.nodes['.hero__welcome'].style.values.get('--welcome-opacity')), 1, 'Welcome starts visible');
  assert.equal(page.nodes['.hero__welcome'].style.opacity, undefined, 'Welcome fades its painted layers through the CSS variable, not ancestor opacity');
  const initialPortrait = page.nodes['[data-layer="portrait"]'].style.transform;
  const planes = page.copy.children;
  assert.equal(planes.length, 1, 'About copy has one gradient-masked semantic plane');
  assert.equal(planes.filter(plane => plane.attributes['aria-hidden'] === 'true').length, 0);
  assert.equal(page.copy.querySelectorAll('[id]').filter(node => node.attributes.id === 'about-title').length, 1, 'Only the semantic original keeps the heading id');
  vm.runInContext(files['about-copy.js'], page.context);
  assert.equal(page.copy.children.length, 1, 'Copy setup is idempotent');

  let lastArea = Infinity;
  for (const progress of [0, .1, .25, .5, .75, 1]) {
    const before = page.position();
    page.scroll(960 * progress);
    assert.deepEqual(page.position(), before, 'Native scroll requests do not jump the visual composition synchronously');
    if (progress === .1) {
      page.frame();
      const firstProgress = Number(page.hero.dataset.scrollProgress);
      assert(firstProgress > 0 && firstProgress < progress, 'The first visual frame eases toward the requested scroll distance');
      assert(firstProgress < .012, 'The 180 ms hero response starts gently without a visible initial jump');
      assert.equal(page.hero.dataset.scrollTarget, '0.1000');
      assert.equal(page.raf.size, 1, 'Damping keeps one frame queued while the visual distance is unsettled');
    }
    const samples = page.frames();
    let previousArea = before[0] * before[1];
    for (const sample of samples) {
      const area = sample.position[0] * sample.position[1];
      assert(area <= previousArea + .001, 'Each forward animation frame shrinks monotonically');
      assert(sample.progress <= progress + .0001, 'Damping must not overshoot its requested progress');
      previousArea = area;
    }
    const [w, h] = page.position();
    assert(w >= 200 && w <= 1920 && h >= 200 && h <= 960, 'Morph remains within viewport and target card bounds');
    assert(w * h <= lastArea, 'Forward scrolling consistently shrinks the portrait frame');
    lastArea = w * h;
    assert(Number.isFinite(page.gate()) && page.gate() >= 0 && page.gate() <= 1);
    assert(!page.nodes['.hero__scene'].style.clipPath.includes('NaN'));
  }
  assert.deepEqual(page.position(), [200, 200]);
  near(page.gate(), 0, 'Depth and light are neutral at the finished card');
  assert.equal(page.copy.attributes['aria-hidden'], 'false');
  assert.equal(page.hero.dataset.aboutActive, 'true');
  near(parseFloat(page.copy.style.values.get('--about-text-y')), 540, 'About copy reaches its design anchor after one viewport of scroll');
  near(Number(page.nodes['.hero__welcome'].style.values.get('--welcome-opacity')), 0, 'Welcome painted layers finish fading');
  assert.equal(page.nodes['[data-layer="portrait"]'].style.transform, page.nodes['[data-layer="depth"]'].style.transform, 'Poster and WebGL remain aligned');
  const endpointY = page.copy.style.values.get('--about-text-y');
  const endpointCard = page.card();
  page.scroll(960 + 250);
  for (const sample of page.frames()) assert.deepEqual(sample.card, endpointCard, 'The finished card stays pinned during each additional forward frame');
  near(parseFloat(endpointY) - parseFloat(page.copy.style.values.get('--about-text-y')), 250, 'Additional scrolling carries the text through the stationary blur mask');
  assert.equal(page.gate(), 0);
  assert.deepEqual(page.card(), endpointCard, 'Additional text scrolling never moves or resizes the finished portrait');
  const textAfterForward = parseFloat(page.copy.style.values.get('--about-text-y'));
  page.scroll(960 + 80);
  for (const sample of page.frames()) assert.deepEqual(sample.card, endpointCard, 'The finished card stays pinned while reversing the text');
  near(parseFloat(page.copy.style.values.get('--about-text-y')) - textAfterForward, 170, 'Reversing after the endpoint moves only the text back down');
  page.scroll(960);
  page.frames();
  assert.deepEqual(page.card(), endpointCard, 'Returning to the morph endpoint keeps the card at its original about anchor');
  near(parseFloat(page.copy.style.values.get('--about-text-y')), 540, 'Reverse text scroll returns to the about anchor');
  page.scroll(0);
  page.frames();
  assert.deepEqual(page.position(), [1920, 960]);
  assert.equal(page.nodes['[data-layer="portrait"]'].style.transform, initialPortrait, 'Reverse scrolling restores the clean original portrait rectangle');
  assert.equal(page.gate(), 1);
  assert.equal(page.copy.attributes['aria-hidden'], 'true');
  assert.equal(page.hero.dataset.aboutActive, 'false');
  assert.equal(page.nodes['.hero__wordmark-frame'].style.filter, 'none', 'Reversing to the opening hero clears only the added wordmark blur');

  page.scroll(960);
  page.frames();
  page.resize(375, 812);
  page.frames();
  assert.deepEqual(page.position(), [160, 160], 'Resizing while already in about uses the mobile target');
  assert.equal(page.gate(), 0);
  page.scroll(812);
  page.frames();
  near(parseFloat(page.copy.style.values.get('--about-text-y')), 450, 'Mobile endpoint uses the updated Figma design anchor');
  const layoutBefore = JSON.stringify(page.hero.heroLayout);
  page.window.dispatchEvent({type: 'pageshow'});
  assert.equal(JSON.stringify(page.hero.heroLayout), layoutBefore);
  near(parseFloat(page.copy.style.values.get('--about-text-y')), 450, 'Restored pages keep their current scroll composition');
  const masks = Array.from({length: 6}, (_, index) => parseFloat(page.copy.style.values.get(`--about-mask-${index}`)));
  assert(masks.every((value, index) => value > 0 && value < 100 && (!index || value > masks[index - 1])), 'Blur masks remain ordered viewport percentages');
  page.scroll(0);
  page.frames();
  assert.deepEqual(page.position(), [375, 812]);

  page.reduced.matches = true;
  page.reduced.dispatchEvent({type: 'change'});
  page.frames();
  page.scroll(812 * .25);
  page.frames();
  assert.deepEqual(page.position(), [375, 812], 'Reduced motion keeps the initial composition before the discrete switch');
  page.scroll(812 * .75);
  page.frames();
  assert.deepEqual(page.position(), [160, 160], 'Reduced motion switches directly to the card without intermediate sizes');
  page.reduced.matches = false;
  page.reduced.dispatchEvent({type: 'change'});
  page.frames();
  assert(page.position()[0] > 160 && page.position()[0] < 375, 'Returning to full motion recomputes the same scroll position');

  const restored = makeUnitDurationPage(1440, 800, 120 + 800);
  await turn();
  assert.equal(restored.hero.dataset.scrollProgress, '1.0000', 'Initial history-restored scroll can start directly in about');
  assert.deepEqual(restored.position(), [180, 180]);
  assert.equal(restored.gate(), 0);
  const coalesced = makeUnitDurationPage();
  await turn();
  coalesced.scroll(100);
  coalesced.scroll(200);
  coalesced.scroll(300);
  assert.equal(coalesced.raf.size, 1, 'Multiple scroll events coalesce into one frame');
  coalesced.frames();
  coalesced.scroll(400);
  assert.equal(coalesced.raf.size, 1);
  coalesced.resize(1440, 800);
  assert.equal(coalesced.raf.size, 0, 'Resize measure cancels the queued scroll frame');
  near(Number(coalesced.hero.dataset.scrollProgress), .5, 'Resize snaps the visual distance to the current scroll request');
  assert.deepEqual(coalesced.position().map(Number.isFinite), [true, true]);
  coalesced.scroll(500);
  assert.equal(coalesced.raf.size, 1, 'Scroll after resize queues only one fresh frame');
  coalesced.window.dispatchEvent({type: 'pageshow'});
  assert.equal(coalesced.raf.size, 0, 'Pageshow measure cancels the queued scroll frame');
  near(Number(coalesced.hero.dataset.scrollProgress), .625, 'Pageshow restores current scroll without animating stale distance');
  coalesced.frames();

  const reversed = makeUnitDurationPage();
  await turn();
  reversed.scroll(960 * .8);
  reversed.frame();
  reversed.frame();
  const reversalProgress = Number(reversed.hero.dataset.scrollProgress);
  const reversalArea = reversed.position().reduce((w, h) => w * h);
  assert(reversalProgress > .1 && reversalProgress < .8, 'Direction changes are exercised before reaching the endpoint');
  reversed.scroll(960 * .1);
  reversed.frame();
  assert(Number(reversed.hero.dataset.scrollProgress) < reversalProgress, 'A reversal responds on the next visual frame');
  let previousArea = reversalArea;
  for (const sample of reversed.frames()) {
    const area = sample.position[0] * sample.position[1];
    assert(area + .001 >= previousArea, 'Reversing before the endpoint grows the portrait frame monotonically');
    assert(sample.progress >= .1 - .0001 && sample.progress <= reversalProgress + .0001, 'Reverse damping cannot overshoot either bound');
    previousArea = area;
  }
  near(Number(reversed.hero.dataset.scrollProgress), .1, 'Reverse settles at the new target');

  const lowRate = makeUnitDurationPage(), highRate = makeUnitDurationPage();
  await turn();
  for (const candidate of [lowRate, highRate]) {
    candidate.scroll(960 * .7);
    candidate.frame(16.67);
  }
  for (let count = 0; count < 12; count++) lowRate.frame(1000 / 30);
  for (let count = 0; count < 48; count++) highRate.frame(1000 / 120);
  near(Number(lowRate.hero.dataset.scrollProgress), Number(highRate.hero.dataset.scrollProgress), 'Equal elapsed time produces the same visual progress at 30 and 120 fps');
  lowRate.position().forEach((value, axis) => near(value, highRate.position()[axis], `Frame-rate independent portrait axis ${axis}`));
  lowRate.frames(1000 / 30);
  highRate.frames(1000 / 120);

  for (const [width, height] of [[1440, 800], [375, 812], [2560, 1305]]) {
    const anchored = makeUnitDurationPage(width, height);
    await turn();
    anchored.scroll(height);
    anchored.frames();
    const card = anchored.card(), textY = parseFloat(anchored.copy.style.values.get('--about-text-y'));
    anchored.scroll(height + 80);
    for (const sample of anchored.frames()) assert.deepEqual(sample.card, card, `${width}: about card remains pinned while the text rises`);
    near(parseFloat(anchored.copy.style.values.get('--about-text-y')), textY - 80, `${width}: additional text scroll remains active`);
    anchored.scroll(height + 20);
    for (const sample of anchored.frames()) assert.deepEqual(sample.card, card, `${width}: reversing the text does not release the card`);
    near(parseFloat(anchored.copy.style.values.get('--about-text-y')), textY - 20, `${width}: reversed text follows its scroll distance`);
  }

  const colorPage = makeUnitDurationPage();
  await turn();
  const ramp = [];
  for (let step = 0; step <= 10; step++) {
    colorPage.scroll(960 * .22 * step / 10);
    colorPage.frames();
    ramp.push(colorPage.shade());
  }
  assert.equal(ramp[0], 0, 'The initial hero background stays black');
  assert(ramp[1] > 0 && ramp[1] <= 3, 'Color starts gently during the first 10% of the full white interval');
  assert.equal(ramp[5], 111, 'The middle of the interval reaches the middle gray');
  assert(ramp[9] < 222 && ramp[9] >= 219, 'The ramp eases toward its final color before the endpoint');
  assert.equal(ramp[10], 222, 'The default white endpoint remains at 22% progress');
  const rampSteps = ramp.slice(1).map((shade, index) => shade - ramp[index]);
  assert(rampSteps.every(step => step >= 0), 'Color rises monotonically throughout the full white interval');
  assert(Math.max(...rampSteps) <= 45, 'The middle color steps remain moderate instead of concentrating the change in a narrow late band');
  assert(rampSteps[0] <= 3 && rampSteps.at(-1) <= 3, 'Both ends have gentle color steps');
  assert(rampSteps[0] < rampSteps[4] / 8 && rampSteps.at(-1) < rampSteps[4] / 8, 'Beginning and ending slopes are softer than the middle');
  colorPage.scroll(960 * .3);
  colorPage.frames();
  assert.equal(colorPage.shade(), 222, 'The final color stays stable after the default white endpoint');
  const geometryBeforeSettings = colorPage.card();
  const api = colorPage.window.HeroScrollEffect;
  near(api.setSettings({whiteAt: .8}).whiteAt, .8, 'The white endpoint can move later through the public settings API');
  assert.deepEqual(colorPage.scrollSettingsEvents.at(-1), fullProfile({whiteAt: .8, wordmarkBlur: 24, wordmarkFade: false, aboutTopBlur: 10, aboutFlightVariant: 'second', aboutFadeSpeed: 1}), 'Settings listeners receive every effective scroll setting');
  colorPage.frames();
  assert(colorPage.shade() > 0 && colorPage.shade() < 111, 'Moving the endpoint later live spreads the color ramp from its beginning instead of keeping an initial black plateau');
  assert.deepEqual(colorPage.card(), geometryBeforeSettings, 'White timing changes do not affect portrait geometry');
  for (const [progress, expectedShade] of [[.08, 2], [.4, 111], [.72, 220], [.8, 222]]) {
    colorPage.scroll(960 * progress);
    colorPage.frames();
    assert.equal(colorPage.shade(), expectedShade, `The later endpoint spreads the same gentle ramp over its full 0..80% interval at p=${progress}`);
  }
  colorPage.scroll(960 * .4);
  colorPage.frames();
  assert.equal(colorPage.shade(), 111, 'The later ramp is still partway through at the current scroll position');
  const afterSliderCard = colorPage.card();
  api.setSettings({whiteAt: .22});
  colorPage.frames();
  assert.equal(colorPage.shade(), 222, 'Moving the endpoint earlier updates the color without another scroll');
  assert.deepEqual(colorPage.card(), afterSliderCard, 'An early timing update also leaves card placement unchanged');

  near(api.setSettings({whiteAt: -20}).whiteAt, .05, 'The lower endpoint is clamped to 5%');
  near(api.setSettings({whiteAt: 20}).whiteAt, .9, 'The upper endpoint is clamped to 90%');
  for (const patch of [undefined, null, {}, {whiteAt: '0.4'}, {whiteAt: true}, {whiteAt: NaN}, {whiteAt: Infinity}, {whiteAt: -Infinity}, {unrelated: .4}]) {
    near(api.setSettings(patch).whiteAt, .9, 'Invalid endpoint patches leave the effective setting unchanged');
  }
  const mutableCopy = api.getSettings();
  mutableCopy.whiteAt = .1;
  mutableCopy.wordmarkBlur = 200;
  mutableCopy.wordmarkFade = true;
  mutableCopy.aboutTopBlur = 40;
  near(api.getSettings().whiteAt, .9, 'Settings snapshots cannot mutate the live endpoint');
  near(api.getSettings().wordmarkBlur, 24, 'Settings snapshots cannot mutate the live blur strength');
  assert.equal(api.getSettings().wordmarkFade, false, 'Settings snapshots cannot mutate the live fade toggle');
  near(api.getSettings().aboutTopBlur, 10, 'Settings snapshots cannot mutate the live top glyph blur');
  near(resetUnitDuration(api).whiteAt, .22, 'Reset restores the default endpoint');
  near(api.getSettings().wordmarkBlur, 24, 'Reset restores the default blur strength');
  assert.equal(api.getSettings().wordmarkFade, false, 'Reset restores the blur-only default');
  near(api.getSettings().aboutTopBlur, 10, 'Reset restores default top glyph blur');
  colorPage.frames();
  assert.equal(JSON.parse(colorPage.storage.get(scrollStorageKey)).whiteAt, .22, 'Reset is persisted');

  const storage = new Map([[depthStorageKey, JSON.stringify({strength: 2.2, smoothingMs: 400, depthAmount: .8, lighting: .4, enabled: true})]]);
  const persisted = makeUnitDurationPage(1920, 960, 0, storage);
  await turn();
  const originalDepth = persisted.window.HeroDepthEffect.getSettings();
  const storedDepth = storage.get(depthStorageKey);
  persisted.window.HeroScrollEffect.setSettings({whiteAt: .61, wordmarkBlur: 137.5, wordmarkFade: true, aboutTopBlur: 27.25});
  persisted.frames();
  assert.deepEqual(persisted.window.HeroDepthEffect.getSettings(), originalDepth, 'Scroll settings leave depth parameters untouched');
  assert.equal(persisted.depthSettingsCalls.length, 0, 'Changing white timing never calls the depth settings API');
  assert.equal(storage.get(depthStorageKey), storedDepth, 'Scroll settings never overwrite depth persistence');
  assert(persisted.storageWrites.every(write => [scrollStorageKey, 'ff.hero.scroll.gradient-default.v1'].includes(write.key)), 'The scroll controller writes only its settings and default-migration keys');
  persisted.window.HeroDepthEffect.setSettings({strength: 3.1});
  near(persisted.window.HeroScrollEffect.getSettings().whiteAt, .61, 'Depth settings leave the scroll endpoint untouched');
  near(persisted.window.HeroScrollEffect.getSettings().wordmarkBlur, 137.5, 'Depth settings leave the wordmark blur untouched');
  assert.equal(persisted.window.HeroScrollEffect.getSettings().wordmarkFade, true, 'Depth settings leave the wordmark fade untouched');
  near(persisted.window.HeroScrollEffect.getSettings().aboutTopBlur, 27.25, 'Depth settings leave top glyph blur untouched');
  assert.equal(JSON.parse(storage.get(scrollStorageKey)).whiteAt, .61, 'Depth persistence never overwrites scroll persistence');
  assert.equal(JSON.parse(storage.get(scrollStorageKey)).wordmarkBlur, 137.5, 'Blur persists alongside white timing in the scroll settings key');
  assert.equal(JSON.parse(storage.get(scrollStorageKey)).wordmarkFade, true, 'The fade toggle persists alongside blur and white timing');
  near(JSON.parse(storage.get(scrollStorageKey)).aboutTopBlur, 27.25, 'Top glyph blur persists in the same independent scroll profile');
  const reloaded = makeUnitDurationPage(1920, 960, 120 + 960 * .61, storage);
  await turn();
  near(reloaded.window.HeroScrollEffect.getSettings().whiteAt, .61, 'Reload restores the saved white endpoint');
  near(reloaded.window.HeroScrollEffect.getSettings().wordmarkBlur, 137.5, 'Reload restores the saved fractional blur strength across the expanded range');
  assert.equal(reloaded.window.HeroScrollEffect.getSettings().wordmarkFade, true, 'Reload restores the saved fade toggle');
  near(reloaded.window.HeroScrollEffect.getSettings().aboutTopBlur, 27.25, 'Reload restores the saved fractional top glyph blur');
  assert.equal(reloaded.shade(), 222, 'A restored scroll position uses the saved endpoint immediately');
  assert.equal(reloaded.window.HeroDepthEffect.getSettings().strength, 3.1, 'Reload retains independently saved depth settings');
  resetUnitDuration(reloaded.window.HeroScrollEffect);
  reloaded.frames();
  const resetReload = makeUnitDurationPage(1920, 960, 0, storage);
  await turn();
  near(resetReload.window.HeroScrollEffect.getSettings().whiteAt, .22, 'Reload after reset keeps the default endpoint');
  near(resetReload.window.HeroScrollEffect.getSettings().wordmarkBlur, 24, 'Reload after reset keeps the default blur');
  assert.equal(resetReload.window.HeroScrollEffect.getSettings().wordmarkFade, false, 'Reload after reset keeps the default blur-only mode');
  near(resetReload.window.HeroScrollEffect.getSettings().aboutTopBlur, 10, 'Reload after reset keeps default top glyph blur');
  assert.equal(resetReload.window.HeroDepthEffect.getSettings().strength, 3.1, 'Resetting scroll settings does not reset depth settings');

  for (const [raw, expected, expectedBlur, expectedFade, expectedTopBlur = 10] of [
    ['{invalid json', .22, 24, false],
    [JSON.stringify({whiteAt: 'bad'}), .22, 24, false],
    [JSON.stringify({whiteAt: 4}), .9, 24, false],
    [JSON.stringify({whiteAt: -.3}), .05, 24, false],
    [JSON.stringify({whiteAt: .36, wordmarkBlur: 'bad'}), .36, 24, false],
    [JSON.stringify({whiteAt: 'bad', wordmarkBlur: 52.25}), .22, 52.25, false],
    [JSON.stringify({whiteAt: 4, wordmarkBlur: 120}), .9, 120, false],
    [JSON.stringify({whiteAt: -.3, wordmarkBlur: -2}), .05, 0, false],
    [JSON.stringify({whiteAt: .41, wordmarkBlur: 900, wordmarkFade: true}), .41, 200, true],
    [JSON.stringify({whiteAt: .41, wordmarkBlur: 125, wordmarkFade: 'false'}), .41, 125, false],
    [JSON.stringify({whiteAt: .41, wordmarkBlur: 125, wordmarkFade: true, aboutTopBlur: 90}), .41, 125, true, 40],
    [JSON.stringify({whiteAt: .41, wordmarkBlur: 125, wordmarkFade: true, aboutTopBlur: -2}), .41, 125, true, 0],
    [JSON.stringify({whiteAt: 'invalid', wordmarkBlur: 'invalid', wordmarkFade: 'invalid', aboutTopBlur: 18.75}), .22, 24, false, 18.75],
    [JSON.stringify({whiteAt: .41, wordmarkBlur: 125, wordmarkFade: true, aboutTopBlur: 'bad'}), .41, 125, true, 10],
  ]) {
    const stored = makeUnitDurationPage(1920, 960, 0, new Map([[scrollStorageKey, raw]]));
    await turn();
    near(stored.window.HeroScrollEffect.getSettings().whiteAt, expected, 'Stored settings are validated and clamped on load');
    near(stored.window.HeroScrollEffect.getSettings().wordmarkBlur, expectedBlur, 'Stored blur is sanitized independently from white timing');
    assert.equal(stored.window.HeroScrollEffect.getSettings().wordmarkFade, expectedFade, 'Only a stored boolean can override the blur-only default');
    near(stored.window.HeroScrollEffect.getSettings().aboutTopBlur, expectedTopBlur, 'Stored top glyph blur is sanitized independently of the other three settings');
  }

  const blurPage = makeUnitDurationPage();
  await turn();
  const blurApi = blurPage.window.HeroScrollEffect;
  const wordmarkFrame = blurPage.nodes['.hero__wordmark-frame'];
  const wordmarkScale = blurPage.nodes['.hero__wordmark-scale'];
  const decorationScale = blurPage.nodes['.hero__decoration-scale'];
  const scenery = blurPage.nodes['.hero__scenery'];
  const assertIsolatedFilter = () => {
    for (const selector of ['.hero__scene', '.hero__scenery', '.hero__wordmark-scale', '.hero__decoration-scale', '[data-layer="wordmark"]', '[data-layer="portrait"]', '[data-layer="depth"]', '[data-layer="scanlines"]', '.about-backdrop__lines']) {
      assert.equal(blurPage.nodes[selector].style.filter, undefined, `Wordmark blur must not filter ${selector}`);
    }
    assert(!/scale\(/.test(wordmarkFrame.style.transform || ''), 'The filtered surface stays in physical card pixels');
    assert(!/scale\(/.test(scenery.style.transform || ''), 'The filtered surface has no scaled scenery ancestor');
    near(Number(scenery.style.opacity), 1, 'The shared scenery never hides wordmark and lines together');
    assert.equal(wordmarkFrame.parent, scenery, 'The filtered surface sits directly inside the unscaled scenery');
    assert.equal(wordmarkScale.parent, wordmarkFrame, 'Only the artwork inside the filtered surface is scaled');
  };
  for (const progress of [0, .02]) {
    blurPage.scroll(960 * progress);
    blurPage.frames();
    assert.equal(wordmarkFrame.style.filter, 'none', `No added blur is applied before the wordmark exit begins at p=${progress}`);
    near(Number(wordmarkFrame.style.opacity), 1, 'The default wordmark keeps its full opacity before the exit');
    assertIsolatedFilter();
  }
  blurPage.scroll(960 * .31);
  blurPage.frames();
  const originalExitFilter = wordmarkFrame.style.filter;
  const exitCard = blurPage.card();
  const exitOpacity = decorationScale.style.opacity;
  near(blurPage.visibleWordmarkBlur(), 12, 'At the exit midpoint the physical filter is exactly 12 viewport pixels');
  near(Number(exitOpacity), .5, 'Background lines preserve their separate original fade');
  near(Number(wordmarkFrame.style.opacity), 1, 'Blur-only mode does not fade the wordmark at the midpoint');
  assert.equal(wordmarkScale.style.width, '1920px', 'Wordmark artwork keeps its base width inside the small filtered surface');
  assert.equal(wordmarkScale.style.height, '960px', 'Wordmark artwork keeps its base height inside the small filtered surface');
  assert.equal(decorationScale.style.transform, wordmarkScale.style.transform, 'Wordmark and line artwork use aligned geometry scales');
  assert.equal(decorationScale.style.width, wordmarkScale.style.width, 'Line artwork uses the same base width');
  assert.equal(decorationScale.style.height, wordmarkScale.style.height, 'Line artwork uses the same base height');
  const scaleValues = /^scale\(([^,]+),\s*([^)]+)\)$/.exec(wordmarkScale.style.transform);
  assert(scaleValues, 'The artwork scale is explicit on its inner wrapper');
  near(Number(scaleValues[1]) * 1920, blurPage.position()[0], 'Inner artwork width follows the card');
  near(Number(scaleValues[2]) * 960, blurPage.position()[1], 'Inner artwork height follows the card');
  assertIsolatedFilter();
  blurApi.setSettings({wordmarkFade: true});
  blurPage.frames();
  near(Number(wordmarkFrame.style.opacity), .5, 'The fade toggle can restore the original midpoint opacity');
  assert.equal(wordmarkFrame.style.filter, originalExitFilter, 'Changing fade alone leaves the blur amount unchanged');
  assert.equal(decorationScale.style.opacity, exitOpacity, 'Changing wordmark fade never changes line opacity');
  near(blurApi.getSettings().wordmarkBlur, 24, 'Changing fade does not rewrite blur strength');
  near(blurApi.getSettings().whiteAt, .22, 'Changing fade does not rewrite white timing');
  blurApi.setSettings({wordmarkFade: false});
  blurPage.frames();
  near(Number(wordmarkFrame.style.opacity), 1, 'Disabling fade restores wordmark opacity immediately');
  assert.equal(wordmarkFrame.style.filter, originalExitFilter, 'Blur resumes without clearing or changing strength');
  blurApi.setSettings({wordmarkBlur: 48});
  blurPage.frames();
  near(blurPage.visibleWordmarkBlur(), 24, 'Changing blur strength live doubles its visible softness without scrolling');
  assert.deepEqual(blurPage.card(), exitCard, 'Live blur controls do not change portrait geometry');
  assert.equal(decorationScale.style.opacity, exitOpacity, 'Live blur controls do not change the separate lines fade');
  near(Number(wordmarkFrame.style.opacity), 1, 'Changing strength does not enable wordmark fade');
  near(blurApi.getSettings().whiteAt, .22, 'Changing blur does not alter white timing');
  blurApi.setSettings({wordmarkBlur: 0});
  blurPage.frames();
  assert.equal(wordmarkFrame.style.filter, 'none', 'Zero blur disables the additional filter immediately');
  near(Number(decorationScale.style.opacity), .5, 'Disabling blur preserves the original line opacity animation');
  near(Number(wordmarkFrame.style.opacity), 1, 'Zero blur does not hide the wordmark');
  blurApi.setSettings({wordmarkBlur: 36.25, whiteAt: 'invalid'});
  blurPage.frames();
  near(blurApi.getSettings().wordmarkBlur, 36.25, 'The API accepts finite fractional blur values independently of the slider step');
  near(blurApi.getSettings().whiteAt, .22, 'An invalid white endpoint does not block a valid blur patch');
  near(blurPage.visibleWordmarkBlur(), 18.125, 'A fractional blur strength affects the current frame');
  blurApi.setSettings({whiteAt: .45, wordmarkBlur: 'invalid'});
  blurPage.frames();
  near(blurApi.getSettings().whiteAt, .45, 'A valid white patch survives an invalid blur value');
  near(blurApi.getSettings().wordmarkBlur, 36.25, 'Invalid blur cannot overwrite the previous valid strength');
  near(blurApi.setSettings({wordmarkBlur: -20}).wordmarkBlur, 0, 'Blur is clamped to zero at its lower bound');
  near(blurApi.setSettings({wordmarkBlur: 1000}).wordmarkBlur, 200, 'Blur is clamped to the expanded 200 px upper bound');
  for (const value of ['24', true, null, NaN, Infinity, -Infinity]) {
    near(blurApi.setSettings({wordmarkBlur: value}).wordmarkBlur, 200, 'Non-finite or non-number blur patches leave the previous strength untouched');
  }
  blurApi.setSettings({wordmarkFade: true});
  for (const value of ['false', 'true', 0, 1, null, undefined, NaN]) {
    assert.equal(blurApi.setSettings({wordmarkFade: value}).wordmarkFade, true, 'Non-boolean patches cannot replace a valid fade setting');
  }
  blurApi.setSettings({whiteAt: 'invalid', wordmarkBlur: 'invalid', wordmarkFade: false});
  assert.equal(blurApi.getSettings().wordmarkFade, false, 'A valid fade toggle is applied independently of invalid numeric patches');
  near(blurApi.getSettings().wordmarkBlur, 200, 'An independent fade update keeps the previous blur amount');
  resetUnitDuration(blurApi);
  blurPage.frames();
  assert.equal(wordmarkFrame.style.filter, originalExitFilter, 'Reset restores the original exit blur at the current scroll position');
  assert.deepEqual(blurPage.scrollSettingsEvents.at(-1), fullProfile({whiteAt: .22, wordmarkBlur: 24, wordmarkFade: false, aboutTopBlur: 10, aboutFlightVariant: 'second', aboutFadeSpeed: 1}), 'Reset events include all scroll settings');
  blurPage.scroll(960 * .5999);
  blurPage.frames();
  assert(blurPage.wordmarkBlur() > 23.99, 'Blur approaches its full strength before 60% progress');
  for (const progress of [.6, .61, 1]) {
    blurPage.scroll(960 * progress);
    blurPage.frames();
    near(blurPage.wordmarkBlur(), 24, `Blur-only mode keeps its full filter at and after 60% progress, p=${progress}`);
    near(Number(wordmarkFrame.style.opacity), 1, 'Blur-only mode never clears the late wordmark through opacity');
    near(Number(decorationScale.style.opacity), 0, 'Lines still finish their separate original fade');
    assertIsolatedFilter();
    if (progress === .6) {
      blurApi.setSettings({wordmarkFade: true});
      blurPage.frames();
      assert.equal(wordmarkFrame.style.filter, 'none', 'Fade mode releases blur exactly when the 60% exit finishes');
      near(Number(wordmarkFrame.style.opacity), 0, 'Fade mode is fully transparent at the 60% boundary');
      blurApi.setSettings({wordmarkFade: false});
      blurPage.frames();
      near(blurPage.wordmarkBlur(), 24, 'Turning fade off at the boundary resumes the full blur');
      near(Number(wordmarkFrame.style.opacity), 1, 'Turning fade off at the boundary restores full opacity');
    }
  }
  const lateCard = blurPage.card(), lateGate = blurPage.gate();
  blurApi.setSettings({wordmarkBlur: 200});
  blurPage.frames();
  near(blurPage.wordmarkBlur(), 200, 'The full 200 px filter is applied live without scene-scale multiplication');
  assert.deepEqual(blurPage.card(), lateCard, 'Full-range blur never changes the final card size or placement');
  near(blurPage.gate(), lateGate, 'Full-range blur leaves the depth scroll gate unchanged');
  assertIsolatedFilter();
  blurApi.setSettings({wordmarkFade: true});
  blurPage.frames();
  near(Number(wordmarkFrame.style.opacity), 0, 'Fade mode hides the late wordmark');
  assert.equal(wordmarkFrame.style.filter, 'none', 'Fade mode releases the GPU filter after the wordmark becomes invisible');
  near(Number(decorationScale.style.opacity), 0, 'The wordmark checkbox does not revive background lines');
  blurApi.setSettings({wordmarkFade: false});
  blurPage.frames();
  near(Number(wordmarkFrame.style.opacity), 1, 'Turning fade off restores the wordmark immediately in the current late frame');
  near(blurPage.wordmarkBlur(), 200, 'Turning fade off restores the selected full blur without a clear-frame reset');
  near(blurApi.getSettings().wordmarkBlur, 200, 'The fade toggle never resets the selected blur strength');
  blurApi.setSettings({wordmarkBlur: 0});
  blurPage.frames();
  assert.equal(wordmarkFrame.style.filter, 'none', 'Zero blur is honored after the morph endpoint too');
  near(Number(wordmarkFrame.style.opacity), 1, 'Late zero blur leaves the default wordmark visible');
  resetUnitDuration(blurApi);
  blurPage.frames();
  blurPage.scroll(960 * .31);
  blurPage.frames();
  assert.equal(wordmarkFrame.style.filter, originalExitFilter, 'Reversing the exit restores the same progressive wordmark blur');
  blurPage.reduced.matches = true;
  blurPage.reduced.dispatchEvent({type: 'change'});
  blurPage.frames();
  assert.equal(wordmarkFrame.style.filter, 'none', 'Reduced motion disables additional wordmark blur during the exit');
  near(Number(wordmarkFrame.style.opacity), 1, 'Reduced motion does not silently enable wordmark fade');
  blurPage.reduced.matches = false;
  blurPage.reduced.dispatchEvent({type: 'change'});
  blurPage.frames();
  assert.equal(wordmarkFrame.style.filter, originalExitFilter, 'Returning to full motion recomputes blur for the same scroll position');
  blurPage.scroll(0);
  blurPage.frames();
  assert.equal(wordmarkFrame.style.filter, 'none', 'Reverse scrolling to the hero restores the original filter');
  near(Number(scenery.style.opacity), 1, 'Reverse scrolling preserves the original scenery opacity');
  near(Number(decorationScale.style.opacity), 1, 'Reverse scrolling restores the separate line opacity');
  assertIsolatedFilter();

  for (const [width, height] of [[375, 812], [1440, 800], [2560, 1305]]) {
    const scaledBlur = makeUnitDurationPage(width, height);
    await turn();
    scaledBlur.scroll(height * .31);
    scaledBlur.frames();
    near(scaledBlur.visibleWordmarkBlur(), 12, `${width}: the card-sized filter directly uses viewport pixels`);
    scaledBlur.window.HeroScrollEffect.setSettings({wordmarkBlur: 200});
    scaledBlur.frames();
    near(scaledBlur.wordmarkBlur(), 100, `${width}: the maximum strength remains 100 px at the midpoint on every viewport`);
  }
  const legacyStorage = new Map([[scrollStorageKey, JSON.stringify({whiteAt: .48})]]);
  const legacy = makeUnitDurationPage(1920, 960, 0, legacyStorage);
  await turn();
  near(legacy.window.HeroScrollEffect.getSettings().whiteAt, .48, 'An older white-only profile retains its saved endpoint');
  near(legacy.window.HeroScrollEffect.getSettings().wordmarkBlur, 24, 'An older profile receives the default blur setting');
  assert.equal(legacy.window.HeroScrollEffect.getSettings().wordmarkFade, false, 'An older white-only profile migrates to blur-only mode');
  near(legacy.window.HeroScrollEffect.getSettings().aboutTopBlur, 10, 'An older white-only profile receives default top glyph blur');
  legacy.window.HeroScrollEffect.setSettings({wordmarkBlur: 31});
  legacy.frames();
  assert.deepEqual(JSON.parse(legacyStorage.get(scrollStorageKey)), fullProfile({whiteAt: .48, wordmarkBlur: 31, wordmarkFade: false, aboutTopBlur: 10, aboutFlightVariant: 'second', aboutFadeSpeed: 1}), 'The next update persists the migrated complete profile');
  const legacyReload = makeUnitDurationPage(1920, 960, 0, legacyStorage);
  await turn();
  near(legacyReload.window.HeroScrollEffect.getSettings().wordmarkBlur, 31, 'A migrated blur strength survives reload');
  assert.equal(legacyReload.window.HeroScrollEffect.getSettings().wordmarkFade, false, 'Migrated blur-only mode survives reload');
  near(legacyReload.window.HeroScrollEffect.getSettings().aboutTopBlur, 10, 'Migrated top glyph blur survives reload');
  const legacyPair = makeUnitDurationPage(1920, 960, 0, new Map([[scrollStorageKey, JSON.stringify({whiteAt: .37, wordmarkBlur: 145})]]));
  await turn();
  near(legacyPair.window.HeroScrollEffect.getSettings().wordmarkBlur, 145, 'An older two-setting profile keeps its blur across the expanded range');
  assert.equal(legacyPair.window.HeroScrollEffect.getSettings().wordmarkFade, false, 'An older two-setting profile also defaults to blur-only mode');
  near(legacyPair.window.HeroScrollEffect.getSettings().aboutTopBlur, 10, 'An older two-setting profile receives default top glyph blur');
  const legacyTriple = makeUnitDurationPage(1920, 960, 0, new Map([[scrollStorageKey, JSON.stringify({whiteAt: .37, wordmarkBlur: 145, wordmarkFade: true})]]));
  await turn();
  near(legacyTriple.window.HeroScrollEffect.getSettings().aboutTopBlur, 10, 'An older three-setting profile receives default top glyph blur');

  const flying = makeUnitDurationPage(1920, 960, 0, new Map(), true);
  await turn();
  assert(flying.flightMeasures.length >= 2, 'Flight is measured initially and again after fonts become ready');
  for (const measurement of flying.flightMeasures) {
    assert.deepEqual({width: measurement.layout.width, height: measurement.layout.height, textY: measurement.layout.textY}, {width: 1920, height: 960, textY: 540}, 'Flight receives the active about layout');
    near(measurement.layout.topBlurNear, 26, 'Desktop top blur begins at the mirror of the bottom mask end');
    near(measurement.layout.topBlurFar, 132.5, 'Desktop top blur reaches full strength at the mirror of the bottom mask start');
    near(measurement.layout.topBlurNear, measurement.layout.height * (1 - measurement.masks[1] / 100), 'Top blur uses the active bottom-mask end after layout');
    near(measurement.layout.topBlurFar, measurement.layout.height * (1 - measurement.masks[0] / 100), 'Top blur uses the active bottom-mask start after layout');
    assert(measurement.layout.topBlurNear >= 0 && measurement.layout.topBlurNear < measurement.layout.topBlurFar, 'Mirrored top blur bounds are finite and ordered');
    near(measurement.fontSize, 48, 'Flight measurement runs after the active font style is applied');
    near(measurement.contentHeight, 576, 'Flight measurement sees content geometry for the active font');
  }
  const desktopFlight = flying.flightMeasures.at(-1).metrics;
  const desktopExtra = parseFloat(flying.nodes['.hero-journey'].style.height) - 960 * 2;
  const desktopSettings=flying.window.HeroScrollEffect.getSettings();
  const desktopLightEnd=desktopFlight.start+(desktopFlight.end-desktopFlight.start)*(desktopSettings.aboutBackgroundStart+desktopSettings.aboutBackgroundDuration*desktopSettings.aboutRevealScrollDuration);
  near(desktopExtra, Math.max(desktopFlight.end,desktopLightEnd)+96, 'The journey includes the full glyph flight and slower exposure before its hold');
  assert(desktopExtra > 540 + 576 - 960 * .75, 'The final glyph budget extends beyond the earlier blur-mask-only text budget');
  near(flying.flightUpdates.at(-1).after, 0, 'Flight starts neutral at the opening hero');
  assert.equal(flying.flightUpdates.at(-1).reducedMotion, false);
  near(flying.flightUpdates.at(-1).topBlur, 10, 'The glyph engine receives default top blur strength immediately');
  assert.equal(flying.flightUpdates.at(-1).variant, 'second', 'The glyph engine receives the default word-first variant');
  near(flying.flightUpdates.at(-1).fadeSpeed, 1, 'The glyph engine receives the default fade speed');
  flying.scroll(960);
  flying.frames();
  const flightCard = flying.card();
  near(flying.flightUpdates.at(-1).after, 0, 'The first viewport remains dedicated to the portrait morph');
  const requestedAfter = desktopFlight.start + 100;
  const updatesBeforeAdvance = flying.flightUpdates.length;
  flying.scroll(960 + requestedAfter);
  assert.equal(flying.flightUpdates.length, updatesBeforeAdvance, 'Native scroll does not jump the glyph flight synchronously');
  flying.frame();
  const firstFlightStep = flying.flightUpdates.at(-1).after;
  assert(firstFlightStep > 0 && firstFlightStep < requestedAfter, 'The glyph engine receives damped visual travel instead of the raw scroll jump');
  near(540 - parseFloat(flying.copy.style.values.get('--about-text-y')), firstFlightStep, 'Root text travel and glyph flight use the same damped distance');
  assert.deepEqual(flying.card(), flightCard, 'The portrait stays pinned while the flight starts');
  let previousAfter = firstFlightStep;
  const beforeFlightFrames = flying.flightUpdates.length;
  for (const sample of flying.frames()) assert.deepEqual(sample.card, flightCard, 'Every text-flight frame keeps the finished portrait pinned');
  for (const update of flying.flightUpdates.slice(beforeFlightFrames)) {
    assert(Number.isFinite(update.after) && update.after >= previousAfter - 1e-6 && update.after <= requestedAfter + 1e-6, 'Damped flight travel is finite and monotonic without overshoot');
    assert.equal(update.reducedMotion, false, 'Normal motion updates carry an explicit false preference');
    near(update.topBlur, 10, 'Damped glyph updates retain the effective top blur strength');
    previousAfter = update.after;
  }
  near(flying.flightUpdates.at(-1).after, requestedAfter, 'Flight settles at the requested text travel');
  near(parseFloat(flying.copy.style.values.get('--about-text-y')), 540 - requestedAfter, 'The main text continues to rise throughout the glyph flight');
  const measuresBeforeSettings = flying.flightMeasures.length;
  const updatesBeforeSettings = flying.flightUpdates.length;
  flying.window.HeroScrollEffect.setSettings({whiteAt: .4, wordmarkBlur: 140, wordmarkFade: true});
  flying.frames();
  assert.equal(flying.flightMeasures.length, measuresBeforeSettings, 'Changing scroll settings does not remeasure glyph layout');
  assert(flying.flightUpdates.length > updatesBeforeSettings, 'Settings repaint still updates the current flight composition');
  near(flying.flightUpdates.at(-1).after, requestedAfter, 'Scroll settings do not rewind or advance the glyph flight');
  assert.deepEqual(flying.card(), flightCard, 'Settings do not move the pinned portrait during text flight');

  const flightApi = flying.window.HeroScrollEffect;
  const otherScrollSettings = flightApi.getSettings();
  const flightDepthSettings = flying.window.HeroDepthEffect.getSettings();
  const textBeforeTopBlur = flying.copy.style.values.get('--about-text-y');
  flightApi.setSettings({aboutTopBlur: 24.5});
  flying.frames();
  near(flying.flightUpdates.at(-1).topBlur, 24.5, 'The top blur knob updates the glyph engine at the current scroll position');
  near(flying.flightUpdates.at(-1).after, requestedAfter, 'Changing top blur preserves the current glyph travel');
  assert.equal(flying.flightMeasures.length, measuresBeforeSettings, 'Live top blur changes do not remeasure glyphs');
  assert.equal(flying.copy.style.values.get('--about-text-y'), textBeforeTopBlur, 'Top blur changes leave text geometry untouched');
  assert.deepEqual(flying.card(), flightCard, 'Top blur changes leave the portrait pinned');
  for (const key of ['whiteAt', 'wordmarkBlur', 'wordmarkFade']) assert.equal(flightApi.getSettings()[key], otherScrollSettings[key], `Top blur leaves ${key} unchanged`);
  assert.deepEqual(flying.window.HeroDepthEffect.getSettings(), flightDepthSettings, 'Top blur leaves depth settings unchanged');
  assert.deepEqual(flying.scrollSettingsEvents.at(-1), fullProfile({whiteAt: .4, wordmarkBlur: 140, wordmarkFade: true, aboutTopBlur: 24.5, aboutFlightVariant: 'second', aboutFadeSpeed: 1}), 'Live top blur events include all effective settings');
  for (const [input, expected] of [[-10, 0], [90, 40], [0, 0], [40, 40], [11.75, 11.75]]) {
    flightApi.setSettings({aboutTopBlur: input});
    flying.frames();
    near(flightApi.getSettings().aboutTopBlur, expected, 'Top blur accepts finite values and clamps the public range');
    near(flying.flightUpdates.at(-1).topBlur, expected, 'The clamped top blur is forwarded live to glyphs');
  }
  for (const invalid of [null, '20', true, undefined, NaN, Infinity, -Infinity, {}, []]) {
    flightApi.setSettings({aboutTopBlur: invalid});
    flying.frames();
    near(flightApi.getSettings().aboutTopBlur, 11.75, 'Invalid top blur patches preserve the previous effective value');
    near(flying.flightUpdates.at(-1).topBlur, 11.75, 'Invalid top blur values never reach glyph rendering');
  }
  flightApi.setSettings({whiteAt: 'invalid', wordmarkBlur: Infinity, wordmarkFade: 'invalid', aboutTopBlur: 18.25});
  flying.frames();
  assert.deepEqual({...flightApi.getSettings()}, fullProfile({whiteAt: .4, wordmarkBlur: 140, wordmarkFade: true, aboutTopBlur: 18.25, aboutFlightVariant: 'second', aboutFadeSpeed: 1}), 'A valid top blur patch is independent of invalid sibling fields');
  flightApi.setSettings({whiteAt: .45, wordmarkBlur: 135, wordmarkFade: false, aboutTopBlur: NaN});
  flying.frames();
  assert.deepEqual({...flightApi.getSettings()}, fullProfile({whiteAt: .45, wordmarkBlur: 135, wordmarkFade: false, aboutTopBlur: 18.25, aboutFlightVariant: 'second', aboutFadeSpeed: 1}), 'Invalid top blur does not block valid sibling patches');
  resetUnitDuration(flightApi);
  flying.frames();
  near(flying.flightUpdates.at(-1).topBlur, 10, 'Reset forwards default top blur without new layout');
  assert.equal(flying.flightMeasures.length, measuresBeforeSettings, 'Top blur validation and reset do not remeasure flight');
  assert.deepEqual(flying.window.HeroDepthEffect.getSettings(), flightDepthSettings, 'Top blur validation and reset leave depth settings unchanged');
  flightApi.setSettings({aboutTopBlur: 23});
  flying.frames();

  flying.scroll(960 + desktopExtra);
  flying.frames();
  near(flying.flightUpdates.at(-1).after, desktopExtra, 'The engine reaches the complete glyph and exposure hold interval');
  assert.deepEqual(flying.card(), flightCard, 'The portrait stays pinned after the final glyph is gone');
  near(parseFloat(flying.copy.style.values.get('--about-text-y')), 540 - desktopExtra, 'Text travel is not capped at the old short blur-mask budget');
  flying.scroll(960 + desktopExtra + 5000);
  flying.frames();
  near(flying.flightUpdates.at(-1).after, desktopExtra, 'Overscroll is capped at the extended glyph-flight budget');
  assert.deepEqual(flying.card(), flightCard, 'Capped extra travel does not release the portrait');
  flying.scroll(960 + desktopFlight.start / 2);
  flying.frames();
  near(flying.flightUpdates.at(-1).after, desktopFlight.start / 2, 'Reverse scroll drives flight backward through its measured range');
  assert.deepEqual(flying.card(), flightCard, 'Reversing the glyph flight keeps the portrait pinned');
  flying.scroll(0);
  flying.frames();
  near(flying.flightUpdates.at(-1).after, 0, 'Reversing to the hero resets glyph flight to zero');
  assert.deepEqual(flying.position(), [1920, 960], 'The portrait morph still reverses to the full hero');

  flying.reduced.matches = true;
  flying.reduced.dispatchEvent({type: 'change'});
  flying.frames();
  flying.scroll(960 + requestedAfter);
  flying.frame();
  near(flying.flightUpdates.at(-1).after, requestedAfter, 'Reduced motion passes the current distance without damping');
  assert.equal(flying.flightUpdates.at(-1).reducedMotion, true, 'The glyph engine receives the active reduced-motion preference');
  near(flying.flightUpdates.at(-1).topBlur, 23, 'Reduced motion retains the configured glyph blur while its motion preference stays explicit');
  assert.equal(flying.raf.size, 0, 'Reduced motion does not keep an unnecessary flight animation loop');
  flying.reduced.matches = false;
  flying.reduced.dispatchEvent({type: 'change'});
  flying.frames();
  assert.equal(flying.flightUpdates.at(-1).reducedMotion, false, 'Returning to full motion updates the glyph engine preference');

  flying.scroll(1000);
  assert.equal(flying.raf.size, 1, 'A resize is exercised with a pending flight frame');
  const beforeResizeMeasures = flying.flightMeasures.length;
  flying.resize(375, 812);
  assert(flying.flightMeasures.length > beforeResizeMeasures, 'A viewport resize remeasures glyph flight');
  const mobileMeasurement = flying.flightMeasures.at(-1);
  assert.deepEqual({width: mobileMeasurement.layout.width, height: mobileMeasurement.layout.height}, {width: 375, height: 812}, 'Flight receives the mobile layout after resize');
  near(mobileMeasurement.layout.textY, 450, 'Flight receives the updated Figma mobile text position');
  near(mobileMeasurement.layout.topBlurNear, 55.5, 'Mobile resize recomputes the mirrored upper blur near edge');
  near(mobileMeasurement.layout.topBlurFar, 160.5, 'Mobile resize recomputes the mirrored upper blur far edge');
  near(mobileMeasurement.layout.topBlurNear, 812 * (1 - mobileMeasurement.masks[1] / 100), 'Mobile top blur mirrors its current bottom mask end');
  near(mobileMeasurement.layout.topBlurFar, 812 * (1 - mobileMeasurement.masks[0] / 100), 'Mobile top blur mirrors its current bottom mask start');
  near(mobileMeasurement.fontSize, 32, 'Mobile flight is measured after the mobile font size is applied');
  near(mobileMeasurement.contentHeight, 384, 'Mobile flight reads the updated content height');
  const mobileExtra = parseFloat(flying.nodes['.hero-journey'].style.height) - 812 * 2;
  const mobileLightEnd=mobileMeasurement.metrics.start+(mobileMeasurement.metrics.end-mobileMeasurement.metrics.start)*(desktopSettings.aboutBackgroundStart+desktopSettings.aboutBackgroundDuration*desktopSettings.aboutRevealScrollDuration);
  near(mobileExtra, Math.max(mobileMeasurement.metrics.end,mobileLightEnd)+81.2, 'Resize updates the complete glyph and exposure budget for the mobile height');
  near(flying.flightUpdates.at(-1).after, 188, 'Resize snaps flight to current travel using the new viewport height');
  near(flying.flightUpdates.at(-1).topBlur, 23, 'Resize preserves the configured top blur strength');
  assert.equal(flying.raf.size, 0, 'Resize cancels pending flight frames rather than animating stale geometry');
  assert.deepEqual(flying.position(), [160, 160], 'The portrait uses its mobile pinned size during flight');
  const mobileCard = flying.card();
  flying.scroll(812 + mobileExtra);
  assert.equal(flying.raf.size, 1, 'History restore is exercised with a pending flight frame');
  const beforeRestoreMeasures = flying.flightMeasures.length;
  flying.window.dispatchEvent({type: 'pageshow'});
  assert(flying.flightMeasures.length > beforeRestoreMeasures, 'Pageshow remeasures flight for the restored composition');
  near(flying.flightUpdates.at(-1).after, mobileExtra, 'Pageshow restores the final flight and hold immediately');
  near(flying.flightUpdates.at(-1).topBlur, 23, 'Pageshow restores glyph flight with the current top blur setting');
  assert.equal(flying.raf.size, 0, 'Pageshow cancels stale pending flight animation');
  assert.deepEqual(flying.card(), mobileCard, 'Restoring the final glyph frame leaves the mobile portrait pinned');
  flying.scroll(0);
  flying.frames();
  near(flying.flightUpdates.at(-1).after, 0, 'Flight resets after reversing from a restored mobile endpoint');

  const flightHistory = makeUnitDurationPage(1920, 960, 120 + 960 + 1200, new Map(), true);
  await turn();
  near(flightHistory.flightUpdates.at(-1).after, desktopExtra, 'An initially restored scroll can start after the final glyph with its flight budget applied');
  assert.deepEqual(flightHistory.position(), [200, 200], 'Initial flight history restoration keeps the portrait at its pinned endpoint');

  const variantStorage = new Map();
  const variants = makeUnitDurationPage(1440, 800, 0, variantStorage, true);
  await turn();
  const variantApi = variants.window.HeroScrollEffect;
  variants.scroll(800 + 150);
  variants.frames();
  const variantCard = variants.card();
  const variantText = variants.copy.style.values.get('--about-text-y');
  const variantMeasures = variants.flightMeasures.length;
  const depthBeforeVariant = variants.window.HeroDepthEffect.getSettings();
  variantApi.setSettings({aboutFlightVariant: 'first', aboutFadeSpeed: 1.6});
  variants.frames();
  assert.equal(variants.flightUpdates.at(-1).variant, 'first', 'Variant changes reach the engine while scrolling is stopped');
  near(variants.flightUpdates.at(-1).fadeSpeed, 1.6, 'Fade-speed changes reach the engine while scrolling is stopped');
  assert.equal(variants.flightMeasures.length, variantMeasures, 'Changing variants and fade speed never remeasures glyphs');
  assert.deepEqual(variants.card(), variantCard, 'Variant changes leave the portrait pinned');
  assert.equal(variants.copy.style.values.get('--about-text-y'), variantText, 'Variant changes preserve the current text position');
  assert.deepEqual(variants.window.HeroDepthEffect.getSettings(), depthBeforeVariant, 'Variant settings do not affect portrait motion');
  assert.equal(JSON.parse(variantStorage.get(scrollStorageKey)).aboutFlightVariant, 'first', 'The selected variant is persisted');
  near(JSON.parse(variantStorage.get(scrollStorageKey)).aboutFadeSpeed, 1.6, 'The fade-speed value is persisted');
  for (const invalid of [null, undefined, 'third', '', 0, true, {}, []]) {
    variantApi.setSettings({aboutFlightVariant: invalid});
    variants.frames();
    assert.equal(variantApi.getSettings().aboutFlightVariant, 'first', 'Invalid variant patches preserve the selected animation');
    assert.equal(variants.flightUpdates.at(-1).variant, 'first', 'Invalid variants never reach the glyph engine');
  }
  for (const [input, expected] of [[-1, .5], [7, 2], [.5, .5], [2, 2], [1.25, 1.25]]) {
    variantApi.setSettings({aboutFadeSpeed: input});
    variants.frames();
    near(variantApi.getSettings().aboutFadeSpeed, expected, 'Fade-speed patches honor the public range');
    near(variants.flightUpdates.at(-1).fadeSpeed, expected, 'Only the effective fade speed reaches the engine');
  }
  for (const invalid of [null, undefined, '1.5', NaN, Infinity, -Infinity, true, {}, []]) {
    variantApi.setSettings({aboutFadeSpeed: invalid});
    variants.frames();
    near(variantApi.getSettings().aboutFadeSpeed, 1.25, 'Invalid fade-speed patches preserve the previous value');
  }
  const variantSnapshot = variantApi.getSettings();
  variantSnapshot.aboutFlightVariant = 'second'; variantSnapshot.aboutFadeSpeed = 2;
  assert.equal(variantApi.getSettings().aboutFlightVariant, 'first', 'A settings snapshot cannot mutate the chosen variant');
  near(variantApi.getSettings().aboutFadeSpeed, 1.25, 'A settings snapshot cannot mutate fade speed');
  const variantReload = makeUnitDurationPage(1440, 800, 120 + 950, variantStorage, true);
  await turn();
  assert.equal(variantReload.flightUpdates.at(-1).variant, 'first', 'Reload forwards the stored variant on the first render');
  near(variantReload.flightUpdates.at(-1).fadeSpeed, 1.25, 'Reload forwards the stored fade speed on the first render');
  resetUnitDuration(variantApi); variants.frames();
  assert.equal(variants.flightUpdates.at(-1).variant, 'second', 'Reset restores the default word-first variant');
  near(variants.flightUpdates.at(-1).fadeSpeed, 1, 'Reset restores default fade speed');
  assert.deepEqual(variants.card(), variantCard, 'Reset leaves the portrait pinned');
  assert.equal(variants.copy.style.values.get('--about-text-y'), variantText, 'Reset preserves the current text position');
  for (const [profile, expectedVariant, expectedSpeed] of [
    [{whiteAt: .38}, 'second', 1],
    [{aboutFlightVariant: 'third', aboutFadeSpeed: 'bad'}, 'second', 1],
    [{aboutFlightVariant: 'first', aboutFadeSpeed: 6}, 'first', 2],
    [{aboutFlightVariant: 'second', aboutFadeSpeed: -2}, 'second', .5],
  ]) {
    const restored = makeUnitDurationPage(1440, 800, 0, new Map([[scrollStorageKey, JSON.stringify(profile)]]), true);
    await turn();
    assert.equal(restored.flightUpdates.at(-1).variant, expectedVariant, 'Saved variant profiles are migrated and sanitized');
    near(restored.flightUpdates.at(-1).fadeSpeed, expectedSpeed, 'Saved fade-speed profiles are migrated and sanitized');
  }

  const tuningStorage = new Map();
  const tuned = makeUnitDurationPage(1440, 800, 0, tuningStorage, true);
  await turn();
  const tuningApi = tuned.window.HeroScrollEffect;
  const mappedTuneKeys = {...Object.fromEntries(tuneKeys.map(key => [`about${key[0].toUpperCase()}${key.slice(1)}`, key])), aboutFadeGuide: 'showGuide'};
  for (const [key, expected] of Object.entries(scrollTuneDefaults)) {
    assert.equal(tuningApi.getSettings()[key], expected, `${key} has its intended default`);
    assert.equal(tuned.flightUpdates.at(-1)[mappedTuneKeys[key]], expected, `${key} is forwarded to the glyph engine on the first frame`);
  }
  tuningApi.setSettings({aboutTriggerMode: 'viewport'}); tuned.frames();
  tuned.scroll(800 + 200); tuned.frames();
  const tuningCard = tuned.card(), tuningText = tuned.copy.style.values.get('--about-text-y');
  const tuningMeasures = tuned.flightMeasures.length;
  const initialTuneBudget = parseFloat(tuned.nodes['.hero-journey'].style.height);
  const baseTuneMetrics = tuned.window.AboutTextFlight.getMetrics();
  tuningApi.setSettings({aboutStartOffset: .4}); tuned.frames();
  near(parseFloat(tuned.nodes['.hero-journey'].style.height), initialTuneBudget + 320, 'Late start extends the journey using cached viewport metrics');
  assert.equal(tuned.flightMeasures.length, tuningMeasures, 'Changing start time never remeasures the glyphs');
  assert.deepEqual(tuned.card(), tuningCard, 'Changing start time leaves the portrait pinned');
  assert.equal(tuned.copy.style.values.get('--about-text-y'), tuningText, 'Changing start time preserves current text travel');
  tuningApi.setSettings({aboutStartOffset: -.5}); tuned.frames();
  near(parseFloat(tuned.nodes['.hero-journey'].style.height), initialTuneBudget - baseTuneMetrics.start, 'Early start shortens the journey by the actual clamped start delta');
  tuningApi.setSettings({aboutStartOffset: .4, aboutFlightVariant: 'first'}); tuned.frames();
  near(parseFloat(tuned.nodes['.hero-journey'].style.height), initialTuneBudget, 'Frozen first iteration ignores the tuned start offset in its scroll budget');
  tuningApi.setSettings({aboutFlightVariant: 'second'}); tuned.frames();
  near(parseFloat(tuned.nodes['.hero-journey'].style.height), initialTuneBudget + 320, 'Switching back restores the tuned second-iteration budget');
  const tunedProfile = {aboutStartOffset: .2, aboutWordForce: 2.5, aboutLetterForce: .7, aboutFadeBoundary: 1.6, aboutFadeSoftness: .8, aboutFadeShape: 'ellipse', aboutFadeOrigin: 'text', aboutDetach: .4, aboutRotation: 1.8, aboutFadeGuide: true, aboutTriggerMode: 'viewport'};
  tuningApi.setSettings(tunedProfile); tuned.frames();
  for (const [key, expected] of Object.entries(tunedProfile)) {
    assert.equal(tuningApi.getSettings()[key], expected, `${key} applies live`);
    assert.equal(tuned.flightUpdates.at(-1)[mappedTuneKeys[key]], expected, `${key} maps to the engine option ${mappedTuneKeys[key]}`);
    assert.equal(tuned.flightConfigurations.at(-1)[mappedTuneKeys[key]], expected, `${key} configures the cached engine state before the scroll render`);
    assert.equal(JSON.parse(tuningStorage.get(scrollStorageKey))[key], expected, `${key} is persisted`);
  }
  assert.equal(tuned.flightMeasures.length, tuningMeasures, 'All live tuning controls reuse cached glyph measurements');
  assert.deepEqual(tuned.card(), tuningCard, 'All live tuning controls leave the portrait pinned');
  assert.equal(tuned.copy.style.values.get('--about-text-y'), tuningText, 'Tuning does not jump the text position');
  const tuneReload = makeUnitDurationPage(1440, 800, 120 + 1000, tuningStorage, true);
  await turn();
  for (const [key, expected] of Object.entries(tunedProfile)) assert.equal(tuneReload.flightUpdates.at(-1)[mappedTuneKeys[key]], expected, `${key} restores into the first engine render after reload`);
  const tuneLimits = {aboutStartOffset: [-.5, .5], aboutWordForce: [0, 3], aboutLetterForce: [0, 3], aboutFadeBoundary: [.25, 2], aboutFadeSoftness: [.05, 1], aboutDetach: [0, .6], aboutRotation: [0, 2], aboutTriggerGapPx: [0, 400]};
  for (const [key, [min, max]] of Object.entries(tuneLimits)) {
    for (const [input, expected] of [[min - 10, min], [max + 10, max]]) {
      tuningApi.setSettings({[key]: input}); tuned.frames();
      near(tuningApi.getSettings()[key], expected, `${key} honors its public range`);
      near(tuned.flightUpdates.at(-1)[mappedTuneKeys[key]], expected, `${key} forwards only the clamped value`);
    }
    for (const invalid of [NaN, Infinity, -Infinity, true, null, '1', {}, []]) {
      tuningApi.setSettings({[key]: invalid}); tuned.frames();
      near(tuningApi.getSettings()[key], max, `${key} ignores invalid patches`);
    }
  }
  for (const shape of ['distance', 'circle', 'ellipse', 'linear', 'box']) {
    tuningApi.setSettings({aboutFadeShape: shape}); tuned.frames();
    assert.equal(tuned.flightUpdates.at(-1).fadeShape, shape, 'Every supported fade shape reaches the engine');
  }
  for (const invalid of ['unknown', '', 0, true, null]) {
    tuningApi.setSettings({aboutFadeShape: invalid}); tuned.frames();
    assert.equal(tuningApi.getSettings().aboutFadeShape, 'box', 'Unsupported fade shapes preserve the previous selection');
  }
  tuningApi.setSettings({aboutFadeOrigin: 'screen', aboutFadeGuide: false}); tuned.frames();
  for (const invalid of ['cursor', 'unknown', '', 0, true, null]) {
    tuningApi.setSettings({aboutFadeOrigin: invalid}); tuned.frames();
    assert.equal(tuningApi.getSettings().aboutFadeOrigin, 'screen', 'Only supported fade origins are accepted');
  }
  for (const invalid of ['false', 0, null, undefined]) {
    tuningApi.setSettings({aboutFadeGuide: invalid}); tuned.frames();
    assert.equal(tuningApi.getSettings().aboutFadeGuide, false, 'Guide visibility requires a boolean');
  }
  const tuneStateCopy = tuningApi.getSettings(); tuneStateCopy.aboutWordForce = 0; tuneStateCopy.aboutFadeShape = 'circle';
  assert.equal(tuningApi.getSettings().aboutWordForce, 3, 'Tuning snapshots cannot mutate cached forces');
  assert.equal(tuningApi.getSettings().aboutFadeShape, 'box', 'Tuning snapshots cannot mutate the selected fade shape');
  resetUnitDuration(tuningApi); tuned.frames();
  for (const [key, expected] of Object.entries(scrollTuneDefaults)) assert.equal(tuned.flightUpdates.at(-1)[mappedTuneKeys[key]], expected, `Reset restores ${key} in the engine`);
  assert.equal(tuned.flightMeasures.length, tuningMeasures, 'Validation and reset never remeasure glyph layout');
  assert.equal(tuned.depthSettingsCalls.length, 0, 'Tuning remains independent of portrait motion settings');
  for (const profile of [{}, {aboutWordForce: 'bad', aboutFadeShape: 'unknown', aboutFadeOrigin: 'cursor', aboutFadeGuide: 'true'}]) {
    const migrated = makeUnitDurationPage(1440, 800, 0, new Map([[scrollStorageKey, JSON.stringify(profile)]]), true);
    await turn();
    for (const [key, expected] of Object.entries(scrollTuneDefaults)) assert.equal(migrated.flightUpdates.at(-1)[mappedTuneKeys[key]], expected, `Legacy or invalid profiles receive the default ${key}`);
  }

  for (const [screenWidth, screenHeight, portraitBottom] of [[2560, 1305, 560], [1920, 960, 440], [1920, 1080, 482.5], [1440, 800, 371], [768, 1024, 469], [375, 812, 370], [1920, 600, 312.5]]) {
    const anchored = makeUnitDurationPage(screenWidth, screenHeight, 0, new Map(), true);
    await turn();
    const controller = anchored.window.HeroScrollEffect;
    const engine = anchored.window.AboutTextFlight;
    const measured = anchored.flightMeasures.at(-1);
    near(measured.layout.portraitBottom, portraitBottom, `${screenWidth}×${screenHeight}: scroll layout passes the actual portrait bottom`);
    assert.equal(measured.layout.triggerMode, 'portrait', 'New layouts select the portrait-relative engine mode');
    near(measured.layout.triggerGapPx, 100, 'New layouts pass the default CSS-pixel trigger gap');
    near(engine.getMetrics().start, Math.max(0, measured.layout.textY - portraitBottom - 100), `${screenWidth}×${screenHeight}: portrait bottom controls the cached reading interval`);
    near(engine.getMetrics().span, 1305 * .38 * measured.fontSize * 1.2 / 67.2, 'Cached portrait pace depends on text size instead of screen height');
    const originalMeasures = anchored.flightMeasures.length;
    const originalMetrics = engine.getMetrics();
    anchored.scroll(screenHeight + originalMetrics.start + originalMetrics.span * .3); anchored.frames();
    const anchoredCard = anchored.card();
    const anchoredText = anchored.copy.style.values.get('--about-text-y');
    controller.setSettings({aboutTriggerGapPx: 200}); anchored.frames();
    near(anchored.flightConfigurations.at(-1).triggerGapPx, 200, 'Live gap controls reconfigure cached engine state');
    near(anchored.flightUpdates.at(-1).triggerGapPx, 200, 'Live gap controls also reach the current engine frame');
    near(engine.getMetrics().start, Math.max(0, measured.layout.textY - portraitBottom - 200), 'A live gap change moves the trigger using cached portrait geometry');
    const activeMetrics=engine.getMetrics(),activeSettings=controller.getSettings();
    const activeLightEnd=activeMetrics.start+(activeMetrics.end-activeMetrics.start)*(activeSettings.aboutBackgroundStart+activeSettings.aboutBackgroundDuration*activeSettings.aboutRevealScrollDuration);
    near(parseFloat(anchored.nodes['.hero-journey'].style.height), screenHeight * 2 + Math.max(activeMetrics.end,activeLightEnd) + screenHeight * .1, 'Live trigger changes update the full glyph and exposure budget from cached metrics');
    assert.equal(anchored.flightMeasures.length, originalMeasures, 'Changing trigger gap never remeasures glyph DOM');
    assert.deepEqual(anchored.card(), anchoredCard, 'A trigger change leaves the portrait pinned');
    assert.equal(anchored.copy.style.values.get('--about-text-y'), anchoredText, 'A trigger change preserves the current text travel');
    controller.setSettings({aboutTriggerMode: 'viewport'}); anchored.frames();
    assert.equal(engine.getMetrics().activeTriggerMode, 'viewport', 'The former viewport trigger remains available');
    near(engine.getMetrics().start, Math.max(0, measured.layout.textY + measured.contentHeight - screenHeight * .97), 'Viewport mode restores its former reading interval');
    controller.setSettings({aboutTriggerMode: 'portrait', aboutFlightVariant: 'first'}); anchored.frames();
    assert.equal(engine.getMetrics().activeTriggerMode, 'viewport', 'The saved first iteration always retains its viewport trigger');
    controller.setSettings({aboutFlightVariant: 'second', aboutTriggerGapPx: 100, aboutBackgroundStart: 0, aboutBackgroundDuration: 1, aboutRevealScrollDuration: 1}); anchored.frames();
    const restoredMetrics = engine.getMetrics();
    anchored.scroll(screenHeight + restoredMetrics.start + (restoredMetrics.end - restoredMetrics.start) * .5); anchored.frames();
    near(Number(anchored.hero.dataset.lightProgress), .5, 'Theme progress follows the newly active portrait trigger metrics');
    assert.deepEqual(anchored.card(), anchoredCard, 'Theme and trigger changes preserve the portrait anchor');
    assert.equal(anchored.flightMeasures.length, originalMeasures, 'Trigger mode, gap, theme and variant switches reuse cached measurements');
  }
  const triggerStorage = new Map();
  const triggerProfile = makeUnitDurationPage(1440, 800, 0, triggerStorage, true);
  await turn();
  const triggerApi = triggerProfile.window.HeroScrollEffect;
  triggerApi.setSettings({aboutTriggerMode: 'viewport', aboutTriggerGapPx: 175.5}); triggerProfile.frames();
  assert.equal(JSON.parse(triggerStorage.get(scrollStorageKey)).aboutTriggerMode, 'viewport', 'The former trigger mode can be saved explicitly');
  near(JSON.parse(triggerStorage.get(scrollStorageKey)).aboutTriggerGapPx, 175.5, 'Fractional CSS-pixel gaps are persisted');
  const triggerReload = makeUnitDurationPage(1440, 800, 0, triggerStorage, true);
  await turn();
  assert.equal(triggerReload.flightUpdates.at(-1).triggerMode, 'viewport', 'Reload preserves a saved viewport trigger');
  near(triggerReload.flightUpdates.at(-1).triggerGapPx, 175.5, 'Reload preserves the saved trigger gap');
  for (const invalid of ['unknown', '', true, 0, null]) {
    triggerApi.setSettings({aboutTriggerMode: invalid}); triggerProfile.frames();
    assert.equal(triggerApi.getSettings().aboutTriggerMode, 'viewport', 'Unsupported trigger modes do not replace a saved mode');
  }
  for (const invalid of [NaN, Infinity, -Infinity, true, null, '100', {}, []]) {
    triggerApi.setSettings({aboutTriggerGapPx: invalid}); triggerProfile.frames();
    near(triggerApi.getSettings().aboutTriggerGapPx, 175.5, 'Unsupported gaps do not replace a saved value');
  }
  resetUnitDuration(triggerApi); triggerProfile.frames();
  assert.equal(triggerProfile.flightUpdates.at(-1).triggerMode, 'portrait', 'Reset selects the new portrait-relative default');
  near(triggerProfile.flightUpdates.at(-1).triggerGapPx, 100, 'Reset restores the default 100-pixel gap');

  console.log('Scroll checks passed: cross-resolution portrait triggers and live cached mode/gap budgets, theme alignment, preserved viewport mode, complete tuning, persistence/validation, reversible resize/history, pinned portrait, independent depth and no idle RAF.');
})().catch(error => {console.error(error); process.exitCode = 1;});
