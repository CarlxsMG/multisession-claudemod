// The crew's own tools: delegate, roster and progress.
import type { MatchedHook } from 'claude-code'

import { delegateInTurn, refuseWorker } from '../crew/delegate'
import { rosterText } from '../crew/roster'
import type { Engine } from '../engine'
import { declarePlan } from '../progress/plan'
import { setPlan } from '../progress/run-store'
import { PROGRESS_INVALID, PROGRESS_NOT_FOR_MAIN, PROGRESS_NO_RUN, progressReply } from '../prompts/results'
import { fieldOf, rawStringArg } from '../util/input'

// The crew's tools are matched by pattern (see hooks/register.tsx), so their
// calls come typed as any tool's.
type CrewToolHook = MatchedHook<'tool.call', { tool: RegExp }>
type CrewToolCall = Parameters<CrewToolHook>[1]

/** The delegate tool: the main conversation starts or reuses a worker; a worker is turned down. */
export async function delegateTool($: Engine, e: CrewToolCall) {
  // The orchestrator's tool: a worker splits its own task by forking.
  if (e.agentId !== undefined) return { result: await refuseWorker($, e.agentId) }
  return { result: await delegateInTurn($, e, e.tool_use_id) }
}

/** The roster tool: the crew as the model reads it, or one worker in full. */
export async function rosterTool($: Engine, e: CrewToolCall) {
  return { result: await rosterText($, rawStringArg(e, 'worker'), e.agentId === undefined) }
}

/**
 * The progress tool: a worker declares its plan, or the step it is on.
 * Answered in as few words as can be: the worker reads them, and the call it
 * owes next.
 */
export async function progressTool($: Engine, e: CrewToolCall) {
  if (e.agentId === undefined) return { result: PROGRESS_NOT_FOR_MAIN }
  const step = Number(fieldOf(e, 'step'))
  const total = Number(fieldOf(e, 'total'))
  if (!Number.isFinite(step) || !Number.isFinite(total) || step < 0 || total < 1) {
    return { result: PROGRESS_INVALID }
  }
  const doing = rawStringArg(e, 'doing') ?? ''
  const isNoted = await setPlan($, e.agentId, prev => declarePlan(prev, step, total, doing))
  return { result: isNoted ? progressReply(declarePlan(undefined, step, total, doing)) : PROGRESS_NO_RUN }
}
