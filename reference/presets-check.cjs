/* Exercise the real local preset catalog through its public DOM controls.
   Controllers and storage are isolated, so persistence failures and malformed
   profiles can be verified without changing the browser's saved preferences. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const presetKey = 'ff.hero.effect.presets.v1';
const clone = value => JSON.parse(JSON.stringify(value));
const defaultsFrom = filename => {
  const source = fs.readFileSync(path.join(root, filename), 'utf8');
  const match = /const defaults = Object\.freeze\((\{[\s\S]*?\})\);/.exec(source);
  assert(match, `${filename} exposes one literal defaults profile`);
  return clone(vm.runInNewContext(`(${match[1]})`));
};

function eventTarget(extra = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    dispatchEvent(event) {
      event.target ||= this;
      event.currentTarget = this;
      event.preventDefault ||= () => {event.defaultPrevented = true;};
      for (const callback of [...(listeners.get(event.type) || [])]) callback(event);
      return !event.defaultPrevented;
    },
  }, extra);
}

const dataKey = name => name.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
class Element {
  constructor(tagName = 'div') {
    Object.assign(this, eventTarget());
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = {setProperty() {}};
    this.className = '';
    this.disabled = false;
    this.hidden = false;
    this._value = '';
    this._text = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => {this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' ');},
      remove: (...names) => {this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' ');},
      toggle: (name, force) => {
        const on = force ?? !this.classList.contains(name);
        this.classList[on ? 'add' : 'remove'](name);
        return on;
      },
    };
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') this.className = String(value);
    else if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
    else if (name === 'id') this.id = String(value);
  }
  getAttribute(name) {return name === 'id' ? this.id ?? null : name.startsWith('data-') ? this.dataset[dataKey(name)] ?? null : this.attributes.get(name) ?? null;}
  hasAttribute(name) {return name.startsWith('data-') ? Object.hasOwn(this.dataset, dataKey(name)) : this.getAttribute(name) !== null;}
  removeAttribute(name) {this.attributes.delete(name); if (name.startsWith('data-')) delete this.dataset[dataKey(name)];}
  get textContent() {return this._text + this.children.map(child => child.textContent).join('');}
  set textContent(value) {this._text = String(value); this.replaceChildren();}
  get innerHTML() {throw new Error('Preset DOM must be inspected as nodes, not serialized HTML');}
  set innerHTML(_value) {throw new Error('Preset names and UI must use safe DOM creation');}
  get options() {return this.children.filter(child => child.tagName === 'OPTION');}
  get value() {
    if (this.tagName !== 'SELECT') return this._value;
    return this.options.some(option => option.value === this._value) ? this._value : '';
  }
  set value(value) {this._value = String(value);}
  append(...children) {
    for (let child of children) {
      if (typeof child === 'string') {const text = new Element('#text'); text.textContent = child; child = text;}
      child.remove();
      child.parentElement = this;
      this.children.push(child);
    }
  }
  appendChild(child) {this.append(child); return child;}
  insertBefore(child, before) {
    if (!before) {this.append(child); return child;}
    const index = this.children.indexOf(before);
    assert(index >= 0, 'insertBefore anchor must belong to its parent');
    child.remove(); child.parentElement = this; this.children.splice(index, 0, child); return child;
  }
  prepend(...children) {for (const child of children.reverse()) this.insertBefore(child, this.children[0]);}
  replaceChildren(...children) {for (const child of this.children) child.parentElement = null; this.children = []; this.append(...children);}
  remove() {if (this.parentElement) {const parent = this.parentElement; parent.children.splice(parent.children.indexOf(this), 1); this.parentElement = null;}}
  matches(selector) {
    return selector.split(',').some(part => {
      const match = /^(?:([a-z][\w-]*))?(?:#([\w-]+))?(?:\.([\w-]+))?(?:\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\])?$/i.exec(part.trim());
      if (!match) throw new Error(`Unsupported selector in preset harness: ${part}`);
      return (!match[1] || this.tagName === match[1].toUpperCase())
        && (!match[2] || this.id === match[2])
        && (!match[3] || this.classList.contains(match[3]))
        && (!match[4] || this.hasAttribute(match[4]) && (match[5] === undefined || this.getAttribute(match[4]) === match[5]));
    });
  }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {if (child.matches(selector)) found.push(child); found.push(...child.querySelectorAll(selector));}
    return found;
  }
  querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  closest(selector) {return this.matches(selector) ? this : this.parentElement?.closest(selector) || null;}
  focus() {this.focused = true;}
  click() {if (!this.disabled) this.dispatchEvent({type: 'click'});}
  get nextSibling() {return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null;}
}

function makePage(options = {}) {
  const storage = options.storage || new Map();
  const writes = [];
  const body = new Element('body');
  const controls = new Element(); controls.className = 'effect-controls'; controls.dataset.effectControls = '';
  const panel = new Element('aside'); panel.className = 'effect-controls__panel'; panel.id = 'hero-effect-panel';
  const heading = new Element(); heading.className = 'effect-controls__heading';
  panel.append(heading); controls.append(panel); body.append(controls);
  const document = eventTarget({body, createElement: tag => new Element(tag), querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector)});
  const window = eventTarget({localStorage: {
    getItem(key) {if (options.readFails) throw new Error('Storage blocked'); return storage.get(key) ?? null;},
    setItem(key, value) {if (options.writeFails) throw new Error('QuotaExceededError'); writes.push({key, value: String(value)}); storage.set(key, String(value));},
    removeItem(key) {if (options.writeFails) throw new Error('Storage blocked'); storage.delete(key);},
  }});
  const depthDefaults = defaultsFrom('hero-depth.js');
  const scrollDefaults = defaultsFrom('hero-scroll.js');
  const backgroundDefaults = defaultsFrom('background-lines.js');
  if (options.withBackground) {
    const select = new Element('select'); select.dataset.effectSelect = 'mode';
    for (const value of ['distortion', 'light']) { const option = new Element('option'); option.value = value; select.append(option); }
    panel.append(select);
  }
  let context;
  const realmClone = value => {
    context.__presetClone = JSON.stringify(value);
    try {return vm.runInContext('JSON.parse(__presetClone)', context);} finally {delete context.__presetClone;}
  };
  const controllers = {};
  const ownerDefaults = {depth: depthDefaults, scroll: scrollDefaults};
  if (options.withBackground) ownerDefaults.background = backgroundDefaults;
  for (const [owner, defaults] of Object.entries(ownerDefaults)) {
    let current = {...defaults, ...(options[owner] || {})};
    const calls = [], returnedSnapshots = [];
    const controller = {
      calls, returnedSnapshots,
      getDefaults: () => realmClone(defaults),
      getSettings: () => {const snapshot = realmClone(current); returnedSnapshots.push(snapshot); return snapshot;},
      setSettings(patch) {
        calls.push(clone(patch));
        if (options.failNextApply?.[owner]) {options.failNextApply[owner]--; throw new Error(`Temporary ${owner} apply failure`);}
        for (const key of Object.keys(defaults)) {
          if (!Object.hasOwn(patch, key)) continue;
          const value = patch[key];
          if (typeof value === typeof defaults[key] && (typeof value !== 'number' || Number.isFinite(value))) current[key] = value;
        }
        window.dispatchEvent({type: owner === 'background' ? 'background-lines:settings' : `hero-${owner}:settings`, detail: clone(current)});
        return realmClone(current);
      },
      resetSettings() {return controller.setSettings(defaults);},
    };
    controllers[owner] = controller;
    window[{depth: 'HeroDepthEffect', scroll: 'HeroScrollEffect', background: 'BackgroundLineEffect'}[owner]] = controller;
  }
  let uniqueId = 0;
  context = vm.createContext({document, window, console,
    CustomEvent: class {constructor(type, options = {}) {this.type = type; this.detail = options.detail;}},
    crypto: {randomUUID: () => `test-id-${++uniqueId}`},
    setTimeout: () => 1, clearTimeout() {},
  });
  window.crypto = vm.runInContext('crypto', context);
  const source = fs.readFileSync(path.join(root, 'hero-effect-presets.js'), 'utf8');
  vm.runInContext(source, context, {filename: 'hero-effect-presets.js'});
  const get = selector => {const result = body.querySelector(selector); assert(result, `Preset control exists: ${selector}`); return result;};
  return {
    options, storage, writes, body, panel, heading, document, window, context, controllers, depthDefaults, scrollDefaults, backgroundDefaults,
    get, click(selector) {get(selector).click();},
    select(id) {const select = get('[data-preset-select]'); select.value = id; select.dispatchEvent({type: 'change'});},
    save(name) {get('[data-preset-name]').value = name; get('[data-preset-save]').click();},
    catalog() {return JSON.parse(storage.get(presetKey) || '{"version":1,"presets":[]}').presets;},
    presets() {return get('[data-preset-select]').options.filter(option => option.value);},
    selected() {return get('[data-preset-select]').value;},
    status() {return get('[data-preset-status]').textContent;},
    settings() {return clone(Object.fromEntries(Object.entries(controllers).map(([key, api]) => [key, api.getSettings()])));},
  };
}

function differentSettings(page, seed = 1) {
  const depth = Object.fromEntries(Object.entries(page.depthDefaults).map(([key, value]) => [key, typeof value === 'number' ? value + seed / 100 : !value]));
  const scroll = {...page.scrollDefaults,
    whiteAt: .51, wordmarkBlur: 83.25, wordmarkFade: true, aboutTopBlur: 22.5,
    aboutFlightVariant: 'first', aboutFadeSpeed: 1.5, aboutStartOffset: .17,
    aboutWordForce: 1.7, aboutLetterForce: 2.1, aboutFadeBoundary: 1.4,
    aboutFadeSoftness: .72, aboutFadeShape: 'ellipse', aboutFadeOrigin: 'text',
    aboutDetach: .33, aboutRotation: 1.6, aboutFadeGuide: true,
    aboutBackgroundStart: .27, aboutBackgroundDuration: .63,
    aboutTriggerMode: 'portrait', aboutTriggerGapPx: 135.5,
    aboutScrollDuration: 2.15,
    heroScrollDuration: 2.2,
    inspirationCardDurationMs: 550, aboutFillFeather: 1.2, musicActivity: 2.1,
  };
  page.controllers.depth.setSettings(depth); page.controllers.scroll.setSettings(scroll);
  return page.settings();
}

// Test scenarios are kept below the DOM harness so failures name the observed
// user action, rather than internal implementation function names.
const page = makePage();
assert.equal(page.scrollDefaults.aboutBackgroundStart, .32, 'About background start joins every full preset snapshot');
assert.equal(page.scrollDefaults.aboutBackgroundDuration, .45, 'About background duration joins every full preset snapshot');
assert.equal(page.scrollDefaults.aboutTriggerMode, 'portrait', 'Fresh current settings use the portrait trigger');
assert.equal(page.scrollDefaults.aboutTriggerGapPx, 100, 'Fresh current settings use the 100 px portrait gap');
assert.equal(page.scrollDefaults.aboutScrollDuration, 2.5, 'Fresh current settings use the requested 2.5x about scroll duration');
assert.equal(page.scrollDefaults.heroScrollDuration, 1, 'Fresh current settings preserve the original 1x hero shrink scroll duration');
assert.equal(page.selected(), '', 'A new catalog starts on current settings');
assert.equal(page.presets().length, 0, 'A new catalog contains no invented preset');
assert.equal(page.get('[data-preset-status]').getAttribute('role'), 'status', 'Preset feedback is announced as a status');

const saved = differentSettings(page);
page.save('  Мой\n  пресет  ');
assert.equal(page.catalog().length, 1, 'Save creates one persistent preset');
const first = page.catalog()[0];
assert.equal(first.name, 'Мой пресет', 'Names trim and collapse whitespace');
assert(first.id && typeof first.id === 'string', 'Every saved preset has an opaque identifier');
assert.deepEqual(first.depth, saved.depth, 'Save captures every depth key');
assert.deepEqual(first.scroll, saved.scroll, 'Save captures every scroll key, including background timing and portrait trigger');
assert.equal(first.scroll.aboutTriggerMode, 'portrait', 'New presets explicitly capture the current trigger mode');
assert.equal(first.scroll.aboutTriggerGapPx, 135.5, 'New presets explicitly capture a fractional portrait gap');
assert.equal(first.scroll.aboutScrollDuration, 2.15, 'New presets explicitly capture the live about scroll duration');
assert.equal(first.scroll.heroScrollDuration, 2.2, 'New presets explicitly capture the independent hero shrink scroll duration');
assert.equal(page.selected(), first.id, 'The newly saved preset is selected');
assert.equal(page.controllers.depth.calls.length, 1, 'Saving never reapplies depth settings');
assert.equal(page.controllers.scroll.calls.length, 1, 'Saving never reapplies scroll settings');
for (const snapshot of page.controllers.depth.returnedSnapshots) snapshot.strength = 99;
for (const snapshot of page.controllers.scroll.returnedSnapshots) snapshot.whiteAt = .001;
page.select(first.id);
assert.deepEqual(page.settings(), saved, 'Saved profiles retain independent copies of controller snapshots');
vm.runInContext(fs.readFileSync(path.join(root, 'hero-effect-presets.js'), 'utf8'), page.context);
assert.equal(page.body.querySelectorAll('[data-effect-presets]').length, 1, 'Loading the preset script twice does not duplicate its controls');

page.controllers.depth.setSettings({strength: 2.7});
page.controllers.scroll.setSettings({aboutBackgroundDuration: .84, aboutFadeShape: 'box'});
assert.equal(page.selected(), first.id, 'Editing controls retains the chosen preset identity');
assert(page.presets().find(option => option.value === first.id).textContent.includes('Изменён'), 'Unsaved edits are visibly marked');
assert.deepEqual(page.catalog()[0], first, 'Ordinary effect edits never overwrite the saved profile');
page.select(first.id);
assert.deepEqual(page.settings(), saved, 'Choosing the preset restores the exact complete snapshot');
assert(!page.presets().find(option => option.value === first.id).textContent.includes('Изменён'), 'An exact restored snapshot clears the modified mark');

page.controllers.scroll.setSettings({aboutBackgroundStart: .74});
const updated = page.settings();
page.click('[data-preset-update]');
assert.deepEqual(page.catalog()[0].scroll, updated.scroll, 'Explicit update replaces the selected snapshot');
assert.equal(page.catalog()[0].id, first.id, 'Explicit update preserves preset identity');
assert(!page.presets().find(option => option.value === first.id).textContent.includes('Изменён'), 'Explicit update clears the modified mark');

page.save('Мой пресет');
const duplicate = page.catalog()[1];
assert.equal(duplicate.name, 'Мой пресет (2)', 'Repeated names receive a readable unique suffix');
assert.notEqual(duplicate.id, first.id, 'Duplicate names can never duplicate IDs');
page.save('<img src=x onerror=alert(1)> & "Пресет"');
const unsafe = page.catalog().at(-1);
assert.equal(page.presets().at(-1).textContent, unsafe.name, 'HTML-looking names remain literal text');
assert.equal(page.body.querySelectorAll('img').length, 0, 'A name cannot create an image or executable markup');
assert.equal(page.body.querySelectorAll('script').length, 0, 'A name cannot create a script element');
assert.equal(page.body.querySelectorAll('[id]').map(node => node.id).length, new Set(page.body.querySelectorAll('[id]').map(node => node.id)).size, 'Preset control IDs are unique');

page.get('[data-preset-name]').value = 'Переименован';
const renameCalls = page.controllers.depth.calls.length + page.controllers.scroll.calls.length;
page.click('[data-preset-update]');
assert.equal(page.catalog().at(-1).name, 'Переименован', 'Explicit update also renames the selected preset');
assert.equal(page.catalog().at(-1).id, unsafe.id, 'Renaming keeps the same identity');
assert.equal(page.controllers.depth.calls.length + page.controllers.scroll.calls.length, renameCalls, 'Renaming never reapplies effects');
page.get('[data-preset-name]').value = 'МОЙ ПРЕСЕТ';
page.click('[data-preset-update]');
assert.equal(page.catalog().at(-1).name, 'МОЙ ПРЕСЕТ (3)', 'Renaming resolves collisions case-insensitively');

const reloaded = makePage({storage: page.storage, ...page.settings()});
assert.equal(reloaded.presets().length, 3, 'Reload restores the saved catalog');
assert.equal(reloaded.selected(), unsafe.id, 'Reload recognizes the matching full snapshot');
reloaded.select(first.id);
assert.deepEqual(reloaded.settings(), updated, 'A restored catalog still applies both complete owners');
const beforeDelete = reloaded.catalog();
reloaded.click('[data-preset-delete]');
assert.equal(reloaded.catalog().length, beforeDelete.length - 1, 'Deleting removes only the chosen preset');
assert(!reloaded.catalog().some(item => item.id === first.id), 'The selected identity is deleted');
assert.equal(reloaded.selected(), '', 'Deleting selection returns to current settings');
assert.deepEqual(reloaded.settings(), updated, 'Deleting a preset leaves current effect values intact');
reloaded.click('[data-preset-undo]');
assert.deepEqual(reloaded.catalog(), beforeDelete, 'Undo restores the deleted catalog entry and ordering');

const nameLimits = makePage();
nameLimits.save('   ');
assert.equal(nameLimits.presets().length, 0, 'Whitespace alone does not create an unnamed profile');
nameLimits.save('Ж'.repeat(90));
assert(nameLimits.catalog()[0].name.length <= 64, 'Stored names are limited to 64 characters');
nameLimits.save('Ж'.repeat(90));
assert.equal(nameLimits.catalog()[1].name.length, 64, 'A duplicate suffix remains inside the 64-character name limit');
assert(nameLimits.catalog()[1].name.endsWith(' (2)'), 'Long duplicate names keep a readable unique suffix');
for (let index = 2; index < 30; index++) nameLimits.save(`Набор ${index}`);
assert.equal(nameLimits.catalog().length, 30, 'The catalog accepts thirty named profiles');
const fullCatalog = clone(nameLimits.catalog());
nameLimits.save('За пределами лимита');
assert.deepEqual(nameLimits.catalog(), fullCatalog, 'The thirty-first save cannot silently evict or overwrite a profile');
assert(nameLimits.status().trim(), 'The catalog limit has visible status feedback');
assert.equal(new Set(nameLimits.catalog().map(item => item.id)).size, 30, 'All thirty profile IDs are unique');

const originalDefaults = makePage();
const legacy = {id: 'legacy-profile', name: 'Старый набор', depth: {...originalDefaults.depthDefaults, strength: 2.1}, scroll: {whiteAt: .47, wordmarkBlur: 19, wordmarkFade: true}};
const legacyRaw = JSON.stringify({version: 1, presets: [legacy]});
const migration = makePage({storage: new Map([[presetKey, legacyRaw]])});
assert.equal(migration.presets().length, 1, 'An older partial profile remains available');
assert.equal(migration.settings().scroll.aboutTriggerMode, 'portrait', 'Merely loading an old catalog preserves the fresh current portrait trigger');
assert.equal(migration.writes.length, 0, 'Legacy compatibility does not rewrite catalog storage at load');
migration.select(legacy.id);
assert.deepEqual(migration.settings().scroll, {...migration.scrollDefaults, ...legacy.scroll, aboutTriggerMode: 'viewport', aboutScrollDuration: 1, heroScrollDuration: 1}, 'Missing settings migrate from defaults while absent trigger and durations preserve the original viewport timing and scroll lengths');
assert.equal(migration.settings().scroll.aboutBackgroundStart, .32, 'Legacy profiles receive the background start default');
assert.equal(migration.settings().scroll.aboutBackgroundDuration, .45, 'Legacy profiles receive the background duration default');
assert.equal(migration.settings().scroll.aboutTriggerMode, 'viewport', 'Selecting an old preset restores its old viewport-based timing');
assert.equal(migration.settings().scroll.aboutTriggerGapPx, 100, 'An old preset receives a default gap even though viewport timing ignores it');
assert.equal(migration.settings().scroll.aboutScrollDuration, 1, 'An old preset keeps the original 1x scroll duration');
assert.equal(migration.settings().scroll.heroScrollDuration, 1, 'An old preset keeps the original 1x hero shrink duration');
assert.equal(migration.settings().depth.strength, 2.1, 'Migration preserves existing valid settings');
assert.equal(migration.writes.length, 0, 'Applying a legacy preset does not commit a schema migration');
assert.equal(migration.storage.get(presetKey), legacyRaw, 'The original legacy snapshot remains byte-for-byte unchanged until an explicit edit');
migration.click('[data-preset-update]');
assert.equal(migration.catalog()[0].scroll.aboutTriggerMode, 'viewport', 'Explicitly updating a selected legacy preset records its effective viewport mode');
assert.equal(migration.catalog()[0].scroll.aboutTriggerGapPx, 100, 'Explicit legacy update writes its complete effective gap');
assert.equal(migration.catalog()[0].scroll.aboutScrollDuration, 1, 'Explicit legacy update captures its effective 1x scroll duration');
assert.equal(migration.catalog()[0].scroll.heroScrollDuration, 1, 'Explicit legacy update captures its effective 1x hero shrink duration');
const migratedReload = makePage({storage: migration.storage, ...migration.settings()});
assert.equal(migratedReload.selected(), legacy.id, 'An explicitly migrated legacy snapshot matches on reload');
assert.equal(migratedReload.settings().scroll.aboutTriggerMode, 'viewport', 'Reloading a migrated selection retains its explicit legacy trigger');

const legacyCurrentScroll = {...originalDefaults.scrollDefaults};
delete legacyCurrentScroll.aboutTriggerMode;
delete legacyCurrentScroll.aboutTriggerGapPx;
delete legacyCurrentScroll.aboutScrollDuration;
delete legacyCurrentScroll.heroScrollDuration;
const legacyMatching = {...legacy, id: 'legacy-matching-current', name: 'Раньше стандартный', depth: {...originalDefaults.depthDefaults}, scroll: legacyCurrentScroll};
const beforeLegacySelect = makePage({storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [legacyMatching]})]])});
assert.equal(beforeLegacySelect.selected(), '', 'An old default-looking snapshot does not falsely match the new portrait-based current defaults');
assert.equal(beforeLegacySelect.settings().scroll.aboutTriggerMode, 'portrait', 'A legacy catalog cannot silently switch the active new trigger on refresh');
beforeLegacySelect.select(legacyMatching.id);
assert.equal(beforeLegacySelect.settings().scroll.aboutTriggerMode, 'viewport', 'Explicit selection still applies an old default-looking snapshot with viewport timing');
beforeLegacySelect.save('Копия старого режима');
assert.equal(beforeLegacySelect.catalog().at(-1).scroll.aboutTriggerMode, 'viewport', 'A newly saved copy captures an explicitly selected legacy mode rather than injecting the new default');
beforeLegacySelect.controllers.scroll.setSettings({aboutTriggerMode: 'portrait', aboutTriggerGapPx: 224.75});
assert(beforeLegacySelect.presets().find(option => option.value === beforeLegacySelect.selected()).textContent.includes('Изменён'), 'Editing trigger mode or gap marks the selected preset modified');
assert.equal(beforeLegacySelect.catalog().at(-1).scroll.aboutTriggerMode, 'viewport', 'Trigger edits do not silently rewrite the saved legacy copy');

for (const duration of [1, 2.5, 3]) {
  const record = {...legacy, id: `duration-${duration}`, scroll: {aboutTriggerMode: 'portrait', aboutScrollDuration: duration}};
  const durationPage = makePage({storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [record]})]])});
  durationPage.select(record.id);
  assert.equal(durationPage.settings().scroll.aboutScrollDuration, duration, 'An explicit valid scroll duration survives restore at the supported bounds and default');
  assert.equal(durationPage.settings().scroll.heroScrollDuration, 1, 'An absent hero duration independently keeps the legacy shrink distance');
  assert.equal(durationPage.settings().scroll.aboutTriggerMode, 'portrait', 'Duration compatibility cannot replace an explicit portrait trigger');
  assert.equal(durationPage.writes.length, 0, 'Applying a stored duration never rewrites the preset');
}
const durationLegacyRecord = {...legacy, id: 'portrait-with-old-duration', scroll: {aboutTriggerMode: 'portrait'}};
const durationLegacy = makePage({storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [durationLegacyRecord]})]])});
durationLegacy.select(durationLegacyRecord.id);
assert.equal(durationLegacy.settings().scroll.aboutScrollDuration, 1, 'An absent duration preserves 1x independently of the chosen trigger mode');
assert.equal(durationLegacy.settings().scroll.heroScrollDuration, 1, 'An absent hero duration also preserves the old 1x shrink distance');
durationLegacy.controllers.scroll.resetSettings();
assert.equal(durationLegacy.settings().scroll.aboutScrollDuration, 2.5, 'Reset returns the live scroll duration to 2.5x');
assert.equal(durationLegacy.settings().scroll.heroScrollDuration, 1, 'Reset returns the hero shrink scroll duration to the unchanged 1x default');
assert(durationLegacy.presets().find(option => option.value === durationLegacy.selected()).textContent.includes('Изменён'), 'Reset marks a legacy 1x preset edited without overwriting it');
assert(!Object.hasOwn(durationLegacy.catalog()[0].scroll, 'aboutScrollDuration'), 'Reset leaves the old saved record without an injected duration field');
assert(!Object.hasOwn(durationLegacy.catalog()[0].scroll, 'heroScrollDuration'), 'Reset does not inject a hero duration into the old saved record');

for (const duration of [1, 2.5, 3]) {
  const record = {...legacy, id: `hero-duration-${duration}`, scroll: {heroScrollDuration: duration, aboutScrollDuration: 1.7}};
  const durationPage = makePage({storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [record]})]])});
  durationPage.select(record.id);
  assert.equal(durationPage.settings().scroll.heroScrollDuration, duration, 'An explicit hero duration survives restore at both supported bounds and an intermediate value');
  assert.equal(durationPage.settings().scroll.aboutScrollDuration, 1.7, 'Changing hero duration cannot replace an independently saved about duration');
  assert.equal(durationPage.writes.length, 0, 'Applying a hero duration leaves catalog storage untouched');
}
const heroDurationOnlyRecord = {...legacy, id: 'hero-duration-only', scroll: {heroScrollDuration: 2.5}};
const heroDurationOnly = makePage({storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [heroDurationOnlyRecord]})]])});
heroDurationOnly.select(heroDurationOnlyRecord.id);
assert.equal(heroDurationOnly.settings().scroll.heroScrollDuration, 2.5, 'An explicit new hero duration is preserved when an older about duration is absent');
assert.equal(heroDurationOnly.settings().scroll.aboutScrollDuration, 1, 'An absent about duration still receives its independent legacy 1x fallback');

for (const [id, scroll, expectedMode, expectedGap] of [
  ['own-portrait', {aboutTriggerMode: 'portrait'}, 'portrait', 100],
  ['own-viewport', {aboutTriggerMode: 'viewport'}, 'viewport', 100],
  ['gap-without-mode', {aboutTriggerGapPx: 260}, 'viewport', 260],
  ['own-zero-gap', {aboutTriggerMode: 'portrait', aboutTriggerGapPx: 0}, 'portrait', 0],
  ['own-max-gap', {aboutTriggerMode: 'portrait', aboutTriggerGapPx: 400}, 'portrait', 400],
]) {
  const record = {...legacy, id, scroll};
  const triggerPage = makePage({storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [record]})]])});
  triggerPage.select(id);
  assert.equal(triggerPage.settings().scroll.aboutTriggerMode, expectedMode, 'Only an absent own trigger mode receives legacy viewport compatibility');
  assert.equal(triggerPage.settings().scroll.aboutTriggerGapPx, expectedGap, 'Explicit and default gaps survive preset preparation independently of trigger mode');
  assert.equal(triggerPage.writes.length, 0, 'Trigger compatibility is computed without rewriting saved records');
}

const corruptInputs = ['{broken', 'null', '[]', '42', JSON.stringify({version: 99, presets: [legacy]}), JSON.stringify({version: 1, presets: 'bad'}), ' '.repeat(256 * 1024 + 1)];
for (const raw of corruptInputs) {
  const corrupt = makePage({storage: new Map([[presetKey, raw]])});
  assert.equal(corrupt.presets().length, 0, 'An invalid or oversized storage document is ignored safely');
  assert.equal(corrupt.controllers.depth.calls.length + corrupt.controllers.scroll.calls.length, 0, 'Corrupt catalogs never partially apply an effect');
  assert.deepEqual(corrupt.settings(), {depth: corrupt.depthDefaults, scroll: corrupt.scrollDefaults}, 'Corrupt storage leaves both live controllers unchanged');
  assert.equal(corrupt.writes.length, 0, 'Reading corrupt storage never overwrites the original catalog');
  assert.equal(corrupt.storage.get(presetKey), raw, 'Corrupt source data remains recoverable until an explicit save');
  assert(corrupt.status().trim(), 'Corrupt storage is reported visibly');
}

const validRecord = {...legacy, depth: {...originalDefaults.depthDefaults}, scroll: {...originalDefaults.scrollDefaults}};
const badRecords = [
  null, [], 'bad', {...validRecord, id: ''}, {...validRecord, name: ''},
  {...validRecord, depth: null}, {...validRecord, scroll: []},
  {...validRecord, depth: {...validRecord.depth, enabled: 'true'}},
  {...validRecord, scroll: {...validRecord.scroll, whiteAt: '0.5'}},
  {...validRecord, scroll: {...validRecord.scroll, aboutBackgroundDuration: null}},
  {...validRecord, scroll: {...validRecord.scroll, aboutFadeGuide: 1}},
  {...validRecord, scroll: {...validRecord.scroll, aboutFlightVariant: 'third'}},
  {...validRecord, scroll: {...validRecord.scroll, aboutFadeShape: 'triangle'}},
  {...validRecord, scroll: {...validRecord.scroll, aboutFadeOrigin: 'pointer'}},
  {...validRecord, scroll: {...validRecord.scroll, aboutTriggerMode: 'automatic'}},
  {...validRecord, scroll: {...validRecord.scroll, aboutTriggerMode: null}},
  {...validRecord, scroll: {...validRecord.scroll, aboutTriggerGapPx: '100'}},
  {...validRecord, scroll: {...validRecord.scroll, aboutTriggerGapPx: null}},
  {...validRecord, scroll: {...validRecord.scroll, aboutScrollDuration: '2.5'}},
  {...validRecord, scroll: {...validRecord.scroll, aboutScrollDuration: null}},
  {...validRecord, scroll: {...validRecord.scroll, aboutScrollDuration: .99}},
  {...validRecord, scroll: {...validRecord.scroll, aboutScrollDuration: 3.01}},
  {...validRecord, scroll: {...validRecord.scroll, heroScrollDuration: '2.5'}},
  {...validRecord, scroll: {...validRecord.scroll, heroScrollDuration: null}},
  {...validRecord, scroll: {...validRecord.scroll, heroScrollDuration: .99}},
  {...validRecord, scroll: {...validRecord.scroll, heroScrollDuration: 3.01}},
];
for (const record of badRecords) {
  const corrupt = makePage({storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [record]})]])});
  assert.equal(corrupt.presets().length, 0, 'Malformed records and setting types cannot become selectable presets');
  assert.equal(corrupt.controllers.depth.calls.length + corrupt.controllers.scroll.calls.length, 0, 'Malformed owners are rejected together before any setSettings call');
}
const mixedRecords = makePage({storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [null, validRecord, {...validRecord, id: 'second-valid', name: 'Другой'}, {...validRecord, name: 'Повтор id'}]})]])});
assert.deepEqual(mixedRecords.presets().map(option => option.value), [validRecord.id, 'second-valid'], 'Invalid records and duplicate IDs are skipped without losing valid catalog entries');
assert(mixedRecords.status().trim(), 'Partly unreadable catalogs announce that some entries were skipped');

const ordinaryUnknown = {...validRecord, depth: {...validRecord.depth, unknownDepth: 9}, scroll: {...validRecord.scroll, unknownScroll: 9}};
const filtered = makePage({storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [ordinaryUnknown]})]])});
assert.equal(filtered.presets().length, 1, 'Unknown scalar keys do not discard an otherwise usable legacy profile');
filtered.select(validRecord.id);
assert.deepEqual(Object.keys(filtered.controllers.depth.calls.at(-1)).sort(), Object.keys(filtered.depthDefaults).sort(), 'Depth apply uses the explicit controller key set only');
assert.deepEqual(Object.keys(filtered.controllers.scroll.calls.at(-1)).sort(), Object.keys(filtered.scrollDefaults).sort(), 'Scroll apply uses the explicit controller key set only');
const dangerous = JSON.parse(JSON.stringify({version: 1, presets: [validRecord]}));
dangerous.presets[0].depth = JSON.parse('{"strength":2.25,"__proto__":{"enabled":false},"constructor":{"prototype":{"polluted":true}},"unknownDepth":9}');
dangerous.presets[0].scroll = JSON.parse('{"whiteAt":0.57,"__proto__":{"aboutBackgroundDuration":99},"constructor":{"prototype":{"polluted":true}},"unknownScroll":9}');
const rejectedPrototype = makePage({storage: new Map([[presetKey, JSON.stringify(dangerous)]])});
assert.equal(rejectedPrototype.presets().length, 0, 'Reserved prototype keys are rejected before a record becomes selectable');
assert.equal(rejectedPrototype.controllers.depth.calls.length + rejectedPrototype.controllers.scroll.calls.length, 0, 'Prototype keys never reach either controller');
assert.equal(rejectedPrototype.settings().depth.enabled, true, 'An own __proto__ key cannot inject inherited depth settings');
assert.equal(rejectedPrototype.settings().scroll.aboutBackgroundDuration, .45, 'An own __proto__ key cannot inject inherited scroll settings');
assert.equal({}.polluted, undefined, 'Restoring a catalog cannot pollute shared object prototypes');

const changedSchema = makePage({storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [validRecord]})]])});
changedSchema.scrollDefaults.whiteAt = 'new-type';
const schemaBefore = changedSchema.settings();
changedSchema.select(validRecord.id);
assert.equal(changedSchema.controllers.depth.calls.length + changedSchema.controllers.scroll.calls.length, 0, 'Both owners are prepared before either applies when a live schema becomes incompatible');
assert.deepEqual(changedSchema.settings(), schemaBefore, 'A schema incompatibility leaves both live owners unchanged');

const rollback = makePage();
rollback.save('Обычный');
const rollbackPreset = clone(rollback.catalog());
const beforeFailedApply = differentSettings(rollback);
rollback.options.failNextApply = {scroll: 1};
rollback.select(rollbackPreset[0].id);
assert.deepEqual(rollback.settings(), beforeFailedApply, 'An unexpected second-owner apply failure restores both prior live snapshots');
assert.deepEqual(rollback.catalog(), rollbackPreset, 'An apply failure cannot change the saved profile');
assert(rollback.status().includes('Не удалось'), 'An unexpected apply failure has explicit status feedback');
rollback.select(rollbackPreset[0].id);
assert.deepEqual(rollback.settings(), {depth: rollback.depthDefaults, scroll: rollback.scrollDefaults}, 'A transient apply failure can be retried successfully');

const quota = makePage();
quota.save('До ошибки');
const quotaBefore = clone(quota.catalog()), quotaSelected = quota.selected();
quota.options.writeFails = true;
quota.save('Не сохранится');
assert.deepEqual(quota.catalog(), quotaBefore, 'A failed save leaves persisted catalog unchanged');
assert.equal(quota.presets().length, 1, 'A failed save does not commit an in-memory ghost');
assert.equal(quota.selected(), quotaSelected, 'A failed save retains the prior selected identity');
assert(quota.status().trim(), 'Storage write failure is reported visibly');
quota.controllers.scroll.setSettings({aboutBackgroundStart: .62});
quota.click('[data-preset-update]');
assert.deepEqual(quota.catalog(), quotaBefore, 'A failed update does not overwrite the stored profile');
quota.select(quotaSelected);
assert.equal(quota.settings().scroll.aboutBackgroundStart, .32, 'A failed update leaves the in-memory saved snapshot intact');
quota.click('[data-preset-delete]');
assert.equal(quota.presets().length, 1, 'A failed delete leaves the catalog entry visible');
assert.deepEqual(quota.catalog(), quotaBefore, 'A failed delete leaves persisted catalog intact');
quota.options.writeFails = false;
quota.click('[data-preset-delete]');
const emptyCatalog = clone(quota.catalog());
quota.options.writeFails = true;
quota.click('[data-preset-undo]');
assert.deepEqual(quota.catalog(), emptyCatalog, 'A failed undo does not partially restore a catalog');
assert.equal(quota.presets().length, 0, 'A failed undo does not leave a ghost option');
quota.options.writeFails = false;
quota.click('[data-preset-undo]');
assert.deepEqual(quota.catalog(), quotaBefore, 'Undo can be retried successfully after storage recovers');

const blocked = makePage({readFails: true, writeFails: true});
blocked.save('Заблокировано');
assert.equal(blocked.presets().length, 0, 'Unavailable storage does not prevent the page or create unsaved profiles');
assert(blocked.status().trim(), 'Unavailable storage has visible feedback');

const lines = makePage({withBackground: true});
lines.controllers.background.setSettings({enabled: false, mode: 'light', hoverStrength: .62, rippleStrength: .81, radius: 245});
lines.save('Свет линий');
const linePreset = clone(lines.catalog()[0]);
assert.deepEqual(linePreset.background, lines.settings().background, 'New presets capture every background-line setting alongside the existing owners');
lines.controllers.background.setSettings({enabled: true, hoverStrength: .1});
assert(lines.presets()[0].textContent.includes('Изменён'), 'Line settings changes mark a selected preset dirty');
assert.deepEqual(lines.catalog()[0], linePreset, 'Editing live lines cannot overwrite a saved snapshot');
lines.select(linePreset.id);
assert.deepEqual(lines.settings().background, linePreset.background, 'Selecting a preset restores line settings including its enable switch');
assert.equal(lines.settings().depth.enabled, true, 'Turning off line effects does not turn off the portrait');

const oldLines = makePage({withBackground: true, storage: new Map([[presetKey, legacyRaw]]), background: {enabled: false, radius: 300}});
oldLines.select(legacy.id);
assert.deepEqual(oldLines.settings().background, oldLines.backgroundDefaults, 'An old preset without line settings uses the line defaults');
assert.equal(oldLines.storage.get(presetKey), legacyRaw, 'Applying an older preset keeps its stored bytes unchanged');
assert.equal(oldLines.writes.length, 0, 'Missing background settings do not cause an automatic catalog migration');

const legacyLights = {...legacy, background: {enabled: false, hoverStrength: .62, rippleStrength: .81, radius: 245}};
const legacyLightRaw = JSON.stringify({version: 1, presets: [legacyLights]});
const legacyLightPage = makePage({withBackground: true, storage: new Map([[presetKey, legacyLightRaw]])});
legacyLightPage.select(legacy.id);
assert.deepEqual(legacyLightPage.settings().background, {...legacyLightPage.backgroundDefaults, ...legacyLights.background, mode: 'light'}, 'A stored background object from before deformation retains its lighting behavior');
assert.equal(legacyLightPage.storage.get(presetKey), legacyLightRaw, 'Lighting compatibility does not rewrite the saved catalog');
assert.equal(oldLines.settings().background.mode, 'distortion', 'A profile with no background object receives the newly requested deformation default');
for (const mode of ['distortion', 'light']) {
  const modePage = makePage({withBackground: true});
  modePage.controllers.background.setSettings({mode}); modePage.save(mode);
  const record = clone(modePage.catalog()[0]);
  modePage.controllers.background.setSettings({mode: mode === 'distortion' ? 'light' : 'distortion'});
  assert(modePage.presets()[0].textContent.includes('Изменён'), 'Switching between lighting and deformation marks a saved preset dirty');
  modePage.select(record.id);
  assert.equal(modePage.settings().background.mode, mode, 'Both background modes survive save and restore');
}

const lineRollback = makePage({withBackground: true});
lineRollback.save('Три эффекта');
differentSettings(lineRollback);
lineRollback.controllers.background.setSettings({enabled: false, radius: 310});
const beforeLineFailure = lineRollback.settings();
lineRollback.options.failNextApply = {background: 1};
lineRollback.select(lineRollback.catalog()[0].id);
assert.deepEqual(lineRollback.settings(), beforeLineFailure, 'A third-owner apply failure restores all three prior live snapshots');
assert(lineRollback.status().includes('Не удалось'), 'A background apply failure is visible');

for (const background of [null, [], {enabled: 'true'}, {mode: 'liquid'}, {mode: null}, {ambientDirection: 'diagonal'}, {ambientEnabled: 'true'}, {ambientStrength: -.01}, {ambientStrength: 1.01}, {ambientSpeed: .049}, {ambientSpeed: 1.01}, {hoverStrength: 1.1}, {rippleStrength: -.1}, {radius: 321}, {radius: 59}]) {
  const badLineProfile = {...validRecord, background};
  const invalidLines = makePage({withBackground: true, storage: new Map([[presetKey, JSON.stringify({version: 1, presets: [badLineProfile]})]])});
  assert.equal(invalidLines.presets().length, 0, 'Invalid background types and out-of-range values cannot become selectable presets');
  assert(Object.values(invalidLines.controllers).every(api => api.calls.length === 0), 'Malformed background records cannot partially apply any effect');
}

const ambientProfiles = makePage({withBackground: true});
assert.equal(ambientProfiles.backgroundDefaults.ambientEnabled, true, 'Fresh background defaults enable the requested ambient motion');
assert.equal(ambientProfiles.backgroundDefaults.ambientDirection, 'up', 'Fresh ambient motion starts upward');
assert.equal(ambientProfiles.backgroundDefaults.ambientStrength, .3, 'Fresh motion intensity is 30 percent');
assert.equal(ambientProfiles.backgroundDefaults.ambientSpeed, .35, 'Fresh motion speed is 35 percent');
for (const [index, ambientDirection] of ['up', 'down', 'left', 'right'].entries()) {
  const profile = makePage({withBackground: true});
  const ambient = {ambientEnabled: index % 2 === 0, ambientDirection, ambientStrength: index % 2 ? 1 : 0, ambientSpeed: index % 2 ? 1 : .05};
  profile.controllers.background.setSettings(ambient); profile.save(ambientDirection);
  const saved = clone(profile.catalog()[0]);
  for (const [key,value] of Object.entries(ambient)) assert.equal(saved.background[key], value, 'Every ambient setting joins the full immutable preset');
  profile.controllers.background.setSettings({ambientEnabled: !ambient.ambientEnabled, ambientDirection: ambientDirection === 'up' ? 'down' : 'up', ambientStrength: .61, ambientSpeed: .72});
  assert(profile.presets()[0].textContent.includes('Изменён'), 'Editing ambient movement marks the selected preset modified');
  assert.deepEqual(profile.catalog()[0], saved, 'Live ambient motion changes do not rewrite the saved variant');
  profile.select(saved.id);
  for (const [key,value] of Object.entries(ambient)) assert.equal(profile.settings().background[key], value, 'Ambient enable, direction and endpoints restore independently');
}
// New tuning fields participate in presets while old records receive defaults.
const tuning = makePage();
assert.equal(tuning.scrollDefaults.inspirationCardDurationMs,800);
assert.equal(tuning.scrollDefaults.aboutFillFeather,.7);
assert.equal(tuning.scrollDefaults.musicActivity,1.35);
tuning.controllers.scroll.setSettings({inspirationCardDurationMs:500,aboutFillFeather:1.4,musicActivity:2.25});
tuning.save('Темп и мягкость');
const tuningPreset=clone(tuning.catalog()[0]);
tuning.controllers.scroll.setSettings({inspirationCardDurationMs:1500,aboutFillFeather:.2,musicActivity:.5});
assert(tuning.presets()[0].textContent.includes('Изменён'));
tuning.select(tuningPreset.id);
for(const key of ['inspirationCardDurationMs','aboutFillFeather','musicActivity'])assert.equal(tuning.settings().scroll[key],tuningPreset.scroll[key],'Tuning values restore with a named preset');
const oldTuning=clone(tuningPreset);
for(const key of ['inspirationCardDurationMs','aboutFillFeather','musicActivity'])delete oldTuning.scroll[key];
const oldTuningRaw=JSON.stringify({version:1,presets:[oldTuning]});
const oldTuningPage=makePage({storage:new Map([[presetKey,oldTuningRaw]])});oldTuningPage.select(oldTuning.id);
for(const key of ['inspirationCardDurationMs','aboutFillFeather','musicActivity'])assert.equal(oldTuningPage.settings().scroll[key],oldTuningPage.scrollDefaults[key],'Older presets receive new tuning defaults');
assert.equal(oldTuningPage.storage.get(presetKey),oldTuningRaw,'Applying an old tuning profile never rewrites it');
for(const patch of [{inspirationCardDurationMs:349},{inspirationCardDurationMs:1801},{aboutFillFeather:.19},{aboutFillFeather:1.51},{musicActivity:.49},{musicActivity:2.51}]){
 const bad=clone(tuningPreset);Object.assign(bad.scroll,patch);
 const rejected=makePage({storage:new Map([[presetKey,JSON.stringify({version:1,presets:[bad]})]])});
 assert.equal(rejected.presets().length,0,'Out-of-range tuning is rejected before touching effects');
 assert(Object.values(rejected.controllers).every(api=>api.calls.length===0));
}
console.log('Preset checks passed: complete immutable snapshots with portrait trigger/gap, explicit legacy viewport compatibility without storage rewrite, updates/modified markers, safe unique names and limits, reload/migration, deletion/undo, malformed/prototype filtering and atomic storage-failure recovery.');
