/* The four paths are copied from the supplied Type=music_on.svg. CSS morphs
   only their upper coordinates: baseline, stroke width and caps stay fixed. */
(() => {
  'use strict';
  const namespace='http://www.w3.org/2000/svg';
  const source=[
  {
    "d": "M7.10059 11.1001C7.10059 11.5971 6.69769 12 6.20068 12C5.70368 12 5.30078 11.5971 5.30078 11.1001V3.8999C5.30078 3.4029 5.70368 3 6.20068 3C6.69769 3 7.10059 3.4029 7.10059 3.8999V11.1001Z",
    "bar": 1
  },
  {
    "d": "M10.3994 11.1001C10.3994 11.5971 9.99651 12 9.49951 12C9.00251 12 8.59961 11.5971 8.59961 11.1001V10.8999C8.59961 10.4029 9.00251 10 9.49951 10C9.99651 10 10.3994 10.4029 10.3994 10.8999V11.1001Z",
    "bar": 2
  },
  {
    "d": "M13.6982 11.1001C13.6982 11.5971 13.2953 12 12.7983 12C12.3013 12 11.8984 11.5971 11.8984 11.1001V7.8999C11.8984 7.4029 12.3013 7 12.7983 7C13.2953 7 13.6982 7.4029 13.6982 7.8999V11.1001Z",
    "bar": 3
  },
  {
    "d": "M3.7998 11.1001C3.7998 11.5971 3.3969 12 2.8999 12C2.4029 12 2 11.5971 2 11.1001V8.8999C2 8.4029 2.4029 8 2.8999 8C3.3969 8 3.7998 8.4029 3.7998 8.8999V11.1001Z",
    "bar": 0
  }
];
  for(const icon of document.querySelectorAll('.music-control > .theme-icon')) {
    if(icon.classList.contains('music-equalizer'))continue;
    if(![...icon.children].some(node=>node.tagName==='IMG'))continue;
    const svg=document.createElementNS(namespace,'svg');
    svg.setAttribute('class','music-equalizer__vector');
    svg.setAttribute('width','16');svg.setAttribute('height','16');
    svg.setAttribute('viewBox','0 0 16 16');
    svg.setAttribute('fill','none');svg.setAttribute('aria-hidden','true');
    svg.setAttribute('focusable','false');
    for(const item of source) {
      const path=document.createElementNS(namespace,'path');
      path.setAttribute('class','music-equalizer__bar');
      path.setAttribute('data-equalizer-bar',item.bar);
      path.setAttribute('d',item.d);path.setAttribute('fill','currentColor');
      svg.append(path);
    }
    icon.append(svg);icon.classList.add('music-equalizer');
  }
  const pause=()=>document.documentElement.classList.toggle('equalizer-is-paused',document.hidden);
  document.addEventListener('visibilitychange',pause);
  window.addEventListener('pagehide',()=>document.documentElement.classList.add('equalizer-is-paused'));
  window.addEventListener('pageshow',pause);
  pause();
})();
