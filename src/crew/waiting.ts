// Tasks a delegate call asked to give once another worker's run ends
// (`after`): given from the main conversation when that run ends, kept
// behind the next run when their own worker is busy then, and told to the
// orchestrator when they could not be given.
import type { Waiting, Worker } from '../../types'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { AFTER_NO_WORKER, afterEnded, afterNotReached, afterNotStarted, notGiven, notGivenNote } from '../prompts/results'
import { heldTasks, taskClose } from '../prompts/worker'
import { runtime } from '../runtime'
import { readDropped, readLook, readWaiting, readWorkers, updateWaiting } from '../state/atoms'
import { startBehind } from './delegate'
import { deliver } from './deliver'
import { ORCH_ID, markCall } from './feed'
import { ACTIVE, reachWorker } from './workers'

// Set when a worker's turn ends with tasks behind it: the next tick gives them.
const due = runtime.due

/** Has the next tick give the tasks that waited for a run that ended. */
export const waitingSoon = () => {
  due.waiting = true
}

/** Gives the tasks whose run ended, once a turn end asked for it. */
export function waitingIfDue($: Engine) {
  if (!due.waiting) return
  due.waiting = false
  void quiet($, releaseWaiting($, false), 'waiting')
}

// How the run a task waited for ended, when the task is not to be given:
// work that builds on a run that broke, or was cut short, would build on
// what is not there.
function brokenEnd(behind: Worker | undefined): 'failed' | 'stopped' | 'gone' | undefined {
  if (behind === undefined) return 'gone'
  return behind.status === 'failed' || behind.status === 'stopped' ? behind.status : undefined
}

// Sends a worker the tasks that waited for a run, together, as one message
// from the main conversation: each call's row names the worker from then on.
async function sendWaiting($: Engine, worker: Worker, tasks: readonly Waiting[]) {
  const look = await readLook($)
  const body = heldTasks(tasks)
  const last = tasks[tasks.length - 1]!.title
  const sent = await deliver($, {
    id: worker.id,
    worker,
    text: `${body}\n\n${taskClose(worker.asked)}`,
    line: { from: { name: look.name, id: ORCH_ID }, to: worker.name, text: body, tone: 'orch' },
    patch: x => ({ status: 'working', activity: '', task: last, tasks: x.tasks + tasks.length }),
    job: last,
    isCaught: true,
  })
  if (sent.isDelivered) for (const task of tasks) await markCall($, task.callId, worker.id)
  return sent
}

/**
 * Gives every task whose run ended: to its worker, several for one worker
 * together and in order, or to a new worker. One whose own worker is busy
 * then waits for that worker's run instead. One that cannot be given (the
 * run it waited for failed or was stopped, its worker is gone or was not
 * reached, no worker could start) is kept with why, only to be told. Run
 * from the main conversation's calls and the timer only: a send from a
 * worker's own turn would wake its addressee working for that worker.
 *
 * `canStart`: whether a new worker may start in this pass. Only a pass a
 * hook of the main conversation makes may: a spawn made from the timer goes
 * past the crew's own spawn hook, so its agent would start with no brief
 * and be no worker of the crew's. Until such a pass, a task for a new
 * worker waits on.
 *
 * The tasks due leave the list first, so two passes never give one twice.
 */
export async function releaseWaiting($: Engine, canStart: boolean) {
  if (!(await readWaiting($)).some(w => w.missed === undefined)) return
  const crew = [...(await readWorkers($)), ...(await readDropped($))]
  const find = (id: string) => crew.find(w => w.id === id)
  const isOver = (w: Waiting) => {
    if (w.missed !== undefined || ACTIVE.has(find(w.after)?.status ?? 'stopped')) return false
    return canStart || w.to !== null || brokenEnd(find(w.after)) !== undefined
  }
  let over: Waiting[] = []
  await updateWaiting($, list => {
    over = list.filter(isOver)
    return list.filter(w => !isOver(w))
  })
  if (over.length === 0) return
  const back: Waiting[] = []
  const sends = new Map<string, { worker: Worker; tasks: Waiting[] }>()
  for (const w of over) {
    const broken = brokenEnd(find(w.after))
    if (broken !== undefined) {
      back.push({ ...w, missed: afterEnded(w.behind, broken) })
      continue
    }
    if (w.to === null) {
      const started = await startBehind($, w)
      if ('lost' in started) back.push({ ...w, missed: afterNotStarted(started.lost) })
      continue
    }
    // One the list let go comes back from the shelf to take its task.
    const worker = await reachWorker($, w.to)
    if (worker === undefined) back.push({ ...w, missed: AFTER_NO_WORKER })
    else if (ACTIVE.has(worker.status)) back.push({ ...w, after: worker.id, behind: worker.name })
    else sends.set(worker.id, { worker, tasks: [...(sends.get(worker.id)?.tasks ?? []), w] })
  }
  for (const { worker, tasks } of sends.values()) {
    const sent = await sendWaiting($, worker, tasks)
    if (!sent.isDelivered) back.push(...tasks.map(w => ({ ...w, missed: afterNotReached(worker.name, sent.reason) })))
  }
  if (back.length === 0) return
  await updateWaiting($, list => [...list, ...back].sort((a, b) => a.seq - b.seq))
  for (const w of back) if (w.missed !== undefined) $.ui.toast(t().notGiven(w.title, w.missed))
}

/**
 * The word on the tasks that were not given, for a tool's result of the main
 * conversation: told, they leave the list.
 */
export async function tellWaiting($: Engine): Promise<string[]> {
  let told: Waiting[] = []
  await updateWaiting($, list => {
    told = list.filter(w => w.missed !== undefined)
    return list.filter(w => w.missed === undefined)
  })
  return told.map(w => notGiven(w.title, w.behind, w.missed ?? ''))
}

/** The tasks that were not given and no tool's result has said so, with the note a user message carries of each. */
export async function untoldWaiting($: Engine): Promise<{ seq: number; note: string }[]> {
  return (await readWaiting($)).filter(w => w.missed !== undefined).map(w => ({ seq: w.seq, note: notGivenNote(w.title, w.behind, w.missed ?? '') }))
}

/** Takes off the list the tasks a user message's note told of. */
export async function forgetWaiting($: Engine, seqs: readonly number[]) {
  const told = new Set(seqs)
  await updateWaiting($, list => list.filter(w => !told.has(w.seq)))
}
