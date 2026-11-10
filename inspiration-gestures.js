/* Shared wheel intent is observational: native Hero/About/Works scrolling is
   untouched. Trackpad momentum may overlap the next deliberate finger swipe,
   so silence is not the only way to identify a new intent. */
(() => {
  'use strict';
  if (window.SiteWheelIntent) return;
  const samples = new WeakMap();
  let id=0,at=-Infinity,peak=0,peakAt=0,last=0,lastDirection=0,lastMode=0,tail=false,tailFloor=Infinity,candidate=null;
  function sample(event,time=performance.now(),height=1){
    if(!event||typeof event!=='object')return null;
    if(samples.has(event))return samples.get(event);
    const multiplier=event.deltaMode===1?16:event.deltaMode===2?Math.max(1,height):1;
    const delta=event.deltaY*multiplier,dx=(event.deltaX||0)*multiplier;
    if(event.ctrlKey||event.metaKey||event.altKey||!Number.isFinite(delta)||!Number.isFinite(dx)||Math.abs(delta)<.01||Math.abs(dx)>Math.abs(delta)){
      samples.set(event,null);return null;
    }
    const magnitude=Math.abs(delta),direction=Math.sign(delta);
    const gap=time-at,mode=event.deltaMode||0;
    // A mechanical wheel notch is a separate action even when the user keeps
    // turning it. Frame-rate pixel streams and decaying trackpad tails still
    // need the acceleration/silence checks below.
    const pixelNotch=mode===0&&(Math.abs(magnitude-100)<.01||Math.abs(magnitude-120)<.01);
    const stepped=gap>=65&&magnitude>=24&&direction===lastDirection&&mode===lastMode&&Math.abs(magnitude-last)<.01&&(mode===1||mode===2||pixelNotch);
    let fresh=gap>220||stepped;
    if(!fresh){
      if(magnitude>peak){peak=magnitude;peakAt=time;}
      if(!tail&&magnitude<=peak*.35&&time-peakAt>=80){tail=true;tailFloor=magnitude;}
      if(tail){
        tailFloor=Math.min(tailFloor,magnitude);
        if(magnitude>last*1.15&&magnitude>=2){
          if(!candidate||candidate.direction!==direction)candidate={direction,count:0,energy:0,baseline:Math.max(.1,tailFloor)};
          candidate.count++;candidate.energy+=magnitude;
          fresh=candidate.count>=2&&candidate.energy>=24&&magnitude>=12&&magnitude>=candidate.baseline*2.5;
        }else candidate=null;
      }
    }
    if(fresh){id++;peak=magnitude;peakAt=time;tail=false;tailFloor=Infinity;candidate=null;}
    last=magnitude;lastDirection=direction;lastMode=mode;at=time;
    // All chapter listeners receive the same classification for this event.
    // In particular, one owner cannot reinterpret another owner's momentum.
    const intent=Object.freeze({id,fresh,direction,delta});
    samples.set(event,intent);return intent;
  }
  window.SiteWheelIntent=Object.freeze({sample});
})();

/* Category changes run to completion on the story clock. A long gesture can
   reserve one more category without crossing the chapter boundary. */
