const assert = require('node:assert/strict');
const path = require('node:path');
const makeFlight = require('./about-flight-harness.cjs');
const file = path.join(__dirname,'..','about-flight.js');
const paragraphs = ['I’m a designer','specializing in websites,','branding and redesigns.','I’m passionate about','my work and always',['aim to deliver fresh ideas,','clarity, and high-quality','results']];
const countVisible = page => page.words().filter(word=>word.style.getPropertyValue('--flight-word-active')!=='1').length + page.glyphs().filter(glyph=>Number(glyph.style.getPropertyValue('--flight-letter-opacity'))>.001).length;
const plain = value => JSON.parse(JSON.stringify(value));
let early = 0;
for (const frame of [
  {width:375,height:812,font:32,textY:474,bottom:370},
  {width:768,height:1024,font:40,textY:711,bottom:469},
  {width:1440,height:800,font:40,textY:485,bottom:371},
  {width:1920,height:960,font:48,textY:540,bottom:440},
  {width:2560,height:1305,font:56,textY:813,bottom:560},
]) {
  const textWidth=Math.min(622,frame.width-32);
  const page=makeFlight(file,{rect:{left:(frame.width-textWidth)/2,top:frame.textY,width:textWidth},viewportWidth:frame.width,viewportHeight:frame.height,lineHeight:frame.font*1.2,charAdvance:frame.font*.46,paragraphs,responsiveBreaks:true,autoHeight:true});
  assert.equal(typeof page.api.getVisualEnd,'function');assert.equal(page.api.getVisualEnd(),0,'Unmeasured content retains its conservative empty bound');
  const measure=()=>page.api.measure({width:frame.width,height:frame.height,textY:frame.textY,portraitBottom:frame.bottom});
  measure();page.layout(false);
  for(const options of [
    {},{fadeSpeed:.5},{fadeSpeed:2},{wordForce:0,letterForce:0},
    {fadeShape:'circle',fadeBoundary:.6,fadeSoftness:.1},
    {fadeShape:'ellipse',fadeBoundary:1.5,fadeSoftness:.8},
    {fadeShape:'linear',fadeOrigin:'text'},
    {fadeShape:'box',fadeOrigin:'screen',detach:.6,rotation:2},
    {triggerMode:'viewport',startOffset:.25,fadeShape:'distance',letterForce:3,wordForce:2},
  ]) {
    page.api.configure({variant:'second',fadeSpeed:1,wordForce:1,letterForce:1,fadeShape:'distance',fadeBoundary:1,fadeSoftness:.12/.205,fadeOrigin:'screen',detach:.14,rotation:1,triggerMode:'portrait',startOffset:0,...options});
    const metrics=plain(page.api.getMetrics()), at=metrics.start+metrics.span*.5;
    page.api.update(at,{reducedMotion:false});
    const snapshot=page.snapshot(),state=plain(page.api.getState()),writes=page.writes(),nodes=page.nodeCount();
    const end=page.api.getVisualEnd();
    assert(Number.isFinite(end)&&end>=metrics.start&&end<=metrics.end,'Visual end stays within the conservative animation budget');
    if(end<metrics.end-1)early++;
    assert.equal(page.writes(),writes,'Probe performs no style writes');assert.equal(page.nodeCount(),nodes,'Probe allocates no DOM');
    assert.deepEqual(page.snapshot(),snapshot,'Probe leaves every current letter/filter/word pose untouched');
    assert.deepEqual(plain(page.api.getState()),state,'Probe does not alter live progress, completion, tuning or reduced-motion state');
    assert.deepEqual(plain(page.api.getMetrics()),metrics,'Public metrics and their conservative end remain unchanged');
    page.api.update(at,{reducedMotion:false});assert.equal(page.writes(),writes,'Probe does not corrupt render caches or cause redundant writes on the next identical frame');
    assert.equal(page.api.getVisualEnd(),end,'Repeated bound queries are deterministic');
    page.api.update(Math.max(metrics.start,end-.01));assert(countVisible(page)>0,'At least one intact word or glyph is still visible immediately before the reported boundary');
    page.api.update(end+.01);assert.equal(countVisible(page),0,'All real rendered sources/glyphs are gone immediately after the boundary');
    for(let i=1;i<=12;i++) {
      page.api.update(end+(metrics.end-end)*i/12+.01);
      assert.equal(countVisible(page),0,'Later staggered rows or spatial fades do not reappear beyond the last-visible boundary');
    }
    page.api.update(at);assert.deepEqual(page.snapshot(),snapshot,'Returning from the visual-end query preserves deterministic reverse animation');
  }
  page.api.update(0,{variant:'first'});assert.equal(page.api.getVisualEnd(),page.api.getMetrics().end,'Frozen first iteration keeps the conservative bound');
  page.api.update(0,{variant:'second',reducedMotion:true});assert.equal(page.api.getVisualEnd(),page.api.getMetrics().end,'Reduced motion keeps the conservative bound');
  page.layout(true);frame.width+=32;measure();page.layout(false);
  page.api.update(0,{reducedMotion:false});assert(Number.isFinite(page.api.getVisualEnd()),'Resize refreshes the query from newly cached geometry');
}
assert(early>=25,'The visual query meaningfully removes the empty conservative tail across screen sizes and tuning presets');
console.log('About visual-end checks passed: real glyph/source visibility across five adaptive layouts and fade/timing modes, pure cached probes, exact boundary, unchanged metrics/render caches/reverse/first/reduced behavior.');
