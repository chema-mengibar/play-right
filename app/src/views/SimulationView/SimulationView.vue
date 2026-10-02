<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RINKS, toRinkCoordinates } from '../../config/rink-dimensions.js'
import { drawGoalieCoverageCone, drawOpenSpaceHeatMap, drawPassingLanes, drawPlayerAreas, drawTeamsAreas, removeTeamsAreas } from '../../services/AnalyticsService.js'

const gamesEndpoint = '/api/games'
const host = ref(null)
let renderer
let scene
let camera
let orbitControls
let frame
let resizeObserver
let dynamicGroup
let rinkModel
let gridGroup
let rulerGroup
let shotLineGroup
let analyticsGroup
let cameraDirectionMarker
let resultPlayerMarker
let baseLookTarget = new THREE.Vector3()
let cameraBaseYaw = 0
let cameraYaw = 0
let lastFrameTime = 0
let hudInteractionActive = false
let hudHoverActive = false
let savedOrbitCameraState = null
const cameraProfiles = {
  firstPerson: { fov: 65, near: 0.03, far: 160 },
  orbit: { fov: 45, near: 0.1, far: 220 },
}
const rinkSurfaceMaterial = new THREE.MeshStandardMaterial({
  color: 0xe9f4f8,
  roughness: 0.48,
  metalness: 0.02,
  side: THREE.DoubleSide,
})
const rinkWallMaterial = new THREE.MeshStandardMaterial({
  color: 0xd7d3c8,
  roughness: 0.72,
  side: THREE.DoubleSide,
})
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const pressedKeys = new Set()
const cameraYawSpeed = Math.PI * 1.1
const cameraMoveSpeed = 5
const floorLineY = 0.08
const disposables = []
const playerPositions = new Map()
const currentGame = ref(null)
const currentFile = ref('')
const gameList = ref([])
const showGamePicker = ref(false)
const showTopView = ref(true)
const showGoalOverlay = ref(true)
const showGrid = ref(false)
const freeCamera = ref(false)
const showRuler = ref(false)
const showShotLines = ref(false)
const showAnalyticsMenu = ref(false)
const analyticsTeamAreas = ref([])
const analyticsPlayerAreas = ref([])
const analyticsHeatMap = ref([])
const analyticsPassingLanes = ref([])
const analyticsGoalieCoverage = ref([])
const cartoonMode = ref(false)
const goalieLateral = ref(0)
const goalieDepth = ref(0)
const goalieRotation = ref(-24)
const result = ref(null)
const decisionStartedAt = ref(0)
const decisionTime = ref('0.0')
const now = ref(0)
const cameraMapBaseDegrees = ref(0)
const cameraYawDegrees = ref(0)
const elapsedSeconds = computed(() => decisionStartedAt.value ? ((now.value - decisionStartedAt.value) / 1000).toFixed(1) : '0.0')
const cameraTeam = computed(() => currentGame.value?.camera_player_id?.startsWith('home_') ? 'home' : 'guest')
const goalieSideMeters = computed(() => goalieLateral.value * creaseWidth * 0.75)
const goalieDepthMeters = computed(() => rinkPlacementPadding + goalieDepth.value * creaseDepth)
const goalieRotationDegrees = computed(() => goalieRotation.value)
const formatMeters = (value) => `${value.toFixed(2)} m`
const formatDegrees = (value) => `${Math.round(value)} deg`
const sceneTheme = {
  real: {
    background: 0x151a20,
    fog: 0x151a20,
    surface: 0xe9f4f8,
    wall: 0xd7d3c8,
    roughness: 0.48,
  },
  cartoon: {
    background: 0xbfe9ff,
    fog: 0xbfe9ff,
    surface: 0xf6fbff,
    wall: 0x34b3ff,
    roughness: 0.82,
  },
}

const defaultGame = () => ({
  players: [
    { id: 'home_goalie', x: 0, y: -0.88 },
    { id: 'home_1', x: 0, y: -0.06 },
    { id: 'home_2', x: 0.62, y: -0.05 },
    { id: 'home_3', x: -0.62, y: -0.05 },
    { id: 'home_4', x: 0, y: -0.36 },
    { id: 'guest_goalie', x: 0, y: 0.88 },
    { id: 'guest_1', x: 0, y: 0.06 },
    { id: 'guest_2', x: -0.62, y: 0.05 },
    { id: 'guest_3', x: 0.62, y: 0.05 },
    { id: 'guest_4', x: 0, y: 0.36 },
  ],
})

const disposeLater = (...items) => {
  disposables.push(...items.filter(Boolean))
}

const assetUrl = (style, team) => `${import.meta.env.BASE_URL}assets/${style}_team_${team}.png`
const rinkUrl = `${import.meta.env.BASE_URL}assets/rink.glb`
const spriteSheet = { columns: 4, rows: 3 }
const playerSpriteSize = 1.6
const rinkPlacementPadding = playerSpriteSize / 2
const playerSpriteCenterY = playerSpriteSize / 2
const rinkMapSvg = { width: 190, height: 330 }
const feetToWorld = RINKS.standard.width / 200
const goalLineFromEnd = 11 * feetToWorld
const blueLineFromEnd = 75 * feetToWorld
const endZoneFaceoffFromEnd = 31 * feetToWorld
const endZoneFaceoffOffset = 22 * feetToWorld
const faceoffCircleRadius = 15 * feetToWorld
const faceoffDotRadius = 1 * feetToWorld
const playerAreaRadius = 2
const creaseWidth = 8 * feetToWorld
const creaseDepth = 6 * feetToWorld
const spriteTileForPlayer = (id) => {
  if (id.endsWith('_goalie')) return { column: 0, row: 2 }
  const number = Math.max(1, Number(id.split('_')[1]) || 1)
  const index = (number - 1) % (spriteSheet.columns * spriteSheet.rows)
  return { column: index % spriteSheet.columns, row: Math.floor(index / spriteSheet.columns) }
}

function cropTexture(texture, { column, row }) {
  const cropped = texture.clone()
  cropped.needsUpdate = true
  cropped.repeat.set(1 / spriteSheet.columns, 1 / spriteSheet.rows)
  cropped.offset.set(column / spriteSheet.columns, 1 - (row + 1) / spriteSheet.rows)
  return cropped
}

const fromSvg = (x, y) => ({
  x: (y / 500 - 0.5) * RINKS.standard.width,
  z: -(x / 250 - 0.5) * RINKS.standard.height,
})

const homeGoalLine = { x: -RINKS.standard.width / 2 + goalLineFromEnd, z: 0 }
const guestGoalLine = { x: RINKS.standard.width / 2 - goalLineFromEnd, z: 0 }
const homeBlueLine = { x: -RINKS.standard.width / 2 + blueLineFromEnd, z: 0 }
const guestBlueLine = { x: RINKS.standard.width / 2 - blueLineFromEnd, z: 0 }
const endZoneFaceoffCenters = [
  { x: -RINKS.standard.width / 2 + endZoneFaceoffFromEnd, z: -endZoneFaceoffOffset },
  { x: -RINKS.standard.width / 2 + endZoneFaceoffFromEnd, z: endZoneFaceoffOffset },
  { x: RINKS.standard.width / 2 - endZoneFaceoffFromEnd, z: -endZoneFaceoffOffset },
  { x: RINKS.standard.width / 2 - endZoneFaceoffFromEnd, z: endZoneFaceoffOffset },
]

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function toPaddedRinkCoordinates(point) {
  if (point.id === 'home_goalie') return goalieRinkPosition('home')
  if (point.id === 'guest_goalie') return goalieRinkPosition('guest')

  const position = toRinkCoordinates(point, RINKS.standard)
  return {
    x: clamp(position.x, -RINKS.standard.width / 2 + rinkPlacementPadding, RINKS.standard.width / 2 - rinkPlacementPadding),
    y: clamp(position.y, -RINKS.standard.height / 2 + rinkPlacementPadding, RINKS.standard.height / 2 - rinkPlacementPadding),
  }
}

function goalieRinkPosition(team) {
  const direction = team === 'home' ? 1 : -1
  const goalLine = team === 'home' ? homeGoalLine : guestGoalLine
  const maxLateral = creaseWidth * 0.75
  return {
    x: goalLine.x + direction * (rinkPlacementPadding + goalieDepth.value * creaseDepth),
    y: goalieLateral.value * maxLateral,
  }
}

function rinkWorldToMapPoint(position) {
  return {
    x: 50 + (position.z / (RINKS.standard.height / 2)) * 45,
    y: 50 - (position.x / (RINKS.standard.width / 2)) * 45,
  }
}

function rinkWorldToFullMapPoint(position) {
  return {
    x: 50 + (position.z / (RINKS.standard.height / 2)) * 50,
    y: 50 - (position.x / (RINKS.standard.width / 2)) * 50,
  }
}

function gamePointToMapPoint(point) {
  if (point.position) return rinkWorldToMapPoint(point.position)
  const livePosition = point.id ? playerPositions.get(point.id) : null
  if (livePosition) return rinkWorldToMapPoint(livePosition)
  return {
    x: 50 - point.x * 45,
    y: 50 - point.y * 45,
  }
}

function mapPointToRinkSvgPoint(point) {
  return {
    x: point.x / 100 * rinkMapSvg.width,
    y: point.y / 100 * rinkMapSvg.height,
  }
}

