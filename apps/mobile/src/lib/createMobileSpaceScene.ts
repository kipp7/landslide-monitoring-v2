import * as THREE from "three";
import { gsap } from "gsap";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { RiskLevel } from "../data/mockData";

export type MobileSpaceSceneMode = "model" | "hydrology" | "evacuation";

type SceneHotspot = {
  id: string;
  level: RiskLevel;
};

type SceneOptions = {
  hotspots: readonly SceneHotspot[];
  interactive?: boolean;
  initialMode?: MobileSpaceSceneMode;
  initialPlayback?: number;
  initialFocusHotspotId?: string;
  onFocusChange?: (hotspotId: string) => void;
};

type HotspotInstance = {
  id: string;
  level: RiskLevel;
  root: THREE.Group;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  cap: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hitTarget: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  position: THREE.Vector3;
  groundY: number;
  baseHeight: number;
  offset: number;
};

type RoutePulse = {
  curve: THREE.QuadraticBezierCurve3;
  pulse: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  tube: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  offset: number;
  speed: number;
};

type SceneController = {
  setMode: (mode: MobileSpaceSceneMode) => void;
  setPlayback: (progress: number) => void;
  setFocus: (hotspotId: string) => void;
  recenter: () => void;
  destroy: () => void;
};

type ModeConfig = {
  camera: [number, number, number];
  target: [number, number, number];
  accent: string;
  core: string;
  fogDensity: number;
  bloom: number;
  exposure: number;
  rainOpacity: number;
  routeOpacity: number;
  terrainEmissive: number;
  autoRotateSpeed: number;
};

const MODE_CONFIG: Record<MobileSpaceSceneMode, ModeConfig> = {
  model: {
    camera: [6.8, 5.9, 9.2],
    target: [0, 1.1, 0],
    accent: "#65ebe5",
    core: "#ff9b52",
    fogDensity: 0.056,
    bloom: 1.15,
    exposure: 1.12,
    rainOpacity: 0.14,
    routeOpacity: 0.38,
    terrainEmissive: 0.34,
    autoRotateSpeed: 0.36
  },
  hydrology: {
    camera: [-6.2, 6.5, 8.3],
    target: [-0.35, 0.98, 0.42],
    accent: "#87d8ff",
    core: "#5de5e0",
    fogDensity: 0.068,
    bloom: 1.36,
    exposure: 1.18,
    rainOpacity: 0.36,
    routeOpacity: 0.52,
    terrainEmissive: 0.42,
    autoRotateSpeed: 0.3
  },
  evacuation: {
    camera: [4.6, 7.7, 6.3],
    target: [0.4, 1.45, -0.18],
    accent: "#ffb15a",
    core: "#ff6778",
    fogDensity: 0.061,
    bloom: 1.26,
    exposure: 1.16,
    rainOpacity: 0.18,
    routeOpacity: 0.66,
    terrainEmissive: 0.38,
    autoRotateSpeed: 0.42
  }
};

const HOTSPOT_POSITIONS = [
  new THREE.Vector3(1.9, 0, -0.4),
  new THREE.Vector3(-1.7, 0, 1.1),
  new THREE.Vector3(2.55, 0, 1.95)
] as const;

const LEVEL_COLORS: Record<RiskLevel, string> = {
  critical: "#ff5d6f",
  warning: "#f3b24c",
  attention: "#5de5e0",
  normal: "#9eb7c8"
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function fract(value: number) {
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
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
  let amplitude = 0.6;
  let frequency = 1;

  for (let index = 0; index < 5; index += 1) {
    const noise = valueNoise2(x * frequency, z * frequency) * 2 - 1;
    sum += noise * amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }

  return sum;
}

function ridged(x: number, z: number) {
  let sum = 0;
  let amplitude = 0.82;
  let frequency = 1;

  for (let index = 0; index < 4; index += 1) {
    const noise = valueNoise2(x * frequency, z * frequency) * 2 - 1;
    const ridge = 1 - Math.abs(noise);
    sum += ridge * ridge * amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }

  return sum;
}

function terrainHeight(x: number, z: number) {
  const nx = x * 0.34 + 0.08;
  const nz = z * 0.35 - 0.06;
  const radius = Math.sqrt(nx * nx + nz * nz);
  const base = Math.exp(-(radius * radius) * 1.18);
  const falloff = smoothstep(1.42, 0.18, radius);

  const warp = fbm(nx * 0.84, nz * 0.84) * 0.16;
  const wx = nx + warp;
  const wz = nz - warp * 0.8;

  const ridgeField = ridged(wx * 3.2, wz * 3.2);
  const detail = fbm(wx * 7.2, wz * 7.2) * 0.18 + fbm(wx * 15.2, wz * 15.2) * 0.07;
  const ridgeLine = Math.exp(-Math.pow(nx * 0.75 + nz * 0.25, 2) * 4.8) * 0.16;

  let height = base * (0.62 + ridgeField * 0.78 + detail) + ridgeLine * base;
  height *= falloff;
  height = Math.max(0, height - 0.025);
  return Math.pow(height, 1.12) * 3.3;
}

function colorFromHeight(height01: number) {
  const low = new THREE.Color("#133042");
  const mid = new THREE.Color("#1f617c");
  const high = new THREE.Color("#97d7ec");
  return low.lerp(height01 < 0.58 ? mid : high, height01 < 0.58 ? height01 / 0.58 : (height01 - 0.58) / 0.42);
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => {
      item.dispose();
    });
    return;
  }

  material.dispose();
}

