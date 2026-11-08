(() => {
  const cursor = document.querySelector('.custom-cursor');
  const hero = document.querySelector('.hero');
  if (!cursor || !hero) return;
  const welcome = document.querySelector('.hero__welcome');
  const inspiration = document.querySelector('.inspiration');
  const inspirationCards = [...(document.querySelectorAll?.('.inspiration__card') || [])];
  const works = document.querySelector('[data-works-gallery]');
  const services = document.querySelector('[data-services]');
  const serviceCards = [...(services?.querySelectorAll?.('[data-service-id]') || [])];
  const clickableSelector = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"]';
  const label = cursor.querySelector('.custom-cursor__label');
  if (label) {
    const mask = document.createElement('span');
    mask.className = 'custom-cursor__label-mask';
    for (const [name, text] of [['scroll', 'Scroll'], ['drag', 'Drag'], ['press', 'Press']]) {
      const word = document.createElement('span');
      word.className = `custom-cursor__word custom-cursor__word--${name}`;
      word.textContent = text;
      mask.append(word);
    }
    label.replaceChildren(mask);
  }
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let pointer = null;
  let visibilityStamp = '';

  function overServiceCard() {
    if (!pointer || !services || services.hidden || services.inert || services.getAttribute('aria-hidden') === 'true') return false;
    const target = document.elementFromPoint?.(pointer.x, pointer.y) || pointer.target;
    const card = target?.closest?.('[data-service-id]');
    return Boolean(card && serviceCards.includes(card) && card.dataset.position === 'active' && !target.closest?.('[hidden], [inert], [aria-hidden="true"]'));
  }

  function overClickable() {
    // Hit the surface currently under the pointer rather than retaining the
    // element from its last move: the story can move a button away on scroll.
    const target = document.elementFromPoint?.(pointer.x, pointer.y) || pointer.target;
    if (!target) return false;
    const canvas = target.closest?.('.works-gallery-canvas');
    if (canvas) {
      // A full-screen canvas also contains empty space and rear faces. The
      // gallery's mesh hit test publishes only the foremost clickable plane.
      return Boolean(works?.dataset.hoveredSequence && canvas.closest('[data-works-gallery]') === works && !canvas.hidden);
    }
    const element = target.closest?.(clickableSelector);
    if (!element || element.disabled || element.matches?.(':disabled') || element.getAttribute('aria-disabled') === 'true') return false;
    if (element.closest?.('[hidden], [inert], [aria-hidden="true"]')) return false;
    if (element.classList.contains('inspiration__card')) return element.dataset.flipEnabled === 'true';
    if (element.classList.contains('works-card')) {
      return element.closest?.('.works-is-static') || !element.closest?.('.works-is-enhanced') || element.classList.contains('is-front') && element.classList.contains('is-in-view');
    }
    return true;
  }

  function updateHeroState() {
    if (!pointer) return;
    const rect = hero.getBoundingClientRect();
    const inHero = hero.dataset.aboutActive !== 'true' && pointer.x >= rect.left && pointer.x < rect.right && pointer.y >= rect.top && pointer.y < rect.bottom;
    cursor.classList.toggle('is-in-hero', inHero);
    const welcomeVisible = welcome && welcome.dataset.welcomeVisible !== 'false' && welcome.getAttribute('aria-hidden') !== 'true';
    const bounds = welcomeVisible && inHero ? welcome.getBoundingClientRect() : null;
    const dragging = welcome?.classList.contains('is-welcome-dragging');
    const overWelcome = Boolean(finePointer.matches && bounds && (dragging || pointer.x >= bounds.left && pointer.x < bounds.right && pointer.y >= bounds.top && pointer.y < bounds.bottom));
    cursor.classList.toggle('is-drag-target', overWelcome);
    const inspirationVisible = inspiration && !inspiration.hidden && inspiration.getAttribute('aria-hidden') !== 'true';
    const overCard = finePointer.matches && inspirationVisible && inspirationCards.some(card => {
      // The flip owner publishes click readiness independently from the mouse
      // tilt: the white back remains a click target too, including reduced motion.
      if (card.dataset.flipEnabled !== 'true' || card.getAttribute('aria-hidden') === 'true') return false;
      const cardBounds = card.getBoundingClientRect();
      return pointer.x >= cardBounds.left && pointer.x < cardBounds.right && pointer.y >= cardBounds.top && pointer.y < cardBounds.bottom;
    });
    const servicePress = finePointer.matches && overServiceCard();
    cursor.classList.toggle('is-press-target', Boolean(overCard || servicePress));
    cursor.classList.toggle('is-click-target', Boolean(finePointer.matches && (overWelcome || overCard || servicePress || overClickable())));
  }

  function hide() {
    pointer = null;
    cursor.classList.remove('is-visible', 'is-drag-target', 'is-press-target', 'is-click-target');
    document.body.classList.remove('has-custom-cursor');
  }

  document.addEventListener('pointermove', event => {
    if (event.target?.closest?.('[data-effect-controls]')) return hide();
    if (!finePointer.matches || event.pointerType === 'touch') return hide();
    pointer = { x: event.clientX, y: event.clientY, target: event.target };
    cursor.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
    document.body.classList.add('has-custom-cursor');
    cursor.classList.add('is-visible');
    updateHeroState();
  }, { passive: true });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) hide(); });
  document.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') hide(); }, { passive: true });
  window.addEventListener('blur', hide);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  window.addEventListener('scroll', updateHeroState, { passive: true });
  window.addEventListener('resize', updateHeroState, { passive: true });
  finePointer.addEventListener('change', hide);
  // The scroll story can hide the welcome surface while the mouse is still.
  // Observe only visibility flags, not per-frame transforms or cursor classes.
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => {
      const next = `${hero.dataset.aboutActive}|${welcome?.dataset.welcomeVisible}|${welcome?.getAttribute('aria-hidden')}|${welcome?.classList.contains('is-welcome-dragging')}|${inspiration?.hidden}|${inspiration?.getAttribute('aria-hidden')}|${inspirationCards.map(card => `${card.dataset.flipEnabled}:${card.getAttribute('aria-hidden')}`).join('|')}|${works?.dataset.hoveredSequence}|${services?.getAttribute('aria-hidden')}|${serviceCards.map(card=>`${card.dataset.position}:${card.dataset.flipped}`).join('|')}|${[...(document.querySelectorAll?.('[data-return-hero]') || [])].map(logo => `${logo.disabled}:${logo.getAttribute('aria-hidden')}`).join('|')}`;
      if (next === visibilityStamp) return;
      visibilityStamp = next;
      updateHeroState();
    });
    observer.observe(hero, { attributes: true, attributeFilter: ['data-about-active'] });
    if (welcome) observer.observe(welcome, { attributes: true, attributeFilter: ['data-welcome-visible', 'aria-hidden', 'class'] });
    if (inspiration) observer.observe(inspiration, { attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
    for (const card of inspirationCards) observer.observe(card, { attributes: true, attributeFilter: ['data-flip-enabled', 'aria-hidden'] });
    if (works) observer.observe(works, { attributes: true, attributeFilter: ['data-hovered-sequence'] });
    if (services) observer.observe(services, { attributes: true, attributeFilter: ['aria-hidden', 'inert', 'hidden'] });
    for (const card of serviceCards) observer.observe(card, { attributes: true, attributeFilter: ['data-position', 'data-flipped'] });
    for (const logo of document.querySelectorAll?.('[data-return-hero]') || []) observer.observe(logo, { attributes: true, attributeFilter: ['disabled', 'aria-hidden'] });
  }
})();
