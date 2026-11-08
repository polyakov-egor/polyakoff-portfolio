/* The real shared story must spend all pre-reveal input on entering People.
   No hidden category request may survive the portrait flip/title reveal. */
const assert=require('node:assert/strict');
const {rendererPage}=require('./inspiration-check.cjs');
const {turn,near}=require('./scroll-check.cjs');
(async()=>{
  for(const [width,height] of [[375,812],[768,1024],[1440,800],[1920,960],[2560,1305]]){
    const f=rendererPage(width,height,{visualEnd:true,worksTravel:height*8}),{page,view}=f;
    await turn();page.frames();
    const start=Number(page.hero.dataset.inspirationStart);
    page.scroll(start-1);page.frames();
    f.read.allowed=false;page.layout(false);
    // Overshoot several native screens before the visual timeline catches up.
    assert(!page.wheel(height*5,230).prevented);page.frame(0);
    let steps=0;
    while(view.root.dataset.gestureReady!=='true'&&steps<150){
      // Include separate pre-reveal wheel bursts as well as a continuous tail.
      // The former queue replayed these as People -> Music after the reveal.
      page.wheel(height*(steps%4===0?2:1),steps%5===0?240:30);page.frame(0);
      assert.equal(view.index.textContent,'01',`${width}: pre-visible input cannot skip People`);
      assert.equal(view.root.dataset.gestureQueued,'0',`${width}: entrance input is never queued`);
      steps++;
    }
    assert(steps<150,`${width}: People becomes ready with no further scroll requirement`);
    assert.equal(view.root.dataset.flipRunning,'false');assert.equal(view.root.dataset.flipProgress,'1.00000');
    near(page.window.scrollY-120-start,2,'Entrance rebases to People');
    for(let i=0;i<14;i++){
      assert(page.wheel(height,30).prevented,'Arrival momentum is consumed');page.frame(0);
      assert.equal(view.index.textContent,'01');
    }
    page.frames();assert.equal(page.raf.size,0,'Ready People sleeps without replaying a queue');
    assert.equal(view.index.textContent,'01');
    assert(page.wheel(120,230).prevented,'A deliberate new visible-screen gesture changes category');page.frame(0);page.frames();
    assert.equal(view.index.textContent,'02');
    assert.equal(view.root.dataset.gestureQueued,'0');
  }
  console.log('Inspiration entry checks passed: large pre-visible overshoot, repeated pre-reveal gestures, arrival tails, fresh People input, five layouts and no idle clock.');
})().catch(error=>{console.error(error);process.exitCode=1;});
