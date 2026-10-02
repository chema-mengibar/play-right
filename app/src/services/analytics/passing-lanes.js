import { distanceToSegment, opposingTeam, teamFromPlayerId } from './geometry.js'

export function drawPassingLanes({
  players = [],
  playerPositions,
  toSvgPoint,
  getWorldPoint,
  activePlayerId,
  blockRadius = 1.5,
  partialRadius = 3,
}) {
  const activePlayer = players.find((player) => player.id === activePlayerId)
  const activePosition = activePlayerId ? getWorldPoint?.(activePlayerId) ?? playerPositions.get(activePlayerId) : null
  if (!activePlayer || !activePosition) return []

  const activeTeam = teamFromPlayerId(activePlayer.id)
  const teammates = players
    .filter((player) => player.id !== activePlayer.id && teamFromPlayerId(player.id) === activeTeam && !player.id.endsWith('_goalie'))
    .map((player) => ({
      player,
      position: getWorldPoint?.(player.id) ?? playerPositions.get(player.id),
    }))
    .filter(({ position }) => position)

  const opponents = players
    .filter((player) => teamFromPlayerId(player.id) === opposingTeam(activeTeam))
    .map((player) => ({
      player,
      position: getWorldPoint?.(player.id) ?? playerPositions.get(player.id),
    }))
    .filter(({ position }) => position)

  return teammates.map(({ player, position }) => {
    const nearestBlocker = opponents.reduce((nearest, opponent) => {
      const distance = distanceToSegment(opponent.position, activePosition, position)
      if (!nearest || distance < nearest.distance) return { id: opponent.player.id, distance }
      return nearest
    }, null)
    const status = nearestBlocker?.distance <= blockRadius
      ? 'blocked'
      : nearestBlocker?.distance <= partialRadius
        ? 'partial'
        : 'clear'

    return {
      id: `${activePlayer.id}-${player.id}`,
      fromId: activePlayer.id,
      toId: player.id,
      status,
      blockerId: nearestBlocker?.id ?? null,
      blockerDistance: nearestBlocker?.distance ?? null,
      start: toSvgPoint({ id: activePlayer.id, position: activePosition }),
      end: toSvgPoint({ id: player.id, position }),
      worldStart: { x: activePosition.x, z: activePosition.z },
      worldEnd: { x: position.x, z: position.z },
    }
  })
}
