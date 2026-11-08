/* Origin-clean, shadow-free line masks for canvas in standalone file:// pages.
   Existing Figma SVG files stay untouched. Mask opacity is set by the renderer. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const imagePath = path.resolve(__dirname, '..', 'assets', 'images');
const sources = {
  base: 'scanlines.svg',
  wide: 'scanlines-2k.svg',
  dark: 'about-lines-black-2k.svg',
  light: 'about-lines-light-2k.svg',
};
const digest = value => createHash('sha256').update(value).digest('hex');

function attributes(tag) {
  const body = tag.replace(/^<[\w:-]+\b/, '').replace(/\/?\s*>$/, '');
  const values = {};
  const remainder = body.replace(/\s+([\w:-]+)="([^"]*)"/g, (_match, key, value) => {
    assert(!Object.hasOwn(values, key), `Duplicate SVG attribute: ${key}`);
    values[key] = value;
    return '';
  });
  assert(!remainder.trim(), 'Only literal double-quoted SVG attributes are supported');
  return values;
}

function permittedAttributes(values, allowed) {
  for (const key of Object.keys(values)) assert(allowed.includes(key), `Unsupported SVG attribute: ${key}`);
}

function rowBounds(d) {
  const tokens = d.match(/[MLHVZ]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi);
  const points = []; let i = 0, command, x = 0, y = 0;
  while (i < tokens.length) {
    if (/^[MLHVZ]$/.test(tokens[i])) command = tokens[i++];
    if (command === 'Z') break;
    if (command === 'M' || command === 'L') { x = Number(tokens[i++]); y = Number(tokens[i++]); }
    else if (command === 'H') x = Number(tokens[i++]);
    else if (command === 'V') y = Number(tokens[i++]);
    else throw new Error('Expected absolute rectangular line path');
    assert(Number.isFinite(x) && Number.isFinite(y)); points.push([x,y]);
    if (command === 'M') command = 'L';
  }
  const left=Math.min(...points.map(p=>p[0])),right=Math.max(...points.map(p=>p[0]));
  const top=Math.min(...points.map(p=>p[1])),bottom=Math.max(...points.map(p=>p[1]));
  assert(right>left && bottom>top && bottom-top<2.01);
  assert(points.every(p=>(Math.abs(p[0]-left)<.011||Math.abs(p[0]-right)<.011)&&(Math.abs(p[1]-top)<.011||Math.abs(p[1]-bottom)<.011)), d);
  return [left,top,right,bottom];
}

function makeMask(source) {
  assert(!/[<&](?:!|\?|script\b|image\b|use\b)|\b(?:href|on\w+)\s*=/i.test(source), 'Line masks cannot contain external assets, executable content or references');
  const defs = source.match(/<defs>[\s\S]*?<\/defs>/g) || [];
  assert.equal(defs.length, 1, 'Expected one shadow-only SVG definitions block');
  const filterIds = [...defs[0].matchAll(/<filter\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(filterIds.length, 1, 'Expected one drop-shadow filter');
  for (const tag of defs[0].matchAll(/<\/?([\w:-]+)\b[^>]*>/g)) {
    assert(['defs', 'filter', 'feFlood', 'feColorMatrix', 'feOffset', 'feGaussianBlur', 'feComposite', 'feBlend'].includes(tag[1]), 'Definitions must contain only supported drop-shadow primitives');
  }

  const withoutDefs = source.replace(defs[0], '');
  let mask = withoutDefs;
  let width, height, viewBox;
  let paths = 0;
  for (const match of withoutDefs.matchAll(/<([\w:-]+)\b[^>]*>/g)) {
    const [tag, type] = match;
    const values = attributes(tag);
    if (type === 'svg') {
      permittedAttributes(values, ['preserveAspectRatio', 'overflow', 'style', 'width', 'height', 'viewBox', 'fill', 'xmlns']);
      assert.equal(values.preserveAspectRatio, 'none');
      assert.equal(values.fill, 'none');
      assert.equal(values.xmlns, 'http://www.w3.org/2000/svg');
      assert.equal(values.style, 'display: block;');
      width = Number(values.width);
      height = Number(values.height);
      viewBox = values.viewBox;
      assert(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height));
      assert.equal(viewBox, `0 0 ${values.width} ${values.height}`, 'Keep the original source coordinate system');
    } else if (type === 'g') {
      permittedAttributes(values, ['id', 'opacity', 'filter']);
      assert.equal(values.filter, `url(#${filterIds[0]})`, 'Only the local shadow filter may be stripped');
      assert(Number(values.opacity) >= 0 && Number(values.opacity) <= 1);
      const clean = tag.replace(/\s+filter="[^"]*"/, '').replace(/\s+opacity="[^"]*"/, ' opacity="1"');
      mask = mask.replace(tag, clean);
    } else if (type === 'path') {
      permittedAttributes(values, ['d', 'fill', 'fill-opacity', 'shape-rendering']);
      assert(values.d && /^[Mm]/.test(values.d), 'Each line needs its original path geometry');
      assert.equal(values.fill, 'white', 'Line paths must be white');
      assert(Number(values['fill-opacity']) >= 0 && Number(values['fill-opacity']) <= 1);
      assert.equal(values['shape-rendering'], 'crispEdges');
      mask = mask.replace(tag, tag.replace(/\s+fill-opacity="[^"]*"/, ' fill-opacity="1"'));
      paths++;
    } else assert.fail(`Unsupported line-mask geometry: ${type}`);
  }
  assert(paths > 0 && width && height && viewBox, 'SVG mask must contain a root and line paths');
  assert(!/\bfilter=|<defs\b|url\(|(?:href|on\w+)\s*=/.test(mask), 'Generated masks must have no filters or references');
  const originalGeometry = [...withoutDefs.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map(match => match[1]);
  const maskGeometry = [...mask.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map(match => match[1]);
  assert.deepEqual(maskGeometry, originalGeometry, 'Mask generation must preserve every path byte for byte');
  const rows = originalGeometry.map(rowBounds);
  const group = source.match(/<g\b[^>]*opacity="([^"]+)"/);
  const opacity = Number(group[1]) * .2;
  return {rows, opacity, src: 'data:image/svg+xml;base64,' + Buffer.from(mask).toString('base64'), width, height, paths, mask};
}

const entries = [];
for (const [key, filename] of Object.entries(sources)) {
  const source = fs.readFileSync(path.join(imagePath, filename), 'utf8');
  const {src, width, height, paths, mask, rows, opacity} = makeMask(source);
  entries.push(`${JSON.stringify(key)}: Object.freeze(${JSON.stringify({src, width, height, rows, opacity})})`);
  console.log(`${key}: ${width}x${height}, ${paths} paths; source ${digest(source)}; mask ${digest(mask)}`);
}
const bundle = '/* Generated by scripts/build-line-masks.cjs. Opaque white paths; renderer owns strength. */\n'
  + 'window.BackgroundLineMasks = Object.freeze({\n' + entries.join(',\n') + '\n});\n';
const output = path.join(imagePath, 'line-masks.js');
fs.writeFileSync(output, bundle);
console.log(`Line mask bundle created; sha256 ${digest(bundle)}`);
