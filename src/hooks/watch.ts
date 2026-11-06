// Every tool call of the session, watched: what the orchestrator and each
// worker are doing, for the pane, the rows and the check-ins.
import type { HookFor } from 'claude-code'

import { DELEGATE, PROGRESS } from '../config'
import { gistOf, markCall, markCrewCall, setJob, setOrch } from '../crew/feed'
import { noteSendGist } from '../crew/sends'
import { forgetIsolated, noteIsolated, takeRenamed } from '../crew/spawn'
import { findWorker } from '../crew/workers'
import type { Engine } from '../engine'
import { t } from '../i18n'
import { describe } from '../progress/phase'
import { noteCall } from '../progress/run-store'
import { TODO_TOOLS, noteTodos } from '../progress/todos'
import { readMembers } from '../state/atoms'
import type { ToolCall } from '../util/input'
import { oneLine } from '../util/text'

type WatchCallHook = HookFor<'tool.call'>
/**
 * Follows every tool call but the progress tool's: a spawn into a worktree
 * and the name its agent took, who a SendMessage reaches, and a worker's
 * activity, phase and plan.
 */
export async function watchCall($: Engine, e: Parameters<WatchCallHook>[1], next: Parameters<WatchCallHook>[2]) {
  if ((e.tool as string) === PROGRESS) return next(e)
  const call: ToolCall = e
  if (call.tool === 'Agent' && call.isolation === 'worktree') await noteIsolated($, String(call.tool_use_id))
  if (e.tool === 'SendMessage' && typeof call.to === 'string') {
    const target = findWorker(await readMembers($), call.to)
    if (target !== undefined) await setJob($, target.id, gistOf(call.summary, call.message))
    if (e.agentId !== undefined) await noteSendGist($, e.agentId, call.summary, call.message)
  }
  if (e.agentId !== undefined) {
    if (e.tool === 'SendMessage' || e.tool === 'TaskStop') await markCall($, e.tool_use_id)
    await noteCall($, e.agentId, call)
  } else if (e.tool === 'Agent') {
    await setOrch($, 'delegating', t().delegatingTo(oneLine(String(call.description ?? ''), 40)))
  } else if (e.tool === 'SendMessage') {
    await setOrch($, 'delegating', t().talkingTo(String(call.to ?? '?')))
    await markCrewCall($, e.tool_use_id, call.to)
  } else if (e.tool !== DELEGATE) {
    await setOrch($, 'working', describe(call))
    if (e.tool === 'TaskStop') await markCrewCall($, e.tool_use_id, call.task_id ?? call.shell_id)
  }
  if (e.tool === 'Agent') {
    // Its spawn ran inside: a name the crew gave in place of the call's is said here.
    const done = await next(e)
    // A denied call spawned nothing: no agent will ask for its worktree.
    if (done.deny !== undefined) await forgetIsolated($, String(call.tool_use_id))
    const note = takeRenamed(e.tool_use_id)
    return note === undefined || done.deny !== undefined ? done : { ...done, context: [...(done.context ?? []), note] }
  }
  if (e.agentId === undefined || !TODO_TOOLS.has(e.tool)) return next(e)
  const done = await next(e)
  if (done.result !== undefined) await noteTodos($, e.agentId, call, done.result)
  return done
}
