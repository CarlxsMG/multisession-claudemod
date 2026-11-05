// The orchestrator's critter: a round 8x9 body built from the parts of its
// look, on a podium a pixel thick, in the pose of its state.
import type { Look } from '../../types'
import { glyphsOf, poseBeat } from './anim'
import type { Arm, Pose } from './anim'
import { ACCS, BLINK, BLUSH, BODY, colorAt, COLORS, EYES, FACIALS, H, HAIRS, HEADROOM, MOUTHS, PODIUM, SHIRTS, SKINS, W } from './catalog'
import type { Layer } from './catalog'
import { EMPTY } from './raster'
import type { Picture } from './raster'

function shade(color: number, f = 0.72): number {
  const r = Math.round(((color >> 16) & 255) * f)
  const g = Math.round(((color >> 8) & 255) * f)
  const b = Math.round((color & 255) * f)
  return (r << 16) | (g << 8) | b
}

function letters(look: Look): Record<string, number> {
  const skin = colorAt(SKINS, look.skin)
  const hair = colorAt(COLORS, look.hairColor)
  const shirt = colorAt(COLORS, look.shirtColor)
  const pants = colorAt(COLORS, look.pants)
  const acc = colorAt(COLORS, look.accColor)
  return {
    S: skin,
    s: shade(skin, 0.82),
    H: hair,
    h: shade(hair),
    T: shirt,
    t: shade(shirt),
    P: pants,
    p: shade(pants),
    F: colorAt(COLORS, look.shoes),
    A: acc,
    a: shade(acc),
    E: 0x1b1b1b,
    W: 0xfafafa,
    K: 0x2a2a2a,
    L: 0x15151f,
    G: 0xbfe8ff,
    Y: 0xffc83d,
    y: 0xc9972a,
    R: 0xd93636,
    M: 0x7a2828,
    B: 0xf5a0b5,
  }
}

// A blank w x h grid and the two ways to draw on it, counted from `top`, the
// row the body starts on, with a count of the pixels that fell outside it.
function canvas(w: number, h: number, pal: Record<string, number>, top: number) {
  const px = new Array<number>(w * h).fill(EMPTY)
  let lost = 0
  const paint = (layer: Layer | undefined, dx = 0, dy = 0) => {
    if (layer === undefined) return
    layer.rows.forEach((row, ry) => {
      const y = top + layer.y + ry + dy
      for (let x = 0; x < row.length; x++) {
        const color = pal[row[x]!]
        if (color === undefined) continue
        if (y < 0 || y >= h || x + dx < 0 || x + dx >= w) lost++
        else px[y * w + x + dx] = color
      }
    })
  }
  const set = (x: number, y: number, color: number) => {
    const at = top + y
    if (at >= 0 && at < h && x >= 0 && x < w) px[at * w + x] = color
    else if (color !== EMPTY) lost++
  }
  return { px, paint, set, lost: () => lost }
}

/** The orchestrator's figure, built from its look, at one pose. */
export function picture(look: Look, pose: Pose): Picture {
  const w = W
  const h = HEADROOM + H + (pose.podium ? PODIUM : 0)
  const pal = letters(look)
  const b = poseBeat(pose)
  const { px, paint, set, lost } = canvas(w, h, pal, HEADROOM + Math.max(-1, b.dy))

  paint(BODY)
  paint(SHIRTS[look.shirt]?.layer)
  if (look.blush) paint(BLUSH)
  if (b.eyes === 'closed') paint(BLINK)
  else {
    const ex = b.eyes === 'left' ? -1 : b.eyes === 'right' ? 1 : 0
    const ey = b.eyes === 'up' ? -1 : b.eyes === 'down' ? 1 : 0
    paint(EYES[look.eyes]?.layer, ex, ey)
  }
  paint((b.yawn ? MOUTHS.open : MOUTHS[look.mouth])?.layer)
  paint(FACIALS[look.facial]?.layer)
  paint(HAIRS[look.hair]?.layer)
  paint(ACCS[look.acc]?.layer)

  // Paws, in the trousers' colour, rest at x 0 and 7 on row 6: a row up to
  // type, on the muzzle to think, beside the cheeks to cheer and the eyes to
  // wave.
  const paw = (x: number, kind: Arm | undefined) => {
    if (kind === undefined) return set(x, 6, pal.P!)
    if (kind === 'chin') return set(x === 0 ? 1 : 6, 5, pal.P!)
    set(x, kind === 'up' ? 5 : kind === 'high' ? 4 : 3, pal.P!)
  }
  paw(0, b.left)
  paw(7, b.right)

  // A tapping foot: the right one lifted a row.
  if (b.tap) {
    for (const x of [5, 6]) {
      set(x, 8, EMPTY)
      set(x, 7, pal.F!)
    }
  }

  if (pose.podium) {
    const y0 = HEADROOM + H
    for (let x = 0; x < w; x++) px[y0 * w + x] = pal.Y!
  }

  return { px, w, h, glyphs: glyphsOf(b, pose, w), lost: lost() }
}
