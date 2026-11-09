// What the crew's tools answer the model that called them, and how the
// conversation's crew rows read those answers back. A builder and the parser
// of its text sit together, so a change in wording reaches both;
// tests/golden/model-text.ts holds each text as it is.
import type { Plan, Worker } from '../../types'

// ---- delegate ----

export const TASK_REQUIRED = 'crew: `task` is required.'
export const FORK_REFUSED = 'crew: a fork starts from the Agent tool (`subagent_type: "fork"`), not delegate.'
/** What the delegate hook answers when delegate itself fails. */
export const DELEGATE_FAILED = 'crew: delegate failed; use the Agent tool instead.'

export const noRepo = (cwd: string): string => `crew: ${cwd} does not exist.`

/** A `model` that names none of the families the Agent tool takes. */
export const noModel = (asked: string): string => `crew: no model "${asked}"; nothing started. Models: sonnet, opus, fable, or none for the session's.`

/** No worker by that name or address: delegate's and the roster's alike. */
export const noWorker = (key: string, addresses: readonly string[]): string =>
  `crew: no worker "${key}". Workers: ${addresses.length > 0 ? addresses.join(', ') : 'none'}.`

export const unreachable = (name: string, reason: string): string => `crew: could not reach ${name}: ${reason}`

// What became of the tasks held for a woken worker that did not reach it:
// they wait for the next task given to it.
function missedBody(w: Pick<Worker, 'name' | 'address'>, count: number, reason: string): string {
  const wait = count === 1 ? 'It goes' : 'They go'
  const why = reason.replace(/^crew: /, '').replace(/\.$/, '')
  return `held for ${w.name} (address "${w.address}") did not reach it: ${why}. ${wait} with the next task you give ${w.name}, or give ${count === 1 ? 'it' : 'them'} to another worker.`
}

/** A tool's word on tasks held for a worker that did not reach it. */
export const heldMissed = (w: Pick<Worker, 'name' | 'address'>, count: number, reason: string): string =>
  `crew: ${count === 1 ? 'the task' : `the ${count} tasks`} ${missedBody(w, count, reason)}`

/** The note a user message carries of tasks that missed their worker while no crew tool was called. */
export const heldMissedNote = (w: Pick<Worker, 'name' | 'address'>, count: number, reason: string): string =>
  `[crew] ${count === 1 ? 'The task' : `The ${count} tasks`} ${missedBody(w, count, reason)}`

/** What a task given to a worker whose held tasks once missed it adds: those went first. */
export const heldWentFirst = (count: number): string => ` ${count === 1 ? 'The task' : `The ${count} tasks`} held for it went first, in the same message.`

export const notStarted = (deny: string): string => `crew: could not start a worker: ${deny}`

/**
 * What an Agent call reads after its result when the name it gave does not
 * fit a worker (2 to 4 characters) or another member has it.
 */
export const renamedAgent = (asked: string, name: string, address: string): string =>
  `[crew] The crew calls this agent ${name}, not "${asked}": a worker's name is 2 to 4 characters and no other worker's. SendMessage reaches it as "${address}".`

/**
 * Where auto mode reviews only the calls in the model's own response, the
 * orchestrator starts the worker itself, with the Agent call spelt out.
 */
export function autoModeHandoff(name: string, address: string, title: string, type: string, model: string, cwd: string): string {
  const args = [`name "${address}"`, `description "${title}"`, `subagent_type "${type}"`, ...(model !== '' ? [`model "${model}"`] : [])]
  return `crew: nothing started: auto mode reviews only calls you write, not the one delegate makes. Start ${name} yourself now: Agent tool with ${args.join(', ')}, and as prompt the task exactly as you gave delegate. The crew takes that agent as ${name}, working in ${cwd}.`
}

const GIVEN = 'Given to '
const STARTED = 'Started '

/**
 * `where` is the worker's repository, or "a worktree of" it; `notes` the
 * sentences that follow, each with its leading space, then any heads-up.
 */
export const given = (w: Pick<Worker, 'name' | 'address'>, where: string, notes: string): string =>
  `${GIVEN}${w.name} (address "${w.address}") in ${where}; context kept.${notes}`

/**
 * What a task given to a worker named while busy adds: it arrived inside the
 * task in flight, whose title the worker keeps.
 */
export const givenWhileBusy = (name: string, inFlight: string): string =>
  ` ${name} is busy: the task reached it as a message in the middle of "${inFlight}", which it may finish first or set aside.`

