/* Classic, scoped bundle imported from the approved Services screen.
   Orbit, tilt and flip share one sleeping clock; the host owns vertical scroll. */
(() => {
"use strict";
/* services-orbit.js */
/**
 * Pure geometry for the three-plane services carousel.
 * Coordinates are relative to the deck center. CSS perspective must use the
 * same distance and a center/center origin; every card keeps its full size.
 */
const CARD_ANGLE = 120;
const RAD = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number.`);
  }
  return value;
}

function createOrbitGeometry({
  width,
  height,
  sideWidth,
  sideHeight,
  sideOffset,
  sideTop = (height - sideHeight) / 2,
  perspective = 900,
}) {
  const w = positive(width, 'width');
  const h = positive(height, 'height');
  const sw = positive(sideWidth, 'sideWidth');
  const sh = positive(sideHeight, 'sideHeight');
  const offset = positive(sideOffset, 'sideOffset');
  if (!Number.isFinite(sideTop)) throw new RangeError('sideTop must be a finite number.');
  const sideOffsetY = sideTop - (h - sh) / 2;
  const p = positive(perspective, 'perspective');
  const sinSide = Math.sin(CARD_ANGLE * RAD);
  const outer = offset + sw / 2;
  const inner = offset - sw / 2;
  const visibleSideHeight = sh - (sw < 110 ? 10.303 : 10.322);
  if (visibleSideHeight <= 0 || inner < 0) {
    throw new RangeError('Side bounds must have a positive visible height and stay on their own side.');
  }

  // At 120 degrees the outer edge is closer to the camera. Calibrate both
  // projected horizontal edges and that edge's maximum visible height.
  const d0 = h * p / visibleSideHeight;
  const halfSidePlaneWidth = p * (outer - inner) * h / visibleSideHeight /
    (p + 2 * sinSide * inner);
  const distance = d0 + sinSide * halfSidePlaneWidth;
  const radiusZ = (distance - p) / 1.5;
  const sideCenterX = outer * h / visibleSideHeight - halfSidePlaneWidth / 2;
  const radiusX = sideCenterX / sinSide;
  const sideScaleX = 2 * halfSidePlaneWidth / w;

  return Object.freeze({
    width: w,
    height: h,
    sideWidth: sw,
    sideHeight: sh,
    sideOffset: offset,
    sideTop,
    sideOffsetY,
    perspective: p,
    visibleSideHeight,
    radiusX,
    radiusZ,
    sideScaleX,
    sideInner: inner,
    sideOuter: outer,
    halfSidePlaneWidth,
  });
}

function orbitPose(geometry, cardIndex, phase) {
  if (!Number.isFinite(cardIndex) || !Number.isFinite(phase)) {
    throw new RangeError('cardIndex and phase must be finite numbers.');
  }
  const yaw = (cardIndex - phase) * CARD_ANGLE;
  // Keep the returned yaw unwrapped for continuous rotation across cycles.
  // Normalize only the angle used by trigonometry and facing calculations.
  const angle = ((yaw + 180) % 360 + 360) % 360 - 180;
  const theta = angle * RAD;
  const facing = Math.cos(theta);
  const sideWeight = clamp((1 - facing) / 1.5, 0, 1);
  const z = geometry.radiusZ * (facing - 1);
  const scaleX = 1 + (geometry.sideScaleX - 1) * sideWeight;
  // Both extrema in Y lie on the nearer vertical edge while the rectangle
  // straddles its center. Compensate with that edge's exact perspective scale
  // so a -10px screen offset stays -10px despite unequal edge depth.
  const nearDepth = z + Math.abs(geometry.width / 2 * scaleX * Math.sin(theta));
  const y = geometry.sideOffsetY * sideWeight * (geometry.perspective - nearDepth) /
    geometry.perspective;
  return {
    x: geometry.radiusX * Math.sin(theta),
    y,
    z,
    yaw,
    angle,
    scaleX,
    facing,
  };
}

/** Project the full CSS-transformed rectangle, for calibration and checks. */
function projectOrbitQuad(geometry, pose) {
  const halfWidth = geometry.width / 2;
  const halfHeight = geometry.height / 2;
  const theta = pose.angle * RAD;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const points = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ].map(([localX, localY]) => {
    const scaledX = localX * pose.scaleX;
    const x = pose.x + scaledX * cos;
    const z = pose.z - scaledX * sin;
    const denominator = geometry.perspective - z;
    if (denominator <= 0) throw new RangeError('The projected card crosses the camera plane.');
    const scale = geometry.perspective / denominator;
    return { x: x * scale, y: ((pose.y ?? 0) + localY) * scale, z, scale };
  });
  const left = Math.min(...points.map(point => point.x));
  const right = Math.max(...points.map(point => point.x));
  const top = Math.min(...points.map(point => point.y));
  const bottom = Math.max(...points.map(point => point.y));
  return {
    points,
    bounds: { left, right, top, bottom, width: right - left, height: bottom - top },
  };
}


/* services-tilt.js */
/* Hover/flip physics adapted from the supplied React Bits TiltedCard.
   The services owner supplies the animation clock and owns selection/ARIA. */
function createServicesTilt({ root, deck, cards, wake, signal }) {
  if (!root || !deck || !Array.isArray(cards)) throw new TypeError('Services tilt needs a root, deck and cards.');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const view = root.ownerDocument?.defaultView || globalThis;
  const fine = view.matchMedia?.('(hover: hover) and (pointer: fine)');
  const removers = [];
  const originals = new Map();
  const hoverOmega = 20 * Math.pow(.2, .6);
  let context = { activeIndex: -1, enabled: false, dragging: false, reducedMotion: false };
  let destroyed = false;

  const remember = (element, properties) => {
    if (!element?.style) return;
    const saved = originals.get(element) || new Map();
    for (const name of properties) {
      if (!saved.has(name)) saved.set(name, {
        value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name),
      });
    }
    originals.set(element, saved);
  };
  const listen = (target, type, callback, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, callback, options);
    removers.push(() => target.removeEventListener(type, callback, options));
  };
  const requestPaint = () => { if (!destroyed) wake?.(); };
  const items = cards.map((card, index) => {
    if (!card.element || !card.hover || !card.rotor) throw new TypeError(`Services tilt card ${index} is missing its layers.`);
    remember(card.hover, ['transform', '--services-px', '--services-py', '--services-glare-x', '--services-glare-y', '--services-glare', '--services-lift']);
    remember(card.rotor, ['transform']);
    remember(card.shadow, ['transform', 'opacity']);
    return { ...card, index, targetFlip: 0, signature: '',
      state: { rx: 0, vrx: 0, ry: 0, vry: 0, lift: 0, vlift: 0, flip: 0, vflip: 0, press: 0, vpress: 0 },
      pointer: { inside: false, nx: 0, ny: 0 },
      press: { active: false, moved: false, id: null, x: 0, y: 0 },
    };
  });

  const interactive = item => context.enabled && !context.dragging && context.activeIndex === item.index && !root.ownerDocument?.hidden;
  const canHover = item => interactive(item) && !context.reducedMotion && fine?.matches !== false;
  const finePointer = event => event.pointerType === 'mouse' || event.pointerType === 'pen';
  const clearInput = item => {
    item.pointer.inside = false;
    item.pointer.nx = item.pointer.ny = 0;
    item.press.active = false;
    item.press.moved = false;
    item.press.id = null;
  };
  const track = (item, event) => {
    // Carousel transforms belong to the outer card. Hover never changes this
    // deck-relative, centered hit geometry, so its own tilt cannot feed back.
    const rect = deck.getBoundingClientRect();
    const width = Math.max(1, item.element.offsetWidth);
    const height = Math.max(1, item.element.offsetHeight);
    item.pointer.nx = clamp((event.clientX - rect.left - rect.width / 2) / (width / 2), -1, 1);
    item.pointer.ny = clamp((event.clientY - rect.top - height / 2) / (height / 2), -1, 1);
    item.pointer.inside = true;
  };

  function step(state, key, target, omega, damping, dt) {
    const velocity = `v${key}`;
    if (state[key] === target && state[velocity] === 0) return false;
    const count = Math.max(1, Math.ceil(dt * 240));
    const h = dt / count;
    for (let index = 0; index < count; index++) {
      state[velocity] += (omega * omega * (target - state[key]) - 2 * damping * omega * state[velocity]) * h;
      state[key] += state[velocity] * h;
    }
    if (Math.abs(target - state[key]) < .001 && Math.abs(state[velocity]) < .01) {
      state[key] = target;
      state[velocity] = 0;
      return false;
    }
    return true;
  }

  function paint(item) {
    const s = item.state;
    const signature = `${s.rx}|${s.ry}|${s.lift}|${s.flip}|${s.press}`;
    if (signature === item.signature) return;
    item.signature = signature;
    const radiansX = s.rx * Math.PI / 180;
    const radiansY = s.ry * Math.PI / 180;
    const px = Math.sin(radiansY), py = -Math.sin(radiansX);
    const scale = 1 + .05 * s.lift - .02 * s.press;
    item.hover.style.transform = `rotateX(${s.rx.toFixed(3)}deg) rotateY(${s.ry.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
    item.rotor.style.transform = `rotateY(${s.flip.toFixed(3)}deg)`;
    item.hover.style.setProperty('--services-px', px.toFixed(4));
    item.hover.style.setProperty('--services-py', py.toFixed(4));
    item.hover.style.setProperty('--services-glare-x', `${(50 + s.ry / 12 * 46).toFixed(2)}%`);
    item.hover.style.setProperty('--services-glare-y', `${(50 - s.rx / 12 * 46).toFixed(2)}%`);
    item.hover.style.setProperty('--services-glare', (.5 * Math.max(s.lift, Math.min(1, Math.hypot(s.rx, s.ry) / 12))).toFixed(3));
    item.hover.style.setProperty('--services-lift', s.lift.toFixed(4));
    if (item.shadow) {
      const turn = Math.abs(Math.cos(s.flip * Math.PI / 180));
      const spread = scale * (.86 + .04 * s.lift);
      item.shadow.style.transform = `translate3d(${(-px * 22).toFixed(2)}px, ${(12 + 16 * s.lift + Math.sin(radiansX) * 18).toFixed(2)}px, 0) scale(${(spread * (.2 + .8 * turn)).toFixed(4)}, ${spread.toFixed(4)})`;
      item.shadow.style.opacity = (.5 * (.6 + .4 * s.lift)).toFixed(3);
    }
  }

  for (const item of items) {
    const move = event => {
      if (item.press.active && item.press.id === event.pointerId && Math.hypot(event.clientX - item.press.x, event.clientY - item.press.y) > 6) item.press.moved = true;
      if (canHover(item) && finePointer(event)) track(item, event);
      requestPaint();
    };
    listen(item.element, 'pointerenter', event => {
      if (!canHover(item) || !finePointer(event)) return;
      track(item, event);
      requestPaint();
    }, { passive: true });
    listen(item.element, 'pointermove', move, { passive: true });
    listen(item.element, 'pointerleave', () => {
      clearInput(item);
      requestPaint();
    }, { passive: true });
    listen(item.element, 'pointerdown', event => {
      if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      // A fresh primary press also clears a release missed outside the card.
      for (const other of items) { other.press.active = false; other.press.id = null; }
      if (!interactive(item)) return;
      Object.assign(item.press, { active: true, moved: false, id: event.pointerId, x: event.clientX, y: event.clientY });
      if (canHover(item) && finePointer(event)) track(item, event);
      requestPaint();
    }, { passive: true });
    const release = event => {
      if (item.press.id !== event.pointerId) return;
      item.press.active = false;
      item.press.id = null;
      if (!finePointer(event) || event.type === 'pointercancel') item.pointer.inside = false;
      requestPaint();
    };
    listen(item.element, 'pointerup', release, { passive: true });
    listen(item.element, 'pointercancel', release, { passive: true });
  }
  listen(fine, 'change', () => {
    if (!fine.matches) items.forEach(clearInput);
    requestPaint();
  });

  function update(dt, nextContext = {}) {
    if (destroyed) return false;
    context = { ...context, ...nextContext };
    const delta = clamp(Number.isFinite(dt) ? dt : 1 / 60, 0, .05);
    let busy = false;
    for (const item of items) {
      const active = item.index === context.activeIndex;
      if (!active) item.targetFlip = 0;
      if (!interactive(item)) clearInput(item);
      const follow = canHover(item) && item.pointer.inside;
      const pressed = interactive(item) && item.press.active;
      const targetX = follow ? -item.pointer.ny * 12 : 0;
      const targetY = follow ? item.pointer.nx * 12 : 0;
      const lift = follow || pressed ? 1 : 0;
      if (context.reducedMotion) {
        for (const key of Object.keys(item.state)) item.state[key] = 0;
        item.state.flip = item.targetFlip;
      } else {
        busy = step(item.state, 'rx', targetX, hoverOmega, .82, delta) || busy;
        busy = step(item.state, 'ry', targetY, hoverOmega, .82, delta) || busy;
        busy = step(item.state, 'lift', lift, hoverOmega, .85, delta) || busy;
        busy = step(item.state, 'flip', item.targetFlip, 9.5, .72, delta) || busy;
        busy = step(item.state, 'press', pressed && !item.press.moved ? 1 : 0, 26, .8, delta) || busy;
      }
      paint(item);
    }
    return busy;
  }

  function setFlipped(index, flipped) {
    if (destroyed || !items[index]) return false;
    const target = flipped ? 180 : 0;
    if (items[index].targetFlip === target) return false;
    items[index].targetFlip = target;
    requestPaint();
    return true;
  }

  function reset({ immediate = false } = {}) {
    if (destroyed) return;
    for (const item of items) {
      clearInput(item);
      item.targetFlip = 0;
      if (immediate) {
        for (const key of Object.keys(item.state)) item.state[key] = 0;
        paint(item);
      }
    }
    requestPaint();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    removers.splice(0).forEach(remove => remove());
    for (const [element, properties] of originals) {
      for (const [name, original] of properties) {
        if (original.value) element.style.setProperty(name, original.value, original.priority);
        else element.style.removeProperty(name);
      }
    }
  }
  if (signal?.aborted) destroy();
  else listen(signal, 'abort', destroy, { once: true });
  return Object.freeze({ update, setFlipped, reset, destroy });
}


/* services.js */

const mountedServices = new WeakMap();

/** Scoped three-plane carousel. The page keeps ownership of vertical scroll. */
function mountServices(root) {
  if (!root?.querySelectorAll) throw new TypeError('mountServices needs a root element.');
  if (mountedServices.has(root)) return mountedServices.get(root);
  const deck = root.querySelector('[data-services-deck]');
  const cards = [...root.querySelectorAll('[data-service-id]')].map(element => ({
    element, id: element.dataset.serviceId, title: element.dataset.title || element.dataset.serviceId,
    hover: element.querySelector('[data-services-hover]'),
    rotor: element.querySelector('.services-card__rotator'),
    side: element.querySelector('[data-services-side]'),
    front: element.querySelector('[data-services-front]'),
    back: element.querySelector('[data-services-back]'),
    image: element.querySelector('.services-card__image'),
    caption: element.querySelector('.services-card__caption'),
    shadow: element.querySelector('.services-card__shadow'),
    select: element.querySelector('[data-services-select]'),
    open: element.querySelector('[data-services-flip]'),
    close: element.querySelector('[data-services-close]'),
  }));
  if (!deck || cards.length !== 3 || new Set(cards.map(card => card.id)).size !== 3) {
    throw new Error('The services screen needs three uniquely named cards.');
  }
  const owner = root.ownerDocument;
  const view = owner.defaultView;
  const controller = new AbortController();
  const { signal } = controller;
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  const counter = root.querySelector('[data-services-counter]');
  const status = root.querySelector('[data-services-status]');
  const words = [...root.querySelectorAll('[data-services-word]')];
  const surfaces = [...root.querySelectorAll('[data-services-surface]')];
  const originalClips = new Map(surfaces.map(surface => [surface, surface.style.clipPath]));
  const originalTransforms = cards.map(card => card.element.style.transform);
  const originalPerspective = deck.style.perspective;
  const decorations = [];
  for (const card of cards) for (const face of [card.front, card.back]) {
    for (const kind of ['glare', 'rim', 'edge']) {
      const layer = owner.createElement('span');
      layer.className = `services-card__${kind}`;
      layer.setAttribute('aria-hidden', 'true');
      face.append(layer);
      decorations.push(layer);
    }
  }

  const limit = (value, min, max) => Math.min(max, Math.max(min, value));
  const wrap = value => ((value % 3) + 3) % 3;
  const focus = element => element?.focus({ preventScroll: true });
  const emit = (name, detail) => root.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  let index = Math.max(0, cards.findIndex(card => card.element.dataset.position === 'active'));
  let flipped = false, destroyed = false, visible = false;
  let inViewport = false, chapterVisible = true;
  let frame = 0, lastFrame = 0, pointer = null, suppressClickUntil = 0, pendingFocus = false;
  let geometry = null, lastPaintedPhase = NaN;
  const orbit = { value: index, velocity: 0, target: index };

  function wake() {
    if (!destroyed && !frame && visible && !owner.hidden) frame = view.requestAnimationFrame(tick);
  }
  const tilt = createServicesTilt({ root, deck, cards, wake, signal });
  function inert(element, disabled) {
    if (!element) return;
    element.inert = disabled;
    element.setAttribute('aria-hidden', String(disabled));
  }
  function renderState() {
    root.dataset.activeService = cards[index].id;
    if (counter) counter.textContent = `${index + 1} - 3`;
    for (const word of words) word.dataset.active = String(word.dataset.servicesWord === cards[index].id);
    cards.forEach((card, cardIndex) => {
      const active = cardIndex === index;
      const reverse = active && flipped;
      card.element.dataset.position = active ? 'active' : cardIndex === wrap(index + 1) ? 'next' : 'previous';
      card.element.dataset.flipped = String(reverse);
      inert(card.front, !active || reverse);
      inert(card.back, !active || !reverse);
      card.select.hidden = active;
      card.select.disabled = active;
      card.select.setAttribute('aria-label', `Show ${card.title}`);
      card.open.setAttribute('aria-label', `Show ${card.title} details`);
      card.open.setAttribute('aria-expanded', String(reverse));
      card.close.setAttribute('aria-label', `Close ${card.title} details`);
    });
  }
  function setFlipped(value, moveFocus = false) {
    if (destroyed) return false;
    if (pointer?.intent === 'horizontal') cancelPointer();
    const next = typeof value === 'boolean' ? value : !flipped;
    if (next === flipped) return false;
    const active = cards[index];
    const oldFace = flipped ? active.back : active.front;
    const transfer = moveFocus || oldFace.contains(owner.activeElement);
    if (transfer) focus(deck);
    flipped = next;
    tilt.setFlipped(index, next);
    renderState();
    if (transfer) focus(next ? active.close : active.open);
    emit('services:flip', { id: active.id, flipped });
    wake();
    return true;
  }

  function targetPhase(destination, moveFocus = false) {
    const next = wrap(destination);
    const changed = next !== index;
    const old = cards[index];
    const transfer = moveFocus || (owner.activeElement !== deck && deck.contains(owner.activeElement));
    if (transfer) { focus(deck); pendingFocus = true; }
    if (flipped) {
      flipped = false;
      tilt.setFlipped(index, false);
      emit('services:flip', { id: old.id, flipped: false });
    }
    index = next;
    orbit.target = destination;
    if (reduced.matches) { orbit.value = destination; orbit.velocity = 0; }
    renderState();
    if (changed) {
      if (status) status.textContent = `${cards[index].title}, ${index + 1} of 3`;
      emit('services:change', { id: cards[index].id, index });
    }
    wake();
    return changed;
  }
  function select(value, moveFocus = false) {
    if (destroyed) return false;
    const candidate = typeof value === 'number' && Number.isFinite(value) ? wrap(Math.trunc(value)) : cards.findIndex(card => card.id === value);
    if (candidate < 0 || candidate === index) return false;
    if (pointer) cancelPointer();
    const nearest = Math.round((orbit.value - candidate) / 3) * 3 + candidate;
    return targetPhase(nearest, moveFocus);
  }

  function paintOrbit(force = false) {
    if (!geometry || (!force && orbit.value === lastPaintedPhase)) return;
    lastPaintedPhase = orbit.value;
    root.dataset.servicesPhase = orbit.value.toFixed(5);
    cards.forEach((card, cardIndex) => {
      const pose = orbitPose(geometry, cardIndex, orbit.value);
      card.element.style.transform = `translate3d(calc(-50% + ${pose.x.toFixed(4)}px),${pose.y.toFixed(4)}px,${pose.z.toFixed(4)}px) rotateY(${pose.yaw.toFixed(4)}deg) scaleX(${pose.scaleX.toFixed(6)})`;
      card.element.dataset.orbitAngle = pose.angle.toFixed(3);
      // A rear orbit plane shows its photo, not an unrequested description.
      const frontFacing = pose.facing > .015;
      card.rotor.style.display = frontFacing ? '' : 'none';
      card.side.style.display = frontFacing ? 'none' : '';
      card.side.firstElementChild.style.transform = pose.facing < 0 ? 'scaleX(-1)' : '';
    });
  }
  function stepOrbit(dt) {
    if (orbit.value === orbit.target && orbit.velocity === 0) return false;
    const count = Math.max(1, Math.ceil(dt * 240)), h = dt / count;
    for (let step = 0; step < count; step++) {
      orbit.velocity += (18 * 18 * (orbit.target - orbit.value) - 2 * .78 * 18 * orbit.velocity) * h;
      orbit.value += orbit.velocity * h;
    }
    if (Math.abs(orbit.value - orbit.target) < .00002 && Math.abs(orbit.velocity) < .0002) {
      orbit.value = orbit.target; orbit.velocity = 0; return false;
    }
    return true;
  }
  function tick(now) {
    frame = 0;
    if (destroyed || !visible || owner.hidden) { lastFrame = 0; return; }
    const dt = limit(lastFrame ? (now - lastFrame) / 1000 : 1 / 60, 0, .05);
    lastFrame = now;
    const dragging = pointer?.intent === 'horizontal';
    let turning = false;
    if (reduced.matches) { orbit.value = orbit.target; orbit.velocity = 0; }
    else if (!dragging) turning = stepOrbit(dt);
    paintOrbit();
    const aligned = Math.abs(orbit.value - orbit.target) < .005 && Math.abs(orbit.velocity) < .04;
    const tilting = tilt.update(dt, { activeIndex: index, enabled: !dragging && aligned, dragging, reducedMotion: reduced.matches });
    root.dataset.servicesMotion = dragging ? 'dragging' : turning ? 'rotating' : tilting ? 'tilting' : 'idle';
    if (pendingFocus && aligned && owner.activeElement === deck) {
      focus(flipped ? cards[index].close : cards[index].open);
      pendingFocus = false;
    }
    if (turning || tilting) wake();
    else lastFrame = 0;
  }
  function measure() {
    const width = cards[0].element.offsetWidth, height = cards[0].element.offsetHeight;
    if (!width || !height) return;
    const style = getComputedStyle(root);
    const number = name => Number.parseFloat(style.getPropertyValue(name));
    const fit = Math.min(1, height / (number('--services-card-height') || height));
    geometry = createOrbitGeometry({
      width, height,
      sideWidth: number('--services-side-width') * fit, sideHeight: number('--services-side-height') * fit,
      sideOffset: number('--services-side-offset') * fit, sideTop: number('--services-side-top') * fit,
    });
    deck.style.perspective = `${geometry.perspective}px`;
    for (const surface of surfaces) {
      if (!view.HeroSquircle?.path) continue;
      const radius = (number('--services-radius') || 48) * fit;
      surface.style.clipPath = `path("${view.HeroSquircle.path(geometry.width, geometry.height, radius, 1)}")`;
    }
    paintOrbit(true);
    wake();
  }

  function clearPointer() {
    const old = pointer;
    pointer = null;
    root.classList.remove('is-dragging');
    if (old && deck.hasPointerCapture?.(old.id)) deck.releasePointerCapture(old.id);
    return old;
  }
  function cancelPointer() {
    const gesture = clearPointer();
    if (!gesture) return;
    if (gesture.moved) suppressClickUntil = performance.now() + 500;
    if (gesture.intent === 'horizontal') {
      orbit.target = gesture.startTarget;
      orbit.velocity = 0;
    }
    wake();
  }
  function keepPointerFocusStable() {
    // A focused child follows a moving 3D face in some browsers. Pointer
    // interactions keep focus on the stationary deck; keyboard actions still
    // transfer it to the newly available control after the orbit settles.
    pendingFocus = false;
    if (owner.activeElement !== deck && deck.contains(owner.activeElement)) focus(deck);
  }
  deck.addEventListener('mousedown', event => {
    if (event.button != null && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('a,input,textarea,select,[contenteditable="true"],[data-services-back] .services-card__description')) return;
    // Cancel native pointer focus before it can scroll a partly visible side
    // button into view. This does not cancel touch scrolling or text selection.
    if (event.cancelable) event.preventDefault();
    keepPointerFocusStable();
  }, { capture: true, signal });
  deck.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
    if (pointer) cancelPointer();
    // A new press is a new action, not the previous swipe's compatibility click.
    suppressClickUntil = 0;
    if (!geometry) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('a,input,textarea,select,[contenteditable="true"]')) return;
    const selectable = Boolean(target.closest('[data-services-back] .services-card__description'));
    if (!selectable) keepPointerFocusStable();
    pointer = {
      id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, moved: false, intent: null,
      startPhase: orbit.value, startTarget: orbit.target, startStep: Math.round(orbit.value),
      lastX: event.clientX, lastTime: performance.now(), velocity: 0,
      pixelsPerStep: Math.max(200, geometry.width * .9),
      selectable,
    };
  }, { signal });
  deck.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.hypot(dx, dy) > 6) pointer.moved = true;
    if (pointer.intent === 'vertical' || pointer.selectable) return;
    if (!pointer.intent) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.15) { pointer.intent = 'vertical'; return; }
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
      pendingFocus = false;
      if (flipped) setFlipped(false);
      pointer.intent = 'horizontal';
      root.classList.add('is-dragging');
      deck.setPointerCapture?.(event.pointerId);
    }
    const now = performance.now();
    const elapsed = Math.max(8, now - pointer.lastTime) / 1000;
    pointer.velocity = pointer.velocity * .4 + (-(event.clientX - pointer.lastX) / pointer.pixelsPerStep / elapsed) * .6;
    pointer.lastX = event.clientX; pointer.lastTime = now; pointer.dx = dx;
    if (event.cancelable) event.preventDefault();
    if (!reduced.matches) orbit.value = pointer.startPhase - dx / pointer.pixelsPerStep;
    orbit.velocity = 0;
    wake();
  }, { passive: false, signal });
  deck.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const gesture = clearPointer();
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) > 6) gesture.moved = true;
    if (gesture.moved) suppressClickUntil = performance.now() + 500;
    if (gesture.intent !== 'horizontal') return;
    const recentVelocity = performance.now() - gesture.lastTime < 90 ? gesture.velocity : 0;
    let destination = Math.round(orbit.value + limit(recentVelocity * .055, -.23, .23));
    const threshold = limit(geometry.width * .12, 28, 44);
    if (Math.abs(dx) >= threshold && destination === gesture.startStep) destination += dx < 0 ? 1 : -1;
    orbit.velocity = limit(recentVelocity, -6, 6);
    targetPhase(destination);
  }, { signal });
  for (const name of ['pointercancel','lostpointercapture']) deck.addEventListener(name, event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (name === 'lostpointercapture' && (event.target !== deck || deck.hasPointerCapture?.(event.pointerId))) return;
    cancelPointer();
  }, { signal });

  function projectedCardAt(clientX, clientY) {
    if (!geometry) return -1;
    const rect = deck.getBoundingClientRect();
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - geometry.height / 2;
    const hits = [];
    cards.forEach((card, cardIndex) => {
      const pose = orbitPose(geometry, cardIndex, orbit.value);
      const points = projectOrbitQuad(geometry, pose).points;
      const crosses = points.map((point, i) => {
        const next = points[(i + 1) % points.length];
        return (next.x - point.x) * (y - point.y) - (next.y - point.y) * (x - point.x);
      });
      if (crosses.every(value => value >= -.01) || crosses.every(value => value <= .01)) hits.push({ cardIndex, z: pose.z });
    });
    return hits.sort((a,b) => b.z - a.z)[0]?.cardIndex ?? -1;
  }

  deck.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil && event.detail !== 0) {
      suppressClickUntil = 0;
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('a,input,textarea,select,[contenteditable="true"]')) return;
    let element = target.closest('[data-service-id]');
    if (element && !deck.contains(element)) return;
    // Some browsers paint the rear of a CSS 3D plane but hit-test its parent.
    // Resolve that visible plane from the same projected quad used to draw it.
    const cardIndex = element ? cards.findIndex(card => card.element === element) : projectedCardAt(event.clientX, event.clientY);
    if (cardIndex < 0) return;
    element ||= cards[cardIndex].element;
    const keyboard = event.detail === 0;
    if (cardIndex !== index) {
      if (!keyboard) keepPointerFocusStable();
      if (select(cardIndex, keyboard)) { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    const selection = view.getSelection();
    if (selection && !selection.isCollapsed && selection.toString() && element.contains(selection.anchorNode)) return;
    if (!keyboard) keepPointerFocusStable();
    const value = target.closest('[data-services-close]') ? false : target.closest('[data-services-flip]') ? true : !flipped;
    if (setFlipped(value, keyboard)) { event.preventDefault(); event.stopPropagation(); }
  }, { capture: true, signal });
  deck.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
    if (event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const destination = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
    if (destination !== null) {
      event.preventDefault(); event.stopPropagation(); select(destination, true);
    } else if (event.key === 'Escape' && flipped) {
      event.preventDefault(); setFlipped(false, true);
    } else if (event.target === deck && ['Enter',' '].includes(event.key)) {
      event.preventDefault(); setFlipped(!flipped, true);
    }
  }, { signal });
  deck.addEventListener('dragstart', event => event.preventDefault(), { signal });

  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(deck);
  resizeObserver.observe(root);
  function syncVisibility() {
    const next = inViewport && chapterVisible;
    if (next === visible) return;
    visible = next;
    if (visible) wake();
    else pauseInput();
  }
  const intersectionObserver = new IntersectionObserver(entries => {
    inViewport = entries.some(entry => entry.isIntersecting);
    syncVisibility();
  });
  intersectionObserver.observe(root);
  owner.addEventListener('visibilitychange', () => {
    if (owner.hidden) pauseInput();
    if (!owner.hidden) wake();
  }, { signal });
  function pauseInput() {
    cancelPointer();
    tilt.update(0, { activeIndex: index, enabled: false, dragging: false, reducedMotion: reduced.matches });
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0; lastFrame = 0;
    root.dataset.servicesMotion = 'paused';
  }
  view.addEventListener('blur', () => { cancelPointer(); tilt.update(0, { enabled: false, dragging: false }); wake(); }, { signal });
  reduced.addEventListener('change', () => { cancelPointer(); wake(); }, { signal });
  renderState();
  measure();

  const api = Object.freeze({
    select(value) { return select(value); },
    flip(value) { return setFlipped(value); },
    // A tall panel can intersect the viewport behind another pinned chapter.
    // The scroll owner explicitly releases its input and animation work there.
    setVisible(value) { chapterVisible = Boolean(value); syncVisibility(); },
    get activeId() { return cards[index].id; },
    destroy() {
      if (destroyed) return;
      clearPointer(); destroyed = true;
      if (frame) view.cancelAnimationFrame(frame);
      controller.abort(); tilt.destroy();
      resizeObserver.disconnect(); intersectionObserver.disconnect();
      originalClips.forEach((clip, surface) => { surface.style.clipPath = clip; });
      cards.forEach((card, cardIndex) => {
        card.element.style.transform = originalTransforms[cardIndex];
        card.rotor.style.display = ''; card.side.style.display = '';
        card.side.firstElementChild.style.transform = '';
        delete card.element.dataset.orbitAngle;
      });
      decorations.forEach(layer => layer.remove());
      deck.style.perspective = originalPerspective;
      delete root.dataset.servicesPhase; delete root.dataset.servicesMotion;
      mountedServices.delete(root);
    },
  });
  mountedServices.set(root, api);
  return api;
}

window.ServicesScreens = Object.freeze({ mount: mountServices, get: root => mountedServices.get(root) });
if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-services]').forEach(root => mountServices(root));
  window.dispatchEvent(new CustomEvent('services:ready'));
  document.fonts?.ready?.then(() => window.dispatchEvent(new CustomEvent('services:ready')));
}

})();
