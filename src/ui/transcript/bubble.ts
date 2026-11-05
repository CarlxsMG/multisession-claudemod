// The crew rows of the conversation as chat bubbles, in rows of coloured
// segments: how wide a row is, and what each bubble holds.
import type { Look, Member } from '../../../types'
import { accentOf } from '../../figure/accent'
import { hash } from '../../util/random'
import { headLines, oneLine } from '../../util/text'
import { END, endMarked } from '../labels'

/** The rows of its text a task's bubble shows, and a report's. */
export const TASK_ROWS = 2
export const REPORT_ROWS = 3

// How a notification says its task ended: the three a subagent's carries
// marked, another word as it came.
const ENDS: Record<string, () => Seg> = {
  completed: () => ({ text: endMarked('done'), color: END.done.color }),
  failed: () => ({ text: endMarked('failed'), color: END.failed.color }),
  killed: () => ({ text: endMarked('stopped'), color: END.stopped.color }),
}
/** Whether a task notification's status is one its bubble marks: only a key of `ENDS`'s, never one every object has. */
export const isMarkedEnd = (status: string): boolean => Object.hasOwn(ENDS, status)
/**
 * How a task notification's status reads at the end of its bubble's border,
 * or undefined for none.
 */
export const endSeg = (status: string | undefined): Seg | undefined =>
  status === undefined || status.trim() === '' ? undefined : isMarkedEnd(status) ? ENDS[status]!() : { text: oneLine(status, 20), dim: true }

/** Someone of the crew's color in the conversation, from its id. */
export const colorOfMember = (m: Member, look: Look): string => accentOf({ seed: hash(m.id) }, look)

// A row takes at least this many columns; one at least `WIDE_COLUMNS` wide
// gives a bubble `BUBBLE_SHARE` of it.
const ROW_MIN_COLUMNS = 20
const WIDE_COLUMNS = 60
const BUBBLE_SHARE = 0.8

/** The width a row takes, short of the transcript's margins. */
export const rowWidth = (columns: number | undefined): number => Math.max(ROW_MIN_COLUMNS, (columns ?? 80) - 6)

/** A bubble takes at most `BUBBLE_SHARE` of a wide row, and a narrow row whole. */
export const bubbleCap = (width: number): number => (width >= WIDE_COLUMNS ? Math.floor(width * BUBBLE_SHARE) : width)

/** `press`: the one glyph of a bubble that opens or closes it. */
export type Seg = { text: string; color?: string; bold?: boolean; dim?: boolean; press?: true }

const lengthOf = (segs: readonly Seg[]): number => segs.reduce((n, x) => n + x.text.length, 0)

/**
 * A chat bubble as the pane draws one, in rows of segments: who speaks to
 * whom in its top border, the first `rows` lines of the text inside (all of
 * them for Infinity), as wide as they are and at most `cap` columns, and in
 * the bottom border the first of `foots` that fits, longest first (the last
 * cut to fit when it is one piece, else none). `isCut`: text was left out.
 * `mark` makes a glyph the press that opens or closes it: `more`, the "…"
 * that ends cut text; `less`, a "▴" kept at the end of the bottom border.
 *  ╭─ Nova → Pip · Fix the tests ─╮
 *  │ Run the tests and fix what…  │
 *  ╰─ new ────────────────────────╯
 */
export function bubbleRows(
  names: readonly Seg[],
  tail: string,
  text: string,
  rows: number,
  cap: number,
  color: string,
  foots: readonly (readonly Seg[])[] = [],
  mark?: 'more' | 'less',
): { rows: Seg[][]; isCut: boolean } {
  const inner = Math.max(8, cap - 4)
  const whole = headLines(text, inner, Infinity)
  const isCut = whole.length > rows
  const lines = isCut ? headLines(text, inner, rows) : whole
  const namesLength = lengthOf(names)
  // The title or summary gives way first: the names always show.
  const tailRoom = inner - 2 - namesLength - 3
  const after = tail !== '' && tailRoom >= 4 ? ` · ${oneLine(tail, tailRoom)}` : ''
  const label = namesLength + after.length
  // A "▴" takes two more columns of the bottom border.
  const spare = mark === 'less' ? 4 : 2
  const last = foots[foots.length - 1]
  const foot =
    foots.find(f => lengthOf(f) <= inner - spare) ??
    (last?.length === 1 ? [{ ...last[0]!, text: oneLine(last[0]!.text, inner - spare) }] : [])
  const footLength = lengthOf(foot)
  const room = Math.min(inner, Math.max(label + 2, footLength + spare, ...lines.map(x => x.length)))
  const edge = (text: string): Seg => ({ text, color })
  const body = (line: string, i: number): Seg[] =>
    mark === 'more' && isCut && i === lines.length - 1 && line.endsWith('…')
      ? [edge('│ '), { text: line.slice(0, -1) }, { text: '…', color, press: true }, { text: ' '.repeat(room - line.length) }, edge(' │')]
      : [edge('│ '), { text: line.padEnd(room) }, edge(' │')]
  const close: Seg[] = mark === 'less' ? [{ text: '▴', color, press: true }, edge('─╯')] : [edge('╯')]
  const dashes = room - (mark === 'less' ? 2 : 0)
  return {
    rows: [
      [edge('╭─ '), ...names, ...(after !== '' ? [{ text: after, dim: true }] : []), edge(` ${'─'.repeat(Math.max(0, room - label - 1))}╮`)],
      ...lines.map(body),
      foot.length === 0
        ? [edge(`╰${'─'.repeat(dashes + 2)}`), ...close]
        : [edge('╰─ '), ...foot, edge(` ${'─'.repeat(dashes - footLength - 1)}`), ...close],
    ],
    isCut,
  }
}