export function createMobileSpaceScene(container: HTMLDivElement, options: SceneOptions): SceneController {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let currentMode = options.initialMode ?? "model";
  let playback = clamp((options.initialPlayback ?? 78) / 100, 0, 1);
  let focusHotspotId = options.initialFocusHotspotId ?? options.hotspots[0]?.id ?? "";
  let hoverHotspotId = "";
  let animationFrame = 0;
  let isPaused = false;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = MODE_CONFIG[currentMode].exposure;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.interactive ? 1.35 : 1.15));
  renderer.setClearColor("#02070d", 0);
  renderer.domElement.className = "space-scene-canvas__element";
  renderer.domElement.style.touchAction = options.interactive ? "none" : "pan-y";
  renderer.domElement.style.cursor = options.interactive ? "grab" : "default";
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2("#06111b", MODE_CONFIG[currentMode].fogDensity);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  const cameraGoal = new THREE.Vector3(...MODE_CONFIG[currentMode].camera);
  const targetGoal = new THREE.Vector3(...MODE_CONFIG[currentMode].target);
  camera.position.copy(cameraGoal);

  const modeCameraState = {
    x: MODE_CONFIG[currentMode].camera[0],
    y: MODE_CONFIG[currentMode].camera[1],
    z: MODE_CONFIG[currentMode].camera[2]
  };
  const modeTargetState = {
    x: MODE_CONFIG[currentMode].target[0],
    y: MODE_CONFIG[currentMode].target[1],
    z: MODE_CONFIG[currentMode].target[2]
  };
  const focusCameraOffset = { x: 0, y: 0, z: 0 };
  const focusTargetOffset = { x: 0, y: 0, z: 0 };
  const sceneMotion = {
    intro: reducedMotion ? 0 : 1,
    mode: 0,
    focus: 0,
    hover: 0
  };

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate = options.interactive ?? true;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minPolarAngle = 0.72;
  controls.maxPolarAngle = 1.32;
  controls.minAzimuthAngle = -0.9;
  controls.maxAzimuthAngle = 0.9;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = MODE_CONFIG[currentMode].autoRotateSpeed;
  controls.target.copy(targetGoal);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), MODE_CONFIG[currentMode].bloom, 0.58, 0.7);
  composer.addPass(bloomPass);

  const ambientLight = new THREE.AmbientLight("#d6f2ff", 1.18);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight("#9fdfff", "#040d14", 1.36);
  scene.add(hemisphereLight);

  const keyLight = new THREE.DirectionalLight("#d1f0ff", 2.2);
  keyLight.position.set(5.8, 10.5, 5.2);
  scene.add(keyLight);

  const accentLight = new THREE.PointLight(MODE_CONFIG[currentMode].accent, 18, 18, 2);
  accentLight.position.set(-3.2, 5.2, 2.1);
  scene.add(accentLight);

  const world = new THREE.Group();
  world.position.y = -0.25;
  scene.add(world);

  const basePlate = new THREE.Mesh(
    new THREE.CircleGeometry(7.2, 80),
    new THREE.MeshBasicMaterial({
      color: "#07111b",
      transparent: true,
      opacity: 0.92
    })
  );
  basePlate.rotation.x = -Math.PI / 2;
  basePlate.position.y = -0.42;
  world.add(basePlate);

  const terrainSegments = options.interactive ? 144 : 112;
  const terrainGeometry = new THREE.PlaneGeometry(10.4, 10.4, terrainSegments, terrainSegments);
  terrainGeometry.rotateX(-Math.PI / 2);

  const positionAttr = terrainGeometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positionAttr.count * 3);

  for (let index = 0; index < positionAttr.count; index += 1) {
    const x = positionAttr.getX(index);
    const z = positionAttr.getZ(index);
    const y = terrainHeight(x, z);
    positionAttr.setY(index, y);

    const normalized = clamp(y / 3.3, 0, 1);
    const tint = colorFromHeight(normalized);
    colors[index * 3] = tint.r;
    colors[index * 3 + 1] = tint.g;
    colors[index * 3 + 2] = tint.b;
  }

  terrainGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  terrainGeometry.computeVertexNormals();

  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.16,
    roughness: 0.82,
    emissive: new THREE.Color("#10293a"),
    emissiveIntensity: MODE_CONFIG[currentMode].terrainEmissive
  });
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  world.add(terrain);

  const terrainWire = new THREE.Mesh(
    terrainGeometry.clone(),
    new THREE.MeshBasicMaterial({
      color: "#7de8f8",
      wireframe: true,
      transparent: true,
      opacity: 0.12
    })
  );
  terrainWire.position.y = 0.03;
  world.add(terrainWire);

  const scanRing = new THREE.Mesh(
    new THREE.RingGeometry(1.04, 1.28, 96),
    new THREE.MeshBasicMaterial({
      color: MODE_CONFIG[currentMode].core,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide
    })
  );
  scanRing.rotation.x = -Math.PI / 2;
  scanRing.position.y = 0.16;
  world.add(scanRing);

  const outerOrbit = new THREE.Mesh(
    new THREE.TorusGeometry(4.65, 0.028, 12, 120),
    new THREE.MeshBasicMaterial({
      color: MODE_CONFIG[currentMode].accent,
      transparent: true,
      opacity: 0.18
    })
  );
  outerOrbit.rotation.x = Math.PI / 2;
  outerOrbit.position.y = 0.08;
  world.add(outerOrbit);

  const innerOrbit = new THREE.Mesh(
    new THREE.TorusGeometry(2.85, 0.032, 12, 96),
    new THREE.MeshBasicMaterial({
      color: MODE_CONFIG[currentMode].core,
      transparent: true,
      opacity: 0.24
    })
  );
  innerOrbit.rotation.x = Math.PI / 2;
  innerOrbit.position.y = 0.2;
  world.add(innerOrbit);

  const hotspotInstances: HotspotInstance[] = options.hotspots.map((hotspot, index) => {
    const position = HOTSPOT_POSITIONS[index] ? HOTSPOT_POSITIONS[index].clone() : new THREE.Vector3(index, 0, index);
    const groundY = terrainHeight(position.x, position.z) + 0.06;
    const baseHeight =
      hotspot.level === "critical" ? 1.95 : hotspot.level === "warning" ? 1.55 : hotspot.level === "attention" ? 1.22 : 0.92;
    const color = LEVEL_COLORS[hotspot.level];

    const root = new THREE.Group();
    world.add(root);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.22, 1, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide
      })
    );
    beam.position.set(position.x, groundY + baseHeight / 2, position.z);
    beam.scale.y = baseHeight;
    root.add(beam);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 20, 20),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2.3,
        roughness: 0.16,
        metalness: 0.08
      })
    );
    cap.position.set(position.x, groundY + baseHeight + 0.12, position.z);
    root.add(cap);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.36, 44),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.56,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, groundY + 0.02, position.z);
    root.add(ring);

    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 1.55),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(position.x, groundY + 0.03, position.z);
    root.add(halo);

    const hitTarget = new THREE.Mesh(
      new THREE.SphereGeometry(0.54, 16, 16),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    hitTarget.position.set(position.x, groundY + baseHeight * 0.78, position.z);
    hitTarget.userData.hotspotId = hotspot.id;
    root.add(hitTarget);

    return {
      id: hotspot.id,
      level: hotspot.level,
      root,
      beam,
      cap,
      ring,
      halo,
      hitTarget,
      position,
      groundY,
      baseHeight,
      offset: index * 0.82
    };
  });

  const focusReticle = new THREE.Group();
  world.add(focusReticle);

  const focusDisc = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.7, 64),
    new THREE.MeshBasicMaterial({
      color: MODE_CONFIG[currentMode].accent,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide
    })
  );
  focusDisc.rotation.x = -Math.PI / 2;
  focusReticle.add(focusDisc);

  const focusColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.15, 2.6, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color: MODE_CONFIG[currentMode].core,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide
    })
  );
  focusColumn.position.y = 1.4;
  focusReticle.add(focusColumn);

  const focusSpark = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.18, 0),
    new THREE.MeshStandardMaterial({
      color: "#dffcff",
      emissive: MODE_CONFIG[currentMode].core,
      emissiveIntensity: 2.3,
      roughness: 0.12,
      metalness: 0.16
    })
  );
  focusSpark.position.y = 2.6;
  focusReticle.add(focusSpark);

  const routePulses: RoutePulse[] = [];
  const routePairs = [
    [0, 1],
    [0, 2]
  ] as const;

  routePairs.forEach(([fromIndex, toIndex], pairIndex) => {
    const from = hotspotInstances[fromIndex];
    const to = hotspotInstances[toIndex];

    if (!from || !to) {
      return;
    }

    const start = from.position.clone().setY(from.groundY + 0.6);
    const end = to.position.clone().setY(to.groundY + 0.56);
    const mid = start
      .clone()
      .lerp(end, 0.5)
      .add(new THREE.Vector3(0, 1.4 + pairIndex * 0.2, pairIndex === 0 ? -0.45 : 0.4));
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);

    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 80, 0.032, 12, false),
      new THREE.MeshBasicMaterial({
        color: "#68deff",
        transparent: true,
        opacity: MODE_CONFIG[currentMode].routeOpacity
      })
    );
    world.add(tube);

    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshStandardMaterial({
        color: "#dffcff",
        emissive: "#a3f3ff",
        emissiveIntensity: 2.4,
        roughness: 0.08,
        metalness: 0.05
      })
    );
    world.add(pulse);

    routePulses.push({
      curve,
      pulse,
      tube,
      offset: pairIndex * 0.28,
      speed: 0.14 + pairIndex * 0.04
    });
  });

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(13, 28, 28),
    new THREE.MeshBasicMaterial({
      color: "#15354a",
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide
    })
  );
  atmosphere.position.y = 3.2;
  scene.add(atmosphere);

  const sparkCount = options.interactive ? 260 : 160;
  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPositions = new Float32Array(sparkCount * 3);
  for (let index = 0; index < sparkCount; index += 1) {
    const baseIndex = index * 3;
    sparkPositions[baseIndex] = (Math.random() - 0.5) * 11;
    sparkPositions[baseIndex + 1] = 0.9 + Math.random() * 5.6;
    sparkPositions[baseIndex + 2] = (Math.random() - 0.5) * 10;
  }
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));

  const sparks = new THREE.Points(
    sparkGeometry,
    new THREE.PointsMaterial({
      color: "#9defff",
      size: 0.046,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(sparks);

  const rainCount = options.interactive ? 120 : 84;
  const rainGeometry = new THREE.BufferGeometry();
  const rainBase = new Float32Array(rainCount * 3);
  const rainPositions = new Float32Array(rainCount * 3);
  const rainMeta = new Float32Array(rainCount * 2);

  for (let index = 0; index < rainCount; index += 1) {
    const baseIndex = index * 3;
    rainBase[baseIndex] = (Math.random() - 0.18) * 7.2;
    rainBase[baseIndex + 1] = 1.2 + Math.random() * 5;
    rainBase[baseIndex + 2] = (Math.random() - 0.5) * 7.4 - 0.8;
    const baseX = rainBase[baseIndex] ?? 0;
    const baseY = rainBase[baseIndex + 1] ?? 0;
    const baseZ = rainBase[baseIndex + 2] ?? 0;

    rainPositions[baseIndex] = baseX;
    rainPositions[baseIndex + 1] = baseY;
    rainPositions[baseIndex + 2] = baseZ;
    rainMeta[index * 2] = 0.7 + Math.random() * 0.9;
    rainMeta[index * 2 + 1] = Math.random() * Math.PI * 2;
  }

  rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));

  const rain = new THREE.Points(
    rainGeometry,
    new THREE.PointsMaterial({
      color: "#7ccfff",
      size: 0.06,
      transparent: true,
      opacity: MODE_CONFIG[currentMode].rainOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(rain);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(2, 2);
  const interactionTargets = hotspotInstances.map((item) => item.hitTarget);
  const accentColor = new THREE.Color(MODE_CONFIG[currentMode].accent);
  const coreColor = new THREE.Color(MODE_CONFIG[currentMode].core);
  const terrainGlow = new THREE.Color("#123246");
  const hotspotColor = new THREE.Color();
  let pointerDownX = 0;
  let pointerDownY = 0;
  let userInteracting = false;

  function updateSize() {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloomPass.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  updateSize();
  const resizeObserver = new ResizeObserver(() => {
    updateSize();
  });
  resizeObserver.observe(container);

  const startedAt = performance.now();

  function getFocusedHotspot() {
    return hotspotInstances.find((item) => item.id === focusHotspotId) ?? hotspotInstances[0];
  }

  function setHoverHotspot(nextHoverHotspotId: string) {
    if (hoverHotspotId === nextHoverHotspotId) {
      return;
    }

    hoverHotspotId = nextHoverHotspotId;

    if (reducedMotion) {
      sceneMotion.hover = nextHoverHotspotId ? 1 : 0;
    } else {
      gsap.to(sceneMotion, {
        hover: nextHoverHotspotId ? 1 : 0,
        duration: 0.22,
        ease: "power2.out",
        overwrite: "auto"
      });
    }

    if (options.interactive) {
      renderer.domElement.style.cursor = userInteracting ? "grabbing" : nextHoverHotspotId ? "pointer" : "grab";
    }
  }

  function updatePointer(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function getIntersectedHotspotId() {
    if (!interactionTargets.length) {
      return "";
    }

    raycaster.setFromCamera(pointer, camera);
    return (raycaster.intersectObjects(interactionTargets, false)[0]?.object.userData.hotspotId as string | undefined) ?? "";
  }

  function syncFocusState(nextFocusHotspotId: string, shouldNotify = true, immediate = false) {
    const nextHotspot =
      hotspotInstances.find((item) => item.id === nextFocusHotspotId) ?? hotspotInstances[0];

    focusHotspotId = nextHotspot?.id ?? "";

    if (!nextHotspot) {
      return;
    }

    const nextTargetOffset = {
      x: nextHotspot.position.x * 0.24,
      y: 0.16 + (nextHotspot.level === "critical" ? 0.08 : 0.03),
      z: nextHotspot.position.z * 0.18
    };
    const nextCameraOffset = {
      x: nextHotspot.position.x * 0.34,
      y: nextHotspot.level === "critical" ? 0.34 : 0.16,
      z: nextHotspot.position.z * 0.22 - 0.12
    };

    if (immediate || reducedMotion) {
      Object.assign(focusTargetOffset, nextTargetOffset);
      Object.assign(focusCameraOffset, nextCameraOffset);
      sceneMotion.focus = 0;
    } else {
      gsap.to(focusTargetOffset, {
        ...nextTargetOffset,
        duration: 0.86,
        ease: "expo.out",
        overwrite: true
      });
      gsap.to(focusCameraOffset, {
        ...nextCameraOffset,
        duration: 1.04,
        ease: "expo.out",
        overwrite: true
      });
      gsap.fromTo(
        sceneMotion,
        { focus: 1 },
        { focus: 0, duration: 1.4, ease: "power3.out", overwrite: "auto" }
      );
    }

    if (shouldNotify) {
      options.onFocusChange?.(focusHotspotId);
    }
  }

  function syncModeState(mode: MobileSpaceSceneMode, immediate = false) {
    currentMode = mode;
    const config = MODE_CONFIG[mode];

    if (immediate || reducedMotion) {
      modeCameraState.x = config.camera[0];
      modeCameraState.y = config.camera[1];
      modeCameraState.z = config.camera[2];
      modeTargetState.x = config.target[0];
      modeTargetState.y = config.target[1];
      modeTargetState.z = config.target[2];
      sceneMotion.mode = 0;
    } else {
      gsap.to(modeCameraState, {
        x: config.camera[0],
        y: config.camera[1],
        z: config.camera[2],
        duration: 1.08,
        ease: "expo.inOut",
        overwrite: true
      });
      gsap.to(modeTargetState, {
        x: config.target[0],
        y: config.target[1],
        z: config.target[2],
        duration: 1.08,
        ease: "expo.inOut",
        overwrite: true
      });
      gsap.fromTo(
        sceneMotion,
        { mode: 0.9 },
        { mode: 0, duration: 1.45, ease: "expo.out", overwrite: "auto" }
      );
    }

    syncFocusState(focusHotspotId, false, immediate);
  }

  function recenterScene() {
    camera.position.copy(cameraGoal);
    controls.target.copy(targetGoal);
    controls.update();
  }

  function handlePointerDown(event: PointerEvent) {
    if (!options.interactive) {
      return;
    }

    pointerDownX = event.clientX;
    pointerDownY = event.clientY;
    updatePointer(event);
    setHoverHotspot(getIntersectedHotspotId());
  }

  function handlePointerMove(event: PointerEvent) {
    if (!options.interactive) {
      return;
    }

    updatePointer(event);
    setHoverHotspot(getIntersectedHotspotId());
  }

  function handlePointerUp(event: PointerEvent) {
    if (!options.interactive) {
      return;
    }

    updatePointer(event);
    const travel = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
    const nextHotspotId = getIntersectedHotspotId();
    setHoverHotspot(nextHotspotId);

    if (travel < 14 && nextHotspotId) {
      syncFocusState(nextHotspotId, true);
      recenterScene();
    }
  }

  function handlePointerLeave() {
    if (!options.interactive) {
      return;
    }

    setHoverHotspot("");
  }

  function handleVisibilityChange() {
    isPaused = document.hidden;

    if (!isPaused && animationFrame === 0) {
      animationFrame = window.requestAnimationFrame(animate);
    }
  }

  controls.addEventListener("start", () => {
    userInteracting = true;
    if (options.interactive) {
      renderer.domElement.style.cursor = "grabbing";
    }
  });

  controls.addEventListener("end", () => {
    userInteracting = false;
    if (options.interactive) {
      renderer.domElement.style.cursor = hoverHotspotId ? "pointer" : "grab";
    }
  });

  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  syncModeState(currentMode, true);

  if (!reducedMotion) {
    const initialConfig = MODE_CONFIG[currentMode];
    gsap.set(modeCameraState, {
      x: initialConfig.camera[0] + 2.2,
      y: initialConfig.camera[1] + 1.2,
      z: initialConfig.camera[2] + 2.8
    });
    gsap.set(modeTargetState, {
      x: initialConfig.target[0] - 0.38,
      y: initialConfig.target[1] - 0.12,
      z: initialConfig.target[2] + 0.56
    });
    gsap.to(modeCameraState, {
      x: initialConfig.camera[0],
      y: initialConfig.camera[1],
      z: initialConfig.camera[2],
      duration: 1.55,
      ease: "expo.out",
      overwrite: true
    });
    gsap.to(modeTargetState, {
      x: initialConfig.target[0],
      y: initialConfig.target[1],
      z: initialConfig.target[2],
      duration: 1.4,
      ease: "expo.out",
      overwrite: true
    });
    gsap.fromTo(
      sceneMotion,
      { intro: 1 },
      { intro: 0, duration: 1.85, ease: "expo.out", overwrite: "auto" }
    );
  }

  function animate() {
    if (isPaused) {
      animationFrame = 0;
      return;
    }

    const elapsed = (performance.now() - startedAt) / 1000;
    const config = MODE_CONFIG[currentMode];
    const focused = getFocusedHotspot();

    cameraGoal.set(
      modeCameraState.x + focusCameraOffset.x + Math.sin(elapsed * 0.34 + 0.2) * 0.12,
      modeCameraState.y + focusCameraOffset.y + Math.cos(elapsed * 0.42) * 0.08 + sceneMotion.intro * 0.18,
      modeCameraState.z + focusCameraOffset.z + sceneMotion.mode * 0.42
    );
    targetGoal.set(
      modeTargetState.x + focusTargetOffset.x,
      modeTargetState.y + focusTargetOffset.y + sceneMotion.focus * 0.02,
      modeTargetState.z + focusTargetOffset.z
    );

    camera.position.lerp(cameraGoal, reducedMotion ? 0.22 : options.interactive ? 0.1 : 0.08);
    controls.target.lerp(targetGoal, reducedMotion ? 0.22 : 0.12);
    controls.autoRotateSpeed = config.autoRotateSpeed;
    controls.autoRotate = !reducedMotion && (!options.interactive || !userInteracting);
    controls.update();

    renderer.toneMappingExposure = lerp(renderer.toneMappingExposure, config.exposure + sceneMotion.mode * 0.05, 0.06);
    bloomPass.strength = lerp(bloomPass.strength, config.bloom + sceneMotion.focus * 0.08, 0.08);
    fog.density = lerp(fog.density, config.fogDensity, 0.08);
    ambientLight.intensity = lerp(ambientLight.intensity, 1.06 + playback * 0.26, 0.08);
    hemisphereLight.intensity = lerp(hemisphereLight.intensity, 1.2 + playback * 0.36, 0.08);
    accentColor.set(config.accent);
    coreColor.set(config.core);
    accentLight.color.lerp(accentColor, 0.08);
    accentLight.intensity = lerp(accentLight.intensity, 14 + playback * 7 + sceneMotion.focus * 2.4, 0.08);
    terrainMaterial.emissiveIntensity = lerp(terrainMaterial.emissiveIntensity, config.terrainEmissive, 0.08);
    terrainMaterial.emissive.lerp(terrainGlow, 0.03);
    scanRing.material.color.lerp(coreColor, 0.08);
    outerOrbit.material.color.lerp(accentColor, 0.08);
    innerOrbit.material.color.lerp(coreColor, 0.08);
    focusDisc.material.color.lerp(accentColor, 0.08);
    focusColumn.material.color.lerp(coreColor, 0.08);
    focusSpark.material.emissive.lerp(coreColor, 0.08);
    rain.material.opacity = lerp(rain.material.opacity, config.rainOpacity + playback * 0.08, 0.08);

    world.rotation.y = Math.sin(elapsed * 0.11) * 0.08 + sceneMotion.mode * 0.14 + sceneMotion.focus * 0.04;
    world.rotation.x = Math.sin(elapsed * 0.09) * 0.02;
    sparks.rotation.y += reducedMotion ? 0.0006 : 0.0018;
    sparks.position.y = Math.sin(elapsed * 0.32) * 0.12;

    outerOrbit.rotation.z += 0.0024;
    innerOrbit.rotation.z -= 0.0032;

    const scanPhase = reducedMotion ? playback : (elapsed * 0.16 + playback * 0.7) % 1.15;
    const scanScale = 1.08 + scanPhase * (4.2 + sceneMotion.focus * 0.8);
    scanRing.scale.setScalar(scanScale);
    scanRing.material.opacity = 0.12 + (1 - scanPhase) * 0.22 + playback * 0.12 + sceneMotion.mode * 0.08;

    if (focused) {
      const focusPulse = reducedMotion ? 0.4 : (Math.sin(elapsed * 3.4) + 1) * 0.5;
      focusReticle.position.set(focused.position.x, focused.groundY + 0.03, focused.position.z);
      focusReticle.scale.setScalar(1 + sceneMotion.focus * 0.26 + sceneMotion.hover * 0.08);
      focusDisc.scale.setScalar(1 + focusPulse * 0.16 + sceneMotion.focus * 0.14);
      focusDisc.material.opacity = 0.16 + focusPulse * 0.1 + sceneMotion.focus * 0.22 + sceneMotion.hover * 0.05;
      focusColumn.position.y = 1.32 + focusPulse * 0.14;
      focusColumn.material.opacity = 0.08 + playback * 0.12 + sceneMotion.focus * 0.14;
      focusSpark.position.y = 2.44 + focusPulse * 0.16 + sceneMotion.focus * 0.18;
      focusSpark.rotation.y += reducedMotion ? 0.008 : 0.018;
      focusSpark.rotation.x += reducedMotion ? 0.004 : 0.01;
      focusSpark.material.emissiveIntensity = 2 + sceneMotion.focus * 1.4;
    }

    hotspotInstances.forEach((hotspot) => {
      const highlight = hotspot.id === focusHotspotId ? 1 : hotspot.id === hoverHotspotId ? 0.42 : 0;
      const pulse = reducedMotion ? 0.5 : (Math.sin(elapsed * 2.4 + hotspot.offset) + 1) * 0.5;
      const levelBoost =
        hotspot.level === "critical" ? 0.48 : hotspot.level === "warning" ? 0.28 : hotspot.level === "attention" ? 0.16 : 0.08;
      const modeBoost = currentMode === "evacuation" ? 0.18 : currentMode === "hydrology" ? 0.12 : 0.08;
      const focusBoost = hotspot.id === focusHotspotId ? sceneMotion.focus : hotspot.id === hoverHotspotId ? sceneMotion.hover * 0.4 : 0;
      const targetHeight = hotspot.baseHeight * (0.72 + playback * 0.92 + levelBoost + modeBoost + highlight * 0.28 + focusBoost * 0.3);

      hotspot.beam.scale.y = targetHeight;
      hotspot.beam.position.y = hotspot.groundY + targetHeight / 2;
      hotspot.beam.material.opacity = 0.3 + playback * 0.2 + pulse * 0.14 + highlight * 0.2 + focusBoost * 0.14;
      hotspotColor.set(LEVEL_COLORS[hotspot.level]);
      hotspot.beam.material.color.lerp(hotspotColor, 0.08);

      hotspot.cap.position.y = hotspot.groundY + targetHeight + 0.16 + pulse * 0.12;
      hotspot.cap.scale.setScalar(1 + pulse * 0.22 + highlight * 0.22 + focusBoost * 0.16);
      hotspot.cap.material.emissiveIntensity = 1.8 + pulse * 1.4 + highlight * 1.6 + focusBoost * 1.6;

      hotspot.ring.scale.setScalar(1 + pulse * 1.9 + highlight * 0.65 + focusBoost * 0.42);
      hotspot.ring.material.opacity = 0.2 + (1 - pulse) * 0.24 + highlight * 0.22 + focusBoost * 0.12;

      hotspot.halo.scale.setScalar(1 + pulse * 1.15 + highlight * 0.42 + focusBoost * 0.24);
      hotspot.halo.material.opacity = 0.08 + pulse * 0.1 + highlight * 0.12 + focusBoost * 0.08;
    });

    routePulses.forEach((route, index) => {
      const progress = (elapsed * route.speed + route.offset + playback * 0.35) % 1;
      route.pulse.position.copy(route.curve.getPointAt(progress));
      route.pulse.scale.setScalar(0.86 + Math.sin(elapsed * 3.2 + index) * 0.1);
      route.tube.material.opacity = lerp(route.tube.material.opacity, config.routeOpacity + playback * 0.14, 0.08);
    });

    if (rain.material.opacity > 0.02) {
      const rainPositionAttr = rainGeometry.attributes.position as THREE.BufferAttribute;
      for (let index = 0; index < rainCount; index += 1) {
        const baseIndex = index * 3;
        const speed = rainMeta[index * 2] ?? 0;
        const phase = rainMeta[index * 2 + 1] ?? 0;
        const baseX = rainBase[baseIndex] ?? 0;
        const baseY = rainBase[baseIndex + 1] ?? 0;
        const baseZ = rainBase[baseIndex + 2] ?? 0;

        rainPositions[baseIndex] = baseX + Math.sin(elapsed * 0.5 + phase) * 0.16;
        rainPositions[baseIndex + 1] = 1 + ((baseY - elapsed * speed * 1.55 - playback * 1.9 + 8) % 8);
        rainPositions[baseIndex + 2] = baseZ + Math.cos(elapsed * 0.7 + phase) * 0.08;
      }
      rainPositionAttr.needsUpdate = true;
    }

    composer.render();
    animationFrame = window.requestAnimationFrame(animate);
  }

  animationFrame = window.requestAnimationFrame(animate);

  return {
    setMode(mode) {
      syncModeState(mode);
    },
    setPlayback(progress) {
      playback = clamp(progress / 100, 0, 1);
    },
    setFocus(hotspotId) {
      syncFocusState(hotspotId, false);
    },
    recenter() {
      recenterScene();
    },
    destroy() {
      window.cancelAnimationFrame(animationFrame);
      gsap.killTweensOf([
        modeCameraState,
        modeTargetState,
        focusCameraOffset,
        focusTargetOffset,
        sceneMotion
      ]);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      resizeObserver.disconnect();
      controls.dispose();
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
      renderer.dispose();

      scene.traverse((object) => {
        if ("geometry" in object) {
          const geometry = object.geometry;
          if (geometry instanceof THREE.BufferGeometry) {
            geometry.dispose();
          }
        }

        if ("material" in object) {
          disposeMaterial(object.material as THREE.Material | THREE.Material[]);
        }
      });

      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    }
  };
}
