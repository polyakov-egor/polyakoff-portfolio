/* Scroll-driven type scatter in the single semantic gradient-masked plane. */
(() => {
  'use strict';

  if (window.AboutTextFlight) return;
  const copy = document.querySelector('.about-copy');
  const guide = document.querySelector('.about-flight-guide');
  const firstPlane = copy?.querySelector('.about-copy__plane');
  const content = firstPlane?.querySelector('.about-copy__content') || copy?.querySelector('.about-copy__content');
  if (!copy || !content) return;

  const words = [];
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
  const clamp = value => Math.max(0, Math.min(1, value));
  let glyphCount = 0;
  let measured = { start: 0, end: 0, span: 1, rows: 0, glyphs: 0 };
  let lastAfter = 0;
  let lastReduced = false;
  let lastProgress = null;
  let lastTopBlur = 10;
  let lastVariant = 'second';
  let lastFadeSpeed = 1;
  let poseRevision = 0;
  const tuning = {
    startOffset: 0, wordForce: 1, letterForce: 1, fadeBoundary: 1,
    fadeSoftness: .12 / .205, fadeShape: 'distance', fadeOrigin: 'screen',
    detach: .14, rotation: 1, showGuide: false, triggerMode: 'portrait', triggerGapPx: 100
  };
  const limits = {
    startOffset: [-.5, .5], wordForce: [0, 3], letterForce: [0, 3],
    fadeBoundary: [.25, 2], fadeSoftness: [.05, 1], detach: [0, .6], rotation: [0, 2], triggerGapPx: [0, 400]
  };
  let blurGeometry = { textY: 0, near: 0, far: 1 };
  let blurGlyphs = [];
  let flightWords = [];
  let viewport = { width: 1, height: 1 };
  let textGeometry = { centerX: 0, height: 0 };
  let lastGuideGeometry = '';
  let anchor = { bottom: null, lineHeight: 67.2, firstRowTop: 0, maxRowTop: 0, maxLag: 0 };
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

  function graphemes(text) {
    if (segmenter) return Array.from(segmenter.segment(text), item => ({ text: item.segment, index: item.index }));
    let index = 0;
    return Array.from(text, character => {
      const item = { text: character, index };
      index += character.length;
      return item;
    });
  }

  // A stable hash gives the same scatter after resize and on reverse scroll.
  function random(index, salt) {
    let seed = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 1, 668265263);
    seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
    return ((seed ^ (seed >>> 16)) >>> 0) / 4294967295;
  }

  function splitNode(textNode) {
    const text = textNode.nodeValue;
    if (!text || !text.trim()) return;
    const fragment = document.createDocumentFragment();
    // Keep real whitespace and the existing BR nodes. A hyphen remains on
    // its preceding fragment, retaining the original high-/quality wrap.
    const tokens = text.match(/\s+|[^\s-]+-(?=\S)|[^\s]+/gu) || [];
    for (const token of tokens) {
      if (/^\s+$/u.test(token)) {
        fragment.append(document.createTextNode(token));
        continue;
      }
      const word = document.createElement('span');
      word.className = 'about-flight__word';
      const source = document.createElement('span');
      source.className = 'about-flight__source';
      source.textContent = token;
      word.append(source);
      const glyphs = graphemes(token).map(item => {
        const glyph = document.createElement('span');
        glyph.className = 'about-flight__glyph';
        glyph.textContent = item.text;
        glyph.setAttribute('aria-hidden', 'true');
        word.append(glyph);
        return { element: glyph, text: item.text, index: item.index, seed: glyphCount++ };
      });
      words.push({ element: word, source, glyphs });
      fragment.append(word);
    }
    textNode.replaceWith(fragment);
  }

  // Snapshot text nodes before editing; never split the visually hidden H2.
  for (const paragraph of content.querySelectorAll('p')) {
    const nodes = [];
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) splitNode(node);
  }
  content.dataset.flightOriginal = 'true';
  copy.dataset.flightReady = 'true';

  function configure(options = {}) {
    if (!options || typeof options !== 'object') return getState();
    if (typeof options.topBlur === 'number' && Number.isFinite(options.topBlur)) lastTopBlur = Math.max(0, Math.min(40, options.topBlur));
    if (options.variant === 'first' || options.variant === 'second') lastVariant = options.variant;
    if (typeof options.fadeSpeed === 'number' && Number.isFinite(options.fadeSpeed)) lastFadeSpeed = Math.max(.5, Math.min(2, options.fadeSpeed));
    for (const [key, [min, max]] of Object.entries(limits)) {
      if (typeof options[key] === 'number' && Number.isFinite(options[key])) {
        const value = Math.max(min, Math.min(max, options[key]));
        if (value !== tuning[key] && ['wordForce', 'letterForce', 'rotation'].includes(key)) poseRevision++;
        tuning[key] = value;
      }
    }
    if (['distance', 'circle', 'ellipse', 'linear', 'box'].includes(options.fadeShape)) tuning.fadeShape = options.fadeShape;
    if (options.fadeOrigin === 'text' || options.fadeOrigin === 'screen') tuning.fadeOrigin = options.fadeOrigin;
    if (typeof options.showGuide === 'boolean') tuning.showGuide = options.showGuide;
    if (options.triggerMode === 'portrait' || options.triggerMode === 'viewport') {
      if (tuning.triggerMode !== options.triggerMode) poseRevision++;
      tuning.triggerMode = options.triggerMode;
    }
    return getState();
  }

  function getMetrics() {
    const anchored = lastVariant === 'second' && tuning.triggerMode === 'portrait' && Number.isFinite(anchor.bottom);
    if (anchored) {
      const triggerY = anchor.bottom + tuning.triggerGapPx;
      const rawStart = blurGeometry.textY + anchor.firstRowTop - triggerY;
      const start = Math.max(0, rawStart);
      const span = 1305 * .38 * anchor.lineHeight / 67.2;
      return {
        ...measured, start, span, rawStart,
        end: Math.max(0, rawStart + anchor.maxRowTop - anchor.firstRowTop) + span * (1 + anchor.maxLag),
        activeTriggerMode: 'portrait', triggerY, lineHeight: anchor.lineHeight
      };
    }
    const start = lastVariant === 'second' ? Math.max(0, measured.start + tuning.startOffset * viewport.height) : measured.start;
    return { ...measured, start, end: measured.end ? measured.end + start - measured.start : 0,
      activeTriggerMode: 'viewport', triggerY: null, lineHeight: anchor.lineHeight };
  }

  function fadeGeometry() {
    const { width, height } = viewport;
    const screen = tuning.fadeOrigin === 'screen';
    const scale = tuning.fadeBoundary / lastFadeSpeed;
    const circle = tuning.fadeShape === 'circle';
    return {
      x: screen ? width / 2 : textGeometry.centerX,
      y: screen ? height / 2 : blurGeometry.textY - getMetrics().start + textGeometry.height / 2,
      rx: (circle ? Math.min(width, height) : width) * .45 * scale,
      ry: (circle ? Math.min(width, height) : height) * .45 * scale
    };
  }

  function updateGuide(geometry) {
    if (!guide) return;
    const visible = tuning.showGuide && lastVariant === 'second' && tuning.fadeShape !== 'distance' && lastAfter > 0 && !lastReduced;
    if (guide.hidden === visible) guide.hidden = !visible;
    if (!visible) return;
    const values = [geometry.x, geometry.y, geometry.rx, geometry.ry, tuning.fadeSoftness].map(value => value.toFixed(3));
    const signature = `${tuning.fadeShape}:${values.join(':')}`;
    if (signature === lastGuideGeometry) return;
    lastGuideGeometry = signature;
    guide.dataset.shape = tuning.fadeShape;
    for (const [index, key] of ['x', 'y', 'rx', 'ry'].entries()) guide.style.setProperty(`--fade-guide-${key}`, `${values[index]}px`);
    guide.style.setProperty('--fade-guide-inner', 1 - tuning.fadeSoftness);
  }

  function updateSecond(progress, probe = false, after = lastAfter) {
    const { width, height } = viewport;
    const metrics = getMetrics();
    const anchored = metrics.activeTriggerMode === 'portrait';
    const typeScale = anchor.lineHeight / 67.2;
    const motionWidth = anchored ? 2560 * typeScale : width;
    const motionHeight = anchored ? 1305 * typeScale : height;
    const cap = (value, limit) => Math.max(-limit, Math.min(limit, value));
    const boundary = fadeGeometry();
    let visibleCount = 0;
    if (!probe) updateGuide(boundary);
    for (const word of flightWords) {
      const rowDelay = anchored ? (Math.max(0, metrics.rawStart + word.rowTop - anchor.firstRowTop) - metrics.start) / metrics.span : word.delay;
      const q = Math.max(0, progress - rowDelay - (anchored ? 0 : word.carry.delay));
      // Until a word starts peeling, its intact semantic source is visible.
      // A visual-end probe must count it even though all duplicate glyphs are 0.
      if (q <= 0) visibleCount++;
      if (probe && q <= 0) continue;
      const active = q > 0 ? '1' : '0';
      if (!probe && word.active !== active) {
        word.element.style.setProperty('--flight-word-active', active);
        word.active = active;
      }
      // Intact words have one identical hidden glyph pose. Departed words
      // have one fixed final pose. Neither needs per-letter trigonometry or
      // new transform strings on every subsequent scroll frame.
      const terminal = q <= 0 ? 'before' : q >= 1 ? 'after' : null;
      if (probe && terminal) continue;
      if (terminal && word.terminal === terminal && word.poseRevision === poseRevision) continue;
      if (!probe) {
        word.terminal = terminal;
        word.poseRevision = poseRevision;
      }
      if (terminal === 'before') {
        const identity = 'translate3d(0.000px, 0.000px, 0) rotate(0.000deg)';
        for (const glyph of word.glyphs) {
          if (glyph.secondTransform !== identity) {
            glyph.element.style.setProperty('--flight-letter-transform', identity);
            glyph.secondTransform = identity;
          }
          if (glyph.secondOpacity !== '0.00000') {
            glyph.element.style.setProperty('--flight-letter-opacity', '0.00000');
            glyph.secondOpacity = '0.00000';
          }
          glyph.secondVisible = false;
        }
        continue;
      }
      // Identical displacement and a shared rotation initially carry the
      // complete word. Glyph offsets only diverge after their peel threshold.
      const carry = ease(q / .28);
      const normalizedWordX = word.centerOffset / (311 * typeScale);
      const direction = Math.abs(normalizedWordX) > .04 ? Math.sign(normalizedWordX) : word.directionFallback;
      const carryX = anchored ? cap(direction * motionWidth * (.022 + Math.min(1, Math.abs(normalizedWordX)) * .012), width * .04) : word.carry.dx;
      const carryY = anchored ? -motionHeight * .02 : word.carry.dy;
      const carryRotation = anchored ? Math.abs(word.carry.rotate) * direction : word.carry.rotate;
      const angle = carryRotation * carry * tuning.wordForce * tuning.rotation;
      const radians = angle * Math.PI / 180;
      const cos = Math.cos(radians), sin = Math.sin(radians);
      for (const glyph of word.glyphs) {
        // The final results source stays one word for native kerning/wrapping.
        // Its res/ults glyph groups stay rigid and travel in opposite directions.
        const group = glyph.splitGroup;
        const glyphDirection = group ? group.direction : direction;
        const groupNX = group ? (group.centerX - textGeometry.centerX) / (311 * typeScale) : 0;
        const glyphCarryX = group ? (anchored
          ? cap(glyphDirection * motionWidth * (.022 + Math.min(1, Math.abs(groupNX)) * .012), width * .04)
          : group.carryX) : carryX;
        const glyphAngle = group ? Math.abs(carryRotation) * glyphDirection * carry * tuning.wordForce * tuning.rotation : angle;
        const pivot = group ? glyph.centerX - group.centerX : glyph.pivot;
        const peel = Math.min(.85, Math.max(0, (group ? group.peel : glyph.peel) + tuning.detach - .14));
        const t = clamp((q - peel) / (1 - peel));
        const spread = ease(t);
        const normalizedX = (glyph.centerX - textGeometry.centerX) / (311 * typeScale);
        let scatterX = anchored ? cap(motionWidth * (normalizedX * .23 + (glyph.fraction - .5) * .07 + glyph.scatterJitterX), width * .32) : glyph.scatterX;
        if (group) {
          const groupScatterX = anchored
            ? motionWidth * (groupNX * .23 + (group.fraction - .5) * .07 + group.scatterJitterX) : group.scatterX;
          scatterX = glyphDirection * Math.min(width * .32, Math.max(Math.abs(groupScatterX), motionWidth * .055));
        }
        const scatterY = group ? -motionHeight * group.scatterFactorY : anchored ? -motionHeight * glyph.scatterFactorY : glyph.scatterY;
        const scatterRotation = group ? glyphDirection * group.rotateFactor + group.rotateJitter
          : anchored ? direction * glyph.rotateFactor + glyph.rotateJitter : glyph.scatterRotate;
        const rotation = glyphAngle + scatterRotation * spread * tuning.rotation;
        const glyphCos = group ? Math.cos(rotation * Math.PI / 180) : cos;
        const glyphSin = group ? Math.sin(rotation * Math.PI / 180) : sin;
        const x = glyphCarryX * carry * tuning.wordForce + pivot * (glyphCos - 1) + scatterX * spread * tuning.letterForce;
        const y = carryY * carry * tuning.wordForce + pivot * glyphSin + scatterY * spread * tuning.letterForce;
        const centerX = glyph.centerX + x;
        const centerY = blurGeometry.textY - after + word.rowCenter + y;
        // The same distance thresholds give the fastest/farthest letters the
        // earliest fade. A viewport guard finishes it before an edge is hit,
        // including when the user chooses the slowest fade on a small screen.
        const travelled = Math.hypot(x, y);
        let metric;
        if (tuning.fadeShape === 'distance') metric = travelled / (motionHeight * .205 * tuning.fadeBoundary / lastFadeSpeed);
        else {
          const nx = (centerX - boundary.x) / boundary.rx;
          const ny = (centerY - boundary.y) / boundary.ry;
          metric = tuning.fadeShape === 'linear' ? -ny : tuning.fadeShape === 'box' ? Math.max(Math.abs(nx), Math.abs(ny)) : Math.hypot(nx, ny);
        }
        let fade = ease((metric - (1 - tuning.fadeSoftness)) / tuning.fadeSoftness);
        // A spatial mask takes over smoothly once a letter separates. Its
        // boundary may deliberately be placed inside the original text.
        if (tuning.fadeShape !== 'distance') fade *= ease(t / .16);
        const margin = Math.max(12, word.lineHeight * .65);
        const band = Math.max(margin + 1, height * .12);
        const edgeDistance = Math.min(centerX, width - centerX, centerY, height - centerY);
        const edge = ease((edgeDistance - margin) / (band - margin));
        const finish = 1 - ease((q - .88) / .12);
        const opacity = q > 0 && q < 1 ? (1 - fade) * edge * finish : 0;
        if (opacity > .001) visibleCount++;
        if (probe) continue;
        const transform = `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0) rotate(${rotation.toFixed(3)}deg)`;
        const opacityValue = opacity.toFixed(5);
        if (glyph.secondTransform !== transform) {
          glyph.element.style.setProperty('--flight-letter-transform', transform);
          glyph.secondTransform = transform;
        }
        if (glyph.secondOpacity !== opacityValue) {
          glyph.element.style.setProperty('--flight-letter-opacity', opacityValue);
          glyph.secondOpacity = opacityValue;
        }
        glyph.secondY = centerY;
        glyph.secondVisible = opacity > .001;
      }
    }
    return visibleCount;
  }

  // The conservative metrics.end also budgets stagger/lag, even when edge or
  // distance fading has already cleared the text. This read-only query lets a
  // following chapter begin at the actual last visible glyph instead.
  function getVisualEnd() {
    const metrics = getMetrics();
    if (lastVariant !== 'second' || lastReduced || !flightWords.length || metrics.end <= metrics.start) return metrics.end;
    const visibleAt = after => updateSecond(Number(((after - metrics.start) / metrics.span).toFixed(6)), true, after) > 0;
    const count = 48, step = (metrics.end - metrics.start) / count;
    let latest = -1;
    for (let i = 0; i <= count; i++) if (visibleAt(metrics.start + step * i)) latest = i;
    if (latest < 0) return metrics.start;
    if (latest === count) return metrics.end;
    let lower = metrics.start + step * latest, upper = lower + step;
    for (let i = 0; i < 22; i++) {
      const middle = (lower + upper) / 2;
      if (visibleAt(middle)) lower = middle; else upper = middle;
    }
    return upper;
  }

  function updateTopBlur(progress) {
    const enabled = lastTopBlur > 0 && !lastReduced;
    const { textY, near, far } = blurGeometry;
    for (const glyph of blurGlyphs) {
      if (glyph.lastFilter === 'none' && (!enabled || (lastVariant === 'second' && !glyph.secondVisible))) continue;
      let filter = 'none';
      const rowProgress = progress - glyph.delay;
      const t = clamp(rowProgress - glyph.lag);
      const visible = lastVariant === 'second' ? glyph.secondVisible : rowProgress > 0 && t < 1;
      if (enabled && visible) {
        const ease = t * t * (3 - 2 * t);
        const centerY = lastVariant === 'second' ? glyph.secondY : textY - lastAfter + glyph.rowCenter + glyph.dy * ease;
        const factor = clamp((far - centerY) / (far - near));
        const radius = lastTopBlur * factor * factor * (3 - 2 * factor);
        if (radius >= .001) filter = `blur(${radius.toFixed(3)}px)`;
      }
      if (glyph.lastFilter !== filter) {
        glyph.element.style.filter = filter;
        glyph.lastFilter = filter;
      }
    }
  }

  function update(after = 0, options = {}) {
    lastAfter = Number.isFinite(after) ? Math.max(0, after) : 0;
    lastReduced = Boolean(options.reducedMotion);
    configure(options);
    if (copy.dataset.flightVariant !== lastVariant) copy.dataset.flightVariant = lastVariant;
    const metrics = getMetrics();
    const progress = (lastAfter - metrics.start) / metrics.span;
    // One inherited progress value drives every glyph in CSS, without a
    // second animation frame scheduler. The top mask uses cached geometry;
    // this numeric pass never reads layout or duplicates the animated glyphs.
    if (progress !== lastProgress) {
      copy.style.setProperty('--about-flight', progress.toFixed(6));
      lastProgress = progress;
    }
    const reduced = lastReduced ? 'true' : 'false';
    if (copy.dataset.flightReduced !== reduced) copy.dataset.flightReduced = reduced;
    const complete = lastAfter >= metrics.end && metrics.end > 0;
    const completeValue = complete ? 'true' : 'false';
    if (copy.dataset.flightComplete !== completeValue) copy.dataset.flightComplete = completeValue;
    const normalized = metrics.end > metrics.start ? clamp((lastAfter - metrics.start) / (metrics.end - metrics.start)) : 0;
    const normalizedValue = normalized.toFixed(4);
    if (copy.dataset.flightProgress !== normalizedValue) copy.dataset.flightProgress = normalizedValue;
    const roundedProgress = Number(progress.toFixed(6));
    if (lastVariant === 'second') updateSecond(roundedProgress);
    else if (guide && !guide.hidden) guide.hidden = true;
    updateTopBlur(roundedProgress);
    return getState();
  }

  function measure({ width = window.innerWidth, height = window.innerHeight, textY = 0, portraitBottom, topBlurNear, topBlurFar, ...options } = {}) {
    configure(options);
    width = Number.isFinite(width) ? Math.max(1, width) : Math.max(1, window.innerWidth);
    height = Number.isFinite(height) ? Math.max(1, height) : Math.max(1, window.innerHeight);
    viewport = { width, height };
    textY = Number.isFinite(textY) ? textY : 0;
    const near = Number.isFinite(topBlurNear) ? Math.max(0, topBlurNear) : height * .035;
    const far = Number.isFinite(topBlurFar) ? Math.max(near + 1, topBlurFar) : Math.max(near + 1, height * .135);
    blurGeometry = { textY, near, far };
    const span = height * .38;
    const contentRect = content.getBoundingClientRect();
    const horizontalCenter = contentRect.left + contentRect.width / 2;
    textGeometry = { centerX: horizontalCenter, height: content.offsetHeight };
    const halfTextWidth = Math.max(1, contentRect.width / 2);
    const measurements = [];
    const rowOffsets = [];
    let maxRowOffset = 0;
    let maxLag = 0;

    // Read first, write later. The intact source word defines native width,
    // kerning and line wrapping; Range supplies each matching glyph position.
    for (const word of words) {
      const wordRect = word.element.getBoundingClientRect();
      const rowOffset = Math.max(0, wordRect.top - contentRect.top);
      const wordCenterX = wordRect.left + wordRect.width / 2;
      const wordNX = (wordCenterX - horizontalCenter) / halfTextWidth;
      const direction = Math.abs(wordNX) > .04 ? Math.sign(wordNX) : (random(word.glyphs[0].seed, 5) > .5 ? 1 : -1);
      maxRowOffset = Math.max(maxRowOffset, rowOffset);
      if (!rowOffsets.some(offset => Math.abs(offset - rowOffset) < 1)) rowOffsets.push(rowOffset);
      const glyphMetrics = [];
      for (const glyph of word.glyphs) {
        const range = document.createRange();
        range.setStart(word.source.firstChild, glyph.index);
        range.setEnd(word.source.firstChild, glyph.index + glyph.text.length);
        const rect = range.getBoundingClientRect();
        const nx = (rect.left + rect.width / 2 - horizontalCenter) / halfTextWidth;
        const fraction = clamp((rect.left + rect.width / 2 - wordRect.left) / Math.max(1, wordRect.width));
        const outward = direction > 0 ? 1 - fraction : fraction;
        const lag = random(glyph.seed, 4) * .055;
        maxLag = Math.max(maxLag, lag);
        glyphMetrics.push({
          element: glyph.element,
          left: rect.left - wordRect.left,
          width: rect.width,
          lag,
          dx: nx * width * .35 + (random(glyph.seed, 1) - .5) * width * .045,
          dy: -height * (.35 + random(glyph.seed, 2) * .2),
          rotate: (random(glyph.seed, 3) * 2 - 1) * 65,
          centerX: rect.left + rect.width / 2,
          fraction,
          scatterJitterX: (random(glyph.seed, 7) - .5) * .025,
          scatterFactorY: .18 + random(glyph.seed, 8) * .12,
          rotateFactor: 20 + random(glyph.seed, 9) * 45,
          rotateJitter: (random(glyph.seed, 10) - .5) * 20,
          pivot: rect.left + rect.width / 2 - wordCenterX,
          peel: .14 + outward * .075 + random(glyph.seed, 6) * .02,
          scatterX: nx * width * .23 + (fraction - .5) * width * .07 + (random(glyph.seed, 7) - .5) * width * .025,
          scatterY: -height * (.18 + random(glyph.seed, 8) * .12),
          scatterRotate: direction * (20 + random(glyph.seed, 9) * 45) + (random(glyph.seed, 10) - .5) * 20
        });
      }
      if (word === words[words.length - 1] && word.source.textContent === 'results') {
        for (const [from, to, partDirection] of [[0, 3, -1], [3, glyphMetrics.length, 1]]) {
          const part = glyphMetrics.slice(from, to);
          const left = Math.min(...part.map(glyph => glyph.centerX - glyph.width / 2));
          const right = Math.max(...part.map(glyph => glyph.centerX + glyph.width / 2));
          const centerX = (left + right) / 2;
          const nx = (centerX - horizontalCenter) / halfTextWidth;
          const fraction = clamp((centerX - wordRect.left) / Math.max(1, wordRect.width));
          const average = key => part.reduce((sum, glyph) => sum + glyph[key], 0) / part.length;
          const group = { direction: partDirection, centerX,
            carryX: partDirection * width * (.022 + Math.min(1, Math.abs(nx)) * .012),
            peel: .18, fraction, scatterJitterX: average('scatterJitterX'),
            scatterX: average('scatterX'), scatterFactorY: average('scatterFactorY'),
            rotateFactor: average('rotateFactor'), rotateJitter: average('rotateJitter') };
          part.forEach(glyph => { glyph.splitGroup = group; });
        }
      }
      measurements.push({
        element: word.element, rowCenter: rowOffset + wordRect.height / 2, rowTop: rowOffset, lineHeight: wordRect.height,
        centerOffset: wordCenterX - horizontalCenter,
        directionFallback: random(word.glyphs[0].seed, 5) > .5 ? 1 : -1,
        delay: rowOffset / span, glyphs: glyphMetrics,
        carry: {
          delay: random(word.glyphs[0].seed, 11) * .035,
          dx: direction * width * (.022 + Math.min(1, Math.abs(wordNX)) * .012),
          dy: -height * .02,
          rotate: direction * (2 + random(word.glyphs[0].seed, 12) * 2)
        }
      });
    }

    blurGlyphs = [];
    flightWords = [];
    for (const word of measurements) {
      word.element.style.setProperty('--flight-row', word.delay.toFixed(6));
      const flightWord = { ...word, delay: Number(word.delay.toFixed(6)), glyphs: [] };
      for (const glyph of word.glyphs) {
        glyph.element.style.left = `${glyph.left.toFixed(3)}px`;
        glyph.element.style.setProperty('--flight-lag', glyph.lag.toFixed(6));
        glyph.element.style.setProperty('--flight-dx', `${glyph.dx.toFixed(3)}px`);
        glyph.element.style.setProperty('--flight-dy', `${glyph.dy.toFixed(3)}px`);
        glyph.element.style.setProperty('--flight-rotate', `${glyph.rotate.toFixed(3)}deg`);
        const item = {
          ...glyph,
          element: glyph.element,
          rowCenter: word.rowCenter,
          delay: Number(word.delay.toFixed(6)),
          lag: Number(glyph.lag.toFixed(6)),
          dy: Number(glyph.dy.toFixed(3)),
          lastFilter: null
        };
        blurGlyphs.push(item);
        flightWord.glyphs.push(item);
      }
      flightWords.push(flightWord);
    }

    const start = Math.max(0, textY + content.offsetHeight - height * .97);
    anchor = {
      bottom: Number.isFinite(portraitBottom) ? portraitBottom : null,
      lineHeight: measurements[0]?.lineHeight || 67.2,
      firstRowTop: rowOffsets.length ? Math.min(...rowOffsets) : 0,
      maxRowTop: maxRowOffset, maxLag
    };
    measured = {
      start,
      end: start + maxRowOffset + span * (1 + maxLag),
      span,
      rows: rowOffsets.length,
      glyphs: glyphCount
    };
    update(lastAfter, { reducedMotion: lastReduced });
    return getMetrics();
  }

  function getState() {
    return {
      ...getMetrics(),
      after: lastAfter,
      progress: lastProgress ?? 0,
      complete: lastAfter >= getMetrics().end && getMetrics().end > 0,
      reducedMotion: lastReduced,
      topBlur: lastTopBlur,
      variant: lastVariant,
      fadeSpeed: lastFadeSpeed,
      ...tuning
    };
  }

  window.AboutTextFlight = Object.freeze({ measure, update, configure, getMetrics, getVisualEnd, getState });
})();
