// Colours as the terminal is told them: hex, and on a terminal of 256
// colours the xterm colour nearest to the eye.

export const hex = (color: number) => '#' + color.toString(16).padStart(6, '0')

// Terminal.app before macOS 26 shows 256 colors, and the engine runs it at
// that depth: each color becomes one of xterm's 240 (16-255) by a formula,
// 16 + 36 * round(r / 255 * 5) + ..., that lifts mid and dark tones (dark
// sunglasses, #15151f, turn navy). There each color is drawn as the xterm one
// nearest to the eye, sent with channel values that formula and a plain
// nearest match both put on the levels xterm's cube has.
const LEVELS = [0, 95, 135, 175, 215, 255]
const SENT = [0, 64, 120, 166, 212, 255]

type Lab = readonly [number, number, number]

function toLab(color: number): Lab {
  const linear = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const r = linear((color >> 16) & 0xff)
  const g = linear((color >> 8) & 0xff)
  const b = linear(color & 0xff)
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

let xterm: { lab: Lab; sent: number }[] | undefined

// xterm's 216-color cube and 24 greys, each with the value sent for it.
function xtermColors() {
  if (xterm !== undefined) return xterm
  const list: { lab: Lab; sent: number }[] = []
  for (let i = 0; i < 216; i++) {
    const [r, g, b] = [Math.floor(i / 36), Math.floor(i / 6) % 6, i % 6]
    const shown = (LEVELS[r]! << 16) | (LEVELS[g]! << 8) | LEVELS[b]!
    // A grey of the cube is sent a step off grey: the formula puts an exact
    // grey on the grey ramp instead.
    const blue = r === g && g === b ? (b === 5 ? 254 : SENT[b]! + 1) : SENT[b]!
    list.push({ lab: toLab(shown), sent: (SENT[r]! << 16) | (SENT[g]! << 8) | blue })
  }
  for (let j = 0; j < 24; j++) {
    const v = 8 + 10 * j
    // The grey the formula's own ramp step, round((v - 8) / 247 * 24), gives back.
    const sent = Math.round(8 + (j * 247) / 24)
    list.push({ lab: toLab(v * 0x010101), sent: sent * 0x010101 })
  }
  xterm = list
  return list
}

const fitted = new Map<number, number>()

/**
 * The color to send for `color` so a 256-color terminal shows the xterm color
 * nearest to it; the terminal's default (or anything not 0xRRGGBB) as it is.
 */
export function fit256(color: number): number {
  if (!Number.isInteger(color) || color < 0 || color > 0xffffff) return color
  const known = fitted.get(color)
  if (known !== undefined) return known
  const [l, a, b] = toLab(color)
  let best = 0
  let far = Infinity
  for (const x of xtermColors()) {
    const d = (x.lab[0] - l) ** 2 + (x.lab[1] - a) ** 2 + (x.lab[2] - b) ** 2
    if (d < far) {
      far = d
      best = x.sent
    }
  }
  fitted.set(color, best)
  return best
}

let palette256 = false

/** Draws every color after this through fit256, or as it is again. */
export function setPalette256(on: boolean) {
  palette256 = on
}

/** A color as the terminal shows it: fitted to the 256 palette while that is on. */
export function onScreen(color: number): number {
  return palette256 ? fit256(color) : color
}

/**
 * A color prop as the pane paints it: a `#rrggbb` fitted while the palette is
 * on, a theme key (the engine fits those itself) or anything else as it is.
 */
export function paintColor(color: string): string {
  return palette256 && /^#[0-9a-f]{6}$/i.test(color) ? hex(fit256(parseInt(color.slice(1), 16))) : color
}
