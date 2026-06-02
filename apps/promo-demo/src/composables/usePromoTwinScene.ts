import * as THREE from 'three'

type StageKey = 0 | 1 | 2 | 3 | 4 | 5

type RuntimeContext = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  width: number
  height: number
  pixelRatio: number
}

export type PromoTwinSceneContext = RuntimeContext

type SceneOptions = {
  reducedMotion: boolean
}

type StageConfig = {
  camera: [number, number, number]
  target: [number, number, number]
  background: string
  fog: string
  fogDensity: number
  ambient: number
  key: number
  rim: number
  coreGlow: number
  ringOpacity: number
  linkOpacity: number
  beamOpacity: number
  bladeOpacity: number
  alertOpacity: number
  floorOpacity: number
  accent: string
  alert: string
}

type TowerNode = {
  group: THREE.Group
  head: THREE.Mesh
  beam: THREE.Mesh
  halo: THREE.Mesh
}

type LinkNode = {
  mesh: THREE.Mesh
  pulse: THREE.Mesh
  curve: THREE.Curve<THREE.Vector3>
  offset: number
}

type SliceNode = {
  mesh: THREE.Mesh
  edge: THREE.LineSegments
  offset: number
}

type BladeNode = {
  mesh: THREE.Mesh
  offset: number
  radius: number
}

const TAU = Math.PI * 2

const STAGES: Record<StageKey, StageConfig> = {
  0: {
    camera: [0, 4.8, 11.5],
    target: [0, 0.35, 0],
    background: '#05070a',
    fog: '#0b0f13',
    fogDensity: 0.028,
    ambient: 1.1,
    key: 1.2,
    rim: 0.55,
    coreGlow: 0.5,
    ringOpacity: 0.14,
    linkOpacity: 0.08,
    beamOpacity: 0.08,
    bladeOpacity: 0.2,
    alertOpacity: 0.08,
    floorOpacity: 0.4,
    accent: '#9fd7ff',
    alert: '#ff8b58',
  },
  1: {
    camera: [-8.2, 3.7, 8.8],
    target: [-0.8, 0.2, 0],
    background: '#05090d',
    fog: '#0d1218',
    fogDensity: 0.031,
    ambient: 1.18,
    key: 1.24,
    rim: 0.62,
    coreGlow: 0.8,
    ringOpacity: 0.42,
    linkOpacity: 0.24,
    beamOpacity: 0.18,
    bladeOpacity: 0.32,
    alertOpacity: 0.1,
    floorOpacity: 0.44,
    accent: '#8cf3ff',
    alert: '#ff955b',
  },
  2: {
    camera: [8.8, 3.1, 8.2],
    target: [1.2, 0.18, 0],
    background: '#06090f',
    fog: '#10161d',
    fogDensity: 0.033,
    ambient: 1.14,
    key: 1.28,
    rim: 0.74,
    coreGlow: 0.95,
    ringOpacity: 0.28,
    linkOpacity: 0.72,
    beamOpacity: 0.56,
    bladeOpacity: 0.34,
    alertOpacity: 0.14,
    floorOpacity: 0.48,
    accent: '#9be8ff',
    alert: '#ff9a64',
  },
  3: {
    camera: [0, 8.6, 7.4],
    target: [0, 0.4, 0],
    background: '#07090d',
    fog: '#13171d',
    fogDensity: 0.031,
    ambient: 1.2,
    key: 1.1,
    rim: 0.82,
    coreGlow: 1.08,
    ringOpacity: 0.24,
    linkOpacity: 0.52,
    beamOpacity: 0.26,
    bladeOpacity: 0.62,
    alertOpacity: 0.12,
    floorOpacity: 0.52,
    accent: '#d8f5ff',
    alert: '#ff9d6a',
  },
  4: {
    camera: [6.2, 2.6, 5.4],
    target: [1.05, 0.15, 0.4],
    background: '#0c0908',
    fog: '#231410',
    fogDensity: 0.039,
    ambient: 1.04,
    key: 1.24,
    rim: 0.56,
    coreGlow: 0.78,
    ringOpacity: 0.3,
    linkOpacity: 0.6,
    beamOpacity: 0.22,
    bladeOpacity: 0.38,
    alertOpacity: 0.94,
    floorOpacity: 0.58,
    accent: '#ffd1a1',
    alert: '#ff7046',
  },
  5: {
    camera: [-4.6, 6.7, 11.4],
    target: [0, 0.6, 0],
    background: '#070707',
    fog: '#141210',
    fogDensity: 0.03,
    ambient: 1.2,
    key: 1.18,
    rim: 0.72,
    coreGlow: 1,
    ringOpacity: 0.24,
    linkOpacity: 0.48,
    beamOpacity: 0.16,
    bladeOpacity: 0.56,
    alertOpacity: 0.34,
    floorOpacity: 0.68,
    accent: '#c5f1ff',
    alert: '#ff8a4f',
  },
}

