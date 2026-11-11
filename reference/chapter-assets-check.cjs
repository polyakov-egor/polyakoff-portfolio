const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');

function fixture({width=414,reduced=false,images=true}={}){
  const callbacks=new Map(),requested=[],events=[],nodes=[];
  const html={clientWidth:width,attributes:new Map(),setAttribute(name,value){this.attributes.set(name,value);}};
  function image(key){
    const listeners=new Map();
    const node={dataset:{chapterImage:key},complete:false,naturalWidth:0,
      addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
      removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
      decode:()=>Promise.resolve(),
      finish(ok=true){this.complete=ok;this.naturalWidth=ok?1024:0;for(const fn of [...(listeners.get(ok?'load':'error')||[])])fn();},
      set src(url){this.url=url;this.complete=false;this.naturalWidth=0;requested.push({node:this,url});},
      get src(){return this.url;},
    };
    nodes.push(node);return node;
  }
  if(images)for(const key of ['people','music-base','music-overlay','detail','work-amonra','work-hermes','work-suborbia','work-skynews','work-youtube-music','work-itsme','work-amonra'])image(key);
  const document={documentElement:html,querySelectorAll:()=>nodes,
    addEventListener(type,fn){callbacks.set(type,fn);}};
  const window={innerWidth:width,dispatchEvent(event){events.push(event);}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'chapter-assets.js'),'utf8'),{
    document,window,matchMedia:()=>({matches:reduced}),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}
  });
  return {api:window.ChapterAssets,html,window,nodes,image,requested,callbacks,events,
    finish(){for(const node of nodes)if(node.url&&!node.complete)node.finish();}};
}

