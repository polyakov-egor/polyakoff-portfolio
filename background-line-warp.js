/* Lift and expanding impulses adapted from React Bits Topography's Gaussian
   brush/swell model, applied to our original horizontal SVG line geometry.
   https://reactbits.dev/backgrounds/topography
   Input, timing and preferences are owned by background-lines.js. */
(() => {
  'use strict';
  if (window.BackgroundLineWarp) return;
  const specs = [
    ['hero', '[data-layer="scanlines"]'],
    ['dark', '.about-backdrop__lines'],
    ['light', '.about-backdrop__light-lines'],
    ['works', '.works-backdrop__lines']
  ];
  const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
  const smoother = (a, b, n) => { const t = clamp((n - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
  const ambientOn = state => state.settings.ambientEnabled && state.settings.ambientStrength > 0 && !state.reducedMotion;
  const planes = specs.map(([kind, selector]) => {
    const source = document.querySelector(selector);
    if (!source) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'background-line-warp';
    canvas.dataset.lineWarp = kind;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    source.parentElement.insertBefore(canvas, source.nextSibling);
    return { kind, source, canvas, ctx: canvas.getContext('2d'), matrix: null, asset: null,
      visibility: source.style.visibility, active: false };
  }).filter(Boolean);
  let dirty = true, alive = true;

  function release(plane) {
    if (plane.active) plane.source.style.visibility = plane.visibility;
    plane.active = false; plane.canvas.hidden = true; plane.canvas.dataset.state = 'idle';
  }
  function reset() { for (const plane of planes) release(plane); }
  function measure() { dirty = true; }

  function displacement(x, y, state) {
    let dy = 0;
    const { spot, power, settings } = state;
    const radius = settings.radius;
    const amplitude = Math.min(settings.hoverStrength * 150, radius * .65);
    const brush = point => {
      const distance = Math.hypot(point.x - x, point.y - y);
      return distance >= radius ? 0 : Math.exp(-distance * distance / (radius * radius * .55 * .55)) * (1 - smoother(.75, 1, distance / radius));
    };
    let lift = spot && power > .001 && settings.hoverStrength > 0 ? amplitude * brush(spot) * power : 0;
    for (const trace of state.trails || []) {
      const age = (state.now - trace.time) / 1000;
      if (age >= 0 && age < 2.15) lift = Math.max(lift, amplitude * brush(trace) * .7 * Math.exp(-age / .3583));
    }
    dy -= lift;
    for (const pulse of state.ripples) {
      const age = (state.now - pulse.time) / 1000;
      if (age < 0 || age >= 4 || settings.rippleStrength <= 0) continue;
      const waveRadius = age * 210;
      const band = 55 + waveRadius * .055 + settings.rippleStrength * 40;
      const q = (Math.hypot(x - pulse.x, y - pulse.y) - waveRadius) / band;
      if (Math.abs(q) >= 3) continue;
      // A positive, widening height crest with a short attack, not a sine
      // ripple. It pushes the actual line geometry upward as it travels.
      const crest = Math.exp(-q * q) * (1 - smoother(2.7, 3, Math.abs(q)));
      dy -= Math.min(settings.rippleStrength * 150, band * .75) * crest * Math.exp(-1.1 * age)
        * smoother(0, .08, age) * (1 - smoother(3.5, 4, age));
    }
    if (ambientOn(state)) {
      const u = (x - (state.ambient?.x || 0)) / 250;
      const v = (y - (state.ambient?.y || 0)) / 310;
      const height = Math.sin(u * 1.8 + Math.sin(v * .7)) * .55
        + Math.sin(u * .8 - v * 1.35 + 1.2) * .3 + Math.cos(v * 1.7 + Math.sin(u * .6)) * .15;
      dy += height * settings.ambientStrength * 22;
    }
    return { x: 0, y: clamp(dy, -96, 96) };
  }

  function intervalsAt(y, state) {
    const intervals = [];
    const addBrush = point => {
      const dy = y - point.y, radius = state.settings.radius;
      if (Math.abs(dy) < radius) {
        const half = Math.sqrt(radius * radius - dy * dy);
        intervals.push([point.x - half, point.x + half]);
      }
    };
    if (state.spot && state.power > .001 && state.settings.hoverStrength > 0) addBrush(state.spot);
    if (state.settings.hoverStrength > 0) for (const trace of state.trails || []) {
      if (state.now - trace.time >= 0 && state.now - trace.time < 2150) addBrush(trace);
    }
    for (const pulse of state.ripples) {
      const age = (state.now - pulse.time) / 1000, dy = y - pulse.y;
      if (age < 0 || age >= 4 || state.settings.rippleStrength <= 0) continue;
      const waveRadius = age * 210, band = 55 + waveRadius * .055 + state.settings.rippleStrength * 40;
      const outer = waveRadius + 3 * band, inner = Math.max(0, waveRadius - 3 * band);
      if (Math.abs(dy) >= outer) continue;
      const half = Math.sqrt(outer * outer - dy * dy);
      if (Math.abs(dy) < inner) {
        const hole = Math.sqrt(inner * inner - dy * dy);
        intervals.push([pulse.x - half, pulse.x - hole], [pulse.x + hole, pulse.x + half]);
      } else intervals.push([pulse.x - half, pulse.x + half]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && last[1] >= interval[0]) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    return merged;
  }

  function cacheGeometry() {
    for (const plane of planes) {
      const key = plane.kind === 'hero' ? (/scanlines-2k\.svg(?:[?#]|$)/.test(plane.source.src) ? 'wide' : 'base') : plane.kind === 'works' ? 'light' : plane.kind;
      plane.asset = window.BackgroundLineMasks?.[key];
      plane.matrix = new DOMMatrix(plane.source.style.transform || undefined);
    }
    dirty = false;
  }

  function paint(plane, state) {
    const { ctx, canvas, asset, matrix: m } = plane;
    if (!ctx || !asset?.rows || !m || m.b || m.c) { release(plane); return false; }
    const hero = plane.kind === 'hero';
    const sx = hero ? Math.max(.001, state.scene.width / state.scene.baseWidth) : 1;
    const sy = hero ? Math.max(.001, state.scene.height / state.scene.baseHeight) : 1;
    const ox = state.left + (hero ? state.scene.x : 0), oy = state.top + (hero ? state.scene.y : 0);
    const pw = Math.max(1, Math.round(state.width * state.ratio)), ph = Math.max(1, Math.round(state.height * state.ratio));
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    canvas.style.width = `${state.width}px`; canvas.style.height = `${state.height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, pw, ph);
    ctx.setTransform(state.ratio, 0, 0, state.ratio, 0, 0);
    ctx.globalAlpha = asset.opacity / .2;
    ctx.fillStyle = '#000';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4.38848 * state.ratio;
    ctx.shadowOffsetY = 4.38849 * m.d * state.ratio;
    ctx.beginPath();
    let points = 0, bentRows = 0;
    const worldPoint = (x, y) => {
      const offset = displacement(ox + x * sx, oy + y * sy, state);
      return [x + offset.x / sx, y + offset.y / sy];
    };
    for (const row of asset.rows) {
      const left = Math.max(-104 / sx, row[0] * m.a + m.e);
      const right = Math.min(state.width + 104 / sx, row[2] * m.a + m.e);
      const center = (row[1] + row[3]) / 2 * m.d + m.f;
      const half = (row[3] - row[1]) / 2 * m.d;
      if (center < -104 / sy || center > state.height + 104 / sy || right <= left) continue;
      const ranges = intervalsAt(oy + center * sy, state).map(([a,b]) =>
        [Math.max(left, (a - ox) / sx), Math.min(right, (b - ox) / sx)]).filter(([a,b]) => b > a);
      const ambient = ambientOn(state);
      if (!ambient && !ranges.length) { ctx.rect(left, center - half, right - left, half * 2); continue; }
      const samples = [left, right];
      if (ambient) {
        const segments = Math.max(1, Math.ceil((right - left) * sx / 24));
        for (let i = 1; i < segments; i++) samples.push(left + (right - left) * i / segments);
      }
      for (const [a,b] of ranges) {
        samples.push(a);
        const segments = Math.max(1, Math.ceil((b - a) * sx / 8));
        for (let i = 1; i < segments; i++) samples.push(a + (b - a) * i / segments);
        samples.push(b);
      }
      samples.sort((a,b) => a - b);
      const path = samples.filter((x,i) => !i || Math.abs(x - samples[i - 1]) > .001).map(x => worldPoint(x, center));
      ctx.moveTo(path[0][0], path[0][1] - half);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1] - half);
      for (let i = path.length - 1; i >= 0; i--) ctx.lineTo(path[i][0], path[i][1] + half);
      ctx.closePath(); points += path.length; bentRows++;
    }
    // Match the SVG's shadow: saturated SourceAlpha casts the shadow, the
    // original hard stroke is subtracted, then its .2 white fill is restored.
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.globalCompositeOperation = 'destination-out'; ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fff';
    ctx.globalAlpha = asset.opacity; ctx.fill(); ctx.globalAlpha = 1;
    // Commit the replacement only after the full frame has been painted.
    if (!plane.active) plane.visibility = plane.source.style.visibility;
    plane.source.style.visibility = 'hidden'; plane.active = true; canvas.hidden = false;
    canvas.dataset.state = 'deformed'; canvas.dataset.bentRows = String(bentRows); canvas.dataset.points = String(points);
    return true;
  }

  function render(state) {
    if (!alive) return false;
    if (state.reducedMotion || !ambientOn(state) && !(state.power > .001 && state.settings.hoverStrength > 0) && !state.ripples.length && !(state.trails || []).length) { reset(); return true; }
    if (dirty) cacheGeometry();
    let ready = false;
    const backdropVisible = state.scene.width < state.width - .5 || state.scene.height < state.height - .5;
    for (const plane of planes) {
      const shown = state.scope === 'works' ? plane.kind === 'works'
        : plane.kind === 'works' ? false : plane.kind === 'hero' ? state.scene.decorationOpacity > .001
          : backdropVisible && (plane.kind === 'dark' ? state.scene.lightProgress < .999 : state.scene.lightProgress > .001);
      if (!shown) { release(plane); continue; }
      try { ready = paint(plane, state) || ready; } catch { release(plane); plane.canvas.dataset.state = 'unavailable'; }
    }
    return ready;
  }

  window.BackgroundLineWarp = Object.freeze({ render, measure, reset, sample: displacement,
    destroy() { alive = false; reset(); for (const plane of planes) plane.canvas.remove(); delete window.BackgroundLineWarp; }
  });
})();
