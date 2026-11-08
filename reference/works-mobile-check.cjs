const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const fixture=require('./works-gallery-fixture.cjs');

function hull(vertices){
  const points=vertices.map(({x,y})=>({x,y})).sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x),lo=[],hi=[];
  for(const p of points){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}
  for(const p of points.reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}
  return lo.slice(0,-1).concat(hi.slice(0,-1));
}
function gap(a,b){
  let result=-Infinity;
  for(const polygon of[a,b])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],length=Math.hypot(q.x-p.x,q.y-p.y),nx=(p.y-q.y)/length,ny=(q.x-p.x)/length;
    const aa=a.map(p=>p.x*nx+p.y*ny),bb=b.map(p=>p.x*nx+p.y*ny);
    result=Math.max(result,Math.min(...bb)-Math.max(...aa),Math.min(...aa)-Math.max(...bb));
  }
  return result;
}
function clip(polygon,width,height){
  // A full offscreen corner can overlap another full mesh while their actual
  // on-screen portions are separated. Test the raster-visible portions.
  for(const[key,value,greater]of[['x',0,true],['x',width,false],['y',0,true],['y',height,false]]){
    const output=[];if(!polygon.length)return output;
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],ai=greater?a[key]>=value:a[key]<=value,bi=greater?b[key]>=value:b[key]<=value;
      if(ai)output.push(a);
      if(ai!==bi){const t=(value-a[key])/(b[key]-a[key]);output.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
    }
    polygon=output;
  }
  return polygon;
}
function area(polygon){return Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p.x*q.y-q.x*p.y;},0))/2;}

// Safari's bars change CSS viewport height independently of screen resolution.
// Cover every visible pair, including rear wraps missed by front-only tests.
const f=fixture(),metrics=[];
for(const[width,height]of[[320,568],[375,667],[375,812],[390,600],[390,844],[410,693],[410,887],[414,700],[414,896],[430,740],[440,956],[599,800]]){
  f.api.measure({width,height});let minimum=Infinity,pairs=0;
  for(let sample=0;sample<=400;sample++){
    const phase=.13+sample/400*.95,poses=f.api.getProjectedCards(phase),polys=poses.map(p=>p.visible?clip(hull(p.vertices),width,height):[]);
    for(let i=0;i<poses.length;i++)if(area(polys[i])>1)for(let j=i+1;j<poses.length;j++)if(area(polys[j])>1&&(poses[i].front||poses[j].front)){
      const separation=gap(polys[i],polys[j]);minimum=Math.min(minimum,separation);pairs++;
      assert(separation>=16,`Every visible front-involved phone pair keeps space at ${width}×${height}, phase${phase}, pair${i}/${j}: ${separation}px`);
    }
  }
  assert(pairs>80,'Sweep covers multiple visible cards over the full flight');
  metrics.push(`${width}×${height} ≥${minimum.toFixed(1)}px`);
  for(const phase of [.13,.33457,.62,.75462,1,1.2,2]){
    const mesh=f.api.getProjectedCards(phase),bounds=f.api.getProjectedCardBounds(phase);
    for(let i=0;i<mesh.length;i++)for(const key of['minX','maxX','minY','maxY'])assert(Math.abs(mesh[i][key]-bounds[i][key])<1e-7,'Scroll handoff bounds match the newly spaced real mesh');
  }
}
// A spacing fix must preserve the recognizable surrounding helix, not leave
// a lone card in the middle of a short phone viewport.
for(const[width,height]of[[414,700],[414,896]]){
  f.api.measure({width,height});
  for(const phase of[.34842,.62,.65]){
    const visible=f.api.getProjectedCards(phase).filter(p=>area(clip(hull(p.vertices),width,height))>200);
    assert(visible.length>=3,`The helix retains at least three recognizable cards at ${width}×${height}, phase${phase}`);
  }
}

// These hashes capture the approved local200% geometry derived from parentCommit.
// They are not a claim that the new geometry already has a published source SHA.
// Hash every vertex, UV, perspective distance, facing and projected bound
// at the maximum scroll bend. A frontal card can relax toward half that curve.
const baseline=require('./works-mobile-baseline.json');
for(const entry of baseline.frames){
  f.api.measure({width:entry.width,height:entry.height});
  const digest=crypto.createHash('sha256').update(JSON.stringify(baseline.phases.map(p=>f.api.getProjectedCards(p,1)))).digest('hex');
  assert.equal(digest,entry.sha256,`Maximum scroll bend retains the approved200% desktop/tablet geometry at ${entry.width}×${entry.height}`);
}

