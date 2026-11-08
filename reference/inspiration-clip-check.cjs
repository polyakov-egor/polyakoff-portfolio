/* The real renderer's shape helpers retain exact geometry while avoiding
   clip-path -> none churn around the native-blurred 3D card subtree. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'inspiration.js'),'utf8');
const clipSource=source.slice(source.indexOf('  const clipShapes='),source.indexOf('  function pose('));
assert(clipSource.includes('function clipShape(')&&clipSource.includes('function place('));
const squircle={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'squircle.js'),'utf8'),squircle);
let pathCalls=0;
const context={window:{HeroSquircle:{path(...args){pathCalls++;return squircle.window.HeroSquircle.path(...args);}}},layout:{radius:48}};
vm.runInNewContext(clipSource+';globalThis.helpers={clipShape,place};',context);
function element(){
  const writes=[];let face=null;
  const style=new Proxy({}, {set(target,key,value){if(key==='clipPath')writes.push(value);target[key]=value;return true;}});
  return {style,writes,querySelector:()=>face,setFace(value){face=value;}};
}
const expected=(size,radius)=>`path('${squircle.window.HeroSquircle.path(size,size,radius,1)}')`;
for(const [size,radius] of [[260,48],[320,60],[400,80],[281.234,53.21]]){
  const card=element(),face=element();card.setFace(face);
  context.helpers.place(card,24,100,size,1,radius);
  assert.equal(face.style.clipPath,expected(size,radius),'Original Figma squircle is applied without approximation');
  assert.deepEqual(card.writes,['none'],'Hover-ready outer card never receives a temporary path');
  assert.equal(card.style.transform,`translate3d(24px, 100px, 0) scale(1)`,'Position and scale are unchanged');
  const before=pathCalls;
  for(let i=0;i<120;i++)context.helpers.place(card,24+i,100-i,size,.72+i/500,radius);
  assert.equal(pathCalls,before,'Motion over settled geometry does not request its shape again');
  assert.equal(face.writes.length,1,'120 animated poses retain one clipped face surface');
  assert.deepEqual(card.writes,['none'],'Category motion never alternates outer path/none');
  context.helpers.place(card,30,140,size+1,.9,radius+.25);
  assert.equal(face.style.clipPath,expected(size+1,radius+.25),'Real flip growth changes the exact path once');
  assert.equal(face.writes.length,2);
}
const lateCard=element();
context.helpers.place(lateCard,0,0,260,1,48);
assert.equal(lateCard.style.clipPath,expected(260,48),'No-hover fallback keeps the exact outer silhouette');
const lateFace=element();lateCard.setFace(lateFace);
context.helpers.place(lateCard,0,0,260,1,48);
assert.equal(lateFace.style.clipPath,expected(260,48));
assert.deepEqual(lateCard.writes,[expected(260,48),'none'],'A late hover wrapper migrates the clip only once');
for(const name of ['scene','flipFront']){
  const surface=element(),before=pathCalls;
  for(let i=0;i<120;i++)context.helpers.clipShape(surface,260,260,48);
  assert.equal(surface.writes.length,1,`${name} retains one settled clip assignment`);
  assert.equal(pathCalls,before+1);
}
assert(source.includes('clipShape(scene,currentSize,currentSize,currentRadius)'));
assert(source.includes('clipShape(flipFront,currentSize,currentSize,currentRadius)'));
console.log('Inspiration clip checks passed: exact squircle, stable face ownership, no outer clip churn, cached settled geometry, guarded front/scene writes and non-hover/late-wrapper fallbacks.');
