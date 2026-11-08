const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const node=()=>({attrs:{},style:{},dataset:{},children:[],setAttribute(k,v){this.attrs[k]=String(v);},removeAttribute(k){delete this.attrs[k];},append(...children){this.children.push(...children);},getBoundingClientRect(){assert.fail('The side wall must not read browser layout');}});
const root=node(),scope={window:{InspirationView:{root}},document:{createElementNS:()=>node()},requestAnimationFrame(){assert.fail('The side wall uses the shared story clock');}};
const site=path.join(__dirname,'..');vm.runInNewContext(fs.readFileSync(path.join(site,'squircle.js'),'utf8'),scope);
vm.runInNewContext(fs.readFileSync(path.join(site,'inspiration-flip-thickness.js'),'utf8'),scope);
const {update,mesh,sideStrips}=scope.window.InspirationFlipThickness,svg=root.children[0],wall=svg.children[0];
assert('hidden' in svg.attrs,'SVG uses a reflected hidden attribute, rather than an HTML-only property');
assert.equal(wall.attrs.fill,'#dedede');
for(const size of [180,260,320,400])for(const radius of [48,size*.27]){
  const edge=mesh({size,radius,angle:90});
  assert.equal(edge.depth,2,'Thickness is two local pixels');
  assert(edge.front.length>60,'The extrusion follows the smoothed perimeter, including corners');
  const xs=[...edge.front,...edge.back].map(p=>p[0]);
  assert(Math.max(...xs)-Math.min(...xs)>=2,'The side is still visible exactly edge-on');
  assert(Math.max(...xs)-Math.min(...xs)<3,'The side does not become an exaggerated slab');
  for(const angle of [0,35,90,145,180]){
    update({x:200,y:100,size,radius,angle,visible:true});
    assert(!('hidden' in svg.attrs));assert.equal(svg.attrs.width,String(size));
    assert(!/NaN|Infinity|undefined/.test(wall.attrs.d),'Every projected side quad is finite');
    assert.equal(svg.style.transform,'translate3d(200px, 100px, 0)');
  }
}
update({visible:false});assert('hidden' in svg.attrs,'The complete side wall disappears after the flip');
assert.equal(root.children.length,1,'Repeated updates reuse one inert vector surface');

// A real side plane's corners must be the very same points as the front/back
// contour after the complete click + recession + hover + camera transform.
const rad=angle=>angle*Math.PI/180;
const rotateY=([x,y,z],angle)=>[x*Math.cos(rad(angle))+z*Math.sin(rad(angle)),y,-x*Math.sin(rad(angle))+z*Math.cos(rad(angle))];
const rotateX=([x,y,z],angle)=>[x,y*Math.cos(rad(angle))-z*Math.sin(rad(angle)),y*Math.sin(rad(angle))+z*Math.cos(rad(angle))];
function hoverProject(point,{hoverX=0,hoverY=0,hoverScale=1}={}){
  const [x,y,z]=point;
  const rotated=rotateX(rotateY([x*hoverScale,y*hoverScale,z],hoverY),hoverX);
  const p=800/(800-rotated[2]);return[rotated[0]*p,rotated[1]*p];
}
function faceProject(point,size,angle,{recession=1,...hover}={}){
  const half=size/2;
  return hoverProject(rotateY([(point[0]-half)*recession,(point[1]-half)*recession,point[2]],angle),hover);
}
for(const size of [160,260,400]){
  const radius=size*.27,strips=sideStrips({size,radius,depth:2});
  assert(strips.length>60&&strips.length<160,'The physical wall has a bounded smoothed perimeter');
  for(let i=0;i<strips.length;i++){
    const strip=strips[i],next=strips[(i+1)%strips.length];
    assert(Math.hypot(strip.end[0]-next.start[0],strip.end[1]-next.start[1])<1e-6,'Adjacent side strips share a continuous contour');
    for(const endpoint of [-1,1])for(const z of [-1,1]){
      const x=strip.x+Math.cos(rad(strip.angle))*endpoint*strip.length/2;
      const y=strip.y+Math.sin(rad(strip.angle))*endpoint*strip.length/2;
      const expected=endpoint===-1?strip.start:strip.end;
      assert(Math.hypot(x-expected[0],y-expected[1])<1e-6,'CSS tangent-strip corners coincide with the sampled face silhouette');
      for(const angle of [25,67,90,128,170])for(const pose of [{hoverX:12,hoverY:-9,hoverScale:1.05,recession:.9},{hoverX:-11,hoverY:12,hoverScale:1.025,recession:1}]){
        const actual=faceProject([x,y,z],size,angle,pose),face=faceProject([...expected,z],size,angle,pose);
        assert(Math.hypot(actual[0]-face[0],actual[1]-face[1])<1e-6,'Side and face remain registered through nested hover, flip and recession at every angle');
      }
    }
  }
}
const size=400,radius=108,angle=67,pose={hoverX:12,hoverY:-9,hoverScale:1.05};
const first=sideStrips({size,radius}).find(strip=>strip.start[0]>size-.1).start;
const projected=faceProject([...first,1],size,angle);
const actual=faceProject([...first,1],size,angle,pose),old=hoverProject([...projected,0],pose);
assert(Math.hypot(actual[0]-old[0],actual[1]-old[1])>1,'The regression pose reproduces why a preprojected flat SVG drifts under hover');
console.log('Inspiration thickness checks passed: retained initial Hero2px SVG extrusion, lazy physical side-strip contour, exact nested hover/flip/recession registration, legacy drift regression, finite adaptive/reverse poses and no layout reads or clock.');
