// The roster tool's answer as a model reads it: a row per worker and the
// lines around them. src/crew/roster.ts gathers what the rows say.
import type { ParentLink, Plan, Takeover, Worker } from '../../types'
import { DEFAULT_TYPE, ROSTER_FULL_REPORT_CUT, ROSTER_REPORT_CUT, ROSTER_ROWS } from '../config'
import { stepText } from '../progress/plan'
import { lines, oneLine } from '../util/text'

/** What a worker's row says besides the worker itself. */
export type RowFacts = {
  /** Whether it is busy: its row then says what it is doing now. */
  isActive: boolean
  /** Its takeover mark: who woke it, the tasks waiting for it, or why they did not arrive. */
  takeover?: Takeover
  /** The worker that started it, for one started from another worker's turn. */
  parent?: ParentLink
  isInWorktree: boolean
  /** The plan of its open run, for a busy worker. */
  plan?: Plan
  /** How many tasks wait for its run to end, as a delegate call's `after` asked. */
  behind?: number
  /** Its last report whole, line breaks kept, for a worker asked for alone. */
  report?: string
  now: number
}

/**
 * How much of a worker's last task and report a row cuts to: an active
 * worker's task says more than a free one's, a free one's report shows only
 * among the latest few (`report` 0 for the rest), and one worker asked for
 * alone has its own row in full.
 */
export type RowCut = { task: number; report: number }
export const rowCut = (isActive: boolean, isReported: boolean): RowCut => ({
  task: isActive ? 80 : 60,
  report: isReported ? ROSTER_REPORT_CUT : 0,
})
export const FULL_ROW_CUT: RowCut = { task: 400, report: ROSTER_FULL_REPORT_CUT }

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const tokensText = (n: number): string => (n < 1000 ? `${n} tokens` : `~${Math.round(n / 1000)}k tokens`)

// A last report under its row: one line beside its label, or, whole and of
// several lines, each under the label and indented as it is.
function lastReport(text: string): string {
  if (!text.includes('\n')) return `\n  last report: ${text}`
  const body = text.split('\n').map(line => (line === '' ? '' : `  ${line}`))
  return `\n  last report:\n${body.join('\n')}`
}

/** One worker's row: who it is, where, what it did, and what it is doing now. */
export function rosterRow(worker: Worker, facts: RowFacts, cut: RowCut): string {
  const { takeover, parent } = facts
  const kind = worker.type && worker.type !== DEFAULT_TYPE ? `${worker.type}, ` : ''
  const history = `${kind}${worker.model ? `model ${worker.model}, ` : ''}${plural(worker.tasks, 'task')}, ${tokensText(worker.tokens)}`
  const held = takeover !== undefined && takeover.held.length > 0 ? `, ${plural(takeover.held.length, 'task')} waiting` : ''
  const head = `- ${worker.name}: address "${worker.address}", ${worker.status}`
  const answering =
    takeover === undefined ? '' : takeover.missed !== undefined ? `${held}, not delivered: ${takeover.missed}` : `, answering ${takeover.by}${held}`
  const mark = `${answering}${facts.behind ? `, ${plural(facts.behind, 'task')} held behind its run` : ''}`
  const where = `${parent ? `${parent.fork ? 'fork of' : 'started by'} ${parent.parent}, ` : ''}${facts.isInWorktree ? 'worktree of' : 'repo'} ${worker.cwd}`
  const task = `last task "${oneLine(worker.task, cut.task)}"`
  const said = facts.report !== undefined ? lines(facts.report, cut.report) : oneLine(worker.answer, cut.report)
  const report = cut.report > 0 && said !== '' ? lastReport(said) : ''
  if (!facts.isActive) return `${head}${mark}, ${where}, ${history}, ${task}${report}`
  const doing = worker.activity ? ` (${worker.activity})` : ''
  const step = facts.plan === undefined ? '' : `, step ${stepText(facts.plan)}`
  const age = Math.round((facts.now - worker.updatedAt) / 1000)
  return `${head}${doing}${mark}${step}, ${where}, ${history}, ${task}, ${plural(worker.tools, 'tool call')}, updated ${age}s ago${report}`
}

export const emptyCrew = (orchName: string): string => `${orchName}'s crew is empty.`

/** The rows under a head that counts the whole crew, and how many did not fit. */
export function rosterList(orchName: string, count: number, rows: readonly string[]): string {
  const more = count > ROSTER_ROWS ? `\n+${count - ROSTER_ROWS} more` : ''
  return `${orchName}'s crew (${count}):\n${rows.join('\n')}${more}`
}
