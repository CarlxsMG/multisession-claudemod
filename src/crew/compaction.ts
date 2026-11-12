// Compactions the crew starts: the orchestrator's compact tool and the
// `compactAt` threshold ask for one, and the progress tick runs it at a safe
// moment, between turns with no worker busy, so the summary never cuts a
// coordination in the middle, and soon after the main turn ended, while the
// transcript it reads is still in the prompt cache.
import type { CompactAsk, Worker } from '../../types'
import { COMPACT_GAP_MIN, COMPACT_WARM_MIN } from '../config'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { COMPACT_MAIN, compactFocus, compactQueued, withCrewInstructions } from '../prompts/compact'
import { runtime } from '../runtime'
import { readCompaction, readPendingRows, readRound, readRuns, readTakeovers, readWaiting, updateCompaction } from '../state/atoms'
import { ACTIVE } from './workers'

const GAP_MS = COMPACT_GAP_MIN * 60_000
const WARM_MS = COMPACT_WARM_MIN * 60_000
// How often the auto-compaction threshold is read again: its breakdown is
// estimated, where the context's fill is read for free.
const THRESHOLD_MS = 60_000

const state = runtime.compaction

// The share of the auto-compaction threshold at which the crew asks for a
// compaction on its own, from the `compactAt` option; undefined for off.
let compactShare: number | undefined

/** Takes the `compactAt` option: `70%` or `85%` of the auto-compaction threshold, anything else off. */
export function chooseCompactAt(option: unknown) {
  compactShare = option === '70%' ? 0.7 : option === '85%' ? 0.85 : undefined
}

/** Notes that the main conversation's turn ended: an ask runs only soon after one, and one that waits for reports wants one after the last. */
export function noteMainTurnEnd(now: number) {
  state.mainEndedAt = now
}

/** Queues the orchestrator's compaction, in place of one already queued, and says when it can run. */
export async function askCompaction($: Engine, focus: string, after: CompactAsk['after']): Promise<string> {
  const now = await $.clock.now()
  const ask: CompactAsk = { focus, after, by: 'model', askedAt: now }
  await updateCompaction($, c => ({ ...c, ask }))
  const { lastAt } = await readCompaction($)
  const waitMin = lastAt === 0 ? 0 : Math.max(0, Math.ceil((lastAt + GAP_MS - now) / 60_000))
  return compactQueued(after, waitMin)
}

// Whether the context has reached the share of the auto-compaction threshold
// `compactAt` sets. The context's fill is the last response's, which a
// compaction leaves unknown until the next one.
async function isPastShare($: Engine, now: number): Promise<boolean> {
  if (compactShare === undefined) return false
  const usage = await quiet($, $.session.usage(), 'compaction usage')
  const tokens = usage?.context.tokens
  if (usage === undefined || tokens === undefined) return false
  if (now - state.thresholdAt >= THRESHOLD_MS) {
    state.thresholdAt = now
    const read = await quiet($, $.session.usage({ breakdown: 'summary' }), 'compaction threshold')
    state.threshold = read?.context.breakdown?.autoCompactThreshold
  }
  // With auto-compaction off the option still holds, against the window.
  return tokens >= compactShare * (state.threshold ?? usage.context.window)
}

// Whether nothing would be cut: no worker busy, no row waiting for the main
// turn, no agent answering a worker, no task waiting for a run to end, and
// for an ask that waits for reports
// the round over and a turn of the orchestrator's since the last one came in.
// A mark whose tasks missed their worker holds nothing back: its run is over,
// and its tasks are in the state, not in the conversation.
async function isSafe($: Engine, ask: CompactAsk, list: readonly Worker[]): Promise<boolean> {
  if (list.some(w => ACTIVE.has(w.status))) return false
  if ((await readPendingRows($)).length > 0) return false
  if ((await readTakeovers($)).some(mark => mark.missed === undefined)) return false
  if ((await readWaiting($)).some(task => task.missed === undefined)) return false
  if (ask.after === 'idle') return true
  const round = await readRound($)
  if (round.startedAt !== 0 && round.closedAt === 0) return false
  const lastEnd = Math.max(0, ...(await readRuns($)).map(r => r.endedAt))
  return state.mainEndedAt >= lastEnd
}

// Runs the compaction; one a turn that began refuses stays queued for the
// next safe moment. Only the ask that ran is cleared: one made meanwhile stays.
async function runCompaction($: Engine, ask: CompactAsk) {
  const instructions = withCrewInstructions(ask.focus !== '' ? compactFocus(ask.focus) : undefined, COMPACT_MAIN)
  const result = await quiet($, $.session.compact({ instructions }), 'compaction')
  if (result === undefined) return
  const now = await $.clock.now()
  await updateCompaction($, c => ({ ask: c.ask?.askedAt === ask.askedAt ? null : c.ask, lastAt: now }))
  $.ui.toast(result.skip === undefined ? t().compaction.done : t().compaction.skipped(result.skip))
}

/**
 * Called by the progress tick while the main conversation's turn is not under
 * way: asks for a compaction when the context passed `compactAt`, and runs
 * the one queued once it is safe, at most one every `COMPACT_GAP_MIN` minutes,
 * and only within `COMPACT_WARM_MIN` of the main turn's end: an ask that
 * misses that window stays queued for the tick after the next turn ends.
 * It does not wait for the compaction, which takes a model request.
 */
export async function compactWhenSafe($: Engine, list: readonly Worker[], now: number) {
  if (state.isRunning) return
  const { ask, lastAt } = await readCompaction($)
  // Outside these windows no ask runs, and the context's fill, which changes
  // only with a main response, is read again within the next: an idle tick
  // asks the engine for no usage.
  if (now < lastAt + GAP_MS) return
  if (now - state.mainEndedAt >= WARM_MS) return
  let wanted = ask
  if (wanted === null) {
    if (!(await isPastShare($, now))) return
    const asked: CompactAsk = { focus: '', after: 'idle', by: 'threshold', askedAt: now }
    await updateCompaction($, c => ({ ...c, ask: c.ask ?? asked }))
    wanted = asked
  }
  if (!(await isSafe($, wanted, list))) return
  state.isRunning = true
  void runCompaction($, wanted).finally(() => {
    state.isRunning = false
  })
}
