/* Reloads and explicit logo restarts begin at the hero before scenes initialize.
   Back/forward navigation and every saved effect setting remain independent. */
(() => {
  'use strict';
  const storageKey = 'ff.hero.restart.v1';
  const queryKey = '_heroRestart';
  const validRestoration = value => value === 'manual' ? 'manual' : 'auto';
  const top = () => window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  const url = new URL(window.location.href);
  let restart = null;
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) restart = JSON.parse(stored);
    window.sessionStorage.removeItem(storageKey);
  } catch { /* A URL marker supplies the same one-shot path without storage. */ }
  const queryValue = url.searchParams.get(queryKey);
  if (queryValue === 'auto' || queryValue === 'manual') restart = { restoration: queryValue };
  const navigation = window.performance?.getEntriesByType?.('navigation')?.[0];
  const reloading = navigation?.type === 'reload' || (!navigation && window.performance?.navigation?.type === 1);
  if (!restart && reloading) restart = { restoration: validRestoration(window.history.scrollRestoration) };

  if (restart) {
    const previous = validRestoration(restart.restoration);
    try { window.history.scrollRestoration = 'manual'; } catch { /* Scroll reset still works. */ }
    url.searchParams.delete(queryKey);
    url.hash = '';
    try { window.history.replaceState(window.history.state, '', url.href); } catch { /* Keep the current route if history is restricted. */ }
    top();
    document.addEventListener('DOMContentLoaded', top, { once: true });
    window.addEventListener('pageshow', () => {
      top();
      // Native restoration can finish after pageshow. Keep the initial hero
      // reset through that turn, then restore the page's previous policy.
      window.requestAnimationFrame(() => {
        top();
        window.requestAnimationFrame(() => {
          top();
          try { window.history.scrollRestoration = previous; } catch { /* Optional browser capability. */ }
        });
      });
    }, { once: true });
  }

  let restarting = false;
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-return-hero]');
    if (!button || button.disabled || button.getAttribute('aria-hidden') === 'true' || restarting) return;
    event.preventDefault();
    restarting = true;
    const restoration = validRestoration(window.history.scrollRestoration);
    let stored = false;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ restoration }));
      stored = true;
    } catch { /* Reload through an equivalent query marker if storage is full/blocked. */ }
    try { window.history.scrollRestoration = 'manual'; } catch { /* Optional browser capability. */ }
    const target = new URL(window.location.href);
    target.hash = '';
    if (!stored) {
      target.searchParams.set(queryKey, restoration);
      window.location.replace(target.href);
      return;
    }
    try { window.history.replaceState(window.history.state, '', target.href); } catch { /* The next document resets any remaining anchor. */ }
    window.location.reload();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const hero = document.querySelector('.hero');
    const logo = hero?.querySelector(':scope > [data-return-hero]');
    if (!hero || !logo) return;
    const sync = () => {
      const available = hero.dataset.aboutActive === 'true';
      if (logo.disabled === !available) return;
      logo.disabled = !available;
      logo.tabIndex = available ? 0 : -1;
    };
    sync();
    if (typeof MutationObserver === 'function') {
      new MutationObserver(sync).observe(hero, { attributes: true, attributeFilter: ['data-about-active'] });
    }
  }, { once: true });
})();
