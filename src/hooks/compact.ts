// Compaction: the crew's instructions for every summary of a conversation it
// works in, and the crew's state given back to the orchestrator afterwards.
import type { HookFor } from 'claude-code'

import { rosterText } from '../crew/roster'
import type { Engine } from '../engine'
import { COMPACT_MAIN, COMPACT_WORKER, crewStateNote, withCrewInstructions } from '../prompts/compact'
import { readIsOn, readWorkers } from '../state/atoms'

/** The name of the context block that carries the crew's state. */
export const CREW_STATE_BLOCK = 'crewState'

type OnCompactHook = HookFor<'session.compact'>
/**
 * Adds the crew's instructions to a compaction: the orchestrator's to the
 * main conversation's while delegation is on or the crew has workers, a
 * worker's to a crew worker's own. It never skips one: an automatic
 * compaction runs because the context is full.
 */
export async function onCompact($: Engine, e: Parameters<OnCompactHook>[1], next: Parameters<OnCompactHook>[2]) {
  const workers = await readWorkers($)
  if (e.agentId === undefined) {
    if (!(await readIsOn($)) && workers.length === 0) return next(e)
    return next({ ...e, instructions: withCrewInstructions(e.instructions, COMPACT_MAIN) })
  }
  if (!workers.some(w => w.id === e.agentId)) return next(e)
  return next({ ...e, instructions: withCrewInstructions(e.instructions, COMPACT_WORKER) })
}

type CrewContextHook = HookFor<'prompt.context'>
/**
 * Adds the crew's state to the context a conversation starts from. The
 * engine asks again after a compaction and sends a block of a plugin's own
 * where the conversation holds none, so the summary is followed by the
 * roster as it stands then. Placed by the engine, it never lands between a
 * tool call and its result, as a message added to the compacted list could.
 * An empty crew adds nothing.
 */
export async function crewContext($: Engine, e: Parameters<CrewContextHook>[1], next: Parameters<CrewContextHook>[2]) {
  const composed = await next(e)
  if ((await readWorkers($)).length === 0) return composed
  const block = { name: CREW_STATE_BLOCK, text: crewStateNote(await rosterText($)) }
  return { ...composed, blocks: [...composed.blocks.filter(b => b.name !== CREW_STATE_BLOCK), block] }
}
