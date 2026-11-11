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
import { runtime } from '../runtime'
import type { HeldCalls } from '../runtime'
import { updateRuns, updateWorkers } from '../state/atoms'
import { samePath } from '../util/path'
import { addEdits, countCall } from './runs'

const holding = runtime.calls

/** A worker's call, for the next write: what it does now and its kind. */
export function holdCall(id: string, activity: string, kind: Phase | undefined, at: number) {
  const held = holding.held.get(id)
  holding.held.set(id, { activity, calls: [...(held?.calls ?? []), { kind, at }], edited: held?.edited ?? [] })
}

/**
 * A file a worker's editing call changed, for the next write, each file
 * once. Held once the call has run: one that was refused changed nothing.
 */
export function holdEdit(id: string, path: string) {
  const held = holding.held.get(id) ?? { activity: '', calls: [], edited: [] }
  if (held.edited.some(known => samePath(known, path))) return
  holding.held.set(id, { ...held, edited: [...held.edited, path] })
}

/** The files held for the next write, by worker: what its runs do not have yet. */
export const heldEdits = (): [string, string[]][] => [...holding.held].flatMap(([id, h]) => (h.edited.length > 0 ? [[id, h.edited] as [string, string[]]] : []))

/** Whether any call waits to be written. */
export const hasHeldCalls = (): boolean => holding.held.size > 0

/**
 * Writes the calls held so far, after any write already under way: the
 * workers' counts, and each open run's count, last sign of life and phase,
 * call by call, and the files it edited. A worker whose status changed
 * after its last call (its turn ended, say) takes its count only: what it
 * did and when are no longer news.
 */
export function writeCalls($: Engine): Promise<void> {
  // Writes go one after another: one that closes a run waits for the frame's.
  if (holding.held.size === 0) return runtime.carried.writing
  const taken = [...holding.held]
  holding.held.clear()
  runtime.carried.writing = runtime.carried.writing.then(() => quiet($, write($, taken), 'calls').then(() => undefined))
  return runtime.carried.writing
}

async function write($: Engine, taken: [string, HeldCalls][]) {
  const byId = new Map(taken)
  await updateWorkers($, list =>
    list.map(w => {
      const h = byId.get(w.id)
      // An edit held after the frame took its call brings no call of its own.
      if (h === undefined || h.calls.length === 0) return w
      const last = h.calls[h.calls.length - 1]!.at
      const isNews = ACTIVE.has(w.status) && w.updatedAt <= last
      return { ...w, tools: w.tools + h.calls.length, ...(isNews ? { activity: h.activity, updatedAt: last } : {}) }
    }),
  )
  await updateRuns($, list =>
    taken.reduce(
      (runs, [id, h]) =>
        addEdits(
          h.calls.reduce((acc, c) => countCall(acc, id, c.kind, c.at), runs),
          id,
          h.edited,
        ),
      list,
    ),
  )
}
