const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const hoverPhase=.48;

function fixture(pitchFactor=1.025,foregroundBoost=1){
  const timers=new Map();let timerId=0,drawBrightness=[],drawBends=[],brightness=1,clip;
  const shaders=[];
  function edgeDeviation(start,middle,end){
    const point=index=>[clip[index*4]/clip[index*4+3],clip[index*4+1]/clip[index*4+3]];
    const [a,b,c]=[start,middle,end].map(point);
    return Math.abs((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/Math.hypot(c[0]-a[0],c[1]-a[1]);
  }
  const gl={
    createShader:()=>({}),shaderSource:(_,source)=>shaders.push(source),compileShader(){},getShaderParameter:()=>true,
    createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,useProgram(){},
    createBuffer:()=>({}),bindBuffer(){},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},bufferData(_,data){if(data.length===900)clip=data;},
    getUniformLocation:(_,name)=>name,uniform1i(){},enable(){},depthFunc(){},blendFunc(){},clearColor(){},
    createTexture:()=>({}),bindTexture(){},texParameteri(){},getParameter:()=>4096,texImage2D(){},viewport(){},
    clear(){drawBrightness=[];drawBends=[];},uniform4fv(){},uniform1f(name,value){if(name==='uBrightness')brightness=value;},
    drawElements(){drawBrightness.push(brightness);drawBends.push(Math.max(edgeDeviation(0,12,24),edgeDeviation(0,100,200)));}
  };
  const context2d={clearRect(){},drawImage(){}};
  function element(tag='div'){
    const attributes=new Map(),listeners=new Map();
    const node={tagName:tag.toUpperCase(),className:'',dataset:{},children:[],style:{},clientWidth:1267,clientHeight:713,
      complete:true,naturalWidth:960,naturalHeight:500,
      get firstChild(){return this.children[0]||null;},
      append(...children){this.children.push(...children);},removeChild(child){this.children.splice(this.children.indexOf(child),1);},
      setAttribute(key,value){attributes.set(key,String(value));},getAttribute:key=>attributes.get(key)??null,removeAttribute:key=>attributes.delete(key),
      addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener);},
      dispatch(type,values={}){for(const listener of listeners.get(type)||[])listener({type,...values});},
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
      querySelectorAll(selector){return this.children.flatMap(child=>[...(selector.startsWith('.')?child.classList.contains(selector.slice(1)):child.getAttribute(selector.slice(1,-1))!==null)?[child]:[],...child.querySelectorAll(selector)]);},
      contains(other){return other===this||this.children.some(child=>child.contains(other));},
      getBoundingClientRect:()=>({left:0,top:0}),
      getContext:kind=>kind==='2d'?context2d:gl
    };
    const classes=()=>node.className.split(/\s+/).filter(Boolean);
    node.classList={contains:name=>classes().includes(name),add(...names){node.className=[...new Set([...classes(),...names])].join(' ');},remove(...names){node.className=classes().filter(name=>!names.includes(name)).join(' ');},toggle(name,on){const enabled=on??!this.contains(name);this[enabled?'add':'remove'](name);return enabled;}};
    return node;
  }
  const body=element(),viewport=element(),list=element();viewport.setAttribute('data-works-gallery','');list.setAttribute('data-works-cards','');viewport.append(list);body.append(viewport);
  const window=element();window.devicePixelRatio=1;window.dispatchEvent=event=>window.dispatch(event.type,event);
  vm.runInNewContext(fs.readFileSync(path.join(root,'works-gallery.js'),'utf8').replace(/pitchFactor:\d*\.?\d+/,`pitchFactor:${pitchFactor}`).replace(/foregroundBoost\s*=\s*\d*\.?\d+/,`foregroundBoost=${foregroundBoost}`),{
    document:{querySelector:selector=>body.querySelector(selector),createElement:element},window,
    setTimeout(callback,delay){timers.set(++timerId,{callback,delay});return timerId;},clearTimeout(id){timers.delete(id);},
    requestAnimationFrame(){throw Error('Hover must not add an independent render loop');}
    ,CustomEvent:class{constructor(type){this.type=type;}}
  });
  const api=window.WorksGallery;api.measure({width:1267,height:713});api.update(hoverPhase);
  const pill=viewport.querySelector('.works-project'),canvas=viewport.querySelector('.works-gallery-canvas');
  return{api,viewport,list,pill,canvas,window,timers,shaders,getDrawBrightness:()=>drawBrightness,getDrawBends:()=>drawBends};
}

