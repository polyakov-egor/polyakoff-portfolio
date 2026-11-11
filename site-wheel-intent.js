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