function gamePointToRinkSvgPoint(point) {
  return mapPointToRinkSvgPoint(gamePointToMapPoint(point))
}

function cameraMapTransformForPlayer(player) {
  const point = gamePointToRinkSvgPoint(player)
  return `translate(${point.x} ${point.y}) rotate(${cameraMapBaseDegrees.value - cameraYawDegrees.value})`
}

function mapGoalCreasePath(goalLine, direction) {
  const center = rinkWorldToMapPoint(goalLine)
  const width = (creaseWidth / RINKS.standard.height) * 90
  const radiusX = (creaseDepth / RINKS.standard.height) * 90
  const radiusY = (creaseDepth / RINKS.standard.width) * 90
  const realSideDepth = Math.sqrt(creaseDepth ** 2 - (creaseWidth / 2) ** 2)
  const sideDepth = (realSideDepth / RINKS.standard.width) * 90
  const endY = direction > 0 ? center.y - sideDepth : center.y + sideDepth
  const sweep = direction > 0 ? 0 : 1
  return `M ${center.x - width / 2} ${center.y} L ${center.x - width / 2} ${endY} A ${radiusX} ${radiusY} 0 0 ${sweep} ${center.x + width / 2} ${endY} L ${center.x + width / 2} ${center.y} Z`
}

function rinkSvgGoalCreasePath(goalLine, direction) {
  const center = mapPointToRinkSvgPoint(rinkWorldToFullMapPoint(goalLine))
  const width = (creaseWidth / RINKS.standard.height) * rinkMapSvg.width
  const radiusX = (creaseDepth / RINKS.standard.height) * rinkMapSvg.width
  const radiusY = (creaseDepth / RINKS.standard.width) * rinkMapSvg.height
  const realSideDepth = Math.sqrt(creaseDepth ** 2 - (creaseWidth / 2) ** 2)
  const sideDepth = (realSideDepth / RINKS.standard.width) * rinkMapSvg.height
  const endY = direction > 0 ? center.y - sideDepth : center.y + sideDepth
  const sweep = direction > 0 ? 0 : 1
  return `M ${center.x - width / 2} ${center.y} L ${center.x - width / 2} ${endY} A ${radiusX} ${radiusY} 0 0 ${sweep} ${center.x + width / 2} ${endY} L ${center.x + width / 2} ${center.y} Z`
}

function mapCircleRadius(radius) {
  return {
    x: (radius / RINKS.standard.height) * 100,
    y: (radius / RINKS.standard.width) * 100,
  }
}

function rinkSvgCenterCircle() {
  const radius = mapCircleRadius(faceoffCircleRadius)
  return {
    center: mapPointToRinkSvgPoint(rinkWorldToFullMapPoint({ x: 0, z: 0 })),
    radius: {
      x: radius.x / 100 * rinkMapSvg.width,
      y: radius.y / 100 * rinkMapSvg.height,
    },
  }
}

function rinkSvgCircle(center, radius) {
  const mapRadius = mapCircleRadius(radius)
  return {
    center: mapPointToRinkSvgPoint(rinkWorldToFullMapPoint(center)),
    radius: {
      x: mapRadius.x / 100 * rinkMapSvg.width,
      y: mapRadius.y / 100 * rinkMapSvg.height,
    },
  }
}

function rinkSvgPoint(position) {
  return mapPointToRinkSvgPoint(rinkWorldToFullMapPoint(position))
}

function rinkSvgPoints(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function analyticsTeamClass(team) {
  return `simulation-map__analytics-area simulation-map__analytics-area--${team}`
}

function analyticsPlayerAreaClass(team) {
  return `simulation-map__analytics-player-area simulation-map__analytics-player-area--${team}`
}

function heatMapCellStyle(cell) {
  const hue = 8 + cell.score * 138
  const alpha = 0.18 + cell.score * 0.34
  return {
    fill: `hsla(${hue}, 88%, 48%, ${alpha})`,
  }
}

function passingLaneClass(status) {
  return `simulation-map__passing-lane simulation-map__passing-lane--${status}`
}

function goalieCoverageClass(status) {
  return `simulation-map__goalie-coverage simulation-map__goalie-coverage--${status}`
}

function closeupGoalieTransform(team) {
  const position = goalieRinkPosition(team)
  const map = rinkWorldToCreaseCloseupPoint({ x: position.x, z: position.y }, team)
  const rotation = team === 'home' ? goalieRotation.value : 180 - goalieRotation.value
  return `translate(${map.x} ${map.y}) rotate(${rotation})`
}

function goalieWorldYaw(team) {
  const base = team === 'home' ? Math.PI / 2 : -Math.PI / 2
  return base - THREE.MathUtils.degToRad(goalieRotation.value)
}

function closeupGoalCreasePath() {
  const centerX = 50
  const goalLineY = 9
  const width = 48
  const radius = width * (creaseDepth / creaseWidth)
  const halfWidth = width / 2
  const sideDepth = Math.sqrt(radius ** 2 - halfWidth ** 2)
  const endY = goalLineY + sideDepth
  return `M ${centerX - halfWidth} ${goalLineY} V ${endY} A ${radius} ${radius} 0 0 0 ${centerX + halfWidth} ${endY} V ${goalLineY} Z`
}

function rinkWorldToCreaseCloseupPoint(position, team = 'home') {
  const goalLine = team === 'home' ? homeGoalLine : guestGoalLine
  const direction = team === 'home' ? 1 : -1
  const cageY = 9
  const lateralScale = 36 / creaseWidth
  const depthScale = 62 / (rinkPlacementPadding + creaseDepth)
  const lateral = position.z
  const depth = (position.x - goalLine.x) * direction
  return {
    x: 50 + lateral * lateralScale,
    y: cageY + depth * depthScale,
  }
}

function cameraPlayerMapPoint() {
  const id = currentGame.value?.camera_player_id
  const position = id ? playerPositions.get(id) : null
  return position ? rinkWorldToMapPoint(position) : null
}

function creaseCloseupShotSegments() {
  if (!showShotLines.value || !currentGame.value) return []
  const id = currentGame.value.camera_player_id
  const position = id ? playerPositions.get(id) : null
  if (!position) return []
  const team = id.startsWith('home_') ? 'guest' : 'home'
  const start = rinkWorldToCreaseCloseupPoint(position, team)
  const goalLine = team === 'home' ? homeGoalLine : guestGoalLine
  const goalWidth = 1.83
  return [
    rinkWorldToCreaseCloseupPoint({ x: goalLine.x, z: -goalWidth / 2 }, team),
    rinkWorldToCreaseCloseupPoint({ x: goalLine.x, z: goalWidth / 2 }, team),
  ].map((end) => ({ start, end }))
}

function shotLineMapSegments() {
  if (!showShotLines.value || !currentGame.value) return []
  const start = cameraPlayerMapPoint()
  if (!start) return []
  const goal = opponentGoalForCameraPlayer()
  const goalWidth = 1.83
  return [
    rinkWorldToMapPoint({ x: goal.x, z: goal.z - goalWidth / 2 }),
    rinkWorldToMapPoint({ x: goal.x, z: goal.z + goalWidth / 2 }),
  ].map((end) => ({ start, end }))
}

function clampRinkPosition(x, z) {
  return {
    x: clamp(x, -RINKS.standard.width / 2 + rinkPlacementPadding, RINKS.standard.width / 2 - rinkPlacementPadding),
    z: clamp(z, -RINKS.standard.height / 2 + rinkPlacementPadding, RINKS.standard.height / 2 - rinkPlacementPadding),
  }
}

function createFloorRect(center, size, material, y = 0.025) {
  const geometry = new THREE.PlaneGeometry(size.width, size.height)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(center.x, y, center.z)
  mesh.renderOrder = 5
  return mesh
}

function createFloorCircle(center, radius, material, y = 0.026, segments = 64) {
  const geometry = new THREE.CircleGeometry(radius, segments)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(center.x, y, center.z)
  mesh.renderOrder = 6
  return mesh
}

function createFloorRing(center, radius, thickness, material, y = 0.027, segments = 96) {
  const geometry = new THREE.RingGeometry(radius - thickness / 2, radius + thickness / 2, segments)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(center.x, y, center.z)
  mesh.renderOrder = 6
  return mesh
}

function createGoalCrease(goalLine, direction, fillMaterial, outlineMaterial) {
  const feetToWorld = RINKS.standard.width / 200
  const width = 8 * feetToWorld
  const radius = 6 * feetToWorld
  const outline = 2 / 12 * feetToWorld
  const sideDepth = Math.sqrt(radius ** 2 - (width / 2) ** 2)

  const createShape = (padding = 0) => {
    const halfWidth = width / 2 + padding
    const arcRadius = radius + padding
    const arcStart = Math.asin(halfWidth / arcRadius)
    const startAngle = direction > 0 ? -arcStart : Math.PI + arcStart
    const endAngle = direction > 0 ? arcStart : Math.PI - arcStart
    const shape = new THREE.Shape()
    shape.moveTo(0, -halfWidth)
    shape.lineTo(direction * sideDepth, -halfWidth)
    shape.absarc(0, 0, arcRadius, startAngle, endAngle, direction < 0)
    shape.lineTo(0, halfWidth)
    shape.lineTo(0, -halfWidth)
    return shape
  }

  const group = new THREE.Group()
  const outlineMesh = new THREE.Mesh(new THREE.ShapeGeometry(createShape(outline)), outlineMaterial)
  const fillMesh = new THREE.Mesh(new THREE.ShapeGeometry(createShape()), fillMaterial)
  for (const [index, mesh] of [outlineMesh, fillMesh].entries()) {
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(goalLine.x, 0.031 + index * 0.001, goalLine.z)
    mesh.renderOrder = 7 + index
    group.add(mesh)
  }
  return group
}

async function loadRandomGame() {
  try {
    const games = await fetchGameList()
    if (!games.length) return defaultGame()
    const selected = games[Math.floor(Math.random() * games.length)]
    const file = typeof selected === 'string' ? selected : selected.file
    return loadGameByFile(file)
  } catch {
    return defaultGame()
  }
}

async function fetchGameList() {
  const response = await fetch(gamesEndpoint)
  if (!response.ok) return []
  const games = (await response.json()).games ?? []
  gameList.value = games.map((game) => (typeof game === 'string' ? { file: game, name: game } : game))
  return gameList.value
}

async function loadGameByFile(file) {
  const gameResponse = await fetch(`${gamesEndpoint}?file=${encodeURIComponent(file)}`)
  const game = gameResponse.ok ? { ...defaultGame(), ...(await gameResponse.json()) } : defaultGame()
  return { ...game, file }
}

async function openGamePicker() {
  gameList.value = await fetchGameList()
  showGamePicker.value = true
}

function closeGamePicker() {
  showGamePicker.value = false
}

function disposeObject(object) {
  object.traverse?.((child) => {
    child.geometry?.dispose?.()
    child.material?.map?.dispose?.()
    child.material?.dispose?.()
  })
}

function clearGroup(group) {
  if (!group) return
  for (const child of [...group.children]) {
    group.remove(child)
    disposeObject(child)
  }
}

function applySceneTheme() {
  if (!scene) return
  const theme = cartoonMode.value ? sceneTheme.cartoon : sceneTheme.real
  scene.background = new THREE.Color(theme.background)
  scene.fog = new THREE.Fog(theme.fog, cartoonMode.value ? 34 : 28, cartoonMode.value ? 92 : 82)
  rinkSurfaceMaterial.color.setHex(theme.surface)
  rinkSurfaceMaterial.roughness = theme.roughness
  rinkSurfaceMaterial.metalness = cartoonMode.value ? 0 : 0.02
  rinkWallMaterial.color.setHex(theme.wall)
  rinkWallMaterial.roughness = cartoonMode.value ? 0.55 : 0.72
  rinkSurfaceMaterial.needsUpdate = true
  rinkWallMaterial.needsUpdate = true
}

function applyCameraProfile(profile) {
  if (!camera) return
  camera.fov = profile.fov
  camera.near = profile.near
  camera.far = profile.far
  camera.updateProjectionMatrix()
}

function ensureGridGroup() {
  if (gridGroup) return gridGroup
  gridGroup = new THREE.Group()
  gridGroup.visible = showGrid.value
  scene.add(gridGroup)
  return gridGroup
}

function createGrid() {
  const group = ensureGridGroup()
  clearGroup(group)
  const squareSize = 2
  const cols = Math.floor(RINKS.standard.width / squareSize)
  const rows = Math.floor(RINKS.standard.height / squareSize)
  const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  disposeLater(material)
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      if ((col + row) % 2 === 0) continue
      const geometry = new THREE.PlaneGeometry(squareSize, squareSize)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(-RINKS.standard.width / 2 + squareSize / 2 + col * squareSize, 0.018, -RINKS.standard.height / 2 + squareSize / 2 + row * squareSize)
      mesh.renderOrder = 3
      group.add(mesh)
    }
  }
}

