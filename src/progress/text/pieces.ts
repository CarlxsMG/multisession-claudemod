// A placed row as pieces of text, each with the role that colours it.
import { cut } from '../../util/text'

// A piece of a placed row, by what it says: the drawing colors it.
export type Role = 'head' | 'crew' | 'name' | 'phase' | 'step' | 'time' | 'doing' | 'done' | 'failed' | 'stopped'
/** A piece of a placed row's text, by what it says (`role`), with the worker it names (`id`). */
export type Piece = { text: string; role: Role; id?: string }

/**
 * Keeps a row within `width`: the piece that crosses the edge is cut with
 * "…" and the pieces after it are left out.
 */
export function fitPieces(pieces: readonly Piece[], width: number): Piece[] {
  const out: Piece[] = []
  let used = 0
  for (const piece of pieces) {
    if (used + piece.text.length <= width) {
      out.push(piece)
      used += piece.text.length
      continue
    }
    const room = width - used
    if (room > 0) out.push({ ...piece, text: cut(piece.text, room) })
    break
  }
  return out
}
