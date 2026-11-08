/* Local QA recorder only. Never included in index.html or publication. */
(() => {
  const Original = window.Lenis;
  const output = document.createElement('pre'); output.id='lenis-debug'; output.hidden=true; document.body.append(output);
  const trace=[]; let frames=0;
  const add=(type,instance,extra={})=>{
    const node=document.querySelector('.inspiration');
    trace.push({type,y:window.scrollY,actual:instance?.actualScroll,animated:instance?.animatedScroll,target:instance?.targetScroll,
      scrolling:instance?.isScrolling,gate:node?.dataset.returnGate,flip:node?.dataset.flipRunning,...extra});
    if(trace.length>120)trace.shift(); output.textContent=JSON.stringify(trace);
  };
  window.Lenis=class extends Original {
    constructor(options){
      let owner;
      const originalVirtual=options.virtualScroll;
      super({...options,virtualScroll(data){
        frames=12;add('wheel-before',owner,{dy:data.deltaY,prevented:data.event.defaultPrevented});
        const result=originalVirtual(data);add('wheel-after',owner,{accepted:result});return result;
      }});
      owner=this;
      const originalRaf=this.raf;
      this.raf=time=>{if(frames>0)add('raf-before',this);originalRaf(time);if(frames>0){frames--;add('raf-after',this);}};
    }
    scrollTo(target,options){if(frames>0)add('jump-before',this,{to:target,immediate:options?.immediate});super.scrollTo(target,options);if(frames>0)add('jump-after',this);}
  };
})();