(async()=>{
  const f=fixture();let preparations=0;
  f.api.register('works',()=>{preparations++;});
  assert.equal(f.requested.length,0,'The hero stage does not fetch future photographs');
  f.api.update({distance:100,requestedDistance:100,worksStart:8500,height:1000});
  assert.equal(f.requested.length,0);assert.equal(preparations,0);
  f.api.update({distance:6999,worksStart:8500,height:1000});
  assert.equal(f.requested.length,0,'No photos fetch before the Works prefetch boundary');
  assert.equal(preparations,0,'Works GPU setup remains deferred');
  assert.equal(await f.api.ensure('inspiration'),false,'The removed chapter has no prefetch stage');
  assert.equal(f.api.getStatus('inspiration'),null);
  assert(!f.html.attributes.has('data-assets-inspiration'));
  f.api.update({distance:6950,requestedDistance:7000,worksStart:8500,height:1000});
  assert.equal(preparations,1,'Approaching Works prepares the GPU chapter exactly once');
  assert.equal(f.requested.length,7);
  assert(f.requested.every(r=>r.url.endsWith('-1024.webp')),'Phone requests use only compact Works exports');
  assert.equal(new Set(f.requested.map(r=>r.url)).size,6,'Repeated orbit cards share six actual image URLs');
  f.finish();assert.equal(await f.api.ensure('works'),true);
  const requests=f.requested.length;
  for(let i=0;i<20;i++)f.api.update({distance:i%2?0:9000,worksStart:8500,height:1000});
  assert.equal(f.requested.length,requests,'Forward/reverse frames do not refetch prepared assets');
  assert.equal(preparations,1);
  f.html.clientWidth=1440;f.api.update({distance:0});
  assert.equal(f.requested.length,requests*2,'Changing the responsive source bucket updates started chapters once');
  assert(f.requested.slice(requests).filter(r=>r.node.dataset.chapterImage.startsWith('work-')).every(r=>r.url.endsWith('-2048.webp')));
  assert.equal(preparations,1,'Responsive upgrades reuse the existing renderer rather than create more contexts');
  f.finish();await f.api.ensure('works');
  const jump=fixture();let jumpPrepared=0;jump.api.register('works',()=>jumpPrepared++);
  jump.api.update({distance:9000,requestedDistance:9000,worksStart:8500,height:1000});
  assert.equal(jump.requested.length,7,'A history/fast-scroll restore prepares Works immediately');
  assert.equal(jumpPrepared,1);jump.finish();await jump.api.ensure('works');
  const reduce=fixture({reduced:true});reduce.image('services-app');reduce.callbacks.get('DOMContentLoaded')();
  assert.equal(reduce.requested.length,8,'Reduced-motion Works and Services get their photos without entering a pinned timeline');
  reduce.finish();await reduce.api.ensure('works');await reduce.api.ensure('services');
  const late=fixture({images:false});late.api.ensure('works');
  const lateImage=late.image('work-hermes');let latePrepared=0;
  late.api.register('works',()=>latePrepared++);
  assert(lateImage.src.endsWith('work-hermes-1024.webp'),'A chapter registered after a restore still hydrates newly created images');
  assert.equal(latePrepared,1);late.finish();await late.api.ensure('works');
  const failure=fixture();failure.api.ensure('works');
  const failed=failure.nodes.find(node=>node.dataset.chapterImage==='work-amonra');failed.finish(false);
  assert.equal(failed.src,'./assets/images/works/01-amonra.png','A format/decode error keeps the original exact image as fallback');
  failure.finish();await failure.api.ensure('works');

  // Exercise the real retained renderer with the existing geometric fixture,
  // only injecting the public staging API into its browser environment.
  const galleryFixture=fs.readFileSync(path.join(__dirname,'works-hover-check.cjs'),'utf8').split('const f=fixture();')[0]
    .replace('window.devicePixelRatio=1;',"window.devicePixelRatio=1;window.ChapterAssets={register(name,callback){window.prepareWorks=callback;}};")
    .replace('viewport(){},', 'viewport(...dimensions){window.stageViewport=dimensions;},');
  vm.runInNewContext(galleryFixture+`
    const staged=fixture();
    assert.equal(staged.viewport.dataset.worksRenderer,'deferred');
    assert.equal(staged.shaders.length,0,'No WebGL compile or context initialization before Works is prefetched');
    assert(staged.list.children.every(card=>!card.querySelector('.works-card__image').src),'No eager Works image src before hydration');
    staged.window.prepareWorks();
    assert.equal(staged.viewport.dataset.worksRenderer,'retained-webgl');
    assert.deepEqual(staged.window.stageViewport,[0,0,1267,713],'Late-created GPU surface immediately uses the already-measured backing dimensions');
    assert(staged.shaders.length===2,'The registered prepare callback starts the actual renderer');
    const count=staged.shaders.length;staged.window.prepareWorks();
    assert.equal(staged.shaders.length,count,'Repeated preparation creates no extra WebGL context');
  `,{require,__dirname,console});

  // Services loads three distinct photos, each shared by both faces.
  const services=fixture({images:false});
  for(const key of ['services-web','services-app','services-motion']){services.image(key);services.image(key);}
  services.api.update({distance:0,servicesStart:10000,height:1000});
  assert.equal(services.requested.length,0,'Services never fetches during the hero');
  services.api.update({distance:8499,servicesStart:10000,height:1000});
  assert.equal(services.requested.length,0,'Services stays deferred before its prefetch boundary');
  services.api.update({distance:8500,servicesStart:10000,height:1000});
  assert.equal(services.requested.length,6,'Front/rear planes hydrate before the next screen');
  assert.equal(new Set(services.requested.map(packet=>packet.url)).size,3,'Each rear plane shares its photo URL');
  assert.equal(services.api.source('services-web'),'./assets/images/optimized/music-overlay-768.webp','Web design keeps the sand photo');
  assert.equal(services.api.source('services-motion'),'./assets/images/optimized/music-base-768.webp','Motion design keeps the flower photo');
  assert(services.requested.every(packet=>packet.url.endsWith('-768.webp')));
  for(const packet of services.requested)assert(fs.statSync(path.join(root,packet.url)).size>0);
  services.finish();await services.api.ensure('services');
  const serviceRequests=services.requested.length;
  services.api.update({distance:11000,servicesStart:10000,height:1000});services.api.update({distance:0});
  assert.equal(services.requested.length,serviceRequests,'Returning through Works does not reload Services');
  services.html.clientWidth=1440;services.api.update({distance:0});
  assert(services.requested.slice(serviceRequests).every(packet=>packet.url.endsWith('-1280.webp')),'A desktop resize upgrades only the source bucket');
  services.finish();await services.api.ensure('services');

  const report=JSON.parse(fs.readFileSync(path.join(__dirname,'chapter-webp-report.json'),'utf8'));
  let oldBytes=0,phoneBytes=0,desktopBytes=0;
  for(const [key,entry] of Object.entries(report)){
    if(!key.startsWith('work-')&&key!=='music-base'&&key!=='music-overlay')continue;
    oldBytes+=entry.originalBytes;phoneBytes+=entry.variants[0].bytes;desktopBytes+=entry.variants[1].bytes;
    for(const variant of entry.variants)assert(fs.statSync(path.join(root,variant.url)).size>0,'Every responsive source exists');
  }
  assert(phoneBytes<oldBytes*.1,'Phone chapter image transfer is under a tenth of the original photographs');
  assert(desktopBytes<oldBytes*.25,'Large chapter image transfer is under a quarter of the original photographs');
  console.log('Chapter assets checks passed: deferred URLs/GPU, early prefetch, compact phone sources, upgrades, reverse/history/reduced-motion, late registration and fallback.');
  console.log(JSON.stringify({originalMiB:oldBytes/1048576,phoneMiB:phoneBytes/1048576,desktopMiB:desktopBytes/1048576}));
})().catch(error=>{console.error(error);process.exitCode=1;});
