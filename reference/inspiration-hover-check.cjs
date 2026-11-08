const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname,'../inspiration-hover.js'),'utf8');

function node(className='') {
  const listeners=new Map(),classes=new Set(className.split(' ').filter(Boolean));
  return {
    className,children:[],dataset:{},attributes:{},style:{values:new Map(),setProperty(k,v){this.values.set(k,String(v));}},
    classList:{add(k){classes.add(k);},toggle(k,on){if(on)classes.add(k);else classes.delete(k);},contains(k){return classes.has(k);}},
    append(...children){for(const child of children){if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1);child.parent=this;this.children.push(child);}},
    setAttribute(k,v){this.attributes[k]=String(v);},
    cloneNode(deep){const copy=node(this.className);copy.attributes={...this.attributes};if(deep)for(const child of this.children)copy.append(child.cloneNode(true));return copy;},
    querySelector(selector){for(const child of this.children){if(child.className.split(' ').includes(selector.slice(1)))return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;},
    addEventListener(name,handler){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(handler);},
    dispatch(event){for(const handler of listeners.get(event.type)||[])handler(event);},
  };
}
function setup() {
  let now=0,next=0,canRead=false;const pending=new Map();
  const window=node(),document=node();document.hidden=false;document.createElement=()=>node();
  const reduce=node(),fine=node();reduce.matches=false;fine.matches=true;
  const cards=Array.from({length:3},()=>{
    const card=node('inspiration__card');
    card.append(node('inspiration__media'),node('inspiration__kind'),node('inspiration__glass'));
    card.children[0].append(node('inspiration__image'));
    card.children[2].append(node('inspiration__plus'));
    card.children[0].children[0].attributes.src='./assets/images/inspiration/exact-original.png';
    card.style.width='400px';card.style.height='400px';
    card.style.clipPath='path("original squircle")';
    card.getBoundingClientRect=()=>{assert(canRead,'Layout only read while tracking an actual pointer');return{left:100,top:100,width:400,height:400};};
    return card;
  });
  window.InspirationView={cards};
  const original=cards.map(card=>({media:card.children[0],kind:card.children[1],glass:card.children[2]}));
  const ctx=vm.createContext({window,document,matchMedia:q=>q.includes('reduced')?reduce:fine,performance:{now:()=>now},requestAnimationFrame:fn=>{pending.set(++next,fn);return next;},cancelAnimationFrame:id=>pending.delete(id)});
  vm.runInContext(script,ctx,{filename:'inspiration-hover.js'});
  const pointer=(index,x=500,y=500,type='pointermove',pointerType='mouse')=>{
    canRead=true;cards[index].dispatch({type,clientX:x,clientY:y,pointerType});canRead=false;
  };
  const frames=(observe=()=>{})=>{let count=0;while(pending.size&&count<1000){now+=1000/60;const tasks=[...pending.values()];pending.clear();tasks.forEach(fn=>fn(now));observe(count);count++;}assert(count<1000,'The spring settles and leaves no idle RAF');return count;};
  return {window,document,cards,original,reduce,fine,pending,pointer,frames,api:window.InspirationHover};
}
const p=setup();
assert(p.api,'Hover module installs');assert.equal(p.pending.size,0,'Installation does not start a permanent animation loop');
for(let i=0;i<3;i++) {
  assert.equal(p.cards[i].querySelector('.inspiration__media'),p.original[i].media,'Exact original image slot is moved rather than cloned');
  assert.equal(p.cards[i].querySelector('.inspiration__kind'),p.original[i].kind,'Original SVG identity stays intact');
  assert.equal(p.cards[i].querySelector('.inspiration__glass'),p.original[i].glass,'Original glass plate remains available to the renderer');
  assert.equal(p.cards[i].querySelector('.inspiration__glass-sample'),null,'Native backdrop blur creates no duplicate photo surface');
  assert.equal(p.cards[i].querySelector('.inspiration__tilt-face').querySelector('.inspiration__glass'),p.original[i].glass,'Plate shares the original photo face before hover or flip');
  assert(p.original[i].glass.querySelector('.inspiration__plate-action').querySelector('.inspiration__plus'),'The original plus icon receives its new round outline');
}
p.api.update({active:0,enabled:true});
assert.equal(p.cards[0].dataset.tiltEnabled,'true');assert.equal(p.cards[1].dataset.tiltEnabled,'false');
assert.equal(p.cards[0].style.clipPath,'none','Outer hit target stays stable while the inner card turns');
assert.equal(p.cards[0].querySelector('.inspiration__tilt-face').style.clipPath,'path("original squircle")','Image face receives the exact renderer silhouette');
assert.equal(p.cards[0].querySelector('.inspiration__tilt-body').style.values.get('--inspiration-hover-width'),'400px','Blurred media uses the outer card local width without reading layout');
p.cards[0].style.width='240px';p.cards[0].style.height='240px';p.api.update({active:0,enabled:true});
assert.equal(p.cards[0].querySelector('.inspiration__tilt-body').style.values.get('--inspiration-hover-width'),'240px','Flip growth/resize updates glass media coordinates from cached inline pose');
p.pointer(1);assert.equal(p.pending.size,0,'A previous card cannot tilt');
p.pointer(0);assert(p.pending.size>0);const hoverFrames=p.frames();assert(hoverFrames>1,'Movement uses a spring rather than an abrupt jump');
const body=p.cards[0].querySelector('.inspiration__tilt-body');
assert.equal(body.style.transform,'rotateX(-12.000deg) rotateY(12.000deg) scale(1.0500)','Reference amplitude and hover scale are reached');
assert(p.cards.every(card=>card.querySelector('.inspiration__tilt-shadow')===null),'No detached flat shadow is allocated behind the 3D faces');
assert.equal(body.style.values.get('--inspiration-glare'),'0.5000','Reference glare strength is reached');
assert.equal(p.original[0].glass.style.transform,'translate(6.24px, 6.24px)','Native blur plate retains the reference local X/Y depth cue on one flat face');
assert.equal(p.cards[0].querySelector('.inspiration__glass-sample'),null,'Hover never allocates a copied photo or SVG refraction layer');
p.pointer(0,500,500,'pointerleave');
let returnFrames=0;
p.frames(()=>{
  returnFrames++;
  const xy=/^translate\(([-\d.]+)px, ([-\d.]+)px\)$/.exec(p.original[0].glass.style.transform);
  const scale=Number(/scale\(([-\d.]+)\)/.exec(body.style.transform)[1]);
  assert(xy&&Math.abs(Number(xy[1]))<=30&&Math.abs(Number(xy[2]))<=30,'Every return frame keeps native backdrop blur on a flat 2D surface');
  assert(scale>=1&&scale<=1.05,'Visual lift never shrinks the card below rest during the spring return');
  assert.equal(p.cards[0].querySelector('.inspiration__tilt-shadow'),null,'Hover return never recreates a flat cast shadow');
  assert(Number(body.style.values.get('--inspiration-glare'))>=0,'Glare never becomes negative');
});
assert(returnFrames>30,'Regression covers the complete oscillating return, rather than only its final pose');
assert.equal(p.original[0].glass.style.transform,'translate(0.00px, 0.00px)','Resting plate stays aligned to its photo without a promoted Z plane');
assert.equal(body.style.transform,'rotateX(0.000deg) rotateY(0.000deg) scale(1.0000)','Leaving gently returns to the exact rest pose');
p.pointer(0);p.frames();p.window.dispatch({type:'scroll'});
assert.equal(p.pending.size,0);assert.equal(body.style.transform,'rotateX(0.000deg) rotateY(0.000deg) scale(1.0000)','Native scrolling immediately clears tilt without interception');
p.api.update({active:1,enabled:true});p.pointer(0);assert.equal(p.pending.size,0);p.pointer(1);p.frames();
p.api.update({active:1,enabled:false});assert.equal(p.pending.size,0);assert.equal(p.cards[1].dataset.tiltEnabled,'false','Transitions lock interaction');
p.api.update({active:1,enabled:true});p.pointer(1);p.frames();p.reduce.matches=true;p.reduce.dispatch({type:'change'});
assert.equal(p.pending.size,0);assert.equal(p.cards[1].dataset.tiltEnabled,'false','Reduced motion removes hover rather than keeping motion alive');
p.reduce.matches=false;p.reduce.dispatch({type:'change'});p.fine.matches=false;p.fine.dispatch({type:'change'});p.pointer(1);
assert.equal(p.pending.size,0,'Coarse/touch input preserves native page gestures');
p.fine.matches=true;p.fine.dispatch({type:'change'});p.pointer(1);p.frames();p.document.hidden=true;p.document.dispatch({type:'visibilitychange'});
assert.equal(p.pending.size,0,'A hidden page owns no hover RAF');
const idle=setup();idle.fine.matches=false;idle.api.update({active:0,enabled:false});
let idleWrites=0;
const countWrites=element=>{
  element.style=new Proxy(element.style,{set(object,key,value){idleWrites++;object[key]=value;return true;},get(object,key){if(key==='setProperty')return(...args)=>{idleWrites++;object.setProperty(...args);};return object[key];}});
  element.dataset=new Proxy(element.dataset,{set(object,key,value){idleWrites++;object[key]=value;return true;}});
  for(const child of element.children)countWrites(child);
};
idle.cards.forEach(countWrites);
for(let i=0;i<240;i++)idle.api.update({active:0,enabled:false});
assert.equal(idleWrites,0,'Settled touch/hidden hover layers perform no repeated style or readiness writes');
assert.equal(idle.pending.size,0);
console.log('Inspiration hover checks passed: unchanged spring poses, cached resting touch/hidden layers, exact glass/silhouette, no idle RAF and native gesture resets.');
