import * as THREE from './assets/vendor/three/three.module.js';
import { GPUComputationRenderer } from './assets/vendor/three/examples/jsm/misc/GPUComputationRenderer.js';

const simulationShader = `
  uniform sampler2D uAnchors;
  uniform vec2 uImageSize;
  uniform vec2 uCanvasSize;
  uniform vec2 uPointer;
  uniform vec2 uPointerVelocity;
  uniform float uCursorRadius;
  uniform float uCursorStrength;
  uniform float uDt;
  uniform float uFrame;
  uniform float uTime;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uDamping;
  uniform float uLifespan;
  uniform float uIntensity;

  // The two waves are derivatives of a potential, so the force circulates
  // through the portrait instead of vibrating independently at each point.
  vec2 flow(vec2 p, float time, float seed) {
    float a = p.x + p.y * .37 + time;
    float b = p.y * .83 - p.x * .41 - time * .71;
    float c = p.x * 1.63 - p.y * 1.34 + time * .41 + seed * 1.6;
    vec2 curl = vec2(.37, -1.) * cos(a) * sin(b)
      + vec2(.83, .41) * sin(a) * cos(b);
    return curl + vec2(-.49, -.60) * cos(c);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 anchor = texture2D(uAnchors, uv);
    vec4 state = texture2D(tState, uv);
    vec2 position = (state.xy - .5) * uImageSize;
    vec2 home = (anchor.xy - .5) * uImageSize;
    float dust = smoothstep(.55, .98, anchor.z);
    float age = mod(uFrame + anchor.w * uLifespan, uLifespan);

    if (age < uDt || length(home - position) > max(200., uCanvasSize.x * .36)) {
      gl_FragColor = vec4(anchor.xy, 0., 0.);
      return;
    }

    float curlScale = mix(1.75, 5.7, dust) * uNoiseStrength * uIntensity;
    vec2 force = flow(position * uNoiseScale, uTime, anchor.z) * curlScale;
    force += (home - position) * mix(.0084, .00255, dust);

    vec2 fromPointer = position - uPointer;
    float cursorInfluence = 1. - smoothstep(0., uCursorRadius, length(fromPointer));
    // Velocity is supplied in CSS pixels/second and eased by the controller.
    // Momentum leaves a short trail because the particles keep their own speed.
    vec2 sideways = vec2(-uPointerVelocity.y, uPointerVelocity.x);
    force += (uPointerVelocity + sideways * (anchor.z - .5))
      * (.0105 * uCursorStrength * cursorInfluence * uIntensity);

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
  uniform float uFrame;
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
    float stretchFade = 1. - .34 * smoothstep(38., 180., travel);
    float age = mod(uFrame + anchor.w * uLifespan, uLifespan);
    float fadeFrames = min(36., uLifespan * .22);
    float lifeFade = smoothstep(0., fadeFrames * .3, age) * (1. - smoothstep(uLifespan - fadeFrames, uLifespan, age));
    vec4 texel = texture2D(uPortrait, anchor.xy);
    float luminance = dot(texel.rgb, vec3(.2126, .7152, .0722));
    float light = smoothstep(.025, .27, luminance);
    bool beyondImage = any(lessThan(state.xy, vec2(0.))) || any(greaterThan(state.xy, vec2(1.)));
    float localAlpha = beyondImage ? 0. : texture2D(uPortrait, state.xy).a;
    // Lift visible highlights without thickening escaped near-black specks over the surname.
    float opacity = mix(.31 + .19 * light, .96, fract(anchor.w * 97.16));
    float detachFade = mix(mix(.17, 1., light), 1., localAlpha);
    float pointSize = uPointSize * diameter;
    float coverage = min(1., pointSize * pointSize);
    vParticle = vec4(texel.rgb * (.89 + .42 * light), texel.a * opacity * lifeFade * stretchFade * detachFade * coverage);
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
    const distance = Math.pow(random(), 2.2) * (spread > .8 ? aspectWidth * .115 : aspectWidth * .038);
    const outwards = random() * Math.min(18, aspectWidth * .017);
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
  const pointerVelocity = new THREE.Vector2();
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const geometry = new THREE.BufferGeometry();
  let compute, anchors, portrait, pointMaterial, simulation, uniforms;
  let disposed = false;
  let pixelRatio = 1;
  let frame = 0;
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
    uniforms.uFrame.value = frame;
    uniforms.uLifespan.value = simulation.material.uniforms.uLifespan.value;
    renderer.render(scene, camera);
  }

  function render(dtSeconds, pointer) {
    const dt = bounded(dtSeconds * 60, 1, 0, 2.5);
    const speed = bounded(settings.speed, 1.5, 0, 5);
    frame += dt;
    time += dt / 60 * speed * .59;
    if (pointer?.active) {
      pointerPosition.set(pointer.x - canvasSize.x / 2, pointer.y - canvasSize.y / 2);
      pointerVelocity.set(bounded(pointer.vx, 0, -3200, 3200), bounded(pointer.vy, 0, -3200, 3200));
    } else {
      pointerVelocity.set(0, 0);
    }
    const values = simulation.material.uniforms;
    values.uDt.value = dt;
    values.uTime.value = time;
    values.uFrame.value = frame;
    values.uLifespan.value = bounded(settings.lifespan, 960, 10, 3600);
    values.uNoiseScale.value = bounded(settings.noiseScale, .005, .00005, .03);
    values.uNoiseStrength.value = bounded(settings.noiseStrength, .10, 0, .5);
    values.uDamping.value = bounded(settings.damping, .873, .6, .999);
    values.uCursorRadius.value = bounded(settings.cursorRadius, 60, 1, 300);
    values.uCursorStrength.value = bounded(settings.cursorStrength, .36, 0, 2.5);
    values.uIntensity.value = bounded(settings.intensity, 1, 0, 1);
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
    simulationUniforms.uPointerVelocity = { value: pointerVelocity };
    for (const name of ['uDt', 'uFrame', 'uTime', 'uLifespan', 'uNoiseScale', 'uNoiseStrength',
      'uDamping', 'uCursorRadius', 'uCursorStrength', 'uIntensity']) simulationUniforms[name] = { value: 0 };
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
      uFrame: { value: 0 },
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
