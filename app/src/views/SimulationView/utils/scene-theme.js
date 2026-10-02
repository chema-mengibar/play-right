import * as THREE from 'three'
import { sceneTheme } from '../../../services/simulation/config.js'

export function createRinkMaterials() {
  return {
    surface: new THREE.MeshStandardMaterial({
      color: 0xe9f4f8,
      roughness: 0.48,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: 0xd7d3c8,
      roughness: 0.72,
      side: THREE.DoubleSide,
    }),
  }
}

export function applySceneTheme({ scene, cartoonMode, surfaceMaterial, wallMaterial }) {
  if (!scene) return
  const theme = cartoonMode ? sceneTheme.cartoon : sceneTheme.real
  scene.background = new THREE.Color(theme.background)
  scene.fog = new THREE.Fog(theme.fog, cartoonMode ? 34 : 28, cartoonMode ? 92 : 82)
  surfaceMaterial.color.setHex(theme.surface)
  surfaceMaterial.roughness = theme.roughness
  surfaceMaterial.metalness = cartoonMode ? 0 : 0.02
  wallMaterial.color.setHex(theme.wall)
  wallMaterial.roughness = cartoonMode ? 0.55 : 0.72
  surfaceMaterial.needsUpdate = true
  wallMaterial.needsUpdate = true
}
