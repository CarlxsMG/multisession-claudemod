// A worker's message to a free teammate, sent on from the main conversation.
// Sent from the worker's own loop, such a message would wake the teammate
// working for the sender: the engine keeps the sender from stopping until
// that run stops, wakes it again with its end, and hands the teammate's
// report to it, or here once the sender ended. Sent from the main
// conversation instead, it wakes the teammate working for the orchestrator:
// the sender owns no run of it and is free to end its turn, and the
// teammate's report comes here.
import type { Relay, Worker } from '../../types'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { noteMessage } from '../progress/tracker'
import { relayText } from '../prompts/worker'
import { readLook, readMembers, readParents, readWorkers, updateRelays } from '../state/atoms'
import { deliver } from './deliver'
import { nameOf } from './feed'
import { ACTIVE } from './workers'

/** The most messages that wait to be sent on; past it, the oldest is dropped. */
export const RELAYS_KEEP = 40

// Set when a worker's message waits: the next tick sends it on.
let relayDue = false

/** Has the next tick send on the workers' messages that wait. */
export const relaySoon = () => {
  relayDue = true
}

/** Sends on the messages that wait, once a send asked for it. */
export function relayIfDue($: Engine) {
  if (!relayDue) return
  relayDue = false
  void quiet($, relay($), 'relay')
}

/**
 * Whether `id` is an agent the worker `by` started: its report goes to that
 * worker however it is woken, so the worker's message reaches it directly.
 */
export async function isAgentOf($: Engine, id: string, by: Worker | undefined): Promise<boolean> {
  return by !== undefined && (await readParents($)).some(p => p.id === id && p.parent === by.name)
}

// Sends on what waits, in order. Run from the timer only: a send from a
// worker's turn is that worker's. The queue is emptied first, so a relay that
// throws is caught on its own: the ones after it still go, and none is sent
// twice by a later tick.
async function relay($: Engine) {
  let out: Relay[] = []
  await updateRelays($, list => {
    out = [...list]
    return []
  })
  if (out.length === 0) return
  const look = await readLook($)
  for (const pending of out) await quiet($, relayOne($, pending, look.name), 'relay')
}

// One relay: sent from here, a toast when it did not arrive, and its line.
async function relayOne($: Engine, pending: Relay, lookName: string) {
  const worker = (await readWorkers($)).find(x => x.id === pending.id)
  const name = nameOf(pending.id, worker, await readMembers($))
  const wasFree = worker === undefined || !ACTIVE.has(worker.status)
  const sent = await deliver($, {
    id: pending.id,
    worker: worker,
    text: relayText(pending, lookName),
    line: { from: { name: pending.by, id: pending.byId }, to: name, text: pending.text, tone: 'worker' },
    patch: () => ({ status: 'working', activity: '' }),
    isCaught: true,
  })
  if (!sent.isDelivered) $.ui.toast(t().missedRelay(name, pending.by, sent.reason))
  // What follows only records: the message went, or the toast said it did
  // not, and a record that fails leaves its line out of the conversation.
  const note = { fromId: pending.byId, from: pending.by, toId: pending.id, to: name, gist: pending.gist, wakes: sent.isDelivered && wasFree, isLost: !sent.isDelivered }
  await quiet($, noteMessage($, note), 'record relay')
}
