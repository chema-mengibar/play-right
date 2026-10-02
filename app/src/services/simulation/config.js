export const gamesEndpoint = '/api/games'

export const cameraProfiles = {
  firstPerson: { fov: 65, near: 0.03, far: 160 },
  orbit: { fov: 45, near: 0.1, far: 220 },
}

export const cameraYawSpeed = Math.PI * 1.1
export const cameraMoveSpeed = 5
export const floorLineY = 0.08

export const sceneTheme = {
  real: {
    background: 0x151a20,
    fog: 0x151a20,
    surface: 0xe9f4f8,
    wall: 0xd7d3c8,
    roughness: 0.48,
  },
  cartoon: {
    background: 0xbfe9ff,
    fog: 0xbfe9ff,
    surface: 0xf6fbff,
    wall: 0x34b3ff,
    roughness: 0.82,
  },
}
