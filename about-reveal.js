/* Scroll-driven exposure mattes. Geometry and light share one edge and one clock. */
(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  const backdrop = document.querySelector('[data-site-backdrop]') || hero?.querySelector('.about-backdrop');
  const light = backdrop?.querySelector('.about-backdrop__light');
  if (!hero || !backdrop || !light) return;
  const ns = 'http://www.w3.org/2000/svg';
  const make = (name, attributes = {}) => {
    const element = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  };
  const svg = make('svg', { class: 'about-reveal', 'aria-hidden': 'true' });
  const defs = make('defs');
  const mask = make('mask', { id: 'about-exposure-mask', maskUnits: 'userSpaceOnUse', maskContentUnits: 'userSpaceOnUse', 'mask-type': 'luminance' });
  const maskFilter = make('filter', { id: 'about-exposure-soft', x: '-30%', y: '-30%', width: '160%', height: '160%', 'color-interpolation-filters': 'sRGB' });
  const soft = make('feGaussianBlur', { stdDeviation: 8 });
  maskFilter.append(soft);
  const matte = make('path', { fill: '#fff', filter: 'url(#about-exposure-soft)' });
  mask.append(matte);
  const glowFilter = make('filter', { id: 'about-exposure-glow', x: '-50%', y: '-50%', width: '200%', height: '200%', 'color-interpolation-filters': 'sRGB' });
  const bloom = make('feGaussianBlur', { stdDeviation: 30 });
  glowFilter.append(bloom);
  const edgeFilter = make('filter', { id: 'about-exposure-edge', x: '-30%', y: '-30%', width: '160%', height: '160%', 'color-interpolation-filters': 'sRGB' });
  edgeFilter.append(make('feTurbulence', { type: 'fractalNoise', baseFrequency: '.012 .016', numOctaves: 2, seed: 7, result: 'grain' }),
    make('feDisplacementMap', { in: 'SourceGraphic', in2: 'grain', scale: 4, xChannelSelector: 'R', yChannelSelector: 'G' }),
    make('feGaussianBlur', { stdDeviation: 3 }));
  defs.append(maskFilter, mask, glowFilter, edgeFilter);
  const halo = make('path', { fill: 'none', stroke: '#fff', 'stroke-width': 56, filter: 'url(#about-exposure-glow)', opacity: '.84' });
  const edge = make('path', { fill: 'none', stroke: '#fff', 'stroke-width': 11, filter: 'url(#about-exposure-edge)', opacity: '.95' });
  svg.append(defs, halo, edge);
  backdrop.append(svg);
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  let last = '', dimensions = '', themeTargets = [];
  // A plain rising soft matte: the same field drives pixels and UI contrast.
  function gradientField(progress, height, feather) {
    const span = Math.max(1, height * feather);
    const top = height - (height + span) * progress;
    const bottom = top + span;
    return {
      mask: `linear-gradient(to bottom, transparent ${top.toFixed(3)}px, #000 ${bottom.toFixed(3)}px)`,
      sample: (_x, y) => clamp((y - top) / span)
    };
  }
  function geometry({ width: w, height: h, progress: p, mode, feather }) {
    const softness = Math.max(12, h * feather * .11);
    const padding = softness * 4 + h * .06;
    if (mode === 'radial') {
      const cx = w * .5, cy = h * .58;
      const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      const r = Math.max(0, (reach + padding * 2) * p - padding);
      const points = [];
      for (let i = 0; i <= 160; i++) {
        const a = i * Math.PI * 2 / 160;
        const roughness = Math.min(r * .035, h * .012);
        const radius = Math.max(0, r + roughness * (.72 * Math.sin(a * 5 + .8) + .18 * Math.sin(a * 9 - p * 2)));
        points.push(`${(cx + Math.cos(a) * radius).toFixed(2)},${(cy + Math.sin(a) * radius).toFixed(2)}`);
      }
      const boundary = `M${points.join(' L')} Z`;
      return { fill: boundary, edge: boundary, softness, sample: (x, y) => smooth(r / softness) * smooth(.5 + (r - Math.hypot(x - cx, y - cy)) / (softness * 2)) };
    }
    const center = h + padding - (h + padding * 2) * p;
    const amplitude = h * .018;
    const waveY = x => center + amplitude * (.82 * Math.sin(x / w * Math.PI * 3.2 + .6) + .14 * Math.sin(x / w * Math.PI * 7 - p * 1.8));
    const points = [];
    for (let i = 0; i <= 160; i++) { const x = -padding + (w + padding * 2) * i / 160; points.push(`${x.toFixed(2)},${waveY(x).toFixed(2)}`); }
    const boundary = `M${points.join(' L')}`;
    return { fill: `${boundary} L${w + padding},${h + padding * 2} L${-padding},${h + padding * 2} Z`, edge: boundary, softness, sample: (x, y) => smooth(.5 + (y - waveY(x)) / (softness * 2)) };
  }
  function update({ progress = 0, width, height, feather = .7, mode = 'gradient', reducedMotion = false, blackProgress = 0 }) {
    if (!(width > 0 && height > 0)) return;
    const p = clamp(progress), black = clamp(blackProgress), signature = `${width}|${height}|${p.toFixed(6)}|${feather}|${mode}|${reducedMotion}|${black.toFixed(6)}`;
    if (last === signature) return;
    last = signature;
    hero.dataset.aboutReveal = mode;
    const size = `${width}|${height}`;
    if (dimensions !== size) {
      dimensions = size;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      mask.setAttribute('x', '0'); mask.setAttribute('y', '0'); mask.setAttribute('width', width); mask.setAttribute('height', height);
      // A thin wave has a tiny object bounding box. Use the whole viewport
      // for filters so the broad bloom cannot acquire a rectangular cutoff.
      for (const filter of [maskFilter, glowFilter, edgeFilter]) {
        filter.setAttribute('filterUnits', 'userSpaceOnUse');
        filter.setAttribute('x', '0'); filter.setAttribute('y', '0');
        filter.setAttribute('width', width); filter.setAttribute('height', height);
      }
      // Read fixed navigation geometry only on resize. In radial mode the
      // logo can be on white while the corner controls are still on black.
      const origin = hero.getBoundingClientRect?.() || { left: 0, top: 0 };
      themeTargets = [...(hero.querySelectorAll?.(':scope > .hero__datetime, :scope > .hero__about-logo, :scope > .hero__footer .glass-button, :scope > .hero__footer .music-control, :scope > .hero__footer .language-control') || [])].map(element => {
        const rect = element.getBoundingClientRect();
        return { element, x: rect.left - origin.left + rect.width / 2, y: rect.top - origin.top + rect.height / 2 };
      });
    }
    const plain = mode === 'gradient';
    const useEdge = !plain && p > 0 && p < 1 && !reducedMotion;
    svg.style.visibility = useEdge ? 'visible' : 'hidden';
    light.style.opacity = String(p === 0 ? 0 : 1);
    const plainLight = gradientField(p, height, feather);
    const plainBlack = gradientField(black, height, feather);
    light.style.maskImage = p === 0 || p === 1 || reducedMotion ? 'none' : plain ? plainLight.mask : 'url(#about-exposure-mask)';
    light.style.webkitMaskImage = light.style.maskImage;
    if (reducedMotion) light.style.opacity = String(p);
    const field = useEdge ? geometry({ width, height, progress: p, mode, feather }) : plainLight;
    const useBlackMask = plain && !reducedMotion && black > 0 && black < 1;
    hero.style.setProperty('--works-black-mask', useBlackMask ? plainBlack.mask : 'none');
    hero.style.setProperty('--works-black-opacity', String(plain && !reducedMotion ? (black === 0 ? 0 : 1) : black));
    // The fixed backdrop owns all background pixels. Hero keeps its mirrored
    // values for existing chrome, diagnostics and chapter API consumers.
    backdrop.style.setProperty('--works-black-mask', useBlackMask ? plainBlack.mask : 'none');
    backdrop.style.setProperty('--works-black-opacity', String(plain && !reducedMotion ? (black === 0 ? 0 : 1) : black));
    if (useEdge) {
      matte.setAttribute('d', field.fill);
      halo.setAttribute('d', field.edge); edge.setAttribute('d', field.edge);
      soft.setAttribute('stdDeviation', Math.max(2, field.softness * .25).toFixed(2));
      bloom.setAttribute('stdDeviation', field.softness.toFixed(2));
      halo.setAttribute('stroke-width', Math.max(36, field.softness * 2).toFixed(2));
      edge.setAttribute('stroke-width', Math.max(20, height * (.035 + feather * .02)).toFixed(2));
    }
    const sample = (x, y) => (p === 0 ? 0 : p === 1 ? 1 : reducedMotion ? p : field.sample(x, y))
      * (1 - (useBlackMask ? plainBlack.sample(x, y) : black));
    // Pick contrasting ink as the return matte crosses each fixed control.
    // An inverse continuous blend makes ink and background both gray midway.
    const chromeSample = (x, y) => black > 0 ? Number(sample(x, y) > .5) : sample(x, y);
    hero.style.setProperty('--about-clock-progress', chromeSample(width * .95, height * .04).toFixed(5));
    hero.style.setProperty('--about-reveal-footer-progress', chromeSample(width * .5, height * .95).toFixed(5));
    hero.style.setProperty('--about-copy-progress', sample(width * .5, height * .58).toFixed(5));
    for (const target of themeTargets) target.element.style.setProperty('--about-light-progress', chromeSample(target.x, target.y).toFixed(5));
    window.InspirationClosing?.updateTheme?.(sample);
  }
  window.HeroAboutReveal = Object.freeze({ update });
})();
