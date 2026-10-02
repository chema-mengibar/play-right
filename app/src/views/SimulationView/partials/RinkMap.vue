<script setup>
import { computed, inject } from 'vue'
import {
  endZoneFaceoffCenters,
  faceoffCircleRadius,
  guestBlueLine,
  guestGoalLine,
  homeBlueLine,
  homeGoalLine,
  playerAreaRadius,
  rinkMapSvg,
} from '../utils/rink-geometry.js'
import {
  analyticsPlayerAreaClass,
  analyticsTeamClass,
  goalieCoverageClass,
  heatMapCellStyle,
  passingLaneClass,
  rinkSvgCenterCircle,
  rinkSvgCircle,
  rinkSvgGoalCreasePath,
  rinkSvgPoint,
  rinkSvgPoints,
} from '../utils/map-rendering.js'

const simulation = inject('services').simulation
const map = computed(() => simulation.state.map)
</script>

<template>
  <svg class="simulation-map__rink" :viewBox="`0 0 ${rinkMapSvg.width} ${rinkMapSvg.height}`" aria-hidden="true">
    <g data-debug="analytics">
      <rect v-for="cell in map.heatMap" :key="cell.id" :x="cell.svg.x" :y="cell.svg.y" :width="cell.svg.width" :height="cell.svg.height" class="simulation-map__heat-cell" :style="heatMapCellStyle(cell)" />
      <line v-for="lane in map.passingLanes" :key="lane.id" :x1="lane.start.x" :y1="lane.start.y" :x2="lane.end.x" :y2="lane.end.y" :class="passingLaneClass(lane.status)" />
      <g v-for="cone in map.goalieCoverage" :key="cone.id" :class="goalieCoverageClass(cone.status)">
        <line v-for="(post, index) in cone.posts" :key="`post-${index}`" :x1="cone.apex.x" :y1="cone.apex.y" :x2="post.x" :y2="post.y" class="simulation-map__goalie-coverage-post" />
        <line :x1="cone.apex.x" :y1="cone.apex.y" :x2="cone.target.x" :y2="cone.target.y" class="simulation-map__goalie-coverage-target" />
        <line :x1="cone.apex.x" :y1="cone.apex.y" :x2="cone.facing.x" :y2="cone.facing.y" class="simulation-map__goalie-coverage-facing" />
      </g>
      <ellipse v-for="area in map.playerAreas" :key="area.id" :cx="area.center.x" :cy="area.center.y" :rx="rinkSvgCircle({ x: 0, z: 0 }, playerAreaRadius).radius.x" :ry="rinkSvgCircle({ x: 0, z: 0 }, playerAreaRadius).radius.y" :class="analyticsPlayerAreaClass(area.team)" />
      <polygon v-for="area in map.teamAreas" :key="area.team" :points="rinkSvgPoints(area.points)" :class="analyticsTeamClass(area.team)" />
    </g>
    <path :d="rinkSvgGoalCreasePath(homeGoalLine, 1)" class="simulation-map__rink-crease" />
    <path :d="rinkSvgGoalCreasePath(guestGoalLine, -1)" class="simulation-map__rink-crease" />
    <line x1="0" :y1="rinkSvgPoint(homeGoalLine).y" :x2="rinkMapSvg.width" :y2="rinkSvgPoint(homeGoalLine).y" class="simulation-map__rink-line" />
    <line x1="0" :y1="rinkSvgPoint(guestGoalLine).y" :x2="rinkMapSvg.width" :y2="rinkSvgPoint(guestGoalLine).y" class="simulation-map__rink-line" />
    <line x1="0" :y1="rinkSvgPoint({ x: 0, z: 0 }).y" :x2="rinkMapSvg.width" :y2="rinkSvgPoint({ x: 0, z: 0 }).y" class="simulation-map__rink-line simulation-map__rink-line--center" />
    <line x1="0" :y1="rinkSvgPoint(homeBlueLine).y" :x2="rinkMapSvg.width" :y2="rinkSvgPoint(homeBlueLine).y" class="simulation-map__rink-blue-line" />
    <line x1="0" :y1="rinkSvgPoint(guestBlueLine).y" :x2="rinkMapSvg.width" :y2="rinkSvgPoint(guestBlueLine).y" class="simulation-map__rink-blue-line" />
    <ellipse :cx="rinkSvgCenterCircle().center.x" :cy="rinkSvgCenterCircle().center.y" :rx="rinkSvgCenterCircle().radius.x" :ry="rinkSvgCenterCircle().radius.y" class="simulation-map__rink-circle" />
    <ellipse v-for="(circle, index) in endZoneFaceoffCenters" :key="`faceoff-${index}`" :cx="rinkSvgCircle(circle, faceoffCircleRadius).center.x" :cy="rinkSvgCircle(circle, faceoffCircleRadius).center.y" :rx="rinkSvgCircle(circle, faceoffCircleRadius).radius.x" :ry="rinkSvgCircle(circle, faceoffCircleRadius).radius.y" class="simulation-map__rink-circle" />
    <circle :cx="rinkSvgPoint({ x: 0, z: 0 }).x" :cy="rinkSvgPoint({ x: 0, z: 0 }).y" r="2.2" class="simulation-map__rink-dot" />
    <circle v-for="(circle, index) in endZoneFaceoffCenters" :key="`faceoff-dot-${index}`" :cx="rinkSvgPoint(circle).x" :cy="rinkSvgPoint(circle).y" r="2.2" class="simulation-map__rink-dot" />
    <template v-for="player in map.playerMarkers" :key="player.id">
      <polygon v-if="player.isCamera" points="0,-3.8 -3.6,3.8 3.6,3.8" class="simulation-map__player-camera" :transform="player.cameraTransform" />
      <circle v-else :cx="player.point.x" :cy="player.point.y" r="4" class="simulation-map__player" :class="[`simulation-map__player--${player.team}`, { 'with-ball': player.hasPuck }]" />
      <circle v-if="map.solutionPlayerId === player.id" :cx="player.point.x" :cy="player.point.y" r="7" class="simulation-map__solution-player" />
    </template>
    <rect v-for="slot in map.slotMarkers" :key="slot.id" :x="slot.point.x - 5" :y="slot.point.y - 5" width="10" height="10" class="simulation-map__slot" />
  </svg>
</template>
