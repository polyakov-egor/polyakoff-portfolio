const assert = require('node:assert/strict');
const {makeUnitDurationPage, turn, near, scrollStorageKey} = require('./scroll-check.cjs');

const light = page => {
  const fromStyle = Number(page.hero.style.values.get('--about-light-progress'));
  const fromDataset = Number(page.hero.dataset.lightProgress);
  assert(Number.isFinite(fromStyle) && fromStyle >= 0 && fromStyle <= 1, 'The shared light value is finite and clamped');
  assert(Number.isFinite(fromDataset), 'Light progress has a readable DOM state');
  near(fromStyle, fromDataset, 'CSS and DOM light progress refer to the same visual frame');
  return fromStyle;
};
function settle(page) {
  const values = [];
  for (let index = 0; page.raf.size && index < 180; index++) {
    page.frame(); values.push(light(page));
  }
  assert.equal(page.raf.size, 0, 'Theme damping settles without an idle animation loop');
  assert.equal(page.frame(), 0, 'A settled theme schedules no extra frame');
  return values;
}
function checkPhase(page, after, message) {
  const metrics = page.window.AboutTextFlight.getMetrics();
  const settings = page.window.HeroScrollEffect.getSettings();
  const fraction = Math.max(0, (after - metrics.start) / Math.max(1, metrics.end - metrics.start));
  const phase = after > 0 ? Math.max(0, Math.min(1, (fraction - settings.aboutBackgroundStart) / (settings.aboutBackgroundDuration * settings.aboutRevealScrollDuration))) : 0;
  const actual = light(page);
  if (phase < 1e-8 || phase > 1 - 1e-8) near(actual, phase < .5 ? 0 : 1, message);
  else if (Math.abs(phase - .5) < 1e-8) near(actual, .5, message);
  else assert(actual > 0 && actual < 1, `${message}: intermediate phase remains between the endpoints`);
}

