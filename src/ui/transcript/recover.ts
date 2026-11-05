// The worker a crew row names, read from the row alone, for a row the
// session has no record of: one of a conversation resumed after Claude Code
// restarted, whose session state is gone. Only what the row says comes
// back: a name, an address, and the agent's id where the row gives one,
// which its color comes from. A member with id '' has no color of its own.
import type { Member } from '../../../types'
import { DELEGATE } from '../../config'
import { ORCH_ID } from '../../crew/feed'
import { isWorkerName } from '../../persona/names'
import { delegatedTo } from '../../prompts/results'
import { cap, textOf } from '../../util/text'

// The engine's task type of a subagent, as TaskStop's result names it.
const AGENT_TASK = 'local_agent'
// How the engine's notification of a subagent's end opens.
const AGENT_NOTE = /^Agent "/

const fieldsOf = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {})
const stringOf = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

// What the crew calls an agent a row knows only by the key a call gave or
// the engine names it by: a key that fits a worker's name is that name (its
// address is the name in lowercase), any other the key as it is.
const nameOfKey = (key: string): string => (isWorkerName(key) ? cap(key) : key)

/**
 * Whether a crew tool's result says its call reached a worker: delegate's
 * names one and a TaskStop's says it stopped a subagent; a SendMessage's
 * names no one, and whoever it went to the row draws as the crew's.
 */
export function reachedWorker(tool: string, output: unknown): boolean {
  if (tool === DELEGATE) return delegatedTo(textOf(output).trim()) !== undefined
  if (tool === 'TaskStop') return fieldsOf(output).task_type === AGENT_TASK
  return tool === 'SendMessage'
}

/**
 * The worker a finished crew call of the main conversation reached, from its
 * input and result: the one delegate's result names, or the recipient a
 * SendMessage or TaskStop gave, with the id its result gives. Undefined for
 * a call that reached none.
 */
export function calledWorker(tool: string, input: unknown, output: unknown): Member | undefined {
  if (!reachedWorker(tool, output)) return undefined
  if (tool === DELEGATE) return delegatedTo(textOf(output).trim())
  const given = fieldsOf(input)
  const done = fieldsOf(output)
  // A SendMessage address may carry a " [ref]"; only a worker sends to the
  // main conversation.
  const key = (tool === 'SendMessage' ? stringOf(given.to).replace(/\s*\[[^\]]*\]$/, '') : stringOf(given.task_id)) || stringOf(done.task_id)
  if (key === '' || key === ORCH_ID) return undefined
  return { id: stringOf(tool === 'SendMessage' ? done.resumedAgentId : done.task_id), name: nameOfKey(key), address: key }
}

/**
 * The agent a task notification reports the end of, when it is a
 * subagent's (every agent of the main conversation is the crew's): its id,
 * and no name, which a notification does not carry.
 */
export const notedAgent = (id: string, text: string, type: string | undefined): Member | undefined =>
  type === undefined && AGENT_NOTE.test(text) ? { id, name: '', address: '' } : undefined

/**
 * The worker a message came from, by the name the engine gives its sender:
 * a subagent's address, a worker's name in lowercase. Another session's
 * and a channel's carry a kind of their own, and a name no worker could have
 * is someone else's.
 */
export const messageSender = (name: string, kind: string): Member | undefined =>
  kind === 'unclassified' && isWorkerName(name) && name.toLowerCase() !== ORCH_ID ? { id: '', name: nameOfKey(name), address: name } : undefined