function toggleGrid() {
  showGrid.value = !showGrid.value
  createGrid()
  gridGroup.visible = showGrid.value
}

function setFreeCamera(enabled) {
  if (!orbitControls) return
  const wasFreeCamera = freeCamera.value
  if (wasFreeCamera && !enabled && camera && orbitControls) {
    savedOrbitCameraState = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      target: orbitControls.target.clone(),
    }
  }
  freeCamera.value = enabled
  pressedKeys.clear()
  if (enabled) {
    applyCameraProfile(cameraProfiles.orbit)
    if (savedOrbitCameraState) {
      camera.position.copy(savedOrbitCameraState.position)
      camera.quaternion.copy(savedOrbitCameraState.quaternion)
      orbitControls.target.copy(savedOrbitCameraState.target)
    } else {
      camera.position.set(0, 26, 39)
      orbitControls.target.set(0, 0.8, 0)
    }
    orbitControls.enabled = true
    orbitControls.update()
    return
  }
  orbitControls.enabled = false
  applyCameraProfile(cameraProfiles.firstPerson)
  if (currentGame.value) positionCamera(currentGame.value)
}

function toggleFreeCamera() {
  setFreeCamera(!freeCamera.value)
}

function beginHudInteraction() {
  hudInteractionActive = true
  if (orbitControls) orbitControls.enabled = false
}

function endHudInteraction() {
  hudInteractionActive = false
  if (orbitControls && !hudHoverActive) orbitControls.enabled = freeCamera.value
}

function enterHudInteraction() {
  hudHoverActive = true
  if (orbitControls) orbitControls.enabled = false
}

function leaveHudInteraction() {
  hudHoverActive = false
  if (orbitControls && !hudInteractionActive) orbitControls.enabled = freeCamera.value
}

function stopHudEvent(event) {
  event.stopPropagation()
}

function ensureRulerGroup() {
  if (rulerGroup) return rulerGroup
  rulerGroup = new THREE.Group()
  scene.add(rulerGroup)
  return rulerGroup
}

function playerWorldPosition(playerId) {
  const position = playerPositions.get(playerId)
  return position ? new THREE.Vector3(position.x, playerSpriteCenterY, position.z) : null
}

function isVisibleFromCamera(position) {
  if (!camera) return false
  const projected = position.clone().project(camera)
  return projected.x >= -1 && projected.x <= 1 && projected.y >= -1 && projected.y <= 1 && projected.z >= -1 && projected.z <= 1
}

function createDistanceLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 56
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgba(20, 20, 20, 0.82)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#ffffff'
  context.font = '700 28px Inter, Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  disposeLater(texture, material)
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(0.72, 0.25, 1)
  sprite.renderOrder = 50
  return sprite
}

function ensureShotLineGroup() {
  if (shotLineGroup) return shotLineGroup
  shotLineGroup = new THREE.Group()
  scene.add(shotLineGroup)
  return shotLineGroup
}

function ensureAnalyticsGroup() {
  if (analyticsGroup) return analyticsGroup
  analyticsGroup = new THREE.Group()
  scene.add(analyticsGroup)
  return analyticsGroup
}

function clearAnalyticsGroup() {
  clearGroup(analyticsGroup)
}

function heatMapColor(score) {
  return new THREE.Color().setHSL((8 + score * 138) / 360, 0.88, 0.48)
}

function passingLaneColor(status) {
  const colors = {
    clear: 0x31e65d,
    partial: 0xfeb836,
    blocked: 0xd91f32,
  }
  return colors[status] ?? colors.clear
}

function goalieCoverageColor(status) {
  const colors = {
    aligned: 0x31e65d,
    close: 0xfeb836,
    off: 0xd91f32,
  }
  return colors[status] ?? colors.close
}

function addAnalyticsLine(group, start, end, color, opacity, renderOrder = 20) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(start.x, 0.13, start.z),
    new THREE.Vector3(end.x, 0.13, end.z),
  ])
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
  })
  const line = new THREE.Line(geometry, material)
  line.renderOrder = renderOrder
  disposeLater(geometry, material)
  group.add(line)
}

