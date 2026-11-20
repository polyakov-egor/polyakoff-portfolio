(() => {
  'use strict';

  const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  let panel;
  let api;
  let count;
  let enabled;
  let ranges;
  let presetButtons;

  function sync() {
    if (!panel) mount();
    if (!panel) return;

    const settings = api.getSettings();
    panel.hidden = api.getState().requestedActive === false;
    count.textContent = `${numberFormat.format(settings.particleCount)} частиц`;
    enabled.checked = settings.enabled !== false;

    for (const button of presetButtons) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.preset) === settings.preset));
    }

    for (const input of ranges) {
      const value = Number(settings[input.dataset.setting]);
      input.value = String(value);
      input.setAttribute('aria-valuetext', numberFormat.format(value));
      input.nextElementSibling.value = numberFormat.format(value);
      const progress = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
      input.style.setProperty('--range-progress', `${progress * 100}%`);
    }
  }

  function mount() {
    if (panel || !window.HeroParticles || !document.body) return;
    if (document.querySelector('[data-hero-particles-controls]')) return;
    api = window.HeroParticles;
    panel = document.createElement('details');
    panel.className = 'hero-particles-controls';
    panel.open = true;
    panel.setAttribute('data-hero-particles-controls', '');
    panel.setAttribute('data-effect-controls', '');
    panel.setAttribute('data-lenis-prevent', '');
    panel.innerHTML = `
      <summary class="hero-particles-controls__summary">Частицы</summary>
      <div class="hero-particles-controls__body">
        <div class="hero-particles-controls__presets" role="group" aria-label="Пресеты частиц">
          <button type="button" data-preset="1" aria-pressed="false">Пресет 1</button>
          <button type="button" data-preset="2" aria-pressed="false">Пресет 2</button>
        </div>
        <p class="hero-particles-controls__count"></p>
        <div class="hero-particles-controls__field">
          <label for="hero-particles-size">Размер частиц</label>
          <input id="hero-particles-size" type="range" min="0.5" max="10" step="0.1" data-setting="particleSize">
          <output for="hero-particles-size"></output>
        </div>
        <div class="hero-particles-controls__field">
          <label for="hero-particles-strength">Сила курсора</label>
          <input id="hero-particles-strength" type="range" min="0" max="1" step="0.01" data-setting="cursorStrength">
          <output for="hero-particles-strength"></output>
        </div>
        <label class="hero-particles-controls__enabled">
          <span>Эффект</span>
          <input type="checkbox" checked>
        </label>
      </div>`;

    count = panel.querySelector('.hero-particles-controls__count');
    enabled = panel.querySelector('input[type="checkbox"]');
    ranges = panel.querySelectorAll('input[type="range"]');
    presetButtons = panel.querySelectorAll('[data-preset]');

    for (const button of presetButtons) {
      button.addEventListener('click', () => {
        api.setPreset(Number(button.dataset.preset));
        sync();
      });
    }
    for (const input of ranges) {
      input.addEventListener('input', () => {
        api.setSettings({ [input.dataset.setting]: Number(input.value) });
        sync();
      });
    }
    enabled.addEventListener('change', () => {
      api.setSettings({ enabled: enabled.checked });
      sync();
    });
    panel.addEventListener('wheel', event => event.preventDefault(), { passive: false });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !panel.open) return;
      event.preventDefault();
      panel.open = false;
      panel.querySelector('summary').focus({ preventScroll: true });
    });
    document.body.append(panel);
  }

  window.addEventListener('hero-particles:settings', sync);
  window.addEventListener('hero-particles:state', sync);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync, { once: true });
  } else {
    sync();
  }
})();
