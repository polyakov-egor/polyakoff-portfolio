const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const{createHash}=require('node:crypto');
const root=path.join(__dirname,'..');
const current=fs.readFileSync(path.join(root,'works-gallery.js'),'utf8');
const baselinePath=path.resolve(root,'../sites/polyakoff-portfolio/dist/works-gallery.js');
const baseline=fs.readFileSync(baselinePath,'utf8');

function fixture(source,width=1267,height=713,{deferred=false}={}){
  const stats={draws:0,copies:0,projections:0,hitTests:0,rects:0,styles:0,quads:0},timers=new Map();
  let timerId=0,textureId=0,texture=null,clip=null,brightness=1,frame=[];
  const gl={createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,useProgram(){},createBuffer:()=>({}),bindBuffer(){},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},
    bufferData(_,data){if(data instanceof Float32Array&&data.length===900)clip=data;},getUniformLocation:(_,name)=>name,uniform1i(){},enable(){},depthFunc(){},blendFunc(){},clearColor(){},createTexture:()=>({id:++textureId}),bindTexture(_,value){texture=value;},texParameteri(){},getParameter:()=>4096,texImage2D(){},viewport(){},
    clear(){frame=[];},uniform4fv(){},uniform1f(name,value){if(name==='uBrightness')brightness=value;},drawElements(){stats.draws++;frame.push({texture:texture.id,clip:Array.from(clip),clipRef:clip,brightness});}};
  const context2d={clearRect(){},drawImage(){stats.copies++;}};
  function element(tag='div'){
    const attrs=new Map(),listeners=new Map(),styleValues=new Map();
    const style=new Proxy({setProperty(key,value){stats.styles++;styleValues.set(key,String(value));},removeProperty(key){stats.styles++;styleValues.delete(key);},getPropertyValue:key=>styleValues.get(key)||''},{set(object,key,value){stats.styles++;object[key]=value;return true;}});
    const node={tagName:tag.toUpperCase(),className:'',dataset:{},children:[],style,clientWidth:width,clientHeight:height,complete:true,naturalWidth:960,naturalHeight:500,
      get firstChild(){return this.children[0]||null;},append(...children){this.children.push(...children);},removeChild(child){this.children.splice(this.children.indexOf(child),1);},
      setAttribute(key,value){attrs.set(key,String(value));},getAttribute:key=>attrs.get(key)??null,removeAttribute:key=>attrs.delete(key),
      addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},dispatch(type,values={}){for(const fn of listeners.get(type)||[])fn({type,...values});},
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;},querySelectorAll(selector){return this.children.flatMap(child=>[...(selector.startsWith('.')?child.classList.contains(selector.slice(1)):child.getAttribute(selector.slice(1,-1))!==null)?[child]:[],...child.querySelectorAll(selector)]);},
      contains(other){return other===this||this.children.some(child=>child.contains(other));},getBoundingClientRect(){stats.rects++;return{left:0,top:0,width,height};},getContext:kind=>kind==='2d'?context2d:gl};
    const classes=()=>node.className.split(/\s+/).filter(Boolean);
    node.classList={contains:name=>classes().includes(name),add(...names){node.className=[...new Set([...classes(),...names])].join(' ');},remove(...names){node.className=classes().filter(name=>!names.includes(name)).join(' ');},toggle(name,on){const enabled=on??!this.contains(name);this[enabled?'add':'remove'](name);return enabled;}};
    return node;
  }
  const body=element(),viewport=element(),list=element();viewport.setAttribute('data-works-gallery','');list.setAttribute('data-works-cards','');viewport.append(list);body.append(viewport);
  const document=element('document');document.hidden=false;document.createElement=element;document.querySelector=selector=>body.querySelector(selector);
  const window=element('window');window.devicePixelRatio=1;window.dispatchEvent=event=>window.dispatch(event.type,event);
  const prepare=[];if(deferred)window.ChapterAssets={register(_,fn){prepare.push(fn);}};
  const instrumented=source.replace(/function projectCard\([^\n]*\)\{/,'$& stats.projections++;').replace('function hitTest(x,y){','$& stats.hitTests++;').replace('function quadTransform(pose){','$& stats.quads++;');
  vm.runInNewContext(instrumented,{document,window,Float32Array,Uint16Array,stats,setTimeout(callback,delay){timers.set(++timerId,{callback,delay});return timerId;},clearTimeout(id){timers.delete(id);},requestAnimationFrame(){throw Error('The gallery must share the story clock');},CustomEvent:class{constructor(type){this.type=type;}}});
  const api=window.WorksGallery;api.measure({width,height});
  const canvas=viewport.querySelector('.works-gallery-canvas'),pill=viewport.querySelector('.works-project');
  return{api,stats,document,window,viewport,list,canvas,pill,timers,prepare,frame:()=>frame,reset(){for(const key of Object.keys(stats))stats[key]=0;}};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const frameValues=f=>f.frame().map(({clipRef,...values})=>values);
const approvedGeometry=createHash('sha256'),currentGeometry=createHash('sha256');
const recordGeometry=(hash,f,phase)=>hash.update(JSON.stringify({poses:f.api.getProjectedCards(phase),frame:frameValues(f),transforms:f.list.children.map(node=>node.style.transform)}));

// Exact coordinate/clip parity with the approved published source: no camera,
// mesh, hover timing, card size, texture or shader quality changes.
for(const[width,height]of[[375,637],[414,715],[768,1024],[1267,713],[2560,1305]]){
  const prior=fixture(baseline,width,height),next=fixture(current,width,height);
  for(const phase of[.13,.2,.31,.42,.62,.83,1.1,1.7]){
    prior.api.update(phase);next.api.update(phase);
    assert.deepEqual(plain(next.api.getProjectedCards(phase)),plain(prior.api.getProjectedCards(phase)),`Mesh coordinates match at ${width}x${height}, ${phase}`);
    assert.deepEqual(frameValues(next),frameValues(prior),'Float32 clip coordinates and brightness are unchanged');
    assert.deepEqual(next.list.children.map(node=>node.style.transform),prior.list.children.map(node=>node.style.transform),'DOM fallback retains the same projective geometry');
    recordGeometry(approvedGeometry,prior,phase);recordGeometry(currentGeometry,next,phase);
  }
  prior.api.update(.62);next.api.update(.62);
  const front=next.api.getProjectedCards(.62).find(pose=>pose.front&&pose.visible);assert(front);
  prior.list.children[front.index].dispatch('pointerenter',{pointerType:'mouse'});next.list.children[front.index].dispatch('pointerenter',{pointerType:'mouse'});
  for(const now of[100,175,250,400]){prior.api.update(.62,{now});next.api.update(.62,{now});assert.deepEqual(frameValues(next),frameValues(prior),'Hovered mesh remains exactly equal');recordGeometry(approvedGeometry,prior,.62);recordGeometry(currentGeometry,next,.62);}
  const snapshot=plain(next.api.getProjectedCards(.62)),retained=next.api.getProjectedCards(.62);
  next.api.update(.7);assert.deepEqual(plain(retained),snapshot,'Public snapshots are not mutated by reused rendering buffers');
}
// Keep the pre-optimization numerical baseline even after dist is republished.
const approvedDigest='bf2f1fbc2011c11d31c667ccb86fd4954d582e474b5ad6a994c511b8248e29f0';
assert.equal(approvedGeometry.digest('hex'),approvedDigest,'Published geometry matches the recorded approval');
assert.equal(currentGeometry.digest('hex'),approvedDigest,'Every recorded approved geometry byte stays equal');

const f=fixture(current);f.api.update(.62);
const firstBuffers=f.frame().map(pose=>pose.clipRef);f.api.update(.62001);
assert.equal(f.frame().length,firstBuffers.length);
for(const[i,pose]of f.frame().entries())assert.equal(pose.clipRef,firstBuffers[i],'Runtime frames reuse each plane’s typed buffer');
f.api.update(.62);
const front=f.api.getProjectedCards(.62).find(pose=>pose.front&&pose.visible),center=front.vertices[4*25+12];
f.list.children[front.index].dispatch('pointerenter',{pointerType:'mouse'});assert(f.api.isAnimating());
f.api.setVisible(false);
assert(!f.api.isAnimating());assert(f.canvas.hidden);assert(f.viewport.classList.contains('works-is-sleeping'));
assert.equal(f.pill.getAttribute('aria-hidden'),'true');assert.equal(f.timers.size,0,'Sleep cancels all pill transition timers');
f.reset();
for(const phase of[.7,.8,.9,1.2,1.5])f.api.update(phase,{now:1000});
for(const type of['pointermove','pointerleave','pointerdown','pointerup'])f.canvas.dispatch(type,{pointerType:'touch',clientX:center.x,clientY:center.y,pointerId:1});
f.pill.dispatch('pointermove',{pointerType:'mouse',clientX:center.x,clientY:center.y});
for(const type of['pointerenter','pointerleave','pointerdown','focus','click','keydown'])f.list.children[front.index].dispatch(type,{pointerType:'mouse',key:'Enter',preventDefault(){throw Error('Hidden controls cannot capture keyboard input');}});
f.window.dispatch('blur');f.window.dispatch('pointerdown',{pointerType:'touch',target:f.canvas});
f.list.children[0].children[1].children[0].dispatch('load');
assert.deepEqual(f.stats,{draws:0,copies:0,projections:0,hitTests:0,rects:0,styles:0,quads:0},'Hidden story progress, input, blur and late image loads perform no rendering work');
f.api.setVisible(true);assert(f.canvas.hidden,'Resume remains hidden until current geometry is ready');
f.api.update(.62,{now:2000});assert(!f.canvas.hidden);assert(!f.viewport.classList.contains('works-is-sleeping'));assert(f.stats.draws>0&&f.stats.projections===12);
assert.equal(f.pill.getAttribute('aria-hidden'),'true','Resume never restores stale selection');
f.api.update(.62,{now:3000});f.reset();f.api.update(.62,{now:4000});assert.equal(f.stats.draws,0,'Settled visible scene does not draw idle frames');

f.document.hidden=true;f.document.dispatch('visibilitychange');f.reset();f.api.update(.74);assert.equal(f.stats.projections,0);assert(f.canvas.hidden);
f.document.hidden=false;f.document.dispatch('visibilitychange');assert(!f.canvas.hidden);assert(f.stats.draws>0,'Returning to a visible tab draws its current phase once');
f.api.setVisible(false);f.document.hidden=true;f.document.dispatch('visibilitychange');f.reset();f.document.hidden=false;f.document.dispatch('visibilitychange');assert.equal(f.stats.draws,0,'Restoring the browser tab cannot wake an offscreen chapter');

const delayed=fixture(current,375,637,{deferred:true});delayed.api.setVisible(false);delayed.reset();delayed.prepare[0]();assert.equal(delayed.stats.draws,0);assert.equal(delayed.stats.copies,0,'Prefetch can prepare textures without repainting an offscreen gallery');
console.log('Works sleep checks passed: exact mesh/hover parity, no hidden draw/copy/projection/hit-test/style work, clean same-frame resume and tab lifecycle.');