function renderAnalyticsOverlays() {
  const group = ensureAnalyticsGroup()
  clearGroup(group)
  const colors = { home: 0x172f8a, guest: 0xd91f32 }
  for (const cell of analyticsHeatMap.value) {
    const geometry = new THREE.PlaneGeometry(cell.world.width, cell.world.height)
    const material = new THREE.MeshBasicMaterial({
      color: heatMapColor(cell.score),
      transparent: true,
      opacity: 0.18 + cell.score * 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(cell.world.x, 0.055, cell.world.z)
    mesh.renderOrder = 16
    disposeLater(geometry, material)
    group.add(mesh)
  }
  for (const lane of analyticsPassingLanes.value) {
    const start = new THREE.Vector3(lane.worldStart.x, 0.12, lane.worldStart.z)
    const end = new THREE.Vector3(lane.worldEnd.x, 0.12, lane.worldEnd.z)
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end])
    const material = new THREE.LineBasicMaterial({
      color: passingLaneColor(lane.status),
      transparent: true,
      opacity: 0.92,
      depthTest: false,
    })
    const line = new THREE.Line(geometry, material)
    line.renderOrder = 19
    disposeLater(geometry, material)
    group.add(line)
  }
  for (const cone of analyticsGoalieCoverage.value) {
    const coneColor = goalieCoverageColor(cone.status)
    addAnalyticsLine(group, cone.worldApex, cone.worldTarget, coneColor, 0.96, 21)
    addAnalyticsLine(group, cone.worldApex, cone.worldFacing, 0xffffff, 0.74, 22)
    for (const post of cone.worldPosts) addAnalyticsLine(group, cone.worldApex, post, 0x6fb6ff, 0.54, 20)
  }
  for (const area of analyticsPlayerAreas.value) {
    const geometry = new THREE.CircleGeometry(playerAreaRadius, 48)
    const material = new THREE.MeshBasicMaterial({
      color: colors[area.team] ?? 0x31e65d,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(area.world.x, 0.07, area.world.z)
    mesh.renderOrder = 17
    disposeLater(geometry, material)
    group.add(mesh)
  }
  for (const area of analyticsTeamAreas.value) {
    if ((area.worldPoints?.length ?? 0) < 3) continue
    const shape = new THREE.Shape()
    area.worldPoints.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, -point.z)
      else shape.lineTo(point.x, -point.z)
    })
    shape.closePath()
    const geometry = new THREE.ShapeGeometry(shape)
    const material = new THREE.MeshBasicMaterial({
      color: colors[area.team] ?? 0x31e65d,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.065
    mesh.renderOrder = 18
    disposeLater(geometry, material)
    group.add(mesh)
  }
}

function opponentGoalForCameraPlayer() {
  const cameraPlayerId = currentGame.value?.camera_player_id ?? ''
  return cameraPlayerId.startsWith('home_') ? guestGoalLine : homeGoalLine
}

function updateShotLines() {
  if (!showShotLines.value || !currentGame.value) {
    clearGroup(shotLineGroup)
    return
  }
  const group = ensureShotLineGroup()
  clearGroup(group)
  const cameraPlayerId = currentGame.value.camera_player_id
  const startPosition = playerWorldPosition(cameraPlayerId)
  if (!startPosition) return
  const start = startPosition.clone()
  start.y = floorLineY
  const goal = opponentGoalForCameraPlayer()
  const goalWidth = 1.83
  const goalHeight = 1.22
  const corners = [
    new THREE.Vector3(goal.x, goalHeight, goal.z - goalWidth / 2),
    new THREE.Vector3(goal.x, goalHeight, goal.z + goalWidth / 2),
  ]
  const material = new THREE.LineBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.92, depthTest: false })
  disposeLater(material)
  for (const corner of corners) {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, corner])
    const line = new THREE.Line(geometry, material)
    line.renderOrder = 60
    const distance = start.distanceTo(corner)
    const label = createDistanceLabel(`${distance.toFixed(1)} m`)
    label.position.copy(start.clone().lerp(corner, 0.5)).add(new THREE.Vector3(0, 0.28, 0))
    group.add(line, label)
  }
}

function toggleShotLines() {
  showShotLines.value = !showShotLines.value
  updateShotLines()
}

function updateRulers() {
  if (!showRuler.value || !currentGame.value) {
    clearGroup(rulerGroup)
    return
  }
  const group = ensureRulerGroup()
  clearGroup(group)
  camera.updateMatrixWorld()
  const material = new THREE.LineBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.72, depthTest: false })
  disposeLater(material)
  const players = (currentGame.value.players ?? [])
    .map((player) => ({ player, position: playerWorldPosition(player.id) }))
    .filter(({ position }) => position)
  const drawnPairs = new Set()

  for (const { player, position: start } of players) {
    const nearest = players
      .filter(({ player: other }) => other.id !== player.id)
      .map(({ player: other, position: end }) => ({
        player: other,
        position: end,
        distance: start.distanceTo(end),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)

    for (const { player: other, position: end, distance } of nearest) {
      if (!isVisibleFromCamera(start) && !isVisibleFromCamera(end)) continue
      const pairKey = [player.id, other.id].sort().join(':')
      if (drawnPairs.has(pairKey)) continue
      drawnPairs.add(pairKey)

      const geometry = new THREE.BufferGeometry().setFromPoints([start, end])
      const line = new THREE.Line(geometry, material)
      line.renderOrder = 49
      const label = createDistanceLabel(`${distance.toFixed(1)} m`)
      label.position.copy(start.clone().lerp(end, 0.5)).add(new THREE.Vector3(0, 0.55, 0))
      group.add(line, label)
    }
  }
}

function toggleRuler() {
  showRuler.value = !showRuler.value
  updateRulers()
}

function toggleAnalyticsMenu() {
  showAnalyticsMenu.value = !showAnalyticsMenu.value
}

function drawAnalyticsTeamsAreas() {
  analyticsTeamAreas.value = drawTeamsAreas({
    players: currentGame.value?.players ?? [],
    playerPositions,
    toSvgPoint: gamePointToRinkSvgPoint,
    getWorldPoint: visualCenterForPlayer,
  })
  renderAnalyticsOverlays()
  showAnalyticsMenu.value = false
}

function clearAnalyticsTeamsAreas() {
  analyticsTeamAreas.value = removeTeamsAreas()
  clearAnalyticsGroup()
  renderAnalyticsOverlays()
  showAnalyticsMenu.value = false
}

function toggleAnalyticsTeamsAreas() {
  if (analyticsTeamAreas.value.length) {
    clearAnalyticsTeamsAreas()
    return
  }
  drawAnalyticsTeamsAreas()
}

function drawAnalyticsPlayerAreas() {
  analyticsPlayerAreas.value = drawPlayerAreas({
    players: currentGame.value?.players ?? [],
    playerPositions,
    toSvgPoint: gamePointToRinkSvgPoint,
    getWorldPoint: visualCenterForPlayer,
  })
  renderAnalyticsOverlays()
  showAnalyticsMenu.value = false
}

function clearAnalyticsPlayerAreas() {
  analyticsPlayerAreas.value = []
  clearAnalyticsGroup()
  renderAnalyticsOverlays()
  showAnalyticsMenu.value = false
}

function toggleAnalyticsPlayerAreas() {
  if (analyticsPlayerAreas.value.length) {
    clearAnalyticsPlayerAreas()
    return
  }
  drawAnalyticsPlayerAreas()
}

function drawAnalyticsHeatMap() {
  analyticsHeatMap.value = drawOpenSpaceHeatMap({
    players: currentGame.value?.players ?? [],
    playerPositions,
    rink: RINKS.standard,
    toSvgPoint: gamePointToRinkSvgPoint,
    getWorldPoint: visualCenterForPlayer,
    activePlayerId: currentGame.value?.camera_player_id,
  })
  renderAnalyticsOverlays()
  showAnalyticsMenu.value = false
}

function clearAnalyticsHeatMap() {
  analyticsHeatMap.value = []
  clearAnalyticsGroup()
  renderAnalyticsOverlays()
  showAnalyticsMenu.value = false
}

function toggleAnalyticsHeatMap() {
  if (analyticsHeatMap.value.length) {
    clearAnalyticsHeatMap()
    return
  }
  drawAnalyticsHeatMap()
}

function drawAnalyticsPassingLanes() {
  analyticsPassingLanes.value = drawPassingLanes({
    players: currentGame.value?.players ?? [],
    playerPositions,
    toSvgPoint: gamePointToRinkSvgPoint,
    getWorldPoint: visualCenterForPlayer,
    activePlayerId: currentGame.value?.possession_player_id || currentGame.value?.camera_player_id,
  })
  renderAnalyticsOverlays()
  showAnalyticsMenu.value = false
}

function clearAnalyticsPassingLanes() {
  analyticsPassingLanes.value = []
  clearAnalyticsGroup()
  renderAnalyticsOverlays()
  showAnalyticsMenu.value = false
}

function toggleAnalyticsPassingLanes() {
  if (analyticsPassingLanes.value.length) {
    clearAnalyticsPassingLanes()
    return
  }
  drawAnalyticsPassingLanes()
}

function drawAnalyticsGoalieCoverage() {
  analyticsGoalieCoverage.value = drawGoalieCoverageCone({
    players: currentGame.value?.players ?? [],
    playerPositions,
    toSvgPoint: gamePointToRinkSvgPoint,
    getWorldPoint: visualCenterForPlayer,
    activePlayerId: currentGame.value?.possession_player_id || currentGame.value?.camera_player_id,
    homeGoalLine,
    guestGoalLine,
    goalWidth: 1.83,
    goalieRotationDegrees: goalieRotation.value,
  })
  renderAnalyticsOverlays()
  showAnalyticsMenu.value = false
}

function clearAnalyticsGoalieCoverage() {
  analyticsGoalieCoverage.value = []
  clearAnalyticsGroup()
  renderAnalyticsOverlays()
  showAnalyticsMenu.value = false
}

function toggleAnalyticsGoalieCoverage() {
  if (analyticsGoalieCoverage.value.length) {
    clearAnalyticsGoalieCoverage()
    return
  }
  drawAnalyticsGoalieCoverage()
}

function refreshAnalyticsOverlays() {
  const hasTeamAreas = analyticsTeamAreas.value.length
  const hasPlayerAreas = analyticsPlayerAreas.value.length
  const hasHeatMap = analyticsHeatMap.value.length
  const hasPassingLanes = analyticsPassingLanes.value.length
  const hasGoalieCoverage = analyticsGoalieCoverage.value.length
  if (hasTeamAreas) {
    analyticsTeamAreas.value = drawTeamsAreas({
      players: currentGame.value?.players ?? [],
      playerPositions,
      toSvgPoint: gamePointToRinkSvgPoint,
      getWorldPoint: visualCenterForPlayer,
    })
  }
  if (hasPlayerAreas) {
    analyticsPlayerAreas.value = drawPlayerAreas({
      players: currentGame.value?.players ?? [],
      playerPositions,
      toSvgPoint: gamePointToRinkSvgPoint,
      getWorldPoint: visualCenterForPlayer,
    })
  }
  if (hasHeatMap) {
    analyticsHeatMap.value = drawOpenSpaceHeatMap({
      players: currentGame.value?.players ?? [],
      playerPositions,
      rink: RINKS.standard,
      toSvgPoint: gamePointToRinkSvgPoint,
      getWorldPoint: visualCenterForPlayer,
      activePlayerId: currentGame.value?.camera_player_id,
    })
  }
  if (hasPassingLanes) {
    analyticsPassingLanes.value = drawPassingLanes({
      players: currentGame.value?.players ?? [],
      playerPositions,
      toSvgPoint: gamePointToRinkSvgPoint,
      getWorldPoint: visualCenterForPlayer,
      activePlayerId: currentGame.value?.possession_player_id || currentGame.value?.camera_player_id,
    })
  }
  if (hasGoalieCoverage) {
    analyticsGoalieCoverage.value = drawGoalieCoverageCone({
      players: currentGame.value?.players ?? [],
      playerPositions,
      toSvgPoint: gamePointToRinkSvgPoint,
      getWorldPoint: visualCenterForPlayer,
      activePlayerId: currentGame.value?.possession_player_id || currentGame.value?.camera_player_id,
      homeGoalLine,
      guestGoalLine,
      goalWidth: 1.83,
      goalieRotationDegrees: goalieRotation.value,
    })
  }
  if (hasTeamAreas || hasPlayerAreas || hasHeatMap || hasPassingLanes || hasGoalieCoverage) renderAnalyticsOverlays()
}

function rebuildCurrentGameVisuals() {
  if (!currentGame.value || !scene) return
  const game = currentGame.value
  if (dynamicGroup) {
    scene.remove(dynamicGroup)
    disposeObject(dynamicGroup)
  }
  dynamicGroup = new THREE.Group()
  scene.add(dynamicGroup)
  playerPositions.clear()
  cameraDirectionMarker = null
  resultPlayerMarker = null
  addPlayers(scene, game)
  addSlots(game)
  addPossessionMarker(game)
  addCameraDirectionMarker(game)
  if (result.value && solutionPlayerId()) addResultPlayerMarker(solutionPlayerId())
  if (!freeCamera.value) positionCamera(game)
  updateRulers()
  updateShotLines()
  refreshAnalyticsOverlays()
}

function toggleCartoonMode() {
  cartoonMode.value = !cartoonMode.value
  applySceneTheme()
  rebuildCurrentGameVisuals()
}

async function addRink(scene) {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(rinkUrl)
  const source = gltf.scene
  const goalMaterial = new THREE.MeshStandardMaterial({ color: 0xd91f32, roughness: 0.65, metalness: 0.05, side: THREE.DoubleSide })
  disposeLater(rinkSurfaceMaterial, rinkWallMaterial, goalMaterial)

  const goalTemplate = source.getObjectByName('goal')
  const floor = source.getObjectByName('rink-place')
  const walls = source.getObjectByName('rink-walls')
  floor?.traverse((child) => {
    if (child.isMesh) {
      child.material = rinkSurfaceMaterial
      child.receiveShadow = true
    }
  })
  walls?.traverse((child) => {
    if (child.isMesh) {
      child.material = rinkWallMaterial
      child.castShadow = true
      child.receiveShadow = true
    }
  })
  goalTemplate?.removeFromParent()

  rinkModel = new THREE.Group()
  if (floor) rinkModel.add(floor)
  if (walls) rinkModel.add(walls)
  rinkModel.add(createRinkMarkings())
  if (goalTemplate) {
    const homeGoal = createGoal(goalTemplate, homeGoalLine.x, 1, goalMaterial)
    const guestGoal = createGoal(goalTemplate, guestGoalLine.x, -1, goalMaterial)
    rinkModel.add(homeGoal, guestGoal)
  }
  scene.add(rinkModel)
  addArenaAtmosphere(scene)
}

function addArenaAtmosphere(scene) {
  const backWallMaterial = new THREE.MeshBasicMaterial({ color: 0x11151b, transparent: true, opacity: 0.82, side: THREE.DoubleSide })
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xf7fbff, transparent: true, opacity: 0.95 })
  const shadeMaterial = new THREE.MeshBasicMaterial({ color: 0x0b0f14, transparent: true, opacity: 0.46, side: THREE.DoubleSide })
  disposeLater(backWallMaterial, lightMaterial, shadeMaterial)

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(74, 12), backWallMaterial)
  backWall.position.set(0, 5.5, -19)
  backWall.renderOrder = -1
  scene.add(backWall)

  for (const x of [-24, -8, 8, 24]) {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.34), lightMaterial)
    light.position.set(x, 7.4, -18.8)
    scene.add(light)
  }

  const farShade = new THREE.Mesh(new THREE.PlaneGeometry(74, 8), shadeMaterial)
  farShade.position.set(0, 3.8, 18.5)
  farShade.rotation.y = Math.PI
  scene.add(farShade)
}

