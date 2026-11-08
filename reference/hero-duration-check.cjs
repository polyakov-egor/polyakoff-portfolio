const assert = require('node:assert/strict');
const {makePage, turn, near, scrollStorageKey} = require('./scroll-check.cjs');
const profile = (hero = 1, about = 2.5) => new Map([[scrollStorageKey, JSON.stringify({heroScrollDuration: hero, aboutScrollDuration: about})]]);
const after = page => page.flightUpdates.at(-1).after;
const progress = page => Number(page.hero.dataset.scrollProgress);
const light = page => Number(page.hero.style.values.get('--about-light-progress'));
const settings = page => page.window.HeroScrollEffect.getSettings();
const virtualBudget = (page, height) => (parseFloat(page.nodes['.hero-journey'].style.height) - height * (1 + settings(page).heroScrollDuration)) / settings(page).aboutScrollDuration;
const rounded = value => Math.round(value * 1e6) / 1e6;
const numbers = value => (value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(value => rounded(Number(value)));
function heroPose(page) {
  const n = page.nodes;
  const rect = selector => {
    const style = n[selector].style;
    return [style.width, style.height].map(value => rounded(parseFloat(value))).concat(numbers(style.transform));
  };
  return {
    card: rect('.hero__scene'), clip: n['.hero__scene'].style.clipPath,
    portrait: rect('[data-layer="portrait"]'), depth: rect('[data-layer="depth"]'),
    introFrame: rect('.hero__intro-frame'),
    p: progress(page), shade: page.shade(), blur: page.wordmarkBlur(), gate: rounded(page.gate()),
    wordmarkOpacity: rounded(Number(n['.hero__wordmark-frame'].style.opacity)),
    decorationOpacity: rounded(Number(n['.hero__decoration-scale'].style.opacity)),
    intro: rounded(Number(n['.hero__intro'].style.opacity)),
    welcome: rounded(Number(n['.hero__welcome'].style.values.get('--welcome-opacity'))),
    logo: rounded(Number(n['.hero__about-logo'].style.opacity)),
    copyOpacity: rounded(Number(page.copy.style.values.get('--about-text-opacity'))),
    copyY: rounded(parseFloat(page.copy.style.values.get('--about-text-y'))),
    footer: rounded(Number(page.hero.style.values.get('--about-footer-progress'))),
    after: rounded(after(page)), light: rounded(light(page)),
    cursorPast: n['.custom-cursor'].classList.contains('is-past-hero'),
  };
}

(async () => {
  const fresh = makePage(1920, 960, 0, new Map(), true);
  await turn();
  const freshApi = fresh.window.HeroScrollEffect;
  near(settings(fresh).heroScrollDuration, 1, 'Fresh pages preserve the original one-screen hero duration');
  near(settings(fresh).aboutScrollDuration, 2.5, 'About independently keeps its 2.5 duration default');
  near(freshApi.getDefaults().heroScrollDuration, 1, 'The defaults API exposes the unchanged hero duration');
  assert.equal(fresh.hero.dataset.heroScrollDuration, '1.00', 'Visual QA can read the active hero factor');
  const defaults = freshApi.getDefaults(); defaults.heroScrollDuration = 3;
  near(freshApi.getDefaults().heroScrollDuration, 1, 'Mutating a defaults snapshot cannot change hero duration');

  for (const [width, height] of [[375, 812], [1440, 800], [1920, 960], [2560, 1305]]) {
    const cases = [];
    for (const hero of [1, 2.5, 3]) for (const about of [1, 2.5, 3]) cases.push({hero, about, page: makePage(width, height, 0, profile(hero, about), true)});
    await turn();
    const referenceBudget = virtualBudget(cases[0].page, height);
    const referenceMetrics = {...cases[0].page.window.AboutTextFlight.getMetrics()};
    for (const {hero, about, page} of cases) {
      near(virtualBudget(page, height), referenceBudget, 'Both duration factors preserve the virtual flight budget');
      near(parseFloat(page.nodes['.hero-journey'].style.height), height + height * hero + referenceBudget * about, 'The journey adds one pinned viewport, scaled hero travel and independently scaled about travel');
      assert.deepEqual({...page.window.AboutTextFlight.getMetrics()}, referenceMetrics, 'Duration factors do not change cached glyph geometry');
      page.scroll(height * hero * .5); page.frame();
      near(progress(page), .5 * (1 - Math.exp(-16.67 / 180)), 'Hero preserves its original 180 ms response at every physical factor');
    }
    const firstFrame = heroPose(cases[0].page);
    for (const {page} of cases.slice(1)) assert.deepEqual(heroPose(page), firstFrame, 'Normalized first-frame easing is identical across both duration controls');
    for (const {page} of cases) page.frames();
    for (const fraction of [0, .1, .25, .5, .75, 1]) {
      for (const {hero, page} of cases) {page.scroll(height * hero * fraction); page.frames();}
      const expected = heroPose(cases[0].page);
      near(expected.p, fraction, 'The scaled hero reaches its requested normalized progress');
      for (const {page} of cases.slice(1)) assert.deepEqual(heroPose(page), expected, 'Scaled hero scroll preserves portrait, white/blur/depth gate, copy and all UI fades');
      for (const {page} of cases) {near(after(page), 0, 'Hero travel never leaks into virtual about travel'); near(light(page), 0, 'The surrounding about theme stays dark during the entire hero');}
    }
    const endpoint = heroPose(cases[0].page);
    near(endpoint.gate, 0, 'The finished hero pauses depth input at every duration');
    for (const fraction of [.2, .545, 1]) {
      const distance = referenceMetrics.start + (referenceMetrics.end - referenceMetrics.start) * fraction;
      for (const {hero, about, page} of cases) {
        page.scroll(height * hero + distance * about); page.frames();
        near(after(page), distance, 'About starts after the independently scaled hero endpoint');
        assert.deepEqual(heroPose(page).card, endpoint.card, 'The portrait stays pinned during about regardless of hero duration');
        near(page.gate(), 0, 'About does not accidentally resume portrait motion');
      }
      const baseline = cases[0].page;
      for (const {page} of cases.slice(1)) {
        near(after(page), after(baseline), 'All hero/about duration combinations reach the same virtual flight distance');
        near(parseFloat(page.copy.style.values.get('--about-text-y')), parseFloat(baseline.copy.style.values.get('--about-text-y')), 'Text uses that same virtual travel');
        near(light(page), light(baseline), 'Theme timing uses that same virtual travel');
      }
    }
    for (const {hero, page} of cases) {page.scroll(height * hero * .5); page.frames();}
    const reversed = heroPose(cases[0].page);
    assert(reversed.gate > 0 && reversed.gate < 1, 'Reverse scroll resumes depth smoothly at the matching normalized hero pose');
    for (const {page} of cases.slice(1)) assert.deepEqual(heroPose(page), reversed, 'Reverse scroll restores every shared hero effect in sync');
    for (const {page} of cases) {
      page.scroll(0); page.frames();
      near(progress(page), 0, 'Reverse restores the original hero'); near(page.gate(), 1, 'The original hero fully resumes portrait input');
      assert.deepEqual(page.position(), [width, height]);
      assert.equal(page.depthSettingsCalls.length, 0, 'Duration controls never rewrite depth preferences');
    }
  }

  // Live changes preserve the displayed stage before easing to the unchanged
  // native scroll position under the new pair of scales.
  const liveStorage = profile(1, 1);
  const live = makePage(1920, 960, 0, liveStorage, true);
  await turn();
  const api = live.window.HeroScrollEffect;
  live.scroll(960 * .4); live.frames();
  const oldPose = heroPose(live), oldScroll = live.window.scrollY, measures = live.flightMeasures.length;
  api.setSettings({heroScrollDuration: 3});
  assert.deepEqual(heroPose(live), oldPose, 'Changing hero duration preserves the visible hero pose synchronously');
  assert.equal(live.window.scrollY, oldScroll, 'Live hero duration never scrolls the page');
  live.frame();
  assert(progress(live) < .4 && progress(live) > .4 / 3, 'Rebased hero state eases toward its new physical mapping without snapping');
  near(after(live), 0, 'A live hero rebase cannot expose an about frame');
  live.frames(); near(progress(live), .4 / 3, 'A stopped hero settles to actual native scroll under the new duration');
  assert.equal(live.flightMeasures.length, measures, 'Live hero changes reuse cached measurements');
  near(settings(live).aboutScrollDuration, 1, 'Changing hero duration leaves about duration unchanged');

  api.setSettings({heroScrollDuration: 2.5, aboutScrollDuration: 2.5}); live.frames();
  const metrics = live.window.AboutTextFlight.getMetrics();
  const virtualAfter = metrics.start + metrics.span * .5;
  live.scroll(960 * 2.5 + virtualAfter * 2.5); live.frames();
  const oldAboutPose = heroPose(live), aboutScroll = live.window.scrollY;
  api.setSettings({heroScrollDuration: 3, aboutScrollDuration: 1});
  assert.deepEqual(heroPose(live), oldAboutPose, 'Changing both factors preserves the visible virtual about pose synchronously');
  assert.equal(live.window.scrollY, aboutScroll, 'A two-stage rebase also keeps native scroll untouched');
  const mappedAfter = Math.max(0, aboutScroll - 120 - 960 * 3);
  live.frame();
  assert(after(live) < virtualAfter && after(live) > mappedAfter, 'The preserved about pose gently follows its newly mapped virtual target');
  live.frames(); near(after(live), mappedAfter, 'About settles against the new hero boundary and its own duration');
  assert.equal(live.flightMeasures.length, measures, 'A two-stage live rebase does not remeasure glyphs');
  assert.equal(live.hero.dataset.heroScrollDuration, '3.00');

  const history = makePage(1920, 960, 120 + 960 * 3 * .43, profile(3, 2.5), true);
  await turn();
  near(progress(history), .43, 'History restoration maps physical hero travel immediately');
  assert.equal(history.raf.size, 0, 'Hero history restoration has no stale easing frame');
  history.scroll(960 * 3 * .6);
  assert.equal(history.raf.size, 1);
  history.window.dispatchEvent({type: 'pageshow'});
  near(progress(history), .6, 'Pageshow snaps pending hero work to current physical scroll');
  assert.equal(history.raf.size, 0);
  const resizeDistance = history.window.scrollY - 120;
  history.resize(375, 812);
  near(progress(history), resizeDistance / (812 * 3), 'Resize uses the new hero viewport height with the saved factor');
  near(after(history), 0, 'A resized hero remains in the proper stage');
  assert.equal(history.raf.size, 0);
  const aboutHistory = makePage(1920, 960, aboutScroll, profile(3, 1), true);
  await turn(); near(after(aboutHistory), mappedAfter, 'History restoration after hero uses both actual stage scales');

  for (const [value, expected] of [[0, 1], [4, 3], [1.75, 1.75], [3, 3]]) {
    api.setSettings({heroScrollDuration: value}); live.frames();
    near(settings(live).heroScrollDuration, expected, 'Finite hero duration is bounded to 1–3');
    near(settings(live).aboutScrollDuration, 1, 'Hero bounds do not change about duration');
  }
  for (const invalid of [undefined, null, true, '2', NaN, Infinity, -Infinity, {}, []]) {
    api.setSettings({heroScrollDuration: invalid}); live.frames();
    near(settings(live).heroScrollDuration, 3, 'Invalid hero duration patches retain the previous value');
  }
  near(JSON.parse(liveStorage.get(scrollStorageKey)).heroScrollDuration, 3, 'Hero duration persists in the scroll profile');
  near(live.scrollSettingsEvents.at(-1).heroScrollDuration, 3, 'Settings events include hero duration');
  const exposed = api.getSettings(); exposed.heroScrollDuration = 1;
  near(settings(live).heroScrollDuration, 3, 'Settings snapshots cannot mutate hero duration');
  const reload = makePage(1440, 800, 0, liveStorage, true); await turn();
  near(settings(reload).heroScrollDuration, 3, 'Reload restores hero duration'); near(settings(reload).aboutScrollDuration, 1, 'Reload restores about duration independently');
  for (const [value, expected] of [[undefined, 1], ['2', 1], [-8, 1], [8, 3]]) {
    const page = makePage(1440, 800, 0, new Map([[scrollStorageKey, JSON.stringify({heroScrollDuration: value, aboutScrollDuration: 2.1})]]), true); await turn();
    near(settings(page).heroScrollDuration, expected, 'Stored hero durations receive their default or bounds');
    near(settings(page).aboutScrollDuration, 2.1, 'Stored hero validation preserves valid about timing');
  }
  assert.equal(live.flightMeasures.length, measures, 'Validation and live duration changes never remeasure layout');
  api.resetSettings(); live.frames();
  near(settings(live).heroScrollDuration, 1, 'Reset restores the unchanged one-screen hero duration'); near(settings(live).aboutScrollDuration, 2.5, 'Reset independently restores default about duration');

  const reduced = makePage(1920, 960, 0, profile(3, 1.5), true); await turn();
  reduced.reduced.matches = true; reduced.reduced.dispatchEvent({type: 'change'}); reduced.frames();
  reduced.scroll(960 * 3 * .49); reduced.frame();
  assert.deepEqual(reduced.position(), [1920, 960], 'Reduced motion keeps the full hero below the scaled discrete midpoint');
  reduced.scroll(960 * 3 * .51); reduced.frame();
  assert.deepEqual(reduced.position(), [200, 200], 'Reduced motion switches at the scaled hero midpoint');
  near(after(reduced), 0); assert.equal(reduced.raf.size, 0, 'Reduced motion uses no extra duration animation loop');
  console.log('Hero duration checks passed: unchanged 1x/180 ms hero defaults, bounds/persistence, independent 1/2.5/3 hero/about budgets and synchronized geometry/white/blur/gates/UI, responsive reverse/resume, live two-stage rebase, history/pageshow/resize and reduced motion.');
})().catch(error => {console.error(error); process.exitCode = 1;});
