// A message between agents, said in one line.
import type { Note } from '../../../types'
import { t } from '../../i18n'
import { cut, flat } from '../../util/text'
import { fitPieces } from './pieces'
import type { Piece } from './pieces'

/**
 * A message in one line, at most `width` columns: who to whom, its gist, and
 * whether it woke the recipient or never got there. The gist gives way first.
 *  ● Bolt → Pip: router.ts fixed · wakes it
 *  ● Mika → Rex: do you have the schema? · not delivered
 */
export function notePieces(note: Note, width: number): Piece[] {
  const head: Piece[] = [
    { text: '● ', role: 'head' },
    { text: note.from, role: 'name', id: note.fromId },
    { text: ' → ', role: 'head' },
    note.toId === '' ? { text: note.to, role: 'phase' } : { text: note.to, role: 'name', id: note.toId },
  ]
  const tail: Piece[] = note.isLost ? [{ text: t().progress.lost, role: 'failed' }] : note.wakes ? [{ text: t().progress.wakes, role: 'head' }] : []
  const room = width - [...head, ...tail].reduce((k, p) => k + p.text.length, 0) - 2
  const gist = flat(note.gist)
  const said: Piece[] = gist === '' || room < 4 ? [] : [{ text: `: ${cut(gist, room)}`, role: 'doing' }]
  return fitPieces([...head, ...said, ...tail], width)
}
