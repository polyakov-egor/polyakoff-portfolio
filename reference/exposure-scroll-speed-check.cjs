const assert=require('node:assert/strict');
const {makePage,turn,near,scrollStorageKey}=require('./scroll-check.cjs');
(async()=>{
  for(const [width,height] of [[375,812],[768,1024],[1920,960],[2560,1305]]){
    const page=makePage(width,height,0,new Map(),true);await turn();page.frames();
    const api=page.window.HeroScrollEffect,metrics=page.window.AboutTextFlight.getMetrics();
    near(api.getDefaults().aboutRevealScrollDuration,1.8,'Slower initial exposure');
    const measured=page.flightMeasures.length;
    let previousEnd=0;
    for(const duration of [1,1.8,3]){
      api.setSettings({aboutRevealScrollDuration:duration});page.frames();
      const settings=api.getSettings(),span=metrics.end-metrics.start;
      const end=metrics.start+span*(settings.aboutBackgroundStart+settings.aboutBackgroundDuration*duration);
      const middle=metrics.start+span*(settings.aboutBackgroundStart+settings.aboutBackgroundDuration*duration*.5);
      assert(end>previousEnd,'Increasing duration allocates more scroll for the same reveal');previousEnd=end;
      page.scroll(height*settings.heroScrollDuration+middle*settings.aboutScrollDuration);page.frames();
      near(Number(page.hero.style.values.get('--about-light-progress')),.5,'The midpoint is exactly reproducible at each duration');
      page.scroll(height+end*settings.aboutScrollDuration);page.frames();
      near(Number(page.hero.dataset.lightProgress),1,'Background completes before the next chapter');
      page.scroll(height+middle*settings.aboutScrollDuration);page.frames();
      near(Number(page.hero.style.values.get('--about-light-progress')),.5,'Reverse restores the same midpoint');
    }
    assert.equal(page.flightMeasures.length,measured,'Speed control reuses the measured text');
    api.setSettings({aboutRevealScrollDuration:99});page.frames();near(api.getSettings().aboutRevealScrollDuration,3);
    api.setSettings({aboutRevealScrollDuration:-4});page.frames();near(api.getSettings().aboutRevealScrollDuration,1);
    api.setSettings({aboutRevealScrollDuration:2.3});page.frames();
    near(JSON.parse(page.storage.get(scrollStorageKey)).aboutRevealScrollDuration,2.3);
    const reloaded=makePage(width,height,0,page.storage,true);await turn();near(reloaded.window.HeroScrollEffect.getSettings().aboutRevealScrollDuration,2.3);
    assert.equal(page.raf.size,0);
  }
  const calls=[];
  const ending=makePage(1920,960,0,new Map(),false,{beforeScroll({window}){
    window.InspirationClosing={getBlackProgress:()=>.75};
    window.HeroAboutReveal={update:values=>calls.push(values)};
  }});await turn();ending.frames();
  near(Number(ending.hero.style.values.get('--works-black-progress')),.75,'The fixed overlay receives the closing title state');
  near(calls.at(-1).blackProgress,.75,'The same frame passes the title roll to the navigation theme');
  console.log('Exposure scroll speed: 1–3× budgets/midpoints/reverse, default1.8×, persistence, cached layout and closing title theme.');
})().catch(error=>{console.error(error);process.exitCode=1;});
