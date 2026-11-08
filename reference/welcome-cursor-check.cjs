/* Exercise the real cursor with document events and DOM visibility flags. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'cursor.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'hero-welcome-stack.css'), 'utf8');
function target() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    dispatch(type, data = {}) { for (const fn of listeners.get(type) || []) fn(data); },
  };
}
function node(tagName = 'div') {
  const classes = new Set(), attributes = new Map();
  return {
    tagName, dataset: {}, style: {}, children: [], parentElement: null,
    classList: { add(...names) { for (const name of names) classes.add(name); }, remove(...names) { for (const name of names) classes.delete(name); }, contains(name) { return classes.has(name); }, toggle(name, force) { if (force) classes.add(name); else classes.delete(name); } },
    append(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; },
    getAttribute(name) { return attributes.get(name) ?? null; }, setAttribute(name, value) { attributes.set(name, value); },
    matches(selector) { return selector === ':disabled' && Boolean(this.disabled); },
    closest(selector) {
      for (let current = this; current; current = current.parentElement) {
        if (selector === '[data-effect-controls]' && current.controls) return current;
        if (selector === '.works-gallery-canvas' && current.classList.contains('works-gallery-canvas')) return current;
        if (selector === '[data-works-gallery]' && current.gallery) return current;
        if (selector === '.works-is-static' && current.classList.contains('works-is-static')) return current;
        if (selector === '.works-is-enhanced' && current.classList.contains('works-is-enhanced')) return current;
        if (selector === '[hidden], [inert], [aria-hidden="true"]' && (current.hidden || current.inert || current.getAttribute('aria-hidden') === 'true')) return current;
        if (selector.includes('a[href]') && (['button', 'select', 'textarea', 'summary'].includes(current.tagName) || current.tagName === 'input' && current.getAttribute('type') !== 'hidden' || ['a', 'area'].includes(current.tagName) && current.getAttribute('href') !== null || ['button', 'link'].includes(current.getAttribute('role')))) return current;
      }
      return null;
    },
  };
}
const body = node(), cursor = node(), label = node(), hero = node(), welcome = node(), inspiration = node();
const works = node(), canvas = node('canvas'), logo = node('button'), logoIcon = node('img'), genericButton = node('button'), genericLink = node('a'), disabledButton = node('button'), disabledLink = node('a'), roleButton = node(), rearCard = node('figure'), controls = node();
works.gallery = true; canvas.classList.add('works-gallery-canvas'); canvas.parentElement = works;
logoIcon.parentElement = logo; logoIcon.setAttribute('aria-hidden', 'true');
genericLink.setAttribute('href', '/project'); disabledLink.setAttribute('href', '/disabled'); disabledLink.setAttribute('aria-disabled', 'true');
disabledButton.disabled = true; roleButton.setAttribute('role', 'button'); rearCard.setAttribute('role', 'button'); rearCard.classList.add('works-card'); rearCard.parentElement = works;
works.classList.add('works-is-enhanced'); controls.controls = true;
const cards = [node(), node(), node()];
inspiration.hidden = true; inspiration.setAttribute('aria-hidden', 'true');
for (const [index, card] of cards.entries()) {
  card.dataset.flipEnabled = 'false'; card.setAttribute('aria-hidden', 'true');
  card.getBoundingClientRect = () => ({ left: 580 + index * 320, top: 250, right: 860 + index * 320, bottom: 530 });
}
cursor.querySelector = selector => selector === '.custom-cursor__label' ? label : null;
hero.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1440, bottom: 900 });
welcome.getBoundingClientRect = () => ({ left: 580, top: 800, right: 860, bottom: 870 });
welcome.dataset.welcomeVisible = 'true';
hero.dataset.aboutActive = 'false';
const document = Object.assign(target(), { body, hidden: false,
  querySelector: selector => ({ '.hero': hero, '.hero__welcome': welcome, '.custom-cursor': cursor, '.inspiration': inspiration, '[data-works-gallery]': works })[selector] || null,
  querySelectorAll: selector => selector === '.inspiration__card' ? cards : selector === '[data-return-hero]' ? [logo] : [],
  elementFromPoint: () => currentTarget,
  createElement: () => node(),
});
const window = target(), media = Object.assign(target(), { matches: true });
const observers = [];
class MutationObserver {
  constructor(fn) { this.fn = fn; this.targets = []; observers.push(this); }
  observe(element, options) { this.targets.push({ element, options }); }
}
vm.runInNewContext(source, { document, window, matchMedia: () => media, MutationObserver });
let currentTarget = body;
const move = (x, y, pointerType = 'mouse', overControls = false, hit = body) => {
  currentTarget = overControls ? controls : hit;
  document.dispatch('pointermove', { clientX: x, clientY: y, pointerType, target: currentTarget });
};
const refresh = () => observers.forEach(observer => observer.fn());
assert.equal(label.children.length, 1);
assert.equal(label.children[0].className, 'custom-cursor__label-mask');
assert.deepEqual(label.children[0].children.map(word => word.textContent), ['Scroll', 'Drag', 'Press']);
move(500, 500);
assert(cursor.classList.contains('is-visible'));
assert(cursor.classList.contains('is-in-hero'));
assert(!cursor.classList.contains('is-drag-target'));
assert(!cursor.classList.contains('is-click-target'), 'Empty hero space keeps the default square');
move(700, 830);
assert(cursor.classList.contains('is-drag-target'), 'Hovering the live welcome surface enables the drag cursor');
assert(cursor.classList.contains('is-click-target'), 'The draggable welcome uses the same 90% interactive growth');
welcome.classList.add('is-welcome-dragging');
move(700, 760);
assert(cursor.classList.contains('is-drag-target'), 'An active drag keeps its label outside the original card bounds');
welcome.classList.remove('is-welcome-dragging'); refresh();
assert(!cursor.classList.contains('is-drag-target'), 'Releasing outside the card restores Scroll without a new pointer move');
move(700, 830);
welcome.dataset.welcomeVisible = 'false'; refresh();
assert(!cursor.classList.contains('is-drag-target'), 'Scroll-driven welcome hiding clears hover with a stationary mouse');
welcome.dataset.welcomeVisible = 'true'; refresh();
assert(cursor.classList.contains('is-drag-target'));
hero.dataset.aboutActive = 'true'; refresh();
assert(!cursor.classList.contains('is-in-hero'));
assert(!cursor.classList.contains('is-drag-target'), 'The past-hero cursor never exposes a drag label');
hero.dataset.aboutActive = 'false'; refresh();
move(700, 830, 'touch');
assert(!cursor.classList.contains('is-visible'));
assert(!body.classList.contains('has-custom-cursor'));
assert(!cursor.classList.contains('is-drag-target'));
move(700, 830);
move(700, 830, 'mouse', true);
assert(!cursor.classList.contains('is-visible'), 'The tuning panel keeps the system pointer');
move(700, 830);
window.dispatch('blur');
assert(!cursor.classList.contains('is-visible'));
assert(!cursor.classList.contains('is-drag-target'));
hero.dataset.aboutActive = 'true';
cursor.classList.add('is-past-hero');
inspiration.hidden = false; inspiration.setAttribute('aria-hidden', 'false');
cards[0].dataset.flipEnabled = 'true'; cards[0].setAttribute('aria-hidden', 'false');
move(700, 400);
assert(cursor.classList.contains('is-press-target'), 'A settled clickable Inspiration card exposes PRESS after the hero');
assert(cursor.classList.contains('is-click-target'), 'The active card uses the common interactive cursor size');
assert(!cursor.classList.contains('is-in-hero'));
assert(!cursor.classList.contains('is-drag-target'));
cards[0].dataset.flipSide = 'back'; refresh();
assert(cursor.classList.contains('is-press-target'), 'The white back keeps the same clickable PRESS affordance');
move(1020, 400);
assert(!cursor.classList.contains('is-press-target'), 'A rear or non-clickable card never claims PRESS');
move(700, 400);
cards[0].dataset.flipEnabled = 'false'; refresh();
assert(!cursor.classList.contains('is-press-target'), 'A stationary pointer drops PRESS as soon as navigation disables card clicks');
cards[0].dataset.flipEnabled = 'true'; refresh();
assert(cursor.classList.contains('is-press-target'), 'PRESS returns only after the active card is ready again');
inspiration.setAttribute('aria-hidden', 'true'); refresh();
assert(!cursor.classList.contains('is-press-target'), 'Leaving Inspiration clears a stationary PRESS label');
inspiration.setAttribute('aria-hidden', 'false'); refresh();
assert(cursor.classList.contains('is-press-target'));
move(700, 400, 'touch');
assert(!cursor.classList.contains('is-visible') && !cursor.classList.contains('is-press-target'), 'Touch never paints a custom PRESS cursor');
move(700, 400); media.matches = false; media.dispatch('change');
assert(!cursor.classList.contains('is-visible') && !cursor.classList.contains('is-press-target'), 'Coarse pointer changes clean up PRESS');
assert(!cursor.classList.contains('is-click-target'), 'Coarse pointers also clear the interactive size');
media.matches = true;
inspiration.hidden = true;
for (const [name, element] of [['button', genericButton], ['link', genericLink], ['role button', roleButton], ['bottom logo icon', logoIcon]]) {
  move(100, 100, 'mouse', false, element);
  assert(cursor.classList.contains('is-click-target'), `Clickable ${name} gets the 90% enlarged square`);
  assert(!cursor.classList.contains('is-press-target'), `Generic ${name} does not claim the Inspiration-only PRESS label`);
}
for (const [name, element] of [['native disabled button', disabledButton], ['aria-disabled link', disabledLink], ['rear Works card', rearCard], ['empty gallery canvas', canvas]]) {
  move(100, 100, 'mouse', false, element);
  assert(!cursor.classList.contains('is-click-target'), `${name} must not look clickable`);
}
move(100, 100, 'mouse', false, logoIcon);
logo.disabled = true; refresh();
assert(!cursor.classList.contains('is-click-target'), 'The stationary cursor resets when the bottom logo is disabled');
logo.disabled = false; refresh();
assert(cursor.classList.contains('is-click-target'), 'Enabling the logo restores its hover without a pointer move');
currentTarget = body; window.dispatch('scroll');
assert(!cursor.classList.contains('is-click-target'), 'Scrolling a target away re-hits the DOM instead of retaining an old button');
currentTarget = genericLink; window.dispatch('resize');
assert(cursor.classList.contains('is-click-target'), 'Resize re-hits a new clickable element under the stationary pointer');
move(100, 100, 'mouse', false, canvas);
works.dataset.hoveredSequence = '3'; refresh();
assert(cursor.classList.contains('is-click-target'), 'Only a valid forefront mesh hit enlarges the full-screen Works canvas cursor');
works.dataset.hoveredSequence = ''; refresh();
assert(!cursor.classList.contains('is-click-target'), 'Leaving the clickable Works mesh clears its enlarged cursor');
rearCard.classList.add('is-front', 'is-in-view');
move(100, 100, 'mouse', false, rearCard);
assert(cursor.classList.contains('is-click-target'), 'The DOM fallback front card is clickable');
rearCard.classList.remove('is-front');
move(100, 100, 'mouse', false, rearCard);
assert(!cursor.classList.contains('is-click-target'), 'The DOM fallback rear card remains inactive');
works.classList.add('works-is-static');
move(100, 100, 'mouse', false, rearCard);
assert(cursor.classList.contains('is-click-target'), 'The static accessibility card remains clickable without a front-facing pose');
move(100, 100, 'touch', false, logoIcon);
assert(!cursor.classList.contains('is-click-target'), 'Touch never paints the enlarged logo cursor');
assert(/\.custom-cursor__label-mask\s*\{[^}]*overflow:\s*hidden/.test(css));
assert(/\.custom-cursor\.is-drag-target \.custom-cursor__word--scroll\s*\{[^}]*translateY\(-100%\)/.test(css));
assert(/\.custom-cursor__word--drag\s*\{[^}]*translateY\(100%\)/.test(css));
assert(/\.custom-cursor\.is-click-target \.custom-cursor__square\s*\{[^}]*scale\(1\.9\)/.test(css));
assert(!/scale\(1\.(25|4)\)/.test(css), 'The old target-specific cursor sizes cannot override the common 90% growth');
assert(/\.custom-cursor\.is-visible\.is-press-target \.custom-cursor__label\s*\{[^}]*opacity:\s*1/.test(css), 'PRESS overrides the later past-hero label hiding rule');
assert(/\.custom-cursor\.is-press-target \.custom-cursor__word--press\s*\{[^}]*translateY\(0\)/.test(css));
assert(!source.includes('requestAnimationFrame'), 'The cursor creates no idle frame loop');
console.log('Cursor checks passed: common 90% interactive growth, buttons/links/bottom logo, disabled and rear-card exclusions, exact Works canvas hit gating, Scroll/Drag/Press masks, stationary scroll/visibility cleanup, touch/coarse pointers and no idle loop.');
