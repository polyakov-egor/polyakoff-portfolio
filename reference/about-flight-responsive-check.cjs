const assert = require('node:assert/strict');
const path = require('node:path');
const makeFlight = require('./about-flight-harness.cjs');
const file = path.join(__dirname, '..', 'about-flight.js');
const firstSnapshot = path.join(__dirname, 'about-animation-first', 'about-flight.js');
const near = (a, b, tolerance, message) => assert(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`);
const paragraphs = [
  'I’m a designer', 'specializing in websites,', 'branding and redesigns.',
  'I’m passionate about', 'my work and always',
  ['aim to deliver fresh ideas,', 'clarity, and high-quality', 'results']
];
const scenarios = [
  {name: 'QHD', width: 2560, height: 1305, font: 56, textY: 813, portraitBottom: 560},
  {name: 'FHD960', width: 1920, height: 960, font: 48, textY: 540, portraitBottom: 440},
  {name: 'FHD1080', width: 1920, height: 1080, font: 48, textY: 607.5, portraitBottom: 482.5},
  {name: 'Desktop1440', width: 1440, height: 800, font: 40, textY: 485, portraitBottom: 371},
  {name: 'Tablet', width: 768, height: 1024, font: 40, textY: 711, portraitBottom: 469},
  {name: 'Mobile', width: 375, height: 812, font: 32, textY: 474, portraitBottom: 370},
  {name: 'ShortLandscape', width: 1920, height: 600, font: 48, textY: 337.5, portraitBottom: 312.5},
  {name: 'LeadingInset', width: 1440, height: 800, font: 40, textY: 485, portraitBottom: 371, firstRowInset: 7}
];
function harnessOptions(frame) {
  const textWidth = Math.min(622, frame.width - 32);
  return {
    rect: {left: (frame.width - textWidth) / 2, top: frame.textY, width: textWidth},
    viewportWidth: frame.width, viewportHeight: frame.height,
    lineHeight: frame.font * 1.2, charAdvance: frame.font * .46,
    firstRowInset: frame.firstRowInset || 0,
    paragraphs, responsiveBreaks: true, autoHeight: true
  };
}
function geometry(frame) {return {...frame, topBlurNear: frame.height * .035, topBlurFar: frame.height * .135};}
function pose(glyph) {
  const transform = glyph.style.getPropertyValue('--flight-letter-transform');
  const match = /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) rotate\(([-\d.]+)deg\)$/.exec(transform);
  assert(match, `A complete glyph pose is available: ${transform}`);
  const item = {x: Number(match[1]), y: Number(match[2]), rotation: Number(match[3]), opacity: Number(glyph.style.getPropertyValue('--flight-letter-opacity'))};
  assert(Object.values(item).every(Number.isFinite), 'Responsive glyph values stay finite');
  assert(item.opacity >= 0 && item.opacity <= 1);
  return item;
}

const cases = [];
for (const frame of scenarios) {
  const page = makeFlight(file, harnessOptions(frame));
  assert.equal(page.api.getState().triggerMode, 'portrait', 'New pages default to the portrait-relative trigger');
  near(page.api.getState().triggerGapPx, 100, 1e-8, 'The initial trigger sits 100 CSS pixels below the portrait');
  const metrics = page.api.measure(geometry(frame));
  const rows = page.visualRows().filter(row => row.words.length);
  const firstRowTop = rows[0].top - frame.textY;
  const textHeight = page.contents[0].offsetHeight;
  const expectedStart = Math.max(0, frame.textY + firstRowTop - frame.portraitBottom - 100);
  const lineHeight = frame.font * 1.2;
  near(metrics.start, expectedStart, .001, `${frame.name}: start follows the first row top relative to the portrait`);
  near(metrics.span / lineHeight, 1305 * .38 / 67.2, .00001, `${frame.name}: flight pace is measured in text lines, not current viewport height`);
  assert.equal(metrics.activeTriggerMode, 'portrait', `${frame.name}: responsive metrics report their active trigger`);
  near(metrics.lineHeight, lineHeight, .001, `${frame.name}: the trigger uses measured line height`);
  assert(Number.isFinite(metrics.triggerY), `${frame.name}: the active trigger line is finite`);
  if (expectedStart > 0) near(metrics.triggerY, frame.portraitBottom + 100, .001, `${frame.name}: trigger line stays 100 pixels below the portrait`);
  assert.equal(metrics.rows, rows.length, `${frame.name}: measurement includes every actual wrapped row`);
  near(metrics.rawStart, frame.textY + firstRowTop - frame.portraitBottom - 100, .001, `${frame.name}: metrics retain the unclamped first-row crossing`);
  const count = page.nodeCount();
  page.layout(false);
  for (const row of rows) {
    const threshold = Math.max(0, row.top - frame.portraitBottom - 100);
    page.api.update(Math.max(0, threshold - .01), {topBlur: 0});
    for (const word of row.words) assert.equal(word.style.getPropertyValue('--flight-word-active'), '0', `${frame.name}: words remain together just before their row reaches the trigger`);
    page.api.update(threshold + .01, {topBlur: 0});
    for (const word of row.words) assert.equal(word.style.getPropertyValue('--flight-word-active'), '1', `${frame.name}: every word in a visual row starts at its own clamped crossing`);
    const actualTop = frame.textY + (row.top - frame.textY) - (threshold + .01);
    near(actualTop, Math.min(row.top, frame.portraitBottom + 100) - .01, .001, `${frame.name}: rows already inside activate immediately, and later rows cross the stationary line`);
    page.api.update(Math.max(0, threshold - .01), {topBlur: 0});
    for (const word of row.words) assert.equal(word.style.getPropertyValue('--flight-word-active'), '0', `${frame.name}: reverse scroll restores each row before the same line`);
  }
  page.api.update(metrics.start + metrics.span * .5, {topBlur: 0});
  const middle = page.snapshot();
  const firstPose = pose(page.glyphs()[0]);
  page.api.update(metrics.end + 1, {topBlur: 0});
  assert(page.glyphs().every(glyph => pose(glyph).opacity === 0), `${frame.name}: the complete measured budget clears every row`);
  page.api.update(metrics.start + metrics.span * .5, {topBlur: 0});
  assert.deepEqual(page.snapshot(), middle, `${frame.name}: responsive flight reverses deterministically`);
  assert.equal(page.nodeCount(), count, `${frame.name}: updates reuse the original glyph DOM`);
  for (const content of page.contents.slice(1)) assert.equal(content.querySelectorAll('.about-flight__glyph').length, 0, `${frame.name}: lower blur copies remain unsplit`);
  cases.push({frame, page, rows, metrics, lineHeight, textHeight, firstPose});
}
const reference = cases[0];
for (const item of cases.filter(item => item.frame.name !== 'LeadingInset')) {
  near(item.firstPose.y / item.lineHeight, reference.firstPose.y / reference.lineHeight, .0001, `${item.frame.name}: vertical motion keeps the same font-relative scale`);
  near(item.firstPose.rotation, reference.firstPose.rotation, .001, `${item.frame.name}: rotation keeps the same per-glyph character`);
  if (item.frame.width >= 1440) near(item.firstPose.x / item.lineHeight, reference.firstPose.x / reference.lineHeight, .0001, `${item.frame.name}: desktop horizontal motion keeps the same font-relative scale`);
}
const fhd = cases.find(item => item.frame.name === 'FHD960');
const tallFhd = cases.find(item => item.frame.name === 'FHD1080');
near(fhd.metrics.span, tallFhd.metrics.span, .001, 'Changing only monitor height cannot speed up or slow down text flight');
assert.equal(cases.find(item => item.frame.name === 'ShortLandscape').metrics.start, 0, 'A short screen clamps an already-passed trigger to zero scroll');
assert(cases.find(item => item.frame.name === 'Mobile').rows.length !== reference.rows.length, 'The responsive fixture genuinely exercises different natural word wrapping');

// A very large gap on a short screen places several rows inside the trigger
// before any scroll is possible. Clamp each crossing separately; clamping
// only the first row would incorrectly make those other rows wait again.
const short = cases.find(item => item.frame.name === 'ShortLandscape');
const edgePage = short.page;
const edgeLine = short.frame.portraitBottom + 400;
const alreadyInside = short.rows.filter(row => row.top <= edgeLine);
const stillOutside = short.rows.filter(row => row.top > edgeLine);
assert(alreadyInside.length > 1 && stillOutside.length > 0, 'The large-gap fixture includes multiple pre-passed rows and a later crossing');
const edgeNodeCount = edgePage.nodeCount();
edgePage.api.configure({triggerGapPx: 400});
const edgeMetrics = edgePage.api.getMetrics();
assert(edgeMetrics.rawStart < 0 && edgeMetrics.start === 0);
edgePage.api.update(0, {topBlur: 0});
assert(edgePage.words().every(word => word.style.getPropertyValue('--flight-word-active') === '0'), 'Exact zero scroll retains the unscattered source text');
edgePage.api.update(.01, {topBlur: 0});
for (const row of alreadyInside) for (const word of row.words) assert.equal(word.style.getPropertyValue('--flight-word-active'), '1', 'Every pre-passed row activates on the first tiny scroll');
for (const row of stillOutside) for (const word of row.words) assert.equal(word.style.getPropertyValue('--flight-word-active'), '0', 'Rows below the large-gap trigger still wait for their own crossing');
for (const row of stillOutside) {
  const threshold = row.top - edgeLine;
  edgePage.api.update(threshold - .01, {topBlur: 0});
  for (const word of row.words) assert.equal(word.style.getPropertyValue('--flight-word-active'), '0', 'A later row does not activate before the large-gap boundary');
  edgePage.api.update(threshold + .01, {topBlur: 0});
  for (const word of row.words) assert.equal(word.style.getPropertyValue('--flight-word-active'), '1', 'A later row activates exactly when its top crosses the large-gap boundary');
}
const maxLag = Math.max(...edgePage.glyphs().map(glyph => Number(glyph.style.getPropertyValue('--flight-lag'))));
const lastRowCrossing = Math.max(0, short.rows.at(-1).top - edgeLine);
near(edgeMetrics.end, lastRowCrossing + edgeMetrics.span * (1 + maxLag), .001, 'The scroll budget uses the last independently clamped row crossing');
edgePage.api.update(edgeMetrics.end + 1, {topBlur: 0});
assert(edgePage.glyphs().every(glyph => pose(glyph).opacity === 0), 'The shortened large-gap budget still clears every glyph');
edgePage.api.update(.01, {topBlur: 0});
for (const row of alreadyInside) for (const word of row.words) assert.equal(word.style.getPropertyValue('--flight-word-active'), '1', 'Reverse scroll restores the correct set of pre-passed rows');
for (const row of stillOutside) for (const word of row.words) assert.equal(word.style.getPropertyValue('--flight-word-active'), '0', 'Reverse scroll restores later rows below their own trigger');
assert.equal(edgePage.nodeCount(), edgeNodeCount, 'Per-row crossing updates never rebuild text or read layout');

const live = reference.page;
const beforeConfigure = live.snapshot(), beforeDataset = {...live.copy.dataset}, beforeWrites = live.writes();
live.api.configure({triggerGapPx: 200});
assert.equal(live.writes(), beforeWrites, 'Changing the trigger gap only updates cached state');
assert.deepEqual(live.snapshot(), beforeConfigure, 'Trigger configuration does not paint before the existing timeline updates');
assert.deepEqual({...live.copy.dataset}, beforeDataset, 'Trigger configuration does not mutate DOM flags');
near(live.api.getMetrics().start, Math.max(0, 813 - 560 - 200), .001, 'The trigger gap can change live without remeasurement');
live.api.configure({triggerMode: 'viewport'});
const legacy = live.api.getMetrics();
assert.equal(legacy.activeTriggerMode, 'viewport');
near(legacy.start, Math.max(0, 813 + reference.textHeight - 1305 * .97), .001, 'Viewport mode restores the former reading interval');
near(legacy.span, 1305 * .38, .001, 'Viewport mode preserves its former timing');
live.api.configure({triggerMode: 'portrait', triggerGapPx: 100});
near(live.api.getMetrics().start, reference.metrics.start, .001, 'Switching back restores the portrait-relative trigger');
for (const [input, expected] of [[-10, 0], [900, 400], [137.5, 137.5]]) {
  live.api.configure({triggerGapPx: input}); assert.equal(live.api.getState().triggerGapPx, expected, 'Gap updates honor the CSS-pixel range');
}
for (const invalid of [NaN, Infinity, -Infinity, true, null, '100', {}, []]) {
  live.api.configure({triggerGapPx: invalid, triggerMode: 'unknown'});
  assert.equal(live.api.getState().triggerGapPx, 137.5, 'Invalid gaps do not replace the current value');
  assert.equal(live.api.getState().triggerMode, 'portrait', 'Unknown trigger modes are ignored');
}

// Reflow the same cached word DOM from QHD to mobile, including responsive BRs.
const mobileFrame = scenarios.find(frame => frame.name === 'Mobile');
const mobileOptions = harnessOptions(mobileFrame);
const beforeResizeNodes = live.nodeCount();
live.api.configure({triggerGapPx: 100}); live.layout(true);
live.resize({...mobileOptions.rect, viewportWidth: mobileFrame.width, viewportHeight: mobileFrame.height, lineHeight: mobileOptions.lineHeight, charAdvance: mobileOptions.charAdvance});
const resized = live.api.measure(geometry(mobileFrame));
const resizedRows = live.visualRows();
live.layout(false);
near(resized.start, 4, .001, 'Resize uses the new portrait bottom rather than a stale viewport percentage');
assert.equal(resized.rows, resizedRows.length, 'Resize remeasures newly wrapped visual rows');
assert.equal(live.nodeCount(), beforeResizeNodes, 'Resize reuses glyphs rather than rebuilding text');

// The first iteration always remains the exact saved viewport animation.
for (const frame of [scenarios[0], mobileFrame]) {
  const old = makeFlight(firstSnapshot, harnessOptions(frame));
  const current = makeFlight(file, harnessOptions(frame));
  current.api.configure({variant: 'first', triggerMode: 'portrait', triggerGapPx: 400});
  const oldMetrics = old.api.measure(geometry(frame));
  const currentMetrics = current.api.measure(geometry(frame));
  for (const key of ['start', 'end', 'span', 'rows', 'glyphs']) near(currentMetrics[key], oldMetrics[key], .001, `${frame.name}: first-iteration ${key} is preserved`);
  assert.equal(currentMetrics.activeTriggerMode, 'viewport', 'The first iteration always uses its saved viewport trigger');
  old.layout(false); current.layout(false);
  for (const fraction of [0, .3, .6, 1, .3, 0]) {
    const after = oldMetrics.start + oldMetrics.span * fraction;
    old.api.update(after, {topBlur: 17}); current.api.update(after, {variant: 'first', topBlur: 17});
    const expected = old.snapshot(), actual = current.snapshot();
    assert.equal(actual.progress, expected.progress, 'First timeline progress remains unchanged');
    expected.glyphs.forEach((glyph, index) => {
      assert.equal(actual.glyphs[index].filter, glyph.filter, 'First upper blur remains unchanged');
      for (const [key, value] of Object.entries(glyph.properties)) assert.equal(actual.glyphs[index].properties[key], value, `First ${key} remains unchanged`);
    });
  }
}
console.log('Responsive flight checks passed: portrait-relative row triggers across QHD/FHD/tablet/mobile/landscape, measured wrapping/leading, font-relative pace/motion, cached mode/gap changes, reverse/resize and frozen first iteration.');
