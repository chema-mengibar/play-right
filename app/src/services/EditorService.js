import { reactive, readonly } from 'vue'

const gamesEndpoint = '/api/games'

const MIN_SKATERS = 3
const MAX_SKATERS = 5
const clampSkaterCount = (value) => Math.max(MIN_SKATERS, Math.min(MAX_SKATERS, Math.round(Number(value) || MIN_SKATERS)))
const defaultPlayerPositions = Object.freeze({
  home_goalie: { x: 0, y: -0.88 },
  home_1: { x: 0, y: -0.06 },
  home_2: { x: 0.62, y: -0.05 },
  home_3: { x: -0.62, y: -0.05 },
  home_4: { x: 0, y: -0.36 },
  home_5: { x: 0, y: -0.62 },
  guest_goalie: { x: 0, y: 0.88 },
  guest_1: { x: 0, y: 0.06 },
  guest_2: { x: -0.62, y: 0.05 },
  guest_3: { x: 0.62, y: 0.05 },
  guest_4: { x: 0, y: 0.36 },
  guest_5: { x: 0, y: 0.62 },
})
const playerIds = (count) => ['home', 'guest'].flatMap((team) => [
  `${team}_goalie`,
  ...Array.from({ length: count }, (_, index) => `${team}_${index + 1}`),
])
const bestOptionIds = (game) => [
  'shot',
  'protect',
  ...game.players.map(({ id }) => id).filter((id) => id !== game.possession_player_id),
  ...game.slots.map(({ id }) => id),
]
const emptyGame = () => ({
  name: '', short_description: '', num_players: 4,
  players: makePlayers(4),
  ball: { x: 0, y: 0 }, camera_player_id: 'home_1', possession_player_id: 'home_1', best_option: 'shot', slots: [],
})

function makePlayers(count, current = []) {
  return playerIds(count).map((id) => current.find((player) => player.id === id) ?? { id, ...defaultPlayerPositions[id] })
}

export class EditorService {
  #state = reactive({ game: emptyGame(), files: [], busy: false, message: '' })
  state = readonly(this.#state)

  reset() { this.#state.game = emptyGame() }
  clearMessage() { this.#state.message = '' }
  setField(field, value) {
    this.#state.game[field] = value
    this.#ensureBestOption()
  }
  setPlayerCount(value) {
    const count = clampSkaterCount(value)
    this.#state.game.num_players = count
    this.#state.game.players = makePlayers(count, this.#state.game.players)
    const ids = playerIds(count)
    if (!ids.includes(this.#state.game.possession_player_id)) this.#state.game.possession_player_id = ids[0]
    if (!ids.includes(this.#state.game.camera_player_id)) this.#state.game.camera_player_id = ids[0]
    this.#ensureBestOption()
  }
  setPlayerPosition(id, x, y) {
    const player = this.#state.game.players.find((item) => item.id === id)
    if (player) Object.assign(player, { x, y })
  }
  addSlot() {
    this.#state.game.slots.push({ id: `slot_${this.#state.game.slots.length + 1}`, x: 0, y: 0 })
    this.#ensureBestOption()
  }
  removeSlot(index) {
    this.#state.game.slots.splice(index, 1)
    this.#ensureBestOption()
  }
  setSlotPosition(index, axis, value) { this.#state.game.slots[index][axis] = Math.max(-1, Math.min(1, Number(value))) }
  moveSlot(id, x, y) {
    const slot = this.#state.game.slots.find((item) => item.id === id)
    if (slot) Object.assign(slot, { x, y })
  }
  async list() {
    const response = await fetch(gamesEndpoint)
    if (!response.ok) throw new Error('Could not load game list')
    this.#state.files = ((await response.json()).games ?? []).map((game) => typeof game === 'string' ? { file: game, name: game } : game)
  }
  async load(file) {
    await this.#request(file)
    const response = await fetch(`${gamesEndpoint}?file=${encodeURIComponent(file)}`)
    if (!response.ok) throw new Error('Could not load game')
    const loaded = { ...emptyGame(), ...(await response.json()) }
    loaded.num_players = clampSkaterCount(loaded.num_players || emptyGame().num_players)
    loaded.players = makePlayers(loaded.num_players, loaded.players ?? [])
    this.#state.game = loaded
    this.#ensureBestOption()
    this.#state.message = `Loaded ${loaded.name || file}`
  }
  async save(file = '') {
    if (!this.#state.game.name.trim()) throw new Error('Enter a game name first')
    const created = !file
    const saved = await this.#request(file, { method: created ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.#state.game) })
    this.#state.message = created ? 'Game created' : 'Changes saved'
    await this.list()
    return saved?.file ?? file
  }
  async delete(file) {
    if (!file) throw new Error('Select a game first')
    await this.#request(file, { method: 'DELETE' })
    this.reset(); this.#state.message = 'Game deleted'; await this.list()
  }
  async #request(file, options) {
    if (!options) return
    this.#state.busy = true
    try {
      const query = file ? `?file=${encodeURIComponent(file)}` : ''
      const response = await fetch(`${gamesEndpoint}${query}`, options)
      if (!response.ok) throw new Error((await response.json()).error ?? 'Request failed')
      return response.status === 204 ? null : response.json()
    } finally { this.#state.busy = false }
  }
  #ensureBestOption() {
    const options = bestOptionIds(this.#state.game)
    if (!options.includes(this.#state.game.best_option)) this.#state.game.best_option = options[0]
  }
}
