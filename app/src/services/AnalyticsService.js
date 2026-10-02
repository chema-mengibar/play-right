import { drawGoalieCoverageCone } from './analytics/goalie-coverage.js'
import { drawOpenSpaceHeatMap } from './analytics/open-space.js'
import { drawPassingLanes } from './analytics/passing-lanes.js'
import { drawPlayerAreas } from './analytics/player-areas.js'
import { drawTeamsAreas, removeTeamsAreas } from './analytics/team-areas.js'

export class AnalyticsService {
  drawTeamsAreas(args) { return drawTeamsAreas(args) }
  removeTeamsAreas() { return removeTeamsAreas() }
  drawPlayerAreas(args) { return drawPlayerAreas(args) }
  drawOpenSpaceHeatMap(args) { return drawOpenSpaceHeatMap(args) }
  drawPassingLanes(args) { return drawPassingLanes(args) }
  drawGoalieCoverageCone(args) { return drawGoalieCoverageCone(args) }
}
