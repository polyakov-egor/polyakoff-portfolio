const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {makePage, turn, near, scrollStorageKey} = require('./scroll-check.cjs');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const scrollStyles = fs.readFileSync(path.join(root, 'hero-scroll.css'), 'utf8');
const smooth = (a, b, value) => {const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t);};
const fade = p => 1 - smooth(.02, .25, p);

// Confirm the actual document hierarchy, rather than just relying on fixture
// parents: only the labels belong to the shrinking coordinate system.
const documentRoot = {children: []}, stack = [documentRoot], actualNodes = [];
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
for (const match of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*?)>/gi)) {
  const [, closing, tag, attributes] = match;
  if (closing) {while (stack.length > 1) {if (stack.pop().tag === tag.toLowerCase()) break;} continue;}
  const node = {tag: tag.toLowerCase(), classes: /\bclass=["']([^"']*)["']/.exec(attributes)?.[1].split(/\s+/) || [], parent: stack.at(-1), children: []};
  stack.at(-1).children.push(node); actualNodes.push(node);
  if (!voidTags.has(node.tag) && !/\/\s*$/.test(attributes)) stack.push(node);
}
const inside = (node, parent) => {for (let candidate = node.parent; candidate; candidate = candidate.parent) if (candidate === parent) return true; return false;};
const actualHeroes = actualNodes.filter(node => node.classes.includes('hero'));
assert.equal(actualHeroes.length, 1, 'One actual hero viewport exists');
const actualHero = actualHeroes[0];
// Later chapters reuse the clock/footer classes. This test concerns the hero
// viewport's own fixed UI, so do not count the separate Works controls.
const actual = name => {const nodes = actualNodes.filter(node => node.classes.includes(name) && (node === actualHero || inside(node, actualHero))); assert.equal(nodes.length, 1, `One actual hero ${name} exists`); return nodes[0];};
const actualFrame = actual('hero__intro-frame');
assert(inside(actual('hero__intro'), actualFrame), 'Both labels belong to the transformed intro frame');
for (const name of ['hero__datetime', 'hero__footer', 'hero__welcome', 'hero__about-logo']) assert(!inside(actual(name), actualFrame), `${name} stays outside the scaled labels`);
assert(/\.hero__intro-frame\s*\{[^}]*transform-origin:\s*0\s+0/.test(scrollStyles + styles), 'The intro frame scales around its upper-left corner');
assert(/\.mono\s*\{[^}]*font-size:\s*12px/.test(styles), 'The labels retain their original 12 px source font');
assert(html.includes('<p>I’m Egor</p>') && html.includes('<p>And I’m a designer</p>'), 'The label text remains unchanged');

function matrix(page) {
  const raw = page.nodes['.hero__intro-frame'].style.transform;
  const match = /^translate3d\(([-\d.e+]+)px, ([-\d.e+]+)px, 0\) scale\(([-\d.e+]+), ([-\d.e+]+)\)$/.exec(raw || '');
  assert(match, `A complete cached intro transform is available: ${raw}`);
  const result = match.slice(1).map(Number);
  assert(result.every(Number.isFinite), 'The intro matrix stays finite');
  return result;
}
function scene(page) {
  const style = page.nodes['.hero__scene'].style;
  const translate = /^translate3d\(([-\d.e+]+)px, ([-\d.e+]+)px, 0\)$/.exec(style.transform);
  assert(translate);
  return {x: Number(translate[1]), y: Number(translate[2]), width: parseFloat(style.width), height: parseFloat(style.height)};
}
const fixedFields = ['left', 'right', 'top', 'bottom', 'width', 'height', 'transform', 'transformOrigin', 'fontSize'];
function nodeCount(page) {
  const seen = new Set();
  const visit = node => {if (seen.has(node)) return; seen.add(node); for (const child of node.children || []) visit(child);};
  Object.values(page.nodes).forEach(visit);
  return seen.size;
}
function fixedSnapshot(page) {
  return Object.fromEntries(['.hero__datetime', '.hero__footer', '.hero__welcome', '.hero__about-logo'].map(selector => [selector, Object.fromEntries(fixedFields.map(key => [key, page.nodes[selector].style[key]]))]));
}
function seedViewportStyles(page, width) {
  const mobile = width < 600, inset = mobile ? 16 : 24;
  Object.assign(page.nodes['.hero__datetime'].style, {top: `${inset}px`, right: `${inset}px`});
  Object.assign(page.nodes['.hero__footer'].style, {left: `${inset}px`, right: `${inset}px`, bottom: mobile ? '54px' : '24px'});
  Object.assign(page.nodes['.hero__welcome'].style, {left: '50%', bottom: mobile ? '106px' : '24px', width: '280px', height: '70px', transform: 'translateX(-50%)'});
  Object.assign(page.nodes['.hero__about-logo'].style, {left: 'calc(50% - 10px)', bottom: mobile ? '54px' : '24px', width: '20px', height: '20px'});
}
function check(page, width, height, expectedP, fixed) {
  const [x, y, sx, sy] = matrix(page), card = scene(page);
  const frame = page.nodes['.hero__intro-frame'], intro = page.nodes['.hero__intro'], welcome = page.nodes['.hero__welcome'];
  near(parseFloat(frame.style.width), width, 'Intro keeps the unscaled source viewport width');
  near(parseFloat(frame.style.height), height, 'Intro keeps the unscaled source viewport height');
  near(x, card.x, 'Intro translates with the card on x'); near(y, card.y, 'Intro translates with the card on y');
  near(sx, card.width / width, 'Intro horizontal scale exactly matches card width');
  near(sy, card.height / height, 'Intro vertical scale exactly matches card height');
  const inset = width < 600 ? 16 : 24;
  const top = width < 600 ? height * .166256 : parseFloat(page.hero.style.values.get('--intro-top'));
  near(x + inset * sx, card.x + inset * card.width / width, 'The left label keeps its scaled inset inside the card');
  near(y + top * sy, card.y + top / height * card.height, 'The label top follows the card coordinate system');
  if (width >= 600) near(x + (width - inset) * sx, card.x + card.width - inset * sx, 'The right label keeps its scaled right inset');
  else near(y + (top + 23) * sy - (y + top * sy), 23 * card.height / height, 'The mobile label row and gap shrink together');
  near(12 * sx / 12, card.width / width, 'The source font width scales with the card');
  near(12 * sy / 12, card.height / height, 'The source font height scales with the card');
  assert.equal(intro.style.fontSize, undefined, 'The controller does not resize fonts separately from their frame');
  near(Number(intro.style.opacity), fade(expectedP), 'Labels use the shared .02–.25 fade');
  near(Number(welcome.style.values.get('--welcome-opacity')), fade(expectedP), 'Welcome fades at the same normalized moment');
  assert.equal(intro.attributes['aria-hidden'], fade(expectedP) < .01 ? 'true' : 'false');
  assert.equal(welcome.attributes['aria-hidden'], fade(expectedP) < .01 ? 'true' : 'false');
  assert.equal(welcome.style.opacity, undefined, 'Welcome keeps its painted-layer fade and backdrop behavior');
  assert.deepEqual(fixedSnapshot(page), fixed, 'Date, footer, welcome size/position and the separate logo remain viewport anchored');
  near(Number(page.nodes['.hero__about-logo'].style.opacity), smooth(.12, .3, expectedP), 'The separate bottom logo retains its previous fade');
  return {matrix: [x, y, sx, sy], opacity: Number(intro.style.opacity)};
}

