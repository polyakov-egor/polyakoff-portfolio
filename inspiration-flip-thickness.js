/* A 2px extrusion of the same smoothed card silhouette. Projecting the side
   quads keeps a real edge at 90 degrees; it is not a border on a flat image.
   The existing Inspiration clock supplies every pose. */
(() => {
  'use strict';
  const view=window.InspirationView;
  if(!view?.root||!window.HeroSquircle)return;
  const svgNS='http://www.w3.org/2000/svg';
  const create=tag=>document.createElementNS?document.createElementNS(svgNS,tag):document.createElement(tag);
  const svg=create('svg'),wall=create('path');
  svg.setAttribute('class','inspiration-flip-thickness');
  svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  wall.setAttribute('fill','#dedede');svg.append(wall);view.root.append(svg);svg.setAttribute('hidden','');
  const number=value=>Number(value.toFixed(4));

  // HeroSquircle emits only these move/line/cubic/circular-arc commands. Sample
  // them in JavaScript rather than reading SVG geometry during animation.
  function outline(size,radius){
    const tokens=window.HeroSquircle.path(size,size,radius,1).match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g)||[];
    const points=[];let at=0,x=0,y=0,startX=0,startY=0;
    const take=()=>Number(tokens[at++]);
    const add=(px,py)=>{x=px;y=py;points.push([x,y]);};
    while(at<tokens.length){
      const command=tokens[at++];
      if(command==='M'){x=take();y=take();startX=x;startY=y;add(x,y);}
      else if(command==='L')add(take(),take());
      else if(command==='H')add(take(),y);
      else if(command==='V')add(x,take());
      else if(command==='c'){
        const x0=x,y0=y,x1=x+take(),y1=y+take(),x2=x+take(),y2=y+take(),x3=x+take(),y3=y+take();
        for(let i=1;i<=10;i++){const t=i/10,s=1-t;add(s*s*s*x0+3*s*s*t*x1+3*s*t*t*x2+t*t*t*x3,s*s*s*y0+3*s*s*t*y1+3*s*t*t*y2+t*t*t*y3);}
      }else if(command==='a'){
        const rx=take(),ry=take();take();const large=take(),sweep=take(),x2=x+take(),y2=y+take();
        const dx=(x-x2)/2,dy=(y-y2)/2,denominator=rx*rx*dy*dy+ry*ry*dx*dx;
        const sign=large===sweep?-1:1;
        const factor=sign*Math.sqrt(Math.max(0,(rx*rx*ry*ry-denominator)/Math.max(1e-12,denominator)));
        const cx=(x+x2)/2+factor*rx*dy/ry,cy=(y+y2)/2-factor*ry*dx/rx;
        const begin=Math.atan2((y-cy)/ry,(x-cx)/rx),end=Math.atan2((y2-cy)/ry,(x2-cx)/rx);
        let delta=end-begin;if(sweep&&delta<0)delta+=2*Math.PI;if(!sweep&&delta>0)delta-=2*Math.PI;
        const steps=Math.max(3,Math.ceil(Math.abs(delta)/(Math.PI/32)));
        for(let i=1;i<=steps;i++){const a=begin+delta*i/steps;add(cx+rx*Math.cos(a),cy+ry*Math.sin(a));}
      }else if(command==='Z'){if(Math.hypot(x-startX,y-startY)>1e-6)add(startX,startY);}
      else break;
    }
    if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-5)points.pop();
    return points;
  }

  function mesh({size,radius,angle,depth=2,perspective=1000}){
    const points=outline(size,radius),half=size/2,radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
    const project=(point,z)=>{
      const lx=point[0]-half,ly=point[1]-half,px=lx*c+z*s,pz=-lx*s+z*c;
      const scale=perspective/(perspective-pz);
      return [half+px*scale,half+ly*scale];
    };
    const front=points.map(point=>project(point,depth/2)),back=points.map(point=>project(point,-depth/2));
    const quads=points.map((_,i)=>[front[i],front[(i+1)%points.length],back[(i+1)%points.length],back[i]]);
    const d=quads.map(quad=>{
      const area=quad.reduce((sum,p,i)=>{const q=quad[(i+1)%quad.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
      if(area<0)quad.reverse();
      return `M ${quad.map(point=>point.map(number).join(' ')).join(' L ')} Z`;
    }).join(' ');
    return {d,front,back,depth};
  }
  // Unprojected tangent strips for the clickable cards. CSS applies click,
  // recession, hover and camera perspective once to this shared 3D geometry.
  // The initial Hero turn keeps using its existing standalone projected mesh.
  function sideStrips({size,radius,depth=2}){
    const points=outline(size,radius),segments=[];
    for(let i=0;i<points.length;i++){
      const start=points[i],end=points[(i+1)%points.length],dx=end[0]-start[0],dy=end[1]-start[1];
      const length=Math.hypot(dx,dy);
      if(length<.00001)continue;
      segments.push({start,end,x:(start[0]+end[0])/2,y:(start[1]+end[1])/2,length,angle:Math.atan2(dy,dx)*180/Math.PI,depth});
    }
    return segments;
  }
  function update({x=0,y=0,size=0,radius=0,angle=0,visible=false}={}){
    if(visible)svg.removeAttribute('hidden');else svg.setAttribute('hidden','');
    if(!visible||size<=0)return;
    const geometry=mesh({size,radius,angle});
    svg.setAttribute('width',size);svg.setAttribute('height',size);svg.setAttribute('viewBox',`0 0 ${size} ${size}`);
    svg.style.transform=`translate3d(${x}px, ${y}px, 0)`;
    wall.setAttribute('d',geometry.d);svg.dataset.angle=angle.toFixed(5);svg.dataset.depth='2';
  }
  window.InspirationFlipThickness=Object.freeze({update,mesh,sideStrips});
})();
