const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const element = () => ({
  style:{},dataset:{},attrs:{},classes:{},
  classList:{toggle(name,on){this.owner.classes[name]=on;}},
  setAttribute(key,value){this.attrs[key]=value;}
});
const words = Array.from({length:3}, element), wordGroup = element();
for(const node of [...words,wordGroup])node.classList.owner=node;
const forbid = () => assert.fail('Heading motion must use the existing story clock, without its own events or timers');
const context = {
  window:{InspirationView:{words,wordGroup},addEventListener:forbid,requestAnimationFrame:forbid,setTimeout:forbid,setInterval:forbid},
  requestAnimationFrame:forbid,setTimeout:forbid,setInterval:forbid
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../inspiration-headings.js'),'utf8'),context);
const {update,getWordPose} = context.window.InspirationHeadings;
const near = (actual,expected,message) => assert(Math.abs(actual-expected)<1e-7,`${message}: ${actual} vs ${expected}`);
const snapshot = () => JSON.stringify({words:words.map(({style,dataset,attrs,classes})=>({style,dataset,attrs,classes})),wordGroup:{dataset:wordGroup.dataset,classes:wordGroup.classes}});

// Apply the emitted CSS transform independently, right to left. Checking
// projected edge coordinates catches wrong rotation signs or Z-offset order.
function point(index,x,y,z=0,project=true){
  const transform=words[index].style.transform;
  const operations=[...transform.matchAll(/(perspective|translateZ|rotateX)\(([-\d.e+]+)(?:px|deg)\)/g)];
  assert.equal(operations.map(match=>match[0]).join(' '),transform,'Each word uses a complete 3D face transform');
  let w=1;
  for(const [,operation,raw] of operations.reverse()){
    const value=Number(raw);
    assert(Number.isFinite(value),'All emitted transform values are finite');
    if(operation==='translateZ')z+=value;
    else if(operation==='rotateX'){
      const angle=value*Math.PI/180,oldY=y;
      y=oldY*Math.cos(angle)-z*Math.sin(angle);
      z=oldY*Math.sin(angle)+z*Math.cos(angle);
    }else if(project)w-=z/value;
  }
  return {x:x/w,y:y/w,z:z/w};
}
function oneAccessible(active){
  assert.equal(wordGroup.dataset.active,String(active));
  assert.equal(words.filter(word=>word.attrs['aria-hidden']==='false').length,1,'Only one category is accessible');
  for(let i=0;i<3;i++)assert.equal(words[i].attrs['aria-hidden'],String(i!==active));
}

for(const font of [32,40,48,64])for(const stacked of [false,true])for(let active=0;active<3;active++){
  update({first:active>=1?1:0,second:active>=2?1:0,font,stacked});
  assert.equal(wordGroup.dataset.mode,'cuboid');
  assert.equal(wordGroup.classes['inspiration__words--cuboid'],true);
  assert.equal(wordGroup.classes['inspiration__words--masked'],false);
  oneAccessible(active);
  const face=getWordPose(active,active,font);
  near(face.rotationX,0,'The resting face points at the reader');
  for(const [x,y] of [[0,-face.radius],[0,face.radius],[font*3,font*.17]]){
    const result=point(active,x,y);
    near(result.x,x,'Resting text keeps its horizontal position and width');
    near(result.y,y,'Resting text keeps its original baseline and height');
    near(result.z,0,'Resting text stays on the original plane');
  }
  for(let i=0;i<3;i++){
    assert.equal(Number(words[i].style.opacity),i===active?1:0,'Only one whole category is visible at rest');
    assert.equal(words[i].style.visibility,'','Words inherit the parent visibility during the closing handoff');
    assert.equal(words[i].style.filter,'none','Cuboid faces stay sharp');
    assert.equal(words[i].style.clipPath,'none','A text mask cannot crop the rotating face');
  }
}

for(const font of [32,48,64])for(const transition of [0,1])for(const progress of [.1,.25,.5,.8,.95]){
  const options={first:transition===0?progress:1,second:transition===1?progress:0,font};
  const position=transition+progress;
  update(options);
  const outgoing=getWordPose(transition,position,font),incoming=getWordPose(transition+1,position,font);
  assert(outgoing.rotationX>0&&outgoing.rotationX<90,'Outgoing face rotates upward');
  assert(incoming.rotationX<0&&incoming.rotationX>-90,'Incoming face turns toward the reader from below');
  near(outgoing.rotationX-incoming.rotationX,90,'Neighboring words occupy perpendicular faces');
  assert(point(transition,0,0).y<0&&point(transition+1,0,0).y>0,'Face centers move to opposite sides of the same axis');
  for(const x of [-font*2,0,font*2]){
    const outgoingEdge=point(transition,x,outgoing.radius);
    const incomingEdge=point(transition+1,x,-incoming.radius);
    for(const axis of ['x','y','z'])near(outgoingEdge[axis],incomingEdge[axis],'Adjacent faces share one projected cuboid edge');
  }
  const center=point(transition,0,0,0,false);
  near(center.y,outgoing.y,'Legacy closing pose uses the same vertical center');
  near(center.z,outgoing.z,'Pose depth agrees with the rendered face');
  assert.equal(Number(words[transition].style.opacity),1);
  assert.equal(Number(words[transition+1].style.opacity),1,'Both readable adjacent faces stay solid during the turn');
  assert.equal(Number(words[transition===0?2:0].style.opacity),0,'The unrelated third face stays hidden');
  oneAccessible(progress>=.5?transition+1:transition);
  const middle=snapshot();
  update({first:1,second:1,font:40});update({first:0,second:0,font:32});update(options);
  assert.equal(snapshot(),middle,'Reverse navigation and resize reproduce the exact same cuboid pose');
}

for(const reveal of [0,.1,.45,1]){
  update({font:64,reveal});
  near(point(0,0,0).y,0,'Entrance reveal preserves the first baseline');
  assert.equal(words[0].style.opacity,'1');
  assert.equal(words[1].style.opacity,'0');
  assert.equal(words[2].style.opacity,'0','Entrance reveal cannot expose inactive faces');
}
for(const i of [0,1]){
  const pose=getWordPose(i,2,64);
  assert.equal(pose.opacity,0,'Closing merge cannot resurrect former categories');
  assert.equal(pose.rotation,0,'The legacy closing rotation remains a separate 2D field');
}
for(const options of [{first:NaN,second:Infinity,font:NaN},{first:-2,second:4,font:-1},{first:Infinity,second:-Infinity,font:0}]){
  update(options);
  for(let i=0;i<3;i++){
    const projected=point(i,0,0);
    assert(Object.values(projected).every(Number.isFinite),'Invalid input cannot emit NaN or infinite geometry');
  }
  assert.equal(words.filter(word=>word.attrs['aria-hidden']==='false').length,1);
}

const css=fs.readFileSync(path.join(__dirname,'../inspiration-headings.css'),'utf8');
assert(/overflow:\s*visible/.test(css)&&/height:\s*1.12em/.test(css),'A fixed resting row permits the cuboid diagonal to extend during rotation');
assert(/margin-top:\s*-\.04em/.test(css)&&/padding-top:\s*\.04em/.test(css),'Compensated ink allowance preserves the original baseline');
assert(/backface-visibility:\s*hidden/.test(css),'Reversed text on the back of a face is hidden');
console.log('Inspiration heading checks passed: cuboid quarter-turns with shared projected edges, stable resting geometry, deterministic reverse/resize, accessible active category, no third face or closing ghosts, and no extra clock.');
