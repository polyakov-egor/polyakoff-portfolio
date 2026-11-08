/* Three consecutive faces of an invisible cuboid. The card clock drives
   each quarter-turn, including reverse navigation and restored positions;
   this module never listens to scroll or starts another animation loop. */
(() => {
  'use strict';
  const view = window.InspirationView;
  if (!view?.wordGroup || view.words?.length !== 3) return;
  const { wordGroup, words } = view;
  const clamp = n => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

  // Translate the rotation axis behind the text by half a face height.
  // Adjacent faces share an edge; at rest the two Z offsets cancel exactly.
  // Keep the 2D pose fields for the closing chapter's hidden word ghosts.
  function getWordPose(index, position, font = 64) {
    const size = Number.isFinite(font) && font > 0 ? font : 64;
    const distance = Math.max(0, Math.min(2, Number.isFinite(position) ? position : 0)) - index;
    const radius = size * .56;
    const rotationX = distance * 90;
    const angle = rotationX * Math.PI / 180;
    return {
      x: 0, y: -radius * Math.sin(angle), z: radius * (Math.cos(angle) - 1),
      rotation: 0, rotationX, radius, perspective: size * 12, blur: 0,
      opacity: Math.abs(distance) < 1 ? 1 : 0, color: '#1d1d1d'
    };
  }

  function update({ first = 0, second = 0, font = 64, reveal = 1 } = {}) {
    first = clamp(first);
    second = Math.min(first, clamp(second));
    reveal = clamp(reveal);
    const position = first + second;
    const active = second >= .5 ? 2 : first >= .5 ? 1 : 0;
    wordGroup.classList.toggle('inspiration__words--vertical', false);
    wordGroup.classList.toggle('inspiration__words--revealing', false);
    wordGroup.classList.toggle('inspiration__words--masked', false);
    wordGroup.classList.toggle('inspiration__words--cuboid', true);
    wordGroup.dataset.mode = 'cuboid';
    for (let i = 0; i < words.length; i++) {
      const pose = getWordPose(i, position, font);
      words[i].style.transform = `perspective(${pose.perspective}px) translateZ(${-pose.radius}px) rotateX(${pose.rotationX}deg) translateZ(${pose.radius}px)`;
      words[i].style.opacity = String(pose.opacity);
      // Inherit the chapter's visibility: the closing handoff hides the
      // original heading, and a child must not opt back into visibility.
      words[i].style.visibility = '';
      words[i].style.filter = 'none';
      words[i].style.color = pose.color;
      words[i].style.clipPath = 'none';
      words[i].dataset.reveal = pose.opacity.toFixed(5);
      words[i].setAttribute('aria-hidden', String(i !== active));
    }
    wordGroup.dataset.active = String(active);
    wordGroup.dataset.reveal = reveal.toFixed(5);
  }

  window.InspirationHeadings = Object.freeze({ update, getWordPose });
})();
