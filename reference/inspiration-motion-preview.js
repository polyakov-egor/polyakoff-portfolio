(() => {
  const view=window.InspirationView, flip=window.InspirationCardFlip;
  if(!view||!flip)return;
  const select=document.querySelector('[data-qa-card]'), edge=document.querySelector('[data-qa-edge]'), status=document.querySelector('[data-qa-status]');
  let active=Number(select.value), frame=0, frozen=false, ready=false;
  view.root.hidden=false;view.root.setAttribute('aria-hidden','false');
  function layout(){
    const size=Math.min(360,innerWidth-100,innerHeight*.5),radius=size*.2;
    view.root.style.setProperty('--inspiration-card-radius',`${radius}px`);
    for(const [i,card]of view.cards.entries()){
      card.style.width=`${size}px`;card.style.height=`${size}px`;card.style.borderRadius=`${radius}px`;
      card.style.transform=`translate3d(${(innerWidth-size)/2}px,${(innerHeight-size)/2}px,0)`;
      card.style.display=i===active?'':'none';card.setAttribute('aria-hidden',String(i!==active));
      card.querySelector('.inspiration__tilt-face').style.clipPath=`path('${window.HeroSquircle.path(size,size,radius,1)}')`;
    }
    view.index.textContent=String(active+1).padStart(2,'0');
    window.InspirationHover.update({active,enabled:ready});wake();
  }
  function tick(now){
    frame=0;
    if(frozen)return;
    const result=flip.update({active,enabled:ready,now});
    const angle=Number(view.cards[active].dataset.contentFlip);
    if(edge.checked&&angle>65&&angle<115)frozen=true;
    status.textContent=`${angle.toFixed(1)}°${frozen?' · held':''}`;
    if(result.animating&&!frozen)wake();
  }
  function wake(){if(!frame)frame=requestAnimationFrame(tick);}
  window.addEventListener('inspiration:ready',wake);
  window.addEventListener('resize',layout);
  select.addEventListener('change',()=>{active=Number(select.value);frozen=false;flip.reset();layout();});
  edge.addEventListener('change',()=>{frozen=false;wake();});
  document.querySelector('[data-qa-resume]').addEventListener('click',()=>{edge.checked=false;frozen=false;wake();});
  window.ChapterAssets.ensure('inspiration').then(()=>{ready=true;layout();});
  layout();
})();
