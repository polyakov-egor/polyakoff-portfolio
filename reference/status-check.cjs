const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'hero-status.js'), 'utf8');

function openPage(timestamp, navigationMilliseconds = 0) {
  let wallTime = Date.parse(timestamp);
  let elapsed = navigationMilliseconds;
  const listeners = {};
  const timers = new Map();
  let nextTimer = 0;
  const makeElement = () => ({textContent: '', attributes: {}, setAttribute(name, value) {this.attributes[name] = value;}});
  // The two chapters own separate clocks. Global date/time lookups must not
  // accidentally update only the hero or reuse its children for the works.
  const statuses = Array.from({length: 2}, () => {
    const elements = Object.fromEntries([
      '.hero__datetime', '[data-live-date]', '[data-live-weekday]',
      '.hero__datetime time', '[data-music-elapsed]',
    ].map(selector => [selector, makeElement()]));
    elements['.hero__datetime'].querySelector = selector => selector === 'time'
      ? elements['.hero__datetime time'] : elements[selector];
    return elements;
  });
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [wallTime])); }
    static now() { return wallTime; }
  }
  const document = {
    hidden: false,
    querySelectorAll: selector => selector === '.hero__datetime' || selector === '[data-music-elapsed]'
      ? statuses.map(elements => elements[selector]) : [],
    addEventListener: (name, fn) => {listeners[name] = fn;},
  };
  const window = {addEventListener: (name, fn) => {listeners[name] = fn;}};
  vm.runInNewContext(source, {
    document, window, Intl, Date: Clock, performance: {now: () => elapsed},
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, {fn, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return {statuses, document, timers, listeners, advance(wallMilliseconds, elapsedMilliseconds = wallMilliseconds) {
    wallTime += wallMilliseconds;
    elapsed += elapsedMilliseconds;
    const pending = timers.values().next().value;
    if (pending) pending.fn();
  }};
}

const page = openPage('2026-10-25T20:59:59.000Z', 1375);
assert.notEqual(page.statuses[0]['.hero__datetime'], page.statuses[1]['.hero__datetime']);
for (const elements of page.statuses) {
  assert.equal(elements['[data-live-date]'].textContent, '25 October');
  assert.equal(elements['[data-live-weekday]'].textContent, 'Sunday');
  assert.equal(elements['.hero__datetime time'].textContent, '23:59:59');
  assert.equal(elements['[data-music-elapsed]'].textContent, '00:01');
}
page.advance(1000);
for (const elements of page.statuses) {
  assert.equal(elements['[data-live-date]'].textContent, '26 October');
  assert.equal(elements['[data-live-weekday]'].textContent, 'Monday');
  assert.equal(elements['.hero__datetime time'].textContent, '00:00:00');
  assert.equal(elements['.hero__datetime time'].dateTime, '2026-10-25T21:00:00.000Z');
  assert(elements['.hero__datetime'].attributes['aria-label'].includes('Moscow time'));
}

page.document.hidden = true;
page.listeners.visibilitychange();
assert.equal(page.timers.size, 0);
page.advance(3600000);
page.document.hidden = false;
page.listeners.visibilitychange();
for (const elements of page.statuses) assert.equal(elements['[data-music-elapsed]'].textContent, '60:02');
assert.equal(page.timers.size, 1);
page.advance(-3600000, 1000);
for (const elements of page.statuses) assert.equal(elements['[data-music-elapsed]'].textContent, '60:03');

page.listeners.pagehide();
assert.equal(page.timers.size, 0);
page.listeners.pageshow();
assert.equal(page.timers.size, 1);
const reloaded = openPage('2026-10-26T12:00:00.000Z', 0);
for (const elements of reloaded.statuses) assert.equal(elements['[data-music-elapsed]'].textContent, '00:00');
console.log('Status checks passed: two independently scoped clocks and elapsed labels, Moscow midnight and weekday, navigation timing, background resume, wall-clock changes, page lifecycle, reload reset.');
