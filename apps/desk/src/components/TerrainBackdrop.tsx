import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type TerrainBackdropProps = {
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function fract(n: number) {
  return n - Math.floor(n);
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iz: number) {
  return fract(Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123);
}

function valueNoise2(x: number, z: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);

  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm(x: number, z: number) {
  let sum = 0;
  let amp = 0.6;
  let freq = 1;
  for (let i = 0; i < 5; i += 1) {
    const n = valueNoise2(x * freq, z * freq) * 2 - 1;
    sum += n * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

function ridged(x: number, z: number) {
  let sum = 0;
  let amp = 0.8;
  let freq = 1;
  for (let i = 0; i < 4; i += 1) {
    const n = valueNoise2(x * freq, z * freq) * 2 - 1;
    const v = 1 - Math.abs(n);
    sum += v * v * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

function heightColor(height01: number) {
  const low = { r: 30, g: 58, b: 138 };
  const mid = { r: 34, g: 211, b: 238 };
  const high = { r: 226, g: 232, b: 240 };

  if (height01 < 0.55) {
    const t = height01 / 0.55;
    return {
      r: Math.round(lerp(low.r, mid.r, t)),
      g: Math.round(lerp(low.g, mid.g, t)),
      b: Math.round(lerp(low.b, mid.b, t))
    };
  }

  const t = (height01 - 0.55) / 0.45;
  return {
    r: Math.round(lerp(mid.r, high.r, t)),
    g: Math.round(lerp(mid.g, high.g, t)),
    b: Math.round(lerp(mid.b, high.b, t))
  };
}

function terrainHeight(nx: number, nz: number, seed: number) {
  const mx = nx * 1.05 + 0.03;
  const mz = nz * 1.26 - 0.04;

  const r = Math.sqrt(mx * mx + mz * mz);
  const base = Math.exp(-(r * r) * 1.22);
  const falloff = smoothstep(1.38, 0.18, r);

  const warp = fbm(mx * 0.9 + seed * 0.33, mz * 0.9 - seed * 0.21) * 0.16;
  const wx = mx + warp * 1.1;
  const wz = mz - warp * 0.95;

  const rg = ridged(wx * 3.35, wz * 3.35);
  const n = fbm(wx * 7.8, wz * 7.8) * 0.16 + fbm(wx * 15.6, wz * 15.6) * 0.06;
  const ridgeLine = Math.exp(-Math.pow(mx * 0.72 + mz * 0.28, 2) * 5.2) * 0.1;

  let h = base * (0.62 + rg * 0.75 + n) + ridgeLine * base;
  h *= falloff;
  h = Math.max(0, h - 0.03);
  h = Math.pow(h, 1.18);
  return h;
}

const POINTS_VERTEX_SHADER = /* glsl */ `
  attribute float aHeight;

  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uRadius;
  uniform vec3 uLight;

  varying float vHeight;
  varying float vDist;
  varying float vShade;

  void main() {
    vHeight = aHeight;
    vDist = length(position.xz) / uRadius;

    vec3 n = normalize(normalMatrix * normal);
    vec3 l = normalize(uLight);
    vShade = clamp(dot(n, l), 0.0, 1.0);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float size = uPointSize * uPixelRatio * (1.0 + vHeight * 1.25);
    gl_PointSize = size * (1.0 / max(0.35, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const POINTS_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAlpha;
  uniform float uScanSpeed;
  uniform float uRingWidth;

  uniform vec3 uLow;
  uniform vec3 uMid;
  uniform vec3 uHigh;
  uniform vec3 uRingColor;

  varying float vHeight;
  varying float vDist;
  varying float vShade;

  vec3 heightColor(float h) {
    if (h < 0.55) {
      float t = h / 0.55;
      return mix(uLow, uMid, t);
    }
    float t = (h - 0.55) / 0.45;
    return mix(uMid, uHigh, t);
  }

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    float soft = smoothstep(0.52, 0.0, d);
    float edge = smoothstep(0.5, 0.18, d);

    float scan = mod(uTime * uScanSpeed, 1.35);
    float ring = abs(vDist - scan);
    float ringHit = smoothstep(uRingWidth, 0.0, ring);

    vec3 col = heightColor(vHeight);
    col *= (0.65 + vShade * 0.55 + vHeight * 0.12);
    col = mix(col, uRingColor, ringHit);

    float alpha = soft * uAlpha * (0.42 + vShade * 0.78);
    alpha += ringHit * 0.25 * edge;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function TerrainBackdrop(props: TerrainBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(2.6, 1.7, 2.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.65;
    controls.minDistance = 2.2;
    controls.maxDistance = 7.2;
    controls.minPolarAngle = 0.75;
    controls.maxPolarAngle = 1.35;
    controls.target.set(0, 0.08, 0);
    controls.update();
    controls.saveState();

    const ambient = new THREE.AmbientLight(0x0f172a, 1.25);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xb6f7ff, 1.2);
    key.position.set(4, 5, 2);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x60a5fa, 0.55);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const size = 3.95;
    const maxHeight = 0.55;
    const segX = 560;
    const segZ = 420;

    const geometry = new THREE.PlaneGeometry(size, size, segX, segZ);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const vCount = pos.count;

    const heights = new Float32Array(vCount);
    let minH = Infinity;
    let maxH = -Infinity;
    let peakIndex = 0;

    for (let i = 0; i < vCount; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const nx = x / (size * 0.5);
      const nz = z / (size * 0.5);
      const seed = fract(Math.sin((nx + 2.7) * 91.7 + (nz - 1.9) * 57.3) * 43758.5453);
      const h = terrainHeight(nx, nz, seed);
      heights[i] = h;
      minH = Math.min(minH, h);
      if (h > maxH) {
        maxH = h;
        peakIndex = i;
      }
      pos.setY(i, h * maxHeight);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();

    const hSpan = Math.max(0.0001, maxH - minH);
    const aHeight = new Float32Array(vCount);
    const colors = new Float32Array(vCount * 3);

    for (let i = 0; i < vCount; i += 1) {
      const h01 = clamp((heights[i]! - minH) / hSpan, 0, 1);
      aHeight[i] = h01;
      const rgb = heightColor(h01);
      const tone = 0.42 + h01 * 0.26;
      colors[i * 3] = (rgb.r / 255) * tone;
      colors[i * 3 + 1] = (rgb.g / 255) * tone;
      colors[i * 3 + 2] = (rgb.b / 255) * tone;
    }

    geometry.setAttribute("aHeight", new THREE.BufferAttribute(aHeight, 1));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const meshMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.24,
      roughness: 0.9,
      metalness: 0,
      emissive: new THREE.Color(0x061021),
      emissiveIntensity: 0.65,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, meshMaterial);
    scene.add(mesh);

    const ridgeMaterial = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.28
    });

    const ridgeGeometries: THREE.BufferGeometry[] = [];

    const buildRidgeLine = (axis: "x" | "z") => {
      const stride = segX + 1;
      const points: number[] = [];
      if (axis === "x") {
        for (let ix = 0; ix <= segX; ix += 1) {
          let bestIdx = ix;
          let bestY = -Infinity;
          for (let iz = 0; iz <= segZ; iz += 1) {
            const idx = iz * stride + ix;
            const y = pos.getY(idx);
            if (y > bestY) {
              bestY = y;
              bestIdx = idx;
            }
          }
          points.push(pos.getX(bestIdx), pos.getY(bestIdx) + 0.01, pos.getZ(bestIdx));
        }
      } else {
        for (let iz = 0; iz <= segZ; iz += 1) {
          let bestIdx = iz * stride;
          let bestY = -Infinity;
          for (let ix = 0; ix <= segX; ix += 1) {
            const idx = iz * stride + ix;
            const y = pos.getY(idx);
            if (y > bestY) {
              bestY = y;
              bestIdx = idx;
            }
          }
          points.push(pos.getX(bestIdx), pos.getY(bestIdx) + 0.01, pos.getZ(bestIdx));
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
      ridgeGeometries.push(geom);
      return new THREE.Line(geom, ridgeMaterial);
    };

    const ridgeX = buildRidgeLine("x");
    const ridgeZ = buildRidgeLine("z");
    scene.add(ridgeX);
    scene.add(ridgeZ);

    type PointsUniforms = {
      uTime: { value: number };
      uAlpha: { value: number };
      uScanSpeed: { value: number };
      uRingWidth: { value: number };
      uPointSize: { value: number };
      uPixelRatio: { value: number };
      uRadius: { value: number };
      uLight: { value: THREE.Vector3 };
      uLow: { value: THREE.Color };
      uMid: { value: THREE.Color };
      uHigh: { value: THREE.Color };
      uRingColor: { value: THREE.Color };
    };

    const pointsUniforms: PointsUniforms = {
      uTime: { value: 0 },
      uAlpha: { value: 0.82 },
      uScanSpeed: { value: 0.24 },
      uRingWidth: { value: 0.04 },
      uPointSize: { value: 1.35 },
      uPixelRatio: { value: 1 },
      uRadius: { value: size * 0.5 },
      uLight: { value: new THREE.Vector3(0.58, 0.82, 0.28) },
      uLow: { value: new THREE.Color(30 / 255, 58 / 255, 138 / 255) },
      uMid: { value: new THREE.Color(34 / 255, 211 / 255, 238 / 255) },
      uHigh: { value: new THREE.Color(226 / 255, 232 / 255, 240 / 255) },
      uRingColor: { value: new THREE.Color(249 / 255, 115 / 255, 22 / 255) }
    };

    const pointsMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: pointsUniforms,
      vertexShader: POINTS_VERTEX_SHADER,
      fragmentShader: POINTS_FRAGMENT_SHADER
    });

    const points = new THREE.Points(geometry, pointsMaterial);
    scene.add(points);

    const baseGrid = new THREE.GridHelper(size * 1.04, 22, 0x22d3ee, 0x1e3a8a);
    baseGrid.material = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.1
    });
    baseGrid.position.y = -0.02;
    scene.add(baseGrid);

    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    const markerGeometry = new THREE.SphereGeometry(0.04, 20, 20);
    const markerMaterial = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 1.25,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });

    const labelTextures: THREE.Texture[] = [];
    const labelMaterials: THREE.SpriteMaterial[] = [];

    const makeLabelSprite = (text: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 92;
      const c2d = canvas.getContext("2d");
      if (!c2d) return null;

      c2d.clearRect(0, 0, canvas.width, canvas.height);
      c2d.fillStyle = "rgba(2, 6, 23, 0.55)";
      c2d.strokeStyle = "rgba(34, 211, 238, 0.32)";
      c2d.lineWidth = 2;

      const x = 10;
      const y = 14;
      const w = canvas.width - 20;
      const h = canvas.height - 28;
      const r = 16;

      c2d.beginPath();
      c2d.moveTo(x + r, y);
      c2d.lineTo(x + w - r, y);
      c2d.quadraticCurveTo(x + w, y, x + w, y + r);
      c2d.lineTo(x + w, y + h - r);
      c2d.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c2d.lineTo(x + r, y + h);
      c2d.quadraticCurveTo(x, y + h, x, y + h - r);
      c2d.lineTo(x, y + r);
      c2d.quadraticCurveTo(x, y, x + r, y);
      c2d.closePath();
      c2d.fill();
      c2d.stroke();

      c2d.font = "700 30px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
      c2d.fillStyle = "rgba(226, 232, 240, 0.96)";
      c2d.textBaseline = "middle";
      c2d.fillText(text, 24, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      labelTextures.push(texture);

      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });
      labelMaterials.push(mat);

      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.62, 0.18, 1);
      return sprite;
    };

    const sampleSurfaceY = (x: number, z: number) => {
      const nx = x / (size * 0.5);
      const nz = z / (size * 0.5);
      const seed = fract(Math.sin((nx + 2.7) * 91.7 + (nz - 1.9) * 57.3) * 43758.5453);
      return terrainHeight(nx, nz, seed) * maxHeight;
    };

    const peakX = pos.getX(peakIndex);
    const peakZ = pos.getZ(peakIndex);
    const peakY = pos.getY(peakIndex);

    const mkMarker = (label: string, x: number, z: number, yOverride?: number) => {
      const marker = new THREE.Group();
      const dot = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.add(dot);

      const sprite = makeLabelSprite(label);
      if (sprite) {
        sprite.position.set(0, 0.14, 0);
        marker.add(sprite);
      }

      const y = yOverride ?? sampleSurfaceY(x, z);
      marker.position.set(x, y + 0.02, z);
      markerGroup.add(marker);
      return marker;
    };

    mkMarker("山顶", peakX, peakZ, peakY);

    const dir = new THREE.Vector3(1, 0, 0.62).normalize();
    const midX = clamp(peakX + dir.x * (size * 0.38), -size * 0.48, size * 0.48);
    const midZ = clamp(peakZ + dir.z * (size * 0.38), -size * 0.48, size * 0.48);
    mkMarker("山腰", midX, midZ);

    const footX = clamp(peakX + dir.x * (size * 0.62), -size * 0.48, size * 0.48);
    const footZ = clamp(peakZ + dir.z * (size * 0.62), -size * 0.48, size * 0.48);
    mkMarker("山脚", footX, footZ);

    let raf = 0;
    const clock = new THREE.Clock();
    let lastInteraction = performance.now();

    const onStart = () => {
      lastInteraction = performance.now();
      controls.autoRotate = false;
    };

    const onEnd = () => {
      lastInteraction = performance.now();
    };

    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);

    const onDblClick = () => {
      controls.reset();
      lastInteraction = performance.now();
    };
    canvas.addEventListener("dblclick", onDblClick);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextW = Math.max(1, Math.floor(rect.width));
      const nextH = Math.max(1, Math.floor(rect.height));
      const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(nextW, nextH, false);
      camera.aspect = nextW / nextH;
      camera.updateProjectionMatrix();
      pointsUniforms.uPixelRatio.value = pixelRatio;
    };

    const render = () => {
      const t = clock.getElapsedTime();
      const now = performance.now();
      controls.autoRotate = now - lastInteraction > 2200;
      controls.autoRotateSpeed = 0.25;

      pointsUniforms.uTime.value = t;

      controls.update();
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = window.requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("dblclick", onDblClick);
      window.cancelAnimationFrame(raf);
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      controls.dispose();
      ridgeMaterial.dispose();
      ridgeGeometries.forEach((geom) => geom.dispose());
      markerGeometry.dispose();
      markerMaterial.dispose();
      labelMaterials.forEach((mat) => mat.dispose());
      labelTextures.forEach((tex) => tex.dispose());
      baseGrid.geometry.dispose();
      (baseGrid.material as THREE.Material).dispose();
      pointsMaterial.dispose();
      meshMaterial.dispose();
      geometry.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={props.className} aria-hidden="true" />;
}