const t=fixture(),phase=16.8/54.744;
t.api.measure({width:414,height:700});t.api.update(phase,{now:0});
const target=t.api.getProjectedCards(phase)[0].vertices[4*25+12];
function eventPoint(p,id=1){return{pointerType:'touch',pointerId:id,isPrimary:true,clientX:p.x,clientY:p.y};}
function tap(p,id=1){t.canvas.dispatch('pointerdown',eventPoint(p,id));t.canvas.dispatch('pointerup',eventPoint(p,id));}
tap(target);
assert.equal(t.pill.getAttribute('aria-hidden'),'false');
assert.equal(t.pill.dataset.sequence,'1');
t.canvas.dispatch('pointerleave',eventPoint(target));
t.canvas.dispatch('lostpointercapture',eventPoint(target));
t.pill.dispatch('pointerleave',eventPoint(target));
t.list.children[0].dispatch('pointerleave',eventPoint(target));
t.canvas.dispatch('pointermove',{pointerType:'mouse',sourceCapabilities:{firesTouchEvents:true},clientX:0,clientY:0});
t.canvas.dispatch('pointerleave',{pointerType:'mouse',clientX:0,clientY:0});
t.list.children[0].dispatch('click',{pointerType:'touch',sourceCapabilities:{firesTouchEvents:true}});
assert.equal(t.pill.getAttribute('aria-hidden'),'false','Lift, implicit capture release and compatibility mouse events cannot dismiss a tap selection');
t.api.update(phase,{now:100});t.api.update(phase,{now:500});
assert.equal(t.pill.getAttribute('aria-hidden'),'false','Selection persists after its shared clock settles');
t.window.dispatch('blur');
assert.equal(t.pill.getAttribute('aria-hidden'),'true');

t.canvas.dispatch('pointerdown',eventPoint(target,2));
t.canvas.dispatch('pointermove',eventPoint({x:target.x+40,y:target.y-35},2));
t.canvas.dispatch('pointermove',eventPoint(target,2));
t.canvas.dispatch('pointerup',eventPoint(target,2));
assert.equal(t.pill.getAttribute('aria-hidden'),'true','A swipe that returns to its start is not mistaken for a tap');
t.canvas.dispatch('pointerdown',eventPoint(target,3));t.canvas.dispatch('pointercancel',eventPoint(target,3));t.canvas.dispatch('pointerup',eventPoint(target,3));
assert.equal(t.pill.getAttribute('aria-hidden'),'true','Browser scrolling cancels contact without selecting a project');
tap(target,4);tap({x:0,y:0},5);
assert.equal(t.pill.getAttribute('aria-hidden'),'true','Tapping empty background dismisses the selected project');
tap(target,6);t.window.dispatch('pointerdown',{...eventPoint({x:0,y:0},7),target:t.window});
assert.equal(t.pill.getAttribute('aria-hidden'),'true','A touch outside the canvas and pill dismisses the selection');

// Hit testing follows the rendered canvas rectangle, including visual scaling.
t.canvas.getBoundingClientRect=()=>({left:13,top:61,width:207,height:350});
tap({x:13+target.x/2,y:61+target.y/2},8);
assert.equal(t.pill.dataset.sequence,'1');
assert.equal(t.pill.getAttribute('aria-hidden'),'false','Scaled CSS canvas taps hit the same projected mesh');
t.setTime(2000);
t.canvas.dispatch('pointermove',{pointerType:'mouse',clientX:13,clientY:61});
assert.equal(t.pill.getAttribute('aria-hidden'),'true','A genuine mouse can take over again on a hybrid device');
t.canvas.getBoundingClientRect=()=>({left:0,top:0});
tap(target,9);t.api.update(2,{now:600});
assert.equal(t.pill.getAttribute('aria-hidden'),'true','A project leaving the front arc clears persistent touch details');
assert(!t.api.isAnimating()||t.viewport.dataset.hoveredSequence==='','No hidden touch selection survives the final card exit');

// A native DOM figure is the actual hit target when WebGL is unavailable.
const dom=fixture(1.025,1,source=>source,false);
dom.api.measure({width:414,height:700});dom.api.update(phase,{now:0});
assert(!dom.viewport.classList.contains('works-has-canvas'));
const domCard=dom.list.children[0];
for(const clickEvent of[{pointerType:'touch'},{}]){
  domCard.dispatch('pointerdown',{pointerType:'touch',pointerId:10,isPrimary:true});
  domCard.dispatch('click',clickEvent);
  domCard.dispatch('pointerleave',{pointerType:'touch'});
  assert.equal(dom.pill.getAttribute('aria-hidden'),'false','DOM fallback touch clicks latch details, including compatibility clicks without pointerType');
  dom.window.dispatch('pointerdown',{pointerType:'touch',target:dom.window});
  assert.equal(dom.pill.getAttribute('aria-hidden'),'true','The same outside-tap dismissal works without a canvas renderer');
}

const blurred=fixture();blurred.api.measure({width:1267,height:713});blurred.api.update(phase,{now:0});
const mouseTarget=blurred.api.getProjectedCards(phase)[0].vertices[4*25+12];
blurred.canvas.dispatch('pointermove',{pointerType:'mouse',clientX:mouseTarget.x,clientY:mouseTarget.y});
blurred.api.update(phase,{now:100});blurred.api.update(phase,{now:500});
assert.equal(blurred.pill.getAttribute('aria-hidden'),'false');
blurred.window.dispatch('blur');
blurred.api.update(phase,{now:600});blurred.api.update(phase,{now:1000});
assert.equal(blurred.pill.getAttribute('aria-hidden'),'true','A shared frame after blur cannot reselect the stale mouse coordinate');
assert.equal(blurred.viewport.dataset.hoveredSequence,'');

console.log('Mobile Works checks passed: viewport-clipped front-involved gaps across Safari heights, retained helix trace and approved maximum-bend geometry; touch capture/compatibility events, swipes, cancellation, dismissal, CSS-scaled hit testing and hybrid mouse recovery.');
console.log(metrics.join('; '));
