(() => {
  'use strict';

  const sliders = [
    { key: 'particleCount', label: 'Количество частиц', min: 20000, max: 350000, step: 1000, commit: true },
    { key: 'particleSize', label: 'Размер частиц', min: 0.5, max: 10, step: 0.1, unit: ' px' },
    { key: 'speed', label: 'Скорость потока', min: 0, max: 3, step: 0.1 },
    { key: 'noiseStrength', label: 'Сила потока', min: 0, max: 0.3, step: 0.01 },
    { key: 'cursorStrength', label: 'Реакция на курсор', min: 0, max: 1, step: 0.01 },
    { key: 'cursorRadius', label: 'Радиус курсора', min: 10, max: 160, step: 1, unit: ' px' },
    { key: 'baseOpacity', label: 'Яркость портрета', min: 0, max: 1, step: 0.01, percent: true }
  ];
  const numbers = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat('ru-RU', { style: 'percent' });
  const statusLabels = {
    unavailable: 'Эффект недоступен в этом браузере',
    reduced: 'Включено уменьшение движения',
    'reduced-motion': 'Включено уменьшение движения'
  };
  let panel;
  let api;
  let fields;
  let enabled;
  let status;

  function updateValue(field) {
    const { input, output, config } = field;
    const value = Number(input.value);
    const formatted = config.percent ? percent.format(value) : numbers.format(value) + (config.unit || '');
    output.value = formatted;
    input.setAttribute('aria-valuetext', formatted);
  }

  function syncSettings() {
    if (!panel) return mount();
    const settings = api.getSettings();
    enabled.checked = settings.enabled !== false;
    for (const field of fields) {
      const value = settings[field.config.key];
      if (!Number.isFinite(value)) continue;
      field.input.value = String(value);
      updateValue(field);
    }
  }

  function syncState() {
    if (!panel) return mount();
    const state = api.getState();
    panel.hidden = state.inHero === false;
    status.textContent = statusLabels[state.status] || '';
    status.hidden = !status.textContent;
  }

  function mount() {
    if (panel) return;
    api = window.HeroThreeParticles;
    if (!api || !document.body || document.querySelector('[data-hero-three-particle-controls]')) return;

    panel = document.createElement('details');
    panel.className = 'hero-three-particle-controls';
    panel.lang = 'ru';
    panel.setAttribute('data-hero-three-particle-controls', '');
    panel.setAttribute('data-effect-controls', '');
    panel.setAttribute('data-lenis-prevent', '');
    panel.innerHTML = `
      <summary>Частицы</summary>
      <div class="hero-three-particle-controls__body">
        <label class="hero-three-particle-controls__toggle">
          <span>Эффект</span>
          <input type="checkbox">
        </label>
        <p class="hero-three-particle-controls__status" role="status" hidden></p>
        ${sliders.map(({ key, label, min, max, step }) => `
          <div class="hero-three-particle-controls__slider">
            <label for="hero-three-${key}">${label}</label>
            <output for="hero-three-${key}"></output>
            <input id="hero-three-${key}" type="range" min="${min}" max="${max}" step="${step}">
          </div>`).join('')}
        <button type="button">Сбросить настройки</button>
      </div>`;

    const summary = panel.querySelector('summary');
    const body = panel.querySelector('.hero-three-particle-controls__body');
    enabled = panel.querySelector('input[type="checkbox"]');
    status = panel.querySelector('.hero-three-particle-controls__status');
    fields = sliders.map(config => {
      const input = panel.querySelector(`#hero-three-${config.key}`);
      const field = { config, input, output: input.previousElementSibling };
      const apply = () => {
        api.setSettings({ [config.key]: Number(input.value) });
        syncSettings();
      };
      input.addEventListener('input', () => {
        if (config.commit) updateValue(field);
        else apply();
      });
      if (config.commit) input.addEventListener('change', apply);
      return field;
    });

    enabled.addEventListener('change', () => {
      api.setSettings({ enabled: enabled.checked });
      syncSettings();
    });
    panel.querySelector('button').addEventListener('click', () => {
      api.resetSettings();
      syncSettings();
    });
    panel.addEventListener('wheel', event => {
      if (!body.contains(event.target) || body.scrollHeight <= body.clientHeight) event.preventDefault();
    }, { passive: false });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !panel.open) return;
      event.preventDefault();
      panel.open = false;
      summary.focus({ preventScroll: true });
    });

    document.body.append(panel);
    syncSettings();
    syncState();
  }

  window.addEventListener('hero-three-particles:settings', syncSettings);
  window.addEventListener('hero-three-particles:state', syncState);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
