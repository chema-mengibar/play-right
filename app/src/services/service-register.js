import { EditorService } from './EditorService.js'
import { SimulationService } from './SimulationService.js'

export const serviceRegister = Object.freeze({
  editor: new EditorService(),
  simulation: new SimulationService(),
})
