/* Recovery must migrate existing origins once and work without writable storage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'published-effect-preset.js'), 'utf8');
const marker = 'ff.hero.published-preset.123123123.v1';
const libraryKey = 'ff.hero.effect.presets.v1';
const keys = {depth:'ff.hero.depth.settings.v1',scroll:'ff.hero.scroll.settings.v1',background:'ff.background.lines.settings.v1'};
const expected = {
  depth:{enabled:true,strength:2.5,smoothingMs:240,depthAmount:1.2,lighting:.7},
  scroll:{inspirationCardDurationMs:650,aboutRevealMode:'gradient',aboutRevealScrollDuration:1.8,aboutFillFeather:1.5,musicActivity:2.1,
    aboutBackgroundStart:.13,aboutBackgroundDuration:.16,heroScrollDuration:2.2,whiteAt:.52,wordmarkBlur:57,wordmarkFade:false,
    aboutScrollDuration:2.5,aboutTopBlur:22,aboutFlightVariant:'second',aboutFadeSpeed:1.35,aboutTriggerMode:'portrait',aboutTriggerGapPx:140,
    aboutStartOffset:0,aboutWordForce:3,aboutLetterForce:3,aboutDetach:.23,aboutRotation:.8,aboutFadeShape:'distance',aboutFadeOrigin:'screen'},
  background:{enabled:false,mode:'distortion',ambientEnabled:true,ambientDirection:'up',ambientStrength:.3,ambientSpeed:.35,hoverStrength:.35,rippleStrength:.4,radius:150},
};
const plain = value => JSON.parse(JSON.stringify(value));
function page(data = new Map(), failures = {}) {
  const writes=[];
  const storage={
    getItem(key){if(failures.read)throw new Error('Storage unavailable');return data.get(key)??null;},
    setItem(key,value){if(failures.write)throw new Error('Quota exceeded');data.set(key,String(value));writes.push(key);},
  };
  const node={dataset:{},querySelector(){return node;}};
  const window={localStorage:storage,HeroSquircle:{}};
  const context=vm.createContext({window,localStorage:storage,document:{querySelector(){return node;}},matchMedia(){return {matches:false};}});
  vm.runInContext(source,context,{filename:'published-effect-preset.js'});
  return {data,writes,context,window,read:key=>JSON.parse(data.get(key)),run(){vm.runInContext(source,context);}};
}
function probeOwner(page, owner){
  const filename={depth:'hero-depth.js',scroll:'hero-scroll.js',background:'background-lines.js'}[owner];
  const ownerSource=fs.readFileSync(path.join(root,filename),'utf8');
  const stop={depth:'  const state =',scroll:'  function applyTuningCss()',background:'  const reduced ='}[owner];
  const cut=ownerSource.indexOf(stop);
  assert(cut>0,filename+' startup boundary remains explicit');
  // Execute the real settings/normalization/storage startup without a GPU or RAF.
  vm.runInContext(ownerSource.slice(0,cut)+'\nwindow.__settingsProbe = {settings:{...settings},defaults:{...publishedDefaults}};\n})();',page.context,{filename});
  return plain(page.window.__settingsProbe);
}
function subset(actual, values, message){
  for(const [key,value] of Object.entries(values))assert.deepEqual(actual[key],value,message+' '+key);
}

const fresh=page();
assert.equal(fresh.window.PublishedEffectPreset.name,'123123123');
for(const [owner,key] of Object.entries(keys)){
  assert.deepEqual(fresh.read(key),expected[owner],owner+' screenshot settings are persisted');
  const probe=probeOwner(fresh,owner);
  subset(probe.settings,expected[owner],owner+' starts with screenshot settings');
  subset(probe.defaults,expected[owner],owner+' publishes the recovered defaults');
}
assert.equal(fresh.data.get(marker),'1');
assert.equal(fresh.data.get('ff.hero.scroll.gradient-default.v1'),'1');
assert.equal(fresh.read(libraryKey).presets[0].name,'123123123');
assert.equal(fresh.read(libraryKey).presets.length,1);
assert(Object.isFrozen(fresh.window.PublishedEffectPreset));
for(const owner of Object.keys(keys))assert(Object.isFrozen(fresh.window.PublishedEffectPreset[owner]));

const untouched={id:'other-preset',name:'Other',depth:{strength:.4},scroll:{whiteAt:.2},background:{enabled:true}};
const original={id:'user-original-id',name:'123123123',depth:{lighting:.3},scroll:{aboutFadeBoundary:.66,aboutFadeSoftness:.42,aboutFadeGuide:true},background:{enabled:true}};
const data=new Map([
  [keys.depth,JSON.stringify({strength:.2,enabled:false})],
  [keys.scroll,JSON.stringify({heroScrollDuration:1,aboutFillFeather:.7,aboutFadeBoundary:.8,aboutFadeSoftness:.7})],
  [keys.background,JSON.stringify({enabled:true})],
  [libraryKey,JSON.stringify({version:1,presets:[untouched,original]})],
]);
const existing=page(data);
for(const [owner,key] of Object.entries(keys))subset(existing.read(key),expected[owner],owner+' replaces former origin settings');
const catalog=existing.read(libraryKey);
assert.deepEqual(catalog.presets[0],untouched,'Other presets are unchanged');
assert.equal(catalog.presets[1].id,original.id,'The named preset retains its identity');
for(const [key,value] of Object.entries(original.scroll))assert.equal(existing.read(keys.scroll)[key],value,'Cropped setting is retained: '+key);
assert.equal(catalog.presets[1].scroll.aboutFadeBoundary,.66);

const manual={...existing.read(keys.depth),strength:.85};
data.set(keys.depth,JSON.stringify(manual));
const catalogBytes=data.get(libraryKey),writes=existing.writes.length;
existing.run();
assert.equal(existing.writes.length,writes,'The completed migration never rewrites later tuning');
assert.deepEqual(existing.read(keys.depth),manual);
assert.equal(data.get(libraryKey),catalogBytes);
assert.equal(probeOwner(existing,'depth').settings.strength,.85,'Owners honor later manual tuning');

for (const [duration, result] of [[800, 650], [950, 950]]) {
  const oldScroll = {...expected.scroll, inspirationCardDurationMs:duration, aboutFadeBoundary:.66};
  const oldCatalog = JSON.stringify({version:1,presets:[untouched,original]});
  const origin = page(new Map([[marker,'1'], [keys.scroll,JSON.stringify(oldScroll)], [libraryKey,oldCatalog]]));
  assert.deepEqual(origin.read(keys.scroll), {...oldScroll,inspirationCardDurationMs:result}, 'Existing origins refresh only the former default speed');
  assert.equal(origin.data.get(libraryKey),oldCatalog,'Timing refresh preserves saved named presets');
  origin.data.set(keys.scroll,JSON.stringify(oldScroll));origin.run();
  assert.deepEqual(origin.read(keys.scroll),oldScroll,'Later tuning can still use the previous duration');
}

const unavailable=page(new Map(),{read:true,write:true});
for(const owner of Object.keys(keys))subset(probeOwner(unavailable,owner).settings,expected[owner],owner+' works without browser storage');

const readOnly=page(new Map([
  [keys.depth,JSON.stringify({strength:.1,lighting:0})],
  [keys.scroll,JSON.stringify({heroScrollDuration:1,whiteAt:.1,aboutFadeBoundary:.81})],
  [keys.background,JSON.stringify({enabled:true,mode:'light'})],
]),{write:true});
for(const owner of Object.keys(keys))subset(probeOwner(readOnly,owner).settings,expected[owner],owner+' uses recovery even when old storage is readable but not writable');

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const filename of ['hero-depth.js','hero-scroll.js','hero-effect-controls.js'])assert(html.indexOf('./published-effect-preset.js')<html.indexOf('./'+filename),'Published snapshot loads before '+filename);
for(const retired of ['background-lines.js','background-line-warp.js','assets/images/line-masks.js'])assert(!html.includes(`src="./${retired}"`),'Retired experiment is absent from production: '+retired);
assert(/controls\.hidden\s*=\s*true/.test(fs.readFileSync(path.join(root,'hero-effect-controls.js'),'utf8')),'Panel and toggle remain hidden');
console.log('Published preset checks passed: screenshot values, fresh/existing origins, retained presets/cropped values, once-only recovery, read/write failures, published defaults and hidden UI.');
