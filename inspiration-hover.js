/* Tilted Card hover, adapted from the supplied React Bits JS/CSS component.
   The chapter owns each outer card's position; this inner body owns hover only. */
(() => {
  'use strict';
  const view = window.InspirationView;
  if (!view?.cards?.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const omega = 20 * Math.pow(.2, .6), zeta = .82;
  let active = -1, enabled = false, frame = 0, last = 0;

  const items = view.cards.map(card => {
    const body = document.createElement('div'); body.className = 'inspiration__tilt-body';
    const face = document.createElement('div'); face.className = 'inspiration__tilt-face';
    const glare = document.createElement('span'); glare.className = 'inspiration__tilt-glare'; glare.setAttribute('aria-hidden','true');
    const rim = document.createElement('span'); rim.className = 'inspiration__tilt-rim'; rim.setAttribute('aria-hidden','true');
    const media = card.querySelector('.inspiration__media'), kind = card.querySelector('.inspiration__kind');
    const glass = card.querySelector('.inspiration__glass');
    if (media) face.append(media);
    if (kind) face.append(kind);
    // Composite the real photo and its backdrop-blurred plate in one flat
    // face before applying hover/flip. No second photograph or SVG filter.
    face.append(glare,rim);
    if (glass) {
      const plus = glass.querySelector('.inspiration__plus');
      if (plus) {
        const action = document.createElement('span'); action.className = 'inspiration__plate-action';
        action.setAttribute('aria-hidden', 'true'); action.append(plus); glass.append(action);
      }
      face.append(glass);
    }
    body.append(face);
    card.append(body); card.classList.add('is-hover-ready');
    const item = {card,body,face,glass,painted:false,width:null,height:null,state:{rx:0,ry:0,lift:0,vrx:0,vry:0,vlift:0},pointer:{x:0,y:0,inside:false}};
    const track = event => {
      if (!canHover(item) || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
      const rect = card.getBoundingClientRect();
      item.pointer.x = clamp((event.clientX-rect.left)/Math.max(1,rect.width)*2-1,-1,1);
      item.pointer.y = clamp((event.clientY-rect.top)/Math.max(1,rect.height)*2-1,-1,1);
      item.pointer.inside = true; wake();
    };
    card.addEventListener('pointerenter',track);
    card.addEventListener('pointermove',track);
    card.addEventListener('pointerleave',()=>{item.pointer.inside=false;wake();});
    return item;
  });

  function canHover(item) {
    return enabled && fine.matches && !reduce.matches && !document.hidden && items[active] === item;
  }
  function step(state,key,target,dt) {
    const v=`v${key}`,steps=Math.max(1,Math.ceil(dt*240)),h=dt/steps;
    for(let i=0;i<steps;i++) {
      state[v]+=(omega*omega*(target-state[key])-2*zeta*omega*state[v])*h;
      state[key]+=state[v]*h;
    }
    if(Math.abs(target-state[key])<.001&&Math.abs(state[v])<.01){state[key]=target;state[v]=0;return false;}
    return true;
  }
  function paint(item) {
    item.painted=true;
    const s=item.state,rx=s.rx*Math.PI/180,ry=s.ry*Math.PI/180;
    // The backdrop plate stays on the photo's flat compositor surface.
    // Its local X/Y parallax gives the depth cue without a second 3D plane.
    const lift=clamp(s.lift,0,1);
    const scale=1+.05*lift;
    item.body.style.transform=`rotateX(${s.rx.toFixed(3)}deg) rotateY(${s.ry.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
    item.body.style.setProperty('--inspiration-glare-x',`${(50+s.ry/12*46).toFixed(2)}%`);
    item.body.style.setProperty('--inspiration-glare-y',`${(50-s.rx/12*46).toFixed(2)}%`);
    item.body.style.setProperty('--inspiration-glare',(.5*Math.max(lift,Math.min(1,Math.hypot(s.rx,s.ry)/12))).toFixed(4));
    const glassX=Math.sin(ry)*30,glassY=-Math.sin(rx)*30;
    if(item.glass) item.glass.style.transform=`translate(${glassX.toFixed(2)}px, ${glassY.toFixed(2)}px)`;
    item.card.classList.toggle('is-tilting',Math.abs(s.rx)+Math.abs(s.ry)+lift>.001);
  }
  function tick(now) {
    frame=0;
    const dt=clamp((now-last)/1000 || 1/60,0,.05);last=now;
    let busy=false;
    for(const item of items) {
      const follow=canHover(item)&&item.pointer.inside;
      const {rx,ry,lift}=item.state;
      busy=step(item.state,'rx',follow?-item.pointer.y*12:0,dt)||busy;
      busy=step(item.state,'ry',follow?item.pointer.x*12:0,dt)||busy;
      busy=step(item.state,'lift',follow?1:0,dt)||busy;
      if(!item.painted||rx!==item.state.rx||ry!==item.state.ry||lift!==item.state.lift)paint(item);
    }
    if(busy)frame=requestAnimationFrame(tick);else last=0;
  }
  function wake(){if(!frame&&!document.hidden){last=performance.now();frame=requestAnimationFrame(tick);}}
  function reset() {
    if(frame)cancelAnimationFrame(frame);frame=0;last=0;
    for(const item of items){
      const dirty=!item.painted||Object.values(item.state).some(value=>value!==0);
      item.pointer.inside=false;
      if(!dirty)continue;
      for(const key of Object.keys(item.state))item.state[key]=0;
      paint(item);
    }
  }
  function update({active:nextActive=-1,enabled:nextEnabled=false}={}) {
    // Migrate a legacy/non-hover pose once. The current renderer writes
    // directly to this face, leaving the outer hit area unclipped.
    for(const item of items){
      const path=item.card.style.clipPath;
      if(path&&path!=='none'&&item.face.style.clipPath!==path)item.face.style.clipPath=path;
      if(path&&path!=='none')item.card.style.clipPath='none';
      const width=item.card.style.width||'var(--inspiration-card-size)',height=item.card.style.height||'var(--inspiration-card-size)';
      if(item.width!==width){item.width=width;item.body.style.setProperty('--inspiration-hover-width',width);}
      if(item.height!==height){item.height=height;item.body.style.setProperty('--inspiration-hover-height',height);}
    }
    const changed=active!==nextActive||enabled!==Boolean(nextEnabled);
    active=nextActive;enabled=Boolean(nextEnabled);
    for(const item of items){
      const ready=String(canHover(item));
      if(item.card.dataset.tiltEnabled!==ready)item.card.dataset.tiltEnabled=ready;
    }
    if(changed)reset();
  }
  window.addEventListener('scroll',reset,{passive:true});
  window.addEventListener('resize',reset,{passive:true});
  window.addEventListener('blur',reset);
  document.addEventListener('visibilitychange',reset);
  reduce.addEventListener('change',()=>{reset();update({active,enabled});});
  fine.addEventListener('change',()=>{reset();update({active,enabled});});
  reset();
  window.InspirationHover=Object.freeze({update,reset});
})();
