import * as THREE from 'three'

function heatMapColor(score) {
  return new THREE.Color().setHSL((8 + score * 138) / 360, 0.88, 0.48)
}

function passingLaneColor(status) {
  const colors = {
    clear: 0x31e65d,
    partial: 0xfeb836,
    blocked: 0xd91f32,
  }
  return colors[status] ?? colors.clear
}

function goalieCoverageColor(status) {
  const colors = {
    aligned: 0x31e65d,
    close: 0xfeb836,
    off: 0xd91f32,
  }
  return colors[status] ?? colors.close
}

function addAnalyticsLine({ group, start, end, color, opacity, renderOrder, disposeLater }) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(start.x, 0.13, start.z),
    new THREE.Vector3(end.x, 0.13, end.z),
  ])
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
  })
  const line = new THREE.Line(geometry, material)
  line.renderOrder = renderOrder
  disposeLater(geometry, material)
  group.add(line)
}

export function renderAnalyticsOverlays({
  group,
  clearGroup,
  disposeLater,
  heatMap = [],
  passingLanes = [],
  goalieCoverage = [],
  playerAreas = [],
  teamAreas = [],
  playerAreaRadius,
}) {
  clearGroup(group)
  const colors = { home: 0x172f8a, guest: 0xd91f32 }

  for (const cell of heatMap) {
    const geometry = new THREE.PlaneGeometry(cell.world.width, cell.world.height)
    const material = new THREE.MeshBasicMaterial({
      color: heatMapColor(cell.score),
      transparent: true,
      opacity: 0.18 + cell.score * 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(cell.world.x, 0.055, cell.world.z)
    mesh.renderOrder = 16
    disposeLater(geometry, material)
    group.add(mesh)
  }

  for (const lane of passingLanes) {
    addAnalyticsLine({
      group,
      start: lane.worldStart,
      end: lane.worldEnd,
      color: passingLaneColor(lane.status),
      opacity: 0.92,
      renderOrder: 19,
      disposeLater,
    })
  }

  for (const cone of goalieCoverage) {
    addAnalyticsLine({ group, start: cone.worldApex, end: cone.worldTarget, color: goalieCoverageColor(cone.status), opacity: 0.96, renderOrder: 21, disposeLater })
    addAnalyticsLine({ group, start: cone.worldApex, end: cone.worldFacing, color: 0xffffff, opacity: 0.74, renderOrder: 22, disposeLater })
    for (const post of cone.worldPosts) {
      addAnalyticsLine({ group, start: cone.worldApex, end: post, color: 0x6fb6ff, opacity: 0.54, renderOrder: 20, disposeLater })
    }
  }

  for (const area of playerAreas) {
    const geometry = new THREE.CircleGeometry(playerAreaRadius, 48)
    const material = new THREE.MeshBasicMaterial({
      color: colors[area.team] ?? 0x31e65d,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(area.world.x, 0.07, area.world.z)
    mesh.renderOrder = 17
    disposeLater(geometry, material)
    group.add(mesh)
  }

  for (const area of teamAreas) {
    if ((area.worldPoints?.length ?? 0) < 3) continue
    const shape = new THREE.Shape()
    area.worldPoints.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, -point.z)
      else shape.lineTo(point.x, -point.z)
    })
    shape.closePath()
    const geometry = new THREE.ShapeGeometry(shape)
    const material = new THREE.MeshBasicMaterial({
      color: colors[area.team] ?? 0x31e65d,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.065
    mesh.renderOrder = 18
    disposeLater(geometry, material)
    group.add(mesh)
  }
}
