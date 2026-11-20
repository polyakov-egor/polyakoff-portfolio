/* Keep the Hero artwork in viewport space while its departing plane crops it. */
(() => {
  'use strict';

  const visual = document.querySelector('[data-hero-flight-visual]');
  const art = document.querySelector('[data-hero-flight-art]');
  if (!visual || !art) return;

  const edgeSegments = 32;
  let lastSignature = '';

  function reset() {
    visual.style.removeProperty('clip-path');
    art.style.removeProperty('transform');
    lastSignature = '';
  }

  function update({ width, height, transform, bend, trim, departure, perspective }) {
    if (!width || !height || !perspective) return;
    if (departure <= 0) {
      if (lastSignature) reset();
      return;
    }

    const signature = [width, height, transform, bend, trim, departure, perspective].join('|');
    if (signature === lastSignature) return;

    const matrix = new DOMMatrix(transform);
    const centerX = width / 2;
    const centerY = height / 2;
    const curvature = .1 * bend * 118 / 255;
    const bottomLimit = height - trim;
    const points = [];

    function project(x, y) {
      const localX = x - centerX;
      const localY = y - centerY;
      const transformedX = matrix.m11 * localX + matrix.m21 * localY + matrix.m41;
      const transformedY = matrix.m12 * localX + matrix.m22 * localY + matrix.m42;
      const transformedZ = matrix.m13 * localX + matrix.m23 * localY + matrix.m43;
      const transformedW = matrix.m14 * localX + matrix.m24 * localY + matrix.m44;
      const divisor = transformedW - transformedZ / perspective;
      const screenX = centerX + transformedX / divisor;
      const screenY = centerY + transformedY / divisor;
      points.push(screenX.toFixed(3) + 'px ' + screenY.toFixed(3) + 'px');
    }

    function edgeInset(u) {
      const x = 2 * u - 1;
      const q = curvature * x * x;
      return height * q / (1 + 2 * q);
    }

    for (let sample = 0; sample <= edgeSegments; sample++) {
      const u = sample / edgeSegments;
      project(width * u, edgeInset(u));
    }
    for (let sample = edgeSegments; sample >= 0; sample--) {
      const u = sample / edgeSegments;
      // The existing SVG bend is clipped by the phone's bottom inset after
      // filtering. Intersect that crop with the curved boundary.
      project(width * u, Math.min(height - edgeInset(u), bottomLimit));
    }

    visual.style.clipPath = 'polygon(' + points.join(',') + ')';
    art.style.transform = 'translate3d(' + (-width * .025 * departure).toFixed(3) +
      'px,' + (-height * .015 * departure).toFixed(3) + 'px,0)';
    lastSignature = signature;
  }

  window.HeroFlightMask = Object.freeze({ update, reset });
})();
