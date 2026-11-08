const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element(className = '') {
  const attributes = new Map(), listeners = new Map(), values = new Map();
  const node = { className, children: [], parentElement: null, dataset: {}, hidden: false,
    style: {setProperty:(key,value)=>values.set(key,String(value)),getPropertyValue:key=>values.get(key)||''},
    append(...children) { for (const child of children) { if (child.parentElement) child.parentElement.children.splice(child.parentElement.children.indexOf(child),1); child.parentElement=this; this.children.push(child); } },
    setAttribute:(key,value)=>attributes.set(key,String(value)), getAttribute:key=>attributes.get(key)??null,
    addEventListener(name,listener) { if (!listeners.has(name)) listeners.set(name,[]); listeners.get(name).push(listener); },
    dispatch(event) { for (const listener of listeners.get(event.type)||[]) listener(event); },
    querySelector(selector) { return this.children.find(child=>child.className.split(/\s+/).includes(selector.slice(1))) || this.children.map(child=>child.querySelector(selector)).find(Boolean) || null; },
    getBoundingClientRect() { throw Error('Flip frames must not read layout'); }
  };
  node.styleWrites=0;
  node.style=new Proxy(node.style,{set(target,key,value){node.styleWrites++;target[key]=value;return true;}});
  node.classList = {add(name){node.className += ` ${name}`;},contains(name){return node.className.split(/\s+/).includes(name);}};
  return node;
}
const root=element('inspiration');root.style.setProperty('--inspiration-card-radius','80px');
const cards=Array.from({length:3},()=>{
  const card=element('inspiration__card is-hover-ready'),body=element('inspiration__tilt-body'),face=element('inspiration__tilt-face'),glass=element('inspiration__glass');
  card.style.width='400px';face.style.clipPath='path("exact cached silhouette")';body.style.transform='rotateX(4deg) rotateY(8deg) scale(1.05)';face.append(glass);body.append(face);card.append(body);return card;
});
const original=cards.map(card=>({body:card.querySelector('.inspiration__tilt-body'),face:card.querySelector('.inspiration__tilt-face'),glass:card.querySelector('.inspiration__glass')}));
const window=element(),document=element();window.dispatchEvent=event=>window.dispatch(event);document.hidden=false;document.createElement=()=>element();document.createElementNS=()=>element();
const reduce=element();reduce.matches=false;
window.InspirationView={root,cards};
let geometryCalls=0;window.InspirationFlipThickness={sideStrips({size,depth,radius}){
  assert.equal(size,400);assert.equal(depth,2);assert.equal(radius,80);geometryCalls++;
  return [{x:200,y:0,length:400,angle:0,depth:2},{x:400,y:200,length:400,angle:90,depth:2},{x:200,y:400,length:400,angle:180,depth:2},{x:0,y:200,length:400,angle:-90,depth:2}];
}};
let now=0,wakes=0;window.addEventListener('inspiration:ready',()=>wakes++);
const context=vm.createContext({window,document,matchMedia:()=>reduce,performance:{now:()=>now},CustomEvent:class{constructor(type){this.type=type;}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../inspiration-card-flip.js'),'utf8'),context);
const api=window.InspirationCardFlip;assert(api);
assert.equal(geometryCalls,0,'Side geometry is not allocated during a dormant chapter or the initial Hero flip');
for(const card of cards){
  const wall=card.querySelector('.inspiration__card-flip-wall');
  assert.equal(wall.parentElement,card.querySelector('.inspiration__card-flip-rotor'),'Edges and both faces share the same 3D click/recession transform');
  assert.equal(wall.children.length,0,'Dormant cards add no edge strip planes');
}
function update(active=0,enabled=true,options={}) { return api.update({active,enabled,now,...options}); }
function settle(active=0,enabled=true,observe=()=>{}) {
  let count=0,result;
  do { now+=1000/60; result=update(active,enabled);observe(result);count++; } while(result.animating&&count<500);
  assert(count<500,'The shared spring settles without an idle loop');return count;
}
function event(type,extra={}) {return{type,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};}
for(let index=0;index<3;index++){
  update(index);
  assert.equal(cards[index].dataset.flipEnabled,'true');
  assert(cards.every((card,i)=>i===index||card.dataset.flipEnabled==='false'));
  const click=event('click');cards[index].dispatch(click);
  assert(click.prevented&&click.stopped,'A card consumes its own click');
  assert.equal(cards[index].dataset.contentSide,'back');
  assert.equal(cards[index].querySelector('.inspiration__card-flip-content').textContent,'Content');
  assert.equal(cards[index].querySelector('.inspiration__card-flip-back').style.clipPath,'path("exact cached silhouette")');
  assert.equal(cards[index].querySelector('.inspiration__tilt-body'),original[index].body,'The original hover body remains unchanged');
  assert.equal(original[index].body.style.transform,'rotateX(4deg) rotateY(8deg) scale(1.05)','Click never overwrites the existing hover tilt');
  let movingWall=false;
  const count=settle(index,true,()=>{if(cards[index].querySelector('.inspiration__card-flip-wall').style.visibility==='visible')movingWall=true;});assert(count>30,'The reference spring produces a real smooth half turn');
  assert(movingWall,'Real side geometry is visible while the card turns through its edge');
  const wall=cards[index].querySelector('.inspiration__card-flip-wall');
  assert.equal(wall.children.length,4);
  assert.equal(wall.style.visibility,'hidden','Side strips sleep at the settled front/back pose');
  const edgeWrites=wall.children.reduce((sum,node)=>sum+node.styleWrites,0);
  assert(wall.children.every(node=>node.style.height==='2px'&&node.style.transform.includes('rotateX(90deg)')),'Each side is a physical two-pixel plane spanning the front/back depth');
  assert.equal(cards[index].dataset.contentFlip,'180.00000');
  assert.equal(cards[index].dataset.contentScale,'1.00000');
  const enter=event('keydown',{key:'Enter'});cards[index].dispatch(enter);assert(enter.prevented&&enter.stopped);
  settle(index);assert.equal(cards[index].dataset.contentFlip,'0.00000');
  assert.equal(wall.children.reduce((sum,node)=>sum+node.styleWrites,0),edgeWrites,'Rotation/recession frames never repaint or reproject individual edge strips');
}
assert.equal(geometryCalls,3,'Each clicked card builds its side geometry once, not once per animation frame');
update(0);cards[0].dispatch(event('click'));settle(0);
assert(api.resetForNavigation(1,now));
let minimumScale=1;
now+=16;const closing=update(1,false);
assert(closing.animating,'Category transition can run while the old card returns');
assert(Number(cards[0].dataset.contentFlip)>0,'Disabling clicks never snaps the old face to zero');
settle(1,false,()=>minimumScale=Math.min(minimumScale,Number(cards[0].dataset.contentScale)));
assert(minimumScale<.98,'The outgoing card visibly recedes while turning back');
assert.equal(cards[0].dataset.contentFlip,'0.00000');assert.equal(cards[0].dataset.contentScale,'1.00000');
assert(!api.resetForNavigation(1,now),'An already front-facing card adds no navigation animation');
update(1);cards[1].dispatch(event('pointerdown',{clientX:0,clientY:0,button:0}));cards[1].dispatch(event('pointermove',{clientX:20,clientY:0}));cards[1].dispatch(event('pointerup',{clientX:20,clientY:0}));cards[1].dispatch(event('click'));
assert.equal(cards[1].dataset.contentSide,'front','A scroll/swipe is not also a click');
cards[1].dispatch(event('pointerdown',{clientX:0,clientY:0,button:0}));cards[1].dispatch(event('pointerup',{clientX:1,clientY:1}));cards[1].dispatch(event('click'));settle(1);
assert.equal(cards[1].dataset.contentSide,'back','A normal tap still flips');
update(1,true,{restore:true});assert.equal(cards[1].dataset.contentFlip,'0.00000','History restore starts from the normal image');
// A real touch tap must not depend on the browser synthesizing click after a
// prevented 1px touchmove, and an optional compatibility click cannot flip twice.
update(1);cards[1].dispatch(event('pointerdown',{pointerType:'touch',clientX:40,clientY:40,button:0}));
cards[1].dispatch(event('pointermove',{pointerType:'touch',clientX:40,clientY:41}));
const jitterUp=event('pointerup',{pointerType:'touch',clientX:40,clientY:41});cards[1].dispatch(jitterUp);
assert.equal(cards[1].dataset.contentSide,'back','A 1px-jitter touch tap flips even when Safari sends no click');
assert(jitterUp.prevented&&jitterUp.stopped);
cards[1].dispatch(event('click',{pointerType:'touch'}));
assert.equal(cards[1].dataset.contentSide,'back','The compatibility click does not undo the touch tap');settle(1);
cards[1].dispatch(event('pointerdown',{pointerType:'touch',clientX:40,clientY:40,button:0}));
cards[1].dispatch(event('pointerup',{pointerType:'touch',clientX:40,clientY:39}));
assert.equal(cards[1].dataset.contentSide,'front','A subsequent touch tap still toggles in the reverse direction');
cards[1].dispatch(event('click',{pointerType:'touch'}));settle(1);
cards[1].dispatch(event('pointerdown',{pointerType:'touch',clientX:40,clientY:40,button:0}));
cards[1].dispatch(event('pointermove',{pointerType:'touch',clientX:40,clientY:60}));
cards[1].dispatch(event('pointermove',{pointerType:'touch',clientX:40,clientY:40}));
cards[1].dispatch(event('pointerup',{pointerType:'touch',clientX:40,clientY:40}));
cards[1].dispatch(event('click',{pointerType:'touch'}));
assert.equal(cards[1].dataset.contentSide,'front','A swipe returning to its start remains a swipe based on maximum movement');
cards[1].dispatch(event('pointerdown',{pointerType:'touch',clientX:40,clientY:40,button:0}));
cards[1].dispatch(event('pointercancel',{pointerType:'touch'}));
cards[1].dispatch(event('pointerup',{pointerType:'touch',clientX:40,clientY:40}));
cards[1].dispatch(event('click',{pointerType:'touch'}));
assert.equal(cards[1].dataset.contentSide,'front','A cancelled touch cannot produce a tap or compatibility flip');
cards[1].dispatch(event('pointerdown',{pointerType:'touch',clientX:40,clientY:40,button:0}));update(1,false);
cards[1].dispatch(event('pointerup',{pointerType:'touch',clientX:40,clientY:40}));cards[1].dispatch(event('click',{pointerType:'touch'}));
assert.equal(cards[1].dataset.contentSide,'front','A card losing its active context before touchup cannot flip');
reduce.matches=true;update(2,true,{reducedMotion:true});cards[2].dispatch(event('keydown',{key:' '}));
assert.equal(cards[2].dataset.contentFlip,'180.00000','Reduced motion preserves click functionality without spinning');
api.resetForNavigation(-1,now);assert.equal(cards[2].dataset.contentFlip,'0.00000');
reduce.matches=false;update(2);cards[2].dispatch(event('click'));settle(2);
window.dispatch(event('blur'));assert.equal(cards[2].dataset.contentFlip,'0.00000');
assert.equal(cards[2].dataset.flipEnabled,'true','Blur resets the face without losing the settled chapter readiness');
const beforeFocus=wakes;window.dispatch(event('focus'));assert(wakes>beforeFocus,'Focus wakes the existing owner clock');
document.hidden=true;document.dispatch(event('visibilitychange'));assert.equal(cards[2].dataset.flipEnabled,'false');
const beforeVisible=wakes;document.hidden=false;document.dispatch(event('visibilitychange'));assert(wakes>beforeVisible);update(2);
assert.equal(cards[2].dataset.flipEnabled,'true','Returning to a visible tab restores click readiness without scrolling');
root.hidden=true;update(-1,false);
assert(cards.every(card=>card.dataset.contentFlip==='0.00000'&&card.dataset.flipEnabled==='false'),'A hidden chapter leaves no active back face');
assert(wakes>0,'Clicks wake the existing story owner rather than installing another RAF');
const css=fs.readFileSync(path.join(__dirname,'../inspiration-card-flip.css'),'utf8');
assert(/background:\s*#fff/.test(css));assert(/font-size:\s*12px;\s*text-transform:\s*none/.test(css));
assert(/backface-visibility:\s*hidden/.test(css));assert(!/transition:.*transform/.test(css),'The shared spring owns the rotation');
console.log('Inspiration card flip checks passed: three reversible spring flips, retained hover/glass, exact back silhouette, lazy shared-rotor2px side planes with no per-frame geometry writes, same-gesture navigation recession, keyboard/tap/drag distinction, reduced motion and no independent RAF.');
