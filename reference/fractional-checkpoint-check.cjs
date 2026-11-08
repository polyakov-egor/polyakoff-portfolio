/* Native scroll positions are quantized by browser zoom/device pixels. A
   fractional scene checkpoint must settle without an unbounded retry RAF. */
const assert=require('node:assert/strict');
const {rendererPage}=require('./inspiration-check.cjs');
const {turn,near}=require('./scroll-check.cjs');

async function verify(withAdapter){
  const f=rendererPage(1920,960,{visualEnd:true,worksTravel:960*8});
  const {page,view}=f;
  await turn();page.frames();
  const boundary=Number(page.hero.dataset.inspirationStart);
  page.scroll(boundary-1);page.frames();
  page.scroll(boundary+10);page.frame();page.frames();
  assert.equal(view.index.textContent,'01');
  const desired=120+boundary-1;
  let attempts=0;
  const roundedJump=top=>{attempts++;page.window.scrollY=top+.269;};
  if(withAdapter)page.window.SiteSmoothScroll={
    jump:roundedJump,cancel(){},raf(){},isAnimating:()=>false,usesSmoothedScroll:()=>true,
  };
  else page.window.scrollTo=({top})=>roundedJump(top);
  const event=page.wheel(-960*3,230);
  assert(event.prevented,'People-up launches a timed return rather than rewinding covered About');
  page.frame(0);page.frames();
  assert.equal(view.root.hidden,true,'The automatic reverse finishes');
  assert.equal(view.root.dataset.returnGate,'waiting');
  near(page.window.scrollY,desired+.269,'The physical coordinate keeps its representable nearby landing');
  assert(attempts<=2,`An unrepresentable fractional landing is not rewritten every return frame: ${attempts}`);
  assert.equal(page.raf.size,0,'The held fractional checkpoint has no idle RAF');
  const writes=attempts;
  for(let i=0;i<100;i++)page.frame();
  assert.equal(attempts,writes,'The sleeping checkpoint performs no hidden jump work');
  const after=f.page.flightUpdates.at(-1).after;
  const next=page.wheel(-120,300);
  assert(!next.prevented,'A fresh visible About gesture remains native/released');
  page.frames();
  assert(page.window.scrollY<desired-100,'New input invalidates the accepted landing and moves About');
  assert(page.flightUpdates.at(-1).after<after-20,'The next gesture moves the About text');
  assert.equal(view.root.hidden,true,'Quantization never changes the forward entry threshold or reacquires People');
}
(async()=>{
  await verify(false);await verify(true);
  console.log('Fractional checkpoint checks passed: native and smooth adapters accept verified raster landing, bounded writes, sleeping RAF, exact child pose and fresh reverse input.');
})().catch(error=>{console.error(error);process.exitCode=1;});
