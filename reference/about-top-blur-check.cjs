const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let layoutAllowed = true;
let filterWrites = 0;
let textRect = { left: 400, top: 485, width: 622, height: 96 };
const layoutRead = () => assert(layoutAllowed, 'Frame updates must not read layout');

function textNode(value) {
  return {
    nodeType: 3, nodeValue: value, parent: null,
    replaceWith(fragment) {
      const parent = this.parent, index = parent.children.indexOf(this);
      parent.children.splice(index, 1, ...fragment.children);
      for (const child of fragment.children) child.parent = parent;
    }
  };
}

function element(tagName = 'span') {
  const values = new Map();
  let filter;
  const style = { setProperty: (key, value) => values.set(key, String(value)), values };
  Object.defineProperty(style, 'filter', { get: () => filter, set: value => { filter = value; filterWrites++; } });
  const node = {
    tagName, nodeType: 1, className: '', dataset: {}, children: [], attributes: {}, style,
    append(child) { child.parent = this; this.children.push(child); },
    setAttribute(key, value) { this.attributes[key] = value; },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      const all = [];
      for (const child of this.children) {
        if (child.nodeType !== 1) continue;
        if (selector[0] === '.' ? child.className.split(' ').includes(selector.slice(1)) : child.tagName === selector) all.push(child);
        all.push(...child.querySelectorAll(selector));
      }
      return all;
    },
    getBoundingClientRect() {
      layoutRead();
      if (this.className === 'about-copy__content') return { ...textRect };
      let row = this;
      while (row && row.tagName !== 'p') row = row.parent;
      return { left: textRect.left, top: textRect.top + (row?.row || 0) * 48, width: 10, height: 48 };
    }
  };
  Object.defineProperty(node, 'firstChild', { get: () => node.children[0] });
  Object.defineProperty(node, 'textContent', {
    get: () => node.children.map(child => child.nodeType === 3 ? child.nodeValue : child.textContent).join(''),
    set: value => { node.children = []; node.append(textNode(value)); }
  });
  Object.defineProperty(node, 'offsetHeight', { get: () => { layoutRead(); return textRect.height; } });
  return node;
}

const copy = element('section');
copy.className = 'about-copy';
const contents = [];
for (let index = 0; index < 6; index++) {
  const plane = element('div');
  plane.className = 'about-copy__plane';
  const content = element('div');
  content.className = 'about-copy__content';
  for (let row = 0; row < 2; row++) {
    const paragraph = element('p');
    paragraph.row = row;
    paragraph.textContent = row ? 'B' : 'A';
    content.append(paragraph);
  }
  plane.append(content);
  copy.append(plane);
  contents.push(content);
}

const document = {
  querySelector: selector => selector === '.about-copy' ? copy : null,
  createElement: element,
  createTextNode: textNode,
  createDocumentFragment: () => element('fragment'),
  createTreeWalker(parent) {
    const nodes = [];
    const visit = node => { for (const child of node.children || []) child.nodeType === 3 ? nodes.push(child) : visit(child); };
    visit(parent);
    let index = 0;
    return { currentNode: null, nextNode() { this.currentNode = nodes[index++]; return Boolean(this.currentNode); } };
  },
  createRange() {
    let source, start, end;
    return {
      setStart(node, offset) { source = node; start = offset; },
      setEnd(node, offset) { assert.equal(node, source); end = offset; },
      getBoundingClientRect() {
        const rect = source.parent.parent.getBoundingClientRect();
        return { ...rect, left: rect.left + start * 10, width: (end - start) * 10 };
      }
    };
  }
};
const window = { innerWidth: 1440, innerHeight: 800 };
const context = vm.createContext({ window, document, NodeFilter: { SHOW_TEXT: 4 }, Intl, console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'about-flight.js'), 'utf8'), context);
const engine = window.AboutTextFlight;
assert(engine, 'The engine initializes');
const api = { ...engine, update: (after, options = {}) => engine.update(after, { ...options, variant: 'first' }) };
api.update(0);
const geometry = { width: 1440, height: 800, textY: 485, topBlurNear: 28, topBlurFar: 107 };
const measured = api.measure(geometry);
assert.equal(measured.glyphs, 2, 'Only the semantic clear copy gets glyphs');
assert.equal(measured.rows, 2, 'The engine measures visual rows');
for (const lower of contents.slice(1)) {
  assert.equal(lower.querySelectorAll('.about-flight__glyph').length, 0, 'Lower blur copies remain untouched');
  assert.equal(lower.textContent, 'AB');
}
const glyphs = contents[0].querySelectorAll('.about-flight__glyph');
for (const glyph of glyphs) assert.equal(glyph.attributes['aria-hidden'], 'true');

