const assert = require('node:assert/strict');
const {makeUnitDurationPage, turn, near} = require('./scroll-check.cjs');

function box(node) {
  const transform = /^translate3d\(([-\d.e+]+)px, ([-\d.e+]+)px, 0\)$/.exec(node.style.transform || '');
  assert(transform, 'A complete cached portrait translation is present');
  const x = Number(transform[1]), y = Number(transform[2]);
  const width = parseFloat(node.style.width), height = parseFloat(node.style.height);
  assert([x, y, width, height].every(Number.isFinite), 'Portrait geometry remains finite');
  return {x, y, width, height, bottom: y + height};
}

function portrait(page) { return box(page.nodes['[data-layer="portrait"]']); }
function depth(page) { return box(page.nodes['[data-layer="depth"]']); }
function assertAligned(page, label) {
  const color = portrait(page), map = depth(page);
  for (const key of ['x', 'y', 'width', 'height']) near(map[key], color[key], `${label}: depth and color stay aligned (${key})`);
  return color;
}
function assertCovered(page, label) {
  const color = assertAligned(page, label);
  assert(color.bottom >= page.position()[1] - .001, `${label}: portrait bottom ${color.bottom} must cover scene height ${page.position()[1]}`);
}
function settleCovered(page, label) {
  let frames = 0;
  while (page.raf.size && frames < 180) {
    page.frame(); frames++;
    assertCovered(page, `${label}, frame ${frames}`);
  }
  assert.equal(page.raf.size, 0, `${label}: animation settles without an idle loop`);
  assert.equal(page.frame(), 0, `${label}: no extra frame after settling`);
  return frames;
}

(async () => {
  // Original Figma poses which already cover the lower edge must not move.
  // Phone and large-desktop coordinates are independent frozen baselines.
  const unchanged = [
    [375, 812, [-94, 105, 561.1248, 705.5248]],
    [768, 1022, [-52.8384, 11.9793, 873.6768, 1032.9865]],
    [1440, 800, [225.766, -130, 986.4679, 1164]],
    [1920, 960, [345, -161, 1228, 1449]],
    [2560, 1305, [494, -170, 1572, 1854.9088]],
  ];
  for (const [width, height, expected] of unchanged) {
    const page = makeUnitDurationPage(width, height);
    await turn();
    const pose = assertAligned(page, `${width}x${height}`);
    ['x', 'y', 'width', 'height'].forEach((key, i) => near(pose[key], expected[i], `${width}x${height} retains its approved ${key}`));
  }

  // Tall tablet shapes, including CSS widths which use the intermediate
  // desktop export, previously exposed 139–358px below the fixed-size image.
  const matrix = [[600,1200], [768,1200], [820,1180], [960,1200], [1024,1280], [1024,1366], [1112,1366], [1194,1366], [1366,1200]];
  const sourceDimensions = new Map([
    [820, [882.4046827380952,1043.124449404762]],
    [960, [905.9028285714286,1070.4189285714285]],
    [1024, [916.644838095238,1082.8964047619047]],
  ]);
  let sampledFrames = 0;
  for (const [width, height] of matrix) {
    const page = makeUnitDurationPage(width, height);
    await turn();
    const opening = portrait(page);
    assertCovered(page, `${width}x${height} opening`);
    // The correction repositions the source image; it must not stretch or
    // separately rescale the depth map to hide the gap.
    near(opening.bottom, height, `${width}x${height} tall opening meets the lower edge exactly`);
    if (sourceDimensions.has(width)) {
      const [sourceWidth, sourceHeight] = sourceDimensions.get(width);
      near(opening.width, sourceWidth, `${width}x${height} retains source width`);
      near(opening.height, sourceHeight, `${width}x${height} retains source height`);
    }
    const forward = new Map();
    for (const p of [0, .005, .02, .08, .15, .3, .5, .75, .9, 1]) {
      page.scroll(height * p);
      sampledFrames += settleCovered(page, `${width}x${height} moving toward ${p}`);
      near(Number(page.hero.dataset.scrollProgress), p, `${width}x${height} reaches requested morph progress`);
      assertCovered(page, `${width}x${height} settled ${p}`);
      forward.set(p, {...portrait(page), scene: [...page.position()]});
    }
    for (const p of [.75, .3, .02, 0]) {
      page.scroll(height * p); settleCovered(page, `${width}x${height} reverse ${p}`);
      assertCovered(page, `${width}x${height} reverse ${p}`);
      const restored = portrait(page), expected = forward.get(p);
      for (const key of ['x', 'y', 'width', 'height']) near(restored[key], expected[key], `${width}x${height} reverse restores ${key} at ${p}`);
      assert.deepEqual(page.position(), expected.scene, 'Reverse restores the same scene geometry');
    }
    near(portrait(page).width, opening.width, 'The original opening image width survives reverse');
    near(portrait(page).height, opening.height, 'The original opening image height survives reverse');
  }

  // A short landscape has existing bottom crop and should retain it, rather
  // than being unconditionally re-anchored upward.
  const landscape = makeUnitDurationPage(1024, 768);
  await turn();
  const landscapeOpening = portrait(landscape);
  near(landscapeOpening.y, -41.97074013605442, '1024x768 retains its original landscape y');
  near(landscapeOpening.height, 1082.8964047619047, 'Landscape source height stays unchanged');
  assert(landscapeOpening.bottom > 768, 'The original landscape lower crop is preserved');
  landscape.resize(960,1200); landscape.frames(); assertCovered(landscape, 'Landscape to tall tablet resize');
  landscape.resize(1024,768); landscape.frames();
  for (const key of ['x', 'y', 'width', 'height']) near(portrait(landscape)[key], landscapeOpening[key], `Orientation return restores ${key}`);
  console.log(`Tablet portrait bottom checks passed: approved phone/Figma/desktop poses, ${matrix.length} tall layouts, ${sampledFrames} morph frames, aligned depth, reverse and orientation restoration.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
