/* Run the real stack with a deterministic DOM and clock; no browser preferences change. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'hero-welcome-stack.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'hero-welcome-stack.css'), 'utf8');

function eventTarget(extra = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatchEvent(event) { for (const callback of [...(listeners.get(event.type) || [])]) callback(event); },
    listenerCount(type) { return listeners.get(type)?.size || 0; },
  }, extra);
}

class Element {
  constructor(tag) {
    Object.assign(this, eventTarget());
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.attributes = new Map();
    this.children = [];
    this.data = '';
    this.pointerCapture = new Set();
    const properties = new Map();
    this.style = {
      setProperty: (name, value) => properties.set(name, String(value)),
      removeProperty: name => properties.delete(name),
      getPropertyValue: name => properties.get(name) || '',
    };
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.contains(name);
        this.classList[enabled ? 'add' : 'remove'](name);
        return enabled;
      },
    };
  }
  get childNodes() { return this.children; }
  get textContent() { return this.data + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this.data = String(value); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) {
    for (const child of children) { child.remove(); child.parentElement = this; this.children.push(child); }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.data = '';
    this.append(...children);
  }
  remove() {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    parent.children.splice(parent.children.indexOf(this), 1);
    this.parentElement = null;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  setPointerCapture(pointerId) { this.pointerCapture.add(pointerId); }
  hasPointerCapture(pointerId) { return this.pointerCapture.has(pointerId); }
  releasePointerCapture(pointerId) { this.pointerCapture.delete(pointerId); }
  replaceWith(node) {
    const parent = this.parentElement;
    if (!parent) return;
    const index = parent.children.indexOf(this);
    node.remove(); parent.children[index] = node; node.parentElement = parent; this.parentElement = null;
  }
  cloneNode(deep = false) {
    const node = new Element(this.tagName);
    node.className = this.className;
    node.attributes = new Map(this.attributes);
    node.data = this.data;
    if (deep) node.append(...this.children.map(child => child.cloneNode(true)));
    return node;
  }
  matches(selector) { return selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.tagName === selector.toUpperCase(); }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function clock() {
  let now = 0, sequence = 0;
  const jobs = new Map();
  return {
    setTimeout(callback, delay) { const id = ++sequence; jobs.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { jobs.delete(id); },
    get pending() { return jobs.size; },
    tick(milliseconds) {
      const end = now + milliseconds;
      let turns = 0;
      while (true) {
        const next = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        assert(++turns < 1000, 'A clock advance cannot create an unbounded timer loop');
        jobs.delete(next[0]); now = next[1].at; next[1].callback();
      }
      now = end;
    },
  };
}

function makePage({ hidden = false, reduced = false } = {}) {
  const timers = clock();
  const body = new Element('body');
  const welcome = new Element('div'); welcome.className = 'hero__welcome';
  const card = new Element('div'); card.className = 'welcome-card';
  const dots = new Element('img'); dots.className = 'welcome-card__pagination';
  dots.setAttribute('src', './assets/icons/pagination.svg'); dots.setAttribute('width', '20'); dots.setAttribute('height', '36');
  const text = new Element('p'); text.className = 'welcome-card__text'; text.setAttribute('lang', 'zh-Hans');
  const textNode = value => { const node = new Element('#text'); node.textContent = value; return node; };
  text.append(textNode('欢迎加入俱乐部，伙计！'), new Element('br'), textNode('我是叶戈尔。'));
  const logo = new Element('img'); logo.className = 'welcome-card__logo';
  logo.setAttribute('src', './assets/icons/logo.svg'); logo.setAttribute('width', '24'); logo.setAttribute('height', '24');
  card.append(dots, text, logo);
  const oldBack = new Element('div'); oldBack.className = 'welcome-card__back'; oldBack.setAttribute('aria-hidden', 'true');
  welcome.append(card, oldBack); body.append(welcome);
  const document = eventTarget({ hidden, querySelector: selector => body.querySelector(selector), createElement: tag => new Element(tag), createTextNode: textNode });
  const motion = eventTarget({ matches: reduced });
  const window = eventTarget({ matchMedia: query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return motion; } });
  const context = vm.createContext({ document, window, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  const load = () => vm.runInContext(source, context, { filename: 'hero-welcome-stack.js' });
  load();
  return {
    window, document, motion, welcome, card, oldBack, timers, load,
    api: () => window.HeroWelcomeStack,
    cards: () => welcome.querySelectorAll('.welcome-card'),
    hideDocument(value) { document.hidden = value; document.dispatchEvent({ type: 'visibilitychange' }); },
    reduceMotion(value) { motion.matches = value; motion.dispatchEvent({ type: 'change' }); },
  };
}

function assertOneAccessible(page) {
  const active = page.cards().filter(card => card.getAttribute('aria-hidden') === 'false');
  assert.equal(active.length, 1, 'Exactly one complete card is exposed to accessibility');
  assert.equal(Number(active[0].getAttribute('data-welcome-card')), page.api().getState().activeIndex);
}

const page = makePage();
assert.equal(page.cards().length, 3, 'The stack contains three whole cards');
assert(page.welcome.classList.contains('has-welcome-stack'), 'The static placeholder is hidden only after initialization');
assert.equal(page.welcome.querySelectorAll('.welcome-card__pagination').length, 3, 'All three cards keep their pagination');
assert.equal(page.welcome.querySelectorAll('.welcome-card__logo').length, 3, 'All three cards keep their logo');
for (const [index, card] of page.cards().entries()) {
  const text = card.querySelector('.welcome-card__text');
  assert.equal(text.getAttribute('lang'), index === 1 ? 'en' : 'zh-Hans');
  assert.equal(text.childNodes[0].textContent, index === 1 ? 'Welcome to the club buddy!' : '欢迎加入俱乐部，伙计！');
  assert.equal(text.childNodes[1].tagName, 'BR');
  assert.equal(text.childNodes[2].textContent, index === 1 ? 'I’m Egor' : '我是叶戈尔。');
  const dots = card.querySelectorAll('.welcome-card__dot');
  assert.equal(dots.length, 3);
  assert.equal(dots.filter(dot => dot.classList.contains('is-active')).length, 1);
  assert(dots[index].classList.contains('is-active'), 'The visible card carries the corresponding active pagination dot');
  assert.equal(card.querySelector('.welcome-card__logo').getAttribute('src'), './assets/icons/logo.svg');
  assert.equal(card.querySelector('.welcome-card__logo').getAttribute('width'), '24');
  assert.equal(card.querySelector('.welcome-card__logo').getAttribute('height'), '24');
  assert.equal(card.getAttribute('aria-live'), null, 'Card changes do not create automatic announcements');
}
assertOneAccessible(page);
assert.equal(page.timers.pending, 1);
page.timers.tick(2999);
assert.equal(page.api().getState().animating, false, 'The first card remains still for 3 seconds');
page.timers.tick(1);
assert.equal(page.api().getState().nextIndex, 1);
assert.equal(page.api().getState().animating, true);
assert.equal(page.timers.pending, 2, 'Only transition completion and the next start are scheduled');
assert(page.cards()[0].classList.contains('welcome-card--leaving'));
assert(page.cards()[1].classList.contains('welcome-card--entering'));
assert(page.cards()[2].classList.contains('welcome-card--forming-rear'));
assertOneAccessible(page);

function pointer(page, type, y, { x = 40, id = 1, button = 0, isPrimary = true } = {}) {
  const event = { type, pointerId: id, clientX: x, clientY: y, target: page.cards()[page.api().getState().activeIndex], button, isPrimary, prevented: false, preventDefault() { this.prevented = true; } };
  page.welcome.dispatchEvent(event);
  return event;
}
const manual = makePage();
manual.timers.tick(2500);
assert(pointer(manual, 'pointerdown', 100).prevented, 'A drag begins only over the active welcome card');
assert.equal(manual.timers.pending, 0, 'Pressing a card pauses the automatic timer');
assert.equal(manual.api().getState().dragging, true);
pointer(manual, 'pointermove', 65);
assert.equal(manual.welcome.style.getPropertyValue('--welcome-drag-y'), '-19.25px', 'The active card follows the vertical drag');
manual.timers.tick(6000);
assert.equal(manual.api().getState().activeIndex, 0, 'A held drag cannot be interrupted by automatic changes');
pointer(manual, 'pointerup', 65);
assert.equal(manual.api().getState().nextIndex, 1, 'Dragging up advances to English');
manual.timers.tick(650);
assert.equal(manual.api().getState().activeIndex, 1);
manual.timers.tick(2349);
assert.equal(manual.api().getState().animating, false);
manual.timers.tick(1);
assert.equal(manual.api().getState().nextIndex, 2, 'Automatic cycling resumes exactly 3 seconds after release');
manual.timers.tick(650);
pointer(manual, 'pointerdown', 100, { id: 2 });
pointer(manual, 'pointermove', 135, { id: 2 });
assert.equal(manual.welcome.style.getPropertyValue('--welcome-drag-y'), '0.00px', 'Downward movement does not pull the card into a reverse gesture');
pointer(manual, 'pointerup', 135, { id: 2 });
assert.equal(manual.api().getState().nextIndex, null, 'Dragging down does not switch cards');
assert.equal(manual.api().getState().activeIndex, 2);
assert.equal(manual.timers.pending, 1, 'A rejected downward gesture still resumes autoplay');
manual.welcome.dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault() { throw Error('Down does not control the carousel'); }, stopPropagation() {} });
assert.equal(manual.api().getState().activeIndex, 2);
pointer(manual, 'pointerdown', 100, { id: 3 });
pointer(manual, 'pointerup', 103, { id: 3 });
assert.equal(manual.api().getState().animating, false, 'A tap or tiny movement does not switch cards');
assert.equal(manual.timers.pending, 1, 'A tap restarts one automatic timer');
pointer(manual, 'pointerdown', 100, { id: 4 });
pointer(manual, 'pointercancel', 100, { id: 4 });
assert.equal(manual.api().getState().dragging, false);
assert.equal(manual.timers.pending, 1, 'Cancelling a drag restores the automatic timer');
pointer(manual, 'pointerdown', 100, { id: 5, button: 2 });
assert.equal(manual.api().getState().dragging, false, 'The right mouse button cannot start a drag');
assert.equal(manual.timers.pending, 1);
page.timers.tick(649);
assert.equal(page.api().getState().activeIndex, 0, 'Accessibility stays on the outgoing card until completion');
page.timers.tick(1);
assert.equal(page.api().getState().activeIndex, 1, 'The complete next card becomes active after 650 ms');
assert(!page.welcome.classList.contains('is-welcome-cycling'), 'Stable states immediately remove the transient filter transition');
assert.equal(page.welcome.querySelectorAll('.welcome-card--leaving').length, 0);
assertOneAccessible(page);
page.timers.tick(2349);
assert.equal(page.api().getState().animating, false);
page.timers.tick(1);
assert.equal(page.api().getState().nextIndex, 2, 'The second start is at 6000 ms, not 6650 ms');
page.timers.tick(650);
assert.equal(page.api().getState().activeIndex, 2);
page.timers.tick(2350);
assert.equal(page.api().getState().nextIndex, 0, 'The third transition wraps to the first card');
page.timers.tick(650);
assert.equal(page.api().getState().activeIndex, 0);
assert.equal(page.timers.pending, 1);
assertOneAccessible(page);

const interrupted = makePage();
interrupted.timers.tick(3200);
interrupted.api().setVisible(false);
assert.equal(interrupted.timers.pending, 0, 'Scrolling out cancels both timers during a transition');
assert.equal(interrupted.api().getState().activeIndex, 0, 'An interrupted transition restores the previous complete card');
assert.equal(interrupted.api().getState().animating, false);
assert(!interrupted.welcome.classList.contains('is-welcome-cycling'));
assertOneAccessible(interrupted);
interrupted.timers.tick(20000);
interrupted.api().setVisible(false);
assert.equal(interrupted.timers.pending, 0);
interrupted.api().setVisible(true);
interrupted.api().setVisible(true);
assert.equal(interrupted.timers.pending, 1, 'Repeated visible renders cannot duplicate the timer');
interrupted.timers.tick(2999);
assert.equal(interrupted.api().getState().animating, false);
interrupted.timers.tick(1);
assert.equal(interrupted.api().getState().animating, true, 'Resuming waits a fresh 3 seconds');
interrupted.hideDocument(true);
assert.equal(interrupted.timers.pending, 0, 'A background tab pauses and settles the stack');
interrupted.timers.tick(20000);
assert.equal(interrupted.api().getState().activeIndex, 0);
interrupted.hideDocument(false);
assert.equal(interrupted.timers.pending, 1);
interrupted.window.dispatchEvent({ type: 'pagehide' });
assert.equal(interrupted.timers.pending, 0);
interrupted.window.dispatchEvent({ type: 'pageshow' });
assert.equal(interrupted.timers.pending, 1, 'A restored page resumes without duplicate timers');

const hidden = makePage({ hidden: true });
assert.equal(hidden.timers.pending, 0, 'A page opened in the background has no autoplay timer');
hidden.hideDocument(false);
assert.equal(hidden.timers.pending, 1);
const reduced = makePage({ reduced: true });
reduced.timers.tick(20000);
assert.equal(reduced.timers.pending, 0, 'Reduced motion starts with a static stack');
assert.equal(reduced.api().getState().activeIndex, 0);
pointer(reduced, 'pointerdown', 100);
pointer(reduced, 'pointerup', 60);
assert.equal(reduced.api().getState().activeIndex, 1, 'Reduced motion still permits immediate manual card selection');
assert.equal(reduced.timers.pending, 0);
pointer(reduced, 'pointerdown', 100);
pointer(reduced, 'pointerup', 140);
assert.equal(reduced.api().getState().activeIndex, 1, 'Reduced motion also rejects a downward gesture');
reduced.reduceMotion(false);
reduced.timers.tick(3000);
assert.equal(reduced.api().getState().animating, true);
reduced.reduceMotion(true);
assert.equal(reduced.timers.pending, 0, 'Enabling reduced motion cancels an in-flight transition');
assert.equal(reduced.api().getState().activeIndex, 1);
assertOneAccessible(reduced);

const repeat = makePage();
repeat.timers.tick(3000);
const originalApi = repeat.api();
repeat.load(); repeat.load();
assert.equal(repeat.api(), originalApi, 'Reinitialization reuses the existing stack API');
assert.equal(repeat.cards().length, 3);
assert.equal(repeat.timers.pending, 2);
originalApi.destroy(); originalApi.destroy();
assert.equal(repeat.timers.pending, 0, 'Destroy clears all pending timers idempotently');
assert.equal(originalApi.getState().animating, false, 'A destroyed stack cannot report an unfinished transition');
assert.equal(repeat.cards().length, 1, 'Destroy restores the original complete card and placeholder');
assert.equal(repeat.oldBack.parentElement, repeat.welcome);
assert.equal(repeat.card.getAttribute('aria-hidden'), null);
assert(!repeat.welcome.classList.contains('has-welcome-stack'));
assert.equal(repeat.document.listenerCount('visibilitychange'), 0);
assert.equal(repeat.motion.listenerCount('change'), 0);
assert.equal(repeat.window.listenerCount('pagehide'), 0);
assert.equal(repeat.window.listenerCount('pageshow'), 0);
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'keydown']) assert.equal(repeat.welcome.listenerCount(type), 0, 'Destroy removes all interactive handlers');
assert.equal(repeat.card.querySelector('.welcome-card__pagination').getAttribute('src'), './assets/icons/pagination.svg', 'Destroy restores the original pagination asset');
repeat.load();
assert.notEqual(repeat.api(), originalApi, 'A destroyed stack can be initialized again');
assert.equal(repeat.cards().length, 3);
assert.equal(repeat.timers.pending, 1);

const stableRule = /\.hero__welcome\.has-welcome-stack > \.welcome-card\s*\{([^}]+)\}/.exec(css)?.[1];
assert(stableRule, 'Stable card styling is explicit');
assert(!/(?:^|\n)\s*opacity\s*:/.test(stableRule), 'Opacity never isolates the stable card ancestor from its backdrop');
assert(/filter:\s*none/.test(stableRule), 'Stable card ancestors have no filter');
assert(!/will-change\s*:[^;]*filter/.test(css), 'A filter will-change hint cannot create a permanent backdrop root');
assert(/backdrop-filter:\s*blur\(32px\)/.test(css), 'Both stable glass cards retain a real 32 px backdrop blur');
assert(css.includes('calc(var(--welcome-opacity, 1) * var(--stack-surface-opacity))'));
assert(css.includes('calc(var(--welcome-opacity, 1) * var(--stack-content-opacity))'));
for (const name of ['--stack-surface-opacity', '--stack-content-opacity']) {
  assert(new RegExp(`@property ${name}\\s*\\{[^}]*syntax:\\s*"<number>"[^}]*inherits:\\s*true[^}]*initial-value:\\s*0`).test(css), 'Per-card opacity is a registered inherited number');
  assert(new RegExp(`transition:[^;]*${name}\\s+var\\(--welcome-stack-duration`).test(css), 'Only the numeric per-card value receives the timed fade');
}
for (const [, transition] of css.matchAll(/transition:\s*([^;]+);/g)) {
  assert(!/(?:^|,)\s*(?:opacity|all)(?:\s|$)/.test(transition), 'Global scroll opacity never passes through a cycle opacity transition');
}
assert(/\.welcome-card--leaving\s*\{[^}]*filter:\s*blur\(8px\)/.test(css), 'Only the outgoing whole card receives a transient blur');
assert(/\.welcome-card--leaving\s*\{[^}]*translate3d\(0, -32px, 0\)/.test(css), 'The outgoing active card travels upward');
assert(/touch-action:\s*none/.test(css), 'Only welcome cards capture touch dragging; the rest of the site remains scrollable');
assert(!source.includes('requestAnimationFrame'), 'The stack does not create a frame loop');
console.log('Welcome stack checks passed: Chinese/English/Chinese cards, per-card dots, upward exit, mouse/touch drag and cancellation, 3-second resume cadence, reduced-motion manual selection, visibility cleanup and stable 32 px glass compositing.');
