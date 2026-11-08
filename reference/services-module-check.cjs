/* Approved carousel bundle: vertical input remains native, horizontal input
   rotates one shared scene, and the host can suspend all hidden work. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

class Node {
  constructor(){
    this.dataset={};this.attributes={};this.children=[];this.listeners=new Map();this.queries=new Map();this.matches=new Set();
    const values=new Map();this.style={setProperty:(key,value)=>values.set(key,String(value)),getPropertyValue:key=>values.get(key)||'',getPropertyPriority:()=>'',removeProperty:key=>values.delete(key)};
    const classes=new Set();this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)};
    this.offsetWidth=360;this.offsetHeight=420;
  }
  setAttribute(name,value){this.attributes[name]=String(value);}
  removeAttribute(name){delete this.attributes[name];}
  append(node){node.parent=this;this.children.push(node);}
  remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);}
  get firstElementChild(){return this.children[0];}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){return this.queries.get(selector)||[];}
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
  removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(value=>value!==fn));}
  dispatchEvent(event){for(const fn of this.listeners.get(event.type)||[])fn(event);return !event.defaultPrevented;}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  closest(selector){return selector.split(',').some(value=>this.matches.has(value.trim()))?this:this.parent?.closest(selector)||null;}
  focus(options){this.ownerDocument.focusCalls.push({node:this,options});if(!options?.preventScroll)this.ownerDocument.autoScrolls++;this.ownerDocument.activeElement=this;}
  getBoundingClientRect(){return{left:0,top:0,width:480,height:420};}
  setPointerCapture(id){this.capture=id;}
  hasPointerCapture(id){return this.capture===id;}
  releasePointerCapture(){this.capture=null;}
}
const root=new Node(),deck=new Node(),doc=new Node(),view=new Node();
root.append(deck);doc.defaultView=view;doc.hidden=false;doc.fonts={ready:Promise.resolve()};doc.focusCalls=[];doc.autoScrolls=0;
doc.createElement=()=>create();doc.activeElement=doc;
const create=()=>{const node=new Node();node.ownerDocument=doc;return node;};
root.ownerDocument=deck.ownerDocument=doc;
function slot(parent,selector){const node=create();node.matches.add(selector);parent.append(node);parent.queries.set(selector,[node]);return node;}
root.queries.set('[data-services-deck]',[deck]);
for(const selector of['[data-services-counter]','[data-services-status]'])slot(root,selector);
const cards=['web','app','motion'].map((id,index)=>{
  const card=create();card.matches.add('[data-service-id]');card.dataset={serviceId:id,title:id,position:index===0?'active':index===1?'next':'previous'};deck.append(card);
  for(const selector of['[data-services-hover]','.services-card__rotator','[data-services-side]','[data-services-front]','[data-services-back]','.services-card__image','.services-card__caption','.services-card__shadow','[data-services-select]','[data-services-flip]','[data-services-close]'])slot(card,selector);
  card.querySelector('[data-services-side]').append(create());
  for(const [control,face]of[['[data-services-flip]','[data-services-front]'],['[data-services-close]','[data-services-back]']]){
    const node=card.querySelector(control);node.remove();card.querySelector(face).append(node);
  }
  const description=slot(card.querySelector('[data-services-back]'),'.services-card__description');
  description.matches.add('[data-services-back] .services-card__description');
  return card;
});
root.queries.set('[data-service-id]',cards);root.queries.set('[data-services-word]',[]);
root.queries.set('[data-services-surface]',cards.flatMap(card=>['[data-services-side]','[data-services-front]','[data-services-back]'].map(selector=>card.querySelector(selector))));
doc.querySelectorAll=selector=>selector==='[data-services]'?[root]:[];
let time=0;const raf=new Map(),observers=[];
view.requestAnimationFrame=fn=>{const id=++view.nextFrame;raf.set(id,fn);return id;};view.nextFrame=0;
view.cancelAnimationFrame=id=>raf.delete(id);view.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
view.getSelection=()=>({isCollapsed:true});
const variables={'--services-side-width':131,'--services-side-height':300,'--services-side-offset':174.5,'--services-side-top':60,'--services-radius':48};
const scope={window:view,document:doc,Element:Node,AbortController,performance:{now:()=>time},
  getComputedStyle:()=>({getPropertyValue:name=>String(variables[name]||0)}),
  CustomEvent:class {constructor(type,options={}){Object.assign(this,{type},options);}},
  ResizeObserver:class {observe(){}disconnect(){}},
  IntersectionObserver:class {constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services.js'),'utf8'),scope);
const api=view.ServicesScreens.get(root);assert(api);assert.strictEqual(view.ServicesScreens.mount(root),api,'Mount remains idempotent');
assert.equal(raf.size,0,'Mounting far below the hero does not start a background clock');
api.setVisible(false);observers[0].fn([{isIntersecting:true}]);
assert.equal(raf.size,0,'A transformed tall panel intersecting behind Works stays asleep');
api.setVisible(true);assert.equal(raf.size,1);
function frame(){time+=1000/60;const jobs=[...raf.values()];raf.clear();for(const fn of jobs)fn(time);}
function settle(){for(let i=0;raf.size&&i<600;i++)frame();assert.equal(raf.size,0,'Spring settles without an idle RAF');}
settle();assert.equal(api.activeId,'web');
function event(type,props={}){const e={type,target:deck,isPrimary:true,button:0,pointerId:1,pointerType:'touch',cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},stopImmediatePropagation(){},...props};deck.dispatchEvent(e);return e;}

const appSelect=cards[1].querySelector('[data-services-select]');
event('pointerdown',{target:appSelect,pointerType:'mouse',clientX:400,clientY:250});
assert(event('mousedown',{target:appSelect}).defaultPrevented,'Native mouse focus cannot scroll a partly visible side button into view');
event('pointerup',{target:appSelect,pointerType:'mouse',clientX:400,clientY:250});
const initialFocus=doc.focusCalls.length;
assert(event('click',{target:appSelect,detail:1}).defaultPrevented,'Handled side selection cancels the original button default');
settle();assert.equal(api.activeId,'app');
assert.equal(doc.focusCalls.length,initialFocus,'Pointer selection never focuses controls inside moving cards');
const appOpen=cards[1].querySelector('[data-services-flip]'),appClose=cards[1].querySelector('[data-services-close]');
assert(event('click',{target:appOpen,detail:1}).defaultPrevented);settle();
assert.equal(cards[1].dataset.flipped,'true');assert.equal(doc.focusCalls.length,initialFocus,'Pointer flip never moves focus into a turning face');
event('click',{target:appClose,detail:1});settle();

doc.activeElement=appOpen;
event('pointerdown',{target:appSelect,clientX:200,clientY:250});
assert.equal(doc.activeElement,deck,'An already focused moving child is parked on the stable deck without scrolling');
assert.equal(doc.focusCalls.at(-1).options.preventScroll,true);
event('pointercancel');settle();

const webSelect=cards[0].querySelector('[data-services-select]');
assert(event('click',{target:webSelect,detail:0}).defaultPrevented,'Keyboard button activation still selects a service');
settle();assert.equal(api.activeId,'web');assert.equal(doc.activeElement,cards[0].querySelector('[data-services-flip]'),'Keyboard selection transfers focus to the newly active control');
assert(event('click',{target:cards[0].querySelector('[data-services-flip]'),detail:0}).defaultPrevented);
settle();assert.equal(doc.activeElement,cards[0].querySelector('[data-services-close]'),'Keyboard flip reaches the opposite accessible control');

const description=cards[0].querySelector('[data-services-back]').querySelector('.services-card__description');
assert.equal(event('mousedown',{target:description}).defaultPrevented,false,'Description text retains native selection');
event('pointerdown',{target:description,clientX:150,clientY:200});
assert.equal(event('pointermove',{target:description,clientX:70,clientY:198}).defaultPrevented,false,'Dragging selected description text is not hijacked by the orbit');
event('pointercancel');settle();
const link=create();link.matches.add('a');description.append(link);
event('pointerdown',{target:link,clientX:150,clientY:200});
assert.equal(event('mousedown',{target:link}).defaultPrevented,false);
assert.equal(event('click',{target:link,detail:1}).defaultPrevented,false,'Links and editable controls keep their native actions');
const priorSelection=view.getSelection;
view.getSelection=()=>({isCollapsed:false,toString:()=> 'selected text',anchorNode:description});
assert.equal(event('click',{target:description,detail:1}).defaultPrevented,false,'Finishing text selection does not flip a card');
view.getSelection=priorSelection;
api.flip(false);settle();doc.activeElement=doc;
event('pointerdown',{clientX:200,clientY:300});
assert.equal(event('pointermove',{clientX:198,clientY:200}).defaultPrevented,false,'Vertical touch belongs to document scrolling');
event('pointercancel');settle();assert.equal(api.activeId,'web');
event('pointerdown',{clientX:250,clientY:250});
assert(event('pointermove',{clientX:130,clientY:248}).defaultPrevented,'Horizontal intent belongs to the carousel');
event('pointerup',{clientX:130,clientY:248});settle();assert.equal(api.activeId,'app');
assert(api.flip(true));settle();assert.equal(cards[1].dataset.flipped,'true');
assert.equal(cards[1].querySelector('[data-services-front]').inert,true);
assert.equal(cards[1].querySelector('[data-services-back]').inert,false);
assert(event('keydown',{key:'Home',target:deck}).defaultPrevented,'Focused Home belongs only to the carousel');
settle();assert.equal(api.activeId,'web');
api.select('motion');assert(raf.size);api.setVisible(false);assert.equal(raf.size,0,'Leaving Services suspends an in-flight spring immediately');
api.setVisible(true);settle();assert.equal(api.activeId,'motion');
assert.equal(doc.autoScrolls,0,'Every explicit focus transfer opts out of page scrolling');
assert(doc.focusCalls.every(call=>call.options?.preventScroll),'All pointer and keyboard focus transfers preserve page position');
assert.equal(view.listeners.get('wheel'),undefined,'The module adds no global wheel interception');
assert.equal(deck.listeners.get('wheel'),undefined,'The module adds no deck wheel interception');
api.destroy();assert.equal(raf.size,0);assert.equal(view.ServicesScreens.get(root),undefined);
console.log('Services module checks passed: stable pointer focus, keyboard focus/flip, native text/link/vertical gestures, horizontal orbit, inert sides, scoped Home, hidden panel and sleeping shared spring.');
