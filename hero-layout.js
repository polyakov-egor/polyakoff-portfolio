/* Layer bounds from the five Figma artboards. The supplied original portrait
   includes the finished shadows. Individual wordmark exports preserve Figma's
   progressive blur; their artboard crop is handled separately on wide screens. */
(() => {
  const hero = document.querySelector('.hero');
  const layers = Object.fromEntries([...document.querySelectorAll('[data-layer]')].map(layer => [layer.dataset.layer, layer]));
  const frames = [
    { width: 375, height: 812, portrait: [-94, 105, 561.1248, 705.5248], wordmark: [-143, 400, 627, 182], intro: 135 },
    { width: 768, height: 1022, portrait: [-52.8384, 11.9793, 873.6768, 1032.9865], wordmark: [-179.6152, 470, 1126.3068, 295.3828], intro: 418 },
    { width: 1440, height: 800, portrait: [225.766, -130, 986.4679, 1164], wordmark: [24, 452.4103, 1392, 453.5897], intro: 380 },
    { width: 1920, height: 960, portrait: [345, -161, 1228, 1449], wordmark: [24.8751, 456.5703, 1870.2499, 609.4297], intro: 405 },
    { width: 2560, height: 1305, portrait: [494, -170, 1572, 1854.9088], wordmark: [33.4911, 598.6385, 2493.0176, 812.3616], intro: 527 },
  ];
  const exports = {
    mobile: { wordmark: [627, 182, 667.871, 222.871], raster: [375, 223] },
    tablet: { wordmark: [1126.3068, 295.3828, 1222.88, 391.952], raster: [1222.88, 391.952] },
    desktop: { wordmark: [1392, 453.5897, 1592, 653.59], raster: [1440, 448] },
    wide: { wordmark: [1870.2499, 609.4297, 2070.25, 809.43], raster: [1920, 604] },
    '2k': { wordmark: [2493.0176, 812.3616, 2693.02, 1012.36], raster: [2560, 807] },
  };
  const variants = ['mobile', 'tablet', 'desktop', 'wide', '2k'];
  const lerp = (a, b, t) => a + (b - a) * t;
  const place = (element, x, y, scaleX = 1, scaleY = scaleX) => {
    element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`;
  };
  let currentVariant;

  function layout() {
    const { width, height } = hero.getBoundingClientRect();
    let lower = frames[0], upper = frames[1];
    for (let i = 1; i < frames.length; i++) {
      lower = frames[i - 1]; upper = frames[i];
      if (width <= upper.width) break;
    }
    const t = (width - lower.width) / (upper.width - lower.width);
    const variant = width < 600 ? 'mobile' : width < 1024 ? 'tablet' : width < 1650 ? 'desktop' : width < 2240 ? 'wide' : '2k';
    if (variant !== currentVariant) {
      // <picture> already selects these exact responsive exports. Keep its
      // desktop fallback stable instead of restarting a selected image decode.
      if (!layers.wordmark.closest?.('picture')) {
        layers.wordmark.src = variant === 'tablet' ? './assets/images/figma-refresh/wordmark-tablet.svg' : `./assets/images/wordmark-${variant}-render.png`;
      }
      // The background is identical at every breakpoint. Reassigning the same
      // URL aborts an in-flight decode() during responsive preloader checks.
      if (layers.scanlines.getAttribute?.('src') !== './assets/images/backgrounds/dark.webp') {
        layers.scanlines.src = './assets/images/backgrounds/dark.webp';
      }
      currentVariant = variant;
    }

    function bounds(name) {
      const a = lower[name], b = upper[name];
      const w = lerp(a[2], b[2], t), h = lerp(a[3], b[3], t);
      const offsetX = lerp(a[0] + a[2] / 2 - lower.width / 2, b[0] + b[2] / 2 - upper.width / 2, t);
      let y = lerp(a[1] / lower.height, b[1] / upper.height, t) * height;
      // Tablet browser heights vary independently of the artboard width.
      // Retain its original crop, but never leave the portrait's lower edge
      // above the viewport. The same source bounds drive the shrinking card.
      if (name === 'portrait' && width >= 600 && width < 1440) y = Math.max(y, height - h);
      // Desktop lettering is pinned below the lower edge in the source design.
      if (name === 'wordmark' && width >= 1440) y = height + 106 - h;
      return [width / 2 + offsetX - w / 2, y, w, h];
    }

    const reference = frames[variants.indexOf(variant)];
    if (width >= 1920) {
      // Anchor the actual PNG, not the uncropped Figma vector, to the bottom.
      const [rasterWidth, rasterHeight] = exports[variant].raster;
      const scale = (width - 48) / reference.wordmark[2];
      place(layers.wordmark, (width - rasterWidth * scale) / 2, height - rasterHeight * scale, scale);
    } else if (variant === 'tablet') {
      const [x, y, w, h] = bounds('wordmark');
      const [nodeW, nodeH, intrinsicW, intrinsicH] = exports.tablet.wordmark;
      const sx = w / nodeW, sy = h / nodeH;
      place(layers.wordmark, x - (intrinsicW - nodeW) / 2 * sx, y - (intrinsicH - nodeH) / 2 * sy, sx, sy);
    } else {
      const [, y, , h] = bounds('wordmark');
      const [, refY] = reference.wordmark;
      const [, nodeH, , intrinsicH] = exports[variant].wordmark;
      const sy = h / nodeH;
      const cropY = Math.max(0, refY - (intrinsicH - nodeH) / 2);
      place(layers.wordmark, 0, y + (cropY - refY) * sy, width / reference.width, sy);
    }
    const [x, y, w, h] = bounds('portrait');
    for (const layer of [layers.portrait, layers.depth]) {
      if (!layer) continue;
      layer.style.width = `${w}px`;
      layer.style.height = `${h}px`;
      place(layer, x, y);
    }

    const backgroundScale = Math.max(1, width / 2560, height / 1305);
    place(layers.scanlines, (width - 2560 * backgroundScale) / 2,
      (height - 1305 * backgroundScale) / 2, backgroundScale);
    hero.style.setProperty('--intro-top', `${lerp(lower.intro / lower.height, upper.intro / upper.height, t) * height}px`);
    // The scroll story morphs this viewport composition into the about portrait.
    // Keep a clean source rectangle so resize never reads an animated transform.
    hero.heroLayout = { width, height, portrait: { x, y, width: w, height: h } };
    hero.dispatchEvent(new CustomEvent('hero:layout', { detail: hero.heroLayout }));
  }
  new ResizeObserver(layout).observe(hero);
  layout();
})();
