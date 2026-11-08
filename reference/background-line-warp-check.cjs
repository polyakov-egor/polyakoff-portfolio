/* Numerical field and real renderer geometry checks. No browser preferences,
   raster readbacks or replacement animation implementation are involved. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const near = (a, b, label, tolerance = 1e-7) => assert(Math.abs(a - b) < tolerance, `${label}: ${a} != ${b}`);

class Matrix {
  constructor(text = '') {
    this.a = this.d = 1; this.b = this.c = this.e = this.f = 0;
    const t = text.match(/translate3d\(([-.\d]+)px, ([-.\d]+)px, 0\)/), s = text.match(/scale\(([-.\d]+), ([-.\d]+)\)/);
    if (t) { this.e = +t[1]; this.f = +t[2]; } if (s) { this.a = +s[1]; this.d = +s[2]; }
  }
}
function node(tag) {
  const n = {
    tagName: tag, children: [], dataset: {}, style: {visibility: ''}, hidden: false, attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    append(child) { this.insertBefore(child, null); },
    insertBefore(child, before) { child.parentElement = this; const i = before ? this.children.indexOf(before) : this.children.length; this.children.splice(i, 0, child); },
    remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; },
    get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; },
  };
  if (tag === 'canvas') {
    const ctx = {
      polygons: [], rectangles: [], transforms: [], fills: [], path: null,
      setTransform(...args) { this.transforms.push(args); }, clearRect() {},
      beginPath() { this.polygons = []; this.rectangles = []; },
      rect(...args) { this.rectangles.push(args); },
      moveTo(x, y) { this.path = [[x, y]]; }, lineTo(x, y) { this.path.push([x, y]); },
      closePath() { this.polygons.push(this.path); this.path = null; },
      fill() { if (this.failFill) throw new Error('Simulated canvas paint failure'); this.fills.push({alpha: this.globalAlpha, color: this.fillStyle, composite: this.globalCompositeOperation || 'source-over', shadowBlur: this.shadowBlur, shadowOffsetY: this.shadowOffsetY}); },
    };
    n.context = ctx; n.width = 300; n.height = 150;
    n.getContext = () => ctx;
  }
  return n;
}
function page() {
  const window = {}, sources = {}, parents = {}, created = [];
  for (const [kind, selector] of [['hero', '[data-layer="scanlines"]'], ['dark', '.about-backdrop__lines'], ['light', '.about-backdrop__light-lines']]) {
    const source = node('img'), parent = node('div');
    source.src = kind === 'hero' ? './assets/images/scanlines.svg' : `./assets/images/about-lines-${kind === 'dark' ? 'black' : 'light'}-2k.svg`;
    source.style.transform = 'translate3d(-4.39px, -347.395px, 0) scale(1, 1)'; parent.append(source);
    sources[selector] = source; sources[kind] = source; parents[kind] = parent;
  }
  const document = {
    querySelector: selector => sources[selector],
    createElement(tag) { const child = node(tag); created.push(child); return child; },
  };
  const context = vm.createContext({window, document, DOMMatrix: Matrix});
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/images/line-masks.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'background-line-warp.js'), 'utf8'), context);
  return {window, sources, parents, created, api: window.BackgroundLineWarp};
}
const p = page(), sample = p.api.sample;
function state(patch = {}) {
  return {width: 1920, height: 960, ratio: 1, left: 0, top: 0,
    scene: {x: 0, y: 0, width: 1920, height: 960, baseWidth: 1920, baseHeight: 960, decorationOpacity: 1, lightProgress: 0},
    spot: {x: 350, y: 400}, power: 1, ripples: [], trails: [], ambient: {x: 0, y: 0, time: 0}, now: 500,
    settings: {enabled: true, mode: 'distortion', hoverStrength: .35, rippleStrength: .4, radius: 150}, reducedMotion: false, ...patch};
}
const field = state();
assert(sample(350, 400, field).y < -8, 'Hover visibly lifts the horizontal lines near the pointer');
assert.deepEqual(plain(sample(500, 400, field)), {x: 0, y: 0}, 'The hover field ends exactly at the selected radius');
assert.deepEqual(plain(sample(900, 800, field)), {x: 0, y: 0}, 'Far-away artwork keeps its original coordinates');
const pull = sample(300, 360, field);
assert(pull.y < -2, 'Nearby lines form the same local raised surface');
const reflected = sample(400, 440, field);
near(pull.x, -reflected.x, 'The lift is centered horizontally'); near(pull.y, reflected.y, 'Both sides lift instead of being pinched toward the cursor');
const edge = sample(500 - .001, 400, field);
assert(Math.hypot(edge.x, edge.y) < .001, 'The field joins untouched lines without a visible discontinuity');
assert.deepEqual(plain(sample(300, 360, state({power: 0}))), {x: 0, y: 0}, 'Zero pointer power restores the baseline');
assert.deepEqual(plain(sample(300, 360, state({settings: {...field.settings, hoverStrength: 0}}))), {x: 0, y: 0});

const pulse = state({spot: null, power: 0, now: 200, ripples: [{x: 350, y: 400, time: 0}]});
const rx = sample(380, 400, pulse), ry = sample(350, 430, pulse);
assert(rx.y < -.5, 'A click produces a raised pulse rather than radial displacement');
near(rx.y, ry.y, 'The raised crest is circular around its origin'); near(rx.x, 0, 'The pulse lifts the lines without horizontal scattering');
assert(Number.isFinite(sample(350, 400, pulse).y), 'The pulse center stays finite');
assert.deepEqual(plain(sample(1800, 400, pulse)), {x: 0, y: 0}, 'The click pulse remains local');
assert.deepEqual(plain(sample(380, 400, {...pulse, now: 4200})), {x: 0, y: 0}, 'An expired pulse returns exactly to baseline');
assert.deepEqual(plain(sample(380, 400, {...pulse, now: -10})), {x: 0, y: 0}, 'A future wave cannot deform the current frame');
for (let x = 100; x < 650; x += 11) for (let y = 150; y < 650; y += 13) {
  const value = sample(x, y, state({settings: {...field.settings, hoverStrength: 1, rippleStrength: 1}, now: 200,
    ripples: Array.from({length: 6}, () => ({x: 350, y: 400, time: 0}))}));
  assert(Number.isFinite(value.x) && Number.isFinite(value.y));
  assert(Math.hypot(value.x, value.y) <= 96.000001, 'Even overlapping pulses stay within the bounded displacement');
}
for (const now of [50, 100, 200, 400, 800, 1600, 2600, 3500, 3990]) for (let distance = 0; distance < 1200; distance += 17) {
  const value = sample(350 + distance, 400, {...pulse, now});
  assert(value.y <= .000001, 'The pulse never turns into an alternating sine trough');
  near(value.x, 0, 'The pulse retains horizontal line alignment');
}
function crestDistance(now) {
  let best = {distance: 0, lift: 0};
  for (let distance = 0; distance < 1100; distance += 4) {
    const lift = -sample(350 + distance, 400, {...pulse, now}).y;
    if (lift > best.lift) best = {distance, lift};
  }
  assert(best.lift > .1, 'The outgoing crest remains observable during its travel');
  return best.distance;
}
assert(crestDistance(900) > crestDistance(400) + 40, 'The raised crest propagates outward over time');
for (const [width, height] of [[375, 812], [1920, 960], [2560, 1305]]) {
  const responsive = {...field, width, height};
  near(sample(300, 360, responsive).y, pull.y, 'Hover strength is measured in CSS pixels across viewports');
  near(sample(380, 400, {...pulse, width, height}).y, rx.y, 'Pulse timing is independent of viewport resolution');
}
const tail = state({spot: null, power: 0, now: 200, trails: [{x: 350, y: 400, time: 0}]});
assert(sample(350, 400, tail).y < -4, 'A pointer trail retains a visible raised surface after the cursor has moved on');
assert(-sample(350, 400, {...tail, now: 1300}).y < -sample(350, 400, tail).y, 'The raised trail releases gently over time');
assert.deepEqual(plain(sample(350, 400, {...tail, now: 2200})), {x: 0, y: 0}, 'Expired trails restore the exact original line position');
assert.deepEqual(plain(sample(350, 400, {...tail, now: -1})), {x: 0, y: 0}, 'A future trail is not rendered');

const drifting = state({spot: null, power: 0, settings: {...field.settings, ambientEnabled: true, ambientStrength: .3}});
let ambientSamples = 0;
for (let x = 0; x <= 1800; x += 100) for (let y = 0; y <= 900; y += 100) {
  const value = sample(x, y, drifting);
  near(value.x, 0, 'Ambient relief preserves the horizontal alignment of the source lines');
  assert(Math.abs(value.y) <= 6.600001, 'Default ambient relief remains much gentler than direct interaction');
  if (Math.abs(value.y) > .1) ambientSamples++;
}
assert(ambientSamples > 30, 'The background has a continuous raised surface without requiring the cursor');
const originalAmbient = sample(230, 460, drifting).y;
near(sample(270, 430, {...drifting, ambient: {x: 40, y: -30, time: 99}}).y, originalAmbient, 'Directional phase translates the continuous field smoothly');
near(sample(230, 460, {...drifting, now: 99999}).y, originalAmbient, 'Field phase is integrated by the controller, with no wall-clock jump');
near(sample(230, 460, {...drifting, settings: {...drifting.settings, ambientStrength: .6}}).y, originalAmbient * 2, 'Ambient strength scales the gentle relief continuously');
for (const disabled of [
  {...drifting, reducedMotion: true},
  {...drifting, settings: {...drifting.settings, ambientEnabled: false}},
  {...drifting, settings: {...drifting.settings, ambientStrength: 0}},
]) assert.deepEqual(plain(sample(230, 460, disabled)), {x: 0, y: 0}, 'Disabled or reduced ambient motion leaves the original coordinates');

const heroCanvas = p.created.find(canvas => canvas.dataset.lineWarp === 'hero');
assert.equal(p.created.length, 3, 'The renderer creates one replacement for each existing line plane');
assert(p.created.every(canvas => canvas.hidden && canvas.attributes['aria-hidden'] === 'true'));
assert.equal(p.api.render(field), true);
assert.equal(p.sources.hero.style.visibility, 'hidden', 'The original is hidden after successful painting');
assert.equal(heroCanvas.hidden, false);
assert(Number(heroCanvas.dataset.bentRows) > 0, 'The real renderer bends original rows, not a light overlay');
assert(heroCanvas.context.polygons.length > 0);
assert(heroCanvas.context.rectangles.length > 0, 'Rows outside the influence stay straight');
for (const polygon of heroCanvas.context.polygons) {
  const half = polygon.length / 2, top = polygon.slice(0, half), bottom = polygon.slice(half).reverse();
  assert.equal(top.length, bottom.length);
  for (let i = 0; i < top.length; i++) {
    near(top[i][0], bottom[i][0], 'Both edges share the same horizontal deformation');
    near(bottom[i][1] - top[i][1], 2.00003, 'Row thickness is conserved', .011);
  }
}
assert(heroCanvas.context.polygons.some(polygon => polygon.slice(0, polygon.length / 2).some(point => Math.abs(point[1] - polygon[0][1]) > .001)), 'The replacement polygons change their actual y coordinates');
assert.equal(heroCanvas.context.fills.at(-1).color, '#fff');
near(heroCanvas.context.fills.at(-1).alpha, .16, 'The white line opacity comes from the original SVG');
const passes = heroCanvas.context.fills.slice(-3);
near(passes[0].alpha, .8, 'The black shadow retains the original group opacity rather than the weaker white-stroke alpha');
assert.equal(passes[0].color, '#000'); near(passes[0].shadowBlur, 4.38848, 'The shadow matches the source Gaussian extent');
assert.equal(passes[1].composite, 'destination-out', 'The hard geometry is removed from the shadow pass');
assert.equal(passes[1].alpha, 1); assert.equal(passes[2].composite, 'source-over');
const pose = JSON.stringify(heroCanvas.context.polygons);
p.api.render(field); assert.equal(JSON.stringify(heroCanvas.context.polygons), pose, 'The same input yields exactly the same geometry');
p.api.reset(); assert.equal(p.sources.hero.style.visibility, ''); assert.equal(heroCanvas.hidden, true);
p.api.render(drifting);
assert.equal(heroCanvas.hidden, false, 'Autonomous motion paints the real row geometry without a cursor');
assert(heroCanvas.context.polygons.length > 100 && heroCanvas.context.rectangles.length === 0, 'The gentle ambient field covers the horizontal source rows continuously');
p.api.reset();
p.api.render(state({reducedMotion: true}));
assert.equal(p.sources.hero.style.visibility, '', 'Reduced motion keeps the original artwork visible');
assert.equal(heroCanvas.hidden, true);

const aboutState = state({scene: {...field.scene, x: 600, y: 200, width: 220, height: 220, decorationOpacity: 0, lightProgress: .5}});
p.api.render(aboutState);
assert.equal(heroCanvas.hidden, true, 'The finished mini portrait does not keep a deformed hero background');
for (const kind of ['dark', 'light']) {
  const canvas = p.created.find(candidate => candidate.dataset.lineWarp === kind);
  assert.equal(canvas.hidden, false, 'Both about planes coexist during the existing theme fade');
  assert.equal(p.sources[kind].style.visibility, 'hidden');
  near(canvas.context.fills.at(-1).alpha, kind === 'dark' ? .16 : .03, `${kind} plane keeps its original opacity`);
  near(canvas.context.fills.at(-3).alpha, kind === 'dark' ? .8 : .15, `${kind} plane keeps the original shadow opacity`);
}
p.api.reset();
const edgeState = state({spot: {x: 350, y: 950}, settings: {...field.settings, hoverStrength: 1, radius: 320}});
p.api.render(edgeState);
assert(heroCanvas.context.polygons.some(polygon => {
  const top = polygon.slice(0, polygon.length / 2);
  return top[0][1] > 1012 && top.some(point => point[1] < 960);
}), 'Rows farther than the old overscan can still lift into the viewport near the lower edge');
p.api.reset();
heroCanvas.context.failFill = true; p.api.render(field);
assert.equal(p.sources.hero.style.visibility, '', 'A failed canvas frame cannot hide the original artwork');
assert.equal(heroCanvas.hidden, true);
assert.equal(heroCanvas.dataset.state, 'unavailable');
heroCanvas.context.failFill = false;
p.sources.hero.src = './assets/images/scanlines-2k.svg'; p.api.measure();
assert.equal(p.api.render(field), true, 'Switching to the 2K source rebuilds cached geometry');
p.api.destroy();
assert(p.created.every(canvas => !canvas.parentElement), 'Destroy removes every replacement canvas');
assert(Object.values(p.sources).every(source => source.style.visibility === ''), 'Destroy restores every original SVG');
assert.equal(p.window.BackgroundLineWarp, undefined);
console.log('Line deformation checks passed: local field continuity, click waves, bounded displacement, real polygon bending, thickness/opacity, theme planes, reversibility and safe fallback.');
