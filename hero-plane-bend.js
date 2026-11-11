/* Bend the composed Hero during departure using one reusable SVG filter. */
(() => {
  'use strict';

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const filterId = 'hero-plane-bend-filter';
  const filterReference = `url(#${filterId})`;
  const mapSize = 96;
  // The outer edges bend by up to 4.6% of the plane height at full strength.
  const maxScale = .1;
  let initialized = false;
  let displacement = null;
  let requestedPlane = null;
  let requestedAmount = 0;
  let filteredPlane = null;
  let appliedScale = '';

  function paint() {
    if (filteredPlane && (filteredPlane !== requestedPlane || requestedAmount === 0)) {
      filteredPlane.style.removeProperty('filter');
      filteredPlane = null;
    }
    if (!displacement || requestedAmount === 0) return;

    const scale = (maxScale * requestedAmount).toFixed(5);
    if (scale !== appliedScale) {
      displacement.setAttribute('scale', scale);
      appliedScale = scale;
    }
    if (!filteredPlane) {
      filteredPlane = requestedPlane;
      filteredPlane.style.filter = filterReference;
    }
  }

  function createMap() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = mapSize;
    const context = canvas.getContext('2d');
    if (!context) return '';

    const pixels = context.createImageData(mapSize, mapSize);
    for (let row = 0; row < mapSize; row++) {
      const y = 2 * row / (mapSize - 1) - 1;
      for (let column = 0; column < mapSize; column++) {
        const x = 2 * column / (mapSize - 1) - 1;
        const edge = x * x;
        const index = 4 * (row * mapSize + column);
        // The map samples inward horizontally and compresses the vertical
        // edges while leaving the center at its original height.
        pixels.data[index] = Math.round(127.5 - 90 * x * (1 - edge));
        pixels.data[index + 1] = Math.round(127.5 + 118 * y * edge);
        pixels.data[index + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png');
  }

  function initialize() {
    initialized = true;
    if (!window.CSS?.supports?.('filter', filterReference)) return;
    const warp = document.createElementNS(svgNamespace, 'feDisplacementMap');
    if (!('scale' in warp)) return;

    let map;
    try { map = createMap(); } catch { return; }
    if (!map) return;

    // Keep the plane visible without a filter until the small map is decoded.
    const image = new Image();
    image.onload = () => {
      const svg = document.createElementNS(svgNamespace, 'svg');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.style.position = 'absolute';

      const filter = document.createElementNS(svgNamespace, 'filter');
      filter.id = filterId;
      filter.setAttribute('filterUnits', 'objectBoundingBox');
      filter.setAttribute('primitiveUnits', 'objectBoundingBox');
      filter.setAttribute('x', '0');
      filter.setAttribute('y', '0');
      filter.setAttribute('width', '1');
      filter.setAttribute('height', '1');
      filter.setAttribute('color-interpolation-filters', 'sRGB');

      const source = document.createElementNS(svgNamespace, 'feImage');
      source.setAttribute('href', map);
      source.setAttribute('preserveAspectRatio', 'none');
      source.setAttribute('result', 'bendMap');
      warp.setAttribute('in', 'SourceGraphic');
      warp.setAttribute('in2', 'bendMap');
      warp.setAttribute('xChannelSelector', 'R');
      warp.setAttribute('yChannelSelector', 'G');
      filter.append(source, warp);
      svg.append(filter);
      document.body.append(svg);
      displacement = warp;
      paint();
    };
    image.src = map;
  }

  window.HeroPlaneBend = {
    set(plane, amount) {
      if (!plane?.style) return;
      requestedPlane = plane;
      requestedAmount = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
      if (!initialized && requestedAmount > 0) initialize();
      paint();
    },
  };
})();
