/* Curved tangent planes orbit a cylinder. The scroll story owns all time. */
(() => {
  'use strict';
  const viewport=document.querySelector('[data-works-gallery]'),list=viewport?.querySelector('[data-works-cards]');
  if(!viewport||!list)return;
  const projects=Object.freeze([
    {name:'Amonra',tags:['Web','Brand','2026'],image:'01-amonra.png',asset:'work-amonra',crop:'amonra',node:'796:5638'},
    {name:'Hermes',tags:['Web','Brand','2026'],image:'02-hermes.png',asset:'work-hermes',node:'796:5649'},
    {name:'Suborbia',tags:['Web','Brand','2026'],image:'03-suborbia.png',asset:'work-suborbia',node:'796:5627'},
    {name:'Skynews',tags:['Web','Brand','2024'],image:'04-skynews.png',asset:'work-skynews',node:'796:5598'},
    {name:'YouTube Music',tags:['App','2024'],image:'05-youtube-music.png',asset:'work-youtube-music',node:'796:5607'},
    {name:'It’sme',tags:['Web','Brand','2024'],image:'06-itsme.png',asset:'work-itsme',crop:'itsme',node:'796:5618'}
  ]);
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
  const frontThreshold=.2,foregroundBoost=1,maxBow=.118;
  const cardAspect=960/500,cornerRadius=.05;
  function liveDeformation(facing){
    const direct=clamp((facing-.45)/.5);
    return 1-.5*direct*direct*(3-2*direct)*(1-scrollBend);
  }
  function foregroundScale(facing){
    const t=clamp((facing-frontThreshold)/(.85-frontThreshold));
    const boost=Math.min(foregroundBoost,(layout?.foregroundMaxScale??1+foregroundBoost)-1);
    return 1+boost*t*t*(3-2*t);
  }
  function fitForegroundScale(width,focal,planeWidth,planeHeight){
    // Size only the near arc to a phone's safe width; rear meshes keep their
    // original dimensions. Allow space for the curved foreground mesh.
    const inset=16,halfWidth=width/2-inset;
    let lower=1,upper=1+foregroundBoost;
    for(let step=0;step<20;step++){
      const scale=(lower+upper)/2,height=planeHeight*scale;
      let extent=0;
      for(let column=0;column<=columns;column++){
        const u=uvs[column*2],localX=(u-.5)*planeWidth*scale,bow=Math.sin(u*Math.PI)*planeWidth*maxBow*scale,distance=6-bow;
        extent=Math.max(extent,Math.abs(focal*localX/distance),Math.abs(focal*(localX+height*height*.025)/distance));
      }
      if(extent<=halfWidth)lower=scale;else upper=scale;
    }
    return lower;
  }
  const make=(tag,className)=>{const node=document.createElement(tag);node.className=className;return node;};
  const cards=Array.from({length:12},(_,index)=>{
    const project=projects[index%projects.length],element=make('figure',`works-card${project.crop?` works-card--${project.crop}`:''}`);
    element.dataset.project=`${index%projects.length+1}`;element.dataset.sequence=`${index+1}`;element.dataset.nodeId=project.node;
    element.setAttribute('role','button');element.setAttribute('aria-label',`${project.name}, ${project.tags.join(', ')}`);
    const caption=make('figcaption','visually-hidden');caption.textContent=`${project.name} — ${project.tags.join(' · ')}`;
    const media=make('div','works-card__media'),image=make('img','works-card__image');
    image.dataset.chapterImage=project.asset;
    if(!window.ChapterAssets)image.src=`./assets/images/works/${project.image}`;
    image.alt=`${project.name} — ${project.tags.slice(0,-1).join(', ').toLowerCase()}`;
    image.decoding='async';image.draggable=false;image.width=960;image.height=500;
    media.append(image);element.append(caption,media);list.append(element);
    return{element,caption,image,index,project};
  });
  const pill=make('div','works-project mono'),details=make('div','works-project__details'),title=make('p','works-project__name'),tags=make('p','works-project__tags');
  pill.setAttribute('data-works-project','');pill.setAttribute('aria-hidden','true');details.append(title,tags);
  const button=make('button','works-project__button');button.type='button';button.setAttribute('aria-disabled','true');button.setAttribute('tabindex','-1');
  const arrow=make('img','works-project__arrow');arrow.src='./assets/icons/works-arrow.svg';arrow.width=16;arrow.height=16;arrow.alt='';
  button.append(arrow);pill.append(details,button);viewport.append(pill);
  const canvas=make('canvas','works-gallery-canvas');canvas.setAttribute('aria-hidden','true');viewport.append(canvas);
  let layout=null,lastProgress=0,lastReduced=false,poses=[],paintPoses=[],selected=null,pointer=null,touch=null,touchSelection=false,domTouchCard=null,lastTouchTime=-Infinity,leaveTimer=null,enterTimer=null,entrySerial=0,gpu=null,context2d=null;
  let projectionDirty=true,rendererStarted=false,chapterVisible=true,scrollBend=0,scrollBendTime=0;
  const boundsCache=new Map();
  const hoverAmounts=new Float32Array(cards.length),hoverFrom=new Float32Array(cards.length);
  let hoverStart=null,hoverAnimating=false;
  const columns=24,rows=8,indices=[],uvs=new Float32Array((columns+1)*(rows+1)*2);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+1,c=a+columns+1;indices.push(a,c,b,b,c,c+1);}
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){const i=(y*(columns+1)+x)*2;uvs[i]=x/columns;uvs[i+1]=y/rows;}
  // Reuse the two independent meshes: hover must never overwrite the base
  // vertices used for hit testing. Public geometry snapshots stay independent.
  function createMesh(card){return{...card,vertices:Array.from({length:uvs.length/2},(_,i)=>({x:0,y:0,distance:0,u:uvs[i*2],v:uvs[i*2+1]})),clip:new Float32Array(uvs.length*2)};}
  const baseMeshes=cards.map(createMesh),interactionMeshes=cards.map(createMesh);
  const canPaint=()=>chapterVisible&&!document.hidden;

  function suspendInteraction(){
    if(leaveTimer)clearTimeout(leaveTimer);if(enterTimer)clearTimeout(enterTimer);
    leaveTimer=null;enterTimer=null;pointer=null;touch=null;domTouchCard=null;selected=null;touchSelection=false;
    hoverStart=null;hoverAnimating=false;hoverAmounts.fill(0);hoverFrom.fill(0);
    scrollBend=0;scrollBendTime=0;
    pill.classList.remove('is-visible','is-leaving','is-entering','is-entering-alt');pill.dataset.sequence='';
    pill.setAttribute('aria-hidden','true');button.setAttribute('tabindex','-1');canvas.classList.remove('is-project-hovered');canvas.hidden=true;
    viewport.dataset.hoveredSequence='';viewport.classList.add('works-is-sleeping');
    for(const{element}of cards){element.classList.remove('is-hovered','is-dimmed');element.setAttribute('tabindex','-1');}
  }
  function setVisible(visible){
    const next=Boolean(visible);if(next===chapterVisible)return;
    chapterVisible=next;projectionDirty=true;
    // Keep textures and the retained backing surface ready for reverse scroll.
    // The owner supplies its current phase before the canvas is shown again.
    if(!canPaint())suspendInteraction();
  }
  document.addEventListener?.('visibilitychange',()=>{
    projectionDirty=true;
    if(!canPaint())suspendInteraction();
    else update(lastProgress,{reducedMotion:lastReduced});
  });

  function compile(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Works shader failed');return shader;}
  function createRenderer(){
    if(rendererStarted||!canvas.getContext)return;
    rendererStarted=true;
    try{
      // WebGL renders offscreen, then copies to a retained 2D canvas. Glass
      // filters never sample a live/discarded WebGL drawing buffer.
      context2d=canvas.getContext('2d',{alpha:true});const surface=document.createElement('canvas');
      const gl=surface.getContext('webgl',{alpha:true,antialias:true,depth:true,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:false});
      if(!context2d||!gl)return;
      const vertex=compile(gl,gl.VERTEX_SHADER,'attribute vec4 aPosition;attribute vec2 aUv;varying vec2 vUv;void main(){vUv=aUv;gl_Position=aPosition;}');
      const fragment=compile(gl,gl.FRAGMENT_SHADER,`precision highp float;varying vec2 vUv;uniform sampler2D uImage;uniform vec4 uCrop;uniform float uEdge;uniform float uBackAmount;uniform float uBrightness;
        vec4 backColor(vec2 uv){vec2 o=vec2(.01171875)/uCrop.zw;vec4 c=texture2D(uImage,uv)*4.;
          c+=(texture2D(uImage,uv+vec2(o.x,0.))+texture2D(uImage,uv-vec2(o.x,0.))+texture2D(uImage,uv+vec2(0.,o.y))+texture2D(uImage,uv-vec2(0.,o.y)))*2.;
          c+=texture2D(uImage,uv+o)+texture2D(uImage,uv-o)+texture2D(uImage,uv+vec2(-o.x,o.y))+texture2D(uImage,uv+vec2(o.x,-o.y));return c/16.;}
        void main(){vec2 aspect=vec2(${cardAspect},1.);float radius=${cornerRadius};
          vec2 d=abs(vUv-.5)*aspect-(.5*aspect-radius);
          float sdf=length(max(d,0.))+min(max(d.x,d.y),0.)-radius;
          float alpha=1.-smoothstep(-uEdge,uEdge,sdf);if(alpha<.005)discard;
          vec2 uv=(vUv+uCrop.xy)/uCrop.zw;vec4 sharp=texture2D(uImage,uv);vec4 color=gl_FrontFacing?sharp:mix(sharp,backColor(uv),uBackAmount);gl_FragColor=vec4(color.rgb*uBrightness*alpha,alpha);}`);
      const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Works link failed');gl.useProgram(program);
      const positions=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,positions);
      const positionAttribute=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(positionAttribute);gl.vertexAttribPointer(positionAttribute,4,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,uvs,gl.STATIC_DRAW);
      const uvAttribute=gl.getAttribLocation(program,'aUv');gl.enableVertexAttribArray(uvAttribute);gl.vertexAttribPointer(uvAttribute,2,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
      gl.uniform1i(gl.getUniformLocation(program,'uImage'),0);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
      gpu={gl,surface,positions,positionAttribute,crop:gl.getUniformLocation(program,'uCrop'),edge:gl.getUniformLocation(program,'uEdge'),backAmount:gl.getUniformLocation(program,'uBackAmount'),brightness:gl.getUniformLocation(program,'uBrightness'),textures:new Map()};
      // Prefetch starts after the layout has already been measured. Match its
      // retained backing surface now rather than waiting for another resize.
      if(layout){surface.width=canvas.width;surface.height=canvas.height;gl.viewport(0,0,surface.width,surface.height);}
      viewport.dataset.worksRenderer='loading';
      surface.addEventListener('webglcontextlost',event=>{event.preventDefault();gpu=null;viewport.classList.remove('works-has-canvas');});
      for(const card of cards.slice(0,projects.length)){
        const upload=()=>{
          if(!gpu||!card.image.naturalWidth)return;
          const texture=gpu.textures.get(card.project.image)?.texture||gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
          let image=card.image;const crop=imageCrop(card.project,image.naturalWidth,image.naturalHeight),limit=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));
          if(Math.max(image.naturalWidth,image.naturalHeight)>limit){const resized=document.createElement('canvas'),scale=limit/Math.max(image.naturalWidth,image.naturalHeight);resized.width=Math.round(image.naturalWidth*scale);resized.height=Math.round(image.naturalHeight*scale);resized.getContext('2d').drawImage(image,0,0,resized.width,resized.height);image=resized;}
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gpu.textures.set(card.project.image,{texture,crop});
          if(gpu.textures.size===projects.length){viewport.classList.add('works-has-canvas');viewport.dataset.worksRenderer='retained-webgl';}
          if(canPaint()&&layout&&!lastReduced)render();
        };
        card.image.addEventListener('load',upload);
        if(card.image.complete&&card.image.naturalWidth)upload();
      }
    }catch(_){gpu=null;viewport.classList.remove('works-has-canvas');}
  }
  if(window.ChapterAssets){viewport.dataset.worksRenderer='deferred';window.ChapterAssets.register('works',createRenderer);}
  else createRenderer();
  function imageCrop(project,width,height){
    if(project.crop==='amonra')return[0,.0815,1,1.1067];
    if(project.crop==='itsme')return[0,0,1,1];
    const ratio=width/height/1.92,scaleX=Math.max(1,ratio),scaleY=Math.max(1,1/ratio);
    return[(scaleX-1)/2,(scaleY-1)/2,scaleX,scaleY];
  }
  function measure({width=viewport.clientWidth,height=viewport.clientHeight}={}){
    const phone=width<600,tablet=!phone&&width<1100;
    if(!layout||layout.width!==width||layout.height!==height)boundsCache.clear();
    // The approved composition was 1267x713. A taller browser must expose
    // more of the helix, rather than zoom every plane in with its height.
    const cameraHeight=phone?height:Math.min(height,width*(tablet ? .9 : 713/1267));
    const focal=cameraHeight/(2*Math.tan((width<900?45:35)*Math.PI/360));
    const planeWidth=phone?Math.min(1.7,(width-32)*6/focal):1.7;
    const planeHeight=planeWidth/cardAspect,foregroundMaxScale=phone?fitForegroundScale(width,focal,planeWidth,planeHeight):1+foregroundBoost;
    // Safari's browser bars shorten a phone's CSS viewport independently of
    // its screen resolution. Open the pitch modestly as that viewport gets
    // shorter, retaining the rear helix instead of pushing its whole trace
    // out of view. Mesh dimensions and foreground enlargement stay intact.
    const phonePitch=clamp((width/height-.46)/.13),phoneCrowding=clamp((width/height-.59)/.06,0,2.8);
    layout={width,height,phone,tablet,cameraHeight,focal,radius:2,camera:8,planeWidth,planeHeight,foregroundMaxScale,verticalSpread:phone?1.18:1,pitchFactor:1.025,centerSpreadX:phone?1.5+.2*phoneCrowding:2.2,centerSpreadY:phone?1.8+.3*phoneCrowding:2.3};
    if(phone)layout.pitchFactor+=.125*phonePitch;
    const entranceBounds=projectCardBounds(.13,0,false,1);
    const visibleEntranceBounds=entranceBounds.filter(pose=>pose.maxX>0&&pose.minX<width);
    // A wider helix can start below the viewport naturally. Align its first
    // visible image to the same entry edge in either direction.
    layout.entranceOffset=height+1-Math.min(...(visibleEntranceBounds.length?visibleEntranceBounds:entranceBounds).map(pose=>pose.minY));
    const dpr=Math.min(1.5,window.devicePixelRatio||1),pixelWidth=Math.round(width*dpr),pixelHeight=Math.round(height*dpr);
    if(canvas.width!==pixelWidth)canvas.width=pixelWidth;
    if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
    if(gpu&&(gpu.surface.width!==pixelWidth||gpu.surface.height!==pixelHeight)){
      gpu.surface.width=pixelWidth;gpu.surface.height=pixelHeight;gpu.gl.viewport(0,0,pixelWidth,pixelHeight);
    }
    projectionDirty=true;
    viewport.dataset.worksViewport=phone?'phone':tablet?'tablet':'desktop';update(lastProgress,{reducedMotion:lastReduced});
    return{...layout,foregroundWidth:planeWidth*focal/6};
  }
  function projectCard(card,progress,offset=0,deformation=null,mesh=createMesh(card),interaction=false){
    const{width,height,focal,radius,planeWidth,planeHeight,verticalSpread,camera,pitchFactor,centerSpreadX,centerSpreadY}=layout;
      // A little more pitch opens the narrow gaps without changing the
      // approved mesh sizes, cylinder radius or camera magnification.
      const p=clamp(progress,0,2),pitch=(2.4-.168*p)*pitchFactor;
      const worldY=-16.8+54.744*p-card.index*pitch;
      const lane=worldY/2.4,angle=lane*.85,sin=Math.sin(angle),cos=Math.cos(angle),centerX=radius*sin,centerZ=radius*cos,centerY=lane*.5*verticalSpread;
      const facing=(camera*cos-radius)/Math.hypot(centerX,centerY,camera-centerZ),depthScale=foregroundScale(facing);
      const bend=deformation??liveDeformation(facing);
      // Open the gaps by separating projected centers, never by resizing the
      // rear planes or changing the orbit's angular phase and perspective.
      const centerArc=centerY*centerY*.1;
      const spreadX=(centerSpreadX-1)*focal*(centerX+centerArc)/(camera-centerZ),spreadY=-(centerSpreadY-1)*focal*centerY/(camera-centerZ);
      const hover=interaction?hoverAmounts[card.index]:0,scale=1-.1*hover;
      const renderedScale=depthScale*scale;
      const restArc=(1-bend)*centerArc;
      const{vertices,clip}=mesh;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(let i=0;i<uvs.length;i+=2){
        const u=uvs[i],v=uvs[i+1],localX=(u-.5)*planeWidth*renderedScale;
        const bow=bend?Math.sin(u*Math.PI)*planeWidth*maxBow*renderedScale*bend:0;
        const wx=centerX+cos*localX+sin*bow,wy=centerY+(.5-v)*planeHeight*renderedScale,wz=centerZ-sin*localX+cos*bow,distance=camera-wz;
        const x=width/2+focal*(wx+(restArc+bend*wy*wy*.1))/distance+spreadX,y=height/2-focal*wy/distance+spreadY+offset;
        const vertex=vertices[i/2];vertex.x=x;vertex.y=y;vertex.distance=distance;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        const c=i*2;clip[c]=(x/width*2-1)*distance;clip[c+1]=(1-y/height*2)*distance;clip[c+2]=100.1/99.9*distance-20/99.9;clip[c+3]=distance;
      }
      return Object.assign(mesh,{minX,maxX,minY,maxY,x:minX,y:minY,cardWidth:maxX-minX,cardHeight:maxY-minY,worldY,worldZ:centerZ,angle,facing,hover,scale,foregroundScale:depthScale,front:facing>frontThreshold,visible:maxX>0&&minX<width&&maxY>0&&minY<height});
  }
  function projectCards(progress,offset=0,deformation=null,meshes=null){
    if(!meshes)return cards.map(card=>projectCard(card,progress,offset,deformation));
    for(let i=0;i<cards.length;i++)projectCard(cards[i],progress,offset,deformation,meshes[i]);
    return meshes;
  }
  function projectCardBounds(progress,offset=0,paceReference=false,deformation=paceReference?1:0){
    const cacheKey=paceReference?`pace:${progress}`:deformation?`bend:${progress}`:progress;
    const cached=boundsCache.get(cacheKey);
    if(cached)return offset?cached.map(pose=>({...pose,minY:pose.minY+offset,maxY:pose.maxY+offset})):cached;
    const{width,height,focal,radius,planeWidth,planeHeight,verticalSpread,camera,pitchFactor,centerSpreadX,centerSpreadY}=layout;
    const p=clamp(progress,0,2),pitch=(2.4-.168*p)*(paceReference&&layout.phone?1.025:pitchFactor);
    const projected=cards.map(card=>{
      const worldY=-16.8+54.744*p-card.index*pitch,lane=worldY/2.4,angle=lane*.85;
      const sin=Math.sin(angle),cos=Math.cos(angle),centerX=radius*sin,centerZ=radius*cos,centerY=lane*.5*verticalSpread;
      const facing=(camera*cos-radius)/Math.hypot(centerX,centerY,camera-centerZ);
      // Keep the established camera pace independent of later card spacing.
      // This reference is queried only at measurement, never while painting.
      const t=clamp((facing-frontThreshold)/(.85-frontThreshold));
      const scale=paceReference?1+.25*t*t*(3-2*t):foregroundScale(facing);
      const centerArc=centerY*centerY*.1;
      const spreadX=paceReference?0:(centerSpreadX-1)*focal*(centerX+centerArc)/(camera-centerZ),spreadY=paceReference?0:-(centerSpreadY-1)*focal*centerY/(camera-centerZ);
      const scaledWidth=planeWidth*scale,scaledHeight=planeHeight*scale;
      const top=centerY+scaledHeight/2,bottom=centerY-scaledHeight/2;
      // Y is monotonic across mesh rows. X depends on rowY squared, so its
      // only interior candidate is the existing mesh row closest to zero.
      const nearestRow=clamp(Math.round((.5+centerY/scaledHeight)*rows),0,rows);
      const nearest=centerY+(.5-nearestRow/rows)*scaledHeight;
      const minSquare=Math.min(top*top,bottom*bottom,nearest*nearest),maxSquare=Math.max(top*top,bottom*bottom);
      const restArc=(1-deformation)*centerArc;
      const minArc=restArc+deformation*minSquare*.1,maxArc=restArc+deformation*maxSquare*.1;
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(let x=0;x<=columns;x+=deformation?1:columns){
        const u=uvs[x*2],localX=(u-.5)*scaledWidth,bow=Math.sin(u*Math.PI)*scaledWidth*maxBow*deformation;
        const wx=centerX+cos*localX+sin*bow,distance=camera-centerZ+sin*localX-cos*bow;
        minX=Math.min(minX,width/2+focal*(wx+minArc)/distance+spreadX);
        maxX=Math.max(maxX,width/2+focal*(wx+maxArc)/distance+spreadX);
        minY=Math.min(minY,height/2-focal*top/distance+spreadY,height/2-focal*bottom/distance+spreadY);
        maxY=Math.max(maxY,height/2-focal*top/distance+spreadY,height/2-focal*bottom/distance+spreadY);
      }
      return{index:card.index,minX,maxX,minY,maxY};
    });
    // Layout probes reuse the same512 phases across repeated readiness and
    // resize notifications. Keep at most one bounded layout's probes.
    if(boundsCache.size>=2048)boundsCache.clear();
    boundsCache.set(cacheKey,projected);
    return offset?projected.map(pose=>({...pose,minY:pose.minY+offset,maxY:pose.maxY+offset})):projected;
  }
  function entranceOffset(progress){const t=clamp((progress-.13)/.17);return layout.entranceOffset*(1-t)**3;}
  function getProjectedBounds(progress){
    if(!layout)return null;const projected=projectCardBounds(Number.isFinite(progress)?progress:0,0,false,1),visibleX=projected.filter(pose=>pose.maxX>0&&pose.minX<layout.width);
    if(!visibleX.length)return null;return{minY:Math.min(...visibleX.map(pose=>pose.minY)),maxY:Math.max(...visibleX.map(pose=>pose.maxY)),leadY:projected[0].minY};
  }
  function getProjectedMotionBounds(progress){
    if(!layout)return[];
    const offset=entranceOffset(progress);
    const flat=projectCardBounds(progress,offset),bent=projectCardBounds(progress,offset,false,1);
    // Each vertex coordinate is a ratio of linear functions of the bend.
    // Its extrema are therefore at the flat or fully bent pose.
    return flat.map(({index,minX,maxX,minY,maxY},i)=>({index,
      minX:Math.min(minX,bent[i].minX),maxX:Math.max(maxX,bent[i].maxX),
      minY:Math.min(minY,bent[i].minY),maxY:Math.max(maxY,bent[i].maxY)}));
  }
  function render(){
    if(!canPaint()||!gpu||!context2d||!layout||lastReduced)return;
    const{gl,positions,positionAttribute,crop,edge,backAmount,brightness,surface}=gpu;gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.bindBuffer(gl.ARRAY_BUFFER,positions);gl.vertexAttribPointer(positionAttribute,4,gl.FLOAT,false,0,0);
    for(const pose of [...paintPoses].sort((a,b)=>a.worldZ-b.worldZ)){
      const entry=gpu.textures.get(pose.project.image);if(!entry||!pose.visible)continue;
      const projectedShortSide=Math.min(pose.cardWidth/cardAspect,pose.cardHeight);
      gl.bindTexture(gl.TEXTURE_2D,entry.texture);gl.uniform4fv(crop,entry.crop);gl.uniform1f(edge,Math.min(.005,.75/Math.max(100,projectedShortSide)));gl.uniform1f(backAmount,clamp(-pose.facing*1.5));
      // Dim RGB, never alpha: overlapping cards must remain opaque.
      gl.uniform1f(brightness,1-.4*pose.hover);
      gl.bufferData(gl.ARRAY_BUFFER,pose.clip,gl.DYNAMIC_DRAW);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
    }
    context2d.clearRect(0,0,canvas.width,canvas.height);context2d.drawImage(surface,0,0);
  }
  // The DOM fallback stays a projective quad. WebGL also bends its interior.
  function quadTransform(pose){
    const[a,b,c,d]=[pose.vertices[0],pose.vertices[columns],pose.vertices.at(-1),pose.vertices[rows*(columns+1)]];
    const dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x,dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y,den=dx1*dy2-dx2*dy1;
    const g=Math.abs(den)>1e-8?(dx3*dy2-dx2*dy3)/den:0,h=Math.abs(den)>1e-8?(dx1*dy3-dx3*dy1)/den:0;
    const m=[(b.x-a.x+g*b.x)/960,(b.y-a.y+g*b.y)/960,0,g/960,(d.x-a.x+h*d.x)/500,(d.y-a.y+h*d.y)/500,0,h/500,0,0,1,0,a.x,a.y,0,1];
    return`matrix3d(${m.map(value=>Number(value.toFixed(8))).join(',')})`;
  }
  function advanceHover(now){
    if(!hoverAnimating)return;
    if(hoverStart===null)hoverStart=now;
    const t=clamp((now-hoverStart)/300),eased=1-(1-t)**3;
    for(let i=0;i<cards.length;i++)hoverAmounts[i]=hoverFrom[i]+((selected?.index===i?1:0)-hoverFrom[i])*eased;
    if(t===1){hoverAnimating=false;hoverStart=null;}
  }
  function advanceScrollBend(progress,now){
    const before=scrollBend,elapsed=now-scrollBendTime;
    const difference=Math.abs(progress-lastProgress);
    scrollBendTime=now;
    if(!now||projectionDirty){scrollBend=0;return scrollBend!==before;}
    const step=elapsed>0&&elapsed<=64?Math.max(1,elapsed):1000/60;
    // Large history jumps skip the bend. Continuous scroll uses its actual
    // projected travel in either direction, including after a long idle.
    const speed=difference<.12?difference*1000/step:0;
    const target=clamp((speed-.015)/.17);
    scrollBend+=(target-scrollBend)*(1-Math.exp(-step/(target>scrollBend?36:90)));
    if(Math.abs(target-scrollBend)<.005)scrollBend=target;
    return scrollBend!==before;
  }
  function paintInteraction(){
    if(!canPaint()||!layout||lastReduced)return;
    const offset=entranceOffset(lastProgress);
    paintPoses=poses.map(pose=>hoverAmounts[pose.index]===0?pose:projectCard(cards[pose.index],lastProgress,offset,null,interactionMeshes[pose.index],true));
    for(const pose of paintPoses){
      pose.element.style.transform=quadTransform(pose);
      pose.element.dataset.hoverScale=pose.scale.toFixed(5);
      pose.element.dataset.foregroundScale=pose.foregroundScale.toFixed(5);
      pose.element.style.setProperty?.('--works-hover-amount',String(pose.hover));
    }
    render();
  }
  function update(progress,{reducedMotion=false,now=0}={}){
    const nextProgress=Number.isFinite(progress)?progress:0;
    if(!canPaint()){lastProgress=nextProgress;lastReduced=reducedMotion;projectionDirty=true;return;}
    const bendChanged=advanceScrollBend(nextProgress,reducedMotion?0:now);
    const changed=projectionDirty||nextProgress!==lastProgress||reducedMotion!==lastReduced||bendChanged;
    if(!changed&&!hoverAnimating)return;
    lastProgress=nextProgress;lastReduced=reducedMotion;if(!layout)return;
    viewport.classList.toggle('works-is-static',reducedMotion);
    if(reducedMotion){projectionDirty=false;hoverAnimating=false;hoverAmounts.fill(0);for(const{element}of cards){element.removeAttribute('style');element.classList.remove('is-in-view');element.setAttribute('tabindex','0');}canvas.hidden=true;poses=[];paintPoses=[];hideProject();viewport.classList.remove('works-is-sleeping');return;}
    advanceHover(now);
    if(changed)poses=projectCards(lastProgress,entranceOffset(lastProgress),null,baseMeshes);
    projectionDirty=false;
    const active=poses.reduce((best,pose)=>Math.abs(pose.worldY)<Math.abs(best.worldY)?pose:best);
    for(const pose of poses){const{element}=pose;element.style.zIndex=`${Math.round((pose.worldZ+3)*100)+1}`;element.classList.toggle('is-in-view',pose.visible);element.classList.toggle('is-front',pose.front);element.setAttribute('tabindex',pose.visible&&pose.front?'0':'-1');}
    if(selected&&(!poses[selected.index]?.front||!poses[selected.index]?.visible))hideProject();if(pointer)revealProject(hitTest(pointer.x,pointer.y));paintInteraction();
    canvas.hidden=false;viewport.classList.remove('works-is-sleeping');
    viewport.dataset.activeProject=`${active.index%projects.length+1}`;viewport.dataset.activeSequence=`${active.index+1}`;
  }
  function hitTest(x,y){
    if(!canPaint())return null;
    let nearest=null,nearestDistance=Infinity,eligible=false;
    for(const pose of poses){
      if(!pose.visible||x<pose.minX||x>pose.maxX||y<pose.minY||y>pose.maxY)continue;
      for(let i=0;i<indices.length;i+=3){
        const a=pose.vertices[indices[i]],b=pose.vertices[indices[i+1]],c=pose.vertices[indices[i+2]],den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<1e-8)continue;
        const aa=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den,bb=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den,cc=1-aa-bb;if(aa<0||bb<0||cc<0)continue;
        const reciprocal=aa/a.distance+bb/b.distance+cc/c.distance,u=(aa*a.u/a.distance+bb*b.u/b.distance+cc*c.u/c.distance)/reciprocal,v=(aa*a.v/a.distance+bb*b.v/b.distance+cc*c.v/c.distance)/reciprocal;
        const cornerX=Math.max(0,(Math.abs(u-.5)-.5)*cardAspect+cornerRadius);
        const cornerY=Math.max(0,Math.abs(v-.5)-.5+cornerRadius);
        if(Math.hypot(cornerX,cornerY)>cornerRadius)continue;
        const distance=1/reciprocal;if(distance<nearestDistance){nearestDistance=distance;nearest=pose;eligible=pose.front&&den<0;}
      }
    }
    return eligible?nearest:null;
  }
  function refreshSelection(){
    if(!canPaint())return;
    hoverFrom.set(hoverAmounts);hoverStart=null;
    hoverAnimating=!lastReduced&&cards.some(card=>Math.abs(hoverAmounts[card.index]-(selected?.index===card.index?1:0))>.0001);
    for(const card of cards){
      card.element.classList.remove('is-dimmed');
      card.element.classList.toggle('is-hovered',Boolean(selected?.index===card.index));
    }
    viewport.dataset.hoveredSequence=selected?`${selected.index+1}`:'';
    paintInteraction();
    if(hoverAnimating&&typeof CustomEvent==='function')window.dispatchEvent?.(new CustomEvent('works:interaction'));
  }
  function hideProject(){
    if(!canPaint())return;
    const wasSelected=Boolean(selected);selected=null;touchSelection=false;
    if(pill.classList.contains('is-visible')){
      if(enterTimer){clearTimeout(enterTimer);enterTimer=null;}
      pill.classList.remove('is-entering','is-entering-alt');
      pill.classList.remove('is-visible');pill.classList.add('is-leaving');
      if(leaveTimer)clearTimeout(leaveTimer);
      leaveTimer=setTimeout(()=>{leaveTimer=null;pill.classList.remove('is-leaving');pill.dataset.sequence='';},500);
    }
    pill.setAttribute('aria-hidden','true');button.setAttribute('tabindex','-1');canvas.classList.remove('is-project-hovered');
    if(wasSelected)refreshSelection();
  }
  function revealProject(card){
    if(!canPaint())return;
    if(!card){hideProject();return;}
    if(leaveTimer){clearTimeout(leaveTimer);leaveTimer=null;}
    const changed=selected?.index!==card.index,wasVisible=pill.classList.contains('is-visible');
    if(selected?.index!==card.index){
      selected=card;title.textContent=card.project.name;
      pill.dataset.sequence=`${card.index+1}`;
      while(tags.firstChild)tags.removeChild(tags.firstChild);
      for(const[i,text]of card.project.tags.entries()){if(i){const dot=make('span','works-project__dot');dot.setAttribute('aria-hidden','true');tags.append(dot);}const label=make('span','works-project__tag');label.textContent=text;tags.append(label);}
      button.setAttribute('aria-label',`Open ${card.project.name} project`);
    }
    pill.classList.remove('is-leaving');pill.classList.add('is-visible');pill.setAttribute('aria-hidden','false');button.setAttribute('tabindex','0');canvas.classList.add('is-project-hovered');
    if(!wasVisible){
      if(enterTimer)clearTimeout(enterTimer);
      pill.classList.add('is-entering');pill.classList.toggle('is-entering-alt',Boolean(++entrySerial%2));
      enterTimer=setTimeout(()=>{enterTimer=null;pill.classList.remove('is-entering','is-entering-alt');},500);
    }
    if(changed)refreshSelection();
  }
  function point(event){
    const rect=canvas.getBoundingClientRect();
    // CSS transforms and a mobile visual viewport may scale the retained
    // canvas. Hit-test in the same layout coordinates as the rendered meshes.
    return{x:(event.clientX-rect.left)*(rect.width>0?layout.width/rect.width:1),y:(event.clientY-rect.top)*(rect.height>0?layout.height/rect.height:1)};
  }
  function ignoreHover(event){return event.pointerType==='touch'||event.sourceCapabilities?.firesTouchEvents===true||Date.now()-lastTouchTime<800;}
  function revealTouchProject(card){
    pointer=null;lastTouchTime=Date.now();touchSelection=Boolean(card);revealProject(card);
  }
  canvas.addEventListener('pointermove',event=>{
    if(!canPaint()||!layout)return;
    if(event.pointerType==='touch'){
      if(touch&&event.pointerId===touch.id){const p=point(event);touch.moved=Math.max(touch.moved,Math.hypot(p.x-touch.x,p.y-touch.y));}
      return;
    }
    if(ignoreHover(event))return;
    touchSelection=false;pointer=point(event);revealProject(hitTest(pointer.x,pointer.y));
  });
  canvas.addEventListener('pointerleave',event=>{
    if(!canPaint()||!layout)return;
    // Non-hover pointers leave after implicit capture is released on lift.
    // That boundary event ends contact, not the selected project's details.
    if(ignoreHover(event)||touchSelection)return;
    pointer=null;
    // The label can overlap a foreground plane. Entering its surface must
    // not make that same hover oscillate as the label catches the pointer.
    if(event.relatedTarget&&pill.contains(event.relatedTarget)){
      const p=point(event),card=hitTest(p.x,p.y);
      if(card){pointer=p;revealProject(card);return;}
    }
    hideProject();
  });
  canvas.addEventListener('pointerdown',event=>{
    if(!canPaint()||!layout)return;
    if(event.pointerType!=='touch'||event.isPrimary===false)return;
    pointer=null;lastTouchTime=Date.now();touch={...point(event),id:event.pointerId,moved:0};
  });
  canvas.addEventListener('pointerup',event=>{
    if(!canPaint()||!layout)return;
    if(event.pointerType!=='touch'||!touch||event.pointerId!==touch.id)return;
    const end=point(event),moved=Math.max(touch.moved,Math.hypot(end.x-touch.x,end.y-touch.y));touch=null;lastTouchTime=Date.now();
    if(moved<10)revealTouchProject(hitTest(end.x,end.y));
  });
  canvas.addEventListener('pointercancel',()=>{touch=null;});
  pill.addEventListener('pointermove',event=>{if(!canPaint()||!layout||ignoreHover(event))return;touchSelection=false;pointer=point(event);revealProject(hitTest(pointer.x,pointer.y));});
  pill.addEventListener('pointerleave',event=>{if(!canPaint()||ignoreHover(event)||touchSelection)return;pointer=null;hideProject();});
  for(const card of cards){
    // The DOM/no-WebGL and reduced-motion paths receive a native click on
    // the figure. Safari may omit pointerType on that compatibility click.
    card.element.addEventListener('pointerdown',event=>{if(canPaint()&&event.pointerType==='touch'){domTouchCard=card;pointer=null;lastTouchTime=Date.now();}});
    card.element.addEventListener('pointercancel',()=>{if(domTouchCard===card)domTouchCard=null;});
    card.element.addEventListener('pointerenter',event=>{if(canPaint()&&!ignoreHover(event)&&(lastReduced||poses[card.index]?.front))revealProject(card);});
    card.element.addEventListener('pointerleave',event=>{if(canPaint()&&!ignoreHover(event)&&!touchSelection)hideProject();});
    card.element.addEventListener('focus',()=>{if(canPaint()&&(lastReduced||poses[card.index]?.front))revealProject(card);});
    card.element.addEventListener('click',event=>{
      if(!canPaint())return;
      const fromTouch=event.pointerType==='touch'||event.sourceCapabilities?.firesTouchEvents===true||(domTouchCard===card&&Date.now()-lastTouchTime<800);
      domTouchCard=null;
      if(lastReduced||poses[card.index]?.front){if(fromTouch)revealTouchProject(card);else revealProject(card);}
    });
    card.element.addEventListener('keydown',event=>{if(canPaint()&&(event.key==='Enter'||event.key===' ')){event.preventDefault();if(lastReduced||poses[card.index]?.front)revealProject(card);}});
  }
  window.addEventListener('pointerdown',event=>{
    if(!canPaint()||event.pointerType!=='touch'||!touchSelection)return;
    if(!canvas.contains(event.target)&&!pill.contains(event.target)&&!cards.some(card=>card.element.contains(event.target)))hideProject();
  });
  window.addEventListener('blur',()=>{if(!canPaint())return;pointer=null;touch=null;domTouchCard=null;hideProject();});
  window.WorksGallery=Object.freeze({measure,update,setVisible,getProjectedBounds,getProjectedMotionBounds,
    getProjectedCardBounds:progress=>layout?projectCardBounds(progress,entranceOffset(progress),false,1):[],
    getPaceReferenceBounds:progress=>layout?projectCardBounds(progress,0,true):[],
    isAnimating:()=>canPaint()&&(hoverAnimating||scrollBend>0),
    getProjectedCards:(progress,deformation=1)=>layout?projectCards(progress,entranceOffset(progress),clamp(deformation)).map(({index,minX,maxX,minY,maxY,angle,worldY,worldZ,facing,front,visible,vertices,foregroundScale})=>({index,minX,maxX,minY,maxY,angle,worldY,worldZ,facing,front,visible,vertices,foregroundScale})):[],
    getProjects:()=>projects.map(project=>({...project,tags:[...project.tags]})),getLayout:()=>layout?{...layout}:null});
})();
