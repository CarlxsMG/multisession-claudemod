// The start and end of every turn, the orchestrator's and each worker's.
import type { HookFor } from 'claude-code'

import type { RunEndKind } from '../../types'
import { backgroundTurnEnded, backgroundTurnStarted } from '../background/sweep'
import { ORCH_ID, say, setOrch } from '../crew/feed'
import { releaseSoon } from '../crew/takeover'
import { patchWorker } from '../crew/workers'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { beginRun, endRun } from '../progress/run-store'
import { readModel } from '../settings/model'
import { readLook, readParents, readTakeovers, readWorkers } from '../state/atoms'
import { oneLine } from '../util/text'
import { statusLabel } from '../words'

type OnTurnStartHook = HookFor<'turn.start'>
/**
 * Sets the orchestrator thinking when the main conversation's turn starts,
 * its model read again, and a worker working, its run begun and its
 * background tasks its own again, when its turn does.
 */
export async function onTurnStart($: Engine, e: Parameters<OnTurnStartHook>[1], next: Parameters<OnTurnStartHook>[2]) {
  if (e.agentId === undefined) {
    await setOrch($, 'thinking', '')
    // A model the settings changed is seen at the next turn at the latest.
    await readModel($)
  } else {
    await patchWorker($, e.agentId, () => ({ status: 'working' }))
    await beginRun($, e.agentId)
    await quiet($, backgroundTurnStarted($, e.agentId), 'background turn start')
  }
  return next(e)
}

type OnTurnCompleteHook = HookFor<'turn.complete'>
/**
 * Ends the orchestrator's turn happy, or idle when it failed or was stopped,
 * and a worker's run with its status, its report in the feed. Any agent's
 * background tasks are left for the progress tick to stop.
 */
export async function onTurnComplete($: Engine, e: Parameters<OnTurnCompleteHook>[1], next: Parameters<OnTurnCompleteHook>[2]) {
  if (e.agentId === undefined) {
    // No cheer for a turn that came to nothing: the figure just rests.
    const isFailed = e.isAborted || e.reason === 'error' || e.reason === 'refusal'
    await setOrch($, isFailed ? 'idle' : 'happy', '')
    return next(e)
  }
  await quiet($, backgroundTurnEnded($, e.agentId), 'background turn end')
  const worker = (await readWorkers($)).find(x => x.id === e.agentId)
  if (worker === undefined) return next(e)
  const status: RunEndKind = e.isAborted ? 'stopped' : e.reason === 'error' || e.reason === 'refusal' ? 'failed' : 'done'
  const used = e.usage ? e.usage.input_tokens + e.usage.output_tokens + e.usage.cache_creation_input_tokens : 0
  await patchWorker($, worker.id, x => ({ status, activity: '', answer: oneLine(e.answer, 1200), tokens: x.tokens + used }))
  await endRun($, worker.id, status)
  const look = await readLook($)
  const head = e.answer.split('\n').find(line => line.trim() !== '') ?? statusLabel(status)
  // The worker that started it, which the crew's names tell apart, or the
  // orchestrator.
  const parent = (await readParents($)).find(p => p.id === worker.id)?.parent
  const parentId = parent !== undefined ? (await readWorkers($)).find(w => w.name === parent)?.id : undefined
  const reportsTo = parent !== undefined ? { name: parent, id: parentId ?? '' } : { name: look.name, id: ORCH_ID }
  await say($, { name: worker.name, id: worker.id }, reportsTo, head, 'worker')
  // A woken worker's run is over: the next tick lifts its mark, from the
  // main conversation, not from this turn.
  if ((await readTakeovers($)).some(t => t.id === worker.id)) releaseSoon()
  return next(e)
}
