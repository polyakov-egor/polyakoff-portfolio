/* Local tuning controls. Each effect owns its values and storage. */
(() => {
  'use strict';
  const effect = window.HeroDepthEffect;
  const scrollEffect = window.HeroScrollEffect;
  const backgroundEffect = window.BackgroundLineEffect;
  if (!effect || !scrollEffect || document.querySelector('[data-effect-controls]')) return;

  const controls = document.createElement('div');
  controls.className = 'effect-controls';
  controls.hidden = true;
  controls.dataset.effectControls = '';
  controls.lang = 'ru';
  controls.innerHTML = `
    <button class="effect-controls__toggle" type="button" aria-expanded="false" aria-controls="hero-effect-panel">
      <span>Эффект</span><span class="effect-controls__toggle-mark" aria-hidden="true">+</span>
    </button>
    <aside class="effect-controls__panel" id="hero-effect-panel" aria-labelledby="hero-effect-panel-title" hidden>
      <div class="effect-controls__heading">
        <h2 id="hero-effect-panel-title">Настройки эффектов</h2>
        <span class="effect-controls__dot" aria-hidden="true"></span>
      </div>
      <details class="effect-controls__group" open>
        <summary>Темп и мягкость</summary>
        <div class="effect-controls__fields">
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="hero-effect-card-duration">Смена карточек</label><output for="hero-effect-card-duration" data-effect-output="inspirationCardDurationMs">0.80 с</output></div>
            <input id="hero-effect-card-duration" data-effect-setting="inspirationCardDurationMs" data-effect-owner="scroll" type="range" min="350" max="1800" step="50" value="800" />
            <small class="effect-controls__hint">Меньше — быстрее, больше — плавнее.</small>
          </div>
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="hero-effect-reveal-mode">Переход фона</label></div>
            <select class="effect-controls__select" id="hero-effect-reveal-mode" data-effect-owner="scroll" data-effect-select="aboutRevealMode">
              <option value="gradient">Простой градиент снизу вверх</option>
              <option value="wave">Засвет снизу вверх</option>
              <option value="radial">Расширяющийся засвет</option>
            </select>
          </div>
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="hero-effect-reveal-scroll-duration">Длительность перехода фона</label><output for="hero-effect-reveal-scroll-duration" data-effect-output="aboutRevealScrollDuration">1.80×</output></div>
            <input id="hero-effect-reveal-scroll-duration" data-effect-setting="aboutRevealScrollDuration" data-effect-owner="scroll" type="range" min="1" max="3" step="0.1" value="1.8" />
            <small class="effect-controls__hint">1× — прежний темп, 3× — втрое больше прокрутки для смены фона.</small>
          </div>
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="hero-effect-fill-feather">Мягкость границы фона</label><output for="hero-effect-fill-feather" data-effect-output="aboutFillFeather">70%</output></div>
            <input id="hero-effect-fill-feather" data-effect-setting="aboutFillFeather" data-effect-owner="scroll" type="range" min="0.2" max="1.5" step="0.05" value="0.7" />
          </div>
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="hero-effect-music-activity">Активность эквалайзера</label><output for="hero-effect-music-activity" data-effect-output="musicActivity">1.35×</output></div>
            <input id="hero-effect-music-activity" data-effect-setting="musicActivity" data-effect-owner="scroll" type="range" min="0.5" max="2.5" step="0.05" value="1.35" />
          </div>
        </div>
      </details>
      <details class="effect-controls__group" data-background-controls hidden>
        <summary>Линии фона</summary>
        <div class="effect-controls__fields">
          <label class="effect-controls__fade" for="background-lines-enabled">
            <span>Интерактивные линии</span>
            <input id="background-lines-enabled" data-effect-owner="background" type="checkbox" checked />
          </label>
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="background-lines-mode">Реакция линий</label></div>
            <select class="effect-controls__select" id="background-lines-mode" data-effect-owner="background" data-effect-select="mode">
              <option value="distortion" selected>Искажение</option>
              <option value="light">Подсветка — прежний вариант</option>
            </select>
          </div>
          <div class="effect-controls__fields" data-background-ambient>
            <label class="effect-controls__fade" for="background-lines-ambient-enabled">
              <span>Движение фона</span>
              <input id="background-lines-ambient-enabled" data-effect-owner="background" type="checkbox" checked />
            </label>
            <div class="effect-controls__field">
              <div class="effect-controls__label"><label for="background-lines-direction">Направление движения</label></div>
              <select class="effect-controls__select" id="background-lines-direction" data-effect-owner="background" data-effect-select="ambientDirection" data-background-motion-only>
                <option value="up" selected>Вверх</option>
                <option value="down">Вниз</option>
                <option value="left">Влево</option>
                <option value="right">Вправо</option>
              </select>
            </div>
            <div class="effect-controls__field">
              <div class="effect-controls__label"><label for="background-lines-ambient-strength">Интенсивность движения</label><output for="background-lines-ambient-strength" data-effect-output="ambientStrength">30%</output></div>
              <input id="background-lines-ambient-strength" data-effect-setting="ambientStrength" data-effect-owner="background" data-background-motion-only type="range" min="0" max="1" step="0.01" value="0.3" />
            </div>
            <div class="effect-controls__field">
              <div class="effect-controls__label"><label for="background-lines-ambient-speed">Скорость движения</label><output for="background-lines-ambient-speed" data-effect-output="ambientSpeed">35%</output></div>
              <input id="background-lines-ambient-speed" data-effect-setting="ambientSpeed" data-effect-owner="background" data-background-motion-only type="range" min="0.05" max="1" step="0.01" value="0.35" />
            </div>
          </div>
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="background-lines-hover">Подсветка линий</label><output for="background-lines-hover" data-effect-output="hoverStrength">35%</output></div>
            <input id="background-lines-hover" data-effect-setting="hoverStrength" data-effect-owner="background" type="range" min="0" max="1" step="0.01" value="0.35" />
          </div>
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="background-lines-ripple">Волна по клику</label><output for="background-lines-ripple" data-effect-output="rippleStrength">40%</output></div>
            <input id="background-lines-ripple" data-effect-setting="rippleStrength" data-effect-owner="background" type="range" min="0" max="1" step="0.01" value="0.4" />
          </div>
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="background-lines-radius">Радиус подсветки</label><output for="background-lines-radius" data-effect-output="radius">150 px</output></div>
            <input id="background-lines-radius" data-effect-setting="radius" data-effect-owner="background" type="range" min="60" max="320" step="5" value="150" />
          </div>
        </div>
      </details>
      <details class="effect-controls__group" open>
        <summary>Смена фона</summary>
        <div class="effect-controls__fields">
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="hero-effect-background-start">Светлый фон с</label><output for="hero-effect-background-start" data-effect-output="aboutBackgroundStart">32% разлёта</output></div>
            <input id="hero-effect-background-start" data-effect-setting="aboutBackgroundStart" data-effect-owner="scroll" type="range" min="0" max="1" step="0.01" value="0.32" />
          </div>
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="hero-effect-background-duration">Плавность смены фона</label><output for="hero-effect-background-duration" data-effect-output="aboutBackgroundDuration">45% разлёта</output></div>
            <input id="hero-effect-background-duration" data-effect-setting="aboutBackgroundDuration" data-effect-owner="scroll" type="range" min="0.05" max="1" step="0.01" value="0.45" />
          </div>
          <small class="effect-controls__hint">Больше плавность — длиннее переход при прокрутке.</small>
        </div>
      </details>
      <details class="effect-controls__group">
        <summary>Герой и переход</summary>
        <div class="effect-controls__fields">
          <div class="effect-controls__field">
            <div class="effect-controls__label"><label for="hero-effect-hero-scroll-duration">Длительность уменьшения hero</label><output for="hero-effect-hero-scroll-duration" data-effect-output="heroScrollDuration">1.00×</output></div>
            <input id="hero-effect-hero-scroll-duration" data-effect-setting="heroScrollDuration" data-effect-owner="scroll" type="range" min="1" max="3" step="0.05" value="1" aria-describedby="hero-effect-hero-scroll-duration-hint" />
            <small class="effect-controls__hint" id="hero-effect-hero-scroll-duration-hint">1× — прежняя дистанция, 3× — втрое больше прокрутки до мини-портрета.</small>
          </div>
        </div>
      <label class="effect-controls__enabled" for="hero-effect-enabled">
        <span>Эффект включен</span>
        <input id="hero-effect-enabled" type="checkbox" checked />
      </label>
      <div class="effect-controls__fields">
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-strength">Сила поворота</label><output for="hero-effect-strength" data-effect-output="strength">1.40×</output></div>
          <input id="hero-effect-strength" data-effect-setting="strength" type="range" min="0" max="3" step="0.05" value="1.4" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-smoothing">Плавность</label><output for="hero-effect-smoothing" data-effect-output="smoothingMs">240 мс</output></div>
          <input id="hero-effect-smoothing" data-effect-setting="smoothingMs" type="range" min="80" max="600" step="20" value="240" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-depth">Глубина</label><output for="hero-effect-depth" data-effect-output="depthAmount">100%</output></div>
          <input id="hero-effect-depth" data-effect-setting="depthAmount" type="range" min="0" max="2" step="0.05" value="1" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-lighting">Свет</label><output for="hero-effect-lighting" data-effect-output="lighting">20%</output></div>
          <input id="hero-effect-lighting" data-effect-setting="lighting" type="range" min="0" max="1" step="0.05" value="0.2" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-white-at">Белый фон к</label><output for="hero-effect-white-at" data-effect-output="whiteAt">22% перехода</output></div>
          <input id="hero-effect-white-at" data-effect-setting="whiteAt" data-effect-owner="scroll" type="range" min="0.05" max="0.9" step="0.01" value="0.22" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-wordmark-blur">Блюр фамилии</label><output for="hero-effect-wordmark-blur" data-effect-output="wordmarkBlur">24 px</output></div>
          <input id="hero-effect-wordmark-blur" data-effect-setting="wordmarkBlur" data-effect-owner="scroll" type="range" min="0" max="200" step="1" value="24" />
        </div>
        <label class="effect-controls__fade" for="hero-effect-wordmark-fade">
          <span>Исчезновение фамилии</span>
          <input id="hero-effect-wordmark-fade" data-effect-owner="scroll" type="checkbox" />
        </label>
      </div>
      </details>
      <details class="effect-controls__group" open>
        <summary>Анимация about</summary>
      <div class="effect-controls__fields">
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-scroll-duration">Длительность прокрутки about</label><output for="hero-effect-about-scroll-duration" data-effect-output="aboutScrollDuration">2.50×</output></div>
          <input id="hero-effect-about-scroll-duration" data-effect-setting="aboutScrollDuration" data-effect-owner="scroll" type="range" min="1" max="3" step="0.05" value="2.5" aria-describedby="hero-effect-about-scroll-duration-hint" />
          <small class="effect-controls__hint" id="hero-effect-about-scroll-duration-hint">1× — прежний темп, 3× — втрое больше прокрутки. Текст и фон замедляются вместе.</small>
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-top-blur">Блюр about сверху</label><output for="hero-effect-about-top-blur" data-effect-output="aboutTopBlur">10 px</output></div>
          <input id="hero-effect-about-top-blur" data-effect-setting="aboutTopBlur" data-effect-owner="scroll" type="range" min="0" max="40" step="1" value="10" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-flight">Разлёт about</label></div>
          <select class="effect-controls__select" id="hero-effect-about-flight" data-effect-owner="scroll" data-effect-select="aboutFlightVariant">
            <option value="first">Первая</option>
            <option value="second" selected>Вторая</option>
          </select>
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-fade-speed">Скорость фейда букв</label><output for="hero-effect-about-fade-speed" data-effect-output="aboutFadeSpeed">1.00×</output></div>
          <input id="hero-effect-about-fade-speed" data-effect-setting="aboutFadeSpeed" data-effect-owner="scroll" data-about-second-only type="range" min="0.5" max="2" step="0.05" value="1" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-trigger-mode">Запуск разлёта</label></div>
          <select class="effect-controls__select" id="hero-effect-about-trigger-mode" data-effect-owner="scroll" data-effect-select="aboutTriggerMode" data-about-second-only>
            <option value="portrait" selected>По портрету</option>
            <option value="viewport">Как раньше</option>
          </select>
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-trigger-gap">Расстояние до портрета</label><output for="hero-effect-about-trigger-gap" data-effect-output="aboutTriggerGapPx">100 px</output></div>
          <input id="hero-effect-about-trigger-gap" data-effect-setting="aboutTriggerGapPx" data-effect-owner="scroll" data-about-second-only data-trigger-portrait-only type="range" min="0" max="400" step="5" value="100" aria-describedby="hero-effect-about-trigger-gap-hint" />
          <small class="effect-controls__hint" id="hero-effect-about-trigger-gap-hint">От нижнего края портрета до верхнего края строки.</small>
        </div>
        <div class="effect-controls__field effect-controls__field--offset">
          <div class="effect-controls__label"><label for="hero-effect-about-start">Смещение старого запуска</label><output for="hero-effect-about-start" data-effect-output="aboutStartOffset">Как сейчас</output></div>
          <input id="hero-effect-about-start" data-effect-setting="aboutStartOffset" data-effect-owner="scroll" data-about-second-only data-trigger-viewport-only type="range" min="-0.5" max="0.5" step="0.01" value="0" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-word-force">Разлёт слов</label><output for="hero-effect-about-word-force" data-effect-output="aboutWordForce">1.00×</output></div>
          <input id="hero-effect-about-word-force" data-effect-setting="aboutWordForce" data-effect-owner="scroll" data-about-second-only type="range" min="0" max="3" step="0.05" value="1" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-letter-force">Разлёт букв</label><output for="hero-effect-about-letter-force" data-effect-output="aboutLetterForce">1.00×</output></div>
          <input id="hero-effect-about-letter-force" data-effect-setting="aboutLetterForce" data-effect-owner="scroll" data-about-second-only type="range" min="0" max="3" step="0.05" value="1" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-detach">Отделение букв</label><output for="hero-effect-about-detach" data-effect-output="aboutDetach">14%</output></div>
          <input id="hero-effect-about-detach" data-effect-setting="aboutDetach" data-effect-owner="scroll" data-about-second-only type="range" min="0" max="0.6" step="0.01" value="0.14" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-rotation">Вращение букв</label><output for="hero-effect-about-rotation" data-effect-output="aboutRotation">1.00×</output></div>
          <input id="hero-effect-about-rotation" data-effect-setting="aboutRotation" data-effect-owner="scroll" data-about-second-only type="range" min="0" max="2" step="0.05" value="1" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-fade-shape">Форма фейда</label></div>
          <select class="effect-controls__select" id="hero-effect-about-fade-shape" data-effect-owner="scroll" data-effect-select="aboutFadeShape" data-about-second-only>
            <option value="distance" selected>По дальности полёта</option>
            <option value="circle">Окружность</option>
            <option value="ellipse">Эллипс</option>
            <option value="linear">Горизонтальная линия</option>
            <option value="box">Прямоугольник</option>
          </select>
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-fade-origin">Центр фейда</label></div>
          <select class="effect-controls__select" id="hero-effect-about-fade-origin" data-effect-owner="scroll" data-effect-select="aboutFadeOrigin" data-about-second-only data-spatial-fade-only>
            <option value="text">Центр текста</option>
            <option value="screen" selected>Центр экрана</option>
          </select>
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-fade-boundary">Граница фейда</label><output for="hero-effect-about-fade-boundary" data-effect-output="aboutFadeBoundary">100%</output></div>
          <input id="hero-effect-about-fade-boundary" data-effect-setting="aboutFadeBoundary" data-effect-owner="scroll" data-about-second-only type="range" min="0.25" max="2" step="0.05" value="1" />
        </div>
        <div class="effect-controls__field">
          <div class="effect-controls__label"><label for="hero-effect-about-fade-softness">Мягкость фейда</label><output for="hero-effect-about-fade-softness" data-effect-output="aboutFadeSoftness">59%</output></div>
          <input id="hero-effect-about-fade-softness" data-effect-setting="aboutFadeSoftness" data-effect-owner="scroll" data-about-second-only type="range" min="0.05" max="1" step="0.01" value="0.5853658537" />
        </div>
        <div class="effect-controls__field">
          <label class="effect-controls__fade" for="hero-effect-about-fade-guide">
            <span>Показать границу фейда</span>
            <input id="hero-effect-about-fade-guide" data-effect-owner="scroll" data-about-second-only data-spatial-fade-only type="checkbox" aria-describedby="hero-effect-about-fade-guide-hint" />
          </label>
          <small class="effect-controls__hint" id="hero-effect-about-fade-guide-hint">Для пространственных форм</small>
        </div>
      </div>
      </details>
      <div class="effect-controls__actions">
        <button type="button" data-effect-reset>Сбросить</button>
        <button type="button" data-effect-hide>Скрыть <span aria-hidden="true">↗</span></button>
      </div>
    </aside>
  `;
  document.body.append(controls);

  const toggle = controls.querySelector('.effect-controls__toggle');
  const panel = controls.querySelector('.effect-controls__panel');
  const mark = controls.querySelector('.effect-controls__toggle-mark');
  const enabled = controls.querySelector('#hero-effect-enabled');
  const backgroundEnabled = controls.querySelector('#background-lines-enabled');
  const ambientEnabled = controls.querySelector('#background-lines-ambient-enabled');
  const ambientControls = controls.querySelector('[data-background-ambient]');
  controls.querySelector('[data-background-controls]').hidden = !backgroundEffect;
  const wordmarkFade = controls.querySelector('#hero-effect-wordmark-fade');
  const fadeGuide = controls.querySelector('#hero-effect-about-fade-guide');
  const fadeGuideHint = controls.querySelector('#hero-effect-about-fade-guide-hint');
  const selects = [...controls.querySelectorAll('[data-effect-select]')];
  const ranges = [...controls.querySelectorAll('[data-effect-setting]')];
  const format = {
    inspirationCardDurationMs: value => `${(Number(value) / 1000).toFixed(2)} с`,
    aboutFillFeather: value => `${Math.round(value * 100)}%`,
    aboutRevealScrollDuration: value => `${value.toFixed(2)}×`,
    musicActivity: value => `${Number(value).toFixed(2)}×`,
    strength: value => `${Number(value).toFixed(2)}×`,
    smoothingMs: value => `${Math.round(value)} мс`,
    depthAmount: value => `${Math.round(value * 100)}%`,
    lighting: value => `${Math.round(value * 100)}%`,
    whiteAt: value => `${Math.round(value * 100)}% перехода`,
    wordmarkBlur: value => `${Math.round(value)} px`,
    aboutTopBlur: value => `${Math.round(value)} px`,
    aboutScrollDuration: value => `${Number(value).toFixed(2)}×`,
    heroScrollDuration: value => `${Number(value).toFixed(2)}×`,
    aboutFadeSpeed: value => `${Number(value).toFixed(2)}×`,
    aboutStartOffset: value => value === 0 ? 'Как сейчас' : `${value < 0 ? 'Раньше' : 'Позже'} на ${Math.round(Math.abs(value) * 100)}% экрана`,
    aboutTriggerGapPx: value => `${Math.round(value)} px`,
    aboutWordForce: value => `${Number(value).toFixed(2)}×`,
    aboutLetterForce: value => `${Number(value).toFixed(2)}×`,
    aboutDetach: value => `${Math.round(value * 100)}%`,
    aboutRotation: value => `${Number(value).toFixed(2)}×`,
    aboutFadeBoundary: value => `${Math.round(value * 100)}%`,
    aboutFadeSoftness: value => `${Math.round(value * 100)}%`,
    aboutBackgroundStart: value => `${Math.round(value * 100)}% разлёта`,
    aboutBackgroundDuration: value => `${Math.round(value * 100)}% разлёта`,
    hoverStrength: value => `${Math.round(value * 100)}%`,
    rippleStrength: value => `${Math.round(value * 100)}%`,
    radius: value => `${Math.round(value)} px`,
    ambientStrength: value => `${Math.round(value * 100)}%`,
    ambientSpeed: value => `${Math.round(value * 100)}%`,
  };

  function setOpen(open, returnFocus = false) {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    mark.textContent = open ? '−' : '+';
    controls.classList.toggle('is-open', open);
    if (!open && returnFocus) toggle.focus();
  }

  function syncAvailability(input, settings, backgroundSettings) {
    const triggerMode = settings.aboutTriggerMode || 'portrait';
    input.disabled = (input.hasAttribute('data-about-second-only') && settings.aboutFlightVariant === 'first')
      || (input.hasAttribute('data-spatial-fade-only') && settings.aboutFadeShape === 'distance')
      || (input.hasAttribute('data-trigger-portrait-only') && triggerMode !== 'portrait')
      || (input.hasAttribute('data-trigger-viewport-only') && triggerMode !== 'viewport')
      || (input.hasAttribute('data-background-motion-only') && (backgroundSettings?.mode === 'light' || !backgroundSettings?.ambientEnabled));
    input.closest('.effect-controls__field').classList.toggle('is-disabled', input.disabled);
  }

  function sync() {
    const settings = { ...effect.getSettings(), ...scrollEffect.getSettings() };
    const backgroundSettings = backgroundEffect?.getSettings();
    enabled.checked = settings.enabled;
    backgroundEnabled.checked = Boolean(backgroundSettings?.enabled);
    const distortion = backgroundSettings?.mode !== 'light';
    ambientControls.hidden = !distortion;
    ambientEnabled.checked = Boolean(backgroundSettings?.ambientEnabled);
    controls.querySelector('label[for="background-lines-hover"]').textContent = distortion ? 'Подъём линий' : 'Подсветка линий';
    controls.querySelector('label[for="background-lines-ripple"]').textContent = distortion ? 'Импульс по клику' : 'Волна по клику';
    controls.querySelector('label[for="background-lines-radius"]').textContent = distortion ? 'Радиус воздействия' : 'Радиус подсветки';
    wordmarkFade.checked = Boolean(settings.wordmarkFade);
    fadeGuide.checked = Boolean(settings.aboutFadeGuide);
    fadeGuideHint.hidden = settings.aboutFadeShape !== 'distance';
    syncAvailability(fadeGuide, settings);
    for (const select of selects) {
      const value = (select.dataset.effectOwner === 'background' ? backgroundSettings : settings)?.[select.dataset.effectSelect];
      if (value !== undefined) select.value = value;
      syncAvailability(select, settings, backgroundSettings);
    }
    controls.classList.toggle('is-disabled', !settings.enabled);
    for (const input of ranges) {
      const key = input.dataset.effectSetting;
      const value = (input.dataset.effectOwner === 'background' ? backgroundSettings?.[key] : settings[key]) ?? Number(input.defaultValue);
      input.value = value;
      syncAvailability(input, settings, backgroundSettings);
      input.setAttribute('aria-valuetext', format[key](value));
      input.style.setProperty('--range-progress', `${(value - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
      controls.querySelector(`[data-effect-output="${key}"]`).value = format[key](value);
    }
  }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  controls.querySelector('[data-effect-hide]').addEventListener('click', () => setOpen(false, true));
  controls.querySelector('[data-effect-reset]').addEventListener('click', () => {
    effect.resetSettings();
    scrollEffect.resetSettings();
    backgroundEffect?.resetSettings();
    sync();
  });
  enabled.addEventListener('change', () => {
    effect.setSettings({ enabled: enabled.checked });
    sync();
  });
  ambientEnabled.addEventListener('change', () => {
    backgroundEffect?.setSettings({ ambientEnabled: ambientEnabled.checked });
    sync();
  });
  backgroundEnabled.addEventListener('change', () => {
    backgroundEffect?.setSettings({ enabled: backgroundEnabled.checked });
    sync();
  });
  wordmarkFade.addEventListener('change', () => {
    scrollEffect.setSettings({ wordmarkFade: wordmarkFade.checked });
    sync();
  });
  fadeGuide.addEventListener('change', () => {
    scrollEffect.setSettings({ aboutFadeGuide: fadeGuide.checked });
    sync();
  });
  for (const select of selects) {
    select.addEventListener('change', () => {
      const owner = select.dataset.effectOwner === 'background' ? backgroundEffect : scrollEffect;
      owner?.setSettings({ [select.dataset.effectSelect]: select.value });
      sync();
    });
  }
  for (const input of ranges) {
    input.addEventListener('input', () => {
      const owner = input.dataset.effectOwner === 'scroll' ? scrollEffect : input.dataset.effectOwner === 'background' ? backgroundEffect : effect;
      owner?.setSettings({ [input.dataset.effectSetting]: Number(input.value) });
      sync();
    });
  }
  window.addEventListener('hero-depth:settings', sync);
  window.addEventListener('hero-scroll:settings', sync);
  window.addEventListener('background-lines:settings', sync);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.preventDefault();
    setOpen(false, true);
  });
  controls.addEventListener('pointerenter', () => document.body.classList.add('is-effect-controls-hover'));
  controls.addEventListener('pointerleave', () => document.body.classList.remove('is-effect-controls-hover'));
  window.addEventListener('blur', () => document.body.classList.remove('is-effect-controls-hover'));
  sync();
})();
