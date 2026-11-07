// The background tasks the session's agents leave running, as pure rules:
// which tool results start one, which the engine no longer runs, and which
// the crew stops on its own. A dev server, a `tail -f` or a loop a worker
// forgot keeps running after that worker is done and slows Claude Code down.
import type { BackgroundTask } from '../../types'
import { appendKept } from '../util/bounded'

/** The tasks the registry keeps, newest last: past it the oldest is forgotten, not stopped. */
export const MAX_TASKS = 100
/**
 * How long a task its worker waits for keeps running once that worker's
 * turn has ended: the worker is parked on it (a long test run), so it is
 * stopped only when it outlasts this.
 */
export const PARKED_STOP_MS = 10 * 60_000
/**
 * How young a task is still kept when the engine's list of live tasks lacks
 * it: a list taken while its call was answered may not have it yet.
 */
export const LIST_GRACE_MS = 5000
/** How many characters of a task's command the registry keeps. */
export const COMMAND_CUT = 300

/** The tools whose calls may leave a task running in the background, or stop one. */
export const BACKGROUND_TOOLS: ReadonlySet<string> = new Set(['Bash', 'PowerShell', 'Monitor', 'TaskStop'])

const asRecord = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {})
const text = (x: unknown): string => (typeof x === 'string' ? x : '')

/**
 * The task a tool call left running, from its input and the engine's
 * result, or undefined for none. A shell the engine ends with its caller's
 * final response is not one: nothing is left to stop.
 */
export function taskOfCall(tool: string, input: unknown, result: unknown, agentId: string | undefined, now: number): BackgroundTask | undefined {
  const call = asRecord(input)
  const out = asRecord(result)
  const owner = agentId !== undefined ? { agentId } : {}
  if (tool === 'Bash' || tool === 'PowerShell') {
    const id = text(out.backgroundTaskId)
    if (id === '' || out.backgroundEndsWithFinalResponse === true) return undefined
    const wakes = out.backgroundWakesOwner === true ? { wakesOwner: true } : {}
    // A command the engine backgrounded at its timeout started that long before.
    const ranFor = typeof out.timedOutAfterMs === 'number' ? out.timedOutAfterMs : 0
    return { id, ...owner, command: text(call.command).slice(0, COMMAND_CUT), kind: 'shell', startedAt: now - ranFor, ...wakes }
  }
  if (tool === 'Monitor') {
    const id = text(out.taskId)
    if (id === '') return undefined
    const command = text(call.command) || text(asRecord(call.ws).url) || text(call.description)
    return { id, ...owner, command: command.slice(0, COMMAND_CUT), kind: 'monitor', startedAt: now }
  }
  return undefined
}

/** The id a TaskStop call names, or '' for none. */
export function stoppedId(input: unknown): string {
  const call = asRecord(input)
  return text(call.task_id) || text(call.shell_id)
}

/** `list` with `task` added, newest last, one entry per id. */
export function addTask(list: readonly BackgroundTask[], task: BackgroundTask): BackgroundTask[] {
  return appendKept(list, [task], MAX_TASKS, x => x.id)
}

/** `list` without the task `id`. */
export function dropTask(list: readonly BackgroundTask[], id: string): BackgroundTask[] {
  return list.filter(x => x.id !== id)
}

/**
 * `list` kept to the tasks the engine still runs, as `live` (its ids of
 * the work in flight) says, and those too young to be on it.
 */
export function keepLive(list: readonly BackgroundTask[], live: readonly string[], now: number): BackgroundTask[] {
  const ids = new Set(live)
  return list.filter(x => ids.has(x.id) || now - x.startedAt < LIST_GRACE_MS)
}

/** `list` with the tasks of `agentId` marked as left by a turn that ended at `now`. */
export function ownerEnded(list: readonly BackgroundTask[], agentId: string, now: number): BackgroundTask[] {
  return list.map(x => (x.agentId === agentId ? { ...x, ownerDoneAt: now } : x))
}

/** `list` with the tasks of `agentId` marked as their agent's again: its turn started. */
export function ownerResumed(list: readonly BackgroundTask[], agentId: string): BackgroundTask[] {
  return list.map(x => {
    if (x.agentId !== agentId || x.ownerDoneAt === undefined) return x
    const { ownerDoneAt: _, ...rest } = x
    return rest
  })
}

/**
 * Whether the crew stops `task` on its own at `now`: an agent's task once
 * that agent's turn has ended, at once, or, when the agent waits for it,
 * once it has run `PARKED_STOP_MS` past that end. The main conversation's
 * tasks are never stopped on their own, and one whose stop failed is left
 * to the person.
 */
export function isDueForStop(task: BackgroundTask, now: number): boolean {
  if (task.agentId === undefined || task.ownerDoneAt === undefined || task.stopFailedAt !== undefined) return false
  return task.wakesOwner !== true || now - task.ownerDoneAt >= PARKED_STOP_MS
}

/** `list` with the task `id` marked as one whose stop failed at `now`. */
export function markStopFailed(list: readonly BackgroundTask[], id: string, now: number): BackgroundTask[] {
  return list.map(x => (x.id === id ? { ...x, stopFailedAt: now } : x))
}

// TaskStop's error for a task the engine no longer runs: it ended, or was
// stopped, since the registry saw it.
const GONE = /no (?:running |background )?(?:task|shell)|not found|not running|already (?:stopped|completed|finished|exited)/i

/** Whether a TaskStop error says the task was already over, so nothing is left to stop. */
export function isGone(error: string): boolean {
  return GONE.test(error)
}
