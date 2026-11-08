const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');

function fixture(pitchFactor=1.025,foregroundBoost=1, transformSource = source => source, canvasSupported=true){
  const timers=new Map();let timerId=0,drawBrightness=[],brightness=1,clock=1000;
  const shaders=[];
  const gl={
    createShader:()=>({}),shaderSource:(_,source)=>shaders.push(source),compileShader(){},getShaderParameter:()=>true,
    createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,useProgram(){},
    createBuffer:()=>({}),bindBuffer(){},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},bufferData(){},
    getUniformLocation:(_,name)=>name,uniform1i(){},enable(){},depthFunc(){},blendFunc(){},clearColor(){},
    createTexture:()=>({}),bindTexture(){},texParameteri(){},getParameter:()=>4096,texImage2D(){},viewport(){},
    clear(){drawBrightness=[];},uniform4fv(){},uniform1f(name,value){if(name==='uBrightness')brightness=value;},
    drawElements(){drawBrightness.push(brightness);}
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
      getContext:kind=>canvasSupported?(kind==='2d'?context2d:gl):null
    };
    const classes=()=>node.className.split(/\s+/).filter(Boolean);
    node.classList={contains:name=>classes().includes(name),add(...names){node.className=[...new Set([...classes(),...names])].join(' ');},remove(...names){node.className=classes().filter(name=>!names.includes(name)).join(' ');},toggle(name,on){const enabled=on??!this.contains(name);this[enabled?'add':'remove'](name);return enabled;}};
    return node;
  }
  const body=element(),viewport=element(),list=element();viewport.setAttribute('data-works-gallery','');list.setAttribute('data-works-cards','');viewport.append(list);body.append(viewport);
  const window=element();window.devicePixelRatio=1;window.dispatchEvent=event=>window.dispatch(event.type,event);
  vm.runInNewContext(transformSource(fs.readFileSync(path.join(root,'works-gallery.js'),'utf8')).replace(/pitchFactor:\d*\.?\d+/,`pitchFactor:${pitchFactor}`).replace(/foregroundBoost\s*=\s*\d*\.?\d+/,`foregroundBoost=${foregroundBoost}`),{
    document:{querySelector:selector=>body.querySelector(selector),createElement:element},window,
    setTimeout(callback,delay){timers.set(++timerId,{callback,delay});return timerId;},clearTimeout(id){timers.delete(id);},
    requestAnimationFrame(){throw Error('Hover must not add an independent render loop');}
    ,CustomEvent:class{constructor(type){this.type=type;}},Date:{now:()=>clock}
  });
  const api=window.WorksGallery;api.measure({width:1267,height:713});api.update(.62);
  const pill=viewport.querySelector('.works-project'),canvas=viewport.querySelector('.works-gallery-canvas');
  return{api,viewport,list,pill,canvas,window,timers,shaders,getDrawBrightness:()=>drawBrightness,setTime:time=>clock=time};
}

module.exports=fixture;
