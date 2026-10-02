import { normalizeAngleRadians, opposingTeam, teamFromPlayerId } from './geometry.js'

export function drawGoalieCoverageCone({
  players = [],
  playerPositions,
  toSvgPoint,
  getWorldPoint,
  activePlayerId,
  homeGoalLine,
  guestGoalLine,
  goalWidth,
  goalieRotationDegrees = 0,
}) {
  const activePlayer = players.find((player) => player.id === activePlayerId)
  const targetPosition = activePlayerId ? getWorldPoint?.(activePlayerId) ?? playerPositions.get(activePlayerId) : null
  if (!activePlayer || !targetPosition) return []

  const goalieTeam = opposingTeam(teamFromPlayerId(activePlayer.id))
  const goalieId = `${goalieTeam}_goalie`
  const goaliePosition = getWorldPoint?.(goalieId) ?? playerPositions.get(goalieId)
  const goalLine = goalieTeam === 'home' ? homeGoalLine : guestGoalLine
  if (!goaliePosition || !goalLine) return []

  const direction = goalieTeam === 'home' ? 1 : -1
  const baseAngle = goalieTeam === 'home' ? Math.PI / 2 : -Math.PI / 2
  const facingAngle = baseAngle - goalieRotationDegrees * Math.PI / 180
  const targetAngle = Math.atan2(targetPosition.z - goaliePosition.z, targetPosition.x - goaliePosition.x)
  const angleError = Math.abs(normalizeAngleRadians(targetAngle - facingAngle))
  const status = angleError <= Math.PI / 15 ? 'aligned' : angleError <= Math.PI / 6 ? 'close' : 'off'
  const postA = { x: goalLine.x, z: -goalWidth / 2 }
  const postB = { x: goalLine.x, z: goalWidth / 2 }
  const facingDistance = Math.max(2.5, Math.hypot(targetPosition.x - goaliePosition.x, targetPosition.z - goaliePosition.z))
  const facingPoint = {
    x: goaliePosition.x + Math.cos(facingAngle) * facingDistance,
    z: goaliePosition.z + Math.sin(facingAngle) * facingDistance,
  }

  return [{
    id: `${goalieId}-${activePlayer.id}`,
    team: goalieTeam,
    status,
    angleErrorDegrees: angleError * 180 / Math.PI,
    apex: toSvgPoint({ id: goalieId, position: goaliePosition }),
    target: toSvgPoint({ id: activePlayer.id, position: targetPosition }),
    posts: [
      toSvgPoint({ position: postA }),
      toSvgPoint({ position: postB }),
    ],
    facing: toSvgPoint({ position: facingPoint }),
    worldApex: { x: goaliePosition.x, z: goaliePosition.z },
    worldTarget: { x: targetPosition.x, z: targetPosition.z },
    worldPosts: [postA, postB],
    worldFacing: facingPoint,
    direction,
  }]
}
