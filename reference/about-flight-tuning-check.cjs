const assert = require('node:assert/strict');
const path = require('node:path');
const makeFlight = require('./about-flight-harness.cjs');

const root = path.join(__dirname, '..');
const current = path.join(root, 'about-flight.js');
const secondSnapshot = path.join(__dirname, 'about-animation-second', 'about-flight.js');
const firstSnapshot = path.join(__dirname, 'about-animation-first', 'about-flight.js');
const geometry = {width: 1440, height: 800, textY: 485, topBlurNear: 28, topBlurFar: 107};
const defaults = {startOffset: 0, wordForce: 1, letterForce: 1, fadeBoundary: 1, fadeSoftness: .12 / .205, fadeShape: 'distance', fadeOrigin: 'screen', detach: .14, rotation: 1, showGuide: false};
const near = (a, b, tolerance, message) => assert(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`);
const pose = glyph => {
  const transform = glyph.style.getPropertyValue('--flight-letter-transform');
  const parts = /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) rotate\(([-\d.]+)deg\)$/.exec(transform);
  assert(parts, `Complete finite transform required: ${transform}`);
  const result = {x: Number(parts[1]), y: Number(parts[2]), rotation: Number(parts[3]), opacity: Number(glyph.style.getPropertyValue('--flight-letter-opacity'))};
  assert(Object.values(result).every(Number.isFinite), 'Every tuned pose remains finite');
  assert(result.opacity >= 0 && result.opacity <= 1, 'Every tuned opacity remains within range');
  return result;
};
const poses = page => page.glyphs().map(pose);
const frame = (page, fraction, options = {}) => {
  const metrics = page.api.getMetrics();
  page.api.update(metrics.start + metrics.span * fraction, {topBlur: 0, ...options});
  return poses(page);
};
const sameMotion = (actual, expected, label) => actual.forEach((glyph, index) => {
  for (const key of ['x', 'y', 'rotation']) assert.equal(glyph[key], expected[index][key], `${label}: ${key}`);
});

const page = makeFlight(current);
page.api.configure({triggerMode: 'viewport'});
assert.equal(typeof page.api.configure, 'function', 'The tuning engine exposes configure');
assert.equal(typeof page.api.getMetrics, 'function', 'The tuning engine exposes cached metrics');
page.api.measure(geometry);
page.layout(false);
for (const [key, expected] of Object.entries(defaults)) assert.equal(page.api.getState()[key], expected, `Default ${key} preserves the saved second iteration`);
const preserved = makeFlight(secondSnapshot);
const preservedMetrics = preserved.api.measure(geometry);
preserved.layout(false);
for (const after of [0, 25, 65, 115, 180, 250, 330, 420, 180, 25, 0]) {
  preserved.api.update(after, {variant: 'second', topBlur: 17, fadeSpeed: 1});
  page.api.update(after, {variant: 'second', topBlur: 17, fadeSpeed: 1});
  assert.deepEqual(poses(page), poses(preserved), 'Untouched tuning exactly preserves second-iteration poses and opacity');
  assert.deepEqual(page.glyphs().map(glyph => glyph.style.filter), preserved.glyphs().map(glyph => glyph.style.filter), 'Untouched tuning preserves the actual-position upper blur');
}
for (const key of ['start', 'end', 'span']) near(page.api.getMetrics()[key], preservedMetrics[key], 1e-8, `Default ${key} preserves the existing scroll budget`);

const initialNodes = page.nodeCount();
const beforeConfigure = page.snapshot();
const beforeDataset = {...page.copy.dataset};
const beforeWrites = page.writes();
page.api.configure({wordForce: 2, letterForce: .6, startOffset: .25, fadeShape: 'ellipse', showGuide: true});
assert.equal(page.writes(), beforeWrites, 'Configure does not write element styles');
assert.deepEqual({...page.copy.dataset}, beforeDataset, 'Configure does not mutate DOM datasets');
assert.deepEqual(page.snapshot(), beforeConfigure, 'Configure does not repaint a stopped frame by itself');
assert.equal(page.nodeCount(), initialNodes, 'Configure never creates replacement glyphs');
assert.equal(page.api.getState().wordForce, 2, 'Configure still changes the cached state');
page.api.configure(defaults);

page.api.configure({wordForce: 0, letterForce: 0, rotation: 0});
const still = frame(page, .55);
assert(still.every(item => item.x === 0 && item.y === 0 && item.rotation === 0), 'Zero independent forces and rotation fully stop glyph displacement');
page.api.configure({wordForce: 2, letterForce: 0, rotation: 0});
const wordOnly = frame(page, .55);
const firstWord = page.words()[0].querySelectorAll('.about-flight__glyph');
const wordOnlyPoses = firstWord.map(pose);
assert(Math.hypot(wordOnlyPoses[0].x, wordOnlyPoses[0].y) > 1, 'Word force still carries a complete word when letter force is zero');
for (const item of wordOnlyPoses) {
  assert.equal(item.x, wordOnlyPoses[0].x, 'Word-only translation remains rigid after detach time');
  assert.equal(item.y, wordOnlyPoses[0].y, 'Word-only translation keeps shared vertical movement');
}
page.api.configure({wordForce: 0, letterForce: 2, rotation: 0});
const earlyLetters = frame(page, .1);
assert(earlyLetters.every(item => item.x === 0 && item.y === 0), 'Letter force does not move the early whole-word phase');
const letterOnly = frame(page, .55);
assert(letterOnly.some(item => Math.hypot(item.x, item.y) > 1), 'Letter force produces displacement after detach without word force');
assert(new Set(firstWord.map(glyph => pose(glyph).y)).size > 1, 'Detached letter movement is independent inside one word');
page.api.configure({letterForce: 1, wordForce: 0, rotation: 0, detach: .6});
const lateDetach = frame(page, .4);
assert(lateDetach.every(item => item.x === 0 && item.y === 0), 'Late detach keeps letters attached until their configured threshold');
page.api.configure({detach: 0});
assert(frame(page, .4).some(item => Math.hypot(item.x, item.y) > 1), 'Early detach releases the same letters sooner');
page.api.configure({...defaults, rotation: 0});
assert(frame(page, .5).every(item => item.rotation === 0), 'Zero rotation disables both word and letter angles');
page.api.configure({rotation: 2});
assert(frame(page, .5).some(item => Math.abs(item.rotation) > 1), 'Rotation can be increased independently');
page.api.configure(defaults);

// Zero forces never reach a distance boundary. They still need a continuous
// last fade, rather than a hard visibility cut at the measured endpoint.
page.api.configure({wordForce: 0, letterForce: 0, rotation: 0, fadeBoundary: 2});
const finalFade = [.9, .94, .98, 1.06].map(p => frame(page, p)[0].opacity);
assert(finalFade.some(value => value > 0 && value < 1), 'A stationary glyph passes through a soft completion fade');
for (let index = 1; index < finalFade.length; index++) assert(finalFade[index] <= finalFade[index - 1], 'Completion fades continuously toward the endpoint');
assert.equal(finalFade.at(-1), 0, 'Even a stationary glyph finishes before the final budget');
page.api.configure(defaults);

// Shape controls operate on fade, not on flight trajectories.
// Start lower than the mask origin so both its upper and lower edges are
// exercised: an upward-only sample can correctly make box and linear match.
page.layout(true);
page.api.measure({...geometry, textY: 700});
page.layout(false);
const shapeSignatures = new Map();
for (const shape of ['distance', 'circle', 'ellipse', 'linear', 'box']) {
  page.api.configure({...defaults, fadeShape: shape});
  const signature = [];
  for (const p of [.15, .25, .35, .45, .55, .65, .75]) {
    const actual = frame(page, p);
    page.api.configure({fadeShape: 'distance'});
    const baseline = frame(page, p);
    sameMotion(actual, baseline, `${shape} changes only the fade mask`);
    page.api.configure({fadeShape: shape});
    signature.push(actual.map(item => item.opacity));
  }
  shapeSignatures.set(shape, JSON.stringify(signature));
}
assert.equal(new Set(shapeSignatures.values()).size, 5, 'Every fade shape produces a distinct visible mask');
page.layout(true); page.api.measure(geometry); page.layout(false);
page.api.configure({...defaults, fadeBoundary: .5});
const smallBoundary = frame(page, .5);
page.api.configure({fadeBoundary: 2});
const largeBoundary = frame(page, .5);
sameMotion(largeBoundary, smallBoundary, 'Changing boundary size preserves motion');
assert(largeBoundary.some((item, index) => item.opacity > smallBoundary[index].opacity), 'A larger boundary preserves more letters at the same flight distance');
largeBoundary.forEach((item, index) => assert(item.opacity >= smallBoundary[index].opacity, 'A larger boundary never advances the fade'));
page.api.configure({...defaults, fadeSoftness: .05});
const sharp = frame(page, .5);
page.api.configure({fadeSoftness: 1});
const soft = frame(page, .5);
sameMotion(soft, sharp, 'Softness changes only the fade');
assert(soft.some((item, index) => item.opacity !== sharp[index].opacity), 'Softness controls the fade transition width');
const originSignatures = [];
for (const origin of ['text', 'screen']) {
  page.api.configure({...defaults, fadeShape: 'circle', fadeOrigin: origin});
  originSignatures.push([.2, .35, .5, .7].map(p => frame(page, p).map(item => item.opacity)));
}
assert.notDeepEqual(originSignatures[0], originSignatures[1], 'Text and viewport origins produce different spatial fade masks');

// First iteration remains frozen even while new tuning values are retained.
const original = makeFlight(firstSnapshot);
const originalMetrics = original.api.measure(geometry);
original.layout(false);
page.api.configure({variant: 'first', startOffset: .5, wordForce: 3, letterForce: 0, fadeBoundary: .25, fadeSoftness: 1, fadeShape: 'box', fadeOrigin: 'text', detach: .6, rotation: 0});
for (const key of ['start', 'end', 'span']) near(page.api.getMetrics()[key], originalMetrics[key], 1e-8, `First iteration ignores tuned ${key}`);
for (const after of [0, 90, 180, 300, 180, 0]) {
  original.api.update(after, {topBlur: 19});
  page.api.update(after, {variant: 'first', topBlur: 19});
  const expected = original.snapshot(), actual = page.snapshot();
  assert.equal(actual.progress, expected.progress, 'First iteration ignores timing tuning');
  expected.glyphs.forEach((glyph, index) => {
    assert.equal(actual.glyphs[index].filter, glyph.filter, 'First upper blur remains frozen under new tuning');
    for (const [key, value] of Object.entries(glyph.properties)) assert.equal(actual.glyphs[index].properties[key], value, `First ${key} remains frozen`);
  });
}
page.api.configure({...defaults, variant: 'second'});
const resetPose = frame(page, .5);
page.api.configure({wordForce: 3, letterForce: .2, detach: .5, rotation: 0}); frame(page, .75);
page.api.configure(defaults);
assert.deepEqual(frame(page, .5), resetPose, 'Resetting tuning restores deterministic poses after extreme settings');
frame(page, .8);
assert.deepEqual(frame(page, .5), resetPose, 'Reverse scroll remains deterministic after tuning');

const timing = makeFlight(current);
timing.api.configure({triggerMode: 'viewport'});
const highGeometry = {...geometry, textY: 800};
const base = timing.api.measure(highGeometry);
assert(base.start > 0, 'Timing fixture starts after a real reading interval');
timing.layout(false);
timing.api.configure({startOffset: -.5});
const early = timing.api.getMetrics();
assert.equal(early.start, 0, 'An early offset cannot move effective start below zero');
near(early.end, base.end - base.start, 1e-8, 'Early budget shifts by the actual clamped start delta');
timing.api.configure({startOffset: .5});
const late = timing.api.getMetrics();
near(late.start, base.start + 400, 1e-8, 'Late start uses the configured fraction of viewport height');
near(late.end, base.end + 400, 1e-8, 'Late start extends the full glyph scroll budget');
timing.api.update(late.start - 1, {topBlur: 0});
assert(timing.words().every(word => word.style.getPropertyValue('--flight-word-active') === '0'), 'Words remain intact before the delayed start');
timing.api.update(late.end + 1, {topBlur: 0});
assert(poses(timing).every(item => item.opacity === 0), 'The extended endpoint still completes every glyph');
timing.layout(true); timing.resize({left: 16, top: 474, width: 343});
timing.api.configure({startOffset: .25});
timing.api.measure({width: 375, height: 812, textY: 474});
timing.layout(false);
near(timing.api.getMetrics().start, 812 * .25, 1e-8, 'Resize recomputes timing offset using the new viewport height');

const ranges = {startOffset: [-.5, .5], wordForce: [0, 3], letterForce: [0, 3], fadeBoundary: [.25, 2], fadeSoftness: [.05, 1], detach: [0, .6], rotation: [0, 2]};
for (const [key, [min, max]] of Object.entries(ranges)) {
  page.api.configure({[key]: min - 5}); assert.equal(page.api.getState()[key], min, `${key} clamps low`);
  page.api.configure({[key]: max + 5}); assert.equal(page.api.getState()[key], max, `${key} clamps high`);
  for (const invalid of [NaN, Infinity, -Infinity, true, null, '1', {}, []]) {
    page.api.configure({[key]: invalid}); assert.equal(page.api.getState()[key], max, `${key} ignores invalid values`);
  }
}
page.api.configure({fadeShape: 'ellipse', fadeOrigin: 'text', showGuide: true});
for (const invalid of ['cursor', 'unknown', '', 0, true, null]) {
  page.api.configure({fadeOrigin: invalid}); assert.equal(page.api.getState().fadeOrigin, 'text', 'Unsupported origins are ignored');
}
for (const invalid of ['unknown', '', 0, true, null]) {
  page.api.configure({fadeShape: invalid}); assert.equal(page.api.getState().fadeShape, 'ellipse', 'Unsupported fade shapes are ignored');
}
for (const invalid of ['false', 0, null, undefined]) {
  page.api.configure({showGuide: invalid}); assert.equal(page.api.getState().showGuide, true, 'Guide setting accepts booleans only');
}
assert.equal(page.nodeCount(), initialNodes, 'Tuning and resets never recreate glyph DOM');
console.log('Flight tuning checks passed: frozen first/default second baselines, pure cached configure, independent forces/rotation/detach, fade shapes/origins/boundary/softness, effective timing/budget and resize, validation and deterministic reverse/reset.');
