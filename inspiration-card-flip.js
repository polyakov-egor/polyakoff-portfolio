/* Clickable front/back faces. The Inspiration chapter supplies the clock;
   hover keeps ownership of the outer tilt body and never overwrites this turn. */
(() => {
  'use strict';
  const view = window.InspirationView;
  if (!view?.cards?.length || window.InspirationCardFlip) return;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const items = view.cards.map((card, index) => {
    const body = card.querySelector('.inspiration__tilt-body');
    const face = card.querySelector('.inspiration__tilt-face');
    const glass = card.querySelector('.inspiration__glass');
    if (!body || !face) return null;
    const rotor = document.createElement('div'); rotor.className = 'inspiration__card-flip-rotor';
    const front = document.createElement('div'); front.className = 'inspiration__card-flip-front';
    const back = document.createElement('div'); back.className = 'inspiration__card-flip-back';
    const content = document.createElement('span'); content.className = 'inspiration__card-flip-content mono'; content.textContent = 'Content';
    const glare = document.createElement('span'); glare.className = 'inspiration__tilt-glare'; glare.setAttribute('aria-hidden', 'true');
    const rim = document.createElement('span'); rim.className = 'inspiration__tilt-rim'; rim.setAttribute('aria-hidden', 'true');
    front.append(face); if (glass && face.querySelector('.inspiration__glass') !== glass) front.append(glass);
    back.append(content, glare, rim); rotor.append(front, back); body.append(rotor);
    // Physical side strips belong to the same rotor as both faces. A manually
    // projected SVG outside it drifts when outer hover and perspective combine.
    const wall = document.createElement('div'); wall.className = 'inspiration__card-flip-wall';
    wall.setAttribute('aria-hidden', 'true'); rotor.append(wall);
    card.classList.add('has-content-flip');
    card.setAttribute('role', 'button'); card.setAttribute('tabindex', '-1'); card.setAttribute('aria-pressed', 'false');
    card.dataset.flipEnabled = 'false'; card.dataset.contentSide = 'front';
    return { card, index, body, face, rotor, front, back, wall, strips: [],
      value: 0, target: 0, velocity: 0, recession: 0, recessionVelocity: 0, navigating: false,
      down: null, suppressClick: false, wallSignature: '', paintSignature: '' };
  }).filter(Boolean);
  let context = { active: -1, enabled: false, reducedMotion: reduce.matches };
  let lastTime = 0;
  const wake = () => window.dispatchEvent(new CustomEvent('inspiration:ready'));
  const clickable = item => context.enabled && context.active === item.index && !document.hidden && !view.root.hidden;
  function spring(item, key, velocityKey, target, dt, omega = 9.5, damping = .72) {
    if (item[key] === target && item[velocityKey] === 0) return false;
    const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      item[velocityKey] += (omega * omega * (target - item[key]) - 2 * damping * omega * item[velocityKey]) * h;
      item[key] += item[velocityKey] * h;
    }
    const epsilon = key === 'value' ? .003 : .00005;
    if (Math.abs(item[key] - target) < epsilon && Math.abs(item[velocityKey]) < epsilon * 10) {
      item[key] = target; item[velocityKey] = 0; return false;
    }
    return true;
  }
  function paint(item) {
    const scale = 1 - .1 * clamp(item.recession, 0, 1);
    const enabled = clickable(item);
    const silhouette = item.face.style.clipPath;
    const size = Number.parseFloat(item.card.style.width) || 400;
    const radius = Number.parseFloat(view.root.style.getPropertyValue?.('--inspiration-card-radius')) || size * .2;
    const signature = `${item.value}|${item.target}|${scale}|${enabled}|${silhouette}|${size}|${radius}`;
    if (signature === item.paintSignature) return;
    item.paintSignature = signature;
    item.rotor.style.transform = `rotateY(${item.value.toFixed(4)}deg) scale(${scale.toFixed(5)})`;
    item.front.setAttribute('aria-hidden', String(item.target === 180));
    item.back.setAttribute('aria-hidden', String(item.target !== 180));
    item.card.dataset.contentSide = item.target === 180 ? 'back' : 'front';
    item.card.dataset.contentFlip = item.value.toFixed(5);
    item.card.dataset.contentScale = scale.toFixed(5);
    item.card.setAttribute('aria-pressed', String(item.target === 180));
    item.card.setAttribute('aria-label', `${['People', 'Music', 'Detail'][item.index]} inspiration. ${item.target === 180 ? 'Show image' : 'Show content'}`);
    item.card.dataset.flipEnabled = String(enabled);
    item.card.setAttribute('tabindex', enabled ? '0' : '-1');
    if (silhouette) item.back.style.clipPath = silhouette;
    const visibleWall = Math.abs(Math.sin(item.value * Math.PI / 180)) > .002;
    item.wall.style.visibility = visibleWall ? 'visible' : 'hidden';
    if (visibleWall && window.InspirationFlipThickness?.sideStrips) {
      const signature = `${size}|${radius}`;
      if (signature !== item.wallSignature) {
        item.wallSignature = signature;
        const geometry = window.InspirationFlipThickness.sideStrips({ size, radius, depth: 2 });
        for (let i = 0; i < geometry.length; i++) {
          let strip = item.strips[i];
          if (!strip) {
            strip = document.createElement('span'); strip.className = 'inspiration__card-flip-side';
            item.strips.push(strip); item.wall.append(strip);
          }
          const edge = geometry[i];
          strip.hidden = false;
          strip.style.left = `${edge.x.toFixed(5)}px`;
          strip.style.top = `${edge.y.toFixed(5)}px`;
          strip.style.width = `${(edge.length + .02).toFixed(5)}px`;
          strip.style.height = `${edge.depth}px`;
          strip.style.transform = `translate3d(-50%, -50%, 0) rotateZ(${edge.angle.toFixed(6)}deg) rotateX(90deg)`;
        }
        for (let i = geometry.length; i < item.strips.length; i++) item.strips[i].hidden = true;
      }
    }
  }
  function immediateReset() {
    lastTime = 0;
    for (const item of items) {
      item.value = item.target = item.velocity = item.recession = item.recessionVelocity = 0;
      item.navigating = false; item.down = null; item.suppressClick = false;
      paint(item);
    }
  }
  function toggle(item, time = performance.now()) {
    if (!clickable(item)) return false;
    item.target = item.target === 180 ? 0 : 180;
    item.navigating = false;
    lastTime = Number.isFinite(time) ? time : 0;
    if (context.reducedMotion || reduce.matches) { item.value = item.target; item.velocity = 0; }
    paint(item); wake(); return true;
  }
  function resetForNavigation(_direction, time = performance.now()) {
    let changed = false;
    for (const item of items) {
      if (item.target !== 0 || Math.abs(item.value) > .003) {
        item.target = 0; item.navigating = true; item.down = null;
        if (context.reducedMotion || reduce.matches) {
          item.value = item.velocity = item.recession = item.recessionVelocity = 0; item.navigating = false;
        }
        paint(item); changed = true;
      }
    }
    if (changed) { lastTime = Number.isFinite(time) ? time : 0; wake(); }
    return changed;
  }
  function update({ active = -1, enabled = false, now = 0, reducedMotion = reduce.matches, restore = false } = {}) {
    context = { active, enabled: Boolean(enabled), reducedMotion: Boolean(reducedMotion) };
    if (restore || active < 0 || view.root.hidden || document.hidden) {
      immediateReset(); return { animating: false };
    }
    const dt = clamp(lastTime && now ? (now - lastTime) / 1000 : 1 / 60, 0, .064);
    lastTime = now;
    let animating = false;
    for (const item of items) {
      if (context.reducedMotion) {
        item.value = item.target; item.velocity = item.recession = item.recessionVelocity = 0; item.navigating = false;
      } else {
        const turning = spring(item, 'value', 'velocity', item.target, dt);
        // Recede during the return, then ease back to the normal resting mesh.
        const recede = item.navigating && (Math.abs(item.value) > 2 || Math.abs(item.velocity) > 4) ? 1 : 0;
        const scaling = spring(item, 'recession', 'recessionVelocity', recede, dt, 12, .9);
        if (!turning && !scaling && recede === 0) item.navigating = false;
        animating = turning || scaling || animating;
      }
      paint(item);
    }
    if (!animating) lastTime = 0;
    return { animating };
  }
  for (const item of items) {
    item.card.addEventListener('pointerdown', event => {
      if (!clickable(item) || event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      item.down = { x: event.clientX, y: event.clientY }; item.suppressClick = false;
    });
    item.card.addEventListener('pointermove', event => {
      if (item.down && Math.hypot(event.clientX - item.down.x, event.clientY - item.down.y) > 6) item.suppressClick = true;
    });
    item.card.addEventListener('pointerup', event => {
      if (item.down && Math.hypot(event.clientX - item.down.x, event.clientY - item.down.y) > 6) item.suppressClick = true;
      const touchTap = item.down && event.pointerType === 'touch' && event.isPrimary !== false && !item.suppressClick;
      item.down = null;
      // Cancelling tiny touchmove jitter to own a category swipe can suppress
      // Safari's synthetic click. Complete a genuine tap on pointerup instead,
      // and consume its optional compatibility click without toggling twice.
      if (touchTap && toggle(item)) {
        item.suppressClick = true;
        event.preventDefault(); event.stopPropagation();
      }
    });
    item.card.addEventListener('pointercancel', () => { item.down = null; item.suppressClick = true; });
    item.card.addEventListener('click', event => {
      if (item.suppressClick) { item.suppressClick = false; return; }
      if (toggle(item)) { event.preventDefault(); event.stopPropagation(); }
    });
    item.card.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key) || event.repeat || !clickable(item)) return;
      event.preventDefault(); event.stopPropagation(); toggle(item);
    });
  }
  window.addEventListener('blur', immediateReset);
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', () => { if (document.hidden) immediateReset(); else wake(); });
  reduce.addEventListener('change', () => { context.reducedMotion = reduce.matches; if (reduce.matches) { for (const item of items) { item.value = item.target; item.velocity = item.recession = item.recessionVelocity = 0; paint(item); } } wake(); });
  immediateReset();
  window.InspirationCardFlip = Object.freeze({ update, resetForNavigation, reset: immediateReset });
})();
