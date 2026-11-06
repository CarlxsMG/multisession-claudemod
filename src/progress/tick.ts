// The progress tick, once a second: it ends the runs whose end was missed,
// keeps the status line and the newest check-in up to date, and places the
// rows that are due.
import type { Orch, Run, Worker } from '../../types'
import { ACTIVE } from '../crew/workers'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { runtime } from '../runtime'
import { readOrch, readRound, readRuns, readWorkers, updateRound } from '../state/atoms'
import { everyMin, followCheckIn, loadEvery, placeCheckIn, placeSummary, placeWaiting } from './placed'
import { NO_ROUND, hasNews, seenOf, wantsSummary } from './round'
import { endRun } from './run-store'
import { endOf, isOpen } from './runs'
import { pinStatus } from './status'

const PROGRESS_MS = 1000
/**
 * A run whose worker the engine has free or gone ends this long after its
 * last sign of life, when the end of its turn never came.
 */
export const MISSED_MS = 5000

const ticking = runtime.tick

// The main session's turn runs from its start, which sets the orchestrator
// thinking, to its end, which sets it happy; its tool calls set the rest. A
// row placed meanwhile would land amid the text it streams.
const isMainBusy = (o: Orch): boolean => o.mood === 'thinking' || o.mood === 'working' || o.mood === 'delegating'

async function endMissedRuns($: Engine, list: readonly Worker[], now: number) {
  for (const run of await readRuns($)) {
    if (!isOpen(run) || now - run.touchedAt < MISSED_MS) continue
    const worker = list.find(x => x.id === run.id)
    if (worker !== undefined && ACTIVE.has(worker.status)) continue
    await endRun($, run.id, endOf(worker?.status))
  }
}

// The round's summary once it closed, or a check-in when one is due.
async function placeRoundRow($: Engine, list: readonly Worker[], all: readonly Run[], now: number) {
  const round = await readRound($)
  if (round.startedAt === 0) return
  const every = everyMin() * 60_000
  if (round.closedAt !== 0) {
    if (wantsSummary(round, every)) await placeSummary($, round)
    await updateRound($, () => NO_ROUND)
    return
  }
  if (every === 0 || now < round.lastAt + every) return
  const statusOf = (id: string): string => list.find(w => w.id === id)?.status ?? 'done'
  if (hasNews(round.seen, seenOf(round, all, statusOf))) await placeCheckIn($, false)
  else await updateRound($, x => ({ ...x, lastAt: now }))
}

// Ends the runs whose end was missed, pins the status line, and places the
// lines of ends that wait and a check-in or a round's summary when one is
// due, while the main session's turn is not under way.
async function progressTick($: Engine) {
  if (ticking.isTicking) return
  ticking.isTicking = true
  try {
    const now = await $.clock.now()
    const list = await readWorkers($)
    await endMissedRuns($, list, now)
    const all = await readRuns($)
    await pinStatus($, list, all, now)
    // A row that stands is drawn again, so it follows even while the main turn runs.
    await followCheckIn($, await readRound($), now)

    if (isMainBusy(await readOrch($))) return
    // The lines that wait, before any summary of their round.
    await placeWaiting($, now)
    await placeRoundRow($, list, all, now)
  } finally {
    ticking.isTicking = false
  }
}

/** The check-in cadence the store keeps, and the tick that keeps it and the status line. */
export async function startProgress($: Engine) {
  await loadEvery($)
  $.clock.every(PROGRESS_MS, () => void quiet($, progressTick($), 'progress tick'))
}
