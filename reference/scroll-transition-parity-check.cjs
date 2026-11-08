/* The real hero clock owns the About exposure and moves the welcome/logo
   surfaces spatially in both scroll directions. */
const assert = require('node:assert/strict');
const { makePage, turn, near } = require('./scroll-check.cjs');
const number = (element, property) => Number(element.style.values.get(property));
const translationY = element => {
  const match = /^translate3d\(0, ([\d.-]+)px, 0\)$/.exec(element.style.transform || '');
  assert(match, `Logo has a finite vertical entry translation: ${element.style.transform}`);
  return Number(match[1]);
};
const quintic = value => value * value * value * (value * (value * 6 - 15) + 10);

(async () => {
  for (const [width, height] of [[375, 812], [768, 1024], [1920, 960], [2560, 1305]]) {
    const measures = [];
    const page = makePage(width, height, 0, new Map(), true, {
      beforeScroll({ window }) {
        window.WorksScrollChapter = {
          measure(options) { measures.push({ ...options }); return { travel: height * 5 }; },
          update() {},
          setStart() {},
        };
      },
    });
    await turn(); page.frames();
    const api = page.window.HeroScrollEffect;
    for (const tuning of [
      { heroScrollDuration: 1, aboutScrollDuration: 1, aboutBackgroundDuration: .2, aboutRevealScrollDuration: 1 },
      { heroScrollDuration: 2, aboutScrollDuration: 2.5, aboutBackgroundDuration: .45, aboutRevealScrollDuration: 1.8 },
      { heroScrollDuration: 3, aboutScrollDuration: 3, aboutBackgroundDuration: .8, aboutRevealScrollDuration: 3 },
    ]) {
      api.setSettings(tuning); page.frames();
      const settings = api.getSettings();
      const metrics = page.window.AboutTextFlight.getMetrics();
      const span = Math.max(1, metrics.end - metrics.start);
      const measured = measures.at(-1);
      const duration = span * settings.aboutBackgroundDuration * settings.aboutRevealScrollDuration * settings.aboutScrollDuration;
      assert.equal(measured.backgroundScrollDistance, undefined, 'About exposure duration does not extend the Works journey');
      near(measured.width, width); near(measured.height, height);

      // Verify the configured interval on the real About renderer in both directions.
      const nativeStart = height * settings.heroScrollDuration
        + (metrics.start + span * settings.aboutBackgroundStart) * settings.aboutScrollDuration;
      for (const fraction of [0, .25, .5, .75, 1, .75, .5, .25, 0]) {
        page.scroll(nativeStart + duration * fraction); page.frames();
        near(number(page.hero, '--about-light-progress'), quintic(fraction), 'About uses the same configured duration forward and backward');
      }
    }

    api.setSettings({ heroScrollDuration: 1 }); page.frames();
    const welcome = page.nodes['.hero__welcome'], logo = page.nodes['.hero__about-logo'];
    const sample = fraction => {
      page.scroll(height * fraction); page.frames();
      return {
        opacity: number(welcome, '--welcome-opacity'),
        scale: number(welcome, '--welcome-scroll-scale'),
        y: parseFloat(welcome.style.values.get('--welcome-scroll-y')),
        logoOpacity: Number(logo.style.opacity),
        logoY: translationY(logo),
      };
    };
    const initial = sample(0);
    near(initial.opacity, 1); near(initial.scale, 1); near(initial.y, 0);
    near(initial.logoOpacity, 1, 'The logo uses its position, never an alpha fade');
    assert(initial.logoY > 20, 'At hero start the opaque logo sits below the bottom edge');
    const firstScroll = sample(.05);
    assert(firstScroll.opacity < 1 && firstScroll.y < 0 && firstScroll.scale < 1, 'Welcome immediately recedes when hero scrolling starts');
    const middle = sample(.125);
    near(middle.opacity, .5); near(middle.scale, .95); near(middle.y, -6);
    near(middle.logoOpacity, 1);
    assert(middle.logoY > 0 && middle.logoY < initial.logoY, 'The opaque logo rises from below instead of fading in');
    const end = sample(.3);
    near(end.opacity, 0); near(end.scale, .9); near(end.y, -12);
    near(end.logoY, 0); near(end.logoOpacity, 1);
    assert.equal(welcome.attributes['aria-hidden'], 'true');
    const returned = sample(.125);
    for (const key of Object.keys(middle)) near(returned[key], middle[key], `Reverse restores welcome/logo ${key}`);
    const restored = sample(0);
    for (const key of Object.keys(initial)) near(restored[key], initial[key], `Returning to hero restores ${key}`);
    assert.equal(welcome.attributes['aria-hidden'], 'false');
    assert.equal(page.raf.size, 0, 'All scroll-driven surfaces settle on the shared clock');
  }
  console.log('Scroll transition parity passed: native About exposure duration across settings and four viewports; immediate welcome recession, opaque logo slide and deterministic reverse.');
})().catch(error => { console.error(error); process.exitCode = 1; });
