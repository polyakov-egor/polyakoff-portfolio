/* Published tuning from the user's 123123123 screenshots, 2026-10-28.
   Load before the effect owners. Browser changes after this migration survive. */
(() => {
  'use strict';
  const preset = Object.freeze({
    id: 'published-123123123-v1',
    name: '123123123',
    depth: Object.freeze({
      enabled: true, strength: 2.5, smoothingMs: 240, depthAmount: 1.2, lighting: .7,
    }),
    scroll: Object.freeze({
      inspirationCardDurationMs: 800, aboutRevealMode: 'gradient',
      aboutRevealScrollDuration: 1.8, aboutFillFeather: 1.5, musicActivity: 2.1,
      aboutBackgroundStart: .13, aboutBackgroundDuration: .16,
      heroScrollDuration: 2.2, whiteAt: .52, wordmarkBlur: 57, wordmarkFade: false,
      aboutScrollDuration: 2.5, aboutTopBlur: 22, aboutFlightVariant: 'second',
      aboutFadeSpeed: 1.35, aboutTriggerMode: 'portrait', aboutTriggerGapPx: 140,
      aboutStartOffset: 0, aboutWordForce: 3, aboutLetterForce: 3,
      aboutDetach: .23, aboutRotation: .8, aboutFadeShape: 'distance', aboutFadeOrigin: 'screen',
    }),
    background: Object.freeze({
      enabled: false, mode: 'distortion', ambientEnabled: true, ambientDirection: 'up',
      ambientStrength: .3, ambientSpeed: .35, hoverStrength: .35, rippleStrength: .4, radius: 150,
    }),
  });
  window.PublishedEffectPreset = preset;
  window.PublishedEffectPresetNeedsMigration = true;

  const migrationKey = 'ff.hero.published-preset.123123123.v1';
  const presetKey = 'ff.hero.effect.presets.v1';
  const ownerKeys = {
    depth: 'ff.hero.depth.settings.v1',
    scroll: 'ff.hero.scroll.settings.v1',
    background: 'ff.background.lines.settings.v1',
  };
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  try {
    const storage = window.localStorage;
    if (storage.getItem(migrationKey) === '1') {
      window.PublishedEffectPresetNeedsMigration = false;
      return;
    }
    const read = key => {
      try { return JSON.parse(storage.getItem(key)); } catch { return null; }
    };
    const catalog = record(read(presetKey));
    const entries = Array.isArray(catalog.presets) ? catalog.presets : [];
    const existing = entries.find(entry => entry?.name === preset.name);
    const restored = { id: existing?.id || preset.id, name: preset.name };
    for (const [owner, key] of Object.entries(ownerKeys)) {
      // Values cropped out of the screenshots retain their previous value.
      restored[owner] = { ...record(read(key)), ...record(existing?.[owner]), ...preset[owner] };
      storage.setItem(key, JSON.stringify(restored[owner]));
    }
    const nextEntries = existing
      ? entries.map(entry => entry === existing ? restored : entry)
      : [restored, ...entries];
    storage.setItem(presetKey, JSON.stringify({ ...catalog, version: 1, presets: nextEntries }));
    storage.setItem('ff.hero.scroll.gradient-default.v1', '1');
    storage.setItem(migrationKey, '1');
    window.PublishedEffectPresetNeedsMigration = false;
  } catch {
    // The owners also use this snapshot in memory when storage is unavailable.
  }
})();