function createTerrainShape(radius: number, variant: number) {
  const shape = new THREE.Shape()

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * TAU
    const wave =
      0.82 +
      Math.sin(angle * 2.4 + variant * 0.68) * 0.12 +
      Math.cos(angle * 4.1 - variant * 0.44) * 0.08 +
      Math.sin(angle * 6.8 + variant * 0.32) * 0.04
    const x = Math.cos(angle) * radius * wave
    const y = Math.sin(angle) * radius * wave

    if (index === 0) {
      shape.moveTo(x, y)
    } else {
      shape.lineTo(x, y)
    }
  }

  shape.closePath()
  return shape
}

function damp(current: number, target: number, lambda: number, delta: number) {
  return THREE.MathUtils.damp(current, target, lambda, delta)
}

function dampVector3(current: THREE.Vector3, target: THREE.Vector3, lambda: number, delta: number) {
  current.x = damp(current.x, target.x, lambda, delta)
  current.y = damp(current.y, target.y, lambda, delta)
  current.z = damp(current.z, target.z, lambda, delta)
}

export type PromoSceneController = {
  setStage: (stage: number) => void
  setDormant: (inactive: boolean) => void
  boost: () => void
  frame: () => void
  resize: (width: number, height: number, pixelRatio: number) => void
  destroy: () => void
}

