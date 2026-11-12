// Records each worker's runs with the engine: a run's start, its calls, its
// plan and its end. While workers run, the user follows what each does and for
// how long on surfaces no model reads: the status line, the pane and rows placed
// in the conversation. Nothing here messages anyone or adds to a prompt.
import type { CheckLine, Plan, RunEndKind, Worker } from '../../types'
import { ACTIVE, patchWorker } from '../crew/workers'
import type { Engine } from '../engine'
import { runtime } from '../runtime'
import { readJobs, readParents, readRuns, readTaskLists, readWorkers, updateRound, updateRuns, updateTaskLists } from '../state/atoms'
import { setKept } from '../util/bounded'
import type { ToolCall } from '../util/input'
import { holdCall, writeCalls } from './calls'
import { describe, phaseOf } from './phase'
import { queueLine } from './placed'
import { withPlan } from './plan'
import { joinRound } from './round'
import { closeRun, endOf, isOpen, openRun } from './runs'
import { endNotice } from './text/ended'

/** How many runs the state keeps, the newest. */
export const RUNS_KEEP = 80
// Twice the engine's default: an end comes while the user may be reading
// something else.
const END_TOAST_MS = 8000

// How long each worker's last run took.
const records = runtime.runs

/** How long a worker's last run took, for an end notification that does not say. */
export const lastRunMs = (id: string): number | undefined => records.ranFor.get(id)

/**
 * A worker's run starts at its turn's start, its spawn, a task or a message
 * that wakes it, or else its first call: the hooks a spawn is nested in do
 * not hear its first turn start. A run's todo items are its own.
 */
export async function beginRun($: Engine, id: string) {
  if ((await readRuns($)).some(r => r.id === id && isOpen(r))) return
  if (!(await readWorkers($)).some(w => w.id === id)) return
  const now = await $.clock.now()
  if ((await readTaskLists($)).some(l => l.id === id)) await updateTaskLists($, lists => lists.filter(l => l.id !== id))
  await updateRuns($, list => openRun(list, id, now).slice(-RUNS_KEEP))
  await updateRound($, r => joinRound(r, id, now))
}

/**
 * Before a task or a message reaches a worker that is not busy: a run of it
 * still open missed its end, and ends as the tick would end it, at its last
 * sign of life, so the run the task starts has nothing of an older task's
 * plan or time.
 */
export async function settleRun($: Engine, w: Pick<Worker, 'id' | 'status'>) {
  if (ACTIVE.has(w.status)) return
  await endRun($, w.id, endOf(w.status), true)
}

/**
 * A worker's tool call. One that sets it working shows at once; its count,
 * what it does and its run's phase wait for the next write of the held
 * calls (`holdCall`), every other frame of the pane, since a worker makes
 * many calls between two.
 */
export async function noteCall($: Engine, id: string, call: ToolCall) {
  const worker = (await readWorkers($)).find(w => w.id === id)
  if (worker === undefined) return
  const activity = describe(call)
  if (worker.status !== 'working') await patchWorker($, id, () => ({ status: 'working', activity }))
  await beginRun($, id)
  holdCall(id, activity, phaseOf(call), await $.clock.now())
}

/**
 * A plan for the worker's open run, a sign of life too; false when it has
 * none open, as for an agent the crew does not follow.
 */
export async function setPlan($: Engine, id: string, plan: (prev: Plan | undefined) => Plan | undefined): Promise<boolean> {
  await beginRun($, id)
  const now = await $.clock.now()
  let isNoted = false
  await updateRuns($, list =>
    list.map(r => {
      if (r.id !== id || !isOpen(r)) return r
      isNoted = true
      return { ...withPlan(r, plan(r.plan)), touchedAt: now }
    }),
  )
  return isNoted
}

/**
 * The last open run to end closes the round; its summary waits for the tick.
 * The user hears of the end at once in a toast, wherever they look, and the
 * conversation keeps one line of it: the end bubble of a worker whose report
 * comes to the main conversation, or else a line the tick places, as that
 * bubble lands in another worker's conversation. A run a new task settles
 * (`isLate`) ended unseen a while ago, at its last sign of life, and has
 * neither.
 */
export async function endRun($: Engine, id: string, end: RunEndKind, isLate = false) {
  // The run ends with every call it made, and its last sign of life.
  await writeCalls($)
  const run = (await readRuns($)).find(r => r.id === id && isOpen(r))
  if (run === undefined) return
  const now = await $.clock.now()
  const at = isLate ? Math.min(now, run.touchedAt) : now
  setKept(records.ranFor, id, at - run.startedAt, RUNS_KEEP)
  const list = await updateRuns($, runs => closeRun(runs, id, end, at))
  if (!list.some(isOpen)) await updateRound($, r => (r.startedAt === 0 || r.closedAt !== 0 ? r : { ...r, closedAt: at }))
  const worker = (await readWorkers($)).find(x => x.id === id)
  if (isLate || worker === undefined) return
  const plan = list.find(r => r.id === id)?.plan
  const line: CheckLine = {
    id,
    name: worker.name,
    phase: run.phase,
    end,
    ms: now - run.startedAt,
    doing: (await readJobs($)).find(j => j.id === id)?.title ?? worker.task,
    tools: run.tools,
    ...(plan === undefined ? {} : { plan }),
  }
  $.ui.toast(endNotice({ ...line, end }), { timeoutMs: END_TOAST_MS })
  if (await reportsElsewhere($, id)) await queueLine($, { kind: 'end', lines: [line] })
}

// Whether a worker's report goes to another worker, not to the main
// conversation: one another worker started, which is also the only kind a
// worker's message wakes working for it. The main conversation then has no
// end bubble of it.
async function reportsElsewhere($: Engine, id: string): Promise<boolean> {
  return (await readParents($)).some(p => p.id === id)
}
