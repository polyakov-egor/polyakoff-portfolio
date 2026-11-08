/* Read-only audit for the source folder and the exact static publication tree. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const retired=Object.freeze([
  'background-lines.js','background-line-warp.js','background-lines.css',
  'inspiration-glass.js','assets/images/line-masks.js',
]);

function webpSize(filename){
  const bytes=fs.readFileSync(filename);
  assert(bytes.length>20&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP',`Not a nonempty WebP: ${filename}`);
  for(let offset=12;offset+8<=bytes.length;){
    const kind=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
    if(kind==='VP8X')return{width:bytes.readUIntLE(start+4,3)+1,height:bytes.readUIntLE(start+7,3)+1};
    if(kind==='VP8L'){
      assert.equal(bytes[start],0x2f,`Bad lossless header: ${filename}`);
      const bits=bytes.readUInt32LE(start+1);return{width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};
    }
    if(kind==='VP8 ')return{width:bytes.readUInt16LE(start+6)&0x3fff,height:bytes.readUInt16LE(start+8)&0x3fff};
    offset=start+size+(size%2);
  }
  throw Error(`WebP has no decodable image payload: ${filename}`);
}

function audit(directory,{staged=false}={}){
  const root=path.resolve(directory),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const local=value=>!value.startsWith('#')&&!/^(?:[a-z]+:|\/\/)/i.test(value);
  const resolve=value=>{
    const clean=value.split(/[?#]/)[0],absolute=path.resolve(root,clean);
    assert(absolute.startsWith(root+path.sep),`Reference leaves publication root: ${value}`);
    assert(fs.statSync(absolute).isFile(),`Missing local reference: ${value}`);
    return absolute;
  };
  const links=[...html.matchAll(/\b(?:src|href|srcset)\s*=\s*["']([^"']+)["']/g)]
    .map(match=>match[1]).filter(local);
  for(const url of links)resolve(url);
  const runtime=[...new Set(links.filter(url=>/\.(?:js|css)(?:[?#]|$)/.test(url)))];
  assert(runtime.includes('./chapter-assets.js'),'Pinned chapter prefetch must be included');
  assert(html.indexOf('./chapter-assets.js')<html.indexOf('./inspiration-view.js'),'Prefetch owner loads before deferred Inspiration images');
  assert(html.indexOf('./chapter-assets.js')<html.indexOf('./works-gallery.js'),'Prefetch owner loads before the deferred Works renderer');
  assert(html.indexOf('./chapter-assets.js')<html.indexOf('./services.js'),'Prefetch owner loads before Services');
  assert(html.indexOf('./services.js')<html.indexOf('./services-scroll.js'),'Services mounts before its scroll owner');
  assert(html.indexOf('data-services data-active-service=')>html.indexOf('class="works-journey"'),'Services follows Works in the static document');
  const servicePhotos=[...html.matchAll(/<img\b[^>]*data-chapter-image="services-[^"]+"[^>]*>/g)].map(match=>match[0]);
  assert.equal(servicePhotos.length,6,'Services has three shared front/rear image pairs');
  assert(servicePhotos.every(tag=>! /\bsrc=/.test(tag)&&/decoding="async"/.test(tag)),'Services photos stay deferred until their chapter approaches');
  const loaded=[{name:'index.html',text:html},...runtime.map(name=>({name,text:fs.readFileSync(resolve(name),'utf8')}))];
  for(const file of loaded){
    for(const old of retired)assert(!file.text.includes(old),`Retired module referenced by ${file.name}: ${old}`);
    assert(!file.text.includes('figma.com/api/mcp/asset/'),`Temporary Figma download URL in ${file.name}`);
    if(file.name.endsWith('.css'))for(const match of file.text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)){
      if(local(match[1])&&!match[1].includes('('))resolve(match[1]);
    }
  }
  if(staged){
    for(const old of retired)assert(!fs.existsSync(path.join(root,old)),`Retired file physically remains in publication: ${old}`);
    for(const name of ['reference','tests','server.mjs','SITES.md'])assert(!fs.existsSync(path.join(root,name)),`Development artifact in static publication: ${name}`);
  }
  const backgroundSlots=[...html.matchAll(/<img\b[^>]*class=["'][^"']*(?:about-backdrop__(?:light-)?lines|works-backdrop__lines)[^"']*["'][^>]*>/g)].map(match=>match[0]);
  for(const slot of backgroundSlots)assert(/src=["'][^"']+\.webp["']/.test(slot),'Background slots use the updated raster artwork');
  assert(/data-layer=["']scanlines["'][^>]*src=["'][^"']+\.webp["']|src=["'][^"']+\.webp["'][^>]*data-layer=["']scanlines["']/.test(html),'Hero background uses the updated raster artwork');
  for(const file of ['hero-layout.js','inspiration-view.js','inspiration.js']){
    const text=fs.readFileSync(path.join(root,file),'utf8');
    assert(!/(?:scanlines(?:-2k)?|about-lines[^'"`\s]*|inspiration\/lines-[^'"`\s]*)\.svg/.test(text),`Old background SVG active reference in ${file}`);
  }
  const expected=[
    ['assets/images/backgrounds/dark.webp',2560,1305],['assets/images/backgrounds/light.webp',2560,1305],
    ['assets/images/hero/portrait-1280.webp',1280,null],['assets/images/hero/portrait-2456.webp',2456,null],
    ['assets/images/hero/depth-1280.webp',1280,null],['assets/images/hero/depth-2456.webp',2456,null],
    ...['people','music-base','music-overlay','detail'].flatMap(key=>[768,1280].map(width=>[`assets/images/optimized/${key}-${width}.webp`,width,null])),
    ...['work-amonra','work-hermes','work-suborbia','work-skynews','work-youtube-music','work-itsme'].flatMap(key=>[1024,2048].map(width=>[`assets/images/optimized/${key}-${width}.webp`,key==='work-suborbia'&&width===2048?1600:width,null])),
    ...[768,1280].map(width=>[`assets/images/optimized/services-app-${width}.webp`,width,null]),
  ];
  for(const [name,width,height] of expected){
    const actual=webpSize(resolve(name));assert.equal(actual.width,width,`Responsive width: ${name}`);
    if(height)assert.equal(actual.height,height,`Raster artwork height: ${name}`);
    assert(actual.height>0,`Nonempty image height: ${name}`);
  }
  // Original photos intentionally remain addressable for a WebP decode error.
  // They have no eager src in the staged path and cost no transfer until used.
  const fallbackPhotos=[
    ...['people.png','music-base.png','music-overlay.png','detail.png'].map(name=>`assets/images/inspiration/${name}`),
    ...['01-amonra.png','02-hermes.png','03-suborbia.png','04-skynews.png','05-youtube-music.png','06-itsme.png'].map(name=>`assets/images/works/${name}`),
  ];
  for(const file of fallbackPhotos)resolve(file);
  return{root,staged,loadedRuntimeFiles:loaded.length,rasterVariants:expected.length,retiredReferences:0,originalFallbacks:fallbackPhotos.length};
}

if(require.main===module){
  const args=process.argv.slice(2),directory=args.find(arg=>!arg.startsWith('--'))||path.join(__dirname,'..');
  console.log(JSON.stringify(audit(directory,{staged:args.includes('--staged')})));
}
module.exports={audit,retired,webpSize};
