/* Static inspiration content from Figma. Scroll geometry is owned separately. */
(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  const scene = hero?.querySelector('.hero__scene');
  if (!hero || !scene || document.querySelector('.inspiration')) return;

  const entries = [
    { word: 'people', title: 'CREATIVE MINDS', subtitle: '10 PEOPLE & STUDIOS', icon: 'heart', images: ['people.png'] },
    { word: 'music', title: 'WORK PLAYLIST', subtitle: '10 ARTISTS', icon: 'note', images: ['music-base.png', 'music-overlay.png'] },
    { word: 'detail', title: 'FOUND DETAILS', subtitle: 'and OBJECTS', icon: 'eye', images: ['detail.png'] }
  ];
  const root = document.createElement('section');
  root.className = 'inspiration';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('aria-labelledby', 'inspiration-title');
  root.innerHTML = `
    <div class="inspiration__backdrop" aria-hidden="true">
      <div class="inspiration__backdrop-art">
        <img class="inspiration__lines" src="./assets/images/backgrounds/light.webp" width="2560" height="1305" alt="" draggable="false" />
      </div>
    </div>
    <div class="inspiration__flip-front" aria-hidden="true">
      <picture class="hero__portrait-source">
        <source media="(max-width: 1099px)" srcset="./assets/images/hero/portrait-1280.webp" />
        <img src="./assets/images/hero/portrait-2456.webp" alt="" draggable="false" />
      </picture>
    </div>
    <h2 class="visually-hidden" id="inspiration-title">Inspiration</h2>
    <p class="inspiration__eyebrow mono" aria-hidden="true">Inspiration</p>
    <p class="inspiration__heading inspiration__heading--left inspiration__head-left">
      <span class="inspiration__lead">Attention to</span>
      <span class="inspiration__words">${entries.map((entry, index) => `<span class="inspiration__word" data-inspiration-word="${index}" aria-hidden="${index !== 0}">${entry.word}</span>`).join('')}</span>
    </p>
    <p class="inspiration__heading inspiration__heading--right inspiration__head-right">sparks inspiration</p>
    <div class="inspiration__cards">
      ${entries.map((entry, index) => `
        <article class="inspiration__card inspiration__card--${entry.word}" data-inspiration-card="${index}" aria-hidden="${index !== 0}">
          <div class="inspiration__media" aria-hidden="true">
            ${entry.images.map((file, layer) => `<img class="inspiration__image${index === 0 ? ' inspiration__image--people' : ''}${layer ? ' inspiration__image--overlay' : ''}" data-chapter-image="${file.replace(/\.png$/, '')}"${window.ChapterAssets ? '' : ` src="./assets/images/inspiration/${file}"`} alt="" decoding="async" draggable="false" />`).join('')}
          </div>
          <img class="inspiration__kind" src="./assets/icons/inspiration/${entry.icon}.svg" width="16" height="16" alt="" draggable="false" />
          <div class="inspiration__glass">
            <div class="inspiration__card-copy mono">
              <p class="inspiration__card-title">${entry.title}</p>
              <p class="inspiration__card-subtitle">${entry.subtitle}</p>
            </div>
            <img class="inspiration__plus" src="./assets/icons/inspiration/plus.svg" width="16" height="16" alt="" draggable="false" />
          </div>
        </article>`).join('')}
    </div>
    <p class="inspiration__counter mono" aria-hidden="true"><span data-inspiration-index>01</span> - 03</p>
  `;
  scene.insertAdjacentElement('afterend', root);
  window.ChapterAssets?.register('inspiration');

  window.InspirationView = Object.freeze({
    root,
    backdrop: root.querySelector('.inspiration__backdrop'),
    lines: root.querySelector('.inspiration__lines'),
    flipFront: root.querySelector('.inspiration__flip-front'),
    cards: Object.freeze([...root.querySelectorAll('[data-inspiration-card]')]),
    words: Object.freeze([...root.querySelectorAll('[data-inspiration-word]')]),
    wordGroup: root.querySelector('.inspiration__words'),
    headingLeft: root.querySelector('.inspiration__heading--left'),
    headingRight: root.querySelector('.inspiration__heading--right'),
    eyebrow: root.querySelector('.inspiration__eyebrow'),
    counter: root.querySelector('.inspiration__counter'),
    index: root.querySelector('[data-inspiration-index]')
  });
})();
