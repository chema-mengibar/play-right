import { creaseDepth, creaseWidth, guestGoalLine, homeGoalLine, rinkPlacementPadding } from './rink-geometry.js'

export function closeupGoalCreasePath() {
  const centerX = 50
  const goalLineY = 9
  const width = 48
  const radius = width * (creaseDepth / creaseWidth)
  const halfWidth = width / 2
  const sideDepth = Math.sqrt(radius ** 2 - halfWidth ** 2)
  const endY = goalLineY + sideDepth
  return `M ${centerX - halfWidth} ${goalLineY} V ${endY} A ${radius} ${radius} 0 0 0 ${centerX + halfWidth} ${endY} V ${goalLineY} Z`
}

export function rinkWorldToCreaseCloseupPoint(position, team = 'home') {
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

export function goalieWorldYaw(team, rotationDegrees) {
  const base = team === 'home' ? Math.PI / 2 : -Math.PI / 2
  return base - rotationDegrees * Math.PI / 180
}
