// An agent its worker woke with a message, marked until that run ends, and
// the tasks the orchestrator gives it meanwhile, which wait for that end.
import type { Takeover, Worker } from '../../types'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { heldTasks, taskClose } from '../prompts/worker'
import { readLook, readTakeovers, readWorkers, updateTakeovers } from '../state/atoms'
import { deliver } from './deliver'
import { ORCH_ID } from './feed'
import { ACTIVE } from './workers'

/**
 * A worker's message to an agent of its own that is not busy wakes it
 * working for that worker: the engine sends that run's report there, not
 * here. The mark says so until the run ends; what the orchestrator gives it
 * meanwhile waits, and goes from here once it ends, so its report comes back
 * here. Tasks that missed it before wait again, for the end of this run.
 */
export async function takeOver($: Engine, id: string, by: string) {
  const woken = ({ id, held }: Takeover): Takeover => ({ id, by, held })
  await updateTakeovers($, list =>
    list.some(t => t.id === id) ? list.map(t => (t.id === id ? woken(t) : t)) : [...list, { id, by, held: [] }],
  )
}

// Set when a worker's turn ends: the next tick looks for marks to lift.
let releaseDue = false

/** Has the next tick lift the marks of runs that ended. */
export const releaseSoon = () => {
  releaseDue = true
}

/** Lifts the marks of runs that ended, once a turn end asked for it. */
export function releaseIfDue($: Engine) {
  if (!releaseDue) return
  releaseDue = false
  void quiet($, release($), 'release')
}

/**
 * Lifts the mark of every woken worker that is not busy any more, and sends
 * each what waited for it, together, as one message from the main
 * conversation. Run from the main conversation's calls and the timer only:
 * a send from a worker's own turn would wake it for that worker again.
 *
 * Tasks that do not arrive are kept on the mark with why, and go with the
 * next task the orchestrator gives that worker: a send tried again on its
 * own would fail every few seconds for an agent that is gone. Answers the
 * marks whose tasks missed now.
 */
export async function release($: Engine): Promise<Takeover[]> {
  if ((await readTakeovers($)).length === 0) return []
  const list = await readWorkers($)
  const isLifted = (t: Takeover) => t.missed === undefined && !ACTIVE.has(list.find(w => w.id === t.id)?.status ?? 'done')
  let lifted: Takeover[] = []
  await updateTakeovers($, marks => {
    lifted = marks.filter(isLifted)
    return marks.filter(t => !isLifted(t))
  })
  const missed: Takeover[] = []
  for (const takeover of lifted) {
    if (takeover.held.length === 0) continue
    const worker = list.find(w => w.id === takeover.id)
    const sent = await sendHeld($, takeover, worker)
    if (sent.isDelivered) continue
    const kept: Takeover = { ...takeover, missed: sent.reason }
    missed.push(kept)
    await keepMissed($, kept)
    $.ui.toast(t().missedWorker(worker?.name ?? takeover.id, sent.reason))
  }
  return missed
}

/** Keeps a mark whose tasks did not arrive, ahead of any held for it since. */
export async function keepMissed($: Engine, kept: Takeover) {
  await updateTakeovers($, marks =>
    marks.some(m => m.id === kept.id)
      ? marks.map(m => (m.id === kept.id ? { ...kept, held: [...kept.held, ...m.held] } : m))
      : [...marks, kept],
  )
}

async function sendHeld($: Engine, takeover: Takeover, worker: Worker | undefined) {
  const look = await readLook($)
  const body = heldTasks(takeover.held)
  const last = takeover.held[takeover.held.length - 1]!.title
  return deliver($, {
    id: takeover.id,
    worker: worker,
    text: `${body}\n\n${taskClose(worker?.asked)}`,
    line: { from: { name: look.name, id: ORCH_ID }, to: worker?.name ?? takeover.id, text: body, tone: 'orch' },
    patch: x => ({ status: 'working', activity: '', task: last, tasks: x.tasks + takeover.held.length }),
    job: last,
    isCaught: true,
  })
}
