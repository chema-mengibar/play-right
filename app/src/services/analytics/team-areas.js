import { orderAroundCentroid, teamFromPlayerId } from './geometry.js'

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

export function removeTeamsAreas() {
  return []
}
