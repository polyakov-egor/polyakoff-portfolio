/* Drive the real chapter clock while Services moves. Instrument actual paint
   operations rather than wall-clock timings, which vary between test hosts. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {fixture}=require('./inspiration-closing-check.cjs');
const makeFlight=require('./about-flight-harness.cjs');
const {turn}=require('./scroll-check.cjs');
const site=path.join(__dirname,'..');

function countStyles(elements){
  let writes=0;
  for(const element of new Set(elements)){
    if(!element?.style)continue;
    element.style=new Proxy(element.style,{
      get(target,key){
        const value=Reflect.get(target,key);
        if(['setProperty','removeProperty'].includes(key))return(...args)=>{writes++;return value.apply(target,args);};
        return value;
      },
      set(target,key,value){writes++;return Reflect.set(target,key,value);}
    });
  }
  return()=>writes;
}
const descendants=root=>[root,...root.children.flatMap(descendants)];
async function setup(width,height){
  // Instrument the production projection pass inside its existing VM. This
  // counts render-time geometry as well as the public measurement helpers.
  const originalRead=fs.readFileSync,marker=/function projectCards\([^\n]*\)\{/;
  fs.readFileSync=function(filename,...args){
    const source=originalRead.call(this,filename,...args);
    if(path.resolve(filename)!==path.join(site,'works-gallery.js'))return source;
    assert(marker.test(source),'The actual gallery projection pass is instrumented');
    return source.replace(marker,'$&window.__storyProjectionPasses=(window.__storyProjectionPasses||0)+1;');
  };
  let f;try{f=fixture(width,height);}finally{fs.readFileSync=originalRead;}
  const {page}=f;
  await turn();page.frames();
  const flight=makeFlight(path.join(site,'about-flight.js'),{
    viewportWidth:width,viewportHeight:height,planeCount:1,
    rect:{left:Math.max(16,(width-620)/2),top:0,width:Math.min(620,width-32)},
    paragraphs:["I’m a designer","specializing in websites,","branding and redesigns.","I’m passionate about","my work and always","aim to deliver fresh ideas,","clarity, and high-quality","results"]
  });
  let flightCalls=0,clips=0;
  page.window.AboutTextFlight={...flight.api,update(...args){flightCalls++;return flight.api.update(...args);}};
  const squircle=page.window.HeroSquircle;
  page.window.HeroSquircle={...squircle,path(...args){clips++;return squircle.path(...args);}};
  for(const file of ['inspiration-hover.js','inspiration-card-flip.js'])vm.runInContext(fs.readFileSync(path.join(site,file),'utf8'),page.context,{filename:file});
  const services=page.document.createElement('section'),main=page.document.createElement('main');
  services.className='services';services.setAttribute('data-services','');main.append(services);
  Object.defineProperty(services,'offsetHeight',{get(){assert(f.read.allowed,'Only measurement may read Services geometry');return height*3;}});
  page.nodes['[data-services]']=services;
  page.window.ServicesScreens={get:()=>({setVisible(){}})};
  vm.runInContext(fs.readFileSync(path.join(site,'services-scroll.js'),'utf8'),page.context,{filename:'services-scroll.js'});
  page.frames();
  const heroPaint=countStyles(['.hero__scene','.hero__scenery','.hero__intro','.hero__intro-frame','.hero__wordmark-frame','.hero__wordmark-scale','.hero__decoration-scale','.hero__welcome','.hero__about-logo','.about-copy','[data-layer="portrait"]','[data-layer="depth"]'].map(key=>page.nodes[key]));
  const inspirationPaint=countStyles([...descendants(f.view.root),...descendants(f.root)]);
  const counts=()=>({flightCalls,glyphWrites:flight.writes(),clips,projections:page.window.__storyProjectionPasses||0,heroPaint:heroPaint(),inspirationPaint:inspirationPaint()});
  function jump(distance){
    f.read.allowed=true;page.layout(true);flight.layout(true);
    page.window.dispatchEvent({type:'pageshow',persisted:true});page.scroll(distance);page.frames();
    f.read.allowed=false;page.layout(false);flight.layout(false);
  }
  return {...f,flight,counts,jump};
}

module.exports={setup};
if(require.main===module)(async()=>{
  for(const [width,height]of[[375,812],[768,1024],[1920,960]]){
    const f=await setup(width,height),{page}=f;
    const worksClear=()=>Number(page.hero.dataset.servicesStart)+Number(page.nodes['[data-services]'].dataset.servicesIntroTravel);
    const coveredStart=worksClear()+10;
    f.jump(coveredStart);
    const sleeping=f.counts();
    // More than 100 shared-clock frames, with native scroll still moving the
    // Services panel. Previous chapters must not issue even redundant paints.
    for(let i=1;i<=100;i++){page.scroll(coveredStart+i*height*.004);page.frame();}
    page.frames();
    assert.deepEqual(f.counts(),sleeping,`${width}: covered Hero/About/Inspiration/Works does no hidden paint or projection work`);
    assert.equal(page.raf.size,0,'The shared clock sleeps after Services settles');

    const worksMiddle=Number(f.journey.dataset.totalTravel)*.55;
    f.jump(Number(page.hero.dataset.worksStart)+worksMiddle);
    assert(f.counts().projections>sleeping.projections,'Reverse entry resumes projected Works geometry');
    assert.equal(f.view.root.dataset.stage,'3','Rewinding through Works retains the last Inspiration category');
    assert.equal(f.root.dataset.worksProgress,'1.00000','The closing title has already receded in this pose');
    const working=f.counts(),worksDistance=page.window.scrollY-120;
    for(let i=1;i<=30;i++){page.scroll(worksDistance+i*height*.004);page.frame();}page.frames();
    const worked=f.counts();
    for(const key of ['heroPaint','flightCalls','glyphWrites','clips','inspirationPaint'])assert.equal(worked[key],working[key],`Visible Works does not repaint its hidden predecessors: ${key}`);
    assert(worked.projections>working.projections,'Only the visible Works projection advances while its spiral scrolls');
    f.jump(Number(page.hero.dataset.inspirationStart)+2);
    assert.equal(f.view.root.dataset.stage,'1','History/rewind restores the corresponding Inspiration pose');
    f.jump(height*.4);
    assert(f.counts().clips>sleeping.clips,'Reverse Hero entry rebuilds its visible squircle');
    assert(f.counts().flightCalls>sleeping.flightCalls,'The visible About engine is resumed');

    // Configuration and layout invalidate caches even at a settled endpoint.
    f.jump(worksClear()+10);
    const configured=f.counts();
    f.read.allowed=true;page.layout(true);f.flight.layout(true);
    page.window.HeroScrollEffect.setSettings({wordmarkBlur:57,aboutTopBlur:22});page.frames();
    assert(f.counts().heroPaint>configured.heroPaint,'Live tuning repaints the cached pose once');
    const measured=f.counts();page.resize(width,height+40);page.frames();
    assert(f.counts().clips>measured.clips,'Viewport remeasurement invalidates cached geometry');
    f.read.allowed=false;page.layout(false);f.flight.layout(false);
    assert.equal(page.raf.size,0,'Invalidation does not introduce an idle clock');
  }
  console.log('Story sleep checks passed: 100 moving Services frames with zero hidden Hero/About glyph/Inspiration/Works paint, projection or squircle work; visible Works sleeps its predecessors; reverse entry, live tuning and resize resume correctly.');
})().catch(error=>{console.error(error);process.exitCode=1;});
