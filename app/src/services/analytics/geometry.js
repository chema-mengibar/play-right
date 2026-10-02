export const teamFromPlayerId = (id) => id.split('_')[0]
export const opposingTeam = (team) => (team === 'home' ? 'guest' : 'home')

export function distanceToSegment(point, start, end) {
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

export function orderAroundCentroid(points) {
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

export function normalizeAngleRadians(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}
