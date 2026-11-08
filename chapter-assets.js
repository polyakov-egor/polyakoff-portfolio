/* Explicit prefetch for the pinned scroll chapters. No background RAF loop. */
(() => {
  'use strict';
  if (window.ChapterAssets) return;
  const assets = Object.freeze({
    people: ['inspiration', 'inspiration/people.png', 768, 1280],
    'music-base': ['inspiration', 'inspiration/music-base.png', 768, 1280],
    'music-overlay': ['inspiration', 'inspiration/music-overlay.png', 768, 1280],
    detail: ['inspiration', 'inspiration/detail.png', 768, 1280],
    'work-amonra': ['works', 'works/01-amonra.png', 1024, 2048],
    'work-hermes': ['works', 'works/02-hermes.png', 1024, 2048],
    'work-suborbia': ['works', 'works/03-suborbia.png', 1024, 2048],
    'work-skynews': ['works', 'works/04-skynews.png', 1024, 2048],
    'work-youtube-music': ['works', 'works/05-youtube-music.png', 1024, 2048],
    'work-itsme': ['works', 'works/06-itsme.png', 1024, 2048],
    'services-web': ['services', 'optimized/music-overlay-1280.webp', 768, 1280, 'music-overlay'],
    'services-app': ['services', 'optimized/services-app-1280.webp', 768, 1280],
    'services-motion': ['services', 'optimized/music-base-1280.webp', 768, 1280, 'music-base'],
    'footer-background': ['services', 'optimized/footer-background-2560.webp', 1440, 2560],
    'footer-portrait': ['services', 'optimized/footer-portrait-392.webp', 256, 392],
  });
  const stages = new Map(['inspiration', 'works', 'services'].map(name => [name,
    { name, started: false, ready: false, failed: false, version: 0, tasks: [], prepares: new Set(), promise: null }]));
  const imageStates = new WeakMap();
  const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const small = () => (document.documentElement?.clientWidth || window.innerWidth || 1024) < 600;
  let phone = small();
  function source(key) {
    const entry = assets[key];
    return entry ? `./assets/images/optimized/${entry[4] || key}-${entry[phone ? 2 : 3]}.webp` : '';
  }
  function status(stage, state) {
    document.documentElement?.setAttribute(`data-assets-${stage.name}`, state);
  }
  function loadImage(image, key) {
    const entry = assets[key], url = source(key);
    if (!entry || image.dataset.chapterSource === url) return null;
    image.dataset.chapterSource = url;
    const state = { ready: false };
    imageStates.set(image, state);
    image.decoding = 'async';
    image.loading = 'eager';
    image.fetchPriority = 'low';
    return new Promise(resolve => {
      let settled = false, fallback = false;
      const done = () => {
        if (settled) return;
        settled = true;
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', failed);
        const ready = Boolean(image.naturalWidth);
        // complete/naturalWidth can precede an async decode. Timed cards must
        // not spend their animation while their target is still unpaintable.
        if (imageStates.get(image) === state) {
          state.ready = ready;
          window.dispatchEvent?.(new CustomEvent('chapter-assets:image-ready', { detail: { chapter: entry[0], key } }));
        }
        resolve(ready);
      };
      const loaded = () => {
        if (typeof image.decode === 'function') image.decode().then(done, done);
        else done();
      };
      const failed = () => {
        if (!fallback) {
          fallback = true;
          image.src = `./assets/images/${entry[1]}`;
        } else done();
      };
      image.addEventListener('load', loaded);
      image.addEventListener('error', failed);
      image.src = url;
      if (image.complete && image.naturalWidth) loaded();
    });
  }
  function hydrate(stage) {
    for (const image of document.querySelectorAll('[data-chapter-image]')) {
      const key = image.dataset.chapterImage;
      if (assets[key]?.[0] !== stage.name) continue;
      const task = loadImage(image, key);
      if (task) { stage.tasks.push(task); stage.version++; }
    }
  }
  function settle(stage) {
    const version = stage.version;
    return Promise.allSettled(stage.tasks).then(results => {
      if (version !== stage.version) return settle(stage);
      stage.failed = results.some(result => result.status === 'rejected' || result.value === false);
      stage.ready = true;
      status(stage, stage.failed ? 'fallback' : 'ready');
      window.dispatchEvent?.(new CustomEvent('chapter-assets:ready', { detail: { chapter: stage.name } }));
      return !stage.failed;
    });
  }
  function prepare(stage, callback) {
    if (callback.ran) return;
    callback.ran = true;
    try { stage.tasks.push(Promise.resolve(callback.run())); }
    catch (error) { stage.tasks.push(Promise.reject(error)); }
    stage.version++;
  }
  function ensure(name) {
    const stage = stages.get(name);
    if (!stage) return Promise.resolve(false);
    if (!stage.started) {
      stage.started = true;
      status(stage, 'loading');
      hydrate(stage);
      for (const callback of stage.prepares) prepare(stage, callback);
      stage.promise = settle(stage);
    }
    return stage.promise;
  }
  function register(name, run) {
    const stage = stages.get(name);
    if (!stage) return;
    const callback = typeof run === 'function' ? { run, ran: false } : null;
    if (callback) stage.prepares.add(callback);
    if (stage.started) {
      stage.ready = false;
      status(stage, 'loading');
      hydrate(stage);
      if (callback) prepare(stage, callback);
      stage.promise = settle(stage);
    }
  }
  function update({ distance = 0, requestedDistance = distance, morphDistance = Infinity,
    inspirationStart = Infinity, worksStart = Infinity, servicesStart = Infinity, height = 1, reducedMotion = false } = {}) {
    const nextPhone = small();
    if (nextPhone !== phone) {
      phone = nextPhone;
      for (const stage of stages.values()) if (stage.started) {
        stage.ready = false;
        status(stage, 'loading');
        hydrate(stage);
        stage.promise = settle(stage);
      }
    }
    if (reducedMotion || reduce?.matches) { ensure('inspiration'); ensure('works'); ensure('services'); return; }
    const ahead = Math.max(distance, requestedDistance);
    if (ahead >= morphDistance - Math.max(1, height) * .35) ensure('inspiration');
    // Start the next GPU chapter after Inspiration is entered, well before its
    // closing heading. A history jump directly to Works takes both paths.
    if (ahead >= Math.min(inspirationStart + Math.max(1, height) * .4, worksStart - Math.max(1, height) * 1.5)) {
      ensure('inspiration'); ensure('works');
    }
    // Decode the service planes and closing screen before their upward entrance.
    if (ahead >= servicesStart - Math.max(1, height) * 1.5) ensure('services');
  }
  window.ChapterAssets = Object.freeze({ source, ensure, register, update,
    isImageReady: image => imageStates.get(image)?.ready ?? Boolean(image.complete && image.naturalWidth > 0),
    getStatus: name => {
      const stage = stages.get(name);
      return stage ? { started: stage.started, ready: stage.ready, failed: stage.failed } : null;
    } });
  document.addEventListener?.('DOMContentLoaded', () => {
    if (reduce?.matches) { ensure('inspiration'); ensure('works'); ensure('services'); }
  }, { once: true });
})();