const f=fixture();
assert.equal(f.viewport.dataset.worksRenderer,'retained-webgl','The fixture exercises the actual retained WebGL renderer');
assert(f.getDrawBrightness().length>2);
assert(f.getDrawBrightness().every(value=>value===1),'Idle works retain their original colors');
const front=f.api.getProjectedCards(hoverPhase).find(pose=>pose.front&&pose.visible);
assert(front,'A real front plane is available for the hover test');
const idleTransforms=f.list.children.map(node=>node.style.transform);
f.list.children[front.index].dispatch('pointerenter',{pointerType:'mouse'});
assert.equal(f.pill.getAttribute('aria-hidden'),'false');
assert(f.pill.classList.contains('is-visible'));
assert.equal(f.viewport.dataset.hoveredSequence,String(front.index+1));
assert(f.api.isAnimating(),'Hover schedules only the shared story clock');
f.api.update(hoverPhase,{now:100});f.api.update(hoverPhase,{now:400});
assert(!f.api.isAnimating(),'Hover motion settles with no independent idle clock');
assert(f.list.children[front.index].classList.contains('is-hovered'));
assert.equal(f.list.children.filter(node=>node.classList.contains('is-dimmed')).length,0,'Other cards do not receive dimming');
assert(f.getDrawBrightness().some(value=>Math.abs(value-.6)<1e-6),'The hovered work darkens40% in the actual canvas');
assert.equal(f.getDrawBrightness().filter(value=>value<1).length,1,'Only the selected visible work changes brightness');
assert.equal(f.list.children[front.index].dataset.hoverScale,'0.90000');
for(let i=0;i<f.list.children.length;i++)if(i!==front.index)assert.equal(f.list.children[i].style.transform,idleTransforms[i],'Unselected card geometry is unchanged');
assert(f.shaders.some(source=>source.includes('vec4(color.rgb*uBrightness*alpha,alpha)')),'The antialiased edge is premultiplied without applying hover brightness to alpha');

f.list.children[front.index].dispatch('pointerleave',{pointerType:'mouse'});
assert.equal(f.pill.getAttribute('aria-hidden'),'true','Leaving the card starts hiding immediately, without a hover grace timer');
assert(f.pill.classList.contains('is-leaving'),'Exit animation keeps the surface mounted for its upward recede');
assert(!f.pill.classList.contains('is-visible'));
assert.equal(f.list.children.filter(node=>node.classList.contains('is-dimmed')).length,0);
f.api.update(hoverPhase,{now:500});f.api.update(hoverPhase,{now:800});
assert(f.getDrawBrightness().every(value=>value===1),'Leaving smoothly restores the selected work');
assert.deepEqual([...f.timers.values()].map(timer=>timer.delay),[500]);

f.list.children[front.index].dispatch('pointerenter',{pointerType:'mouse'});
assert.equal(f.timers.size,1,'Re-entry cancels stale hide completion and starts a fresh entrance');
assert(!f.pill.classList.contains('is-leaving'));
assert(f.pill.classList.contains('is-visible'));
assert(f.pill.classList.contains('is-entering'),'Re-entry restarts the below-upward entrance even during an interrupted exit');
f.canvas.dispatch('pointerleave');
for(const timer of f.timers.values())timer.callback();f.timers.clear();
assert(!f.pill.classList.contains('is-leaving'),'Completed exit returns the card to its below-screen entry state');
assert.equal(f.pill.dataset.sequence,'');

const center=front.vertices[4*25+12];
f.canvas.dispatch('pointerdown',{pointerType:'touch',clientX:center.x,clientY:center.y});
f.canvas.dispatch('pointerup',{pointerType:'touch',clientX:center.x,clientY:center.y});
assert.equal(f.pill.getAttribute('aria-hidden'),'false','A touch tap still reveals project details');
f.window.dispatch('blur');
assert.equal(f.pill.getAttribute('aria-hidden'),'true');
f.api.update(hoverPhase,{now:900});f.api.update(hoverPhase,{now:1200});
assert(f.getDrawBrightness().every(value=>value===1),'Window blur clears selected dimming');

