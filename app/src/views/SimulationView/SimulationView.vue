<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RINKS } from '../../config/rink-dimensions.js'
import DecisionActions from './partials/DecisionActions.vue'
import GamePicker from './partials/GamePicker.vue'
import GoalieSliders from './partials/GoalieSliders.vue'
import GoalOverlay from './partials/GoalOverlay.vue'
import HudControls from './partials/HudControls.vue'
import ResultModal from './partials/ResultModal.vue'
import RinkMap from './partials/RinkMap.vue'
import { renderAnalyticsOverlays as renderThreeAnalyticsOverlays } from './utils/analytics-overlays.js'
import { assetUrl, rinkUrl } from './utils/assets.js'
import { closeupGoalCreasePath, goalieWorldYaw as getGoalieWorldYaw, rinkWorldToCreaseCloseupPoint } from './utils/goal-overlay-geometry.js'
import { useGoalieRinkControls } from './utils/goalie-rink-controls.js'
import { applySceneTheme as applyThreeSceneTheme, createRinkMaterials } from './utils/scene-theme.js'
import {
  mapPointToRinkSvgPoint,
  rinkWorldToMapPoint,
} from './utils/map-rendering.js'
import {
  clampRinkPosition,
  creaseDepth,
  creaseWidth,
  endZoneFaceoffCenters,
  faceoffCircleRadius,
  faceoffDotRadius,
  formatDegrees,
  formatMeters,
  goalWidth,
  guestBlueLine,
  guestGoalLine,
  homeBlueLine,
  homeGoalLine,
  playerAreaRadius,
  playerSpriteCenterY,
  playerSpriteSize,
  rinkPlacementPadding,
  spriteSheet,
  spriteTileForPlayer,
} from './utils/rink-geometry.js'
import {
  clearGroup,
  createDistanceLabel as createDistanceLabelSprite,
  createFloorCircle,
  createFloorRect,
  createFloorRing,
  createGoalCrease,
  cropTexture as cropSpriteTexture,
  disposeObject,
} from './utils/three-scene.js'
import { cameraMoveSpeed, cameraProfiles, cameraYawSpeed, floorLineY } from '../../services/simulation/config.js'

const services = inject('services')
const analytics = services.analytics
const simulation = services.simulation
const sceneRefs = simulation.scene
const host = ref(null)
let scene
let camera
let renderer
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
const { surface: rinkSurfaceMaterial, wall: rinkWallMaterial } = createRinkMaterials()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const pressedKeys = new Set()
const disposables = []
const playerPositions = new Map()
const currentGame = ref(null)
const currentFile = ref('')
const gameList = ref([])
const showGamePicker = ref(false)
const showGrid = ref(false)
const freeCamera = ref(false)
const showRuler = ref(false)
const showShotLines = ref(false)
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
const disposeLater = (...items) => {
  disposables.push(...items.filter(Boolean))
}

const { goalieRinkPosition, toPaddedRinkCoordinates } = useGoalieRinkControls({
  lateral: goalieLateral,
  depth: goalieDepth,
})

function gamePointToMapPoint(point) {
  if (point.position) return rinkWorldToMapPoint(point.position)
  const livePosition = point.id ? playerPositions.get(point.id) : null
  if (livePosition) return rinkWorldToMapPoint(livePosition)
  return {
    x: 50 - point.x * 45,
    y: 50 - point.y * 45,
  }
}

function gamePointToRinkSvgPoint(point) {
  return mapPointToRinkSvgPoint(gamePointToMapPoint(point))
}

function cameraMapTransformForPlayer(player) {
  const point = gamePointToRinkSvgPoint(player)
  return `translate(${point.x} ${point.y}) rotate(${cameraMapBaseDegrees.value - cameraYawDegrees.value})`
}

function syncSimulationMapState() {
  const game = currentGame.value
  simulation.setMapState({
    heatMap: analyticsHeatMap.value,
    passingLanes: analyticsPassingLanes.value,
    goalieCoverage: analyticsGoalieCoverage.value,
    playerAreas: analyticsPlayerAreas.value,
    teamAreas: analyticsTeamAreas.value,
    cameraMapBaseDegrees: cameraMapBaseDegrees.value,
    cameraYawDegrees: cameraYawDegrees.value,
    solutionPlayerId: solutionPlayerId(),
    playerMarkers: (game?.players ?? []).map((player) => ({
      id: player.id,
      team: player.id.startsWith('home_') ? 'home' : 'guest',
      hasPuck: game?.possession_player_id === player.id,
      isCamera: game?.camera_player_id === player.id,
      point: gamePointToRinkSvgPoint(player),
      cameraTransform: cameraMapTransformForPlayer(player),
    })),
    slotMarkers: (game?.slots ?? []).map((slot) => ({
      id: slot.id,
      point: gamePointToRinkSvgPoint(slot),
    })),
  })
}

