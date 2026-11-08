const assert = require('node:assert/strict');
const path = require('node:path');
const makeFlight = require('./about-flight-harness.cjs');
const currentFile = path.join(__dirname, '..', 'about-flight.js');
const beforeFile = path.join(__dirname, 'about-animation-before-results', 'about-flight.js');
const paragraphs = [
  'I’m a designer', 'specializing in websites,', 'branding and redesigns.',
  'I’m passionate about', 'my work and always',
  ['aim to deliver fresh ideas,', 'clarity, and high-quality', 'results'],
];
const frames = [
  {width: 375, height: 812, font: 32, textY: 474, portraitBottom: 370},
  {width: 1920, height: 960, font: 48, textY: 540, portraitBottom: 440},
  {width: 2560, height: 1305, font: 56, textY: 813, portraitBottom: 560},
];
const options = (frame, copy = paragraphs) => {
  const width = Math.min(622, frame.width - 32);
  return {
    rect: {left: (frame.width - width) / 2, top: frame.textY, width},
    viewportWidth: frame.width, viewportHeight: frame.height,
    lineHeight: frame.font * 1.2, charAdvance: frame.font * .46,
    paragraphs: copy, responsiveBreaks: true, autoHeight: true,
  };
};
const geometry = frame => ({...frame, topBlurNear: frame.height * .035, topBlurFar: frame.height * .135});
const nativeText = node => {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.attributes?.['aria-hidden'] === 'true') return '';
  return (node.children || []).map(nativeText).join('');
};
const wordSource = word => word.querySelector('.about-flight__source').textContent;
const glyphs = word => word.querySelectorAll('.about-flight__glyph');
const pose = glyph => {
  const raw = glyph.style.getPropertyValue('--flight-letter-transform');
  const match = /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) rotate\(([-\d.]+)deg\)$/.exec(raw);
  assert(match, `Every glyph has a complete finite pose: ${raw}`);
  const value = {x: Number(match[1]), y: Number(match[2]), rotation: Number(match[3]), opacity: Number(glyph.style.getPropertyValue('--flight-letter-opacity'))};
  assert(Object.values(value).every(Number.isFinite));
  assert(value.opacity >= 0 && value.opacity <= 1);
  return value;
};
function assertDirections(word, phase) {
  const actual = glyphs(word).map(pose);
  assert(actual.slice(0, 3).every(glyph => glyph.x < 0), `${phase}: every res glyph moves left`);
  assert(actual.slice(3).every(glyph => glyph.x > 0), `${phase}: every ults glyph moves right`);
  return actual;
}
function assertRigidParts(word, actual, phase) {
  const letters = glyphs(word);
  for (const [start, end] of [[0, 3], [3, 7]]) {
    const part = actual.slice(start, end);
    assert(part.every(glyph => glyph.rotation === part[0].rotation), `${phase}: each part keeps one common angle`);
    const angle = part[0].rotation * Math.PI / 180;
    for (let index = start + 1; index < end; index++) {
      const advance = parseFloat(letters[index].style.left) - parseFloat(letters[index - 1].style.left);
      const dx = advance + actual[index].x - actual[index - 1].x;
      const dy = actual[index].y - actual[index - 1].y;
      assert(Math.abs(dx - advance * Math.cos(angle)) < .003, `${phase}: horizontal spacing follows one rigid part rotation`);
      assert(Math.abs(dy - advance * Math.sin(angle)) < .003, `${phase}: vertical spacing follows one rigid part rotation`);
      assert(Math.abs(Math.hypot(dx, dy) - Math.abs(advance)) < .003, `${phase}: native letter spacing cannot expand or collapse inside a part`);
    }
  }
}
function wordSnapshot(word) {
  return {word: Object.fromEntries(word.style.values), glyphs: glyphs(word).map(glyph => ({left: glyph.style.left, filter: glyph.style.filter, properties: Object.fromEntries(glyph.style.values)}))};
}