layoutAllowed = false;
api.update(0, { topBlur: 10 });
assert(glyphs.every(glyph => glyph.style.filter === 'none'), 'Resting text stays sharp');
let sampleAfter = null, sampleRadius;
for (let after = 1; after < measured.end; after++) {
  api.update(after, { topBlur: 10 });
  const radius = parseFloat((glyphs[0].style.filter || '').slice(5));
  if (radius > 1 && radius < 9) { sampleAfter = after; sampleRadius = radius; break; }
}
assert(sampleAfter, 'Flying glyphs cross the fixed upper transition band');
const partial = glyphs[0].style.filter;
const beforeRepeat = filterWrites;
api.update(sampleAfter, { topBlur: 10 });
assert.equal(filterWrites, beforeRepeat, 'Identical frames reuse cached filters');
api.update(sampleAfter, { topBlur: 0 });
assert(glyphs.every(glyph => glyph.style.filter === 'none'), 'Zero disables existing blur immediately at rest');
api.update(sampleAfter, { topBlur: 40 });
assert(Math.abs(parseFloat(glyphs[0].style.filter.slice(5)) - sampleRadius * 4) < .004, 'Strength changes live without scroll');
api.update(sampleAfter - 20, { topBlur: 10 });
assert.notEqual(glyphs[0].style.filter, partial, 'Reverse scroll moves the glyph back through the viewport mask');
api.update(sampleAfter, { topBlur: 10 });
assert.equal(glyphs[0].style.filter, partial, 'Returning to a scroll position is deterministic');
api.update(sampleAfter, { reducedMotion: true });
assert(glyphs.every(glyph => glyph.style.filter === 'none'), 'Reduced motion clears glyph blur');
api.update(sampleAfter, { reducedMotion: false });
assert.equal(glyphs[0].style.filter, partial, 'Changing motion preference restores the same mask');
api.update(measured.end + 1);
assert(glyphs.every(glyph => glyph.style.filter === 'none'), 'Invisible completed glyphs release their filters');
api.update(0);
assert(glyphs.every(glyph => glyph.style.filter === 'none'), 'Reverse to the original composition clears all filters');

api.update(sampleAfter, { topBlur: 40 });
layoutAllowed = true;
const beforeMeasure = filterWrites;
api.measure({ ...geometry, topBlurNear: 400, topBlurFar: 500 });
assert.equal(api.getState().topBlur, 40, 'Measure keeps the chosen strength when no option is supplied');
assert.equal(glyphs[0].style.filter, 'blur(40.000px)', 'Updated viewport bands recompute blur at the current position');
assert(filterWrites > beforeMeasure, 'Resize invalidates filter caches');
textRect = { left: 16, top: 474, width: 343, height: 96 };
api.measure({ width: 375, height: 812, textY: 474, topBlurNear: 55, topBlurFar: 161 });
layoutAllowed = false;
api.update(sampleAfter, { topBlur: 100 });
assert.equal(api.getState().topBlur, 40, 'Invalid high strength clamps to the panel limit');
api.update(sampleAfter, { topBlur: NaN });
assert.equal(api.getState().topBlur, 40, 'Invalid non-finite updates preserve the chosen strength');
api.update(sampleAfter, { topBlur: -1 });
assert.equal(api.getState().topBlur, 0);
assert(glyphs.every(glyph => glyph.style.filter === 'none'));
console.log('Top blur checks passed: fixed viewport bands, live strength, lower-copy isolation, deterministic reverse scroll, resize cache invalidation, no frame layout reads, reduced motion and completed-filter cleanup.');