function closeupGoalieTransform(team) {
  const position = goalieRinkPosition(team)
  const map = rinkWorldToCreaseCloseupPoint({ x: position.x, z: position.y }, team)
  const rotation = team === 'home' ? goalieRotation.value : 180 - goalieRotation.value
  return `translate(${map.x} ${map.y}) rotate(${rotation})`
}

function creaseCloseupShotSegments() {
  if (!showShotLines.value || !currentGame.value) return []
  const id = currentGame.value.camera_player_id
  const position = id ? playerPositions.get(id) : null
  if (!position) return []
  const team = id.startsWith('home_') ? 'guest' : 'home'
  const start = rinkWorldToCreaseCloseupPoint(position, team)
  const goalLine = team === 'home' ? homeGoalLine : guestGoalLine
  return [
    rinkWorldToCreaseCloseupPoint({ x: goalLine.x, z: -goalWidth / 2 }, team),
    rinkWorldToCreaseCloseupPoint({ x: goalLine.x, z: goalWidth / 2 }, team),
  ].map((end) => ({ start, end }))
}

async function openGamePicker() {
  gameList.value = await simulation.fetchGameList()
  showGamePicker.value = true
}

function closeGamePicker() {
  showGamePicker.value = false
}

function applySceneTheme() {
  applyThreeSceneTheme({
    scene,
    cartoonMode: cartoonMode.value,
    surfaceMaterial: rinkSurfaceMaterial,
    wallMaterial: rinkWallMaterial,
  })
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
  simulation.setGridVisible(showGrid.value)
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
  simulation.setFreeCamera(enabled)
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

function renderAnalyticsOverlays() {
  renderThreeAnalyticsOverlays({
    group: ensureAnalyticsGroup(),
    clearGroup,
    disposeLater,
    heatMap: analyticsHeatMap.value,
    passingLanes: analyticsPassingLanes.value,
    goalieCoverage: analyticsGoalieCoverage.value,
    playerAreas: analyticsPlayerAreas.value,
    teamAreas: analyticsTeamAreas.value,
    playerAreaRadius,
  })
  syncSimulationMapState()
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
    const label = createDistanceLabelSprite(`${distance.toFixed(1)} m`, disposeLater)
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
      const label = createDistanceLabelSprite(`${distance.toFixed(1)} m`, disposeLater)
      label.position.copy(start.clone().lerp(end, 0.5)).add(new THREE.Vector3(0, 0.55, 0))
      group.add(line, label)
    }
  }
}

function toggleRuler() {
  showRuler.value = !showRuler.value
  simulation.setRulerVisible(showRuler.value)
  updateRulers()
}

function drawAnalyticsTeamsAreas() {
  analyticsTeamAreas.value = analytics.drawTeamsAreas({
    players: currentGame.value?.players ?? [],
    playerPositions,
    toSvgPoint: gamePointToRinkSvgPoint,
    getWorldPoint: visualCenterForPlayer,
  })
  renderAnalyticsOverlays()
  simulation.setAnalyticsActive('teamAreas', true)
  simulation.closeAnalyticsMenu()
}

function clearAnalyticsTeamsAreas() {
  analyticsTeamAreas.value = analytics.removeTeamsAreas()
  clearAnalyticsGroup()
  renderAnalyticsOverlays()
  simulation.setAnalyticsActive('teamAreas', false)
  simulation.closeAnalyticsMenu()
}

function toggleAnalyticsTeamsAreas() {
  if (analyticsTeamAreas.value.length) {
    clearAnalyticsTeamsAreas()
    return
  }
  drawAnalyticsTeamsAreas()
}

function drawAnalyticsPlayerAreas() {
  analyticsPlayerAreas.value = analytics.drawPlayerAreas({
    players: currentGame.value?.players ?? [],
    playerPositions,
    toSvgPoint: gamePointToRinkSvgPoint,
    getWorldPoint: visualCenterForPlayer,
  })
  renderAnalyticsOverlays()
  simulation.setAnalyticsActive('playerAreas', true)
  simulation.closeAnalyticsMenu()
}

function clearAnalyticsPlayerAreas() {
  analyticsPlayerAreas.value = []
  clearAnalyticsGroup()
  renderAnalyticsOverlays()
  simulation.setAnalyticsActive('playerAreas', false)
  simulation.closeAnalyticsMenu()
}

function toggleAnalyticsPlayerAreas() {
  if (analyticsPlayerAreas.value.length) {
    clearAnalyticsPlayerAreas()
    return
  }
  drawAnalyticsPlayerAreas()
}

