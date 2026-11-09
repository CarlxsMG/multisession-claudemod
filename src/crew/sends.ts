// The crew's part in every send between agents: what it records of each,
// and the message to a free teammate it passes on from the main
// conversation instead.
import type { HookFor } from 'claude-code'

import type { Note, Relay, Route, Worker } from '../../types'
import { MAIN_ADDRESS, PLUGIN } from '../config'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { noteMessage } from '../progress/placed'
import { beginRun, settleRun } from '../progress/run-store'
import { readLook, readMembers, readSendGists, readWorkers, updateRelays, updateRoutes, updateSendGists } from '../state/atoms'
import { appendKept } from '../util/bounded'
import { ORCH_ID, ROUTES_KEEP, gistOf, headOf, nameOf, say } from './feed'
import { RELAYS_KEEP, isAgentOf, relaySoon } from './relay'
import { takeOver } from './takeover'
import { ACTIVE, findWorker, patchWorker, reachWorker } from './workers'

// Each worker's last SendMessage, the newest: kept in the state, as a
// reload may come between the call and its send.
const SEND_GISTS = 100

/** Keeps a worker's SendMessage summary, which its send's line says in place of the text. */
export function noteSendGist($: Engine, agentId: string, summary: unknown, message: unknown) {
  const sent = { id: agentId, head: headOf(String(message ?? '')), gist: gistOf(summary, message) }
  return updateSendGists($, list => appendKept(list, [sent], SEND_GISTS, x => x.id))
}

// What a worker's send says in a line: the summary its SendMessage gave,
// else the text's first line.
async function gistOfSend($: Engine, agentId: string, text: string): Promise<string> {
  const s = (await readSendGists($)).find(x => x.id === agentId)
  return s !== undefined && s.head === headOf(text) ? s.gist : gistOf(undefined, text)
}

type OnSendHook = HookFor<'session.send'>
/**
 * Records every send between agents, and sends a worker's message to a free
 * teammate on from the main conversation.
 */
export async function onSend($: Engine, e: Parameters<OnSendHook>[1], next: Parameters<OnSendHook>[2]) {
  // The crew's own sends, from the main conversation, which it logs where
  // it makes them. The model of an agent the crew spawned sends under the
  // crew's name too, from that agent's loop.
  const ours = e.origin.kind === 'plugin' && e.origin.name === PLUGIN && e.agentId === undefined
  if (ours) return next(e)
  // A shelved addressee comes back first, so the send is to a free worker
  // on the list.
  const addressee = await reachWorker($, e.to)
  // Whoever sends it, a message to a worker that is not busy starts a run.
  const starts = addressee !== undefined && addressee.id !== e.agentId && !ACTIVE.has(addressee.status)
  const sender = e.agentId !== undefined ? findWorker(await readWorkers($), e.agentId) : undefined
  // A worker's message to a free teammate goes on from the main
  // conversation (see relay); to a free agent of its own, it goes as sent,
  // and wakes it working for that worker.
  if (starts && e.agentId !== undefined) {
    if (!(await isAgentOf($, addressee.id, sender))) {
      const by = nameOf(e.agentId, sender, await readMembers($))
      const item: Relay = {
        id: addressee.id,
        by,
        byId: e.agentId,
        address: sender?.address ?? e.agentId,
        text: e.text,
        gist: await gistOfSend($, e.agentId, e.text),
      }
      await updateRelays($, list => appendKept(list, [item], RELAYS_KEEP))
      relaySoon()
      if (sender !== undefined)
        await quiet(
          $,
          patchWorker($, sender.id, (_, now) => ({ lastMsgAt: now, lastMsgIn: false })),
          'sender',
        )
      return { isDelivered: true as const }
    }
  }
  const wakes = starts && e.agentId !== undefined
  if (starts) await quiet($, settleRun($, addressee), 'settle run')
  const sent = await next(e)
  // What follows only records: the send has gone, and a record that fails
  // leaves this message out of the panel, not out of the conversation.
  await quiet($, recordSend($, e, sent, starts ? addressee : undefined, wakes), 'record send')
  return sent
}

// A send's records: the feed's line, both workers' last messages, the route
// a reply is matched by, the run the send starts (`started`) or the mark it
// sets when it `wakes` that worker for its sender, and the main
// conversation's line of a message between agents.
async function recordSend(
  $: Engine,
  e: Parameters<OnSendHook>[1],
  sent: Awaited<ReturnType<Parameters<OnSendHook>[2]>>,
  started: Worker | undefined,
  wakes: boolean,
) {
  const list = await readWorkers($)
  const look = await readLook($)
  const from = e.agentId !== undefined ? findWorker(list, e.agentId) : undefined
  const to = findWorker(list, e.to)
  const text = sent.isDelivered ? e.text : t().notDelivered(e.text)
  const sender = from !== undefined ? { name: from.name, id: from.id } : { name: look.name, id: e.agentId ?? ORCH_ID }
  const recipient = to !== undefined ? { name: to.name, id: to.id } : { name: e.to, id: e.to === MAIN_ADDRESS ? ORCH_ID : '' }
  await say($, sender, recipient, text, from ? 'worker' : 'orch')
  if (from) await patchWorker($, from.id, (_, now) => ({ lastMsgAt: now, lastMsgIn: false }))
  if (from && sent.isDelivered) {
    const route: Route = { from: from.id, head: headOf(e.text), to: e.to === MAIN_ADDRESS ? '' : (to?.name ?? e.to) }
    await updateRoutes($, list => appendKept(list, [route], ROUTES_KEEP, r => JSON.stringify([r.from, r.head])))
  }
  if (to) await patchWorker($, to.id, (_, now) => ({ lastMsgAt: now, lastMsgIn: true }))
  if (started !== undefined && wakes && sent.isDelivered) {
    const by = nameOf(e.agentId!, from, await readMembers($))
    await takeOver($, started.id, by)
    // The engine resumes it with the message.
    await patchWorker($, started.id, () => ({ status: 'working', activity: '' }))
  }
  if (started !== undefined && sent.isDelivered) await beginRun($, started.id)
  // An agent's message to anyone but the main conversation, where it
  // already stands as a bubble.
  const author = from ?? (e.agentId !== undefined ? (await readMembers($)).find(m => m.id === e.agentId) : undefined)
  if (author !== undefined && e.to !== MAIN_ADDRESS) {
    const note: Note = {
      fromId: author.id,
      from: author.name,
      toId: to?.id ?? '',
      to: to?.name ?? e.to,
      gist: await gistOfSend($, author.id, e.text),
      wakes: wakes && sent.isDelivered,
      isLost: !sent.isDelivered,
    }
    await noteMessage($, note)
  }
}
