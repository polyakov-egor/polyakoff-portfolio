/* Scroll-driven glyph distortion. The story owns its timing and CSS targets. */
(() => {
  'use strict';
  if (window.AboutSmoke) return;

  const root = document.querySelector('.redesign-about__plane');
  const filterId = 'about-smoke-filter';
  const filterReference = `url(#${filterId})`;
  if (!root || !window.CSS?.supports?.('filter', filterReference)) {
    window.AboutSmoke = Object.freeze({ set() {} });
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const namespace = 'http://www.w3.org/2000/svg';
  let noise, offset, displacement;
  const clamp = value => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  function attribute(node, name, value) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function variable(name, value) {
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }
  function create() {
    const node = (name, attributes) => {
      const element = document.createElementNS(namespace, name);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      return element;
    };
    const svg = node('svg', { width: '0', height: '0', 'aria-hidden': 'true', focusable: 'false' });
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';
    const defs = node('defs', {});
    const filter = node('filter', {
      id: filterId, filterUnits: 'objectBoundingBox', primitiveUnits: 'userSpaceOnUse',
      x: '-30%', y: '-80%', width: '160%', height: '260%', 'color-interpolation-filters': 'sRGB',
    });
    noise = node('feTurbulence', { type: 'fractalNoise', baseFrequency: '.012 .065', numOctaves: '2', seed: '7', result: 'noise' });
    offset = node('feOffset', { in: 'noise', dx: '0', dy: '0', result: 'shifted-noise' });
    displacement = node('feDisplacementMap', { in: 'SourceGraphic', in2: 'shifted-noise', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G' });
    filter.append(noise, offset, displacement);
    defs.append(filter);
    svg.append(defs);
    document.body.append(svg);
  }
  function clear() {
    variable('--about-smoke-filter', 'none');
    variable('--about-smoke-blur', '0px');
    if (displacement) attribute(displacement, 'scale', '0');
  }
  function set({ amount = 0, phase = 0, width = window.innerWidth } = {}) {
    const envelope = clamp(amount);
    if (reducedMotion.matches || envelope <= .005) return clear();
    if (!displacement) create();
    const progress = clamp(phase);
    // A fixed seed and continuous offsets let reverse scrolling retrace the warp.
    attribute(noise, 'baseFrequency', `${(.012 + progress * .0015).toFixed(5)} ${(.065 - progress * .006).toFixed(5)}`);
    attribute(offset, 'dx', (progress * 36).toFixed(2));
    attribute(offset, 'dy', (-progress * 12).toFixed(2));
    attribute(displacement, 'scale', ((width < 600 ? 10 : 24) * envelope).toFixed(2));
    variable('--about-smoke-filter', filterReference);
    variable('--about-smoke-blur', `${(.8 * envelope).toFixed(3)}px`);
  }
  reducedMotion.addEventListener('change', clear);
  window.AboutSmoke = Object.freeze({ set });
  clear();
})();
