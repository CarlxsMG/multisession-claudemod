// The rows placed in the conversation: a check-in, and the summary that
// ends a round.
import type { CheckIn, CheckLine, RunEnd } from '../../../types'
import { t } from '../../i18n'
import { cut } from '../../util/text'
import { shortTime, took } from '../../util/time'
import { END, endMarked } from '../../words'
import { phaseLabel } from '../phase'
import { stepText } from '../plan'
import { endPieces } from './ended'
import { notePieces } from './note'
import { fitPieces } from './pieces'
import type { Piece, Role } from './pieces'

const endRole = (end: RunEnd): Role => (end === '' ? 'phase' : end)

// A row narrower than this has its columns a single space apart.
const NARROW_COLUMNS = 40

// The lines a whole row shows: the rest are counted.
const ROW_LINES = 8

const pad = (text: string, n: number): string => text.padEnd(n)

const asked = (c: CheckIn): string => (!c.isAsked ? '' : c.every > 0 ? t().progress.every(c.every) : t().progress.noCheckIns)

const lineStep = (x: CheckLine): string => (x.plan === undefined ? '' : stepText(x.plan))

// A folded line's step, for a worker with a plan.
const foldedStep = (x: CheckLine): Piece[] => (x.plan === undefined ? [] : [{ text: ` ${stepText(x.plan)}`, role: 'step' }])

// The step column of whole lines, as wide as the widest step, in rows where
// any worker has a plan.
const stepColumn = (x: CheckLine, width: number, gap: string): Piece[] => (width === 0 ? [] : [{ text: gap + pad(lineStep(x), width), role: 'step' }])

const head = (text: string): Piece[] => [
  { text: '─ ', role: 'head' },
  { text: 'crew', role: 'crew' },
  { text, role: 'head' },
]

const more = (count: number, width: number): Piece[][] =>
  count > ROW_LINES ? [fitPieces([{ text: `  ${t().progress.more(count - ROW_LINES)}`, role: 'head' }], width)] : []

// How the lines a whole row shows are laid out: the gap between their columns
// and how wide the name, the time (as `timeOf` writes it) and the step are.
const columns = (lines: readonly CheckLine[], width: number, timeOf: (ms: number) => string) => ({
  gap: width < NARROW_COLUMNS ? ' ' : '  ',
  nameW: Math.min(10, Math.max(0, ...lines.map(x => x.name.length))),
  timeW: Math.max(0, ...lines.map(x => timeOf(x.ms).length)),
  stepW: Math.max(0, ...lines.map(x => lineStep(x).length)),
})

function summaryRows(row: CheckIn, width: number, isWhole: boolean): Piece[][] {
  const title = isWhole ? t().progress.roundOver(shortTime(row.roundMs)) : t().progress.roundOf(shortTime(row.roundMs))
  if (!isWhole) {
    const folded = row.lines.flatMap((x): Piece[] => [
      { text: ' · ', role: 'head' },
      { text: END[x.end === '' ? 'done' : x.end].mark, role: endRole(x.end === '' ? 'done' : x.end) },
      { text: ' ', role: 'head' },
      { text: x.name, role: 'name', id: x.id },
      ...foldedStep(x),
      { text: ` ${took(x.ms)}`, role: 'time' },
    ])
    return [fitPieces([...head(title), ...folded], width)]
  }
  const shown = row.lines.slice(0, ROW_LINES)
  const { gap, nameW, timeW, stepW } = columns(shown, width, took)
  const lines = shown.map(x => {
    const end = x.end === '' ? 'done' : x.end
    return fitPieces(
      [
        { text: '  ', role: 'head' },
        { text: END[end].mark, role: end },
        { text: ' ', role: 'head' },
        { text: pad(cut(x.name, nameW), nameW), role: 'name', id: x.id },
        { text: gap + took(x.ms).padStart(timeW), role: 'time' },
        ...stepColumn(x, stepW, gap),
        { text: gap + x.doing, role: 'doing' },
      ],
      width,
    )
  })
  return [fitPieces(head(title), width), ...lines, ...more(row.lines.length, width)]
}

function roundRows(row: CheckIn, width: number, isWhole: boolean): Piece[][] {
  const running = row.lines.filter(x => x.end === '').length
  const title =
    row.lines.length === 0
      ? `${t().progress.nobody}${asked(row)}`
      : isWhole
        ? `${t().progress.active(running, shortTime(row.roundMs))}${asked(row)}`
        : t().progress.round(shortTime(row.roundMs))
  if (!isWhole || row.lines.length === 0) {
    const folded = isWhole
      ? []
      : row.lines.flatMap((x): Piece[] => [
          { text: ' · ', role: 'head' },
          { text: x.name, role: 'name', id: x.id },
          x.end === '' ? { text: ` ${phaseLabel(x.phase)}`, role: 'phase' } : { text: ` ${END[x.end].mark}`, role: x.end },
          ...foldedStep(x),
          { text: ` ${shortTime(x.ms)}`, role: 'time' },
        ])
    return [fitPieces([...head(title), ...folded], width)]
  }
  const label = (x: CheckLine): string => (x.end === '' ? phaseLabel(x.phase) : endMarked(x.end))
  const shown = row.lines.slice(0, ROW_LINES)
  const { gap, nameW, timeW, stepW } = columns(shown, width, shortTime)
  const phaseW = Math.max(...shown.map(x => label(x).length))
  const lines = shown.map(x =>
    fitPieces(
      [
        { text: '  ', role: 'head' },
        { text: pad(cut(x.name, nameW), nameW), role: 'name', id: x.id },
        { text: gap, role: 'head' },
        { text: pad(label(x), phaseW), role: endRole(x.end) },
        ...stepColumn(x, stepW, gap),
        { text: gap + shortTime(x.ms).padStart(timeW), role: 'time' },
        ...(x.doing !== '' ? [{ text: gap + x.doing, role: 'doing' as const }] : []),
      ],
      width,
    ),
  )
  return [fitPieces(head(title), width), ...lines, ...more(row.lines.length, width)]
}

/**
 * A check-in or a summary as rows of pieces, each row at most `width`
 * columns: whole, or folded to one line once a newer row stands below it.
 * A run's end, and a message, is its one line, always.
 *  ─ crew · 2 active · round 6m                  ─ crew · round over · 14m
 *    Pip   editing  3/5  6m  Write tests         ✓ Pip   12m 5s  5/5  Fix the tests
 *    Bolt  reading       4m  Read README.md      × Bolt   4m 2s       Review README
 */
export function checkInRows(row: CheckIn, width: number, isWhole: boolean): Piece[][] {
  if (row.kind === 'end') return row.lines.flatMap(x => (x.end === '' ? [] : [fitPieces(endPieces({ ...x, end: x.end }), width)]))
  if (row.kind === 'message') return row.note === undefined ? [] : [notePieces(row.note, width)]
  return row.kind === 'summary' ? summaryRows(row, width, isWhole) : roundRows(row, width, isWhole)
}
