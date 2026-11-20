import * as THREE from './assets/vendor/three/three.module.js';
import { GPUComputationRenderer } from './assets/vendor/three/examples/jsm/misc/GPUComputationRenderer.js';

const simulationShader = `
  uniform sampler2D uAnchors;
  uniform vec2 uImageSize;
  uniform vec2 uCanvasSize;
  uniform vec2 uPointer;
  uniform vec2 uPointerStart;
  uniform vec2 uPointerVelocity;
  uniform float uCursorRadius;
  uniform float uCursorStrength;
  uniform float uDt;
  uniform float uLifePhase;
  uniform float uTime;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uDamping;
  uniform float uLifespan;

  // Overlapping currents bend around one another. The smaller current keeps
  // each group of dots from moving like a rigid strip of the photo.
  vec2 flow(vec2 p, float time, float seed) {
    float a = p.x + p.y * .37 + time + sin(p.y * .48 + time * .34) * .49;
    float b = p.y * .83 - p.x * .41 - time * .71 + sin(p.x * .7 - time * .25) * .31;
    float c = p.x * 1.63 - p.y * 1.34 + time * .41 + seed * 1.15;
    vec2 curl = vec2(.37, -1.) * cos(a) * sin(b)
      + vec2(.83, .41) * sin(a) * cos(b);
    return curl + vec2(-.41, -.50) * cos(c)
      + vec2(.20, -.14) * sin(p.x * 2.9 + p.y * 3.1 - time * 1.13);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 anchor = texture2D(uAnchors, uv);
    vec4 state = texture2D(tState, uv);
    vec2 position = (state.xy - .5) * uImageSize;
    vec2 home = (anchor.xy - .5) * uImageSize;
    float dust = smoothstep(.49, .99, anchor.z);
    float life = fract(uLifePhase + anchor.w);
    vec2 homeDirection = home - position;
    float distanceFromHome = length(homeDirection);
    float drift = fract(anchor.z * 53.87 + anchor.w * 27.43);

    if (life < uDt / uLifespan || distanceFromHome > max(400., uCanvasSize.x * .82)) {
      gl_FragColor = vec4(anchor.xy, 0., 0.);
      return;
    }

    float turbulence = smoothstep(.09, .28, uNoiseStrength);
    float retention = smoothstep(.865, .98, uDamping);
    float scaleSpan = clamp(pow(.003 / uNoiseScale, .22), .60, 1.25);
    float curlScale = mix(1.3, 4.2, dust) * uNoiseStrength * scaleSpan
      * mix(1., 1.77, turbulence) * mix(.78, 1.48, retention);
    vec2 force = flow(position * uNoiseScale, uTime, anchor.z) * curlScale;
    float tether = mix(.0102, .0038, dust) * mix(1., .74, turbulence) * mix(1., .54, retention);
    float longTrail = smoothstep(40., 130., distanceFromHome) * smoothstep(.63, .98, drift);
    tether *= mix(1., .40, longTrail);
    // Keep large trails in view without abruptly cutting a stroke short.
    float outerReturn = .010 * smoothstep(uCanvasSize.x * .22, uCanvasSize.x * .53, distanceFromHome);
    force += homeDirection * (tether + outerReturn);

    float pointerSpeed = length(uPointerVelocity);
    if (pointerSpeed > 1. && uCursorStrength > 0.) {
      vec2 stroke = uPointer - uPointerStart;
      float along = clamp(dot(position - uPointerStart, stroke) / max(dot(stroke, stroke), 1.), 0., 1.);
      vec2 fromStroke = position - mix(uPointerStart, uPointer, along);
      float influence = 1. - smoothstep(uCursorRadius * .15, uCursorRadius, length(fromStroke));
      vec2 sideways = vec2(-uPointerVelocity.y, uPointerVelocity.x) / pointerSpeed;
      float side = clamp(dot(fromStroke, sideways) / uCursorRadius, -1., 1.);
      vec2 wake = uPointerVelocity + sideways * pointerSpeed * (side * .24 + (anchor.w - .5) * .48);
      // Some specks slip past the stroke while others travel with it.
      float coupling = mix(.26, 1.12, drift * drift);
      force += wake * (.020 * uCursorStrength * influence * coupling);
    }

    vec2 velocity = (state.zw + force * uDt) * pow(uDamping, uDt);
    gl_FragColor = vec4(state.xy + velocity * (uDt / uImageSize), velocity);
  }
`;

