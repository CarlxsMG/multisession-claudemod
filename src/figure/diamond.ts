// A worker is a diamond drawn in outline in its accent, in text: box-drawing
// diagonals, which Windows Terminal draws itself from corner to corner and
// which Cascadia Mono and SF Mono both have, meet in a diamond with nothing
// inside. Half-block pixels, two to a cell, are too coarse for an empty
// diamond in four columns. It takes the middle two columns of two rows: the
// cells beside its top half keep the mail and the mark, and those beside its
// bottom half the pair of signs that sets it apart.
import { RED, glyphsOf, poseBeat, poseTime } from './anim'
import type { Beat, Pose } from './anim'
import { hex } from './color256'
import { EMPTY } from './raster'
import type { Glyph, Picture } from './raster'

/** A worker's diamond in terminal columns. */
export const DIAMOND_W = 4
/** A worker's diamond in terminal rows. */
export const DIAMOND_ROWS = 2

// Its four sides, from the left corner round: each a cell and its diagonal.
const SIDES: readonly (readonly [number, number, string])[] = [
  [1, 0, '╱'],
  [2, 0, '╲'],
  [2, 1, '╱'],
  [1, 1, '╲'],
]

/**
 * The signs either side of a worker's diamond, by its seed, in its outline:
 * none, or a pair, so the accent and the pair together tell the crew apart.
 */
export const SIGNS: readonly (readonly [string, string])[] = [
  [' ', ' '],
  ['·', '·'],
  ['+', '+'],
  ['×', '×'],
  ['○', '○'],
  ['◊', '◊'],
  ['‹', '›'],
  ['›', '‹'],
  ['=', '='],
]

/** The pair of signs a worker's diamond carries, from its seed. */
export const signsOf = (seed: number): readonly [string, string] => SIGNS[(seed >>> 7) % SIGNS.length]!

function mix(color: number, to: number, f: number): number {
  const ch = (shift: number) => {
    const a = (color >> shift) & 255
    return Math.round(a + (((to >> shift) & 255) - a) * f)
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// How a state shows on the diamond, besides the mark in its corner (the
// figures' own, from `beat`): the outline at full colour while it works or
// waits, faded toward grey while it sleeps, rests or was stopped, red once
// it failed, light for a moment with each hop of a cheer. One starting draws
// itself in, a side at a time.
function outlineOf(color: number, pose: Pose, b: Beat): { color: number; sides: number } {
  const t = poseTime(pose)
  switch (pose.anim) {
    case 'failed':
      return { color: RED, sides: 4 }
    case 'sleep':
    case 'stopped':
    case 'done':
      return { color: mix(color, 0x808080, 0.55), sides: 4 }
    case 'happy':
      return { color: b.dy < 0 ? mix(color, 0xffffff, 0.6) : color, sides: 4 }
    case 'starting':
      return { color, sides: Math.min(4, (t % 8) + 1) }
    default:
      return { color, sides: 4 }
  }
}

/** A worker's figure: its diamond in its accent, at one pose. */
export function diamond(seed: number, color: number, pose: Pose): Picture {
  const w = DIAMOND_W
  const h = DIAMOND_ROWS * 2
  const b = poseBeat(pose)
  const line = outlineOf(color, pose, b)
  const [left, right] = signsOf(seed)
  const glyphs: Glyph[] = SIDES.slice(0, line.sides).map(([col, row, ch]) => ({ col, row, ch, color: line.color }))
  if (left !== ' ') glyphs.push({ col: 0, row: 1, ch: left, color: line.color })
  if (right !== ' ') glyphs.push({ col: w - 1, row: 1, ch: right, color: line.color })
  glyphs.push(...glyphsOf(b, pose, w))
  return { px: new Array<number>(w * h).fill(EMPTY), w, h, glyphs }
}

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The diamond where SVG draws instead of cells: its outline a polygon, stroke
 * only, on the same grid as the cells, a cell one unit wide and two tall,
 * with its signs and its marks as text beside it.
 */
export function diamondSvg(seed: number, color: number, pose: Pose, size = 5): string {
  const b = poseBeat(pose)
  const line = outlineOf(color, pose, b)
  const corners = [
    [1, 2],
    [2, 0.15],
    [3, 2],
    [2, 3.85],
  ] as const
  const path = line.sides === 4 ? corners : [...corners, corners[0]].slice(0, line.sides + 1)
  const drawn = path.map(([x, y]) => `${x},${y}`).join(' ')
  const stroke = `fill="none" stroke="${hex(line.color)}" stroke-width="0.18" stroke-linejoin="round"`
  const shape = line.sides === 4 ? `<polygon points="${drawn}" ${stroke}/>` : `<polyline points="${drawn}" ${stroke}/>`
  const text = (x: number, y: number, ch: string, fill: number) =>
    `<text x="${x}" y="${y}" font-size="1.6" text-anchor="middle" dominant-baseline="central" fill="${hex(fill)}">${xml(ch)}</text>`
  const [left, right] = signsOf(seed)
  const marks = [
    ...(left !== ' ' ? [text(0.5, 3, left, line.color)] : []),
    ...(right !== ' ' ? [text(3.5, 3, right, line.color)] : []),
    ...glyphsOf(b, pose, DIAMOND_W).map(g => text(g.col + 0.5, 1, g.ch, g.color)),
  ]
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DIAMOND_W} ${DIAMOND_ROWS * 2}" ` +
    `width="${DIAMOND_W * size}" height="${DIAMOND_ROWS * 2 * size}">` +
    shape +
    marks.join('') +
    '</svg>'
  )
}