(async () => {
  for (const [width, height] of [[375, 812], [1920, 960], [2560, 1305]]) for (const duration of [1, 3]) {
    const storage = new Map([[scrollStorageKey, JSON.stringify({heroScrollDuration: duration, aboutScrollDuration: 1})]]);
    const page = makePage(width, height, 0, storage, true); await turn();
    seedViewportStyles(page, width);
    const fixed = fixedSnapshot(page), originalNodeCount = nodeCount(page);
    page.layout(false);
    const resting = check(page, width, height, 0, fixed);
    const saved = new Map();
    for (const p of [0, .01, .02, .08, .135, .2, .24, .249, .25, .4, 1]) {
      page.scroll(height * duration * p); page.frames();
      saved.set(p, check(page, width, height, p, fixed));
      if (p === .135) near(Number(page.nodes['.hero__intro'].style.opacity), .5, 'The midpoint of the shared fade is visibly half-transparent');
      if (p === .24 && width >= 1920) assert(scene(page).width / width > .74 && scene(page).width / width < .78, 'The labels finish fading near the referenced three-quarter-width card');
    }
    for (const p of [.4, .25, .135, .08, 0]) {
      page.scroll(height * duration * p); page.frames();
      const reversed = check(page, width, height, p, fixed), expected = saved.get(p);
      reversed.matrix.forEach((value, index) => near(value, expected.matrix[index], 'Reverse reconstructs the same intro matrix'));
      near(reversed.opacity, expected.opacity, 'Reverse restores the shared label/welcome fade');
    }
    matrix(page).forEach((value, index) => near(value, resting.matrix[index], 'The original label placement and font scale return exactly'));
    assert.equal(nodeCount(page), originalNodeCount, 'Scrolling creates no replacement labels or wrappers');
    assert.equal(page.raf.size, 0);
    page.reduced.matches = true; page.reduced.dispatchEvent({type: 'change'}); page.frames();
    page.scroll(height * duration * .135); page.frame(); check(page, width, height, .135, fixed);
    assert.equal(page.raf.size, 0, 'Reduced motion uses no separate intro animation loop');
  }
  const resized = makePage(1920, 960, 0, new Map([[scrollStorageKey, JSON.stringify({heroScrollDuration: 3})]]), true); await turn();
  resized.scroll(960 * 3 * .135); resized.frames();
  resized.resize(375, 812); seedViewportStyles(resized, 375);
  resized.layout(false);
  check(resized, 375, 812, (960 * .135) / 812, fixedSnapshot(resized));
  assert.equal(resized.raf.size, 0, 'Resize uses freshly cached frame bounds without replaying a stale label pose');
  console.log('Hero intro checks passed: scene-aligned position/font scaling on mobile/FHD/QHD at 1x/3x, shared .02–.25 label/welcome fade, unscaled viewport welcome/date/footer/logo, reverse/resize/reduced motion and cached frames without layout reads.');
})().catch(error => {console.error(error); process.exitCode = 1;});
