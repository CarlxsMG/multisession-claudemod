// A busy worker's tool calls, held between two of the pane's frames and
// written at the next (`TICK_MS`) in one write of the workers and one of the
// runs. The pane draws both, so a write per call would draw it whole for
// each call; held, a card's activity and the team view's count and phase
// trail by a frame at most, and a reload of the plugin forgets one frame's
// calls.
import type { Phase } from '../../types'
import { ACTIVE } from '../crew/workers'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { updateRuns, updateWorkers } from '../state/atoms'
import { countCall } from './runs'

type Held = { activity: string; calls: { kind: Phase | undefined; at: number }[] }

const held = new Map<string, Held>()
// Writes go one after another: one that closes a run waits for the frame's.
let writing: Promise<void> = Promise.resolve()

/** A worker's call, for the next write: what it does now and its kind. */
export function holdCall(id: string, activity: string, kind: Phase | undefined, at: number) {
  const calls = held.get(id)?.calls ?? []
  held.set(id, { activity, calls: [...calls, { kind, at }] })
}

/** Whether any call waits to be written. */
export const hasHeldCalls = (): boolean => held.size > 0

/**
 * Writes the calls held so far, after any write already under way: the
 * workers' counts, and each open run's count, last sign of life and phase,
 * call by call. A worker whose status changed after its last call (its turn
 * ended, say) takes its count only: what it did and when are no longer news.
 */
export function writeCalls($: Engine): Promise<void> {
  if (held.size === 0) return writing
  const taken = [...held]
  held.clear()
  writing = writing.then(() => quiet($, write($, taken), 'calls').then(() => undefined))
  return writing
}

async function write($: Engine, taken: [string, Held][]) {
  const byId = new Map(taken)
  await updateWorkers($, list =>
    list.map(w => {
      const h = byId.get(w.id)
      if (h === undefined) return w
      const last = h.calls[h.calls.length - 1]!.at
      const isNews = ACTIVE.has(w.status) && w.updatedAt <= last
      return { ...w, tools: w.tools + h.calls.length, ...(isNews ? { activity: h.activity, updatedAt: last } : {}) }
    }),
  )
  await updateRuns($, list =>
    taken.reduce((runs, [id, h]) => h.calls.reduce((acc, c) => countCall(acc, id, c.kind, c.at), runs), list),
  )
}
