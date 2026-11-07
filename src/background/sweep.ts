// The background tasks the session's agents leave running, with the engine:
// recorded as their calls are answered, forgotten when the engine no longer
// runs them, and stopped once their worker is done, at the end of the
// session, or when the person presses Stop in the pane.
import type { HookFor, ToolCallResult } from 'claude-code'

import type { BackgroundTask } from '../../types'
import { quiet, unrecognized } from '../engine'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { readBackground, updateBackground } from '../state/atoms'
import { oneLine } from '../util/text'
import { addTask, dropTask, isDueForStop, isGone, keepLive, markStopFailed, ownerEnded, ownerResumed, stoppedId, taskOfCall } from './tasks'

// How much of a command a toast names.
const TOAST_COMMAND = 40

/**
 * Records what a call of `BACKGROUND_TOOLS` did, once the engine answered
 * it: a shell or a Monitor it left running, or a task a TaskStop ended.
 */
export async function noteBackground($: Engine, tool: string, input: unknown, agentId: string | undefined, done: ToolCallResult) {
  if (done.deny !== undefined || done.isError === true) return
  if (tool === 'TaskStop') {
    const id = stoppedId(input)
    if (id !== '' && (await readBackground($)).some(x => x.id === id)) await updateBackground($, list => dropTask(list, id))
    return
  }
  const task = taskOfCall(tool, input, done.result, agentId, await $.clock.now())
  if (task !== undefined) await updateBackground($, list => addTask(list, task))
}

/** Marks the tasks of `agentId` as left by its turn, which just ended. */
export async function backgroundTurnEnded($: Engine, agentId: string) {
  if (!(await readBackground($)).some(x => x.agentId === agentId)) return
  const now = await $.clock.now()
  await updateBackground($, list => ownerEnded(list, agentId, now))
}

/** Marks the tasks of `agentId` as its own again: its turn started. */
export async function backgroundTurnStarted($: Engine, agentId: string) {
  if (!(await readBackground($)).some(x => x.agentId === agentId && x.ownerDoneAt !== undefined)) return
  await updateBackground($, list => ownerResumed(list, agentId))
}

// Keeps the registry to what the engine still runs, from the list of work in
// flight a Stop or SubagentStop carries; an engine that sends none leaves it.
async function pruneTo($: Engine, live: readonly { id: string }[] | undefined) {
  if (!Array.isArray(live)) return
  const list = await readBackground($)
  if (list.length === 0) return
  const now = await $.clock.now()
  const kept = keepLive(
    list,
    live.map(x => x.id),
    now,
  )
  if (kept.length !== list.length) await updateBackground($, () => kept)
}

type OnStopHook = HookFor<'classic.Stop'>
/** Forgets the tasks the engine no longer runs, when the main conversation's turn stops. */
export async function onStop($: Engine, e: Parameters<OnStopHook>[1], next: Parameters<OnStopHook>[2]) {
  await quiet($, pruneTo($, e.background_tasks), 'background prune')
  return next(e)
}

type OnSubagentStopHook = HookFor<'classic.SubagentStop'>
/** Forgets the tasks the engine no longer runs, when an agent's turn stops. */
export async function onSubagentStop($: Engine, e: Parameters<OnSubagentStopHook>[1], next: Parameters<OnSubagentStopHook>[2]) {
  await quiet($, pruneTo($, e.background_tasks), 'background prune')
  return next(e)
}

/**
 * How a stop is asked for: by the crew on its own (`auto`), which asks the
 * person nothing and keeps a task it may not stop for the person; by the
 * person's press (`press`), which may ask them; or as the session ends
 * (`end`), quietly.
 */
export type StopHow = 'auto' | 'press' | 'end'

/**
 * Stops `task` with a TaskStop call: forgets it once stopped or found over.
 * A stop that fails or is refused keeps it, says so in a toast, and, when
 * the crew tried on its own, is not tried again on its own.
 */
export async function stopTask($: Engine, task: BackgroundTask, how: StopHow) {
  const failed = async (reason: string) => {
    if (how === 'end') return
    if (how === 'auto') {
      const now = await $.clock.now()
      await updateBackground($, list => markStopFailed(list, task.id, now))
    }
    $.ui.toast(t().background.stopFailed(oneLine(task.command, TOAST_COMMAND) || task.id, reason))
  }
  try {
    if (how !== 'press') {
      // Nothing the person did not ask for opens a dialog: a stop the rules
      // do not let through without asking waits for their press.
      const verdict = await $.tool.check({ tool: 'TaskStop', input: { task_id: task.id } })
      if (verdict.decision !== 'allow') return await failed(verdict.reason ?? t().background.refused)
    }
    const done = await $.tool.call({ tool: 'TaskStop', task_id: task.id })
    if (done.deny !== undefined) return await failed(done.deny)
    if (done.isError === true && !isGone(done.text ?? '')) {
      unrecognized($, 'TaskStop error', done.text ?? '')
      return await failed(oneLine(done.text ?? '', 80))
    }
    await updateBackground($, list => dropTask(list, task.id))
  } catch (err) {
    await failed(err instanceof Error ? err.message : String(err))
  }
}

/** Stops each task whose worker is done (`isDueForStop`): for the progress tick. */
export async function sweepBackground($: Engine, now: number) {
  for (const task of (await readBackground($)).filter(x => isDueForStop(x, now))) await stopTask($, task, 'auto')
}

type OnSessionEndHook = HookFor<'session.end'>
/** Stops every task an agent left running as the session ends; the main conversation's stay. */
export async function onSessionEnd($: Engine, e: Parameters<OnSessionEndHook>[1], next: Parameters<OnSessionEndHook>[2]) {
  const left = (await quiet($, readBackground($), 'background read')) ?? []
  await Promise.all(left.filter(x => x.agentId !== undefined).map(x => stopTask($, x, 'end')))
  return next(e)
}
