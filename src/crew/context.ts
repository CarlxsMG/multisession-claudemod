// How much each worker's conversation holds: the tokens its last model
// request sent and was answered with, which its next one sends again. The
// engine reports a turn's usage summed over its requests, which says what the
// turn cost and not how large the conversation is, so the figure is read off
// each response as it ends, in a hook that passes the stream on untouched. It
// stays in memory until the worker's turn ends: a write of the workers at
// every request would draw the pane again at each.
import type { HookFor } from 'claude-code'

import type { Worker } from '../../types'
import { runtime } from '../runtime'
import { setKept } from '../util/bounded'

// Each agent's latest figure of this load, the newest.
const sizes = runtime.context
const SIZES_KEEP = 200

type StepHook = HookFor<'turn.step'>
/**
 * Passes a model request's response on as it streams, and keeps what an
 * agent's conversation holds once it ended. The main conversation's is the
 * engine's own to measure.
 */
export async function* noteStep(e: Parameters<StepHook>[1], next: Parameters<StepHook>[2]) {
  const result = yield* next(e)
  const usage = result.usage
  if (e.agentId !== undefined && usage !== null) {
    setKept(sizes.last, e.agentId, usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.output_tokens, SIZES_KEEP)
  }
  return result
}

/**
 * What a worker's conversation holds, in tokens: as of its last response in
 * this load, else as its last turn's end kept it; undefined when no response
 * of it was seen, as for a worker of an earlier version.
 */
export const contextOf = (worker: Pick<Worker, 'id' | 'context'>): number | undefined => sizes.last.get(worker.id) ?? worker.context