(() => {
  'use strict';
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  // The gesture launches a complete transition, with an immediate response
  // and a gentle landing; it never scrubs its pose with native scroll pixels.
  const ease = t => 1-(1-clamp(t,0,1))**3;
  const wheelThreshold = 24, touchThreshold = 32;
  const defaultDuration = 650;
  const duration = () => {
    const value=window.HeroScrollEffect?.getSettings?.().inspirationCardDurationMs;
    return typeof value==='number'&&Number.isFinite(value)?clamp(value,350,1800):defaultDuration;
  };
  const state = {initialized:false,position:0,target:0,from:0,started:0,duration:defaultDuration,running:false,pending:null,queued:0};
  let context = {height:1,rawDistance:-1,now:0,enabled:false,entering:false,reducedMotion:false,origin:0};
  let wheelAmount = 0, wheelUsed = true, wheelRelease = 0;
  let wheelTravel = null, wheelDirection = 0;
  let reverseDistance = 0, reverseSamples = 0;
  let touch = null, touchSerial = 0, keyRelease = '';
  let owned = false, awaitingPeople = false, released = 0, reentry = false, externalRestore = false;
  let releasedTouch = -1;
  const root = window.InspirationView?.root;

  function wake(){window.dispatchEvent(new CustomEvent('inspiration:ready'));}
  function eligible(){return !document.hidden&&context.enabled;}
  function ignored(target){return Boolean(target?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="slider"], [role="dialog"], .effect-controls, #hero-effect-panel'));}
  function now(){return performance.now();}
  function offset(stage){return stage===0?2:stage===2?context.height*2-2:context.height;}
  function moveNative(top){
    const next=Math.max(0,top);
    if(window.SiteSmoothScroll?.jump)window.SiteSmoothScroll.jump(next);
    else window.scrollTo({top:next,behavior:'instant'});
  }
  function settle(){state.position=state.target;state.running=false;state.pending=null;state.queued=0;}
  function busy(){return state.running||state.pending!==null;}
  function canBuffer(time){
    return eligible()&&state.running&&state.pending===null&&state.queued===0&&
      (time-state.started)/state.duration>=.6;
  }
  function buffer(direction,time){
    if(!canBuffer(time)||state.target+direction<0||state.target+direction>2)return false;
    state.queued=direction;wake();return true;
  }
  function continueGesture(travel,time){
    const {target,direction}=travel;
    // A deliberate reversal can be waiting for the current card to land.
    if((state.pending??state.target)!==target)return target!==state.target+state.queued;
    if(state.queued||target+direction<0||target+direction>2)return true;
    if(busy()){state.queued=direction;wake();}
    else navigate(direction,time);
    return true;
  }
  function resetWheelTracking(){
    wheelTravel=null;wheelDirection=0;reverseDistance=reverseSamples=0;
  }
  function trackWheelTravel(direction,target,distance,samples=1){
    wheelDirection=direction;wheelTravel={direction,target,distance,samples};
  }
  function commitWheelTravel(time){
    const threshold=clamp(context.height*.60,400,550);
    if(wheelTravel&&wheelTravel.samples>=3&&wheelTravel.distance>=threshold&&continueGesture(wheelTravel,time))wheelTravel=null;
  }
  function reverseWheel(direction,magnitude,time){
    // A few consistent opposite samples can identify a reversal within one
    // continuous trackpad stream. Isolated rebounds leave its travel intact.
    if(magnitude<3)return;
    reverseDistance+=magnitude;reverseSamples++;
    if(reverseSamples<3||reverseDistance<36)return;
    const distance=reverseDistance,samples=reverseSamples,target=state.target+direction;
    resetWheelTracking();
    if(state.pending!==null||target<0||target>2)return;
    trackWheelTravel(direction,target,distance,samples);
    if(state.running){state.queued=direction;wake();}
    else navigate(direction,time);
    commitWheelTravel(time);
  }
  function targetReady(target){return typeof context.targetReady!=='function'||context.targetReady(target);}
  function acquire(stage){
    if(state.target!==stage){state.target=stage;settle();}
    owned=true;awaitingPeople=false;released=0;reentry=false;
  }
  function release(direction){owned=false;awaitingPeople=false;released=direction;reentry=false;releasedTouch=touch?.id??-1;}
  function noteReentry(direction,fresh){if(released&&direction===-released&&fresh)reentry=true;}
  function externalNavigation(){release(0);externalRestore=true;wake();}

  // A queued native scroll tick can arrive after preventDefault/touchend, or
  // while a long main-thread frame is pending. Keep it outside the visual
  // chapter before raw distance can trigger a return or settle on Detail.
  // The Hero owner applies the native and displayed correction together.
  function hold({height=context.height,rawDistance=context.rawDistance,ready=false,restore=false}={}){
    if(externalRestore){externalRestore=false;return{restore:true};}
    if(restore||!state.initialized||!ready)return null;
    if(!owned){
      if(awaitingPeople)acquire(0);
      else if(reentry&&released===1&&rawDistance<=height*2)acquire(2);
      else if(reentry&&released===-1&&rawDistance>=0)acquire(0);
    }
    if(!owned)return null;
    const anchor=state.target===0?2:state.target===2?height*2-2:height;
    const correction=anchor-rawDistance,settled=Math.abs(correction)<.25?rawDistance:anchor;
    return{owned:true,rawDistance:anchor,localDistance:anchor,
      scrollAdjustment:Math.abs(correction)<.25?0:correction,settleLocalDistance:settled};
  }

  function startTransition(target,time){
    state.from=state.position;state.target=target;state.started=time;state.duration=duration();
    state.running=!context.reducedMotion;state.pending=null;
    if(!state.running)state.position=target;
    owned=true;released=0;reentry=false;
    // This is an anchor for a timed switch, not a smooth-scroll animation.
    moveNative(context.origin+offset(target));
  }
  function navigate(direction,time,notify=true){
    if(busy())return 'blocked';
    if(!eligible())return 'blocked';
    // Returning an open back face runs concurrently with this very gesture,
    // including native exits from People/Detail; it never consumes a step.
    window.InspirationCardFlip?.resetForNavigation?.(direction,time);
    const target=state.target+direction;
    if(target<0||target>2){
      // Returning from Works can end a native gesture part-way inside this
      // chapter. Align its endpoint before releasing a NEW boundary gesture.
      const anchor=context.origin+offset(state.target);
      if(Math.abs(window.scrollY-anchor)>3)moveNative(anchor);
      release(direction);
      if(notify)wake();return 'native';
    }
    if(targetReady(target))startTransition(target,time);
    else {
      // A decode event starts the complete transition without polling.
      state.pending=target;state.queued=0;owned=true;released=0;reentry=false;
    }
    if(notify)wake();return 'changed';
  }

  window.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||ignored(event.target))return;
    const time=now(),intent=window.SiteWheelIntent.sample(event,time,context.height);
    if(!intent)return;
    const {delta:dy,direction,fresh}=intent;
    if(fresh){wheelAmount=0;wheelUsed=false;wheelRelease=0;resetWheelTracking();}
    noteReentry(direction,fresh);
    if(!eligible()){
      // Input while the portrait flips or headings reveal is spent on that
      // entrance. It cannot reserve the first category switch behind it.
      if(context.entering&&!document.hidden)event.preventDefault();
      wheelUsed=true;wheelAmount=0;resetWheelTracking();return;
    }
    if(wheelRelease===direction)return;
    const longThreshold=clamp(context.height*.60,400,550);
    const magnitude=Math.abs(dy);
    if(wheelDirection&&wheelDirection!==direction){
      reverseWheel(direction,Math.min(magnitude,longThreshold/2),time);
      event.preventDefault();return;
    }
    if(magnitude>=3)reverseDistance=reverseSamples=0;
    if(wheelTravel){
      wheelTravel.distance+=Math.min(magnitude,longThreshold/2);
      wheelTravel.samples++;
      commitWheelTravel(time);
      event.preventDefault();
      return;
    }
    if(busy()){
      event.preventDefault();
      if(!wheelUsed&&canBuffer(time)){
        wheelAmount+=dy;
        if(Math.abs(wheelAmount)<wheelThreshold)return;
        const step=Math.sign(wheelAmount);
        if(buffer(step,time))trackWheelTravel(step,state.target+step,Math.min(Math.abs(wheelAmount),longThreshold/2));
      }
      wheelUsed=true;return;
    }
    if(wheelUsed){event.preventDefault();return;}
    wheelAmount+=dy;
    if(Math.abs(wheelAmount)<wheelThreshold){event.preventDefault();return;}
    wheelUsed=true;
    const step=Math.sign(wheelAmount);
    const result=navigate(step,time);
    // A deliberate boundary intent releases its threshold event and native
    // remainder together; sub-pixel sign noise cannot return/exit a chapter.
    if(result==='native'){wheelRelease=step;return;}
    if(result==='changed'){
      trackWheelTravel(step,state.pending??state.target,Math.min(Math.abs(wheelAmount),longThreshold/2));
    }
    event.preventDefault();
  },{passive:false});

  window.addEventListener('touchstart',event=>{
    if(event.touches.length!==1||ignored(event.target)){touch=null;return;}
    const point=event.touches[0];
    const bufferable=canBuffer(now());
    touch={id:++touchSerial,x:point.clientX,y:point.clientY,used:!eligible()||(busy()&&!bufferable),bufferable,released:false,horizontal:false,travel:null};
  },{passive:true});
  window.addEventListener('touchmove',event=>{
    if(!touch||event.touches.length!==1||ignored(event.target))return;
    const point=event.touches[0],dy=touch.y-point.clientY,dx=touch.x-point.clientX;
    if(touch.released||touch.horizontal)return;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>8){touch.horizontal=true;return;}
    if(Math.abs(dy)<.01||Math.abs(dx)>Math.abs(dy))return;
    noteReentry(Math.sign(dy),touch.id!==releasedTouch);
    if(!eligible()){
      if(context.entering){event.preventDefault();touch.used=true;touch.travel=null;}
      return;
    }
    const direction=Math.sign(dy);
    // Release a boundary swipe before cancelling any touch movement, so the
    // browser retains native scrolling and inertia for about/Works.
    if(!touch.used&&!busy()&&context.enabled&&((state.target===0&&direction<0)||(state.target===2&&direction>0))){
      navigate(direction,now());touch.used=true;touch.released=true;return;
    }
    event.preventDefault();
    if(!touch.used&&Math.abs(dy)>=touchThreshold){
      touch.used=true;
      const time=now();
      if(busy()){
        if(touch.bufferable)buffer(direction,time);
      } else if(navigate(direction,time)==='changed'){
        touch.travel={direction,target:state.pending??state.target};
      }
    }
    if(touch.travel?.direction!==direction)touch.travel=null;
    if(touch.travel&&Math.abs(dy)>=Math.max(100,context.height*.15)){
      continueGesture(touch.travel,now());
      touch.travel=null;
    }
  },{passive:false});
  const endTouch=()=>{touch=null;};
  window.addEventListener('touchend',endTouch,{passive:true});
  window.addEventListener('touchcancel',endTouch,{passive:true});

  window.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||ignored(event.target))return;
    if(event.key==='Home'||event.key==='End'){externalNavigation();return;}
    const direction=event.key==='ArrowDown'||event.key==='PageDown'||(event.key===' '&&!event.shiftKey)?1:
      event.key==='ArrowUp'||event.key==='PageUp'||(event.key===' '&&event.shiftKey)?-1:0;
    if(!direction)return;
    noteReentry(direction,!event.repeat);
    if(!eligible()){
      if(context.entering&&!document.hidden)event.preventDefault();
      return;
    }
    if(event.repeat){if(keyRelease!==event.key)event.preventDefault();return;}
    keyRelease='';
    if(busy()){event.preventDefault();buffer(direction,now());return;}
    const result=navigate(direction,now());
    if(result==='native')keyRelease=event.key;else event.preventDefault();
  });
  window.addEventListener('keyup',event=>{if(event.key===keyRelease)keyRelease='';});

  function update(options={}){
    const previous=context;
    const height=Number.isFinite(options.height)?Math.max(1,options.height):previous.height;
    const rawDistance=Number.isFinite(options.rawDistance)?options.rawDistance:previous.rawDistance;
    context={...previous,...options,height,rawDistance,
      origin:Number.isFinite(options.origin)?options.origin:window.scrollY-rawDistance};
    if(options.restore||!context.enabled||document.hidden){
      state.queued=0;resetWheelTracking();
      if(touch)touch.travel=null;
    }
    if(context.entering){awaitingPeople=true;owned=false;released=0;reentry=false;}
    if(state.initialized&&context.enabled&&!previous.enabled){
      // A completed People screen is a new input boundary. Discard an old
      // wheel accumulator and require a quiet/new burst after this reveal.
      wheelAmount=0;wheelUsed=true;wheelRelease=0;resetWheelTracking();
      state.queued=0;
      if(touch)touch.used=true;
    }
    if(!state.initialized||options.restore){
      const preserve=state.initialized&&height!==previous.height&&previous.enabled&&context.enabled&&!options.explicitRestore;
      if(!preserve){state.target=clamp(Math.round(rawDistance/height),0,2);settle();}
      state.initialized=true;
      if(context.enabled)acquire(state.target);
      else if(!context.entering){owned=false;awaitingPeople=false;released=rawDistance<0?-1:rawDistance>height*2?1:0;reentry=false;}
    }
    if(context.reducedMotion&&state.running)settle();
    if(!owned&&!context.enabled&&!context.entering){
      if(rawDistance< -8){state.target=0;settle();}
      else if(rawDistance>height*2+8){state.target=2;settle();}
    }
    if(state.pending!==null&&context.enabled&&targetReady(state.pending))startTransition(state.pending,context.now);
    if(state.running){
      const nextDuration=duration();
      if(nextDuration!==state.duration){
        const phase=clamp((context.now-state.started)/state.duration,0,1);
        state.started=context.now-phase*nextDuration;state.duration=nextDuration;
      }
      const progress=clamp((context.now-state.started)/state.duration,0,1);
      state.position=state.from+(state.target-state.from)*ease(progress);
      if(progress===1){
        state.position=state.target;state.running=false;
      }
    }
    if(state.queued&&!busy()){
      // Start the reserved adjacent move on this same shared-clock frame.
      const queued=state.queued;state.queued=0;
      navigate(queued,context.now,false);
      commitWheelTravel(context.now);
    }
    if(root){
      root.dataset.gestureStage=String(Math.round(state.position)+1);
      root.dataset.gestureRunning=String(state.running);
      root.dataset.gestureQueued=String(state.queued);
      root.dataset.gesturePending=state.pending===null?'':String(state.pending+1);
      root.dataset.gestureReady=String(context.enabled);
      root.dataset.cardDurationMs=String(state.duration);
    }
    return {position:state.position,busy:state.running,pending:state.pending!==null,active:clamp(Math.round(state.position),0,2),target:state.target,queued:state.queued};
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){settle();endTouch();wheelUsed=true;resetWheelTracking();}else wake();});
  window.addEventListener('blur',()=>{endTouch();wheelUsed=true;resetWheelTracking();keyRelease='';state.queued=0;});
  window.addEventListener('popstate',externalNavigation);
  window.addEventListener('hashchange',externalNavigation);
  window.InspirationGestures=Object.freeze({update,hold});
})();
