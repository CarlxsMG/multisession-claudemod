// The crew's own agent type, `crew:worker`: what a worker `delegate` starts
// with no other type asked runs as. It has the tools of a general-purpose
// agent but the orchestrator's own (`delegate`, `compact`), whose
// descriptions would ride in every request of a worker that is refused both.
// The orchestrator still asks for, and reads of, a general-purpose worker:
// the type is the crew's way of starting it, kept out of the model's list.
import type { HookFor } from 'claude-code'

import { DEFAULT_TYPE } from '../config'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import { WORKER_AGENT } from '../prompts/worker'
import { runtime } from '../runtime'

// The type's full name once the engine registered it, which a session's
// start sets afresh.
const type = runtime.workerType

/**
 * Registers the crew's agent type with the engine. An engine that refuses
 * it leaves the workers as they were, general-purpose agents.
 */
export async function registerWorkerType($: Engine) {
  const registered = await quiet($, $.agent.register(WORKER_AGENT), 'worker type')
  type.name = registered?.agent
}

/**
 * The agent type `delegate` spawns for the type a call asked: the crew's own
 * for the default one, once the engine has it; any other as asked.
 */
export const spawnTypeOf = (asked: string): string => (asked === DEFAULT_TYPE && type.name !== undefined ? type.name : asked)

type OfferHook = HookFor<'agent.offer'>
/**
 * Keeps the crew's type out of the agent types the model is offered: a worker
 * starts through `delegate`, which briefs it, puts it on the list and reuses it.
 */
export function hideWorkerType(_: Engine, __: Parameters<OfferHook>[1]) {
  return { isOffered: false }
}
