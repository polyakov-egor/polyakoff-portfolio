/* Exact supplied vector geometry, calm motion and existing UI contracts. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'music-equalizer.js'),'utf8');
const css=fs.readFileSync(path.join(root,'music-equalizer.css'),'utf8');
const asset=fs.readFileSync(path.join(root,'assets/icons/music-on-user.svg'));
assert.equal(crypto.createHash('sha256').update(asset).digest('hex'),'59a2b07ef336bd5a695c94af838a6df6760315c34fc551ad4042b295c618e610','Supplied SVG bytes are unchanged');
const sourcePaths=[...asset.toString().matchAll(/<path d="([^"]+)"/g)].map(m=>m[1]);
assert.equal(sourcePaths.length,4);
function element(tag,attrs={}){
 const node={tagName:tag.toUpperCase(),children:[],attrs:{...attrs},append(...items){this.children.push(...items);},setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k];}};
 Object.defineProperty(node,'className',{get(){return this.attrs.class||'';},set(v){this.attrs.class=v;}});
 node.classList={contains(c){return node.className.split(/\s+/).includes(c);},add(c){if(!this.contains(c))node.className=(node.className+' '+c).trim();},toggle(c,on){if(on)this.add(c);else node.className=node.className.split(/\s+/).filter(v=>v!==c).join(' ');}};
 return node;
}
const icons=[element('span',{class:'theme-icon'}),element('span',{class:'theme-icon'})];
icons[0].append(element('img',{src:'./assets/icons/music.svg',width:'16',height:'16'}),element('img',{src:'./assets/icons/music-dark.svg',class:'theme-icon__light',width:'16',height:'16'}));
icons[1].append(element('img',{src:'./assets/icons/music-dark.svg',class:'theme-icon__light',width:'16',height:'16'}));
const originals=icons.map(icon=>icon.children.slice());
const attrs=originals.map(nodes=>nodes.map(node=>({...node.attrs})));
const controls=icons.map(icon=>{const c=element('button',{class:'music-control','aria-disabled':'true'});c.append(icon,element('span',{class:'music-control__time'}));return c;});
const timers=controls.map(c=>c.children[1]),dh=new Map(),wh=new Map();
const document={hidden:false,documentElement:element('html'),querySelectorAll(s){assert.equal(s,'.music-control > .theme-icon');return icons;},createElementNS(ns,tag){assert.equal(ns,'http://www.w3.org/2000/svg');return element(tag);},addEventListener:(n,f)=>dh.set(n,f)};
const window={addEventListener:(n,f)=>wh.set(n,f)};
const run=()=>vm.runInNewContext(script,{document,window});run();
for(const [i,icon]of icons.entries()){
 assert(icon.classList.contains('music-equalizer'));
 assert.deepEqual(icon.children.slice(0,originals[i].length),originals[i]);
 assert.deepEqual(originals[i].map(n=>n.attrs),attrs[i],'Original image nodes and dimensions are untouched');
 const svg=icon.children.at(-1);
 assert.equal(svg.tagName,'SVG');assert.equal(svg.attrs.viewBox,'0 0 16 16');assert.equal(svg.attrs.width,'16');assert.equal(svg.attrs.height,'16');
 assert.equal(svg.attrs['aria-hidden'],'true');assert.equal(svg.attrs.focusable,'false');
 assert.deepEqual(svg.children.map(n=>n.attrs.d),sourcePaths,'All four animated vectors retain the exact supplied source paths');
 assert.deepEqual(svg.children.map(n=>n.attrs['data-equalizer-bar']),['1','2','3','0']);
 assert(svg.children.every(n=>n.tagName==='PATH'&&n.attrs.fill==='currentColor'));
 assert.equal(controls[i].children[1],timers[i]);assert.equal(controls[i].attrs['aria-disabled'],'true');
}
run();assert.equal(icons[0].children.length,3);assert.equal(icons[1].children.length,2,'Initialization is idempotent');
document.hidden=true;dh.get('visibilitychange')();assert(document.documentElement.classList.contains('equalizer-is-paused'));
document.hidden=false;wh.get('pageshow')();assert(!document.documentElement.classList.contains('equalizer-is-paused'));
wh.get('pagehide')();assert(document.documentElement.classList.contains('equalizer-is-paused'));
function values(d){
 const tokens=d.match(/[A-Za-z]|-?(?:\d*\.)?\d+(?:[eE][+-]?\d+)?/g),result=[];let at=0;
 while(at<tokens.length){const c=tokens[at++],n={M:2,C:6,V:1,Z:0}[c];assert.notEqual(n,undefined);for(let i=0;i<n;i++)result.push({n:Number(tokens[at++]),y:c==='V'||i%2===1});}
 return result;
}
const order=[3,0,1,2];
for(let bar=0;bar<4;bar++){
 const body=new RegExp('@keyframes music-equalizer-calm-'+bar+' \\{([\\s\\S]*?)(?=\\n@keyframes|\\n\\.equalizer-is-paused)').exec(css)?.[1];
 assert(body);const paths=[...body.matchAll(/d: path\("([^"]+)"\)/g)].map(m=>m[1]);assert.equal(paths.length,4,'Each calm cycle has only three broad changes');assert.equal(paths[0],paths.at(-1),'Cycle closes continuously');
 const source=values(sourcePaths[order[bar]]);
 for(const d of paths){
  const animated=values(d);assert.equal(animated.length,source.length);const deltas=[];
  for(let j=0;j<source.length;j++){
   if(!source[j].y||source[j].n>=11.1)assert.equal(animated[j].n,source[j].n,'Width, bottom contour and rounded bottom caps remain fixed');
   else deltas.push(animated[j].n-source[j].n);
  }
  assert(deltas.every(n=>Math.abs(n-deltas[0])<.00002),'Every top cap/control point moves by the same amount without stretching');
  const ys=animated.filter(v=>v.y).map(v=>v.n);assert.equal(Math.max(...ys),12);assert(Math.min(...ys)>=2&&Math.min(...ys)<=10);
 }
}
const durations=[...css.matchAll(/animation-duration:\s*calc\((\d+)ms\s*\/\s*var\(--music-activity, 1\.35\)\)/g)].map(m=>+m[1]);
assert.equal(durations.length,4);assert(durations.every(n=>n>=2800&&n<=3800));assert.equal(new Set(durations).size,4);
assert(durations.every(n=>n/1.35<n),'The default activity makes the exact calm vectors slightly more lively');
assert.match(css,/@supports \(d: path/,'Unsupported browsers retain exact static d attributes');
assert.match(css,/prefers-reduced-motion:[\s\S]*animation: none/,'Reduced motion restores original path geometry');
assert.match(css,/equalizer-is-paused[\s\S]*animation-play-state: paused/);
assert.match(css,/color: rgb\(calc\(255 - 226 \* var\(--about-light-progress, 0\)\)/);
assert(!/scaleY|transform:|height:\s*[2-9]px/.test(css),'No image scaling, padded slices or CSS substitutes for the four vectors');
assert(!/requestAnimationFrame|setInterval|setTimeout|Audio\(|innerHTML/.test(script),'No extra JS clock or audio side effect');
assert(!/\.music-control__time|\.music-control\s*\{/.test(css));
console.log('PASS: exact supplied four-path SVG, fixed baseline/width/caps, tunable activity with calm 2.8–3.8s base cycles, theme/timer preservation, hidden pause, idempotence and static fallback.');
