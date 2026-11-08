/* One semantic text plane fades through the fixed viewport band from Figma.
   There are no cloned paragraphs, lower blur filters or additive blend layers. */
(() => {
  'use strict';

  const copy = document.querySelector('.about-copy');
  const content = copy?.querySelector('.about-copy__content');
  if (!copy || !content || copy.dataset.fadeReady === 'true') return;

  const plane = document.createElement('div');
  plane.className = 'about-copy__plane';
  plane.append(content);
  copy.append(plane);
  copy.dataset.fadeReady = 'true';
  // Preserve the readiness flag consumed by existing scroll/history owners.
  copy.dataset.blurReady = 'true';

  let lastGeometry = '', band = null, lightProgress = 0, lastStart = '';
  function update({ progress = lightProgress } = {}) {
    lightProgress = Math.max(0, Math.min(1, Number(progress) || 0));
    if (!band) return;
    // Light Figma uses a longer solid reading band (50%, versus dark 25%).
    const start = (band.darkStart + band.height * .25 * lightProgress).toFixed(3) + 'px';
    if (start !== lastStart) {
      copy.style.setProperty('--about-fade-start', start);
      lastStart = start;
    }
  }
  function measure({ height, textY, textHeight } = {}) {
    if (![height, textY, textHeight].every(Number.isFinite) || height <= 0 || textHeight <= 0) return null;
    // The design's text gradient is solid through the first quarter, then
    // reaches its background color at the text block's bottom. Cache those
    // initial screen coordinates so scrolling moves text THROUGH the fade.
    const start = Math.max(0, textY + textHeight * .25);
    const end = Math.max(start + 1, textY + textHeight);
    const geometry = `${start.toFixed(3)}:${end.toFixed(3)}`;
    if (geometry !== lastGeometry) {
      band = { darkStart: start, height: textHeight };
      update();
      copy.style.setProperty('--about-fade-end', `${end.toFixed(3)}px`);
      lastGeometry = geometry;
    }
    return { start, end };
  }

  window.AboutCopyFade = Object.freeze({ measure, update });
})();