function drawAnalyticsHeatMap() {
  analyticsHeatMap.value = analytics.drawOpenSpaceHeatMap({
    players: currentGame.value?.players ?? [],
    playerPositions,
    rink: RINKS.standard,
    toSvgPoint: gamePointToRinkSvgPoint,
    getWorldPoint: visualCenterForPlayer,
    activePlayerId: currentGame.value?.camera_player_id,
  })
  renderAnalyticsOverlays()
  simulation.setAnalyticsActive('heatMap', true)
  simulation.closeAnalyticsMenu()
}

function clearAnalyticsHeatMap() {
  analyticsHeatMap.value = []
  clearAnalyticsGroup()
  renderAnalyticsOverlays()
  simulation.setAnalyticsActive('heatMap', false)
  simulation.closeAnalyticsMenu()
}

function toggleAnalyticsHeatMap() {
  if (analyticsHeatMap.value.length) {
    clearAnalyticsHeatMap()
    return
  }
  drawAnalyticsHeatMap()
}

function drawAnalyticsPassingLanes() {
  analyticsPassingLanes.value = analytics.drawPassingLanes({
    players: currentGame.value?.players ?? [],
    playerPositions,
    toSvgPoint: gamePointToRinkSvgPoint,
    getWorldPoint: visualCenterForPlayer,
    activePlayerId: currentGame.value?.possession_player_id || currentGame.value?.camera_player_id,
  })
  renderAnalyticsOverlays()
  simulation.setAnalyticsActive('passingLanes', true)
  simulation.closeAnalyticsMenu()
}

function clearAnalyticsPassingLanes() {
  analyticsPassingLanes.value = []
  clearAnalyticsGroup()
  renderAnalyticsOverlays()
  simulation.setAnalyticsActive('passingLanes', false)
  simulation.closeAnalyticsMenu()
}

function toggleAnalyticsPassingLanes() {
  if (analyticsPassingLanes.value.length) {
    clearAnalyticsPassingLanes()
    return
  }
  drawAnalyticsPassingLanes()
}

function drawAnalyticsGoalieCoverage() {
  analyticsGoalieCoverage.value = analytics.drawGoalieCoverageCone({
    players: currentGame.value?.players ?? [],
    playerPositions,
    toSvgPoint: gamePointToRinkSvgPoint,
    getWorldPoint: visualCenterForPlayer,
    activePlayerId: currentGame.value?.possession_player_id || currentGame.value?.camera_player_id,
    homeGoalLine,
    guestGoalLine,
    goalWidth,
    goalieRotationDegrees: goalieRotation.value,
  })
  renderAnalyticsOverlays()
  simulation.setAnalyticsActive('goalieCoverage', true)
  simulation.closeAnalyticsMenu()
}

