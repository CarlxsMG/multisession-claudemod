// The crew's workers: their statuses as the engine reports them, the sets
// that say what a status allows, their names, and the list kept of them.
import type { Member, Worker, WorkerStatus } from '../../types'
import type { Engine } from '../engine'
import { WORKER_NAMES } from '../persona/names'
import { readDropped, readWorkers, updateDropped, updateWorkers } from '../state/atoms'
import { appendKept } from '../util/bounded'
import { hash } from '../util/random'

/**
 * The statuses of a worker that is busy, one a task can be given to as is
 * (`REUSABLE`), and one whose run is over (`FINISHED`).
 */
export const ACTIVE: ReadonlySet<WorkerStatus> = new Set(['starting', 'working', 'waiting'])
export const REUSABLE: ReadonlySet<WorkerStatus> = new Set(['idle', 'done', 'stopped'])
export const FINISHED: ReadonlySet<WorkerStatus> = new Set(['done', 'failed', 'stopped'])

/** A worker's status from the engine's name for an agent's state. */
export const STATUS_OF: Record<string, WorkerStatus> = {
  pending: 'starting',
  running: 'working',
  waiting: 'waiting',
  idle: 'idle',
  completed: 'done',
  failed: 'failed',
  killed: 'stopped',
}

/**
 * The first worker name no worker has and `reserved` does not hold, with a
 * number after it once every name is taken.
 */
export function nextName(list: readonly Worker[], reserved: Iterable<string> = []): string {
  const taken = new Set([...list.map(w => w.name.toLowerCase()), ...reserved])
  for (let round = 1; ; round++) {
    for (const name of WORKER_NAMES) {
      const candidate = round === 1 ? name : `${name}${round}`
      if (!taken.has(candidate.toLowerCase())) return candidate
    }
  }
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

// A free worker's figure naps from the moment it is free, and `updatedAt`
// holds that moment: its status changed then, and an idle worker is touched
// again only by a message to it or by what wakes it (a task, a resume).
// After five seconds asleep it leaves the panel's row but not the crew: the
// team view, the roster and delegate still have it, and whatever wakes it
// puts it back. One whose run just ended stays while its end stands out.
export const NAP_SHOWN_MS = 5000
/** Whether a free worker has napped long enough to leave the pane's row. */
export const napsAway = (w: Worker, now: number): boolean => w.status === 'idle' && now - w.updatedAt >= NAP_SHOWN_MS

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
