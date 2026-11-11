// The crew kept per conversation in the store: the session's state ends with
// its process, so a conversation resumed in a new one would find none of the
// workers it names. What coordinating needs is saved after the turns that
// change it, and read back when a session starts on a conversation that has
// a record and no crew.
import type { Compaction, KeptCrew, Silence, Takeover, Waiting, Worker } from '../../types'
import type { Engine } from '../engine'
import { HELD_OVER_RESTART } from '../prompts/results'
import { runtime } from '../runtime'
import { sessionKey } from '../settings/notes'
import {
  STORE_KEYS,
  readCompaction,
  readDropped,
  readParents,
  readTakeovers,
  readWaiting,
  readWorkers,
  readWorktrees,
  updateCompaction,
  updateDropped,
  updateParents,
  updateSilences,
  updateTakeovers,
  updateWaiting,
  updateWorkers,
  updateWorktrees,
} from '../state/atoms'
import { setKept } from '../util/bounded'
import { ACTIVE } from './workers'

/** The tag of a record as this version writes it: one with another is not read. */
export const KEPT_SHAPE = 'crew-1'
// The least time between two saves: turns end in bursts.
const SAVE_MS = 10_000
// The conversations whose crew the store keeps, the latest written.
const CREWS_KEEP = 10

const saving = runtime.persist

// The record without what changes at every tool call: a worker's activity,
// its counts and when it was last heard from are not worth a write.
const signatureOf = (kept: KeptCrew): string =>
  JSON.stringify({
    ...kept,
    at: 0,
    workers: kept.workers.map(w => ({ ...w, activity: '', tools: 0, tokens: 0, updatedAt: 0, lastMsgAt: 0, lastMsgIn: false })),
  })

async function crewsMap($: Engine): Promise<Record<string, unknown>> {
  const stored = await $.store.get(STORE_KEYS.crews)
  return typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {}
}

/**
 * Has the next tick look at the crew for a change worth saving. Called when
 * a turn ends, the orchestrator's or a worker's: what the record keeps
 * changes with a turn (a worker started or given a task, a report, a task
 * held), so the timer reads nothing between them.
 */
export const saveSoon = () => {
  saving.isDue = true
}

/**
 * Saves the crew under the conversation's id when a turn's end asked for it
 * and it changed since the last save, at most every `SAVE_MS`. A
 * conversation that never had a worker writes nothing.
 */
export async function saveCrew($: Engine, now: number) {
  if (!saving.isDue || now - saving.at < SAVE_MS) return
  saving.isDue = false
  saving.at = now
  const kept: KeptCrew = {
    shape: KEPT_SHAPE,
    at: now,
    workers: await readWorkers($),
    dropped: await readDropped($),
    parents: await readParents($),
    worktrees: await readWorktrees($),
    takeovers: await readTakeovers($),
    waiting: await readWaiting($),
    compaction: await readCompaction($),
  }
  const signature = signatureOf(kept)
  if (signature === saving.signature) return
  if (saving.signature === '' && kept.workers.length === 0 && kept.dropped.length === 0) return
  const id = await sessionKey($)
  if (id === '') return
  const crews = new Map(Object.entries(await crewsMap($)))
  setKept(crews, id, kept, CREWS_KEEP)
  await $.store.set(STORE_KEYS.crews, Object.fromEntries(crews))
  saving.signature = signature
}

const isList = (x: unknown): x is unknown[] => Array.isArray(x)

// A record this version wrote, whole: one it cannot read is declined, not guessed at.
const isKept = (x: unknown): x is KeptCrew => {
  const kept = x as Partial<KeptCrew> | null
  return (
    typeof kept === 'object' &&
    kept !== null &&
    kept.shape === KEPT_SHAPE &&
    isList(kept.workers) &&
    isList(kept.dropped) &&
    isList(kept.parents) &&
    isList(kept.worktrees) &&
    isList(kept.takeovers) &&
    isList(kept.waiting) &&
    typeof kept.compaction === 'object' &&
    kept.compaction !== null
  )
}

/**
 * Reads the crew back when a session starts on a conversation the store has
 * a record of and the session has no crew: a new process, as a reload keeps
 * the state. A worker that was busy is stopped, as its run ended with the
 * process, and the orchestrator is told so once; the next sync takes the
 * status of any the engine still lists. Answers whether it read one back.
 */
export async function restoreCrew($: Engine): Promise<boolean> {
  if ((await readWorkers($)).length > 0 || (await readDropped($)).length > 0) return false
  const id = await sessionKey($)
  const kept = id === '' ? undefined : (await crewsMap($))[id]
  if (!isKept(kept) || (kept.workers.length === 0 && kept.dropped.length === 0)) return false
  const now = await $.clock.now()
  const cut = kept.workers.filter(w => ACTIVE.has(w.status))
  const asLeft = (w: Worker): Worker => (ACTIVE.has(w.status) ? { ...w, status: 'stopped', activity: '', updatedAt: now } : w)
  const workers = kept.workers.map(asLeft)
  // The run a held task waited for ended with the process: the task is not
  // sent on its own, and the orchestrator hears that it missed its worker.
  const takeovers: Takeover[] = kept.takeovers
    .filter(mark => mark.held.length > 0)
    .map(mark => (mark.missed === undefined ? { ...mark, missed: HELD_OVER_RESTART } : mark))
  const waiting: Waiting[] = kept.waiting
  const compaction: Compaction = kept.compaction
  await updateWorkers($, () => workers)
  await updateDropped($, () => kept.dropped)
  await updateParents($, () => kept.parents)
  await updateWorktrees($, () => kept.worktrees)
  await updateTakeovers($, () => takeovers)
  await updateWaiting($, () => waiting)
  await updateCompaction($, () => compaction)
  await updateSilences($, list => [...list, ...cut.map((w): Silence => ({ id: w.id, kind: 'cut', since: now }))])
  saving.signature = signatureOf({ ...kept, workers })
  return true
}
