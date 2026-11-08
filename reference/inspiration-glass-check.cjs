const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'inspiration-glass.css'),'utf8');
const hover=fs.readFileSync(path.join(root,'inspiration-hover.js'),'utf8');
const hoverCss=fs.readFileSync(path.join(root,'inspiration-hover.css'),'utf8');
const worksCss=fs.readFileSync(path.join(root,'works-gallery.css'),'utf8');
vm.runInNewContext(fs.readFileSync(path.join(root,'inspiration-glass.js'),'utf8'),{
  document:new Proxy({}, {get(){assert.fail('The retired refraction entry must allocate no DOM/SVG nodes');}}),
  requestAnimationFrame(){assert.fail('Plain background blur needs no extra clock');}
});
assert(!/cloneNode|glass-sample|createElementNS/.test(hover),'Hover keeps one photograph and allocates no copied-image/filter surface');
assert(!/url\(|saturate|mix-blend/.test(css),'Simple plate has no SVG refraction, highlight blend or saturation pass');
assert(!/glass-sample/.test(hoverCss),'No stale full-photo blur layer survives in hover CSS');
assert(css.includes('--inspiration-glass-frost: 32px'),'Figma background blur is retained');
const actualPlate=css.match(/\.inspiration__glass\s*\{([^}]+)\}/)[1];
const pseudoPlate=css.match(/\.inspiration__glass::before\s*\{([^}]+)\}/)[1];
assert(actualPlate.includes('--inspiration-glass-tint: 20%'),'Inspiration uses its new black20 capsule');
assert(actualPlate.includes('overflow: hidden') && actualPlate.includes('backdrop-filter: blur('),'Rounded capsule owns both native blur and clipping in the 3D face');
assert(actualPlate.includes('clip-path: inset(0 round 48px)'),'Explicit rounded clip constrains the backdrop surface inside the transformed card');
assert(pseudoPlate.includes('content: none') && !pseudoPlate.includes('backdrop-filter: blur('),'A second filtered pseudo-surface cannot square the capsule corners');
assert(actualPlate.includes('var(--inspiration-plate-opacity, 1)'),'First-card reveal still controls tint and blur without fading the backdrop root');
assert(css.includes('border: 1px solid rgb(255 255 255 / 10%)'),'Inspiration plus keeps the Figma outline circle');
assert(worksCss.includes('background: rgb(29 29 29 / 60%)'),'Works uses the new black60 capsule');
assert(worksCss.includes('background: rgb(29 29 29 / 80%)'),'Works arrow uses the new black80 circle');
assert(!/saturate\(1\.15\)|inset 1px 0 1px/.test(worksCss),'Works no longer adds refraction-like highlights or saturation');
assert(worksCss.includes('translate3d(-50%, 28px, 0) scale(.97)'),'Project details still enter from below');
assert(worksCss.includes('translate3d(-50%, -12px, 0) scale(.9)'),'Project details still recede upward on leave');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'reference/inspiration-assets.json'),'utf8'));
for(const file of manifest.files)assert.equal(fs.statSync(path.join(root,file.path)).size,file.bytes,'Original card source remains intact: '+file.path);
console.log('Plate checks passed: native backdrop blur, exact Figma tints/circle treatment, no cloned photographs or SVG maps, unchanged project entry/exit and original source assets.');
