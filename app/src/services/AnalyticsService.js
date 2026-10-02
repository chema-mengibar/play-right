const teamFromPlayerId = (id) => id.split('_')[0]
const opposingTeam = (team) => (team === 'home' ? 'guest' : 'home')

function distanceToSegment(point, start, end) {
  const segmentX = end.x - start.x
  const segmentZ = end.z - start.z
  const lengthSquared = segmentX ** 2 + segmentZ ** 2
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.z - start.z)

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / lengthSquared))
  const projected = {
    x: start.x + t * segmentX,
    z: start.z + t * segmentZ,
  }
  return Math.hypot(point.x - projected.x, point.z - projected.z)
}

function orderAroundCentroid(points) {
  const center = points.reduce((sum, point) => ({
    x: sum.x + point.svg.x,
    y: sum.y + point.svg.y,
  }), { x: 0, y: 0 })
  center.x /= points.length
  center.y /= points.length

  return [...points].sort((a, b) => (
    Math.atan2(a.svg.y - center.y, a.svg.x - center.x) -
    Math.atan2(b.svg.y - center.y, b.svg.x - center.x)
  ))
}

function normalizeAngleRadians(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

export function drawTeamsAreas({ players = [], playerPositions, toSvgPoint, getWorldPoint }) {
  const teams = new Map()
  for (const player of players) {
    if (player.id.endsWith('_goalie')) continue
    const position = getWorldPoint?.(player.id) ?? playerPositions.get(player.id)
    if (!position) continue
    const team = teamFromPlayerId(player.id)
    const point = {
      svg: toSvgPoint({ id: player.id, position }),
      world: { x: position.x, z: position.z },
    }
    if (!teams.has(team)) teams.set(team, [])
    teams.get(team).push(point)
  }

  return [...teams.entries()]
    .map(([team, points]) => {
      const polygon = orderAroundCentroid(points)
      return {
        team,
        points: polygon.map((point) => point.svg),
        worldPoints: polygon.map((point) => point.world),
      }
    })
    .filter(({ points }) => points.length >= 3)
}

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

export function removeTeamsAreas() {
  return []
}
