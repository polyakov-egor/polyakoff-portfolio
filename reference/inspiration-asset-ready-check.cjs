/* Real image staging, chapter renderer and shared clock. A completed download
   is deliberately kept undecoded to reproduce the mobile late-card pop. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {rendererPage}=require('./inspiration-check.cjs');
const {turn,near}=require('./scroll-check.cjs');
const advance=(page,ms)=>{for(let left=ms;left>0;left-=Math.min(left,25))page.frame(Math.min(left,25));};
function input(f,type,properties={}){
  const event={type,target:{closest:()=>null},cancelable:true,prevented:false,
    preventDefault(){this.prevented=true;},...properties};
  Object.defineProperty(event,'defaultPrevented',{get(){return this.prevented;}});
  f.page.window.dispatchEvent(event);return event;
}
function swipe(f,id){
  input(f,'touchstart',{touches:[{identifier:id,clientX:100,clientY:600}]});
  const event=input(f,'touchmove',{touches:[{identifier:id,clientX:100,clientY:550}]});
  input(f,'touchend',{touches:[]});f.page.frame(0);return event;
}
(async()=>{
  for(const [width,height]of[[390,844],[1440,800]]){
    const f=rendererPage(width,height,{visualEnd:true,worksTravel:height*8}),{page,view}=f;
    await turn();page.frames();
    page.document.documentElement.clientWidth=width;
    const loads=new Map();
    for(const image of view.root.querySelectorAll('[data-chapter-image]')){
      const key=image.dataset.chapterImage;
      let decoded,source='';
      image.decode=()=>new Promise(resolve=>{decoded=resolve;});
      image.removeEventListener=()=>{};
      Object.defineProperty(image,'src',{configurable:true,get:()=>source,set(value){
        source=value;image.complete=false;image.naturalWidth=0;
      }});
      loads.set(key,{image,loaded(){image.complete=true;image.naturalWidth=768;image.dispatchEvent({type:'load'});},decoded(){decoded();}});
    }
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../chapter-assets.js'),'utf8'),page.context,{filename:'chapter-assets.js'});
    const assets=page.window.ChapterAssets;
    assets.ensure('inspiration');
    loads.get('people').loaded();loads.get('people').decoded();await turn();
    const start=Number(page.hero.dataset.inspirationStart);
    page.scroll(start-1);page.frames();page.scroll(start+10);page.frame();page.frames();
    assert.equal(view.index.textContent,'01');assert.equal(view.root.dataset.gestureReady,'true');
    for(const key of ['music-base','music-overlay'])loads.get(key).loaded();
    page.frames();
    assert(loads.get('music-base').image.complete&&loads.get('music-base').image.naturalWidth>0);
    assert.equal(assets.isImageReady(loads.get('music-base').image),false,'A downloaded image still waits for decode');
    const resets=[];
    page.window.InspirationCardFlip={resetForNavigation:(...args)=>resets.push(args),update:()=>({animating:false}),reset(){}};
    assert(swipe(f,1).prevented);page.frames();
    assert.equal(view.root.dataset.gesturePending,'2');assert.equal(view.root.dataset.cardRunning,'false');
    assert.equal(view.root.dataset.cardPosition,'0.00000');assert.equal(page.raf.size,0,'An undecoded target creates no polling RAF');
    assert.equal(resets.length,1,'The accepted navigation returns open Content immediately');
    advance(page,4000);
    assert(swipe(f,2).prevented);page.frames();
    assert.equal(resets.length,1,'Extra swipes while loading do not queue another navigation');
    assert.equal(view.index.textContent,'01');assert.equal(page.raf.size,0);
    loads.get('music-base').decoded();await turn();page.frames();
    assert.equal(view.root.dataset.gesturePending,'2','Both Music layers must be decoded');
    assert.equal(view.index.textContent,'01');assert.equal(page.raf.size,0);
    loads.get('music-overlay').decoded();await turn();page.frame(0);
    assert.equal(view.root.dataset.gesturePending,'');assert.equal(view.root.dataset.cardRunning,'true');
    assert.equal(view.root.dataset.cardPosition,'0.00000','The first decoded frame begins at the original pose');
    assert.equal(view.index.textContent,'01');
    advance(page,400);near(Number(view.root.dataset.cardPosition),.875,'The full saved 800ms ease begins after decoding');
    assert.equal(view.root.dataset.cardRunning,'true');
    advance(page,400);page.frames();assert.equal(view.index.textContent,'02');
    assert.equal(view.root.dataset.cardPosition,'1.00000');assert.equal(page.raf.size,0);
    loads.get('detail').loaded();loads.get('detail').decoded();await turn();page.frames();
    assert.equal(view.index.textContent,'02','Finishing the next decode cannot replay a swallowed second swipe');
    assert(swipe(f,3).prevented);advance(page,800);page.frames();assert.equal(view.index.textContent,'03');
  }
  console.log('Inspiration decoded-asset checks passed: no late pop, full 800ms after both Music decodes, one consumed gesture, no polling RAF, immediate Content reset, and no queued navigation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
