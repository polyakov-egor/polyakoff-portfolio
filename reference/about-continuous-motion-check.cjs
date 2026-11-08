/* Continuous native input must not create a positional ease-out at the
   Hero-to-About handoff. Uses the actual shared owner and published preset. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {makePage, turn, near} = require('./scroll-check.cjs');
const published = fs.readFileSync(path.join(__dirname, '../published-effect-preset.js'), 'utf8');
const y = page => parseFloat(page.copy.style.values.get('--about-text-y'));

(async () => {
  for (const [width, height] of [[375,812],[768,1024],[1440,800],[1920,960],[2560,1305]]) {
    const page = makePage(width, height, 0, new Map(), true, {
      beforeScroll({window, context}) {
        vm.runInContext(published, context, {filename:'published-effect-preset.js'});
        window.SiteSmoothScroll = {raf(){}, usesSmoothedScroll:()=>true};
      }
    });
    await turn(); page.frames(); page.layout(false);
    const settings = page.window.HeroScrollEffect.getSettings();
    near(settings.heroScrollDuration, 2.2, 'Published hero duration remains unchanged');
    near(settings.aboutScrollDuration, 2.5, 'Published reading duration remains unchanged');
    near(settings.aboutTriggerGapPx, 140, 'Portrait trigger keeps its saved distance');
    const morph = height * settings.heroScrollDuration;
    const sample = distance => {page.scroll(distance);page.frame();return y(page);};
    const entryStart = sample(morph * .6);
    let previousY = entryStart, previousDistance = morph * .6;
    const speeds = [];
    for (let distance = previousDistance + 10; distance < morph; distance += 10) {
      const next = sample(distance);
      speeds.push((previousY - next) / (distance - previousDistance));
      previousY = next; previousDistance = distance;
    }
    assert(speeds.length > 10);
    assert(speeds.every(speed => speed > .3), `${width}: visible reading never stalls before flight`);
    assert(Math.max(...speeds) - Math.min(...speeds) < 1e-8,
      `${width}: equal native steps move intact text at a constant entry speed`);
    const before = sample(morph - 10), at = sample(morph), after = sample(morph + 10);
    const beforeSpeed = (before - at) / 10, afterSpeed = (at - after) / 10;
    assert(Math.abs(beforeSpeed / afterSpeed - 1) < .15,
      `${width}: entry and About speeds stay approximately equal without a zero-speed frame`);
    near(afterSpeed, 1 / settings.aboutScrollDuration, `${width}: reading keeps the saved scroll scale`);
    const finalCard = JSON.stringify(page.card());
    sample(morph + 80);
    assert.equal(JSON.stringify(page.card()), finalCard, 'Only copy moves during About');
    const reverse = sample(morph - 10);
    near(reverse, before, 'Reverse scrolling restores the exact same reading pose');
    page.frames(); assert.equal(page.raf.size, 0, 'At rest the shared timeline sleeps');
  }
  console.log('About motion passed: constant visible entry, non-stalling handoff across five breakpoints, saved scale/trigger, pinned portrait, reverse determinism and idle sleep.');
})().catch(error=>{console.error(error);process.exitCode=1;});
