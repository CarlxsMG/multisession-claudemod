// One way to send an agent a text from the main conversation and record
// it: the delegate tool's task to a worker it reuses, the tasks held for a
// woken worker, a worker's message to a teammate, the user's message.
import type { MsgTone, Worker } from '../../types'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { beginRun, settleRun } from '../progress/run-store'
import { say, setJob } from './feed'
import type { Party } from './feed'
import { patchWorker } from './workers'

/** What a send answered: delivered, or not with its reason. */
export type Sent = Awaited<ReturnType<Engine['session']['send']>>

/** A message the crew sends a worker from the main conversation, and how it is recorded. */
export type Delivery = {
  /** The agent the text goes to, and the crew's worker for it when it has one. */
  id: string
  worker: Worker | undefined
  /** What the agent reads. */
  text: string
  /**
   * The feed's line for it. One that did not arrive says why, or, with
   * `isQuietIfLost`, is not said.
   */
  line: { from: Party; to: string; text: string; tone: MsgTone; isQuietIfLost?: boolean }
  /** On delivery: the worker's fields beside its last message, and the title of the job it was given. */
  patch?: (worker: Worker) => Partial<Worker>
  job?: string
  /** A send that throws is one that did not arrive, with the error as its reason. */
  isCaught?: boolean
}

/**
 * Sends a delivery's text and records it. The worker's run so far is settled
 * first: a busy worker takes the text into the run it is on, a free one
 * starts a run for it.
 */
export async function deliver($: Engine, delivery: Delivery): Promise<Sent> {
  if (delivery.worker !== undefined) await settleRun($, delivery.worker)
  const sending = $.session.send({ to: { agentId: delivery.id }, text: delivery.text })
  const sent: Sent = delivery.isCaught
    ? await sending.catch((err: unknown) => ({ isDelivered: false as const, reason: err instanceof Error ? err.message : String(err) }))
    : await sending
  const { from, to, text, tone, isQuietIfLost } = delivery.line
  const recipient = { name: to, id: delivery.id }
  if (sent.isDelivered) await say($, from, recipient, text, tone)
  else if (!isQuietIfLost) await say($, from, recipient, t().notDelivered(text, sent.reason), tone)
  if (!sent.isDelivered) return sent
  await patchWorker($, delivery.id, (w, now) => ({ ...delivery.patch?.(w), lastMsgAt: now, lastMsgIn: true }))
  if (delivery.job !== undefined) await setJob($, delivery.id, delivery.job)
  await beginRun($, delivery.id)
  return sent
}
