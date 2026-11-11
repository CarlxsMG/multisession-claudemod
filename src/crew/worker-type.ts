// The crew's own agent type, `crew:worker`: what a worker `delegate` starts
// with no other type asked runs as. It has the tools of a general-purpose
// agent but the orchestrator's own (`delegate`, `compact`), whose
// descriptions would ride in every request of a worker that is refused both.
// The orchestrator still asks for, and reads of, a general-purpose worker:
// the type is the crew's way of starting it. The model is offered the type
// like any other: the engine asks the same question before it resumes an
// agent that ended, so a type kept from the model is one whose workers a
// message can no longer wake.
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
