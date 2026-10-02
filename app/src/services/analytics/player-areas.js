import { teamFromPlayerId } from './geometry.js'

export function drawPlayerAreas({ players = [], playerPositions, toSvgPoint, getWorldPoint }) {
  return players
    .filter((player) => !player.id.endsWith('_goalie'))
    .map((player) => {
      const position = getWorldPoint?.(player.id) ?? playerPositions.get(player.id)
      if (!position) return null
      return {
        id: player.id,
        team: teamFromPlayerId(player.id),
        center: toSvgPoint({ id: player.id, position }),
        world: { x: position.x, z: position.z },
      }
    })
    .filter(Boolean)
}
