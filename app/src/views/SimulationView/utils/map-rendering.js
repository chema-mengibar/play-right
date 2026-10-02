import { RINKS } from '../../../config/rink-dimensions.js'
import { creaseDepth, creaseWidth, rinkMapSvg } from './rink-geometry.js'

export function rinkWorldToMapPoint(position) {
  return {
    x: 50 + (position.z / (RINKS.standard.height / 2)) * 45,
    y: 50 - (position.x / (RINKS.standard.width / 2)) * 45,
  }
}

export function rinkWorldToFullMapPoint(position) {
  return {
    x: 50 + (position.z / (RINKS.standard.height / 2)) * 50,
    y: 50 - (position.x / (RINKS.standard.width / 2)) * 50,
  }
}

export function mapPointToRinkSvgPoint(point) {
  return {
    x: point.x / 100 * rinkMapSvg.width,
    y: point.y / 100 * rinkMapSvg.height,
  }
}

export function mapCircleRadius(radius) {
  return {
    x: (radius / RINKS.standard.height) * 100,
    y: (radius / RINKS.standard.width) * 100,
  }
}

export function rinkSvgCenterCircle() {
  const radius = mapCircleRadius(15 * RINKS.standard.width / 200)
  return {
    center: mapPointToRinkSvgPoint(rinkWorldToFullMapPoint({ x: 0, z: 0 })),
    radius: {
      x: radius.x / 100 * rinkMapSvg.width,
      y: radius.y / 100 * rinkMapSvg.height,
    },
  }
}

export function rinkSvgCircle(center, radius) {
  const mapRadius = mapCircleRadius(radius)
  return {
    center: mapPointToRinkSvgPoint(rinkWorldToFullMapPoint(center)),
    radius: {
      x: mapRadius.x / 100 * rinkMapSvg.width,
      y: mapRadius.y / 100 * rinkMapSvg.height,
    },
  }
}

export function rinkSvgPoint(position) {
  return mapPointToRinkSvgPoint(rinkWorldToFullMapPoint(position))
}

export function rinkSvgPoints(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

export function rinkSvgGoalCreasePath(goalLine, direction) {
  const center = mapPointToRinkSvgPoint(rinkWorldToFullMapPoint(goalLine))
  const width = (creaseWidth / RINKS.standard.height) * rinkMapSvg.width
  const radiusX = (creaseDepth / RINKS.standard.height) * rinkMapSvg.width
  const radiusY = (creaseDepth / RINKS.standard.width) * rinkMapSvg.height
  const realSideDepth = Math.sqrt(creaseDepth ** 2 - (creaseWidth / 2) ** 2)
  const sideDepth = (realSideDepth / RINKS.standard.width) * rinkMapSvg.height
  const endY = direction > 0 ? center.y - sideDepth : center.y + sideDepth
  const sweep = direction > 0 ? 0 : 1
  return `M ${center.x - width / 2} ${center.y} L ${center.x - width / 2} ${endY} A ${radiusX} ${radiusY} 0 0 ${sweep} ${center.x + width / 2} ${endY} L ${center.x + width / 2} ${center.y} Z`
}

export function heatMapCellStyle(cell) {
  const hue = 8 + cell.score * 138
  const alpha = 0.18 + cell.score * 0.34
  return {
    fill: `hsla(${hue}, 88%, 48%, ${alpha})`,
  }
}

export function analyticsTeamClass(team) {
  return `simulation-map__analytics-area simulation-map__analytics-area--${team}`
}

export function analyticsPlayerAreaClass(team) {
  return `simulation-map__analytics-player-area simulation-map__analytics-player-area--${team}`
}

export function passingLaneClass(status) {
  return `simulation-map__passing-lane simulation-map__passing-lane--${status}`
}

export function goalieCoverageClass(status) {
  return `simulation-map__goalie-coverage simulation-map__goalie-coverage--${status}`
}
