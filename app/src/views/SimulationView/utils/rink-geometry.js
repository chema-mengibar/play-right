import { RINKS } from '../../../config/rink-dimensions.js'
import { toRinkCoordinates } from '../../../config/rink-dimensions.js'
export { defaultGame } from '../../../services/simulation/default-game.js'

export const spriteSheet = { columns: 4, rows: 3 }
export const playerSpriteSize = 1.6
export const rinkPlacementPadding = playerSpriteSize / 2
export const playerSpriteCenterY = playerSpriteSize / 2
export const rinkMapSvg = { width: 190, height: 330 }
export const feetToWorld = RINKS.standard.width / 200
export const goalLineFromEnd = 11 * feetToWorld
export const blueLineFromEnd = 75 * feetToWorld
export const endZoneFaceoffFromEnd = 31 * feetToWorld
export const endZoneFaceoffOffset = 22 * feetToWorld
export const faceoffCircleRadius = 15 * feetToWorld
export const faceoffDotRadius = 1 * feetToWorld
export const playerAreaRadius = 2
export const creaseWidth = 8 * feetToWorld
export const creaseDepth = 6 * feetToWorld
export const goalWidth = 1.83

export const homeGoalLine = { x: -RINKS.standard.width / 2 + goalLineFromEnd, z: 0 }
export const guestGoalLine = { x: RINKS.standard.width / 2 - goalLineFromEnd, z: 0 }
export const homeBlueLine = { x: -RINKS.standard.width / 2 + blueLineFromEnd, z: 0 }
export const guestBlueLine = { x: RINKS.standard.width / 2 - blueLineFromEnd, z: 0 }
export const endZoneFaceoffCenters = [
  { x: -RINKS.standard.width / 2 + endZoneFaceoffFromEnd, z: -endZoneFaceoffOffset },
  { x: -RINKS.standard.width / 2 + endZoneFaceoffFromEnd, z: endZoneFaceoffOffset },
  { x: RINKS.standard.width / 2 - endZoneFaceoffFromEnd, z: -endZoneFaceoffOffset },
  { x: RINKS.standard.width / 2 - endZoneFaceoffFromEnd, z: endZoneFaceoffOffset },
]

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
export const formatMeters = (value) => `${value.toFixed(2)} m`
export const formatDegrees = (value) => `${Math.round(value)} deg`

export function clampRinkPosition(x, z) {
  return {
    x: clamp(x, -RINKS.standard.width / 2 + rinkPlacementPadding, RINKS.standard.width / 2 - rinkPlacementPadding),
    z: clamp(z, -RINKS.standard.height / 2 + rinkPlacementPadding, RINKS.standard.height / 2 - rinkPlacementPadding),
  }
}

export function goalieRinkPosition(team, { lateral = 0, depth = 0 } = {}) {
  const direction = team === 'home' ? 1 : -1
  const goalLine = team === 'home' ? homeGoalLine : guestGoalLine
  const maxLateral = creaseWidth * 0.75
  return {
    x: goalLine.x + direction * (rinkPlacementPadding + depth * creaseDepth),
    y: lateral * maxLateral,
  }
}

export function toPaddedRinkCoordinates(point, goalieControls = {}) {
  if (point.id === 'home_goalie') return goalieRinkPosition('home', goalieControls)
  if (point.id === 'guest_goalie') return goalieRinkPosition('guest', goalieControls)

  const position = toRinkCoordinates(point, RINKS.standard)
  return {
    x: clamp(position.x, -RINKS.standard.width / 2 + rinkPlacementPadding, RINKS.standard.width / 2 - rinkPlacementPadding),
    y: clamp(position.y, -RINKS.standard.height / 2 + rinkPlacementPadding, RINKS.standard.height / 2 - rinkPlacementPadding),
  }
}

export function spriteTileForPlayer(id) {
  if (id.endsWith('_goalie')) return { column: 0, row: 2 }
  const number = Math.max(1, Number(id.split('_')[1]) || 1)
  const index = (number - 1) % (spriteSheet.columns * spriteSheet.rows)
  return { column: index % spriteSheet.columns, row: Math.floor(index / spriteSheet.columns) }
}
