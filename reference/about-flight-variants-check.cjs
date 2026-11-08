const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const makeFlight = require('./about-flight-harness.cjs');

const root = path.join(__dirname, '..');
const currentFile = path.join(root, 'about-flight.js');
const originalFile = path.join(__dirname, 'about-animation-first', 'about-flight.js');
const geometry = {width: 1440, height: 800, textY: 485, topBlurNear: 28, topBlurFar: 107};
const near = (a, b, tolerance, message) => assert(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`);
const pose = glyph => {
  const value = glyph.style.getPropertyValue('--flight-letter-transform');
  const match = /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) rotate\(([-\d.]+)deg\)$/.exec(value);
  assert(match, `A finite, complete glyph pose is required: ${value}`);
  return {x: Number(match[1]), y: Number(match[2]), rotation: Number(match[3]), opacity: Number(glyph.style.getPropertyValue('--flight-letter-opacity'))};
};

// Run the actual preserved engine as an independent regression oracle.
const preserved = makeFlight(originalFile);
const first = makeFlight(currentFile);
first.api.update(0, {variant: 'first'});
const oldMetrics = preserved.api.measure(geometry);
const firstMetrics = first.api.measure(geometry);
for (const key of ['start', 'end', 'span', 'rows', 'glyphs']) near(firstMetrics[key], oldMetrics[key], 1e-8, `Legacy ${key} is preserved`);
preserved.layout(false); first.layout(false);
for (const after of [0, 25, 80, 155, 220, 300, 370, 450, 220, 80, 0]) {
  preserved.api.update(after, {topBlur: 23});
  first.api.update(after, {variant: 'first', topBlur: 23, fadeSpeed: 2});
  const old = preserved.snapshot(), actual = first.snapshot();
  assert.equal(actual.progress, old.progress, 'Legacy CSS timeline progress is unchanged');
  old.words.forEach((properties, index) => {
    for (const [key, value] of Object.entries(properties)) assert.equal(actual.words[index][key], value, `Legacy word property ${key} is unchanged`);
  });
  old.glyphs.forEach((glyph, index) => {
    assert.equal(actual.glyphs[index].left, glyph.left, 'Legacy kerning/positions are unchanged');
    assert.equal(actual.glyphs[index].filter, glyph.filter, 'Legacy top-blur filters match the preserved engine');
    for (const [key, value] of Object.entries(glyph.properties)) assert.equal(actual.glyphs[index].properties[key], value, `Legacy glyph property ${key} is unchanged`);
  });
}
const legacyCss = fs.readFileSync(path.join(__dirname, 'about-animation-first', 'about-flight.css'), 'utf8');
const currentCss = fs.readFileSync(path.join(root, 'about-flight.css'), 'utf8');
for (const block of legacyCss.match(/[^{}]+\{[^{}]*\}/g)) assert(currentCss.includes(block.trim()), 'Every legacy CSS declaration block remains intact');

const second = makeFlight(currentFile);
second.api.configure({triggerMode: 'viewport'});
const metrics = second.api.measure(geometry);
assert.equal(second.api.getState().variant, 'second', 'The word-first iteration is the default');
assert.equal(second.api.getState().fadeSpeed, 1, 'Fade speed defaults to one');
assert.equal(second.copy.dataset.flightVariant, 'second');
const count = second.nodeCount();
const words = second.words(), glyphs = second.glyphs();
assert.equal(glyphs.length, 21, 'Only one clear copy has animated glyphs');
for (const content of second.contents.slice(1)) {
  assert.equal(content.querySelectorAll('.about-flight__glyph').length, 0, 'Lower blur planes remain lightweight whole-text copies');
  assert.equal(content.textContent, 'Turn softlyThen scatter');
}
for (const glyph of glyphs) assert.equal(glyph.attributes['aria-hidden'], 'true', 'Visual glyphs cannot duplicate semantic text');
second.layout(false);
const distance = p => metrics.start + metrics.span * p;
second.api.update(distance(.12), {variant: 'second', topBlur: 0});
const carried = words[0].querySelectorAll('.about-flight__glyph');
const carriedPoses = carried.map(pose);
assert.equal(words[0].style.getPropertyValue('--flight-word-active'), '1', 'The first word activates before detachment');
assert.equal(words[2].style.getPropertyValue('--flight-word-active'), '0', 'The next visual row waits its turn');
assert(carriedPoses.every(item => item.opacity === 1), 'The carried word stays fully visible');
assert(Math.hypot(carriedPoses[0].x, carriedPoses[0].y) > .1, 'The complete word has already moved before its letters separate');
for (let index = 1; index < carried.length; index++) {
  const a = carriedPoses[index - 1], b = carriedPoses[index];
  near(a.rotation, b.rotation, .001, 'Carried letters share exactly the same rotation');
  const originalSpacing = parseFloat(carried[index].style.left) - parseFloat(carried[index - 1].style.left);
  const dx = originalSpacing + b.x - a.x, dy = b.y - a.y;
  near(Math.hypot(dx, dy), originalSpacing, .003, 'Rigid word motion preserves inter-letter distance');
  near(Math.atan2(dy, dx) * 180 / Math.PI, a.rotation, .008, 'Glyph offsets rotate around the common word center');
}
second.api.update(distance(.5), {topBlur: 0});
const detached = carried.map(pose);
assert(new Set(detached.map(item => item.rotation)).size > 1, 'Detached letters gain independent rotations');
assert(Math.abs(Math.hypot(10 + detached[1].x - detached[0].x, detached[1].y - detached[0].y) - 10) > .5, 'Letter spacing separates after the carry phase');
const ordered = detached.map(item => ({distance: Math.hypot(item.x, item.y), opacity: item.opacity})).sort((a, b) => a.distance - b.distance);
assert(ordered[0].opacity > ordered.at(-1).opacity, 'The farthest-travelled letter fades earlier than the nearer one');
for (let index = 1; index < ordered.length; index++) assert(ordered[index].opacity <= ordered[index - 1].opacity + 1e-5, 'Sequential fade follows actual travel distance');
const midSnapshot = second.snapshot();
const beforeRepeat = second.writes();
second.api.update(distance(.5), {topBlur: 0});
assert.equal(second.writes(), beforeRepeat, 'An identical stopped frame writes no duplicate glyph styles');
second.api.update(distance(.8));
second.api.update(distance(.5));
assert.deepEqual(second.snapshot(), midSnapshot, 'Reverse scroll reconstructs the same glyph poses and opacities');
second.api.update(distance(.5), {variant: 'first'});
assert.equal(second.copy.dataset.flightVariant, 'first', 'Iteration switches apply immediately at rest');
second.api.update(distance(.5), {variant: 'second'});
assert.deepEqual(second.snapshot(), midSnapshot, 'Switching back restores the same second-iteration composition');
for (const variant of [null, 'third', 0, true]) {
  second.api.update(distance(.5), {variant});
  assert.equal(second.api.getState().variant, 'second', 'Invalid iteration values preserve the selected one');
}

second.api.update(distance(.5), {fadeSpeed: .5});
const slow = carried.map(pose);
second.api.update(distance(.5), {fadeSpeed: 2});
const fast = carried.map(pose);
assert(fast.some((item, index) => item.opacity < slow[index].opacity), 'Higher fade speed makes letters disappear earlier');
fast.forEach((item, index) => {
  assert(item.opacity <= slow[index].opacity, 'Higher fade speed never postpones a letter fade');
  assert.equal(item.x, slow[index].x, 'Fade speed does not alter letter travel');
  assert.equal(item.y, slow[index].y, 'Fade speed does not alter vertical motion');
  assert.equal(item.rotation, slow[index].rotation, 'Fade speed does not alter rotation');
});
for (const [input, expected] of [[-1, .5], [8, 2], [1.35, 1.35]]) {
  second.api.update(distance(.5), {fadeSpeed: input});
  near(second.api.getState().fadeSpeed, expected, 1e-8, 'Fade-speed validation clamps the public range');
}
for (const invalid of [NaN, Infinity, '1.5', true, null]) {
  second.api.update(distance(.5), {fadeSpeed: invalid});
  near(second.api.getState().fadeSpeed, 1.35, 1e-8, 'Invalid fade-speed values preserve the last setting');
}

// A deliberately high band exercises the second iteration's actual pose in
// the top mask, independent of how quickly the current fade setting hides it.
second.layout(true);
second.api.measure({...geometry, topBlurNear: 400, topBlurFar: 500});
second.layout(false);
second.api.update(distance(.3), {topBlur: 10, fadeSpeed: .5});
assert(glyphs.some(glyph => glyph.style.filter !== 'none'), 'Second-iteration poses participate in the fixed upper blur');
second.api.update(distance(.3), {topBlur: 0});
assert(glyphs.every(glyph => glyph.style.filter === 'none'), 'The upper blur can be disabled without additional scroll');
second.api.update(distance(.3), {topBlur: 40});
assert(glyphs.some(glyph => glyph.style.filter !== 'none'), 'The upper blur can be restored at the same position');
second.api.update(distance(.3), {reducedMotion: true});
assert.equal(second.copy.dataset.flightReduced, 'true');
assert(glyphs.every(glyph => glyph.style.filter === 'none'), 'Reduced motion removes per-glyph blur');
second.api.update(distance(.3), {reducedMotion: false});
assert.equal(second.copy.dataset.flightReduced, 'false');
assert(glyphs.some(glyph => glyph.style.filter !== 'none'), 'Restoring motion restores the corresponding upper mask');

// Use the slowest fade on a narrow viewport. Even here, visible centers must
// stay inside the edge safety margin instead of being chopped by clipping.
second.layout(true);
second.resize({left: 16, top: 474, width: 343});
const mobile = second.api.measure({width: 375, height: 812, textY: 474, topBlurNear: 55.5, topBlurFar: 160.5});
const bases = glyphs.map(glyph => ({...glyph.getBoundingClientRect()}));
second.layout(false);
let sawSafetyFade = false;
for (let after = 1; after <= mobile.end + 1; after += 2) {
  second.api.update(after, {fadeSpeed: .5, topBlur: 0});
  glyphs.forEach((glyph, index) => {
    const current = pose(glyph);
    const centerX = bases[index].left + parseFloat(glyph.style.left) + 5 + current.x;
    const centerY = 474 - after + (index < 10 ? 24 : 72) + current.y;
    const edge = Math.min(centerX, 375 - centerX, centerY, 812 - centerY);
    if (edge <= 48 * .65) {
      assert.equal(current.opacity, 0, 'Letters finish fading before their centers reach the viewport safety margin');
      sawSafetyFade = true;
    }
  });
}
assert(sawSafetyFade, 'The narrow viewport test crosses a real edge safety boundary');
assert(glyphs.every(glyph => pose(glyph).opacity === 0), 'Every glyph is gone at the final measured endpoint');
assert.equal(second.nodeCount(), count, 'Scroll, settings, resize and variant switches never create additional glyphs');
second.api.update(0);
assert(words.every(word => word.style.getPropertyValue('--flight-word-active') === '0'), 'Reverse scroll restores every source word');
console.log('Flight variant checks passed: preserved first engine/CSS, rigid word carry, delayed separation, distance-based sequential fade, live fade speed, edge safety, reverse/switch determinism, upper blur, reduced motion, no update layouts and no duplicate glyphs.');
