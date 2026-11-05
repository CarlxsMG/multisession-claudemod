// The user's message to a worker, from the pane or `/crew msg`.
import type { Worker } from '../../types'
import type { Engine } from '../engine'
import { fromUser } from '../prompts/worker'
import { t } from '../i18n'
import { deliver } from './deliver'
import { USER_ID, gistOf } from './feed'

/** A message wakes a worker that had finished, as a task does. */
export async function messageWorker($: Engine, worker: Worker, body: string) {
  const sent = await deliver($, {
    id: worker.id,
    worker: worker,
    text: fromUser(body),
    line: { from: { name: t().user, id: USER_ID }, to: worker.name, text: body, tone: 'user' },
    job: gistOf(undefined, body),
  })
  if (!sent.isDelivered) $.ui.toast(t().missedWorker(worker.name, sent.reason))
}
