/* Three complete glass cards, with a paused-during-drag automatic carousel. */
(() => {
  'use strict';
  if (window.HeroWelcomeStack) return;
  const welcome = document.querySelector('.hero__welcome');
  const prototype = welcome?.querySelector('.welcome-card');
  const prototypeText = prototype?.querySelector('.welcome-card__text');
  if (!welcome || !prototype || !prototypeText) return;

  const messages = [
    ['欢迎加入俱乐部，伙计！', '我是叶戈尔。'],
    ['Welcome to the club buddy!', 'I’m Egor'],
    ['欢迎加入俱乐部，伙计！', '我是叶戈尔。'],
  ];
  const intervalMs = 3000;
  const durationMs = 650;
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const originalClass = prototype.className;
  const originalAria = prototype.getAttribute('aria-hidden');
  const originalText = [...prototypeText.childNodes].map(node => node.cloneNode(true));
  const originalLanguage = prototypeText.getAttribute('lang');
  const originalPagination = prototype.querySelector('.welcome-card__pagination')?.cloneNode(true);
  const originalTabIndex = prototype.getAttribute('tabindex');
  const originalRole = welcome.getAttribute('role');
  const originalLabel = welcome.getAttribute('aria-label');
  const originalDescription = welcome.getAttribute('aria-roledescription');
  const cards = [prototype, prototype.cloneNode(true), prototype.cloneNode(true)];
  const state = { activeIndex: 0, nextIndex: null, animating: false, visible: true, destroyed: false };
  const drag = { pointerId: null, card: null, startX: 0, startY: 0, distance: 0 };
  let nextTimer = null;
  let completeTimer = null;
  let pageHidden = false;

  cards.forEach((card, index) => {
    const text = card.querySelector('.welcome-card__text');
    text.replaceChildren(document.createTextNode(messages[index][0]), document.createElement('br'), document.createTextNode(messages[index][1]));
    text.setAttribute('lang', index === 1 ? 'en' : 'zh-Hans');
    const dots = document.createElement('span');
    dots.className = 'welcome-card__pagination';
    dots.setAttribute('aria-hidden', 'true');
    for (let dotIndex = 0; dotIndex < cards.length; dotIndex++) {
      const dot = document.createElement('span');
      dot.className = `welcome-card__dot${dotIndex === index ? ' is-active' : ''}`;
      dots.append(dot);
    }
    card.querySelector('.welcome-card__pagination')?.replaceWith(dots);
    card.setAttribute('data-welcome-card', String(index));
    if (index) welcome.append(card);
  });
  welcome.classList.add('has-welcome-stack');
  welcome.setAttribute('role', 'group');
  welcome.setAttribute('aria-roledescription', 'carousel');
  welcome.setAttribute('aria-label', 'Welcome messages. Drag up to change card.');
  welcome.setAttribute('data-welcome-visible', 'true');
  welcome.style.setProperty('--welcome-stack-duration', `${durationMs}ms`);

  function canInteract() {
    return !state.destroyed && state.visible && !pageHidden && !document.hidden && !window.SitePreloader?.isBlocking();
  }
  function canRun() {
    return canInteract() && !motion?.matches && drag.pointerId === null;
  }
  function clearTimers() {
    if (nextTimer !== null) clearTimeout(nextTimer);
    if (completeTimer !== null) clearTimeout(completeTimer);
    nextTimer = null;
    completeTimer = null;
  }
  function setCardState(card, name, index) {
    for (const role of ['active', 'rear', 'leaving', 'entering', 'forming-rear']) {
      card.classList.toggle(`welcome-card--${role}`, role === name);
    }
    card.setAttribute('aria-hidden', index === state.activeIndex ? 'false' : 'true');
    card.setAttribute('tabindex', index === state.activeIndex && state.visible ? '0' : '-1');
  }
  function showStableCards() {
    welcome.classList.remove('is-welcome-cycling');
    cards.forEach((card, index) => {
      const name = index === state.activeIndex ? 'active' : index === (state.activeIndex + 1) % cards.length ? 'rear' : '';
      setCardState(card, name, index);
    });
  }
  function complete() {
    completeTimer = null;
    if (!state.animating || state.destroyed) return;
    state.activeIndex = state.nextIndex;
    state.nextIndex = null;
    state.animating = false;
    showStableCards();
  }
  function begin(direction = 1, manual = false) {
    if (!(manual ? canInteract() : canRun())) { pause(); return; }
    if (state.animating) complete();
    clearTimers();
    state.nextIndex = (state.activeIndex + direction + cards.length) % cards.length;
    if (motion?.matches) {
      state.activeIndex = state.nextIndex;
      state.nextIndex = null;
      showStableCards();
      return;
    }
    state.animating = true;
    welcome.classList.add('is-welcome-cycling');
    cards.forEach((card, index) => {
      const name = index === state.activeIndex ? 'leaving' : index === state.nextIndex ? 'entering' : 'forming-rear';
      setCardState(card, name, index);
    });
    completeTimer = setTimeout(complete, durationMs);
    // Schedule from the start, not from animation completion: 3 seconds per card.
    nextTimer = setTimeout(() => begin(), intervalMs);
  }
  function pause() {
    clearTimers();
    cancelDrag();
    state.nextIndex = null;
    state.animating = false;
    showStableCards();
  }
  function updateLifecycle() {
    if (!canRun()) { pause(); return; }
    if (nextTimer === null && !state.animating) nextTimer = setTimeout(() => begin(), intervalMs);
  }
  function setVisible(visible) {
    if (state.destroyed || state.visible === Boolean(visible)) return;
    state.visible = Boolean(visible);
    welcome.setAttribute('data-welcome-visible', String(state.visible));
    updateLifecycle();
  }
  function cancelDrag() {
    const pointerId = drag.pointerId;
    const capturedCard = drag.card;
    drag.pointerId = null;
    drag.card = null;
    drag.distance = 0;
    welcome.classList.remove('is-welcome-dragging');
    welcome.style.removeProperty('--welcome-drag-y');
    if (capturedCard?.hasPointerCapture?.(pointerId)) capturedCard.releasePointerCapture(pointerId);
  }
  function pointerDown(event) {
    if (!canInteract() || state.animating || drag.pointerId !== null || event.isPrimary === false || (event.button != null && event.button !== 0)) return;
    const card = cards[state.activeIndex];
    if (!card.contains(event.target)) return;
    clearTimers();
    drag.pointerId = event.pointerId;
    drag.card = card;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.distance = 0;
    card.setPointerCapture?.(event.pointerId);
    welcome.classList.add('is-welcome-dragging');
    event.preventDefault();
  }
  function pointerMove(event) {
    if (event.pointerId !== drag.pointerId) return;
    drag.distance = event.clientY - drag.startY;
    const offset = Math.max(-34, Math.min(0, drag.distance * .55));
    welcome.style.setProperty('--welcome-drag-y', `${offset.toFixed(2)}px`);
    event.preventDefault();
  }
  function pointerUp(event) {
    if (event.pointerId !== drag.pointerId) return;
    const distance = event.clientY - drag.startY;
    const horizontal = Math.abs(event.clientX - drag.startX);
    const changed = distance <= -18 && -distance >= horizontal;
    cancelDrag();
    if (changed) begin(1, true);
    else updateLifecycle();
  }
  function pointerCancel(event) {
    if (event.pointerId !== drag.pointerId) return;
    cancelDrag();
    updateLifecycle();
  }
  function keyDown(event) {
    if (!canInteract() || state.animating || event.key !== 'ArrowUp') return;
    event.preventDefault();
    event.stopPropagation();
    begin(1, true);
  }
  function hidePage() { pageHidden = true; updateLifecycle(); }
  function showPage() { pageHidden = false; updateLifecycle(); }
  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    state.animating = false;
    state.nextIndex = null;
    clearTimers();
    cancelDrag();
    welcome.removeEventListener('pointerdown', pointerDown);
    welcome.removeEventListener('pointermove', pointerMove);
    welcome.removeEventListener('pointerup', pointerUp);
    welcome.removeEventListener('pointercancel', pointerCancel);
    welcome.removeEventListener('lostpointercapture', pointerCancel);
    welcome.removeEventListener('keydown', keyDown);
    document.removeEventListener('visibilitychange', updateLifecycle);
    window.removeEventListener('pagehide', hidePage);
    window.removeEventListener('pageshow', showPage);
    window.removeEventListener('site:entered', updateLifecycle);
    if (motion?.removeEventListener) motion.removeEventListener('change', updateLifecycle);
    else motion?.removeListener?.(updateLifecycle);
    cards.slice(1).forEach(card => card.remove());
    prototype.className = originalClass;
    prototype.removeAttribute('data-welcome-card');
    if (originalTabIndex === null) prototype.removeAttribute('tabindex');
    else prototype.setAttribute('tabindex', originalTabIndex);
    if (originalAria === null) prototype.removeAttribute('aria-hidden');
    else prototype.setAttribute('aria-hidden', originalAria);
    prototypeText.replaceChildren(...originalText);
    if (originalLanguage === null) prototypeText.removeAttribute('lang');
    else prototypeText.setAttribute('lang', originalLanguage);
    if (originalPagination) prototype.querySelector('.welcome-card__pagination')?.replaceWith(originalPagination);
    for (const [attribute, value] of [['role', originalRole], ['aria-label', originalLabel], ['aria-roledescription', originalDescription]]) {
      if (value === null) welcome.removeAttribute(attribute);
      else welcome.setAttribute(attribute, value);
    }
    welcome.removeAttribute('data-welcome-visible');
    welcome.classList.remove('has-welcome-stack', 'is-welcome-cycling');
    welcome.style.removeProperty('--welcome-stack-duration');
    if (window.HeroWelcomeStack === api) delete window.HeroWelcomeStack;
  }

  const api = Object.freeze({
    setVisible,
    getState: () => ({
      ...state,
      reducedMotion: Boolean(motion?.matches),
      running: canRun(),
      cardCount: cards.length,
      pendingTimers: Number(nextTimer !== null) + Number(completeTimer !== null),
      dragging: drag.pointerId !== null,
    }),
    destroy,
  });
  window.HeroWelcomeStack = api;
  welcome.addEventListener('pointerdown', pointerDown);
  welcome.addEventListener('pointermove', pointerMove);
  welcome.addEventListener('pointerup', pointerUp);
  welcome.addEventListener('pointercancel', pointerCancel);
  welcome.addEventListener('lostpointercapture', pointerCancel);
  welcome.addEventListener('keydown', keyDown);
  document.addEventListener('visibilitychange', updateLifecycle);
  window.addEventListener('pagehide', hidePage);
  window.addEventListener('pageshow', showPage);
  window.addEventListener('site:entered', updateLifecycle);
  if (motion?.addEventListener) motion.addEventListener('change', updateLifecycle);
  else motion?.addListener?.(updateLifecycle);
  showStableCards();
  updateLifecycle();
})();
