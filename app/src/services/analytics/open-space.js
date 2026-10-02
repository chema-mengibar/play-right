import { opposingTeam, teamFromPlayerId } from './geometry.js'

export function drawOpenSpaceHeatMap({
  players = [],
  playerPositions,
  rink,
  toSvgPoint,
  getWorldPoint,
  activePlayerId,
  columns = 15,
  rows = 30,
}) {
  const activeTeam = teamFromPlayerId(activePlayerId || '')
  const opponentTeam = opposingTeam(activeTeam)
  const opponents = players
    .filter((player) => teamFromPlayerId(player.id) === opponentTeam)
    .map((player) => getWorldPoint?.(player.id) ?? playerPositions.get(player.id))
    .filter(Boolean)

  if (!opponents.length || !rink) return []

  const cellWidth = rink.width / columns
  const cellHeight = rink.height / rows
  const maxDistance = Math.hypot(cellWidth * 3.5, cellHeight * 3.5)

  const cells = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const world = {
        x: -rink.width / 2 + cellWidth * (column + 0.5),
        z: -rink.height / 2 + cellHeight * (row + 0.5),
      }
      const nearestOpponentDistance = Math.min(
        ...opponents.map((opponent) => Math.hypot(world.x - opponent.x, world.z - opponent.z))
      )
      const score = Math.min(1, nearestOpponentDistance / maxDistance)
      const topLeft = toSvgPoint({ position: { x: world.x - cellWidth / 2, z: world.z - cellHeight / 2 } })
      const bottomRight = toSvgPoint({ position: { x: world.x + cellWidth / 2, z: world.z + cellHeight / 2 } })
      cells.push({
        id: `${column}-${row}`,
        score,
        distance: nearestOpponentDistance,
        world: {
          x: world.x,
          z: world.z,
          width: cellWidth,
          height: cellHeight,
        },
        svg: {
          x: Math.min(topLeft.x, bottomRight.x),
          y: Math.min(topLeft.y, bottomRight.y),
          width: Math.abs(bottomRight.x - topLeft.x),
          height: Math.abs(bottomRight.y - topLeft.y),
        },
      })
    }
  }

  return cells
}
