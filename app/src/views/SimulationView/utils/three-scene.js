import * as THREE from 'three'

export function cropTexture(texture, spriteSheet, { column, row }) {
  const cropped = texture.clone()
  cropped.needsUpdate = true
  cropped.repeat.set(1 / spriteSheet.columns, 1 / spriteSheet.rows)
  cropped.offset.set(column / spriteSheet.columns, 1 - (row + 1) / spriteSheet.rows)
  return cropped
}

export function disposeObject(object) {
  object.traverse?.((child) => {
    child.geometry?.dispose?.()
    child.material?.map?.dispose?.()
    child.material?.dispose?.()
  })
}

export function clearGroup(group) {
  if (!group) return
  for (const child of [...group.children]) {
    group.remove(child)
    disposeObject(child)
  }
}

export function createFloorRect(center, size, material, y = 0.025) {
  const geometry = new THREE.PlaneGeometry(size.width, size.height)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(center.x, y, center.z)
  mesh.renderOrder = 5
  return mesh
}

export function createFloorCircle(center, radius, material, y = 0.026, segments = 64) {
  const geometry = new THREE.CircleGeometry(radius, segments)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(center.x, y, center.z)
  mesh.renderOrder = 6
  return mesh
}

export function createFloorRing(center, radius, thickness, material, y = 0.027, segments = 96) {
  const geometry = new THREE.RingGeometry(radius - thickness / 2, radius + thickness / 2, segments)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(center.x, y, center.z)
  mesh.renderOrder = 6
  return mesh
}

export function createGoalCrease({ goalLine, direction, fillMaterial, outlineMaterial, feetToWorld }) {
  const width = 8 * feetToWorld
  const radius = 6 * feetToWorld
  const outline = 2 / 12 * feetToWorld
  const sideDepth = Math.sqrt(radius ** 2 - (width / 2) ** 2)

  const createShape = (padding = 0) => {
    const halfWidth = width / 2 + padding
    const arcRadius = radius + padding
    const arcStart = Math.asin(halfWidth / arcRadius)
    const startAngle = direction > 0 ? -arcStart : Math.PI + arcStart
    const endAngle = direction > 0 ? arcStart : Math.PI - arcStart
    const shape = new THREE.Shape()
    shape.moveTo(0, -halfWidth)
    shape.lineTo(direction * sideDepth, -halfWidth)
    shape.absarc(0, 0, arcRadius, startAngle, endAngle, direction < 0)
    shape.lineTo(0, halfWidth)
    shape.lineTo(0, -halfWidth)
    return shape
  }

  const group = new THREE.Group()
  const outlineMesh = new THREE.Mesh(new THREE.ShapeGeometry(createShape(outline)), outlineMaterial)
  const fillMesh = new THREE.Mesh(new THREE.ShapeGeometry(createShape()), fillMaterial)
  for (const [index, mesh] of [outlineMesh, fillMesh].entries()) {
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(goalLine.x, 0.031 + index * 0.001, goalLine.z)
    mesh.renderOrder = 7 + index
    group.add(mesh)
  }
  return group
}

export function createDistanceLabel(text, disposeLater) {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 56
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgba(20, 20, 20, 0.82)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#ffffff'
  context.font = '700 28px Inter, Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  disposeLater(texture, material)
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(0.72, 0.25, 1)
  sprite.renderOrder = 50
  return sprite
}
