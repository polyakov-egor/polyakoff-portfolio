/* Fixed artwork ownership + the actual exposure renderer. Native static flow
   must use the same surface as the animated story, including reverse entry. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'about-reveal.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'background-raster.css'),'utf8');
function element(){return{dataset:{},children:[],attributes:{},style:{setProperty(key,value){this[key]=String(value);}},setAttribute(key,value){this.attributes[key]=String(value);},append(...children){this.children.push(...children);}};}
const hero=element(),backdrop=element(),light=element(),services=element();
backdrop.querySelector=selector=>selector==='.about-backdrop__light'?light:null;
hero.querySelector=()=>{throw Error('Shared renderer must not look inside a scrolling chapter for its background.');};
hero.querySelectorAll=()=>[];hero.getBoundingClientRect=()=>({left:0,top:0});
const events=new Map();
const reduced={matches:false,addEventListener(type,callback){events.set('motion:'+type,callback);}};
const window={innerHeight:812,matchMedia:()=>reduced,addEventListener(type,callback){events.set(type,callback);}};
const document={querySelector:selector=>({'.hero':hero,'[data-site-backdrop]':backdrop,'[data-services]':services}[selector]||null),createElementNS:()=>element()};
const observers=[];
class IntersectionObserver{
 constructor(callback,options){this.callback=callback;this.options=options;this.disconnected=false;observers.push(this);}
 observe(target){this.target=target;}
 disconnect(){this.disconnected=true;}
 at(top){this.callback([{target:this.target,boundingClientRect:{top}}]);}
}
vm.runInNewContext(source,{window,document,IntersectionObserver});
const update=(progress,blackProgress=0,reducedMotion=false)=>window.HeroAboutReveal.update({progress,blackProgress,reducedMotion,width:375,height:812,mode:'gradient',feather:1.5});
assert.equal(observers.length,0,'Animated scroll uses its existing clock, without an observer or another RAF');
update(.5);assert(light.style.maskImage.startsWith('linear-gradient(to bottom'),'About raises the existing soft field');
assert.equal(backdrop.style['--works-black-opacity'],'0');
update(1,.5);assert.equal(backdrop.style['--works-black-opacity'],'1');
assert.equal(backdrop.style['--works-black-mask'],hero.style['--works-black-mask'],'The fixed owner and chrome share the exact return field');
update(1,1);assert.equal(backdrop.style['--works-black-mask'],'none');assert.equal(backdrop.style['--works-black-opacity'],'1');
update(.5,0);assert.equal(backdrop.style['--works-black-opacity'],'0','Reverse to About removes the black return');

reduced.matches=true;events.get('motion:change')();
assert.equal(observers.length,1);assert.equal(observers[0].target,services);
assert.equal(observers[0].options.rootMargin,'0px 0px -406px 0px','The static section boundary uses viewport height, not percentage-of-width root margins');
update(1,0,true);assert.equal(backdrop.style['--works-black-opacity'],'0');
observers[0].at(405);assert.equal(backdrop.style['--works-black-opacity'],'1','Static Services enters over the same dark fixed artwork');
observers[0].at(-1400);assert.equal(backdrop.style['--works-black-opacity'],'1','The dark surface continues beyond Services');
observers[0].at(407);assert.equal(backdrop.style['--works-black-opacity'],'0','Reverse native flow returns to the light Works surface');
reduced.matches=false;events.get('motion:change')();assert(observers[0].disconnected,'No static observer stays active in the animated story');

assert.equal((html.match(/\bdata-site-backdrop\b/g)||[]).length,1,'There is exactly one site background owner');
assert(html.indexOf('data-site-backdrop')<html.indexOf('<main>'),'The fixed background lives outside all scrolling/transformed chapter content');
assert(/body > \[data-site-backdrop\]\s*\{[^}]*position:\s*fixed/.test(css));
assert(css.includes(':is(.hero, .works-journey, .services) { background: transparent; }'),'Chapter shells expose the shared surface');
assert(css.includes(':is(.inspiration__backdrop, .works-backdrop, .services__background) { display: none; }'),'No separate raster moves with a chapter');
console.log('Shared backdrop passed: single fixed owner, reversible About/Works field, transparent chapter shells, static Services theme and no extra animation clock.');
