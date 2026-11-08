const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makePage, turn, scrollStorageKey } = require('./scroll-check.cjs');
const source = fs.readFileSync(path.join(__dirname, '../about-reveal.js'), 'utf8');
function element() {
  return { dataset: {}, children: [], attributes: {}, style: { setProperty(key, value) { this[key] = value; } },
    setAttribute(key, value) { this.attributes[key] = String(value); }, append(...children) { this.children.push(...children); } };
}
(async () => {
  for (const [width, height] of [[375, 812], [768, 1024], [1920, 960], [2560, 1305]]) {
    const hero = element(), backdrop = element(), light = element(), centerControl = element(), cornerControl = element();
    hero.querySelector = () => backdrop; backdrop.querySelector = () => light;
    hero.getBoundingClientRect = () => ({ left: 0, top: 0 });
    centerControl.getBoundingClientRect = () => ({ left: width * .5 - 5, top: height * .58 - 5, width: 10, height: 10 });
    cornerControl.getBoundingClientRect = () => ({ left: width - 10, top: 0, width: 10, height: 10 });
    hero.querySelectorAll = () => [centerControl, cornerControl];
    const window = {}, document = { querySelector: selector => selector === '.hero' ? hero : selector === '[data-site-backdrop]' ? backdrop : null, createElementNS: () => element() };
    vm.runInNewContext(source, { document, window });
    const update = (progress, mode = 'wave', feather = .7, reducedMotion = false, blackProgress = 0) => window.HeroAboutReveal.update({ progress, mode, feather, width, height, reducedMotion, blackProgress });
    const svg = backdrop.children[0], defs = svg.children[0], matte = defs.children[1].children[0];
    for (const mode of ['wave', 'radial']) {
      update(0, mode); assert.equal(light.style.opacity, '0'); assert.equal(svg.style.visibility, 'hidden');
      if (mode === 'radial') { update(.001, mode); assert.equal(hero.style['--about-copy-progress'], '0.00000', 'Text stays light before the radial matte has area'); }
      update(.5, mode); assert.equal(light.style.maskImage, 'url(#about-exposure-mask)'); assert.equal(svg.style.visibility, 'visible');
      const middle = matte.attributes.d; assert(middle.length > 1000 && !/NaN|Infinity/.test(middle));
      if (mode === 'radial') assert(Number(centerControl.style['--about-light-progress']) > Number(cornerControl.style['--about-light-progress']), 'Each fixed control uses its own coverage, not the center logo theme');
      for (const progress of [.15, .4, .7, .99]) update(progress, mode);
      update(.5, mode); assert.equal(matte.attributes.d, middle, 'Reverse restores identical edge geometry');
      update(1, mode); assert.equal(light.style.opacity, '1'); assert.equal(light.style.maskImage, 'none'); assert.equal(svg.style.visibility, 'hidden');
      assert.equal(hero.style['--about-clock-progress'], '1.00000');
      const oldSoftness = defs.children[0].children[0].attributes.stdDeviation;
      update(.5, mode, 1.5); assert.notEqual(defs.children[0].children[0].attributes.stdDeviation, oldSoftness, 'Softness widens the exposure edge');
      update(.5, mode, .7, true); assert.equal(svg.style.visibility, 'hidden'); assert.equal(light.style.opacity, '.5'.replace(/^\./, '0.'));
      update(1,mode,.7,false,1); assert.equal(centerControl.style['--about-light-progress'],'0.00000'); assert.equal(cornerControl.style['--about-light-progress'],'0.00000','Black ending restores light navigation');
    }
    update(0, 'gradient'); assert.equal(light.style.opacity, '0');
    update(.5, 'gradient');
    const gradientMask = light.style.maskImage;
    assert(gradientMask.startsWith('linear-gradient(to bottom'), 'Plain mode uses a rising gradient without the bright edge');
    assert.equal(svg.style.visibility, 'hidden');
    assert(Number(hero.style['--about-reveal-footer-progress']) > Number(hero.style['--about-clock-progress']), 'The light field reaches the bottom controls first');
    update(.8, 'gradient'); update(.5, 'gradient'); assert.equal(light.style.maskImage, gradientMask, 'Reverse restores the same gradient');
    update(.5, 'gradient', 1.5); assert.notEqual(light.style.maskImage, gradientMask, 'Softness widens the plain gradient');
    update(1, 'gradient', .7, false, .5);
    assert(hero.style['--works-black-mask'].startsWith('linear-gradient(to bottom'));
    assert.equal(hero.style['--works-black-opacity'], '1');
    assert.equal(backdrop.style['--works-black-opacity'], '1', 'The shared fixed backdrop paints the black return');
    assert.equal(backdrop.style['--works-black-mask'], hero.style['--works-black-mask'], 'Chrome and the one background use exactly the same field');
    assert(Number(hero.style['--about-reveal-footer-progress']) < Number(hero.style['--about-clock-progress']), 'Return to black also reaches bottom controls first');
    update(1, 'gradient', .7, false, 1); assert.equal(hero.style['--about-clock-progress'], '0.00000');
    update(.5, 'gradient', .7, true, .5); assert.equal(light.style.maskImage, 'none'); assert.equal(light.style.opacity, '0.5'); assert.equal(hero.style['--works-black-opacity'], '0.5');
  }
  const page = makePage(); await turn(); page.frames();
  const api = page.window.HeroScrollEffect;
  assert.equal(api.getDefaults().aboutRevealMode, 'gradient');
  api.setSettings({ aboutRevealMode: 'radial' }); page.frames();
  assert.equal(api.getSettings().aboutRevealMode, 'radial');
  assert.equal(JSON.parse(page.storage.get(scrollStorageKey)).aboutRevealMode, 'radial');
  api.setSettings({ aboutRevealMode: 'invalid' }); assert.equal(api.getSettings().aboutRevealMode, 'radial');
  const migratedStorage = new Map([[scrollStorageKey, JSON.stringify({ aboutRevealMode: 'wave', aboutFillFeather: 1 })]]);
  const migrated = makePage(1920, 960, 0, migratedStorage); await turn(); migrated.frames();
  assert.equal(migrated.window.HeroScrollEffect.getSettings().aboutRevealMode, 'gradient', 'Existing settings activate the requested gradient once');
  assert.equal(migrated.window.HeroScrollEffect.getSettings().aboutFillFeather, 1);
  migrated.window.HeroScrollEffect.setSettings({ aboutRevealMode: 'radial' });
  const reloaded = makePage(1920, 960, 0, migratedStorage); await turn(); reloaded.frames();
  assert.equal(reloaded.window.HeroScrollEffect.getSettings().aboutRevealMode, 'radial', 'Later user choice survives a reload');
  api.resetSettings(); page.frames(); assert.equal(api.getSettings().aboutRevealMode, 'gradient'); assert.equal(page.raf.size, 0);
  console.log('About exposure: reversible gradient/wave/radial masks, bottom-up black return, UI coverage, reduced motion and one-time default migration.');
})().catch(error => { console.error(error); process.exitCode = 1; });