/** What a task given to a worker named after a failed run adds. */
export const givenAfterFailure = (name: string): string => ` ${name}'s last run failed: if this task builds on that one, have it check what was left undone.`

export const started = (name: string, address: string, id: string | undefined, cwd: string, headsUp: string): string =>
  `${STARTED}${name} (address "${address}", id ${id ?? '?'}) in ${cwd}.${headsUp}`

/**
 * A line for the result when other workers are busy in the repository, ''
 * when none is.
 */
export function headsUp(busy: readonly string[]): string {
  if (busy.length === 0) return ''
  const many = busy.length > 1
  return `\nHeads-up: ${busy.join(', ')} ${many ? 'are' : 'is'} working in this repository; keep files apart or wait for ${many ? 'their reports' : 'its report'}.`
}

/** `waiting` counts the tasks held for the worker, this one included. */
export function heldFor(w: Pick<Worker, 'name' | 'address'>, by: string, waiting: number): string {
  const more = waiting > 1 ? ` ${waiting} tasks held; they go together.` : ''
  return `Held for ${w.name} (address "${w.address}"): ${w.name} is answering ${by}, whose message woke it. It gets this task when that run ends, and reports to you.${more}`
}

/**
 * What delegate answers an agent that calls it: who it reports to, and how it
 * splits its task instead.
 */
export const notForWorkers = (orchName: string, reportsTo: string): string =>
  `crew: delegate is ${orchName}'s tool, not a worker's; nothing started. To split your task, fork yourself once per part (Agent tool, \`subagent_type: "fork"\`) and report the whole; for work beyond it, ask ${reportsTo} in your report.`

/**
 * How delegate's result went, as its row says: the worker it reused, a new
 * one, or a task held for a woken one, with whom that one answers.
 */
export type DelegateOutcome = { kind: 'reused' | 'new'; busy: string[] } | { kind: 'held'; by: string }

/** What a delegate result said happened, read back for its row in the conversation. */
export function readDelegate(text: string): DelegateOutcome | undefined {
  const isHeld = /^Held for \S+ \(address [^)]*\): \S+ is answering (\S+?),/.exec(text)
  if (isHeld !== null) return { kind: 'held', by: isHeld[1]! }
  const isReused = text.startsWith(GIVEN)
  if (!isReused && !text.startsWith(STARTED)) return undefined
  const busy = /^Heads-up: (.+?) (?:is|are) working in this repository/m.exec(text)?.[1]?.split(', ') ?? []
  return { kind: isReused ? 'reused' : 'new', busy }
}

// The worker each of delegate's results names first, with its address, and
// the id a new one's adds.
const DELEGATED = /^(?:Given to|Started|Held for) (\S+) \(address "([^"]*)"(?:, id ([^)\s]+))?\)/

/**
 * The worker a delegate result says it reached, read back for a row the
 * session has no record of: its name, address and id ('' where the result
 * gives none, as a reused worker's and a held task's do).
 */
export function delegatedTo(text: string): Pick<Worker, 'id' | 'name' | 'address'> | undefined {
  const found = DELEGATED.exec(text)
  if (found === null) return undefined
  const id = found[3] ?? ''
  return { id: id === '?' ? '' : id, name: found[1]!, address: found[2]! }
}

// ---- progress ----

export const PROGRESS_NOT_FOR_MAIN = 'crew: progress is for workers; nothing changed.'
export const PROGRESS_INVALID = 'crew: step is 0 or more and total 1 or more.'
export const PROGRESS_NO_RUN = 'crew: no run of yours to note it on.'

/**
 * What the progress tool answers the worker: the call it owes next, so a
 * plan declared at step 0 is followed through to its last step.
 */
export function progressReply(p: Pick<Plan, 'step' | 'total'>): string {
  if (p.step >= p.total) return 'ok; last step.'
  return `ok; next: step ${p.step + 1} of ${p.total}, as you start it.`
}

// ---- sends ----

/**
 * The reason a send says when the session.send hook failed after the send
 * may have gone out.
 */
export const SEND_UNSURE = 'crew: the message may not have gone out; check before sending it again.'

// ---- commands that do not end ----

/**
 * Why a Bash or PowerShell call was refused: `what` (`` `tail -f` ``, an
 * endless loop) would run until killed, and what to run instead.
 */
export const runawayDenied = (what: string): string =>
  `crew: refused: ${what} does not end, and a process left running lags the app. Run it in the foreground under \`timeout N\` (for a log, \`timeout 30 tail -n 50 -f file\`), or watch it with Monitor and a timeout_ms. Background only what must outlive the call, and TaskStop it when done.`
