const assert = require('node:assert/strict');
const path = require('node:path');
const {makePage, turn, near, scrollStorageKey} = require('./scroll-check.cjs');
const makeFlight = require('./about-flight-harness.cjs');
const flightFile = path.join(__dirname, '..', 'about-flight.js');
const stored = duration => new Map([[scrollStorageKey, JSON.stringify({heroScrollDuration: 1, aboutScrollDuration: duration})]]);
const after = page => page.flightUpdates.at(-1).after;
const light = page => Number(page.hero.style.values.get('--about-light-progress'));
const budget = (page, height) => (parseFloat(page.nodes['.hero-journey'].style.height) - height * 2) / page.window.HeroScrollEffect.getSettings().aboutScrollDuration;
const setAfter = (page, height, virtualAfter, duration) => page.scroll(height + virtualAfter * duration);
const pose = page => ({card: page.card(), textY: parseFloat(page.copy.style.values.get('--about-text-y')), after: after(page), light: light(page)});
const samePose = (actual, expected, label) => {
  assert.deepEqual(actual.card, expected.card, `${label}: portrait geometry`);
  for (const key of ['textY', 'after', 'light']) near(actual[key], expected[key], `${label}: ${key}`);
};

(async () => {
  const fresh = makePage(1920, 960, 0, new Map([[scrollStorageKey, JSON.stringify({heroScrollDuration: 1})]]), true);
  await turn();
  const freshApi = fresh.window.HeroScrollEffect;
  near(freshApi.getSettings().aboutScrollDuration, 2.5, 'A new page uses the actual 2.5 duration default');
  near(freshApi.getDefaults().aboutScrollDuration, 2.5, 'Defaults expose the complete new duration setting');
  assert.equal(fresh.hero.dataset.aboutScrollDuration, '2.50', 'The current factor is available to visual QA');
  const external = freshApi.getDefaults(); external.aboutScrollDuration = 1;
  near(freshApi.getDefaults().aboutScrollDuration, 2.5, 'A defaults snapshot cannot mutate the duration');

  // Identical physical scroll within hero remains identical. Only the portion
  // after its one-viewport endpoint is multiplied by the about duration.
  for (const [width, height] of [[375, 812], [1440, 800], [1920, 960], [2560, 1305]]) {
    const pages = [1, 2.5, 3].map(duration => ({duration, page: makePage(width, height, 0, stored(duration), true)}));
    await turn();
    const referenceMetrics = {...pages[0].page.window.AboutTextFlight.getMetrics()};
    const referenceBudget = budget(pages[0].page, height);
    for (const {duration, page} of pages) {
      assert.deepEqual({...page.window.AboutTextFlight.getMetrics()}, referenceMetrics, 'Duration does not alter cached glyph geometry or virtual metrics');
      near(budget(page, height), referenceBudget, 'Journey height scales physical travel while retaining the same virtual budget');
      near(parseFloat(page.nodes['.hero-journey'].style.height), height * 2 + referenceBudget * duration, 'Only the about portion of journey height receives the duration factor');
      page.scroll(height * .5); page.frame();
    }
    const firstHeroPose = pages[0].page.card();
    for (const {page} of pages) assert.deepEqual(page.card(), firstHeroPose, 'Hero damping and its partial pose are independent of duration');
    near(Number(pages[0].page.hero.dataset.scrollProgress), .5 * (1 - Math.exp(-16.67 / 180)), 'The fixed one-screen hero preserves its original 180 ms response');
    for (const {page} of pages) {page.frames(); page.scroll(height); page.frames(); near(after(page), 0, 'Exactly one viewport completes the hero without consuming about travel');}
    const endpointCard = pages[0].page.card();
    const renderers = pages.map(({page}) => {
      const renderer = makeFlight(flightFile);
      renderer.api.measure({...page.flightMeasures.at(-1).layout}); renderer.layout(false);
      return renderer;
    });
    const signature = new Set();
    let sawIntermediateLight = false;
    const {start, span, end} = referenceMetrics;
    for (const virtualAfter of [0, start + span * .15, start + span * .5, start + (end - start) * .545, end, referenceBudget]) {
      const snapshots = [];
      for (const [index, {duration, page}] of pages.entries()) {
        setAfter(page, height, virtualAfter, duration); page.frames();
        near(after(page), virtualAfter, 'Physical about distance maps to the requested virtual travel');
        near(parseFloat(page.copy.style.values.get('--about-text-y')), page.flightMeasures.at(-1).layout.textY - virtualAfter, 'Copy and glyphs share one virtual distance');
        assert.deepEqual(page.card(), endpointCard, 'The portrait stays pinned throughout the stretched about stage');
        renderers[index].api.update(after(page), page.flightUpdates.at(-1));
        snapshots.push(renderers[index].snapshot());
        sawIntermediateLight ||= light(page) > 0 && light(page) < 1;
      }
      for (const {page} of pages.slice(1)) samePose(pose(page), pose(pages[0].page), 'Scaled physical scroll preserves the same virtual composition');
      for (const snapshot of snapshots.slice(1)) assert.deepEqual(snapshot, snapshots[0], 'The real glyph engine renders identical poses from scaled physical distances');
      signature.add(JSON.stringify(snapshots[0].glyphs));
    }
    assert(signature.size > 2, 'Pose comparison includes active letter motion, not only static or completed frames');
    assert(sawIntermediateLight, 'Pose comparison exercises an intermediate theme fade');
    for (const {duration, page} of pages) {
      const updateStart = page.flightUpdates.length;
      setAfter(page, height, start + span * .2, duration);
      page.frame();
      assert(after(page) < referenceBudget && after(page) > start + span * .2, 'Reverse scroll moves through an intermediate about pose');
      page.frames();
      const reverse = page.flightUpdates.slice(updateStart).map(update => update.after);
      for (let index = 1; index < reverse.length; index++) assert(reverse[index] <= reverse[index - 1] + 1e-6, 'Virtual reverse travel is monotonic without overshoot');
      near(after(page), start + span * .2, 'Reverse travel settles at the same scaled virtual position');
      page.scroll(0); page.frames();
      near(after(page), 0, 'Reverse returns glyph travel to zero');
      near(light(page), 0, 'Reverse returns the surrounding theme to dark');
      assert.deepEqual(page.position(), [width, height], 'Reverse restores the original full hero');
      assert.equal(page.depthSettingsCalls.length, 0, 'About duration does not modify portrait depth settings');
    }
  }

  const storage = stored(2.5);
  const live = makePage(1920, 960, 0, storage, true);
  await turn();
  const api = live.window.HeroScrollEffect;
  const metrics = live.window.AboutTextFlight.getMetrics();
  const virtualAfter = metrics.start + metrics.span * .4;
  live.scroll(960); live.frames();
  setAfter(live, 960, virtualAfter, 2.5);
  live.frame();
  near(after(live), virtualAfter * (1 - Math.exp(-16.67 / 260)), 'About uses a softer 260 ms response in the physical timeline');
  live.frames();
  const before = pose(live), physicalScroll = live.window.scrollY, measures = live.flightMeasures.length;
  api.setSettings({aboutScrollDuration: 3});
  samePose(pose(live), before, 'Live factor changes preserve the visible pose synchronously');
  assert.equal(live.window.scrollY, physicalScroll, 'Live factor changes never move native scroll');
  assert.equal(live.flightMeasures.length, measures, 'Live factor changes do not remeasure glyph DOM');
  const targetAfter = virtualAfter * 2.5 / 3;
  live.frame();
  assert(after(live) < virtualAfter && after(live) > targetAfter, 'A live factor change rebases visual state and gently follows its new physical mapping');
  live.frames();
  near(after(live), targetAfter, 'A stopped page settles to its actual scroll position under the new scale');
  near(api.getSettings().aboutScrollDuration, 3, 'The new duration remains active');
  near(JSON.parse(storage.get(scrollStorageKey)).aboutScrollDuration, 3, 'Duration is persisted with the full scroll profile');
  near(live.scrollSettingsEvents.at(-1).aboutScrollDuration, 3, 'Settings listeners receive the effective duration');
  assert.equal(live.hero.dataset.aboutScrollDuration, '3.00');

  const history = makePage(1920, 960, physicalScroll, storage, true);
  await turn();
  near(after(history), targetAfter, 'History restoration starts directly at the actual scaled physical position');
  assert.equal(history.raf.size, 0, 'History restoration does not replay a stale duration pose');
  setAfter(history, 960, targetAfter + 50, 3);
  assert.equal(history.raf.size, 1);
  history.window.dispatchEvent({type: 'pageshow'});
  near(after(history), targetAfter + 50, 'Pageshow snaps a pending frame to current scaled physical travel');
  assert.equal(history.raf.size, 0, 'Pageshow cancels stale pending about frames');
  const distanceAtResize = history.window.scrollY - 120;
  const measuresBeforeResize = history.flightMeasures.length;
  history.resize(375, 812);
  near(after(history), Math.min(budget(history, 812), Math.max(0, distanceAtResize - 812) / 3), 'Resize restores from actual physical distance and the new viewport height');
  assert(history.flightMeasures.length > measuresBeforeResize, 'Resize still refreshes responsive glyph geometry');
  assert.equal(history.raf.size, 0);

  const controlsMeasures = live.flightMeasures.length;
  for (const [input, expected] of [[0, 1], [4, 3], [1, 1], [2.75, 2.75], [3, 3]]) {
    api.setSettings({aboutScrollDuration: input}); live.frames();
    near(api.getSettings().aboutScrollDuration, expected, 'Finite duration values are accepted and clamped to 1–3');
  }
  for (const invalid of [undefined, null, true, '2', NaN, Infinity, -Infinity, {}, []]) {
    api.setSettings({aboutScrollDuration: invalid}); live.frames();
    near(api.getSettings().aboutScrollDuration, 3, 'Invalid duration patches retain the previous value');
  }
  assert.equal(live.flightMeasures.length, controlsMeasures, 'Duration validation never remeasures glyph geometry');
  api.resetSettings(); live.frames();
  near(api.getSettings().aboutScrollDuration, 2.5, 'Reset restores the actual 2.5 default');
  const resetReload = makePage(1920, 960, 0, storage, true); await turn();
  near(resetReload.window.HeroScrollEffect.getSettings().aboutScrollDuration, 2.5, 'Reset duration survives a reload');
  for (const [profile, expected] of [[{}, 2.5], [{aboutScrollDuration: '2'}, 2.5], [{aboutScrollDuration: -9}, 1], [{aboutScrollDuration: 9}, 3]]) {
    const restored = makePage(1440, 800, 0, new Map([[scrollStorageKey, JSON.stringify({heroScrollDuration: 1, ...profile})]]), true); await turn();
    near(restored.window.HeroScrollEffect.getSettings().aboutScrollDuration, expected, 'Stored duration profiles receive defaults, validation and bounds');
  }
  api.setSettings({heroScrollDuration: 1}); live.frames();
  live.reduced.matches = true; live.reduced.dispatchEvent({type: 'change'}); live.frames();
  setAfter(live, 960, virtualAfter, 2.5); live.frame();
  near(after(live), virtualAfter, 'Reduced motion still uses scaled about distance directly');
  assert.equal(live.raf.size, 0, 'Reduced motion does not create another duration animation loop');
  console.log('About duration checks passed: real default/bounds/persistence, fixed one-screen hero, scaled virtual budgets and real glyph/theme poses at 1/2.5/3, responsive reverse/history/resize, 260 ms about easing, live rebase without scroll/layout changes and reduced motion.');
})().catch(error => {console.error(error); process.exitCode = 1;});
