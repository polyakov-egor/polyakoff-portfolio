const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const makeFlight=require('./about-flight-harness.cjs');
const root=path.join(__dirname,'..');
let created=0,writes=0;
function element(className=''){
  const values=new Map();
  const node={className,dataset:{},children:[],parent:null,style:{setProperty(k,v){values.set(k,v);writes++;},getPropertyValue:k=>values.get(k)||''},
    append(child){if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1);child.parent=this;this.children.push(child);},
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.className.split(' ').includes(selector.slice(1))?[child]:[]),...child.querySelectorAll(selector)]);}
  };
  return node;
}
const copy=element('about-copy'),content=element('about-copy__content');copy.append(content);
const window={};
const context=vm.createContext({window,document:{querySelector:s=>s==='.about-copy'?copy:null,createElement(){created++;return element();}}});
const source=fs.readFileSync(path.join(root,'about-copy.js'),'utf8');
vm.runInContext(source,context);
assert.equal(copy.children.length,1,'A single viewport plane replaces six overlapping text planes');
assert.equal(copy.querySelectorAll('.about-copy__content').length,1,'The semantic text is moved rather than cloned');
assert.equal(copy.querySelector('.about-copy__content'),content,'The original text and heading identities survive');
assert.equal(created,1,'No hidden duplicate paragraphs or masked layers are allocated');
assert.equal(copy.dataset.fadeReady,'true');
vm.runInContext(source,context);
assert.equal(created,1,'Setup is idempotent');
const css=fs.readFileSync(path.join(root,'about-copy.css'),'utf8');
assert(!css.includes('plus-lighter'),'Gradient composition does not require additive blending');
assert(!/filter\s*:\s*blur/.test(css),'Bottom fade has no text blur filter');
assert(css.includes('-webkit-mask-image: linear-gradient')&&css.includes('mask-image: linear-gradient'),'Both Safari and standard viewport masks use the same gradient');
const band=window.AboutCopyFade;
const desktop=band.measure({height:1305,textY:660,textHeight:537.6});
assert(Math.abs(desktop.start-794.4)<1e-9&&Math.abs(desktop.end-1197.6)<1e-9,'QHD fades from the Figma first-quarter stop through the text bottom');
assert.equal(copy.style.getPropertyValue('--about-fade-start'),'794.400px');
const settledWrites=writes;
band.measure({height:1305,textY:660,textHeight:537.6});
assert.equal(writes,settledWrites,'Identical measurements do not rewrite CSS');
assert.equal(band.measure({height:0,textY:NaN,textHeight:0}),null,'Invalid layout cannot corrupt the viewport mask');
assert.equal(writes,settledWrites);
const mobile=band.measure({height:812,textY:450,textHeight:307.2});
assert(Math.abs(mobile.start-526.8)<1e-9&&Math.abs(mobile.end-757.2)<1e-9,'Mobile gradient matches its own initial Figma text band');
assert.equal(copy.style.getPropertyValue('--about-fade-end'),'757.200px');
band.update({progress:1});
assert.equal(copy.style.getPropertyValue('--about-fade-start'),'603.600px','Light Figma retains the first half of the reading band');
band.update({progress:0});
assert.equal(copy.style.getPropertyValue('--about-fade-start'),'526.800px','Reverse scroll restores the dark quarter stop');

const paragraphs=['I’m a designer','specializing in websites,','branding and redesigns.','I’m passionate about','my work and always',['aim to deliver fresh ideas,','clarity, and high-quality','results']];
const tuning={variant:'second',topBlur:22,fadeSpeed:1.35,triggerMode:'portrait',triggerGapPx:140,wordForce:3,letterForce:3,detach:.23,rotation:.8,fadeShape:'distance',fadeOrigin:'screen'};
for(const frame of [{width:375,height:812,font:32,textY:450,bottom:370},{width:768,height:1024,font:40,textY:569,bottom:469},{width:1920,height:960,font:48,textY:540,bottom:440},{width:2560,height:1305,font:56,textY:660,bottom:560}]){
  const textWidth=Math.min(622,frame.width-32);
  const options={rect:{left:(frame.width-textWidth)/2,top:frame.textY,width:textWidth},viewportWidth:frame.width,viewportHeight:frame.height,lineHeight:frame.font*1.2,charAdvance:frame.font*.46,paragraphs,responsiveBreaks:true,autoHeight:true};
  const one=makeFlight(path.join(root,'about-flight.js'),{...options,planeCount:1});
  const six=makeFlight(path.join(root,'about-flight.js'),options);
  const geometry={width:frame.width,height:frame.height,textY:frame.textY,portraitBottom:frame.bottom,topBlurNear:frame.height*.035,topBlurFar:frame.height*.135,...tuning};
  const metrics=one.api.measure(geometry),baseline=six.api.measure(geometry);
  assert.deepEqual({...metrics},{...baseline},'Removing bottom copies does not change flight start, duration, rows or glyph count');
  assert.equal(one.contents.length,1);
  assert.equal(one.glyphs().length,142,'The original 142 glyphs remain in the single plane');
  one.layout(false);six.layout(false);
  for(const distance of [0,metrics.start,metrics.start+metrics.span*.1,metrics.start+metrics.span*.5,metrics.end+1,metrics.start+metrics.span*.5,0]){
    one.api.update(distance,tuning);six.api.update(distance,tuning);
    assert.deepEqual(one.snapshot(),six.snapshot(),'One-plane forward/reverse glyph poses, res/ults split and top blur match the prior flight exactly');
  }
}
console.log('About gradient checks passed: six planes become one semantic viewport mask, Figma quarter-stop fade, measured/cached responsive band, untouched 142-glyph flight/top blur and reversible poses.');