function createRinkMarkings() {
  const markings = new THREE.Group()
  const redMaterial = new THREE.MeshBasicMaterial({ color: 0xd91f32, side: THREE.DoubleSide, depthWrite: false })
  const blueMaterial = new THREE.MeshBasicMaterial({ color: 0x1f62d0, side: THREE.DoubleSide, depthWrite: false })
  const creaseMaterial = new THREE.MeshBasicMaterial({ color: 0x6fb6ff, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
  disposeLater(redMaterial, blueMaterial, creaseMaterial)

  const center = { x: 0, z: 0 }

  markings.add(
    createFloorRect(center, { width: 0.16, height: RINKS.standard.height }, redMaterial),
    createFloorRing(center, faceoffCircleRadius, 0.1, redMaterial),
    createFloorCircle(center, RINKS.standard.width * 0.006, redMaterial),
    createFloorRect(homeBlueLine, { width: 0.2, height: RINKS.standard.height }, blueMaterial),
    createFloorRect(guestBlueLine, { width: 0.2, height: RINKS.standard.height }, blueMaterial),
    createFloorRect(homeGoalLine, { width: 0.12, height: RINKS.standard.height }, redMaterial),
    createFloorRect(guestGoalLine, { width: 0.12, height: RINKS.standard.height }, redMaterial),
    createGoalCrease(homeGoalLine, 1, creaseMaterial, redMaterial),
    createGoalCrease(guestGoalLine, -1, creaseMaterial, redMaterial),
  )
  for (const faceoffCenter of endZoneFaceoffCenters) {
    markings.add(createFloorRing(faceoffCenter, faceoffCircleRadius, 0.08, redMaterial))
    markings.add(createFloorCircle(faceoffCenter, faceoffDotRadius, redMaterial))
  }
  return markings
}

function createGoal(template, goalLineX, rinkDirection, material) {
  const goal = template.clone(true)
  goal.traverse((child) => {
    if (child.isMesh) {
      child.material = material
      child.castShadow = true
      child.receiveShadow = true
    }
  })
  if (rinkDirection < 0) goal.rotation.y = Math.PI
  goal.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(goal)
  const center = box.getCenter(new THREE.Vector3())
  const rinkFacingEdge = rinkDirection > 0 ? box.max.x : box.min.x
  goal.position.x += goalLineX - rinkFacingEdge
  goal.position.y += -box.min.y
  goal.position.z += -center.z
  return goal
}

function addPlayers(scene, game) {
  const style = cartoonMode.value || game.style === 'cartoon' ? 'cartoon' : 'real'
  const loader = new THREE.TextureLoader()
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  disposeLater(hitMaterial)
  const textures = {
    home: loader.load(assetUrl(style, 'home')),
    guest: loader.load(assetUrl(style, 'guest')),
  }
  for (const texture of Object.values(textures)) {
    texture.colorSpace = THREE.SRGBColorSpace
    disposeLater(texture)
  }

  for (const player of game.players ?? []) {
    const team = player.id.startsWith('home_') ? 'home' : 'guest'
    const position = toPaddedRinkCoordinates(player)
    playerPositions.set(player.id, { team, x: position.x, z: position.y })
    const texture = cropTexture(textures[team], spriteTileForPlayer(player.id))
    const isGoalie = player.id.endsWith('_goalie')
    const material = isGoalie
      ? new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide })
      : new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.08 })
    const sprite = isGoalie
      ? new THREE.Mesh(new THREE.PlaneGeometry(playerSpriteSize, playerSpriteSize), material)
      : new THREE.Sprite(material)
    disposeLater(texture, material)
    if (isGoalie) {
      sprite.rotation.y = goalieWorldYaw(team)
      sprite.userData.team = team
      disposeLater(sprite.geometry)
    }
    sprite.position.set(position.x, playerSpriteCenterY, position.y)
    if (!isGoalie) sprite.scale.set(playerSpriteSize, playerSpriteSize, 1)
    sprite.userData.playerId = player.id
    sprite.userData.playerVisual = true
    dynamicGroup.add(sprite)

    const hitGeometry = new THREE.SphereGeometry(playerSpriteSize / 2, 16, 12)
    const hitTarget = new THREE.Mesh(hitGeometry, hitMaterial)
    disposeLater(hitGeometry)
    hitTarget.position.set(position.x, playerSpriteCenterY, position.y)
    hitTarget.userData.optionId = player.id
    hitTarget.userData.playerId = player.id
    hitTarget.userData.pickTarget = true
    dynamicGroup.add(hitTarget)
  }
}

