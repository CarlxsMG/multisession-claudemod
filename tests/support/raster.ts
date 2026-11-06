// Reads back what the figures paint: a Raster's cells, the characters and
// pixels they hold, and the colors a terminal shows for them.
import { DEFAULT_COLOR } from '../../src/figure/raster'

// A Raster's cells decoded, [codePoint, foreground, background] each.
export const cellsOf = (cells: string): [number, number, number][] => {
  const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
  return Array.from({ length: words.length / 3 }, (_, i) => [words[3 * i]!, words[3 * i + 1]!, words[3 * i + 2]!])
}

// The two pixels each cell paints, read back into a picture's grid (-1 where
// the terminal's background shows).
export const pixelsOf = (cells: [number, number, number][], w: number, h: number): number[] => {
  const px = new Array<number>(w * h).fill(-1)
  const own = (c: number) => (c === DEFAULT_COLOR ? -1 : c)
  cells.forEach(([ch, fg, bg], i) => {
    const r = Math.floor(i / w)
    const c = i % w
    const [top, bottom] = ch === 0x2580 ? [own(fg), own(bg)] : ch === 0x2584 ? [own(bg), own(fg)] : [-1, -1]
    px[2 * r * w + c] = top
    if (2 * r + 1 < h) px[(2 * r + 1) * w + c] = bottom
  })
  return px
}

// The engine's own cut to 256 colors (ansi-styles' rgbToAnsi256), and what
// xterm shows for each of its colors 16-255.
export const xtermIndex = (c: number): number => {
  const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255]
  if (r === g && g === b) return r < 8 ? 16 : r > 248 ? 231 : Math.round(((r - 8) / 247) * 24) + 232
  return 16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5)
}
export const XTERM_LEVELS = [0, 95, 135, 175, 215, 255]
export const xtermColor = (i: number): number =>
  i >= 232
    ? (8 + 10 * (i - 232)) * 0x010101
    : (XTERM_LEVELS[Math.floor((i - 16) / 36)]! << 16) | (XTERM_LEVELS[Math.floor((i - 16) / 6) % 6]! << 8) | XTERM_LEVELS[(i - 16) % 6]!

export const PALETTE_CASES = [
  ['Terminal.app', { TERM_PROGRAM: 'Apple_Terminal' }, true],
  ['Terminal.app told it shows 24-bit color', { TERM_PROGRAM: 'Apple_Terminal', COLORTERM: 'truecolor' }, false],
  ['Terminal.app with FORCE_COLOR=3', { TERM_PROGRAM: 'Apple_Terminal', FORCE_COLOR: '3' }, false],
  ['another terminal', { TERM_PROGRAM: 'iTerm.app' }, false],
  ['a terminal that names none, such as Windows Terminal', {}, false],
] as const

// The characters a Raster's cells hold: a word of three per cell, the first
// the character.
export function cellText(cells: string): string {
  const bytes = atob(cells)
  let out = ''
  for (let i = 0; i < bytes.length; i += 12) out += String.fromCharCode(bytes.charCodeAt(i) | (bytes.charCodeAt(i + 1) << 8))
  return out
}
