import { reactive, readonly } from 'vue'
import { gamesEndpoint } from './simulation/config.js'
import { defaultGame } from './simulation/default-game.js'

export class SimulationService {
  scene = {
    renderer: null,
    scene: null,
    camera: null,
    orbitControls: null,
    frame: null,
    resizeObserver: null,
    dynamicGroup: null,
    rinkModel: null,
    gridGroup: null,
    rulerGroup: null,
    shotLineGroup: null,
    analyticsGroup: null,
    cameraDirectionMarker: null,
    resultPlayerMarker: null,
    savedOrbitCameraState: null,
  }

  #state = reactive({
    game: null,
    startedAt: null,
    selectedAction: null,
    resolved: false,
    hud: {
      showTopView: true,
      showGoalOverlay: true,
      showAnalyticsMenu: false,
      showGrid: false,
      freeCamera: false,
      showRuler: false,
      cartoonMode: false,
      activeAnalytics: {
        passingLanes: false,
        goalieCoverage: false,
        heatMap: false,
        teamAreas: false,
        playerAreas: false,
      },
    },
    map: {
      heatMap: [],
      passingLanes: [],
      goalieCoverage: [],
      playerAreas: [],
      teamAreas: [],
      cameraMapBaseDegrees: 0,
      cameraYawDegrees: 0,
      solutionPlayerId: null,
      playerMarkers: [],
      slotMarkers: [],
    },
  })
  state = readonly(this.#state)

  load(game) {
    this.#state.game = game
    this.#state.startedAt = performance.now()
    this.#state.selectedAction = null
    this.#state.resolved = false
    this.setMapState({
      heatMap: [],
      passingLanes: [],
      goalieCoverage: [],
      playerAreas: [],
      teamAreas: [],
      solutionPlayerId: null,
      playerMarkers: [],
      slotMarkers: [],
    })
  }

  select(action) { this.#state.selectedAction = action }
  resolve() { this.#state.resolved = true }

  toggleTopView() { this.#state.hud.showTopView = !this.#state.hud.showTopView }
  toggleGoalOverlay() { this.#state.hud.showGoalOverlay = !this.#state.hud.showGoalOverlay }
  toggleAnalyticsMenu() { this.#state.hud.showAnalyticsMenu = !this.#state.hud.showAnalyticsMenu }
  closeAnalyticsMenu() { this.#state.hud.showAnalyticsMenu = false }

  setGridVisible(value) { this.#state.hud.showGrid = value }
  setFreeCamera(value) { this.#state.hud.freeCamera = value }
  setRulerVisible(value) { this.#state.hud.showRuler = value }
  setCartoonMode(value) { this.#state.hud.cartoonMode = value }

  setAnalyticsActive(key, value) {
    if (key in this.#state.hud.activeAnalytics) this.#state.hud.activeAnalytics[key] = value
  }

  setMapState(patch) {
    Object.assign(this.#state.map, patch)
  }

  async fetchGameList() {
    const response = await fetch(gamesEndpoint)
    if (!response.ok) return []
    const games = (await response.json()).games ?? []
    return games.map((game) => (typeof game === 'string' ? { file: game, name: game } : game))
  }

  async loadGameByFile(file) {
    const response = await fetch(`${gamesEndpoint}?file=${encodeURIComponent(file)}`)
    const game = response.ok ? { ...defaultGame(), ...(await response.json()) } : defaultGame()
    return { ...game, file }
  }

  async loadRandomGame() {
    try {
      const games = await this.fetchGameList()
      if (!games.length) return defaultGame()
      const selected = games[Math.floor(Math.random() * games.length)]
      return this.loadGameByFile(selected.file)
    } catch {
      return defaultGame()
    }
  }
}