const pointVertex = `
  attribute vec2 simulationUV;
  uniform sampler2D uState;
  uniform sampler2D uAnchors;
  uniform sampler2D uPortrait;
  uniform vec2 uImageSize;
  uniform vec2 uCanvasSize;
  uniform float uPointSize;
  uniform float uMaxPointSize;
  uniform float uLifePhase;
  uniform float uLifespan;
  varying vec4 vParticle;

  void main() {
    vec4 anchor = texture2D(uAnchors, simulationUV);
    vec4 state = texture2D(uState, simulationUV);
    vec2 point = (state.xy - .5) * uImageSize / uCanvasSize;
    gl_Position = vec4(2. * point.x, -2. * point.y, 0., 1.);

    float seed = fract(anchor.z * 134.126);
    float diameter = mix(.29, 1.08, pow(seed, .83));
    float travel = length((state.xy - anchor.xy) * uImageSize);
    float stretchFade = 1. - .55 * smoothstep(32., 230., travel);
    vec2 edgeSpace = (.5 - abs(point)) * uCanvasSize;
    float edgeFade = mix(1., smoothstep(1., 45., min(edgeSpace.x, edgeSpace.y)), smoothstep(20., 75., travel));
    float age = fract(uLifePhase + anchor.w) * uLifespan;
    float fadeFrames = min(36., uLifespan * .22);
    float lifeFade = smoothstep(0., fadeFrames * .3, age) * (1. - smoothstep(uLifespan - fadeFrames, uLifespan, age));
    vec4 texel = texture2D(uPortrait, anchor.xy);
    float luminance = dot(texel.rgb, vec3(.2126, .7152, .0722));
    float light = smoothstep(.025, .27, luminance);
    bool beyondImage = any(lessThan(state.xy, vec2(0.))) || any(greaterThan(state.xy, vec2(1.)));
    float localAlpha = beyondImage ? 0. : texture2D(uPortrait, state.xy).a;
    // Lift visible highlights without thickening escaped near-black specks over the surname.
    float opacity = mix(.23 + .16 * light, .91, fract(anchor.w * 97.16));
    float detachFade = mix(mix(.17, 1., light), 1., localAlpha);
    float pointSize = uPointSize * diameter;
    float coverage = min(1., pointSize * pointSize);
    float alpha = texel.a * opacity * lifeFade * stretchFade * edgeFade * detachFade * coverage;
    vParticle = vec4(texel.rgb * (.89 + .42 * light), alpha);
    gl_PointSize = clamp(pointSize, 1., uMaxPointSize);
  }
`;

const pointFragment = `
  uniform float uOpacity;
  varying vec4 vParticle;

  void main() {
    float distanceFromCenter = length(gl_PointCoord - .5) * 2.;
    float edge = 1. - smoothstep(.76, 1., distanceFromCenter);
    gl_FragColor = vec4(vParticle.rgb, vParticle.a * edge * uOpacity);
  }
`;

function samplePortrait(image) {
  const width = Math.min(480, image.naturalWidth);
  const height = Math.max(1, Math.round(width * image.naturalHeight / image.naturalWidth));
  const sampler = document.createElement('canvas');
  sampler.width = width;
  sampler.height = height;
  const context = sampler.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Particle portrait cannot be sampled');
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const choices = [];
  const edges = new Float32Array(width * height * 2);
  const luminanceAt = index => (.2126 * data[index] + .7152 * data[index + 1] + .0722 * data[index + 2]) / 255;
  for (let pixel = 0, i = 0; i < data.length; pixel++, i += 4) {
    if (data[i + 3] < 12) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const left = 4 * (y * width + Math.max(x - 3, 0));
    const right = 4 * (y * width + Math.min(x + 3, width - 1));
    const top = 4 * (Math.max(y - 3, 0) * width + x);
    const bottom = 4 * (Math.min(y + 3, height - 1) * width + x);
    const edgeX = (data[left + 3] - data[right + 3]) / 255;
    const edgeY = (data[top + 3] - data[bottom + 3]) / 255;
    edges[pixel * 2] = edgeX;
    edges[pixel * 2 + 1] = edgeY;
    const outline = Math.min(1, Math.hypot(edgeX, edgeY));
    const detail = Math.min(.35, Math.hypot(luminanceAt(right) - luminanceAt(left), luminanceAt(bottom) - luminanceAt(top)));
    const light = Math.pow(Math.max(0, luminanceAt(i) - .016), .65);
    // Sample shadows sparsely; emphasize contour and nearby texture where flecks are visible.
    const weight = Math.max(1, Math.round((1 + 15 * light + 10 * detail + 4 * outline) * data[i + 3] / 255));
    for (let copy = 0; copy < weight; copy++) choices.push(pixel);
  }
  if (!choices.length) throw new Error('Particle portrait has no visible pixels');
  return { sampler, width, height, choices, edges };
}

