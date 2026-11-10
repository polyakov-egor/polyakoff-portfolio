/* The real scroll settings owner supplies the card clock and CSS tuning.
   Browser preferences are isolated from these bounds/legacy checks. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makePage,turn,near,scrollStorageKey}=require('./scroll-check.cjs');
const root=path.join(__dirname,'..');
const keys=['inspirationCardDurationMs','aboutFillFeather','musicActivity'];
const defaults={inspirationCardDurationMs:650,aboutFillFeather:.7,musicActivity:1.35};
const bounds={inspirationCardDurationMs:[350,1800],aboutFillFeather:[.2,1.5],musicActivity:[.5,2.5]};
(async()=>{
  for(const [width,height] of [[375,812],[768,1024],[1920,960],[2560,1305]]){
    const page=makePage(width,height);await turn();page.frames();
    const api=page.window.HeroScrollEffect;
    for(const key of keys){near(api.getDefaults()[key],defaults[key],key+' default');near(api.getSettings()[key],defaults[key],key+' current');}
    assert.equal(page.hero.style.values.get('--about-fill-feather'),'.7'.replace(/^\./,'0.'));
    assert.equal(page.document.documentElement.style.values.get('--music-activity'),'1.35');
    api.setSettings({inspirationCardDurationMs:550,aboutFillFeather:1.2,musicActivity:1.8});page.frames();
    assert.equal(page.hero.style.values.get('--about-fill-feather'),'1.2');
    assert.equal(page.document.documentElement.style.values.get('--music-activity'),'1.8');
    const stored=JSON.parse(page.storage.get(scrollStorageKey));
    for(const [key,value] of Object.entries({inspirationCardDurationMs:550,aboutFillFeather:1.2,musicActivity:1.8})){
      near(stored[key],value,'Persisted '+key);near(page.scrollSettingsEvents.at(-1)[key],value,'Published '+key);
    }
    const reloaded=makePage(width,height,0,page.storage);await turn();reloaded.frames();
    for(const key of keys)near(reloaded.window.HeroScrollEffect.getSettings()[key],stored[key],'Reload '+key);
    for(const key of keys){
      const [min,max]=bounds[key];api.setSettings({[key]:min-10});page.frames();near(api.getSettings()[key],min,'Minimum '+key);
      api.setSettings({[key]:max+10});page.frames();near(api.getSettings()[key],max,'Maximum '+key);
      for(const value of [NaN,Infinity,-Infinity,true,null,'1',{},[]]){api.setSettings({[key]:value});page.frames();near(api.getSettings()[key],max,'Unsupported '+key);}
    }
    api.resetSettings();page.frames();
    for(const key of keys)near(api.getSettings()[key],defaults[key],'Reset '+key);
    assert.equal(page.raf.size,0,'Tuning settles through the existing single clock');
  }
  const legacyRaw=JSON.stringify({whiteAt:.47,aboutScrollDuration:2.1,wordmarkFade:true});
  const legacy=makePage(1920,960,0,new Map([[scrollStorageKey,legacyRaw],['ff.hero.scroll.gradient-default.v1','1']]));await turn();legacy.frames();
  const api=legacy.window.HeroScrollEffect;
  near(api.getSettings().whiteAt,.47);near(api.getSettings().aboutScrollDuration,2.1);assert.equal(api.getSettings().wordmarkFade,true);
  for(const key of keys)near(api.getSettings()[key],defaults[key],'Legacy default '+key);
  assert.equal(legacy.storage.get(scrollStorageKey),legacyRaw,'Loading old preferences never rewrites their bytes');
  const ui=fs.readFileSync(path.join(root,'hero-effect-controls.js'),'utf8');
  assert(/controls\.hidden\s*=\s*true/.test(ui),'The whole panel and its toggle stay hidden without changing effect settings');
  assert(/aria-expanded="false"/.test(ui)&&/id="hero-effect-panel"[^>]* hidden/.test(ui),'The available panel starts collapsed');
  for(const key of keys)assert(new RegExp('data-effect-setting="'+key+'" data-effect-owner="scroll"').test(ui),'Panel input uses its persisted owner: '+key);
  const css=fs.readFileSync(path.join(root,'hero-scroll.css'),'utf8');
  assert(css.includes('100% * var(--about-fill-feather, .7)')&&!css.includes('125% * var(--about-light-progress'),'Fill feather changes height rather than the established scroll timing');
  assert(css.includes('/ var(--about-fill-feather, .7)'), 'Clock/footer ink follows the same tunable feather');
  console.log('Motion tuning checks passed: defaults/bounds, live CSS values, complete events, persistence/legacy/reset, adaptive no-idle clock and available collapsed panel.');
})().catch(error=>{console.error(error);process.exitCode=1;});
