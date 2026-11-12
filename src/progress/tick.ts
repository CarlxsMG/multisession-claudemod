// The progress tick, once a second: it ends the runs whose end was missed,
// keeps the status line and the newest check-in up to date, stops the
// background tasks of workers that are done, places the rows that are due,
// and runs a compaction asked for once it is safe.
import type { Orch, Round, Run, Worker } from '../../types'
import { sweepBackground } from '../background/sweep'
import { compactWhenSafe } from '../crew/compaction'
import { saveCrew } from '../crew/persist'
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

// Ends the runs whose end was missed, and answers whether it ended any: an
// end writes the runs and may close the round, which are then read again.
async function endMissedRuns($: Engine, list: readonly Worker[], all: readonly Run[], now: number): Promise<boolean> {
  let isEnded = false
  for (const run of all) {
    if (!isOpen(run) || now - run.touchedAt < MISSED_MS) continue
    const worker = list.find(x => x.id === run.id)
    if (worker !== undefined && ACTIVE.has(worker.status)) continue
    await endRun($, run.id, endOf(worker?.status))
    isEnded = true
  }
  return isEnded
}

// The round's summary once it closed, or a check-in when one is due.
async function placeRoundRow($: Engine, list: readonly Worker[], all: readonly Run[], round: Round, now: number) {
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

// Ends the runs whose end was missed, pins the status line, stops what
// finished workers left running in the background, and places the
// lines of ends that wait and a check-in or a round's summary when one is
// due, while the main session's turn is not under way.
async function progressTick($: Engine) {
  if (ticking.isTicking) return
  ticking.isTicking = true
  try {
    const now = await $.clock.now()
    // Each read is a call through the host, once a second: what the tick
    // reads it reads once, together, and hands on.
    const [list, runs, wasRound] = await Promise.all([readWorkers($), readRuns($), readRound($)])
    const isEnded = await endMissedRuns($, list, runs, now)
    const [all, round] = isEnded ? await Promise.all([readRuns($), readRound($)]) : [runs, wasRound]
    await pinStatus($, list, all, now)
    // A row that stands is drawn again, so it follows even while the main turn runs.
    await followCheckIn($, round, list, all, now)
    await quiet($, sweepBackground($, now), 'background sweep')
    await quiet($, saveCrew($, now), 'save crew')

    if (isMainBusy(await readOrch($))) return
    // The lines that wait, before any summary of their round.
    await placeWaiting($, now)
    await placeRoundRow($, list, all, round, now)
    await quiet($, compactWhenSafe($, list, now), 'compaction')
  } finally {
    ticking.isTicking = false
  }
}

/** The check-in cadence the store keeps, and the tick that keeps it and the status line. */
export async function startProgress($: Engine) {
  await loadEvery($)
  $.clock.every(PROGRESS_MS, () => void quiet($, progressTick($), 'progress tick'))
}