function addSlots(game) {
  const material = new THREE.MeshBasicMaterial({ color: 0x76d7ff, transparent: true, opacity: 0.42, depthWrite: false })
  disposeLater(material)
  for (const slot of game.slots ?? []) {
    const position = toRinkCoordinates(slot, RINKS.standard)
    const geometry = new THREE.BoxGeometry(2, 0.04, 2)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(position.x, 0.04, position.y)
    mesh.renderOrder = 10
    mesh.userData.optionId = slot.id
    mesh.userData.pickTarget = true
    dynamicGroup.add(mesh)
  }
}

function visualCenterForPlayer(playerId) {
  const visual = dynamicGroup?.children.find((child) => child.userData.playerVisual && child.userData.playerId === playerId)
  if (visual) return { x: visual.position.x, z: visual.position.z }
  const position = playerPositions.get(playerId)
  return position ? { x: position.x, z: position.z } : null
}

function addPossessionMarker(game) {
  const possessionPlayer = game.players?.find((player) => player.id === game.possession_player_id)
  if (!possessionPlayer) return

  const position = playerPositions.get(possessionPlayer.id)
  if (!position) return

  const geometry = new THREE.CircleGeometry(0.7, 32)
  const material = new THREE.MeshBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.9, depthWrite: false })
  const marker = new THREE.Mesh(geometry, material)
  marker.rotation.x = -Math.PI / 2
  marker.position.set(position.x, 0.1, position.z)
  marker.renderOrder = 20
  marker.userData.possessionMarker = true
  dynamicGroup.add(marker)
}

function addCameraDirectionMarker(game) {
  const cameraPlayer = game.players?.find((player) => player.id === game.camera_player_id)
  if (!cameraPlayer) return

  const position = playerPositions.get(cameraPlayer.id)
  if (!position) return

  const shape = new THREE.Shape()
  shape.moveTo(0, 1)
  shape.lineTo(-0.7, -0.6)
  shape.lineTo(0.7, -0.6)
  shape.lineTo(0, 1)
  const geometry = new THREE.ShapeGeometry(shape)
  const material = new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.88, depthWrite: false })
  cameraDirectionMarker = new THREE.Mesh(geometry, material)
  cameraDirectionMarker.rotation.x = -Math.PI / 2
  cameraDirectionMarker.position.set(position.x, 0.12, position.z)
  cameraDirectionMarker.renderOrder = 30
  dynamicGroup.add(cameraDirectionMarker)
  updateCameraDirectionMarker()
}

function addResultPlayerMarker(playerId) {
  if (!dynamicGroup) return
  const position = playerPositions.get(playerId)
  if (!position) return
  const geometry = new THREE.ConeGeometry(0.34, 0.72, 3)
  const material = new THREE.MeshBasicMaterial({ color: 0x31e65d, depthTest: false })
  const marker = new THREE.Mesh(geometry, material)
  marker.rotation.x = Math.PI
  marker.position.set(position.x, playerSpriteSize + 0.8, position.z)
  marker.renderOrder = 80
  marker.userData.resultMarker = true
  marker.userData.playerId = playerId
  resultPlayerMarker = marker
  disposeLater(geometry, material)
  dynamicGroup.add(marker)
}

function solutionPlayerId() {
  const bestOption = result.value?.bestOption
  return currentGame.value?.players?.some((player) => player.id === bestOption) ? bestOption : null
}

function solutionLabel() {
  const bestOption = result.value?.bestOption
  if (bestOption === 'shot') return 'Shot'
  if (bestOption === 'protect') return 'Protect'
  return ''
}

function setCameraDirectionBase(cameraPlayer, lookTargetPlayer, playerPosition, lookTarget) {
  const worldDeltaX = lookTarget.x - playerPosition.x
  const worldDeltaZ = lookTarget.z - playerPosition.z
  cameraBaseYaw = Math.atan2(worldDeltaX, -worldDeltaZ)

  const mapDeltaX = lookTargetPlayer ? -(lookTargetPlayer.x - cameraPlayer.x) : 0
  const mapDeltaY = lookTargetPlayer ? -(lookTargetPlayer.y - cameraPlayer.y) : -1
  cameraMapBaseDegrees.value = THREE.MathUtils.radToDeg(Math.atan2(mapDeltaX, -mapDeltaY))
}

function positionCamera(game) {
  const fallbackPlayer = game.players?.[0]
  const cameraPlayer = game.players?.find((player) => player.id === game.camera_player_id) ?? fallbackPlayer
  const playerPosition = cameraPlayer ? playerPositions.get(cameraPlayer.id) : null
  if (!playerPosition) {
    camera.position.set(0, 26, 39)
    camera.lookAt(0, 0, 0)
    return
  }

  const possessionPlayer = game.players?.find((player) => player.id === game.possession_player_id)
  const possessionPosition = possessionPlayer ? playerPositions.get(possessionPlayer.id) : null
  const fallbackTargetId = playerPosition.team === 'home' ? 'guest_goalie' : 'home_goalie'
  const fallbackTarget = playerPositions.get(fallbackTargetId)
  const fallbackTargetPlayer = game.players?.find((player) => player.id === fallbackTargetId)
  const possessionIsCameraPlayer = possessionPlayer?.id === cameraPlayer.id
  const lookTarget = possessionPosition && !possessionIsCameraPlayer ? possessionPosition : fallbackTarget
  const lookTargetPlayer = possessionPosition && !possessionIsCameraPlayer ? possessionPlayer : fallbackTargetPlayer
  camera.position.set(playerPosition.x, 1.7, playerPosition.z)
  baseLookTarget.set(lookTarget?.x ?? 0, 1.55, lookTarget?.z ?? 0)
  setCameraDirectionBase(cameraPlayer, lookTargetPlayer, playerPosition, lookTarget ?? { x: 0, z: 0 })
  updateCameraLook()
}

function updateCameraLook() {
  if (!camera) return
  const relativeTarget = baseLookTarget.clone().sub(camera.position)
  relativeTarget.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw)
  camera.lookAt(camera.position.clone().add(relativeTarget))
  cameraYawDegrees.value = THREE.MathUtils.radToDeg(cameraYaw)
  updateCameraDirectionMarker()
}

function updateCameraDirectionMarker() {
  if (!cameraDirectionMarker) return
  cameraDirectionMarker.rotation.z = cameraBaseYaw + cameraYaw
}

function updatePlayerObjects(playerId, position) {
  if (!dynamicGroup) return
  for (const child of dynamicGroup.children) {
    if (child.userData.playerId !== playerId) continue
    child.position.x = position.x
    child.position.z = position.z
    if (child.userData.playerVisual && playerId.endsWith('_goalie')) {
      child.rotation.y = goalieWorldYaw(child.userData.team)
    }
    if (child.userData.resultMarker) {
      child.position.y = playerSpriteSize + 0.8
    }
  }
}

function stopInteractionEvent(event) {
  event?.stopPropagation?.()
  event?.stopImmediatePropagation?.()
}

function updateGoalieControls(event) {
  stopInteractionEvent(event)
  for (const [goalieId, team] of [['home_goalie', 'home'], ['guest_goalie', 'guest']]) {
    const rinkPosition = goalieRinkPosition(team)
    const playerPosition = playerPositions.get(goalieId)
    if (!playerPosition) continue
    playerPosition.x = rinkPosition.x
    playerPosition.z = rinkPosition.y
    updatePlayerObjects(goalieId, playerPosition)
  }
  updatePossessionMarkerPosition()
  updateCameraPlayerAnchors()
  refreshAnalyticsOverlays()
}

function updateGoalieRotation(event) {
  updateGoalieControls(event)
}

function updatePossessionMarkerPosition() {
  if (!currentGame.value || !dynamicGroup) return
  const possessionId = currentGame.value.possession_player_id
  const position = playerPositions.get(possessionId)
  const marker = dynamicGroup.children.find((child) => child.userData.possessionMarker)
  if (position && marker) marker.position.set(position.x, marker.position.y, position.z)
}

function updateCameraPlayerAnchors() {
  if (!currentGame.value) return
  const cameraPlayerId = currentGame.value.camera_player_id
  const playerPosition = playerPositions.get(cameraPlayerId)
  if (!playerPosition) return
  if (cameraDirectionMarker) cameraDirectionMarker.position.set(playerPosition.x, cameraDirectionMarker.position.y, playerPosition.z)
  if (!freeCamera.value) {
    camera.position.set(playerPosition.x, 1.7, playerPosition.z)
    updateCameraLook()
  }
  updateRulers()
  updateShotLines()
  refreshAnalyticsOverlays()
}

function moveCameraPlayer(deltaSeconds) {
  if (!currentGame.value || freeCamera.value) return
  const cameraPlayerId = currentGame.value.camera_player_id
  const position = playerPositions.get(cameraPlayerId)
  if (!position) return

  const forwardAmount = Number(pressedKeys.has('Control+ArrowUp'))
  const rightAmount = Number(pressedKeys.has('Control+ArrowRight')) - Number(pressedKeys.has('Control+ArrowLeft'))
  if (!forwardAmount && !rightAmount) return

  const forward = new THREE.Vector3()
  camera.getWorldDirection(forward)
  forward.y = 0
  if (!forward.lengthSq()) return
  forward.normalize()
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
  const movement = forward.multiplyScalar(forwardAmount).add(right.multiplyScalar(rightAmount))
  if (!movement.lengthSq()) return
  movement.normalize().multiplyScalar(cameraMoveSpeed * deltaSeconds)

  const next = clampRinkPosition(position.x + movement.x, position.z + movement.z)
  const appliedMovement = new THREE.Vector3(next.x - position.x, 0, next.z - position.z)
  position.x = next.x
  position.z = next.z
  if (currentGame.value.possession_player_id !== cameraPlayerId) baseLookTarget.add(appliedMovement)
  updatePlayerObjects(cameraPlayerId, position)
  updatePossessionMarkerPosition()
  updateCameraPlayerAnchors()
}