function seedTextures(anchors, initial, source, aspectWidth, aspectHeight) {
  let seed = 0x57f16a2b;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const { width, height, choices, edges } = source;
  for (let i = 0; i < initial.length; i += 4) {
    const sampled = choices[Math.floor(random() * choices.length)];
    const x = (sampled % width + random()) / width;
    const y = (Math.floor(sampled / width) + random()) / height;
    const edgeX = edges[sampled * 2];
    const edgeY = edges[sampled * 2 + 1];
    const edge = Math.min(1, Math.hypot(edgeX, edgeY));
    const spread = Math.min(.999, random() + edge * .14);
    const angle = random() * Math.PI * 2;
    const distance = Math.pow(random(), 2.4) * (spread > .8 ? aspectWidth * .073 : aspectWidth * .027);
    const outwards = random() * Math.min(12, aspectWidth * .011);
    const offsetX = Math.cos(angle) * distance + edgeX * outwards;
    const offsetY = Math.sin(angle) * distance + edgeY * outwards;
    anchors[i] = x;
    anchors[i + 1] = y;
    anchors[i + 2] = spread;
    anchors[i + 3] = random();
    initial[i] = x + offsetX / aspectWidth;
    initial[i + 1] = y + offsetY / aspectHeight;
    initial[i + 2] = offsetX * .007;
    initial[i + 3] = offsetY * .007;
  }
}

function bounded(value, fallback, min, max) {
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : fallback;
}