const css=fs.readFileSync(path.join(root,'works-gallery.css'),'utf8');
assert(/\.works-project::before\s*\{[^}]*backdrop-filter:\s*blur\(var\(--works-project-frost\)\)/s.test(css),'The works plate uses a native backdrop blur');
assert(!/saturate\(|ff-inspiration-glass-refraction/.test(css),'The plain work plate has no refraction or extra saturation filter');
assert(/\.works-project::before, \.works-project::after[^}]*transition:\s*opacity 500ms/s.test(css),'Each painted glass/content layer fades directly');
assert(/\.works-project\.is-leaving\s*\{[^}]*translate3d\(-50%, -12px, 0\) scale\(\.9\)/s.test(css));
assert(/\.works-project\s*\{[^}]*opacity:\s*1;[^}]*filter:\s*none/s.test(css),'The glass parent stays opaque and unfiltered from frame one');
assert(/@keyframes works-project-enter\s*\{\s*from\s*\{[^}]*translate3d\(-50%, 28px, 0\)/s.test(css),'Every entrance explicitly starts below its resting point');
const wider=f.api.getProjectedCards(.33457),original=fixture(1).api.getProjectedCards(.33457);
assert(wider[0].minX-wider[1].maxX>original[0].minX-original[1].maxX+5,'The narrow visible front gap opens while original mesh dimensions stay fixed');
assert.equal(f.api.getLayout().planeWidth,1.7,'Spacing does not shrink project meshes');
assert.equal(f.api.getLayout().radius,2,'Spacing does not enlarge the cylinder');
const unboosted=fixture(1.025,0);
let boostedFronts=0,rearComparisons=0;
for(const [width,height] of [[375,812],[768,1024],[1267,713],[1920,960],[2560,1305]]){
  f.api.measure({width,height});
  unboosted.api.measure({width,height});
  for(const phase of [0,.13,.2307,.33457,.36,.39,.42,.45,.48,.52,.55,.62,.763359,1,1.2,1.5,2]){
    const mesh=f.api.getProjectedCards(phase),bounds=f.api.getProjectedCardBounds(phase);
    const previous=unboosted.api.getProjectedCards(phase);
    assert.equal(bounds.length,mesh.length);
    for(let i=0;i<mesh.length;i++)for(const key of ['minX','maxX','minY','maxY'])assert(Math.abs(bounds[i][key]-mesh[i][key])<1e-7,`Cheap ${key} matches the full curved mesh at ${width}x${height}, phase${phase}, card${i}`);
    for(let i=0;i<mesh.length;i++){
      const pose=mesh[i],old=previous[i];
      assert(pose.foregroundScale>=1&&pose.foregroundScale<=2,'Foreground enlargement stays within the selected100% boost');
      for(const key of ['worldY','worldZ','angle','facing','front'])assert.equal(pose[key],old[key],'Enlargement does not change orbit, orientation or click eligibility: '+key);
      if(!pose.front){
        assert.equal(pose.foregroundScale,1,'Rear/ineligible cards keep their exact former size');
        const entryShift=pose.vertices[0].y-old.vertices[0].y;
        for(let v=0;v<pose.vertices.length;v++){
          for(const key of ['x','distance','u','v'])assert.equal(pose.vertices[v][key],old.vertices[v][key],'Rear/ineligible local mesh is unchanged: '+key);
          assert(Math.abs(pose.vertices[v].y-old.vertices[v].y-entryShift)<1e-9,'Only the shared below-screen entrance offset can shift a rear mesh');
        }
        rearComparisons++;
      }
      if(pose.front&&pose.visible&&pose.facing>=.85){
        assert(Math.abs(pose.foregroundScale-f.api.getLayout().foregroundMaxScale)<1e-12);
        assert(pose.maxX-pose.minX>old.maxX-old.minX,'A forward facing visible card becomes visibly wider');
        boostedFronts++;
      }
    }
  }
}
assert(boostedFronts>10&&rearComparisons>100,'Checks cover active and rear geometry across the orbit and breakpoints');
f.api.measure({width:1267,height:713});unboosted.api.measure({width:1267,height:713});
function facingCrossing(target){
  let low=.13,high=16.8/54.744;
  for(let i=0;i<35;i++){const middle=(low+high)/2;if(f.api.getProjectedCards(middle)[0].facing<target)low=middle;else high=middle;}
  return(low+high)/2;
}
for(const facing of [.2,.85]){
  const crossing=facingCrossing(facing),epsilon=1e-7;
  const a=f.api.getProjectedCards(crossing-epsilon)[0].foregroundScale,b=f.api.getProjectedCards(crossing)[0].foregroundScale,c=f.api.getProjectedCards(crossing+epsilon)[0].foregroundScale;
  assert(Math.abs(a-b)<1e-7&&Math.abs(c-b)<1e-7,'The click-boundary entry and fully enlarged plateau have no scale jump or velocity kink');
}
const centralPhase=16.8/54.744;
f.api.update(centralPhase,{now:1250});
const enlarged=f.api.getProjectedCards(centralPhase)[0],oldCentral=unboosted.api.getProjectedCards(centralPhase)[0];
const newHit=enlarged.vertices[4*25+1];
assert(newHit.x<oldCentral.minX,'Regression point lies in the newly enlarged clickable area');
f.canvas.dispatch('pointerdown',{pointerType:'touch',clientX:newHit.x,clientY:newHit.y});
f.canvas.dispatch('pointerup',{pointerType:'touch',clientX:newHit.x,clientY:newHit.y});
assert.equal(f.pill.dataset.sequence,'1','Hit testing follows the enlarged unhovered mesh');
assert.equal(f.list.children[0].dataset.foregroundScale,'2.00000');
f.window.dispatch('blur');
f.api.update(.62,{now:1300});
const settledDraw=f.getDrawBrightness();
f.api.update(.62,{now:1400});
assert.equal(f.getDrawBrightness(),settledDraw,'An unchanged settled pose does not redraw or copy the retained GPU frame');

const motion=fixture();
const drawBend=(phase,index)=>{
  const visible=motion.api.getProjectedCards(phase).filter(pose=>pose.visible).sort((a,b)=>a.worldZ-b.worldZ);
  return motion.getDrawBends()[visible.findIndex(pose=>pose.index===index)];
};
function meshBend(vertices){
  const point=index=>[vertices[index].x*2/1267,vertices[index].y*2/713];
  const edge=(start,middle,end)=>{
    const [a,b,c]=[start,middle,end].map(point);
    return Math.abs((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/Math.hypot(c[0]-a[0],c[1]-a[1]);
  };
  return Math.max(edge(0,12,24),edge(0,100,200));
}
motion.api.update(centralPhase,{now:1000});
const idleBend=drawBend(centralPhase,0);
const resting=motion.api.getProjectedCards(centralPhase,.25)[0];
const full=motion.api.getProjectedCards(centralPhase,1)[0];
assert(Math.abs(idleBend-meshBend(resting.vertices))<1e-6&&!motion.api.isAnimating(),'A head-on idle card renders a quarter of its moving deformation');
const side=motion.api.getProjectedCards(centralPhase).find(pose=>pose.visible&&pose.facing<=.45);
assert(side&&Math.abs(drawBend(centralPhase,side.index)-meshBend(side.vertices))<1e-6,'Side-facing cards retain their original curve');
const moving=[];
for(const direction of [1,-1]){
  const start=direction===1?1000:2000;
  motion.api.update(centralPhase,{now:start});
  for(let frame=1;frame<=6;frame++)motion.api.update(centralPhase+direction*.006*frame,{now:start+frame*16});
  motion.api.update(centralPhase,{now:start+112});
  moving.push(drawBend(centralPhase,0));
  assert(moving.at(-1)>idleBend&&Math.abs(moving.at(-1)-meshBend(full.vertices))<.005,'The actual WebGL card approaches the original full bend in motion');
  assert(motion.api.isAnimating(),'A bent card keeps the shared clock awake while it settles');
  for(let now=start+128;now<=start+720;now+=16)motion.api.update(centralPhase,{now});
  assert(Math.abs(drawBend(centralPhase,0)-idleBend)<1e-6&&!motion.api.isAnimating(),'Stopping gently restores the flatter card and lets the clock sleep');
}
assert(Math.abs(moving[0]-moving[1])<1e-6,'Both scroll directions drive the same bend');
for(const phase of [.13,.36,.62,.9,1.14]){
  const bounds=motion.api.getProjectedMotionBounds(phase);
  for(const amount of [0,.25,.7,1])for(const pose of motion.api.getProjectedCards(phase,amount)){
    const extent=bounds[pose.index];
    assert(pose.minX>=extent.minX-1e-7&&pose.minY>=extent.minY-1e-7&&pose.maxX<=extent.maxX+1e-7&&pose.maxY<=extent.maxY+1e-7,'Motion bounds keep all intermediate edges until the actual exit');
  }
}
motion.api.setVisible(false);
assert(!motion.api.isAnimating(),'A hidden gallery sleeps');
motion.api.setVisible(true);
motion.api.update(centralPhase,{now:3100});
assert(Math.abs(drawBend(centralPhase,0)-idleBend)<1e-6,'Returning restores the settled surface');

// Convex hull separation checks the real projected planes, rather than
// bounding boxes whose corners can overlap even when the images are apart.
function convexHull(vertices){
  const points=vertices.map(({x,y})=>({x,y})).sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x),lower=[],upper=[];
  for(const point of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),point)<=0)lower.pop();lower.push(point);}
  for(const point of points.reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),point)<=0)upper.pop();upper.push(point);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function separatingGap(a,b){
  let gap=-Infinity;
  for(const polygon of[a,b])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],length=Math.hypot(q.x-p.x,q.y-p.y),nx=(p.y-q.y)/length,ny=(q.x-p.x)/length;
    const aa=a.map(point=>point.x*nx+point.y*ny),bb=b.map(point=>point.x*nx+point.y*ny);
    gap=Math.max(gap,Math.min(...bb)-Math.max(...aa),Math.min(...aa)-Math.max(...bb));
  }
  return gap;
}
const gapMetrics=[];
for(const[width,height]of[[375,812],[390,844],[414,896],[768,1024],[1267,713],[1920,960],[2560,1305]]){
  f.api.measure({width,height});
  let minimum=Infinity,pairs=0;
  for(let sample=0;sample<=400;sample++){
    const phase=.13+sample/400*.95,poses=f.api.getProjectedCards(phase);
    for(let index=0;index<poses.length-1;index++){
      const a=poses[index],b=poses[index+1];
      if(!a.visible||!b.visible||!a.front||!b.front)continue;
      const gap=separatingGap(convexHull(a.vertices),convexHull(b.vertices));
      minimum=Math.min(minimum,gap);pairs++;
      const target=width<600?8:18*f.api.getLayout().focal/1130;
      assert(gap>=target,`Adjacent clickable planes retain a visible gap at ${width}x${height}, phase${phase}, pair${index}: ${gap.toFixed(2)}px`);
    }
  }
  assert(pairs>20,'The gap sweep covers adjacent front planes throughout the full spiral');
  const central=f.api.getProjectedCards(centralPhase)[0],layout=f.api.getLayout();
  if(width<600){
    assert(central.minX>=16-1e-5&&central.maxX<=width-16+1e-5,'A fully forward phone plane fits with a16px safe inset');
    assert(layout.foregroundMaxScale>1&&layout.foregroundMaxScale<=2,'Only the foreground boost is responsively constrained');
  }else assert.equal(layout.foregroundMaxScale,2,'Desktop and tablet retain the requested200% scale of the original');
  gapMetrics.push(`${width}x${height}: ${minimum.toFixed(1)}px (${pairs} pairs)`);
}
console.log('Works hover checks passed: softer frontal idle curve, speed-based bend and decay, conservative exit bounds, open front-plane gaps, enlarged hit mesh, relative90%hover and selected-only40% dimming.');
console.log('Minimum projected front/front gaps: '+gapMetrics.join('; '));
