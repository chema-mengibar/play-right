import {
  goalieRinkPosition as getGoalieRinkPosition,
  toPaddedRinkCoordinates as getPaddedRinkCoordinates,
} from './rink-geometry.js'

export function useGoalieRinkControls({ lateral, depth }) {
  const goalieControls = () => ({ lateral: lateral.value, depth: depth.value })

  return {
    goalieRinkPosition: (team) => getGoalieRinkPosition(team, goalieControls()),
    toPaddedRinkCoordinates: (point) => getPaddedRinkCoordinates(point, goalieControls()),
  }
}