function loadGameIntoScene(game) {
  if (dynamicGroup) {
    scene.remove(dynamicGroup)
    disposeObject(dynamicGroup)
  }
  dynamicGroup = new THREE.Group()
  scene.add(dynamicGroup)
  playerPositions.clear()
  cameraDirectionMarker = null
  resultPlayerMarker = null
  result.value = null
  analyticsTeamAreas.value = []
  analyticsPlayerAreas.value = []
  analyticsHeatMap.value = []
  analyticsPassingLanes.value = []
  analyticsGoalieCoverage.value = []
  clearAnalyticsGroup()
  cameraBaseYaw = 0
  cameraYaw = 0
  cameraMapBaseDegrees.value = 0
  cameraYawDegrees.value = 0
  currentGame.value = game
  currentFile.value = game.file ?? ''
  addPlayers(scene, game)
  addSlots(game)
  addPossessionMarker(game)
  addCameraDirectionMarker(game)
  if (!freeCamera.value) positionCamera(game)
  updateRulers()
  updateShotLines()
  decisionStartedAt.value = performance.now()
}

async function loadNextGame() {
  loadGameIntoScene(await loadRandomGame())
}

async function selectGame(file) {
  loadGameIntoScene(await loadGameByFile(file))
  showGamePicker.value = false
}

function chooseOption(optionId) {
  if (result.value || !currentGame.value) return
  decisionTime.value = elapsedSeconds.value
  const bestOption = currentGame.value.best_option
  result.value = {
    selected: optionId,
    bestOption,
    success: optionId === bestOption,
  }
  if (currentGame.value.players?.some((player) => player.id === bestOption)) addResultPlayerMarker(bestOption)
}

function handleKeydown(event) {
  if (event.code === 'Space') {
    event.preventDefault()
    toggleShotLines()
    return
  }
  if (freeCamera.value) return
  const ctrlArrow = event.ctrlKey && ['ArrowLeft', 'ArrowUp', 'ArrowRight'].includes(event.key)
  if (ctrlArrow) {
    pressedKeys.delete(event.key)
    pressedKeys.add(`Control+${event.key}`)
  }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') pressedKeys.add(event.key)
  else if (event.key === 'ArrowDown') cameraYaw = 0
  else return
  event.preventDefault()
  updateCameraLook()
}

function handleKeyup(event) {
  if (event.key === 'Control') {
    pressedKeys.delete('Control+ArrowLeft')
    pressedKeys.delete('Control+ArrowUp')
    pressedKeys.delete('Control+ArrowRight')
    return
  }
  if (!['ArrowLeft', 'ArrowUp', 'ArrowRight'].includes(event.key)) return
  pressedKeys.delete(event.key)
  pressedKeys.delete(`Control+${event.key}`)
  event.preventDefault()
}

function clearPressedKeys() {
  pressedKeys.clear()
}

function updateCameraYaw(deltaSeconds) {
  if (pressedKeys.has('Control+ArrowLeft') || pressedKeys.has('Control+ArrowRight')) return
  const direction = Number(pressedKeys.has('ArrowLeft')) - Number(pressedKeys.has('ArrowRight'))
  if (!direction) return
  cameraYaw += direction * cameraYawSpeed * deltaSeconds
  updateCameraLook()
}

function handleClick(event) {
  if (!host.value || !camera || !dynamicGroup || result.value) return
  if (event.target !== renderer?.domElement) return
  const rect = host.value.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(dynamicGroup.children, true).find(({ object }) => object.userData.pickTarget)
  if (hit) chooseOption(hit.object.userData.optionId)
}

function resize() {
  if (!host.value || !renderer || !camera) return
  const { clientWidth, clientHeight } = host.value
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(clientWidth, clientHeight)
}

onMounted(async () => {
  scene = new THREE.Scene()
  applySceneTheme()

  camera = new THREE.PerspectiveCamera(cameraProfiles.firstPerson.fov, 1, cameraProfiles.firstPerson.near, cameraProfiles.firstPerson.far)

  const ambient = new THREE.HemisphereLight(0xd8ecff, 0x20252b, 0.85)
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.35)
  keyLight.position.set(-14, 28, 16)
  const fillLight = new THREE.DirectionalLight(0xb8dcff, 0.62)
  fillLight.position.set(18, 16, -20)
  scene.add(ambient, keyLight, fillLight)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  host.value.appendChild(renderer.domElement)
  orbitControls = new OrbitControls(camera, renderer.domElement)
  orbitControls.enabled = false
  orbitControls.enableDamping = true

  await addRink(scene)
  await loadNextGame()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
  window.addEventListener('blur', clearPressedKeys)
  window.addEventListener('pointerup', endHudInteraction)
  window.addEventListener('pointercancel', endHudInteraction)

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host.value)
  resize()

  const render = (timestamp = performance.now()) => {
    const deltaSeconds = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 0
    lastFrameTime = timestamp
    now.value = timestamp
    moveCameraPlayer(deltaSeconds)
    updateCameraYaw(deltaSeconds)
    if (freeCamera.value) orbitControls?.update()
    updateRulers()
    updateShotLines()
    renderer.render(scene, camera)
    frame = requestAnimationFrame(render)
  }
  render()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
  window.removeEventListener('blur', clearPressedKeys)
  window.removeEventListener('pointerup', endHudInteraction)
  window.removeEventListener('pointercancel', endHudInteraction)
  resizeObserver?.disconnect()
  orbitControls?.dispose()
  renderer?.dispose()
  if (rinkModel) disposeObject(rinkModel)
  for (const item of disposables) item.dispose?.()
})
</script>