for (const frame of frames) for (const triggerMode of ['portrait', 'viewport']) {
  const page = makeFlight(currentFile, options(frame));
  const before = makeFlight(beforeFile, options(frame));
  for (const candidate of [page, before]) candidate.api.configure({variant: 'second', triggerMode});
  const metrics = page.api.measure(geometry(frame));
  const oldMetrics = before.api.measure(geometry(frame));
  assert.deepEqual({...metrics}, {...oldMetrics}, 'Logical splitting leaves all virtual start/end/span/row/glyph metrics unchanged');
  const words = page.words(), oldWords = before.words();
  const results = words.at(-1);
  assert.equal(wordSource(results), 'results');
  assert.equal(words.filter(word => wordSource(word) === 'results').length, 1, 'Results keeps one semantic source word');
  assert.equal(glyphs(results).map(glyph => glyph.textContent).join(''), 'results', 'The original seven graphemes remain in the original order');
  assert.equal(glyphs(results).length, 7, 'No extra glyphs represent either logical group');
  assert.equal(words.length, oldWords.length, 'Splitting does not add native word boxes');
  assert.equal(page.glyphs().length, before.glyphs().length, 'Splitting does not change the total glyph count');
  assert.deepEqual(page.glyphs().map(glyph => glyph.style.left), before.glyphs().map(glyph => glyph.style.left), 'Native kerning and cached range positions remain unchanged');
  const semantic = paragraphs.map(value => Array.isArray(value) ? value.join(' ') : value).join('');
  assert.equal(nativeText(page.contents[0]), semantic, 'Native whitespace and the full semantic text remain unchanged');
  assert(nativeText(page.contents[0]).endsWith(' results'), 'The final leading space is preserved without inserting a space between res and ults');
  for (let index = 1; index < page.contents.length; index++) {
    assert.equal(page.contents[index].textContent, semantic, 'The five lower blur copies retain their original text');
    assert.equal(page.contents[index].querySelectorAll('.about-flight__glyph').length, 0, 'Lower blur copies receive no split glyphs');
  }
  const rowTop = results.getBoundingClientRect().top;
  const rowOffset = rowTop - page.contents[0].getBoundingClientRect().top;
  const rowStart = triggerMode === 'portrait' ? Math.max(0, rowTop - frame.portraitBottom - 100) : metrics.start + rowOffset;
  const count = page.nodeCount();
  page.layout(false); before.layout(false);
  const at = fraction => rowStart + metrics.span * fraction;
  page.api.update(at(.1), {topBlur: 10});
  const carry = assertDirections(results, `${frame.width}/${triggerMode} carry`);
  assert(carry.slice(0, 3).some(glyph => glyph.opacity > .05) && carry.slice(3).some(glyph => glyph.opacity > .05), 'Both groups remain visible while existing per-glyph edge fades are preserved');
  assertRigidParts(results, carry, `${frame.width}/${triggerMode} q=.1`);
  assert(carry[0].rotation < 0 && carry[3].rotation > 0, 'The two groups carry around their own mirrored pivots');
  assert.equal(results.style.getPropertyValue('--flight-word-active'), '1', 'The shared source hides once for both active groups');
  const carrySnapshot = wordSnapshot(results);
  page.api.update(at(.5), {topBlur: 10});
  const separated = assertDirections(results, `${frame.width}/${triggerMode} later flight`);
  assertRigidParts(results, separated, `${frame.width}/${triggerMode} q=.5`);
  const separatedSnapshot = wordSnapshot(results);
  for (const fraction of [.02, .1, .5, .8, .5, .1, .02, 0]) {
    const distance = at(fraction);
    page.api.update(distance, {topBlur: 10}); before.api.update(distance, {topBlur: 10});
    if ([.1, .5, .8].includes(fraction)) assertRigidParts(results, assertDirections(results, `${frame.width}/${triggerMode} q=${fraction}`), `q=${fraction}`);
    for (let index = 0; index < words.length - 1; index++) assert.deepEqual(wordSnapshot(words[index]), wordSnapshot(oldWords[index]), 'Every other second-variant word keeps its exact prior transform, opacity and blur in both trigger modes');
  }
  page.api.update(at(.1), {topBlur: 10});
  assert.deepEqual(wordSnapshot(results), carrySnapshot, 'Reverse scroll exactly reconstructs both carry poses');
  page.api.update(at(.5), {topBlur: 10});
  assert.deepEqual(wordSnapshot(results), separatedSnapshot, 'Returning forward reproduces the same separated glyph poses');
  page.api.update(at(.5), {topBlur: 10, reducedMotion: true});
  assert.equal(page.copy.dataset.flightReduced, 'true', 'Reduced motion keeps the existing source-only presentation contract');
  assert(page.glyphs().every(glyph => glyph.style.filter === 'none'), 'Reduced motion releases all glyph blur filters');
  assert.equal(wordSource(results), 'results', 'Reduced motion presents the same intact source');
  page.api.update(at(.5), {topBlur: 10, reducedMotion: false});
  assert.deepEqual(wordSnapshot(results), separatedSnapshot, 'Restoring motion returns the same split at the same scroll position');
  page.api.update(0, {topBlur: 10});
  assert.equal(results.style.getPropertyValue('--flight-word-active'), '0', 'Reversing fully restores the intact source word');
  page.api.configure({wordForce: 0, letterForce: 0, rotation: 0});
  page.api.update(at(.5), {topBlur: 0});
  assert(glyphs(results).map(pose).every(glyph => glyph.x === 0 && glyph.y === 0 && glyph.rotation === 0), 'Zero tuning still disables both group and letter movement');
  assert.equal(page.nodeCount(), count, 'Scroll, tuning and motion preference changes reuse the same DOM');

  // The harness forbids frame-time layout reads and provides no RAF/timer.
  // Thus every update above also rejects a new animation loop or live Range read.
  const first = makeFlight(currentFile, options(frame));
  const oldFirst = makeFlight(beforeFile, options(frame));
  for (const candidate of [first, oldFirst]) {candidate.api.configure({variant: 'first', triggerMode}); candidate.api.measure(geometry(frame)); candidate.layout(false);}
  for (const distance of [0, metrics.start, at(.1), at(.5), metrics.end + 1, at(.5), 0]) {
    first.api.update(distance, {topBlur: 17}); oldFirst.api.update(distance, {topBlur: 17});
    assert.deepEqual(first.snapshot(), oldFirst.snapshot(), 'The entire first variant remains bit-equivalent, including results and its legacy CSS properties');
  }
}

const repeated = ['results appear', 'results'];
const repeatedFrame = frames[1];
const repeatedPage = makeFlight(currentFile, options(repeatedFrame, repeated));
const repeatedBefore = makeFlight(beforeFile, options(repeatedFrame, repeated));
for (const page of [repeatedPage, repeatedBefore]) {page.api.configure({triggerMode: 'viewport'}); page.api.measure(geometry(repeatedFrame)); page.layout(false);}
const repeatedMetrics = repeatedPage.api.getMetrics();
repeatedPage.api.update(repeatedMetrics.start + repeatedMetrics.span * .5, {topBlur: 0});
repeatedBefore.api.update(repeatedMetrics.start + repeatedMetrics.span * .5, {topBlur: 0});
assert.deepEqual(wordSnapshot(repeatedPage.words()[0]), wordSnapshot(repeatedBefore.words()[0]), 'An earlier occurrence of results keeps its original whole-word behavior');
console.log('Results split checks passed: rigid res-left/ults-right parts through q=.1/.5/.8 across mobile/FHD/QHD and both triggers, exact source/kerning/count preservation, unchanged other words and first variant, deterministic reverse/reduced/tuning, cached updates without extra DOM/layout/RAF.');