export function createParticleRenderer({ canvas, image, width, height, settings }) {
  if (!image.naturalWidth || !image.naturalHeight || !(width > 0 && height > 0)) {
    throw new Error('Particle portrait is not ready');
  }

  const count = Math.round(bounded(settings.particleCount, 160000, 1000, 500000));
  const grid = Math.ceil(Math.sqrt(count));
  const source = samplePortrait(image);
  const contextAttributes = {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    // Keep the last image on the moving Hero plane after its GPU loop stops.
    preserveDrawingBuffer: true,
  };
  const gl = canvas.getContext('webgl2', contextAttributes);
  if (!gl) throw new Error('Particle simulation requires WebGL 2');
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...contextAttributes });
  const imageSize = new THREE.Vector2();
  const canvasSize = new THREE.Vector2();
  const pointerPosition = new THREE.Vector2();
  const pointerStart = new THREE.Vector2();
  const pointerVelocity = new THREE.Vector2();
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const geometry = new THREE.BufferGeometry();
  let compute, anchors, portrait, pointMaterial, simulation, uniforms;
  let disposed = false;
  let pixelRatio = 1;
  let lifePhase = 0;
  let time = 0;

  function dispose() {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    pointMaterial?.dispose();
    portrait?.dispose();
    anchors?.dispose();
    compute?.dispose();
    renderer.dispose();
    if (!gl.isContextLost()) renderer.forceContextLoss();
  }

  function updateSize(w, h) {
    const nextRatio = Math.min(window.devicePixelRatio || 1, bounded(settings.maxDpr, 1.25, .5, 2),
      Math.sqrt(2750000 / (w * h)));
    if (canvasSize.x === w && canvasSize.y === h && pixelRatio === nextRatio) return false;
    canvasSize.set(w, h);
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    imageSize.set(image.naturalWidth * scale, image.naturalHeight * scale);
    pixelRatio = nextRatio;
    renderer.setDrawingBufferSize(w, h, pixelRatio);
    return true;
  }

  function draw() {
    const opacity = bounded(settings.particleOpacity, .9, 0, 1);
    const pointSize = bounded(settings.particleSize, 4.5, .1, 16);
    uniforms.uState.value = compute.getCurrentRenderTarget(simulation).texture;
    uniforms.uPointSize.value = pointSize * pixelRatio;
    uniforms.uOpacity.value = opacity;
    uniforms.uLifePhase.value = lifePhase;
    uniforms.uLifespan.value = simulation.material.uniforms.uLifespan.value;
    renderer.render(scene, camera);
  }

  function render(dtSeconds, pointer) {
    const dt = bounded(dtSeconds * 60, 1, 0, 2.5);
    const speed = bounded(settings.speed, 1.5, 0, 5);
    const lifespan = bounded(settings.lifespan, 960, 10, 3600);
    lifePhase = (lifePhase + dt / lifespan) % 1;
    time += dt / 60 * speed * .69;
    if (pointer?.active) {
      pointerPosition.set(pointer.x - canvasSize.x / 2, pointer.y - canvasSize.y / 2);
      pointerStart.set(
        bounded(pointer.fromX, pointer.x, pointer.x - 190, pointer.x + 190) - canvasSize.x / 2,
        bounded(pointer.fromY, pointer.y, pointer.y - 190, pointer.y + 190) - canvasSize.y / 2,
      );
      pointerVelocity.set(bounded(pointer.vx, 0, -3200, 3200), bounded(pointer.vy, 0, -3200, 3200));
    } else {
      pointerVelocity.set(0, 0);
    }
    const values = simulation.material.uniforms;
    values.uDt.value = dt;
    values.uTime.value = time;
    values.uLifePhase.value = lifePhase;
    values.uLifespan.value = lifespan;
    values.uNoiseScale.value = bounded(settings.noiseScale, .005, .00005, .03);
    values.uNoiseStrength.value = bounded(settings.noiseStrength, .10, 0, .5);
    values.uDamping.value = bounded(settings.damping, .873, .6, .999);
    values.uCursorRadius.value = bounded(settings.cursorRadius, 60, 1, 300);
    values.uCursorStrength.value = bounded(settings.cursorStrength, .36, 0, 2.5);
    compute.compute();
    draw();
  }

  try {
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Particle simulation requires floating-point WebGL buffers');
    renderer.setClearColor(0x000000, 0);
    renderer.debug.onShaderError = (_context, _program, vertex, fragment) => {
      const details = [gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n');
      throw new Error(details || 'Particle shader failed to compile');
    };
    compute = new GPUComputationRenderer(grid, grid, renderer);
    anchors = compute.createTexture();
    const state = compute.createTexture();
    updateSize(width, height);
    seedTextures(anchors.image.data, state.image.data, source, imageSize.x, imageSize.y);
    simulation = compute.addVariable('tState', simulationShader, state);
    compute.setVariableDependencies(simulation, [simulation]);
    const simulationUniforms = simulation.material.uniforms;
    simulationUniforms.uAnchors = { value: anchors };
    simulationUniforms.uImageSize = { value: imageSize };
    simulationUniforms.uCanvasSize = { value: canvasSize };
    simulationUniforms.uPointer = { value: pointerPosition };
    simulationUniforms.uPointerStart = { value: pointerStart };
    simulationUniforms.uPointerVelocity = { value: pointerVelocity };
    for (const name of ['uDt', 'uLifePhase', 'uTime', 'uLifespan', 'uNoiseScale', 'uNoiseStrength',
      'uDamping', 'uCursorRadius', 'uCursorStrength']) simulationUniforms[name] = { value: 0 };
    const initError = compute.init();
    if (initError) throw new Error(initError);

    portrait = new THREE.CanvasTexture(source.sampler);
    portrait.flipY = false;
    portrait.generateMipmaps = false;
    portrait.minFilter = THREE.LinearFilter;
    const lookup = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      lookup[i * 2] = (i % grid + .5) / grid;
      lookup[i * 2 + 1] = (Math.floor(i / grid) + .5) / grid;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('simulationUV', new THREE.BufferAttribute(lookup, 2));
    uniforms = {
      uState: { value: null },
      uAnchors: { value: anchors },
      uPortrait: { value: portrait },
      uImageSize: { value: imageSize },
      uCanvasSize: { value: canvasSize },
      uPointSize: { value: 0 },
      uMaxPointSize: { value: gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] },
      uOpacity: { value: 0 },
      uLifePhase: { value: 0 },
      uLifespan: { value: 960 },
    };
    pointMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: pointVertex,
      fragmentShader: pointFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, pointMaterial);
    points.frustumCulled = false;
    scene.add(points);
    render(0, null);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Could not draw the first WebGL particle frame');
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    count,
    render,
    redraw: draw,
    resize(w, h) {
      if (!(w > 0 && h > 0)) return;
      if (updateSize(w, h)) draw();
    },
    dispose,
  };
}
