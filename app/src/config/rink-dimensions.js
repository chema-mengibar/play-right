export const RINKS = Object.freeze({
  standard: Object.freeze({ width: 60, height: 30 }),
})

export function toRinkCoordinates({ x, y }, rink = RINKS.standard) {
  return { x: y * rink.width / 2, y: -x * rink.height / 2 }
}
