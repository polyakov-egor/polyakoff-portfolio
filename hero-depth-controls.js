/* The portrait effect owns normalization, published defaults and persistence. */
(() => {
  'use strict';
  const effect = window.HeroDepthEffect;
  if (!effect || document.querySelector('[data-hero-depth-controls]')) return;

  const controls = document.createElement('details');
  controls.className = 'hero-depth-controls';
  controls.dataset.heroDepthControls = '';
  controls.dataset.effectControls = '';
  controls.dataset.lenisPrevent = '';
  controls.lang = 'ru';
  controls.open = true;
  controls.innerHTML = `
    <summary>Поворот героя<span aria-hidden="true"></span></summary>
    <div class="hero-depth-controls__panel">
      <div class="hero-depth-controls__field">
        <div class="hero-depth-controls__label">
          <label for="hero-depth-strength">Сила поворота</label>
          <output for="hero-depth-strength" data-depth-output="strength"></output>
        </div>
        <input id="hero-depth-strength" data-depth-setting="strength" type="range" min="0" max="3" step="0.05" />
      </div>
      <div class="hero-depth-controls__field">
        <div class="hero-depth-controls__label">
          <label for="hero-depth-amount">Глубина</label>
          <output for="hero-depth-amount" data-depth-output="depthAmount"></output>
        </div>
        <input id="hero-depth-amount" data-depth-setting="depthAmount" type="range" min="0" max="2" step="0.05" />
      </div>
      <button class="hero-depth-controls__reset" type="button">Сбросить</button>
    </div>`;
  document.body.append(controls);

  const summary = controls.querySelector('summary');
  const ranges = [...controls.querySelectorAll('[data-depth-setting]')];
  function sync() {
    const settings = effect.getSettings();
    for (const input of ranges) {
      const key = input.dataset.depthSetting;
      const value = Number(settings[key]);
      const label = key === 'strength' ? `${value.toFixed(2)}×` : `${Math.round(value * 100)}%`;
      input.value = String(value);
      input.setAttribute('aria-valuetext', label);
      input.style.setProperty('--range-progress', `${(value - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
      controls.querySelector(`[data-depth-output="${key}"]`).textContent = label;
    }
  }
  for (const input of ranges) {
    input.addEventListener('input', () => effect.setSettings({ [input.dataset.depthSetting]: Number(input.value) }));
  }
  controls.querySelector('button').addEventListener('click', () => {
    const defaults = effect.getDefaults();
    effect.setSettings({ strength: defaults.strength, depthAmount: defaults.depthAmount });
  });
  controls.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !controls.open) return;
    event.preventDefault();
    event.stopPropagation();
    controls.open = false;
    summary.focus({ preventScroll: true });
  });
  // Tuning must not advance the scroll story beneath this fixed panel.
  controls.addEventListener('wheel', event => {
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
  controls.addEventListener('touchmove', event => {
    if (!event.target.closest('input') && event.cancelable) event.preventDefault();
  }, { passive: false });
  window.addEventListener('hero-depth:settings', sync);
  sync();
})();
