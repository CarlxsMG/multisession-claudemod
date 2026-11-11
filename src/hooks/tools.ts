// The crew's own tools: delegate, roster, progress and compact.
import type { MatchedHook } from 'claude-code'

import { askCompaction } from '../crew/compaction'
import { delegateInTurn, refuseWorker } from '../crew/delegate'
import { rosterText } from '../crew/roster'
import { tellSilent } from '../crew/silence'
import { releaseWaiting, tellWaiting } from '../crew/waiting'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { declarePlan } from '../progress/plan'
import { COMPACT_NOT_FOR_WORKERS } from '../prompts/compact'
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
  // The tasks that waited for a run that ended go first, as they were asked
  // first; the ones that could not be given, this result says.
  await quiet($, releaseWaiting($, true), 'waiting')
  const result = await delegateInTurn($, e, e.tool_use_id)
  const notGiven = (await quiet($, tellWaiting($), 'waiting told')) ?? []
  const silent = (await quiet($, tellSilent($), 'silent told')) ?? []
  return { result: [result, ...notGiven, ...silent].join('\n') }
}

/** The roster tool: the crew as the model reads it, or one worker in full. */
export async function rosterTool($: Engine, e: CrewToolCall) {
  const roster = await rosterText($, rawStringArg(e, 'worker'), e.agentId === undefined)
  // A worker's look at the roster is told nothing of the others: the word is the orchestrator's.
  if (e.agentId !== undefined) return { result: roster }
  return { result: [roster, ...((await quiet($, tellSilent($), 'silent told')) ?? [])].join('\n') }
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

/**
 * The compact tool: the orchestrator queues a compaction of its own
 * conversation for a safe moment; a worker is told whose tool it is.
 */
export async function compactTool($: Engine, e: CrewToolCall) {
  if (e.agentId !== undefined) return { result: COMPACT_NOT_FOR_WORKERS }
  const after = rawStringArg(e, 'after') === 'reports' ? 'reports' : 'idle'
  return { result: await askCompaction($, (rawStringArg(e, 'focus') ?? '').trim(), after) }
}
