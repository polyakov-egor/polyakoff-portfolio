const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

module.exports = function makeFlight(filename, options = {}) {
  let allowLayout = true, nodeCount = 0, writes = 0;
  let rect = {left: 409, top: 485, width: 622, height: 96, ...options.rect};
  let lineHeight = options.lineHeight ?? 48;
  let charAdvance = options.charAdvance ?? 10;
  let viewportWidth = options.viewportWidth ?? 1440;
  let viewportHeight = options.viewportHeight ?? 800;
  let firstRowInset = options.firstRowInset ?? 0;
  const autoHeight = options.autoHeight ?? Boolean(options.paragraphs);
  const read = () => assert(allowLayout, 'Flight updates cannot read layout');
  const text = value => ({
    nodeType: 3, nodeValue: value, parent: null,
    replaceWith(fragment) {
      const parent = this.parent, index = parent.children.indexOf(this);
      parent.children.splice(index, 1, ...fragment.children);
      for (const child of fragment.children) child.parent = parent;
    }
  });
  const nativeText = node => node.nodeType === 3 ? node.nodeValue : node.querySelector('.about-flight__source')?.textContent || node.textContent;
  function flow() {
    const boxes = new Map(), rows = [];
    for (const paragraph of contents[0].children) {
      if (paragraph.tagName !== 'p') continue;
      let current = [], width = 0, space = false;
      const finish = () => {
        const top = rect.top + firstRowInset + rows.length * lineHeight;
        const left = rect.left + (rect.width - width) / 2;
        for (const item of current) boxes.set(item.node, {left: left + item.x, top, width: item.width, height: lineHeight});
        rows.push({top, height: lineHeight, words: current.map(item => item.node)});
        current = []; width = 0; space = false;
      };
      for (const node of paragraph.children) {
        if (node.tagName === 'br') {
          if (!node.desktopOnly || viewportWidth >= 600) finish();
          continue;
        }
        const value = nativeText(node);
        if (!value.trim()) {space = true; continue;}
        const itemWidth = value.length * charAdvance;
        let gap = space && current.length ? charAdvance : 0;
        if (current.length && width + gap + itemWidth > rect.width + .001) {finish(); gap = 0;}
        current.push({node, x: width + gap, width: itemWidth});
        width += gap + itemWidth; space = false;
      }
      if (current.length || rows.length === 0) finish();
    }
    return {boxes, rows, height: firstRowInset + rows.length * lineHeight};
  }
  function element(tagName = 'span') {
    nodeCount++;
    const values = new Map(), direct = new Map();
    const style = {
      values,
      setProperty(key, value) { values.set(key, String(value)); writes++; },
      getPropertyValue(key) { return values.get(key) || ''; },
      removeProperty(key) { values.delete(key); writes++; }
    };
    for (const key of ['filter', 'left', 'opacity', 'transform']) Object.defineProperty(style, key, {get: () => direct.get(key), set: value => {direct.set(key, value); writes++;}});
    const node = {
      nodeType: 1, tagName, className: '', dataset: {}, children: [], attributes: {}, style,
      append(child) { child.parent = this; this.children.push(child); },
      setAttribute(key, value) { this.attributes[key] = value; },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      querySelectorAll(selector) {
        const found = [];
        for (const child of this.children) {
          if (child.nodeType !== 1) continue;
          if (selector[0] === '.' ? child.className.split(' ').includes(selector.slice(1)) : child.tagName === selector) found.push(child);
          found.push(...child.querySelectorAll(selector));
        }
        return found;
      },
      getBoundingClientRect() {
        read();
        if (this.className === 'about-copy__content') return {...rect, height: autoHeight ? flow().height : rect.height};
        if (this.className === 'about-copy') return {left: 0, top: 0, width: viewportWidth, height: viewportHeight};
        let paragraph = this;
        while (paragraph && paragraph.tagName !== 'p') paragraph = paragraph.parent;
        let word = this;
        while (word?.parent && word.parent !== paragraph) word = word.parent;
        const box = flow().boxes.get(word);
        assert(box, 'A measured word belongs to a visual flow row');
        return {...box};
      }
    };
    Object.defineProperty(node, 'firstChild', {get: () => node.children[0]});
    Object.defineProperty(node, 'textContent', {
      get: () => node.children.map(child => child.nodeType === 3 ? child.nodeValue : child.textContent).join(''),
      set: value => {node.children = []; node.append(text(value));}
    });
    Object.defineProperty(node, 'offsetHeight', {get: () => {read(); return autoHeight ? flow().height : rect.height;}});
    return node;
  }
  const copy = element('section'); copy.className = 'about-copy';
  const contents = [];
  for (let index = 0; index < (options.planeCount ?? 6); index++) {
    const plane = element('div'); plane.className = 'about-copy__plane';
    const content = element('div'); content.className = 'about-copy__content';
    (options.paragraphs || ['Turn softly', 'Then scatter']).forEach((value, row) => {
      const paragraph = element('p'); paragraph.row = row;
      if (Array.isArray(value)) value.forEach((part, index) => {
        if (index) {const br = element('br'); br.desktopOnly = Boolean(options.responsiveBreaks); paragraph.append(br);}
        paragraph.append(text(index ? ` ${part}` : part));
      });
      else paragraph.textContent = value;
      content.append(paragraph);
    });
    plane.append(content); copy.append(plane); contents.push(content);
  }
  const document = {
    querySelector: selector => selector === '.about-copy' ? copy : null,
    createElement: element, createTextNode: text, createDocumentFragment: () => element('fragment'),
    createTreeWalker(parent) {
      const nodes = [];
      const visit = node => { for (const child of node.children || []) child.nodeType === 3 ? nodes.push(child) : visit(child); };
      visit(parent); let index = 0;
      return {currentNode: null, nextNode() {this.currentNode = nodes[index++]; return Boolean(this.currentNode);}};
    },
    createRange() {
      let source, start, end;
      return {
        setStart(node, offset) {source = node; start = offset;},
        setEnd(node, offset) {assert.equal(source, node); end = offset;},
        getBoundingClientRect() { const box = source.parent.parent.getBoundingClientRect(); return {...box, left: box.left + start * charAdvance, width: (end - start) * charAdvance}; }
      };
    }
  };
  const window = {innerWidth: viewportWidth, innerHeight: viewportHeight};
  const context = vm.createContext({window, document, NodeFilter: {SHOW_TEXT: 4}, Intl, console});
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename});
  return {
    api: window.AboutTextFlight, copy, contents,
    words: () => contents[0].querySelectorAll('.about-flight__word'),
    glyphs: () => contents[0].querySelectorAll('.about-flight__glyph'),
    layout(enabled) {allowLayout = enabled;},
    resize(next) {
      rect = {...rect, ...next};
      if (Number.isFinite(next.lineHeight)) lineHeight = next.lineHeight;
      if (Number.isFinite(next.charAdvance)) charAdvance = next.charAdvance;
      if (Number.isFinite(next.firstRowInset)) firstRowInset = next.firstRowInset;
      if (Number.isFinite(next.viewportWidth)) viewportWidth = window.innerWidth = next.viewportWidth;
      if (Number.isFinite(next.viewportHeight)) viewportHeight = window.innerHeight = next.viewportHeight;
    },
    visualRows() {read(); return flow().rows;},
    nodeCount: () => nodeCount, writes: () => writes,
    snapshot() {
      return {
        progress: copy.style.values.get('--about-flight'),
        variant: copy.dataset.flightVariant,
        words: this.words().map(word => Object.fromEntries(word.style.values)),
        glyphs: this.glyphs().map(glyph => ({properties: Object.fromEntries(glyph.style.values), left: glyph.style.left, filter: glyph.style.filter}))
      };
    }
  };
};