(async () => {
  const storage = new Map();
  const page = makeUnitDurationPage(1920, 960, 0, storage, true);
  await turn();
  const api = page.window.HeroScrollEffect;
  assert.equal(typeof api.getDefaults, 'function', 'The scroll API exposes immutable defaults through fresh snapshots');
  const defaults = api.getDefaults();
  assert.deepEqual({...defaults, heroScrollDuration: 1, aboutScrollDuration: 1}, {...api.getSettings()}, 'The explicit unit-duration fixture preserves all other real defaults');
  near(defaults.aboutBackgroundStart, .32, 'The light transition begins during the letter flight');
  near(defaults.aboutBackgroundDuration, .45, 'The light transition has its intended default duration');
  const beforeDefaults = {writes: page.storageWrites.length, events: page.scrollSettingsEvents.length, measures: page.flightMeasures.length, raf: page.raf.size};
  defaults.aboutBackgroundStart = 1; defaults.whiteAt = .9; defaults.aboutWordForce = 3;
  const fresh = api.getDefaults();
  assert.notEqual(fresh, defaults, 'Each defaults request returns a new object');
  near(fresh.aboutBackgroundStart, .32, 'External mutations cannot change default light timing');
  near(fresh.whiteAt, .22, 'External mutations cannot change other scroll defaults');
  near(fresh.aboutWordForce, 1, 'External mutations cannot change flight defaults');
  assert.deepEqual({writes: page.storageWrites.length, events: page.scrollSettingsEvents.length, measures: page.flightMeasures.length, raf: page.raf.size}, beforeDefaults, 'Reading defaults has no persistence, layout, event or animation effects');
  assert.equal(light(page), 0, 'The first hero opens with the dark site theme');
  for (const morph of [.2, .6, .99, 1]) {
    page.scroll(960 * morph); settle(page);
    assert.equal(light(page), 0, 'The entire initial portrait morph preserves the dark surrounding theme');
  }
  const pinned = page.card();
  const metrics = page.window.AboutTextFlight.getMetrics();
  const range = metrics.end - metrics.start;
  let previous = 0;
  for (const fraction of [0, .15, .319, .32, .4, .545, .65, .77, 1, 1.13, 1.5]) {
    const after = metrics.start + range * fraction;
    page.scroll(960 + after);
    const sequence = settle(page);
    for (const value of sequence) { assert(value + 1e-6 >= previous, 'Forward theme frames change monotonically'); previous = value; }
    checkPhase(page, after, `Theme follows normalized flight fraction ${fraction}`);
    assert.deepEqual(page.card(), pinned, 'Theme changes do not move the pinned portrait');
  }
  assert.equal(light(page), 1, 'The site reaches its full light theme');
  page.scroll(960 + metrics.start + range * .1);
  const beforeReverse = light(page);
  assert.equal(beforeReverse, 1, 'Native reverse scroll does not jump theme state synchronously');
  const reverse = settle(page);
  assert(reverse.some(value => value > 0 && value < 1), 'Reversing the theme passes through intermediate shades');
  for (let index = 1; index < reverse.length; index++) assert(reverse[index] <= reverse[index - 1] + 1e-6, 'Reverse theme frames change monotonically');
  assert.equal(light(page), 0, 'Reverse scroll restores the dark theme');
  page.scroll(960 + metrics.start + range * .65);
  const forward = settle(page);
  assert(forward.some(value => value > 0 && value < light(page)), 'Theme changes use the existing damped visual timeline');
  checkPhase(page, page.flightUpdates.at(-1).after, 'Theme and glyphs use the same settled visual distance');

  const measuresBeforeTiming = page.flightMeasures.length;
  const stoppedCard = page.card();
  const stoppedText = page.copy.style.values.get('--about-text-y');
  api.setSettings({aboutBackgroundStart: .2, aboutBackgroundDuration: .2}); settle(page);
  assert.equal(light(page), 1, 'Timing controls repaint the stopped theme immediately');
  assert.equal(page.flightMeasures.length, measuresBeforeTiming, 'Theme timing changes use cached glyph geometry');
  assert.deepEqual(page.card(), stoppedCard, 'Theme timing changes preserve the portrait');
  assert.equal(page.copy.style.values.get('--about-text-y'), stoppedText, 'Theme timing changes preserve text travel');
  near(api.getDefaults().aboutBackgroundStart, .32, 'Live timing changes do not alter saved defaults');
  api.setSettings({aboutTriggerMode: 'viewport', aboutStartOffset: .5}); settle(page);
  checkPhase(page, page.flightUpdates.at(-1).after, 'Theme timing follows the effective delayed flight metrics');
  api.setSettings({aboutFlightVariant: 'first'}); settle(page);
  checkPhase(page, page.flightUpdates.at(-1).after, 'The first animation variant also drives theme timing with its effective metrics');
  assert.equal(page.flightMeasures.length, measuresBeforeTiming, 'Flight tuning and variant changes do not measure the theme again');

  api.setSettings({aboutFlightVariant: 'second', aboutStartOffset: .5, aboutBackgroundStart: 1, aboutBackgroundDuration: 1}); settle(page);
  const late = page.window.AboutTextFlight.getMetrics();
  const completion = late.start + (late.end - late.start) * (1 + api.getSettings().aboutRevealScrollDuration);
  const available = parseFloat(page.nodes['.hero-journey'].style.height) - 960 * 2;
  assert(available >= completion, 'A late, long theme fade extends the scroll budget to its actual completion');
  page.scroll(960 + late.start + (late.end - late.start) * (1 + api.getSettings().aboutRevealScrollDuration / 2)); settle(page);
  near(light(page), .5, 'A theme interval extending past the flight endpoint reaches a real midpoint');
  page.scroll(960 + available); settle(page);
  assert.equal(light(page), 1, 'The extended budget allows a late theme fade to finish');
  assert.deepEqual(page.card(), pinned, 'The portrait stays pinned throughout the extended light transition');
  assert.equal(page.flightMeasures.length, measuresBeforeTiming, 'Late theme budget extension uses cached layout');

  // Stored timing profiles restore on the first rendered frame.
  api.setSettings({aboutStartOffset: .2, aboutBackgroundStart: .1, aboutBackgroundDuration: .5}); settle(page);
  const savedMetrics = page.window.AboutTextFlight.getMetrics();
  const savedAfter = savedMetrics.start + (savedMetrics.end - savedMetrics.start) * .4;
  const saved = JSON.parse(storage.get(scrollStorageKey));
  near(saved.aboutBackgroundStart, .1, 'Theme start is persisted with the scroll profile');
  near(saved.aboutBackgroundDuration, .5, 'Theme duration is persisted with the scroll profile');
  page.scroll(960 + savedAfter); settle(page);
  const savedShade = light(page);
  const history = makeUnitDurationPage(1920, 960, 120 + 960 + savedAfter, storage, true);
  await turn();
  near(light(history), savedShade, 'History restoration renders the saved theme at the restored scroll position');
  assert.equal(history.raf.size, 0, 'History restoration does not animate from a stale theme');
  history.scroll(960 + savedAfter + 150);
  assert.equal(history.raf.size, 1);
  history.window.dispatchEvent({type: 'pageshow'});
  checkPhase(history, history.flightUpdates.at(-1).after, 'Pageshow recomputes theme for the restored visual distance');
  assert.equal(history.raf.size, 0, 'Pageshow cancels pending theme frames');
  history.resize(375, 812);
  checkPhase(history, history.flightUpdates.at(-1).after, 'Resize recomputes theme against current mobile flight metrics');
  assert.equal(history.raf.size, 0, 'Resize uses fresh geometry without replaying stale theme frames');

  const settings = api.getSettings();
  for (const [key, min, max] of [['aboutBackgroundStart', 0, 1], ['aboutBackgroundDuration', .05, 1]]) {
    for (const [input, value] of [[-10, min], [10, max]]) {
      api.setSettings({[key]: input}); settle(page);
      near(api.getSettings()[key], value, `${key} clamps to its supported range`);
    }
    for (const invalid of [undefined, null, true, '0.5', NaN, Infinity, -Infinity, {}, []]) {
      api.setSettings({[key]: invalid}); settle(page);
      near(api.getSettings()[key], max, `${key} ignores invalid patches`);
    }
  }
  assert.equal(api.getSettings().aboutWordForce, settings.aboutWordForce, 'Theme controls preserve flight force');
  assert.equal(page.depthSettingsCalls.length, 0, 'Theme controls do not modify portrait motion');
  for (const [profile, start, duration] of [
    [{}, .32, .45],
    [{aboutBackgroundStart: 'bad', aboutBackgroundDuration: null}, .32, .45],
    [{aboutBackgroundStart: -3, aboutBackgroundDuration: 4}, 0, 1],
    [{aboutBackgroundStart: 4, aboutBackgroundDuration: -.2}, 1, .05]
  ]) {
    const restored = makeUnitDurationPage(1440, 800, 0, new Map([[scrollStorageKey, JSON.stringify(profile)]]), true);
    await turn();
    near(restored.window.HeroScrollEffect.getSettings().aboutBackgroundStart, start, 'Legacy and invalid stored theme starts are sanitized');
    near(restored.window.HeroScrollEffect.getSettings().aboutBackgroundDuration, duration, 'Legacy and invalid stored theme durations are sanitized');
    assert.equal(light(restored), 0, 'Restored profiles still open with a dark hero at the top');
  }
  api.resetSettings(); settle(page);
  near(api.getSettings().aboutBackgroundStart, .32, 'Reset restores default theme start');
  near(api.getSettings().aboutBackgroundDuration, .45, 'Reset restores default theme duration');
  assert.equal(page.flightMeasures.length, measuresBeforeTiming, 'Theme validation and reset do not remeasure glyphs');

  const fallback = makeUnitDurationPage(1440, 800, 0, new Map(), false);
  await turn();
  const fallbackApi = fallback.window.HeroScrollEffect;
  fallbackApi.setSettings({aboutBackgroundStart: 0, aboutBackgroundDuration: 1}); settle(fallback);
  const fallbackBudget = parseFloat(fallback.nodes['.hero-journey'].style.height) - 800 * 2;
  let lastFallback = 0, sawIntermediate = false;
  for (const fraction of [0, .2, .4, .6, .8, 1]) {
    fallback.scroll(800 + fallbackBudget * fraction); settle(fallback);
    const value = light(fallback);
    assert(value + 1e-6 >= lastFallback, 'A missing flight engine still yields a monotonic theme timeline');
    sawIntermediate ||= value > 0 && value < 1;
    lastFallback = value;
  }
  assert(sawIntermediate, 'The engine-free fallback still fades smoothly');
  assert.equal(light(fallback), 1, 'The engine-free fallback gets enough scroll to reach white');
  fallback.scroll(0); settle(fallback);
  assert.equal(light(fallback), 0, 'The fallback theme reverses fully to the hero');

  const reduced = makeUnitDurationPage(1920, 960, 0, new Map(), true);
  await turn();
  reduced.reduced.matches = true; reduced.reduced.dispatchEvent({type: 'change'}); settle(reduced);
  const reducedMetrics = reduced.window.AboutTextFlight.getMetrics();
  reduced.scroll(960 + reducedMetrics.start + (reducedMetrics.end - reducedMetrics.start) * (.32 + .45 * reduced.window.HeroScrollEffect.getSettings().aboutRevealScrollDuration / 2));
  reduced.frame();
  near(light(reduced), .5, 'Reduced motion maps the current scroll position directly to the theme');
  assert.equal(reduced.raf.size, 0, 'Reduced motion does not create an extra theme animation loop');
  reduced.scroll(0); reduced.frame();
  assert.equal(light(reduced), 0, 'Reduced motion also restores the dark opening hero');
  console.log('Theme checks passed: shared monotonic/reversible/damped light progress, morph guard, live timing, effective first/second metrics, late budget extension, cached tuning, persistence/history/resize/fallback/reduced motion and fresh defaults.');
})().catch(error => {console.error(error); process.exitCode = 1;});
