/* Fixed artwork ownership and its exposure renderer use the same state in
   animated and reduced-motion stories, including reverse entry. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'about-reveal.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'background-raster.css'),'utf8');
function element(){return{dataset:{},children:[],attributes:{},style:{setProperty(key,value){this[key]=String(value);}},setAttribute(key,value){this.attributes[key]=String(value);},append(...children){this.children.push(...children);}};}
const hero=element(),backdrop=element(),light=element();
backdrop.querySelector=selector=>selector==='.about-backdrop__light'?light:null;
hero.querySelector=()=>{throw Error('Shared renderer must not look inside a scrolling chapter for its background.');};
hero.querySelectorAll=()=>[];hero.getBoundingClientRect=()=>({left:0,top:0});
let titleCoverage;
const window={InspirationClosing:{updateTheme(sample){titleCoverage=[sample(180,260),sample(180,550)];}}};
const document={querySelector:selector=>({'.hero':hero,'[data-site-backdrop]':backdrop}[selector]||null),createElementNS:()=>element()};
class IntersectionObserver{constructor(){throw Error('The title roll supplies both animated and reduced motion background timing');}}
vm.runInNewContext(source,{window,document,IntersectionObserver});
const update=(progress,blackProgress=0,reducedMotion=false)=>window.HeroAboutReveal.update({progress,blackProgress,reducedMotion,width:375,height:812,mode:'gradient',feather:1.5});
update(.5);assert(light.style.maskImage.startsWith('linear-gradient(to bottom'),'About raises the existing soft field');
assert.equal(backdrop.style['--works-black-opacity'],'0');
update(1,.5);assert.equal(backdrop.style['--works-black-opacity'],'1');
assert.equal(backdrop.style['--works-black-mask'],hero.style['--works-black-mask'],'The fixed owner and chrome share the exact return field');
assert(titleCoverage[0]>.5&&titleCoverage[1]<.5,'The two title faces sample the same bottom-up matte at their own heights');
update(1,1);assert.equal(backdrop.style['--works-black-mask'],'none');assert.equal(backdrop.style['--works-black-opacity'],'1');
update(.5,0);assert.equal(backdrop.style['--works-black-opacity'],'0','Reverse to About removes the black return');

update(1,0,true);assert.equal(backdrop.style['--works-black-opacity'],'0','Reduced motion stays light until the title changes');
update(1,1,true);assert.equal(backdrop.style['--works-black-opacity'],'1','Static Works uses the same dark fixed artwork after the title changes');
assert.equal(backdrop.style['--works-black-mask'],'none','Reduced motion skips the moving matte');
update(1,0,true);assert.equal(backdrop.style['--works-black-opacity'],'0','Reverse native flow restores the original title’s light surface');

assert.equal((html.match(/\bdata-site-backdrop\b/g)||[]).length,1,'There is exactly one site background owner');
assert(html.indexOf('data-site-backdrop')<html.indexOf('<main>'),'The fixed background lives outside all scrolling/transformed chapter content');
assert(/body > \[data-site-backdrop\]\s*\{[^}]*position:\s*fixed/.test(css));
assert(css.includes(':is(.hero, .works-journey, .services) { background: transparent; }'),'Chapter shells expose the shared surface');
assert(css.includes(':is(.inspiration__backdrop, .works-backdrop, .services__background) { display: none; }'),'No separate raster moves with a chapter');
console.log('Shared backdrop passed: single fixed owner, reversible About/title field, transparent chapter shells, static Works theme and no extra animation clock.');