<template>
  <main ref="host" class="simulation-view" :class="`simulation-view--${cameraTeam}`" @click="handleClick">
    <section class="simulation-hud">
      <div class="simulation-hud__meta" role="button" tabindex="0" @click.stop="openGamePicker" @keydown.enter.prevent="openGamePicker" @keydown.space.prevent="openGamePicker">
        <strong>{{ currentGame?.name || 'Untitled game' }}</strong>
        <span>{{ currentFile || 'default' }}</span>
        <span>{{ elapsedSeconds }}s</span>
      </div>
      <div class="simulation-hud__controls" @pointerdown.capture.stop="beginHudInteraction" @pointermove.capture.stop="stopHudEvent" @pointerup.capture.stop="endHudInteraction" @pointercancel.capture.stop="endHudInteraction" @mousedown.capture.stop="beginHudInteraction" @mousemove.capture.stop="stopHudEvent" @mouseup.capture.stop="endHudInteraction" @click.stop @wheel.stop>
        <button type="button" :class="{ 'is-active': showTopView }" @click.stop="showTopView = !showTopView">2D</button>
        <button type="button" :class="{ 'is-active': showGoalOverlay }" @click.stop="showGoalOverlay = !showGoalOverlay">Goal</button>
        <button type="button" :class="{ 'is-active': showGrid }" @click.stop="toggleGrid">Grid</button>
        <button type="button" :class="{ 'is-active': freeCamera }" @click.stop="toggleFreeCamera">Orbit</button>
        <button type="button" :class="{ 'is-active': showRuler }" @click.stop="toggleRuler">Ruler</button>
        <div class="simulation-hud__analytics">
          <button type="button" :class="{ 'is-active': showAnalyticsMenu || analyticsTeamAreas.length || analyticsPlayerAreas.length || analyticsHeatMap.length || analyticsPassingLanes.length || analyticsGoalieCoverage.length }" aria-label="Analytics" @click.stop="toggleAnalyticsMenu">...</button>
          <div v-if="showAnalyticsMenu" class="simulation-hud__analytics-menu">
            <button type="button" :class="{ 'is-active': analyticsPassingLanes.length }" @click.stop="toggleAnalyticsPassingLanes">Passing lanes</button>
            <button type="button" :class="{ 'is-active': analyticsGoalieCoverage.length }" @click.stop="toggleAnalyticsGoalieCoverage">Goalie cone</button>
            <button type="button" :class="{ 'is-active': analyticsHeatMap.length }" @click.stop="toggleAnalyticsHeatMap">Open space</button>
            <button type="button" :class="{ 'is-active': analyticsTeamAreas.length }" @click.stop="toggleAnalyticsTeamsAreas">Team areas</button>
            <button type="button" :class="{ 'is-active': analyticsPlayerAreas.length }" @click.stop="toggleAnalyticsPlayerAreas">Player areas</button>
            <button type="button" :class="{ 'is-active': cartoonMode }" @click.stop="toggleCartoonMode">Cartoon mode</button>
          </div>
        </div>
      </div>
      <div class="simulation-hud__sliders" @pointerenter="enterHudInteraction" @pointerleave="leaveHudInteraction" @focusin="enterHudInteraction" @focusout="leaveHudInteraction" @pointerdown.capture.stop="beginHudInteraction" @pointermove.capture.stop="stopHudEvent" @pointerup.capture.stop="endHudInteraction" @pointercancel.capture.stop="endHudInteraction" @mousedown.capture.stop="beginHudInteraction" @mousemove.capture.stop="stopHudEvent" @mouseup.capture.stop="endHudInteraction" @touchstart.capture.stop="beginHudInteraction" @touchmove.capture.stop="stopHudEvent" @touchend.capture.stop="endHudInteraction" @click.stop @wheel.stop>
        <label>
          <span>Goalie side</span>
          <strong>{{ formatMeters(goalieSideMeters) }}</strong>
          <input v-model.number="goalieLateral" type="range" min="-1.35" max="1.35" step="0.01" @input="updateGoalieControls($event)" @change.stop>
        </label>
        <label>
          <span>Goalie depth</span>
          <strong>{{ formatMeters(goalieDepthMeters) }}</strong>
          <input v-model.number="goalieDepth" type="range" min="0" max="1" step="0.01" @input="updateGoalieControls($event)" @change.stop>
        </label>
        <label>
          <span>Goalie rotation</span>
          <strong>{{ formatDegrees(goalieRotationDegrees) }}</strong>
          <input v-model.number="goalieRotation" type="range" min="-60" max="60" step="1" @input="updateGoalieRotation($event)" @change.stop>
        </label>
      </div>
    </section>
    <div class="simulation-actions">
      <button type="button" @click.stop="chooseOption('protect')">Protect</button>
      <button type="button" @click.stop="chooseOption('shot')">Shot</button>
    </div>
    <aside v-if="showTopView || showGoalOverlay" class="simulation-map" aria-label="2d rink visualization">
      <svg v-if="showGoalOverlay" class="simulation-map__overlay" viewBox="0 0 100 100" aria-hidden="true">
        <line x1="0" y1="9" x2="100" y2="9" class="simulation-map__goal-line" />
        <path d="M33 0 V9 M67 0 V9" class="simulation-map__goal-cage" />
        <path :d="closeupGoalCreasePath()" class="simulation-map__crease" />
        <line v-for="(segment, index) in creaseCloseupShotSegments()" :key="index" :x1="segment.start.x" :y1="segment.start.y" :x2="segment.end.x" :y2="segment.end.y" class="simulation-map__shot-line" />
        <rect x="-18" y="-3" width="36" height="6" class="simulation-map__goalie-box" :transform="closeupGoalieTransform('home')" />
      </svg>
      <svg v-if="showTopView" class="simulation-map__rink" :viewBox="`0 0 ${rinkMapSvg.width} ${rinkMapSvg.height}`" aria-hidden="true">
          <g data-debug="analytics">
            <rect v-for="cell in analyticsHeatMap" :key="cell.id" :x="cell.svg.x" :y="cell.svg.y" :width="cell.svg.width" :height="cell.svg.height" class="simulation-map__heat-cell" :style="heatMapCellStyle(cell)" />
            <line v-for="lane in analyticsPassingLanes" :key="lane.id" :x1="lane.start.x" :y1="lane.start.y" :x2="lane.end.x" :y2="lane.end.y" :class="passingLaneClass(lane.status)" />
            <g v-for="cone in analyticsGoalieCoverage" :key="cone.id" :class="goalieCoverageClass(cone.status)">
              <line v-for="(post, index) in cone.posts" :key="`post-${index}`" :x1="cone.apex.x" :y1="cone.apex.y" :x2="post.x" :y2="post.y" class="simulation-map__goalie-coverage-post" />
              <line :x1="cone.apex.x" :y1="cone.apex.y" :x2="cone.target.x" :y2="cone.target.y" class="simulation-map__goalie-coverage-target" />
              <line :x1="cone.apex.x" :y1="cone.apex.y" :x2="cone.facing.x" :y2="cone.facing.y" class="simulation-map__goalie-coverage-facing" />
            </g>
            <ellipse v-for="area in analyticsPlayerAreas" :key="area.id" :cx="area.center.x" :cy="area.center.y" :rx="rinkSvgCircle({ x: 0, z: 0 }, playerAreaRadius).radius.x" :ry="rinkSvgCircle({ x: 0, z: 0 }, playerAreaRadius).radius.y" :class="analyticsPlayerAreaClass(area.team)" />
            <polygon v-for="area in analyticsTeamAreas" :key="area.team" :points="rinkSvgPoints(area.points)" :class="analyticsTeamClass(area.team)" />
          </g>
          <path :d="rinkSvgGoalCreasePath(homeGoalLine, 1)" class="simulation-map__rink-crease" />
          <path :d="rinkSvgGoalCreasePath(guestGoalLine, -1)" class="simulation-map__rink-crease" />
          <line x1="0" :y1="rinkSvgPoint(homeGoalLine).y" :x2="rinkMapSvg.width" :y2="rinkSvgPoint(homeGoalLine).y" class="simulation-map__rink-line" />
          <line x1="0" :y1="rinkSvgPoint(guestGoalLine).y" :x2="rinkMapSvg.width" :y2="rinkSvgPoint(guestGoalLine).y" class="simulation-map__rink-line" />
          <line x1="0" :y1="rinkSvgPoint({ x: 0, z: 0 }).y" :x2="rinkMapSvg.width" :y2="rinkSvgPoint({ x: 0, z: 0 }).y" class="simulation-map__rink-line simulation-map__rink-line--center" />
          <line x1="0" :y1="rinkSvgPoint(homeBlueLine).y" :x2="rinkMapSvg.width" :y2="rinkSvgPoint(homeBlueLine).y" class="simulation-map__rink-blue-line" />
          <line x1="0" :y1="rinkSvgPoint(guestBlueLine).y" :x2="rinkMapSvg.width" :y2="rinkSvgPoint(guestBlueLine).y" class="simulation-map__rink-blue-line" />
          <ellipse :cx="rinkSvgCenterCircle().center.x" :cy="rinkSvgCenterCircle().center.y" :rx="rinkSvgCenterCircle().radius.x" :ry="rinkSvgCenterCircle().radius.y" class="simulation-map__rink-circle" />
          <ellipse v-for="(circle, index) in endZoneFaceoffCenters" :key="`faceoff-${index}`" :cx="rinkSvgCircle(circle, faceoffCircleRadius).center.x" :cy="rinkSvgCircle(circle, faceoffCircleRadius).center.y" :rx="rinkSvgCircle(circle, faceoffCircleRadius).radius.x" :ry="rinkSvgCircle(circle, faceoffCircleRadius).radius.y" class="simulation-map__rink-circle" />
          <circle :cx="rinkSvgPoint({ x: 0, z: 0 }).x" :cy="rinkSvgPoint({ x: 0, z: 0 }).y" r="2.2" class="simulation-map__rink-dot" />
          <circle v-for="(circle, index) in endZoneFaceoffCenters" :key="`faceoff-dot-${index}`" :cx="rinkSvgPoint(circle).x" :cy="rinkSvgPoint(circle).y" r="2.2" class="simulation-map__rink-dot" />
          <template v-for="player in currentGame?.players || []" :key="player.id">
            <polygon v-if="currentGame?.camera_player_id === player.id" points="0,-3.8 -3.6,3.8 3.6,3.8" class="simulation-map__player-camera" :transform="cameraMapTransformForPlayer(player)" />
            <circle v-else :cx="gamePointToRinkSvgPoint(player).x" :cy="gamePointToRinkSvgPoint(player).y" r="4" class="simulation-map__player" :class="[`simulation-map__player--${player.id.startsWith('home_') ? 'home' : 'guest'}`, { 'with-ball': currentGame?.possession_player_id === player.id }]" />
            <circle v-if="solutionPlayerId() === player.id" :cx="gamePointToRinkSvgPoint(player).x" :cy="gamePointToRinkSvgPoint(player).y" r="7" class="simulation-map__solution-player" />
          </template>
          <rect v-for="slot in currentGame?.slots || []" :key="slot.id" :x="gamePointToRinkSvgPoint(slot).x - 5" :y="gamePointToRinkSvgPoint(slot).y - 5" width="10" height="10" class="simulation-map__slot" />
      </svg>
    </aside>
    <section v-if="result" class="simulation-modal" role="dialog" aria-modal="true">
      <div class="simulation-modal__panel" :class="{ 'simulation-modal__panel--success': result.success, 'simulation-modal__panel--error': !result.success }">
        <strong>{{ result.success ? 'Success' : 'Error' }}</strong>
        <em v-if="solutionLabel()">Solution: {{ solutionLabel() }}</em>
        <span>{{ decisionTime }}s</span>
        <button type="button" @click.stop="loadNextGame">Next</button>
      </div>
    </section>
    <section v-if="showGamePicker" class="simulation-game-picker" role="dialog" aria-modal="true" aria-label="Available games" @click.self="closeGamePicker">
      <div class="simulation-game-picker__panel">
        <header>
          <strong>Games</strong>
          <button type="button" aria-label="Close" @click.stop="closeGamePicker">Close</button>
        </header>
        <div class="simulation-game-picker__body">
          <button v-for="game in gameList" :key="game.file" type="button" :class="{ 'is-active': currentFile === game.file }" @click.stop="selectGame(game.file)">
            <strong>{{ game.name || game.file }}</strong>
            <span>{{ game.file }}</span>
          </button>
        </div>
      </div>
    </section>
  </main>
</template>
<style lang="scss" src="./SimulationView.scss"></style>
