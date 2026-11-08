/* Scroll-driven type scatter. Only the clear, semantic copy gets glyphs;
   the five lower blur copies retain their original lightweight markup. */
(() => {
  'use strict';

  if (window.AboutTextFlight) return;
  const copy = document.querySelector('.about-copy');
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
  let blurGeometry = { textY: 0, near: 0, far: 1 };
  let blurGlyphs = [];
  let flightWords = [];
  let viewport = { width: 1, height: 1 };
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

  function updateSecond(progress) {
    const { width, height } = viewport;
    for (const word of flightWords) {
      const q = Math.max(0, progress - word.delay - word.carry.delay);
      const active = q > 0 ? '1' : '0';
      if (word.active !== active) {
        word.element.style.setProperty('--flight-word-active', active);
        word.active = active;
      }
      // Identical displacement and a shared rotation initially carry the
      // complete word. Glyph offsets only diverge after their peel threshold.
      const carry = ease(q / .28);
      const angle = word.carry.rotate * carry;
      const radians = angle * Math.PI / 180;
      const cos = Math.cos(radians), sin = Math.sin(radians);
      for (const glyph of word.glyphs) {
        const t = clamp((q - glyph.peel) / (1 - glyph.peel));
        const spread = ease(t);
        const x = word.carry.dx * carry + glyph.pivot * (cos - 1) + glyph.scatterX * spread;
        const y = word.carry.dy * carry + glyph.pivot * sin + glyph.scatterY * spread;
        const rotation = angle + glyph.scatterRotate * spread;
        const centerX = glyph.centerX + x;
        const centerY = blurGeometry.textY - lastAfter + word.rowCenter + y;
        // The same distance thresholds give the fastest/farthest letters the
        // earliest fade. A viewport guard finishes it before an edge is hit,
        // including when the user chooses the slowest fade on a small screen.
        const travelled = Math.hypot(x, y);
        const fade = ease((travelled - height * .085 / lastFadeSpeed) / (height * .12 / lastFadeSpeed));
        const margin = Math.max(12, word.lineHeight * .65);
        const band = Math.max(margin + 1, height * .12);
        const edgeDistance = Math.min(centerX, width - centerX, centerY, height - centerY);
        const edge = ease((edgeDistance - margin) / (band - margin));
        const opacity = q > 0 && q < 1 ? (1 - fade) * edge : 0;
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
  }

  function updateTopBlur(progress) {
    const enabled = lastTopBlur > 0 && !lastReduced;
    const { textY, near, far } = blurGeometry;
    for (const glyph of blurGlyphs) {
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
    if (typeof options.topBlur === 'number' && Number.isFinite(options.topBlur)) lastTopBlur = Math.max(0, Math.min(40, options.topBlur));
    if (options.variant === 'first' || options.variant === 'second') lastVariant = options.variant;
    if (typeof options.fadeSpeed === 'number' && Number.isFinite(options.fadeSpeed)) lastFadeSpeed = Math.max(.5, Math.min(2, options.fadeSpeed));
    if (copy.dataset.flightVariant !== lastVariant) copy.dataset.flightVariant = lastVariant;
    const progress = (lastAfter - measured.start) / measured.span;
    // One inherited progress value drives every glyph in CSS, without a
    // second animation frame scheduler. The top mask uses cached geometry;
    // this numeric pass never reads layout or duplicates the animated glyphs.
    if (progress !== lastProgress) {
      copy.style.setProperty('--about-flight', progress.toFixed(6));
      lastProgress = progress;
    }
    const reduced = lastReduced ? 'true' : 'false';
    if (copy.dataset.flightReduced !== reduced) copy.dataset.flightReduced = reduced;
    const complete = lastAfter >= measured.end && measured.end > 0;
    const completeValue = complete ? 'true' : 'false';
    if (copy.dataset.flightComplete !== completeValue) copy.dataset.flightComplete = completeValue;
    const normalized = measured.end > measured.start ? clamp((lastAfter - measured.start) / (measured.end - measured.start)) : 0;
    const normalizedValue = normalized.toFixed(4);
    if (copy.dataset.flightProgress !== normalizedValue) copy.dataset.flightProgress = normalizedValue;
    const roundedProgress = Number(progress.toFixed(6));
    if (lastVariant === 'second') updateSecond(roundedProgress);
    updateTopBlur(roundedProgress);
    return getState();
  }

  function measure({ width = window.innerWidth, height = window.innerHeight, textY = 0, topBlurNear, topBlurFar } = {}) {
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
          lag,
          dx: nx * width * .35 + (random(glyph.seed, 1) - .5) * width * .045,
          dy: -height * (.35 + random(glyph.seed, 2) * .2),
          rotate: (random(glyph.seed, 3) * 2 - 1) * 65,
          centerX: rect.left + rect.width / 2,
          pivot: rect.left + rect.width / 2 - wordCenterX,
          peel: .14 + outward * .075 + random(glyph.seed, 6) * .02,
          scatterX: nx * width * .23 + (fraction - .5) * width * .07 + (random(glyph.seed, 7) - .5) * width * .025,
          scatterY: -height * (.18 + random(glyph.seed, 8) * .12),
          scatterRotate: direction * (20 + random(glyph.seed, 9) * 45) + (random(glyph.seed, 10) - .5) * 20
        });
      }
      measurements.push({
        element: word.element, rowCenter: rowOffset + wordRect.height / 2, lineHeight: wordRect.height,
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
    measured = {
      start,
      end: start + maxRowOffset + span * (1 + maxLag),
      span,
      rows: rowOffsets.length,
      glyphs: glyphCount
    };
    update(lastAfter, { reducedMotion: lastReduced });
    return { ...measured };
  }

  function getState() {
    return {
      ...measured,
      after: lastAfter,
      progress: lastProgress ?? 0,
      complete: lastAfter >= measured.end && measured.end > 0,
      reducedMotion: lastReduced,
      topBlur: lastTopBlur,
      variant: lastVariant,
      fadeSpeed: lastFadeSpeed
    };
  }

  window.AboutTextFlight = Object.freeze({ measure, update, getState });
})();