function clearAnalyticsGoalieCoverage() {
  analyticsGoalieCoverage.value = []
  clearAnalyticsGroup()
  renderAnalyticsOverlays()
  simulation.setAnalyticsActive('goalieCoverage', false)
  simulation.closeAnalyticsMenu()
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
    analyticsTeamAreas.value = analytics.drawTeamsAreas({
      players: currentGame.value?.players ?? [],
      playerPositions,
      toSvgPoint: gamePointToRinkSvgPoint,
      getWorldPoint: visualCenterForPlayer,
    })
  }
  if (hasPlayerAreas) {
    analyticsPlayerAreas.value = analytics.drawPlayerAreas({
      players: currentGame.value?.players ?? [],
      playerPositions,
      toSvgPoint: gamePointToRinkSvgPoint,
      getWorldPoint: visualCenterForPlayer,
    })
  }
  if (hasHeatMap) {
    analyticsHeatMap.value = analytics.drawOpenSpaceHeatMap({
      players: currentGame.value?.players ?? [],
      playerPositions,
      rink: RINKS.standard,
      toSvgPoint: gamePointToRinkSvgPoint,
      getWorldPoint: visualCenterForPlayer,
      activePlayerId: currentGame.value?.camera_player_id,
    })
  }
  if (hasPassingLanes) {
    analyticsPassingLanes.value = analytics.drawPassingLanes({
      players: currentGame.value?.players ?? [],
      playerPositions,
      toSvgPoint: gamePointToRinkSvgPoint,
      getWorldPoint: visualCenterForPlayer,
      activePlayerId: currentGame.value?.possession_player_id || currentGame.value?.camera_player_id,
    })
  }
  if (hasGoalieCoverage) {
    analyticsGoalieCoverage.value = analytics.drawGoalieCoverageCone({
      players: currentGame.value?.players ?? [],
      playerPositions,
      toSvgPoint: gamePointToRinkSvgPoint,
      getWorldPoint: visualCenterForPlayer,
      activePlayerId: currentGame.value?.possession_player_id || currentGame.value?.camera_player_id,
      homeGoalLine,
      guestGoalLine,
      goalWidth,
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
  simulation.setCartoonMode(cartoonMode.value)
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
    createGoalCrease({ goalLine: homeGoalLine, direction: 1, fillMaterial: creaseMaterial, outlineMaterial: redMaterial, feetToWorld: RINKS.standard.width / 200 }),
    createGoalCrease({ goalLine: guestGoalLine, direction: -1, fillMaterial: creaseMaterial, outlineMaterial: redMaterial, feetToWorld: RINKS.standard.width / 200 }),
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
    const texture = cropSpriteTexture(textures[team], spriteSheet, spriteTileForPlayer(player.id))
    const isGoalie = player.id.endsWith('_goalie')
    const material = isGoalie
      ? new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide })
      : new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.08 })
    const sprite = isGoalie
      ? new THREE.Mesh(new THREE.PlaneGeometry(playerSpriteSize, playerSpriteSize), material)
      : new THREE.Sprite(material)
    disposeLater(texture, material)
    if (isGoalie) {
      sprite.rotation.y = getGoalieWorldYaw(team, goalieRotation.value)
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
  syncSimulationMapState()
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
      child.rotation.y = getGoalieWorldYaw(child.userData.team, goalieRotation.value)
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
  for (const key of ['passingLanes', 'goalieCoverage', 'heatMap', 'teamAreas', 'playerAreas']) {
    simulation.setAnalyticsActive(key, false)
  }
  clearAnalyticsGroup()
  cameraBaseYaw = 0
  cameraYaw = 0
  cameraMapBaseDegrees.value = 0
  cameraYawDegrees.value = 0
  currentGame.value = game
  currentFile.value = game.file ?? ''
  simulation.load(game)
  addPlayers(scene, game)
  addSlots(game)
  addPossessionMarker(game)
  addCameraDirectionMarker(game)
  if (!freeCamera.value) positionCamera(game)
  updateRulers()
  updateShotLines()
  syncSimulationMapState()
  decisionStartedAt.value = performance.now()
}

async function loadNextGame() {
  loadGameIntoScene(await simulation.loadRandomGame())
}

async function selectGame(file) {
  loadGameIntoScene(await simulation.loadGameByFile(file))
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
  syncSimulationMapState()
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
      <HudControls
        @toggle-grid="toggleGrid"
        @toggle-free-camera="toggleFreeCamera"
        @toggle-ruler="toggleRuler"
        @toggle-passing-lanes="toggleAnalyticsPassingLanes"
        @toggle-goalie-coverage="toggleAnalyticsGoalieCoverage"
        @toggle-heat-map="toggleAnalyticsHeatMap"
        @toggle-team-areas="toggleAnalyticsTeamsAreas"
        @toggle-player-areas="toggleAnalyticsPlayerAreas"
        @toggle-cartoon-mode="toggleCartoonMode"
        @begin-interaction="beginHudInteraction"
        @end-interaction="endHudInteraction"
        @stop-event="stopHudEvent"
      />
      <GoalieSliders
        v-model:lateral="goalieLateral"
        v-model:depth="goalieDepth"
        v-model:rotation="goalieRotation"
        :side-label="formatMeters(goalieSideMeters)"
        :depth-label="formatMeters(goalieDepthMeters)"
        :rotation-label="formatDegrees(goalieRotationDegrees)"
        @update-goalie-controls="updateGoalieControls"
        @update-goalie-rotation="updateGoalieRotation"
        @begin-interaction="beginHudInteraction"
        @end-interaction="endHudInteraction"
        @enter-interaction="enterHudInteraction"
        @leave-interaction="leaveHudInteraction"
        @stop-event="stopHudEvent"
      />
    </section>
    <DecisionActions @choose="chooseOption" />
    <aside v-if="simulation.state.hud.showTopView || simulation.state.hud.showGoalOverlay" class="simulation-map" aria-label="2d rink visualization">
      <GoalOverlay v-if="simulation.state.hud.showGoalOverlay" :crease-path="closeupGoalCreasePath()" :shot-segments="creaseCloseupShotSegments()" :goalie-transform="closeupGoalieTransform('home')" />
      <RinkMap v-if="simulation.state.hud.showTopView" />
    </aside>
    <ResultModal :result="result" :solution-label="solutionLabel()" :decision-time="decisionTime" @next="loadNextGame" />
    <GamePicker :show="showGamePicker" :games="gameList" :current-file="currentFile" @close="closeGamePicker" @select="selectGame" />
  </main>
</template>
<style lang="scss" src="./SimulationView.scss"></style>
