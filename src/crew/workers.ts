// The crew's workers: their statuses as the engine reports them, the sets
// that say what a status allows, their names, and the list kept of them.
import type { AgentStatus } from 'claude-code'

import type { Member, Worker, WorkerStatus } from '../../types'
import { MATES } from '../config'
import type { Engine } from '../engine'
import { freshName, isWorkerName } from '../persona/names'
import { runtime } from '../runtime'
import { readDropped, readMembers, readWorkers, updateDropped, updateWorkers } from '../state/atoms'
import { appendKept } from '../util/bounded'
import { samePath } from '../util/path'
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
export const statusOf = (status: string): WorkerStatus | undefined => (Object.hasOwn(STATUS_OF, status) ? STATUS_OF[status as AgentStatus] : undefined)

// The names given in this load, the moment each is chosen: spawns of one
// response run at once, and each reads the list before the other's worker
// is on it.
const names = runtime.names

/**
 * What no new worker may be called, lowercase: the name and the address of
 * every member of the session `members` holds (the list, the shelf, the cast
 * the rows keep).
 */
export const takenNames = (members: readonly Member[]): Set<string> => new Set(members.flatMap(m => [m.name.toLowerCase(), m.address.toLowerCase()]))

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
  const isFree = (x: string) => !taken.has(x.toLowerCase()) && !names.claimed.has(x.toLowerCase())
  const isWantedFree = wanted !== undefined && isFree(wanted)
  const name = wanted !== undefined && isWantedFree && isWorkerName(wanted) ? cap(wanted) : freshName(new Set([...taken, ...names.claimed]))
  names.claimed.add(name.toLowerCase())
  if (wanted !== undefined && isWantedFree) names.claimed.add(wanted.toLowerCase())
  return { name, isWantedFree }
}

/** Gives back the names a spawn that started nothing took. */
export const unclaimNames = (...given: string[]) => {
  for (const name of given) names.claimed.delete(name.toLowerCase())
}

/**
 * The one `key` names: its id, or its address or name in any case (a
 * SendMessage address's ` [ref]` aside).
 */
export const findWorker = <W extends Member>(list: readonly W[], key: string): W | undefined => {
  // A SendMessage address may carry a " [ref]".
  const k = key
    .replace(/\s*\[[^\]]*\]\s*$/, '')
    .trim()
    .toLowerCase()
  return list.find(w => w.id === key || w.address.toLowerCase() === k || w.name.toLowerCase() === k)
}

/** A worker that starts now, on its first task, with the seed its color and figure come from. */
export function makeWorker(fields: Pick<Worker, 'id' | 'name' | 'address' | 'task' | 'type' | 'cwd' | 'status' | 'model' | 'asked'>, now: number): Worker {
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
export const byActivity = (a: Worker, b: Worker): number => Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status)) || b.updatedAt - a.updatedAt

/**
 * The teammates a worker named `name`, in `cwd`, hears of: the busy ones and
 * those in its repository, most active first, up to `MATES`.
 */
export const matesOf = (list: readonly Worker[], name: string, cwd: string): Worker[] =>
  list
    .filter(w => w.name !== name && (ACTIVE.has(w.status) || samePath(w.cwd, cwd)))
    .sort(byActivity)
    .slice(0, MATES)

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

// Moves a worker from the shelf back onto the list.
async function restore($: Engine, kept: Worker) {
  await updateDropped($, list => list.filter(w => w.id !== kept.id))
  await updateWorkers($, list => (list.some(w => w.id === kept.id) ? list : [...list, kept]))
}

/** Puts a worker that wakes back on the list, as it was. */
export async function unshelve($: Engine, id: string) {
  const kept = (await readDropped($)).find(w => w.id === id)
  if (kept === undefined) return
  await restore($, { ...kept, status: 'working', updatedAt: await $.clock.now() })
}

/**
 * The worker on the shelf `key` names, as `findWorker` reads it, put back on
 * the list untouched: it is not awake until what it was named for reaches it.
 */
export async function recallWorker($: Engine, key: string): Promise<Worker | undefined> {
  const kept = findWorker(await readDropped($), key)
  if (kept !== undefined) await restore($, kept)
  return kept
}

/**
 * The worker `key` names, on the list or on the shelf: one the list let go is
 * still the crew's, and whoever reaches it by name brings it back.
 */
export async function reachWorker($: Engine, key: string): Promise<Worker | undefined> {
  return findWorker(await readWorkers($), key) ?? (await recallWorker($, key))
}

// A worker that is not busy, free or finished, leaves the panel's row a time
// after its status changed, which `updatedAt` holds: an idle or finished
// worker is touched again only by a message to it or by what wakes it (a
// task, a resume). It leaves the row but not the crew: the team view, the
// roster and delegate still have it, and whatever wakes it puts it back. One
// whose run just ended stays while its end stands out, failed included,
// whatever the time: the toast, the team view and the roster still say so
// once it is gone.
const NAP_SHOWN_MS = 5000
// The crew's `napAfter` option as that time; undefined for `never`.
let napShownMs: number | undefined = NAP_SHOWN_MS

/** Takes the crew's `napAfter` option as the plugin loads: `30s`, `2m` or `never`; anything else is the default, `5s`. */
export function chooseNapAfter(option: unknown) {
  napShownMs = option === '30s' ? 30_000 : option === '2m' ? 120_000 : option === 'never' ? undefined : NAP_SHOWN_MS
}

/** When a worker that is not busy leaves the pane's row; undefined for a busy one, and with `napAfter` at `never`. */
export const napLeavesAt = (w: Worker): number | undefined => (ACTIVE.has(w.status) || napShownMs === undefined ? undefined : w.updatedAt + napShownMs)

/** Whether a worker that is not busy has rested long enough to leave the pane's row. */
export const napsAway = (w: Worker, now: number): boolean => (napLeavesAt(w) ?? Infinity) <= now

/** Changes a worker's fields and touches it; one the list no longer has is left alone. */
export async function patchWorker($: Engine, id: string, patch: (w: Worker, now: number) => Partial<Worker>) {
  if (!(await readWorkers($)).some(w => w.id === id)) return
  const now = await $.clock.now()
  await updateWorkers($, list => list.map(w => (w.id === id ? { ...w, ...patch(w, now), updatedAt: now } : w)))
}