export function createPromoTwinScene(
  { scene, camera, renderer, width, height, pixelRatio }: RuntimeContext,
  { reducedMotion }: SceneOptions
): PromoSceneController {
  renderer.setPixelRatio(Math.min(pixelRatio, 2))
  renderer.setSize(width, height, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const stageColor = new THREE.Color(STAGES[0].background)
  const fogColor = new THREE.Color(STAGES[0].fog)
  scene.background = stageColor
  scene.fog = new THREE.FogExp2(fogColor.clone(), STAGES[0].fogDensity)

  camera.near = 0.1
  camera.far = 60
  camera.position.set(...STAGES[0].camera)
  camera.lookAt(...STAGES[0].target)
  camera.updateProjectionMatrix()

  const clock = new THREE.Clock()
  const root = new THREE.Group()
  root.position.y = 0.15
  scene.add(root)

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: '#090909',
    roughness: 0.92,
    metalness: 0.08,
    transparent: true,
    opacity: 0.86,
  })
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 96), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -2.25
  root.add(floor)

  const grid = new THREE.GridHelper(28, 28, '#202020', '#141414')
  grid.position.y = -2.1
  root.add(grid)

  const contourRings = [3.8, 5.1, 6.7].map((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.026 + index * 0.012, 10, 120),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? '#d9f7ff' : '#92b6c7',
        transparent: true,
        opacity: 0.16 - index * 0.03,
      })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = -1.92 + index * 0.2
    root.add(ring)
    return ring
  })

  const coreGroup = new THREE.Group()
  root.add(coreGroup)

  const sliceNodes: SliceNode[] = []
  const coreMaterials: THREE.MeshStandardMaterial[] = []
  const edgeMaterials: THREE.LineBasicMaterial[] = []

  for (let index = 0; index < 5; index += 1) {
    const radius = 5.2 - index * 0.72
    const geometry = new THREE.ExtrudeGeometry(createTerrainShape(radius, index + 1), {
      depth: 0.24,
      bevelEnabled: false,
      curveSegments: 32,
    })
    geometry.rotateX(-Math.PI / 2)
    geometry.center()

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#12181f').offsetHSL(0, 0, index * 0.05),
      emissive: '#8ad5ff',
      emissiveIntensity: 0.26 + index * 0.03,
      transparent: true,
      opacity: 0.9 - index * 0.06,
      roughness: 0.38,
      metalness: 0.22,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = -0.98 + index * 0.35
    mesh.rotation.y = index * 0.18
    coreGroup.add(mesh)

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: '#b7eaff',
      transparent: true,
      opacity: 0.34,
    })
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial)
    edge.position.copy(mesh.position)
    edge.rotation.copy(mesh.rotation)
    coreGroup.add(edge)

    coreMaterials.push(material)
    edgeMaterials.push(edgeMaterial)
    sliceNodes.push({
      mesh,
      edge,
      offset: index * 0.38,
    })
  }

  const shardMaterial = new THREE.MeshStandardMaterial({
    color: '#ddeef6',
    emissive: '#aef4ff',
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.84,
    metalness: 0.14,
    roughness: 0.18,
  })

  const shardGeometry = new THREE.BoxGeometry(0.34, 2.2, 0.34)
  const shards = Array.from({ length: 7 }, (_, index) => {
    const shard = new THREE.Mesh(shardGeometry, shardMaterial)
    const angle = (index / 7) * TAU
    shard.position.set(Math.cos(angle) * 2.4, -0.3 + (index % 3) * 0.34, Math.sin(angle) * 2.1)
    shard.scale.y = 0.7 + (index % 4) * 0.28
    shard.rotation.y = angle + 0.3
    root.add(shard)
    return shard
  })

  const towerMaterial = new THREE.MeshStandardMaterial({
    color: '#2a3138',
    emissive: '#0a0f16',
    emissiveIntensity: 0.16,
    roughness: 0.3,
    metalness: 0.55,
  })
  const towerHeadMaterial = new THREE.MeshBasicMaterial({
    color: '#dcf5ff',
    transparent: true,
    opacity: 0.9,
  })
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: '#9de7ff',
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  })
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: '#87dfff',
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
  })

  const towerNodes: TowerNode[] = []
  const towerAnchorPoints: THREE.Vector3[] = []
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * TAU + 0.15
    const radius = index % 2 === 0 ? 7.2 : 6.1
    const heightValue = 3.4 + (index % 3) * 1.2
    const group = new THREE.Group()
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    group.position.set(x, -2.05, z)

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, heightValue, 10), towerMaterial)
    body.position.y = heightValue / 2
    group.add(body)

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), towerHeadMaterial)
    head.position.y = heightValue + 0.24
    group.add(head)

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.34, 5.8, 12, 1, true), beamMaterial)
    beam.position.y = heightValue + 2.9
    group.add(beam)

    const halo = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.58, 32), haloMaterial)
    halo.rotation.x = -Math.PI / 2
    halo.position.y = heightValue + 0.03
    group.add(halo)

    root.add(group)
    towerNodes.push({ group, head, beam, halo })
    towerAnchorPoints.push(new THREE.Vector3(x * 0.56, 0.3 + (index % 3) * 0.2, z * 0.56))
  }

  const linkMaterial = new THREE.MeshBasicMaterial({
    color: '#89ddff',
    transparent: true,
    opacity: 0.2,
  })
  const linkPulseMaterial = new THREE.MeshBasicMaterial({
    color: '#f2fcff',
    transparent: true,
    opacity: 0.9,
  })

  const linkNodes: LinkNode[] = []
  towerNodes.forEach((tower, index) => {
    const start = new THREE.Vector3().copy(tower.group.position)
    start.y = tower.head.position.y + tower.group.position.y
    const end = towerAnchorPoints[index]
    const mid = start.clone().lerp(end, 0.5)
    mid.y += 1.6 + (index % 2) * 0.6

    const curve = new THREE.CatmullRomCurve3([start, mid, end])
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 56, 0.038, 10, false),
      linkMaterial
    )
    root.add(mesh)

    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), linkPulseMaterial)
    root.add(pulse)

    linkNodes.push({
      mesh,
      pulse,
      curve,
      offset: index * 0.11,
    })
  })

  const bladeMaterial = new THREE.MeshStandardMaterial({
    color: '#d8f3ff',
    emissive: '#9feeff',
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.22,
    roughness: 0.12,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })
  const bladeGeometry = new THREE.PlaneGeometry(0.95, 4.8, 1, 1)
  const bladeNodes: BladeNode[] = Array.from({ length: 6 }, (_, index) => {
    const mesh = new THREE.Mesh(bladeGeometry, bladeMaterial)
    const angle = index * (TAU / 6) + 0.2
    const radius = 3.2 + (index % 2) * 1.3
    mesh.position.set(Math.cos(angle) * radius, 0.3, Math.sin(angle) * radius)
    mesh.rotation.y = -angle + Math.PI / 2
    mesh.scale.y = 0.85 + (index % 3) * 0.3
    root.add(mesh)
    return {
      mesh,
      offset: index * 0.58,
      radius,
    }
  })

  const panelMaterial = new THREE.MeshBasicMaterial({
    color: '#d9f2ff',
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
  })
  const panelEdgesMaterial = new THREE.LineBasicMaterial({
    color: '#daefff',
    transparent: true,
    opacity: 0.22,
  })
  const panelGroup = new THREE.Group()
  root.add(panelGroup)
  for (let index = 0; index < 4; index += 1) {
    const angle = 0.8 + index * (TAU / 4)
    const radius = 4.7 + (index % 2) * 0.5
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), panelMaterial)
    panel.position.set(Math.cos(angle) * radius, 1.4 + index * 0.18, Math.sin(angle) * radius)
    panel.rotation.y = -angle + Math.PI / 2
    panelGroup.add(panel)

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.4, 1.8)),
      panelEdgesMaterial
    )
    edges.position.copy(panel.position)
    edges.rotation.copy(panel.rotation)
    panelGroup.add(edges)
  }

  const alertRingMaterial = new THREE.MeshBasicMaterial({
    color: '#ff6d49',
    transparent: true,
    opacity: 0.08,
  })
  const alertRing = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.09, 12, 96), alertRingMaterial)
  alertRing.rotation.x = Math.PI / 2
  alertRing.position.y = -0.35
  root.add(alertRing)

  const sweepMaterial = new THREE.MeshBasicMaterial({
    color: '#ff9163',
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const sweep = new THREE.Mesh(new THREE.CircleGeometry(4.8, 32, 0, Math.PI / 5), sweepMaterial)
  sweep.rotation.x = -Math.PI / 2
  sweep.position.y = -1.2
  root.add(sweep)

  const pointsGeometry = new THREE.BufferGeometry()
  const pointPositions = new Float32Array(220 * 3)
  for (let index = 0; index < 220; index += 1) {
    const radius = 2.6 + Math.random() * 7.4
    const angle = Math.random() * TAU
    pointPositions[index * 3] = Math.cos(angle) * radius
    pointPositions[index * 3 + 1] = -1.4 + Math.random() * 4.8
    pointPositions[index * 3 + 2] = Math.sin(angle) * radius
  }
  pointsGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3))
  const pointsMaterial = new THREE.PointsMaterial({
    color: '#e5f7ff',
    size: 0.06,
    transparent: true,
    opacity: 0.62,
    sizeAttenuation: true,
  })
  const particles = new THREE.Points(pointsGeometry, pointsMaterial)
  root.add(particles)

  const ambientLight = new THREE.AmbientLight('#ffffff', STAGES[0].ambient)
  scene.add(ambientLight)

  const keyLight = new THREE.DirectionalLight('#ffffff', STAGES[0].key)
  keyLight.position.set(7.5, 10.5, 6)
  scene.add(keyLight)

  const rimLight = new THREE.DirectionalLight('#a8dfff', STAGES[0].rim)
  rimLight.position.set(-8, 5.6, -9)
  scene.add(rimLight)

  const alertLight = new THREE.PointLight('#ff7a49', 0.7, 24, 2)
  alertLight.position.set(3.1, 1.8, 1.6)
  scene.add(alertLight)

  const stageTargetCamera = new THREE.Vector3(...STAGES[0].camera)
  const stageCurrentCamera = stageTargetCamera.clone()
  const stageTargetLook = new THREE.Vector3(...STAGES[0].target)
  const stageCurrentLook = stageTargetLook.clone()
  const targetBackground = stageColor.clone()
  const targetFog = fogColor.clone()

  const pointer = new THREE.Vector2()
  let currentStage: StageKey = 0
  let dormant = false
  let boostLevel = 0

  function onPointerMove(event: PointerEvent) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1
  }

  window.addEventListener('pointermove', onPointerMove)

  function setStage(stage: number) {
    currentStage = Math.max(0, Math.min(5, stage)) as StageKey
  }

  function resize(nextWidth: number, nextHeight: number, nextPixelRatio: number) {
    camera.aspect = nextWidth / Math.max(nextHeight, 1)
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(nextPixelRatio, 2))
    renderer.setSize(nextWidth, nextHeight, false)
  }

  function boost() {
    boostLevel = 1.2
  }

  function frame() {
    const delta = Math.min(clock.getDelta(), 0.033)
    const elapsed = clock.elapsedTime
    const config = STAGES[currentStage]

    targetBackground.set(config.background)
    targetFog.set(config.fog)
    stageColor.lerp(targetBackground, damp(0, 1, 5.8, delta))
    fogColor.lerp(targetFog, damp(0, 1, 5.8, delta))

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(fogColor)
      scene.fog.density = damp(scene.fog.density, config.fogDensity, 5.8, delta)
    }

    ambientLight.intensity = damp(ambientLight.intensity, config.ambient, 4.8, delta)
    keyLight.intensity = damp(keyLight.intensity, config.key, 4.8, delta)
    rimLight.intensity = damp(rimLight.intensity, config.rim, 4.8, delta)
    alertLight.intensity = damp(alertLight.intensity, 0.9 + config.alertOpacity * 3.2 + boostLevel * 2.1, 6.5, delta)
    alertLight.color.lerp(new THREE.Color(config.alert), damp(0, 1, 5.8, delta))

    const parallaxX = reducedMotion || dormant ? 0 : pointer.x * 0.55
    const parallaxY = reducedMotion || dormant ? 0 : pointer.y * 0.35
    stageTargetCamera.set(
      config.camera[0] + parallaxX,
      config.camera[1] - parallaxY * 0.45,
      config.camera[2]
    )
    stageTargetLook.set(config.target[0], config.target[1], config.target[2])

    dampVector3(stageCurrentCamera, stageTargetCamera, dormant ? 2.8 : 5.2, delta)
    dampVector3(stageCurrentLook, stageTargetLook, dormant ? 2.4 : 4.8, delta)
    camera.position.copy(stageCurrentCamera)
    camera.lookAt(stageCurrentLook)

    renderer.toneMappingExposure = damp(
      renderer.toneMappingExposure,
      1.04 + config.coreGlow * 0.06 + boostLevel * 0.03,
      4.4,
      delta
    )

    floorMaterial.opacity = damp(floorMaterial.opacity, config.floorOpacity, 5, delta)
    grid.material.opacity = damp(
      Array.isArray(grid.material) ? grid.material[0].opacity : grid.material.opacity,
      0.18 + config.floorOpacity * 0.16,
      5,
      delta
    )

    contourRings.forEach((ring, index) => {
      const material = ring.material as THREE.MeshBasicMaterial
      material.color.lerp(new THREE.Color(config.accent), damp(0, 1, 4.8, delta))
      material.opacity = damp(material.opacity, config.ringOpacity - index * 0.04, 5.4, delta)
      ring.rotation.z += delta * (0.06 + index * 0.02) * (index % 2 === 0 ? 1 : -1)
    })

    sliceNodes.forEach((slice, index) => {
      slice.mesh.rotation.y += delta * (0.06 + index * 0.015)
      const pulse = reducedMotion ? 0 : Math.sin(elapsed * 0.9 + slice.offset) * 0.06
      slice.mesh.position.y = -0.98 + index * 0.35 + pulse + config.coreGlow * 0.08 + boostLevel * 0.05
      slice.edge.position.copy(slice.mesh.position)
      slice.edge.rotation.copy(slice.mesh.rotation)

      const material = slice.mesh.material as THREE.MeshStandardMaterial
      material.emissive.lerp(new THREE.Color(config.accent), damp(0, 1, 5, delta))
      material.emissiveIntensity = damp(
        material.emissiveIntensity,
        0.28 + config.coreGlow * 0.62 + boostLevel * 0.22,
        5,
        delta
      )
      edgeMaterials[index].color.lerp(new THREE.Color(config.accent), damp(0, 1, 5, delta))
      edgeMaterials[index].opacity = damp(
        edgeMaterials[index].opacity,
        0.18 + config.coreGlow * 0.18 + boostLevel * 0.1,
        5,
        delta
      )
    })

    shards.forEach((shard, index) => {
      const swing = reducedMotion ? 0 : Math.sin(elapsed * 1.2 + index) * 0.2
      shard.position.y = -0.15 + (index % 3) * 0.34 + swing + config.coreGlow * 0.14
      shard.rotation.y += delta * (0.18 + index * 0.01)
    })
    shardMaterial.emissive.lerp(new THREE.Color(config.accent), damp(0, 1, 5, delta))
    shardMaterial.opacity = damp(shardMaterial.opacity, 0.62 + config.coreGlow * 0.18, 5, delta)
    shardMaterial.emissiveIntensity = damp(
      shardMaterial.emissiveIntensity,
      0.8 + config.coreGlow * 0.9 + boostLevel * 0.4,
      5,
      delta
    )

    towerNodes.forEach((tower, index) => {
      const bob = reducedMotion ? 0 : Math.sin(elapsed * 1.05 + index * 0.9) * 0.12
      tower.head.position.y = 3.8 + (index % 3) * 1.2 + bob
      tower.halo.position.y = tower.head.position.y - 0.2
      tower.halo.scale.setScalar(1 + Math.sin(elapsed * 1.4 + index) * 0.14 + config.ringOpacity * 0.45)

      ;(tower.head.material as THREE.MeshBasicMaterial).color.lerp(
        new THREE.Color(config.accent),
        damp(0, 1, 5, delta)
      )
      ;(tower.beam.material as THREE.MeshBasicMaterial).color.lerp(
        new THREE.Color(config.accent),
        damp(0, 1, 5, delta)
      )
      ;(tower.halo.material as THREE.MeshBasicMaterial).color.lerp(
        new THREE.Color(config.accent),
        damp(0, 1, 5, delta)
      )
      ;(tower.beam.material as THREE.MeshBasicMaterial).opacity = damp(
        (tower.beam.material as THREE.MeshBasicMaterial).opacity,
        config.beamOpacity + boostLevel * 0.1,
        5,
        delta
      )
      ;(tower.halo.material as THREE.MeshBasicMaterial).opacity = damp(
        (tower.halo.material as THREE.MeshBasicMaterial).opacity,
        config.ringOpacity * 0.72 + boostLevel * 0.06,
        5,
        delta
      )
    })

    linkMaterial.color.lerp(new THREE.Color(config.accent), damp(0, 1, 5, delta))
    linkNodes.forEach((link) => {
      ;(link.mesh.material as THREE.MeshBasicMaterial).opacity = damp(
        (link.mesh.material as THREE.MeshBasicMaterial).opacity,
        config.linkOpacity + boostLevel * 0.08,
        5,
        delta
      )
      const progress = (elapsed * (reducedMotion ? 0.04 : 0.12) + link.offset + boostLevel * 0.06) % 1
      link.pulse.position.copy(link.curve.getPoint(progress))
      ;(link.pulse.material as THREE.MeshBasicMaterial).color.lerp(
        new THREE.Color(config.accent),
        damp(0, 1, 5, delta)
      )
      ;(link.pulse.material as THREE.MeshBasicMaterial).opacity = 0.46 + config.linkOpacity * 0.7
    })

    bladeMaterial.color.lerp(new THREE.Color(config.accent), damp(0, 1, 4.5, delta))
    bladeMaterial.emissive.lerp(new THREE.Color(config.accent), damp(0, 1, 4.5, delta))
    bladeMaterial.opacity = damp(bladeMaterial.opacity, config.bladeOpacity, 5, delta)
    bladeNodes.forEach((blade, index) => {
      const sway = reducedMotion ? 0 : Math.sin(elapsed * 0.7 + blade.offset) * 0.18
      blade.mesh.position.y = 0.4 + sway
      blade.mesh.scale.y = 0.92 + Math.sin(elapsed * 1.1 + index) * 0.12 + config.bladeOpacity * 0.4
      blade.mesh.rotation.y += delta * (0.04 + index * 0.005)
    })

    panelMaterial.color.lerp(new THREE.Color(config.accent), damp(0, 1, 5, delta))
    panelMaterial.opacity = damp(panelMaterial.opacity, 0.08 + config.bladeOpacity * 0.14, 5, delta)
    panelEdgesMaterial.color.lerp(new THREE.Color(config.accent), damp(0, 1, 5, delta))
    panelEdgesMaterial.opacity = damp(
      panelEdgesMaterial.opacity,
      0.18 + config.bladeOpacity * 0.16,
      5,
      delta
    )
    panelGroup.rotation.y += delta * 0.06

    alertRingMaterial.color.lerp(new THREE.Color(config.alert), damp(0, 1, 5, delta))
    alertRingMaterial.opacity = damp(alertRingMaterial.opacity, config.alertOpacity + boostLevel * 0.08, 5, delta)
    alertRing.scale.setScalar(1 + Math.sin(elapsed * 1.8) * 0.03 + boostLevel * 0.02)

    sweepMaterial.color.lerp(new THREE.Color(config.alert), damp(0, 1, 5, delta))
    sweepMaterial.opacity = damp(sweepMaterial.opacity, config.alertOpacity * 0.42 + boostLevel * 0.08, 5, delta)
    sweep.rotation.z -= delta * (0.45 + boostLevel * 0.3)

    pointsMaterial.opacity = damp(pointsMaterial.opacity, 0.34 + config.coreGlow * 0.22, 5, delta)
    pointsMaterial.color.lerp(new THREE.Color(config.accent), damp(0, 1, 5, delta))
    particles.rotation.y += delta * 0.04

    boostLevel = Math.max(0, boostLevel - delta * 0.68)
    renderer.render(scene, camera)
  }

  function destroy() {
    window.removeEventListener('pointermove', onPointerMove)

    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()

    root.traverse((object) => {
      const maybeMesh = object as THREE.Mesh
      if (maybeMesh.geometry) {
        geometries.add(maybeMesh.geometry)
      }

      const material = maybeMesh.material
      if (Array.isArray(material)) {
        material.forEach((entry) => materials.add(entry))
      } else if (material) {
        materials.add(material)
      }
    })

    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    scene.remove(root)
    scene.remove(ambientLight)
    scene.remove(keyLight)
    scene.remove(rimLight)
    scene.remove(alertLight)
  }

  return {
    setStage,
    setDormant(nextDormant: boolean) {
      dormant = nextDormant
      if (dormant) {
        pointer.set(0, 0)
      }
    },
    boost,
    frame,
    resize,
    destroy,
  }
}
