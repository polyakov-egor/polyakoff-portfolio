/* Named snapshots of the effect APIs. Saving a preset never changes the effects. */
(() => {
  'use strict';
  const depthEffect = window.HeroDepthEffect;
  const scrollEffect = window.HeroScrollEffect;
  const backgroundEffect = window.BackgroundLineEffect;
  const owners = { depth: depthEffect, scroll: scrollEffect };
  if (backgroundEffect) owners.background = backgroundEffect;
  const panel = document.querySelector('.effect-controls__panel');
  const heading = panel?.querySelector('.effect-controls__heading');
  if (!depthEffect || !scrollEffect || !heading || panel.querySelector('[data-effect-presets]')) return;

  const storageKey = 'ff.hero.effect.presets.v1';
  const maxPresets = 30;
  const maxNameLength = 64;
  const maxStorageLength = 256 * 1024;
  const reservedKeys = new Set(['__proto__', 'constructor', 'prototype']);
  const enumValues = new Map([
    ['aboutFlightVariant', ['first', 'second']],
    ['aboutRevealMode', ['gradient', 'wave', 'radial']],
    ['ambientDirection', ['up', 'down', 'left', 'right']],
    ['aboutTriggerMode', ['portrait', 'viewport']],
    ['aboutFadeShape', ['distance', 'circle', 'ellipse', 'linear', 'box']],
    ['aboutFadeOrigin', ['text', 'screen']],
  ]);
  for (const select of panel.querySelectorAll('[data-effect-select]')) {
    const options = [...(select.options || select.querySelectorAll('option'))].map(option => option.value);
    if (options.length) enumValues.set(select.dataset.effectSelect, options);
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function button(label, dataName) {
    const node = element('button', 'effect-presets__button', label);
    node.type = 'button';
    node.setAttribute(dataName, '');
    return node;
  }

  const root = element('section', 'effect-presets');
  root.setAttribute('data-effect-presets', '');
  root.setAttribute('aria-label', 'Пресеты эффектов');
  const selectLabel = element('label', 'effect-presets__label', 'Пресет');
  selectLabel.htmlFor = 'hero-effect-preset-select';
  const select = element('select', 'effect-presets__select');
  select.id = 'hero-effect-preset-select';
  select.setAttribute('data-preset-select', '');
  const nameLabel = element('label', 'effect-presets__label', 'Название пресета');
  nameLabel.htmlFor = 'hero-effect-preset-name';
  const nameInput = element('input', 'effect-presets__name');
  nameInput.id = 'hero-effect-preset-name';
  nameInput.type = 'text';
  nameInput.maxLength = maxNameLength;
  nameInput.autocomplete = 'off';
  nameInput.placeholder = 'Например, Мягкий разлёт';
  nameInput.setAttribute('data-preset-name', '');
  const saveButton = button('Сохранить новый', 'data-preset-save');
  saveButton.classList.add('effect-presets__button--save');
  const updateButton = button('Обновить', 'data-preset-update');
  const deleteButton = button('Удалить', 'data-preset-delete');
  const actions = element('div', 'effect-presets__actions');
  actions.append(updateButton, deleteButton);
  const status = element('p', 'effect-presets__status');
  status.setAttribute('data-preset-status', '');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const undoButton = button('Вернуть удалённый', 'data-preset-undo');
  undoButton.hidden = true;
  root.append(selectLabel, select, nameLabel, nameInput, saveButton, actions, status, undoButton);
  panel.insertBefore(root, heading.nextSibling);

  let presets = [];
  let selectedId = '';
  let lastDeleted = null;
  let applying = false;
  let idCounter = 0;
  let loadNotice = '';

  function announce(message) { status.textContent = message; }
  function has(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function isRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function isValue(value) {
    return typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))
      || (typeof value === 'string' && value.length <= 128);
  }
  function copySettings(source) {
    if (!isRecord(source) || Object.keys(source).length > 128) throw new Error('Invalid settings');
    const copy = {};
    for (const key of Object.keys(source)) {
      if (reservedKeys.has(key) || !isValue(source[key])) throw new Error('Invalid setting');
      copy[key] = source[key];
    }
    return copy;
  }
  function capture() {
    return Object.fromEntries(Object.entries(owners).map(([key, api]) => [key, copySettings(api.getSettings())]));
  }
  function normalizeName(value) {
    return String(value).replace(/\s+/g, ' ').trim().slice(0, maxNameLength);
  }
  function uniqueName(name, ignoredId = '') {
    const occupied = new Set(presets.filter(preset => preset.id !== ignoredId).map(preset => preset.name.toLowerCase()));
    if (!occupied.has(name.toLowerCase())) return name;
    let number = 2;
    while (true) {
      const suffix = ` (${number++})`;
      const candidate = `${name.slice(0, maxNameLength - suffix.length).trimEnd()}${suffix}`;
      if (!occupied.has(candidate.toLowerCase())) return candidate;
    }
  }
  function uniqueId() {
    const random = window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    const base = `preset-${Date.now().toString(36)}-${random}`;
    let id = base;
    while (presets.some(preset => preset.id === id)) id = `${base}-${++idCounter}`;
    return id;
  }

  function prepareSettings(api, stored) {
    const snapshot = copySettings(stored);
    const current = copySettings(api.getSettings());
    const defaults = typeof api.getDefaults === 'function' ? copySettings(api.getDefaults()) : {};
    const keys = new Set([...Object.keys(current), ...Object.keys(defaults)]);
    const complete = {};
    for (const key of keys) {
      const reference = has(defaults, key) ? defaults[key] : current[key];
      if (has(snapshot, key)) {
        const value = snapshot[key];
        if (typeof value !== typeof reference || (enumValues.has(key) && !enumValues.get(key).includes(value))
          || (['aboutScrollDuration', 'heroScrollDuration'].includes(key) && (value < 1 || value > 3))
          || (api === scrollEffect && key === 'inspirationCardDurationMs' && (value < 350 || value > 1800))
          || (api === scrollEffect && key === 'aboutFillFeather' && (value < .2 || value > 1.5))
          || (api === scrollEffect && key === 'musicActivity' && (value < .5 || value > 2.5))
          || (api === scrollEffect && key === 'aboutRevealScrollDuration' && (value < 1 || value > 3))
          || (api === backgroundEffect && key === 'radius' && (value < 60 || value > 320))
          || (api === backgroundEffect && key === 'ambientSpeed' && (value < .05 || value > 1))
          || (api === backgroundEffect && ['hoverStrength', 'rippleStrength', 'ambientStrength'].includes(key) && (value < 0 || value > 1))) {
          throw new Error('Invalid preset value');
        }
        complete[key] = value;
      } else if (has(defaults, key)) complete[key] = defaults[key];
      else throw new Error('Incomplete preset');
    }
    if (api === scrollEffect && has(defaults, 'aboutTriggerMode') && !has(snapshot, 'aboutTriggerMode')) {
      complete.aboutTriggerMode = 'viewport';
    }
    if (api === scrollEffect && has(defaults, 'aboutScrollDuration') && !has(snapshot, 'aboutScrollDuration')) {
      complete.aboutScrollDuration = 1;
    }
    if (api === scrollEffect && has(defaults, 'heroScrollDuration') && !has(snapshot, 'heroScrollDuration')) {
      complete.heroScrollDuration = 1;
    }
    if (api === backgroundEffect && has(defaults, 'mode') && !has(snapshot, 'mode') && Object.keys(snapshot).length) {
      complete.mode = 'light';
    }
    return complete;
  }
  function prepare(preset) {
    // Resolve every complete snapshot before any effect is touched. Older
    // profiles receive default line settings without rewriting their record.
    return Object.fromEntries(Object.entries(owners).map(([key, api]) =>
      [key, prepareSettings(api, key === 'background' && !has(preset, key) ? {} : preset[key])]));
  }
  function sameSettings(a, b) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => has(b, key)
      && (typeof a[key] === 'number' && typeof b[key] === 'number' ? Math.abs(a[key] - b[key]) < 1e-9 : a[key] === b[key]));
  }
  function matches(preset, current) {
    try {
      const saved = prepare(preset);
      return Object.keys(owners).every(key => sameSettings(saved[key], current[key]));
    } catch { return false; }
  }

  function readPresets() {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];
      if (raw.length > maxStorageLength) throw new Error('Oversized storage');
      const stored = JSON.parse(raw);
      if (!isRecord(stored) || stored.version !== 1 || !Array.isArray(stored.presets)) throw new Error('Invalid storage');
      const clean = [];
      const ids = new Set();
      for (const entry of stored.presets.slice(0, maxPresets)) {
        try {
          if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id || entry.id.length > 96 || ids.has(entry.id)
            || typeof entry.name !== 'string') throw new Error('Invalid preset');
          const name = normalizeName(entry.name);
          if (!name) throw new Error('Missing preset name');
          const preset = { id: entry.id, name, depth: copySettings(entry.depth), scroll: copySettings(entry.scroll) };
          if (has(entry, 'background')) preset.background = copySettings(entry.background);
          prepare(preset);
          clean.push(preset);
          ids.add(preset.id);
        } catch { loadNotice = 'Некоторые пресеты не удалось прочитать.'; }
      }
      return clean;
    } catch {
      loadNotice = 'Не удалось прочитать пресеты. Можно сохранить новый.';
      return [];
    }
  }
  function store(next) {
    try {
      const serialized = JSON.stringify({ version: 1, presets: next });
      if (serialized.length > maxStorageLength) throw new Error('Oversized storage');
      window.localStorage.setItem(storageKey, serialized);
      presets = next;
      return true;
    } catch {
      announce('Не удалось сохранить пресеты в браузере. Проверьте доступ к хранилищу.');
      return false;
    }
  }

  function render({ detectMatch = true, fillName = false } = {}) {
    const current = capture();
    let selected = presets.find(preset => preset.id === selectedId);
    if (!selected && detectMatch) {
      selected = [...presets].reverse().find(preset => matches(preset, current));
      selectedId = selected?.id || '';
      if (selected && !nameInput.value) fillName = true;
    }
    const dirty = Boolean(selected && !matches(selected, current));
    root.dataset.presetDirty = String(dirty);
    select.replaceChildren();
    const currentOption = element('option', '', 'Текущие настройки');
    currentOption.value = '';
    select.append(currentOption);
    for (const preset of presets) {
      const option = element('option', '', `${preset.name}${preset.id === selectedId && dirty ? ' · Изменён' : ''}`);
      option.value = preset.id;
      select.append(option);
    }
    select.value = selected?.id || '';
    if (fillName) nameInput.value = selected?.name || '';
    saveButton.disabled = presets.length >= maxPresets;
    saveButton.title = saveButton.disabled ? 'Можно сохранить не больше 30 пресетов' : '';
    updateButton.disabled = !selected;
    deleteButton.disabled = !selected;
    undoButton.hidden = !lastDeleted;
  }

  function requestedName(ignoredId = '') {
    const name = normalizeName(nameInput.value);
    if (!name) {
      announce('Введите название пресета.');
      nameInput.focus();
      return '';
    }
    return uniqueName(name, ignoredId);
  }
  function saveNew() {
    if (presets.length >= maxPresets) { announce('Можно сохранить не больше 30 пресетов.'); return; }
    const name = requestedName();
    if (!name) return;
    const preset = { id: uniqueId(), name, ...capture() };
    if (!store([...presets, preset])) return;
    selectedId = preset.id;
    render({ fillName: true });
    announce(`Пресет «${name}» сохранён.`);
  }
  function updateSelected() {
    const index = presets.findIndex(preset => preset.id === selectedId);
    if (index < 0) return;
    const name = requestedName(selectedId);
    if (!name) return;
    const next = [...presets];
    next[index] = { id: selectedId, name, ...capture() };
    if (!store(next)) return;
    render({ fillName: true });
    announce(`Пресет «${name}» обновлён.`);
  }
  function deleteSelected() {
    const index = presets.findIndex(preset => preset.id === selectedId);
    if (index < 0) return;
    const deleted = { preset: presets[index], index };
    if (!store(presets.filter(preset => preset.id !== selectedId))) return;
    lastDeleted = deleted;
    selectedId = '';
    render({ detectMatch: false, fillName: true });
    announce(`Пресет «${deleted.preset.name}» удалён. Его можно вернуть.`);
  }
  function undoDelete() {
    if (!lastDeleted) return;
    if (presets.length >= maxPresets) { announce('Сначала освободите место для пресета.'); return; }
    if (presets.some(preset => preset.id === lastDeleted.preset.id)) { announce('Этот пресет уже существует.'); return; }
    const restored = { ...lastDeleted.preset, name: uniqueName(lastDeleted.preset.name) };
    const next = [...presets];
    next.splice(Math.min(lastDeleted.index, next.length), 0, restored);
    if (!store(next)) return;
    selectedId = restored.id;
    lastDeleted = null;
    render({ fillName: true });
    announce(`Пресет «${restored.name}» возвращён.`);
  }
  function applySelected() {
    const preset = presets.find(item => item.id === select.value);
    if (!preset) {
      selectedId = '';
      render({ detectMatch: false, fillName: true });
      announce('Можно сохранить текущие настройки как новый пресет.');
      return;
    }
    let next;
    try { next = prepare(preset); } catch {
      announce('Этот пресет несовместим с текущими настройками. Сохраните новый.');
      render({ detectMatch: false });
      return;
    }
    const before = capture();
    applying = true;
    try {
      for (const [key, api] of Object.entries(owners)) api.setSettings(next[key]);
      selectedId = preset.id;
      render({ fillName: true });
      announce(`Пресет «${preset.name}» применён.`);
    } catch {
      for (const [key, api] of Object.entries(owners)) {
        try { api.setSettings(before[key]); } catch { /* Restore every remaining owner even if one cannot recover. */ }
      }
      announce('Не удалось применить пресет. Попробуйте ещё раз.');
      render({ detectMatch: false });
    } finally { applying = false; }
  }

  select.addEventListener('change', applySelected);
  saveButton.addEventListener('click', saveNew);
  updateButton.addEventListener('click', updateSelected);
  deleteButton.addEventListener('click', deleteSelected);
  undoButton.addEventListener('click', undoDelete);
  nameInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    saveNew();
  });
  function settingsChanged() { if (!applying) render(); }
  window.addEventListener('hero-depth:settings', settingsChanged);
  window.addEventListener('hero-scroll:settings', settingsChanged);
  window.addEventListener('background-lines:settings', settingsChanged);
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    loadNotice = '';
    presets = readPresets();
    render();
    if (loadNotice) announce(loadNotice);
  });
  presets = readPresets();
  render({ fillName: true });
  if (loadNotice) announce(loadNotice);
})();
