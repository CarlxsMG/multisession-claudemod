// The status line: the runs under way and the ends just seen, cut to the width
// of the conversation. Drawn only: no model reads it.
import type { Run, Worker } from '../../types'
import type { Engine } from '../engine'
import { runtime } from '../runtime'
import { readJobs } from '../state/atoms'
import { shownPhase } from './phase'
import { hasEnded, isJustEnded, isOpen, runMs } from './runs'
import { statusText } from './text/status-line'

// The status line takes at least this many columns, however narrow the
// width it was last given.
const STATUS_MIN_COLUMNS = 20

// The status line as last pinned, which the first progress tick of a load
// pins afresh or clears of a line left from before; and the transcript's width
// as its rows were last drawn, else the terminal's as a command last ran, which
// the status line is cut to.
const line = runtime.status

/** Keeps the conversation's width, which the status line and the placed rows fit. */
export const seeColumns = (columns: number | undefined) => {
  if (columns !== undefined && columns > 0) line.rowColumns = columns
}

/** Keeps the terminal's width as a command ran, which the status line fits until a row is drawn. */
export const seeCommandColumns = (columns: number) => {
  line.commandColumns = columns
}

function showStatus($: Engine, text: string) {
  if (text === line.shown) return
  line.shown = text
  $.ui.status(text === '' ? undefined : text)
}

/** Pins the status line as the workers (`list`) and their runs (`all`) are now. */
export async function pinStatus($: Engine, list: readonly Worker[], all: readonly Run[], now: number) {
  const open = all.filter(isOpen)
  // The jobs name the runs under way: with none, the tick reads nothing more.
  const given = open.length > 0 ? await readJobs($) : []
  const statusOf = (id: string): string => list.find(w => w.id === id)?.status ?? 'done'
  const entries = open
    .sort((a, b) => a.startedAt - b.startedAt)
    .map(run => ({
      name: list.find(w => w.id === run.id)?.name ?? run.id,
      phase: shownPhase(run, statusOf(run.id)),
      ms: runMs(run, now),
      title: given.find(j => j.id === run.id)?.title ?? list.find(w => w.id === run.id)?.task ?? '',
      ...(run.plan === undefined ? {} : { plan: run.plan }),
    }))
  // The workers of the crew whose run just ended, in the order they did.
  const ended = all
    .filter(hasEnded)
    .filter(r => isJustEnded(r, now) && list.some(w => w.id === r.id))
    .sort((a, b) => a.endedAt - b.endedAt)
    .map(r => ({ name: list.find(w => w.id === r.id)!.name, end: r.end }))
  showStatus($, statusText(entries, Math.max(STATUS_MIN_COLUMNS, (line.rowColumns || line.commandColumns) - 2), ended))
}
