(() => {
  'use strict';

  const sliders = [
    { key: 'particleCount', label: 'Particle Count', min: 10000, max: 500000, step: 10000, digits: 0, commit: true },
    { key: 'particleSize', label: 'Particle Size', min: .1, max: 6, step: .1, digits: 1, unit: ' px' },
    { key: 'particleOpacity', label: 'Particle Opacity', min: 0, max: 1, step: .01, digits: 2 },
    { key: 'speed', label: 'Speed', min: 0, max: 4, step: .1, digits: 1 },
    { key: 'noiseScale', label: 'Noise Scale', min: .0001, max: .02, step: .0001, digits: 4 },
    { key: 'noiseStrength', label: 'Noise Strength', min: 0, max: .5, step: .01, digits: 2 },
    { key: 'damping', label: 'Damping', min: .8, max: .999, step: .001, digits: 3 },
    { key: 'lifespan', label: 'Lifespan', min: 10, max: 2000, step: 1, digits: 0, unit: ' frames' },
    { key: 'imageOpacity', label: 'Image Opacity', min: 0, max: 1, step: .01, digits: 2 },
    { key: 'cursorStrength', label: 'Cursor Strength', min: 0, max: .4, step: .01, digits: 2 },
    { key: 'cursorRadius', label: 'Cursor Radius', min: 1, max: 300, step: 1, digits: 0, unit: ' px' }
  ];
  const toggles = [
    { key: 'showImage', label: 'Show Image' },
    { key: 'cursorInteraction', label: 'Cursor Interaction' },
    { key: 'paused', label: 'Paused' }
  ];
  const statusLabels = {
    unavailable: 'Эффект недоступен в этом браузере',
    reduced: 'Включено уменьшение движения',
    'reduced-motion': 'Включено уменьшение движения'
  };
  let panel;
  let api;
  let fields;
  let switches;
  let status;

  function updateValue(field) {
    const { input, output, config } = field;
    const formatted = Number(input.value).toFixed(config.digits);
    output.value = formatted;
    input.setAttribute('aria-valuetext', formatted + (config.unit || ''));
  }

  function syncSettings() {
    if (!panel) return mount();
    const settings = api.getSettings();
    for (const input of switches) input.checked = Boolean(settings[input.dataset.setting]);
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

  function toggleMarkup({ key, label }) {
    return `<label class="hero-three-particle-controls__toggle">
      <span lang="en">${label}</span>
      <input type="checkbox" data-setting="${key}">
    </label>`;
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
    const limits = api.getLimits?.();
    panel.innerHTML = `
      <summary>Частицы</summary>
      <div class="hero-three-particle-controls__body">
        <p class="hero-three-particle-controls__status" role="status" hidden></p>
        <div class="hero-three-particle-controls__grid" lang="en">
          ${sliders.map(({ key, label, min, max, step }) => {
            const [lower, upper] = limits?.[key] || [min, max];
            return `<div class="hero-three-particle-controls__slider">
              <label for="hero-three-${key}">${label}</label>
              <output for="hero-three-${key}"></output>
              <input id="hero-three-${key}" type="range" min="${lower}" max="${upper}" step="${step}">
            </div>`;
          }).join('')}
        </div>
        <div class="hero-three-particle-controls__grid hero-three-particle-controls__switches">
          ${toggles.map(toggleMarkup).join('')}
        </div>
        <div class="hero-three-particle-controls__footer">
          ${toggleMarkup({ key: 'enabled', label: 'Effect' })}
          <button type="button" lang="en">Reset</button>
        </div>
      </div>`;

    const summary = panel.querySelector('summary');
    const body = panel.querySelector('.hero-three-particle-controls__body');
    switches = panel.querySelectorAll('input[type="checkbox"]');
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

    for (const input of switches) {
      input.addEventListener('change', () => {
        api.setSettings({ [input.dataset.setting]: input.checked });
        syncSettings();
      });
    }
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
