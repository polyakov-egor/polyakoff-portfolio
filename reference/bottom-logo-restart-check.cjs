/* Reload and logo activation start at hero without scrolling the old document
   or touching effect settings. Back/forward restoration remains independent. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'bottom-logo-restart.js'), 'utf8');
const storageKey = 'ff.hero.restart.v1';
function target() {
  const listeners = new Map();
  return {
    addEventListener(type, callback, options = {}) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ callback, once: options.once });
    },
    dispatch(type, event = {}) {
      for (const entry of [...(listeners.get(type) || [])]) {
        entry.callback(event);
        if (entry.once) listeners.set(type, listeners.get(type).filter(item => item !== entry));
      }
    },
  };
}
function page({ href = 'https://example.test/portfolio?lang=en#works', storage = new Map(), blocked = false, initialScroll = 3000, restoration = 'auto', navigationType = 'navigate', legacyReload = false } = {}) {
  const scrolls = [], replacements = [], observers = [], frames = new Map();
  let reloads = 0, nextFrame = 0, localReads = 0;
  const logo = { disabled: true, tabIndex: -1, getAttribute() { return null; }, closest(selector) { return selector === '[data-return-hero]' ? this : null; } };
  const hero = { dataset: { aboutActive: 'false' }, querySelector: selector => selector === ':scope > [data-return-hero]' ? logo : null };
  const document = Object.assign(target(), { querySelector: selector => selector === '.hero' ? hero : null });
  const location = { href, reload() { reloads++; }, replace(value) { replacements.push(value); this.href = value; } };
  const history = { state: { kept: true }, scrollRestoration: restoration, replaceState(state, _title, value) { assert.deepEqual(state, this.state); location.href = value; } };
  const window = Object.assign(target(), {
    location, history,
    performance: legacyReload ? { navigation: { type: 1 } } : { getEntriesByType: () => [{ type: navigationType }] },
    sessionStorage: {
      getItem(key) { if (blocked) throw Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error('Storage blocked'); storage.set(key, value); },
      removeItem(key) { if (blocked) throw Error('Storage blocked'); storage.delete(key); },
    },
    scrollTo(options) { scrolls.push(options); this.scrollY = options.top; },
    scrollY: initialScroll,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
  });
  Object.defineProperty(window, 'localStorage', { get() { localReads++; throw Error('Effect storage must remain untouched'); } });
  class MutationObserver { constructor(callback) { this.callback = callback; observers.push(this); } observe(node, options) { assert.equal(node, hero); assert.deepEqual(Array.from(options.attributeFilter), ['data-about-active']); } }
  vm.runInNewContext(source, { window, document, URL, MutationObserver });
  const click = button => {
    const event = { target: button || logo, prevented: false, preventDefault() { this.prevented = true; } };
    document.dispatch('click', event); return event;
  };
  const flush = () => {
    let count = 0;
    while (frames.size) {
      const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback());
      assert(++count < 4, 'Only a bounded initial restoration correction is scheduled');
    }
  };
  return { window, document, logo, hero, storage, scrolls, replacements, observers, frames, click, flush,
    get reloads() { return reloads; }, get localReads() { return localReads; } };
}

const normal = page();
assert.equal(normal.scrolls.length, 0, 'Ordinary navigation keeps the restored scroll position');
assert.equal(normal.window.history.scrollRestoration, 'auto');
normal.document.dispatch('DOMContentLoaded');
assert(normal.logo.disabled); assert.equal(normal.logo.tabIndex, -1, 'The offscreen initial logo is excluded from keyboard navigation');
assert.equal(normal.click().prevented, false, 'An invisible disabled logo cannot restart the page');
normal.hero.dataset.aboutActive = 'true'; normal.observers[0].callback();
assert.equal(normal.logo.disabled, false); assert.equal(normal.logo.tabIndex, 0);
const clicked = normal.click();
assert(clicked.prevented); assert.equal(normal.reloads, 1, 'Logo activation performs a real reload');
assert.equal(normal.window.scrollY, 3000, 'The old document never jumps or animates to the top before reloading');
assert.equal(normal.scrolls.length, 0, 'Logo navigation does not scroll the outgoing page');
assert.equal(normal.window.history.scrollRestoration, 'manual');
assert.equal(normal.window.location.href, 'https://example.test/portfolio?lang=en', 'The old section hash is removed while other query parameters survive');
assert.equal(JSON.parse(normal.storage.get(storageKey)).restoration, 'auto');
normal.click(); assert.equal(normal.reloads, 1, 'Repeated activation during navigation cannot start duplicate reloads');
assert.equal(normal.localReads, 0);

const restarted = page({ href: normal.window.location.href, storage: normal.storage });
assert.equal(restarted.storage.has(storageKey), false, 'The restart marker is consumed once');
assert.equal(restarted.window.scrollY, 0, 'The earliest head script resets before the effect owners initialize');
assert.equal(restarted.window.history.scrollRestoration, 'manual');
restarted.document.dispatch('DOMContentLoaded'); restarted.window.scrollY = 3000;
restarted.window.dispatch('pageshow'); restarted.flush();
assert.equal(restarted.window.scrollY, 0); assert.equal(restarted.window.history.scrollRestoration, 'auto', 'The prior browser restoration policy returns after the reset settles');
const settledScrolls = restarted.scrolls.length;
restarted.window.dispatch('pageshow'); restarted.flush();
assert.equal(restarted.scrolls.length, settledScrolls, 'A later history restore does not restart this page again');
assert.equal(restarted.localReads, 0);

const subsequent = page({ storage: restarted.storage });
assert.equal(subsequent.scrolls.length, 0, 'An ordinary navigation is not reset by the consumed marker');
assert.equal(subsequent.window.location.href.endsWith('#works'), true, 'Unrelated ordinary navigation hashes are preserved');

for (const options of [{ navigationType: 'reload' }, { navigationType: 'reload', blocked: true }, { legacyReload: true }]) {
  const reload = page(options);
  assert.equal(reload.window.scrollY, 0, 'Browser reload resets before any scene initializes, without needing a logo marker');
  assert.equal(reload.window.history.scrollRestoration, 'manual');
  assert.equal(reload.window.location.href, 'https://example.test/portfolio?lang=en', 'Reload cannot jump back to a section anchor');
  reload.document.dispatch('DOMContentLoaded'); reload.window.scrollY = 3000;
  reload.window.dispatch('pageshow'); reload.flush();
  assert.equal(reload.window.scrollY, 0, 'Late browser restoration is corrected during startup');
  assert(reload.scrolls.every(scroll => scroll.behavior === 'instant'), 'Startup never requests a scrolling animation');
  assert.equal(reload.reloads, 0, 'Reload detection never creates a reload loop');
  assert.equal(reload.localReads, 0, 'Reload keeps configured effects and presets untouched');
}
const back = page({ navigationType: 'back_forward' });
back.document.dispatch('DOMContentLoaded'); back.window.dispatch('pageshow'); back.flush();
assert.equal(back.window.scrollY, 3000, 'Back/forward still restores the intended chapter');

const unavailable = page({ blocked: true });
unavailable.document.dispatch('DOMContentLoaded'); unavailable.hero.dataset.aboutActive = 'true'; unavailable.observers[0].callback();
unavailable.click();
assert.equal(unavailable.replacements.length, 1); assert.equal(unavailable.reloads, 0);
assert.equal(new URL(unavailable.replacements[0]).searchParams.get('_heroRestart'), 'auto', 'Blocked session storage uses a navigation marker rather than losing the reset');
const queryRestart = page({ href: unavailable.replacements[0], blocked: true });
queryRestart.document.dispatch('DOMContentLoaded'); queryRestart.window.dispatch('pageshow'); queryRestart.flush();
assert.equal(queryRestart.window.scrollY, 0); assert.equal(new URL(queryRestart.window.location.href).searchParams.has('_heroRestart'), false);
assert.equal(queryRestart.window.history.scrollRestoration, 'auto'); assert.equal(queryRestart.localReads, 0);

const manual = page({ storage: new Map([[storageKey, JSON.stringify({ restoration: 'manual' })]]), restoration: 'manual' });
manual.document.dispatch('DOMContentLoaded'); manual.window.dispatch('pageshow'); manual.flush();
assert.equal(manual.window.history.scrollRestoration, 'manual', 'An existing manual restoration preference is also preserved');

const fallback = page(); fallback.document.dispatch('DOMContentLoaded');
const staticLogo = { disabled: false, closest() { return this; }, getAttribute() { return null; } };
fallback.click(staticLogo); assert.equal(fallback.reloads, 1, 'The static/reduced-motion Works logo shares the restart action');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'hero-scroll.css'), 'utf8');
assert.equal((html.match(/<button class="hero__about-logo" data-return-hero/g) || []).length, 2);
assert(html.indexOf('src="./bottom-logo-restart.js"') < html.indexOf('src="./published-effect-preset.js'), 'Restart bootstrap precedes every effect owner');
assert(html.indexOf('src="./bottom-logo-restart.js"') < html.indexOf('rel="stylesheet"'), 'Reload restoration is claimed before stylesheets can delay startup');
assert(/<script src="\.\/bottom-logo-restart\.js"><\/script>/.test(html), 'The early bootstrap is synchronous');
assert(/class="welcome-card__logo"/.test(html), 'The welcome drag logo is untouched');
assert(css.includes('.hero__about-logo[data-return-hero]::before') && css.includes('inset: -12px'), 'Only a transparent hit area grows; original logo geometry stays intact');
assert(/\.hero__about-logo\[data-return-hero\]\s*\{\s*z-index:\s*7;/.test(css), 'The clickable logo sits above the transparent full-width footer at z6');
assert(/\.hero\.is-works\s*>\s*\.hero__about-logo\[data-return-hero\],[\s\S]*?\.works-viewport\s+\.hero__about-logo\[data-return-hero\]\s*\{\s*z-index:\s*1001;/.test(css), 'Enhanced and static Works logos sit above their z1000 footer instead of losing the center hit area');
console.log('Restart checks passed: browser reload starts at hero, logo reload does not scroll outgoing page, late restoration and anchors reset, legacy/blocked-storage fallbacks, preserved back/forward, focus gate and untouched effect storage.');
