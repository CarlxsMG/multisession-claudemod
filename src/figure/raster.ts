// A picture's pixels for the surface that shows it: cells for a terminal
// Raster, two pixels to a cell in half blocks, or an SVG elsewhere.
import { toBase64 } from '../util/base64'
import { hex, onScreen } from './color256'

/** The pixel values for the surface's own color and for no pixel at all. */
export const DEFAULT_COLOR = 0x01000000
export const EMPTY = -1

/** A character drawn over a picture, by its cell. */
export type Glyph = { col: number; row: number; ch: string; color: number }

/** `lost`: pixels drawn outside the box, which it cannot show. */
export type Picture = { px: number[]; w: number; h: number; glyphs: Glyph[]; lost?: number }

function scaled(pic: Picture, k: number): Picture {
  if (k === 1) return pic
  const w = pic.w * k
  const h = pic.h * k
  const px = new Array<number>(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      px[y * w + x] = pic.px[Math.floor(y / k) * pic.w + Math.floor(x / k)]!
    }
  }
  const glyphs = pic.glyphs.map(g => ({ ...g, col: g.col === 0 ? 0 : w - g.ch.length }))
  return { px, w, h, glyphs }
}

/** A picture as a terminal Raster takes it: its cells' text and size. */
export type Cells = { cells: string; columns: number; rows: number }

/**
 * Two vertical pixels per cell. With both painted, the lower half block takes
 * the bottom pixel as its foreground and the top one as its background: where
 * a font's block is shorter than the line (SF Mono's: 1 em in a 1.19 em
 * line), what the glyph leaves uncovered at the top is the top pixel's own
 * color. Alone, a pixel takes its half block over the terminal's background.
 */
export function toCells(source: Picture, scale = 1): Cells {
  const { px, w, h, glyphs } = scaled(source, scale)
  const rows = Math.ceil(h / 2)
  const words = new Uint32Array(w * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < w; c++) {
      const top = px[2 * r * w + c] ?? EMPTY
      const bottom = 2 * r + 1 < h ? (px[(2 * r + 1) * w + c] ?? EMPTY) : EMPTY
      const i = (r * w + c) * 3
      if (top !== EMPTY && bottom !== EMPTY) {
        words[i] = 0x2584
        words[i + 1] = onScreen(bottom)
        words[i + 2] = onScreen(top)
      } else if (top !== EMPTY) {
        words[i] = 0x2580
        words[i + 1] = onScreen(top)
        words[i + 2] = DEFAULT_COLOR
      } else if (bottom !== EMPTY) {
        words[i] = 0x2584
        words[i + 1] = onScreen(bottom)
        words[i + 2] = DEFAULT_COLOR
      } else {
        words[i] = 0x20
        words[i + 1] = DEFAULT_COLOR
        words[i + 2] = DEFAULT_COLOR
      }
    }
  }
  // A mark's padding lets the pixels beneath it show.
  for (const g of glyphs) {
    for (let k = 0; k < g.ch.length; k++) {
      const c = g.col + k
      if (c < 0 || c >= w || g.row >= rows || g.ch[k] === ' ') continue
      const i = (g.row * w + c) * 3
      words[i] = g.ch.charCodeAt(k)
      words[i + 1] = onScreen(g.color)
      words[i + 2] = DEFAULT_COLOR
    }
  }
  return { cells: toBase64(new Uint8Array(words.buffer)), columns: w, rows }
}

/** The same pixels for surfaces that draw SVG instead of cells. */
export function toSvg(pic: Picture, size = 6): string {
  const rects: string[] = []
  for (let y = 0; y < pic.h; y++) {
    let x = 0
    while (x < pic.w) {
      const color = pic.px[y * pic.w + x]!
      let run = 1
      while (x + run < pic.w && pic.px[y * pic.w + x + run] === color) run++
      if (color !== EMPTY) {
        rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${hex(color)}"/>`)
      }
      x += run
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pic.w} ${pic.h}" ` +
    `width="${pic.w * size}" height="${pic.h * size}" shape-rendering="crispEdges">` +
    rects.join('') +
    '</svg>'
  )
}
