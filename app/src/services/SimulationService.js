import { reactive, readonly } from 'vue'

export class SimulationService {
  #state = reactive({ game: null, startedAt: null, selectedAction: null, resolved: false })
  state = readonly(this.#state)

  load(game) {
    this.#state.game = game
    this.#state.startedAt = performance.now()
    this.#state.selectedAction = null
    this.#state.resolved = false
  }

  select(action) { this.#state.selectedAction = action }
  resolve() { this.#state.resolved = true }
}
