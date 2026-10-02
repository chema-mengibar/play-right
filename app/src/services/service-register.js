import { EditorService } from './EditorService.js'
import { SimulationService } from './SimulationService.js'
import { AnalyticsService } from './AnalyticsService.js'

export const serviceRegister = Object.freeze({
  analytics: new AnalyticsService(),
  editor: new EditorService(),
  simulation: new SimulationService(),
})
