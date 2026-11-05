// The crew's workers: their statuses as the engine reports them, the sets
// that say what a status allows, their names, and the list kept of them.
import type { AgentStatus } from 'claude-code'

import type { Member, Worker, WorkerStatus } from '../../types'
import type { Engine } from '../engine'
import { freshName, isWorkerName } from '../persona/names'
import { readDropped, readMembers, readWorkers, updateDropped, updateWorkers } from '../state/atoms'
import { appendKept } from '../util/bounded'
import { hash } from '../util/random'
import { cap } from '../util/text'

/**
 * The statuses of a worker that is busy, one a task can be given to as is
 * (`REUSABLE`), and one whose run is over (`FINISHED`).
 */
export const ACTIVE: ReadonlySet<WorkerStatus> = new Set(['starting', 'working', 'waiting'])
export const REUSABLE: ReadonlySet<WorkerStatus> = new Set(['idle', 'done', 'stopped'])
export const FINISHED: ReadonlySet<WorkerStatus> = new Set(['done', 'failed', 'stopped'])

// A worker's status for each of the engine's names for an agent's state:
// a name the engine's types add is a compile error here until it has one.
const STATUS_OF: Record<AgentStatus, WorkerStatus> = {
  pending: 'starting',
  running: 'working',
  waiting: 'waiting',
  idle: 'idle',
  completed: 'done',
  failed: 'failed',
  killed: 'stopped',
}

/**
 * A worker's status from the engine's name for an agent's state, or
 * undefined for a name the crew has none for: an engine newer than the types
 * the crew was built against may report one.
 */
export const statusOf = (status: string): WorkerStatus | undefined =>
  Object.hasOwn(STATUS_OF, status) ? STATUS_OF[status as AgentStatus] : undefined

// The names given in this load, the moment each is chosen: spawns of one
// response run at once, and each reads the list before the other's worker
// is on it.
const claimed = new Set<string>()

/**
 * What no new worker may be called, lowercase: the name and the address of
 * every member of the session `members` holds (the list, the shelf, the cast
 * the rows keep).
 */
export const takenNames = (members: readonly Member[]): Set<string> =>
  new Set(members.flatMap(m => [m.name.toLowerCase(), m.address.toLowerCase()]))

/**
 * What a new worker may not be called now: the names and addresses of the
 * session's members, one on the shelf or in the rows still that worker's.
 */
export async function takenNow($: Engine, list: readonly Worker[]): Promise<Set<string>> {
  return takenNames([...list, ...(await readDropped($)), ...(await readMembers($))])
}

/**
 * Gives a new worker a name no other has, nor had in this load: `wanted`
 * when it fits and is free, else the next fresh one. `isWantedFree` says
 * whether `wanted` can still be its address, as given, when it is no name.
 * What it answers is taken from here on.
 */
export function claimName(taken: ReadonlySet<string>, wanted?: string): { name: string; isWantedFree: boolean } {
  const isFree = (x: string) => !taken.has(x.toLowerCase()) && !claimed.has(x.toLowerCase())
  const isWantedFree = wanted !== undefined && isFree(wanted)
  const name = wanted !== undefined && isWantedFree && isWorkerName(wanted) ? cap(wanted) : freshName(new Set([...taken, ...claimed]))
  claimed.add(name.toLowerCase())
  if (wanted !== undefined && isWantedFree) claimed.add(wanted.toLowerCase())
  return { name, isWantedFree }
}

/** Gives back the names a spawn that started nothing took. */
export const unclaimNames = (...names: string[]) => {
  for (const name of names) claimed.delete(name.toLowerCase())
}

/**
 * The one `key` names: its id, or its address or name in any case (a
 * SendMessage address's ` [ref]` aside).
 */
export const findWorker = <W extends Member>(list: readonly W[], key: string): W | undefined => {
  // A SendMessage address may carry a " [ref]".
  const k = key.replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase()
  return list.find(
    w => w.id === key || w.address.toLowerCase() === k || w.name.toLowerCase() === k,
  )
}

/** A worker that starts now, on its first task, with the seed its color and figure come from. */
export function makeWorker(
  fields: Pick<Worker, 'id' | 'name' | 'address' | 'task' | 'type' | 'cwd' | 'status' | 'model' | 'asked'>,
  now: number,
): Worker {
  return {
    ...fields,
    activity: '',
    tools: 0,
    startedAt: now,
    updatedAt: now,
    lastMsgAt: 0,
    lastMsgIn: false,
    answer: '',
    seed: hash(fields.id),
    tasks: 1,
    tokens: 0,
  }
}

/** Active workers first, then whoever was heard from last. */
export const byActivity = (a: Worker, b: Worker): number =>
  Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status)) || b.updatedAt - a.updatedAt

// The workers the list keeps besides the active ones, the most recent.
const KEPT_IDLE = 24

/**
 * Keeps every active worker and the `KEPT_IDLE` most recent others; the ones
 * left out go to `out`.
 */
export function prune(list: readonly Worker[], out: Worker[]): Worker[] {
  const idle = list.filter(w => !ACTIVE.has(w.status)).sort((a, b) => b.updatedAt - a.updatedAt)
  const cut = new Set(idle.slice(KEPT_IDLE).map(w => w.id))
  out.push(...list.filter(w => cut.has(w.id)))
  return list.filter(w => !cut.has(w.id))
}

const SHELF = 50

/**
 * Keeps workers taken off the list, so a sync does not take them back as
 * strangers.
 */
export async function shelve($: Engine, gone: readonly Worker[]) {
  if (gone.length === 0) return
  await updateDropped($, list => appendKept(list, gone, SHELF, w => w.id))
}

/** Puts a worker that wakes back on the list, as it was. */
export async function unshelve($: Engine, id: string) {
  const kept = (await readDropped($)).find(w => w.id === id)
  if (kept === undefined) return
  await updateDropped($, list => list.filter(w => w.id !== id))
  const now = await $.clock.now()
  await updateWorkers($, list =>
    list.some(w => w.id === id) ? list : [...list, { ...kept, status: 'working' as const, updatedAt: now }],
  )
}

// A worker that is not busy, free or finished, leaves the panel's row five
// seconds after its status changed, which `updatedAt` holds: an idle or
// finished worker is touched again only by a message to it or by what wakes
// it (a task, a resume). It leaves the row but not the crew: the team view,
// the roster and delegate still have it, and whatever wakes it puts it back.
// One whose run just ended stays while its end stands out, failed included:
// the toast, the team view and the roster still say so once it is gone.
export const NAP_SHOWN_MS = 5000
/** Whether a worker that is not busy has rested long enough to leave the pane's row. */
export const napsAway = (w: Worker, now: number): boolean => !ACTIVE.has(w.status) && now - w.updatedAt >= NAP_SHOWN_MS

/** Changes a worker's fields and touches it; one the list no longer has is left alone. */
export async function patchWorker(
  $: Engine,
  id: string,
  patch: (w: Worker, now: number) => Partial<Worker>,
) {
  if (!(await readWorkers($)).some(w => w.id === id)) return
  const now = await $.clock.now()
  await updateWorkers($, list =>
    list.map(w => (w.id === id ? { ...w, ...patch(w, now), updatedAt: now } : w)),
  )
}
