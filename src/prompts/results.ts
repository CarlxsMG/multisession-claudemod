// What the crew's tools answer the model that called them, and how the
// conversation's crew rows read those answers back. A builder and the parser
// of its text sit together, so a change in wording reaches both;
// tests/golden/model-text.ts holds each text as it is.
import type { Plan, Worker } from '../../types'
import { ROSTER } from '../config'

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

/**
 * A free worker's send failed on its way and may have arrived: no other
 * worker is given the task, as two would then do it. `lost` are the free
 * ones tried before it that could not be reached.
 */
export const unsureSend = (w: Pick<Worker, 'name' | 'address'>, lost: readonly Lost[]): string =>
  `crew: the task may have reached ${w.name} (address "${w.address}"): its send failed on its way, so no other worker was tried and none started.${lost.length > 0 ? ` Before it, ${notReached(lost)}.` : ''} See whether ${w.name} is working (${ROSTER} with \`worker\` "${w.address}"): if it is, it has the task and reports to you; if not, give the task again.`

// What became of the tasks held for a woken worker that did not reach it:
// they wait for the next task given to it.
function missedBody(w: Pick<Worker, 'name' | 'address'>, count: number, reason: string): string {
  const wait = count === 1 ? 'It goes' : 'They go'
  const why = reason.replace(/^crew: /, '').replace(/\.$/, '')
  const it = count === 1 ? 'it' : 'them'
  return `held for ${w.name} (address "${w.address}") did not reach it: ${why}. ${wait} with the next task you give ${w.name}; or give ${it} to another worker word for word, which takes ${it} off ${w.name}.`
}

/** A tool's word on tasks held for a worker that did not reach it. */
export const heldMissed = (w: Pick<Worker, 'name' | 'address'>, count: number, reason: string): string =>
  `crew: ${count === 1 ? 'the task' : `the ${count} tasks`} ${missedBody(w, count, reason)}`

/** The note a user message carries of tasks that missed their worker while no crew tool was called. */
export const heldMissedNote = (w: Pick<Worker, 'name' | 'address'>, count: number, reason: string): string =>
  `[crew] ${count === 1 ? 'The task' : `The ${count} tasks`} ${missedBody(w, count, reason)}`

/**
 * What a delegate result adds when its task is one that was held for another
 * worker, `w`, and missed it: `w` is not sent it again.
 */
export const heldLetGo = (w: Pick<Worker, 'name' | 'address'>, to: string): string =>
  `crew: the task held for ${w.name} (address "${w.address}") is let go: ${to} has it now.`

/**
 * A worker whose held tasks missed it could not be reached again, for the
 * same reason, and the engine lists it no more: the tasks held for it, the
 * call's own last, are let go, each by its title.
 */
export function heldDropped(w: Pick<Worker, 'name' | 'address'>, titles: readonly string[], reason: string): string {
  const why = reason.replace(/^crew: /, '').replace(/\.$/, '')
  return `crew: ${w.name} (address "${w.address}") could not be reached again: ${why}. The ${titles.length} tasks held for it are let go, this one included: ${titles.map(title => `"${title}"`).join(', ')}. Give them to another worker.`
}

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
 * orchestrator starts the worker itself, with the Agent call spelt out, in
 * the turn delegate answered in: the crew holds the name no longer. The
 * description carries the worker's name ahead, which tells the call from
 * those of other handoffs however the rest is worded. `isFirst`: the
 * session's first, which says how new workers start from here on, as the
 * brief was written before the crew could know.
 */
export function autoModeHandoff(name: string, address: string, title: string, type: string, model: string, cwd: string, isFirst: boolean): string {
  // The name comes last and only where the tool takes one: it does not
  // everywhere, and the crew knows the agent without it, by the rest.
  const args = [
    `description "(${name}) ${title}"`,
    `subagent_type "${type}"`,
    ...(model !== '' ? [`model "${model}"`] : []),
    `name "${address}" if the tool takes a name`,
  ]
  const fromNowOn = isFirst
    ? ' While this session is in auto mode, delegate hands every new worker over like this and still gives a task to a free one itself. For several new workers, make the delegate calls in one message and their Agent calls in the next, each with the description its handoff gives.'
    : ''
  return `${HANDED_OVER}, not the one delegate makes. Start ${name} yourself before this turn ends: Agent tool with ${args.join(', ')}, and as prompt the task exactly as you gave delegate. The crew takes that agent as ${name}, working in ${cwd}. Left for a later turn, the handoff lapses: delegate the task again then.${fromNowOn}`
}

// How a handoff's result starts, which its row reads back.
const HANDED_OVER = 'crew: nothing started: auto mode reviews only calls you write'

/**
 * What the Agent call that started a worker delegate handed over reads after
 * its result, as delegate's own result would have said it: the worker, where
 * it works (`where` as `given` takes it), why a new one, then `notes`, each
 * with its leading space, and any heads-up.
 */
export const handedStarted = (w: Pick<Worker, 'id' | 'name' | 'address'>, where: string, why: string, notes: string, headsUp: string): string =>
  `[crew] This agent is ${w.name} (address "${w.address}", id ${w.id}), the worker delegate had you start, in ${where}: a new one, ${why}.${notes}${headsUp}`

/**
 * What `handedStarted` adds when the Agent call named another model than
 * delegate was asked: `runsOn` is delegate's, an alias or words for it.
 */
export const handedModel = (runsOn: string, called: string): string => ` It runs on ${runsOn}, as delegate was asked, not on "${called}".`

const GIVEN = 'Given to '
const STARTED = 'Started '

/** Why a task went to a worker that existed: the call named it. */
export const PICKED_NAMED = 'as named'
/** Why a task went to a worker that existed: no call named it, and of the free ones it came first. */
export const PICKED_FREE = 'the free worker of that type and model there that last finished a task'

// The free workers passed over that a result names; the rest are counted.
const ALSO_FREE = 3

/**
 * `PICKED_FREE` with the free workers it was picked over, best first, so the
 * orchestrator can send the task to one of them by name instead.
 */
export const pickedFree = (others: readonly string[]): string => PICKED_FREE + alsoFree(others)

// The free workers a task did not go to, best first, and how to pick one; ''
// when there is none.
function alsoFree(others: readonly string[]): string {
  if (others.length === 0) return ''
  const more = others.length - ALSO_FREE
  const names = others.slice(0, ALSO_FREE).join(', ') + (more > 0 ? ` and ${more} more` : '')
  return ` (also free: ${names}; name one with \`worker\` to pick it)`
}

/** A free worker a task was sent to and did not reach, with the reason its send gave. */
export type Lost = { name: string; reason: string }

// The free workers that could not be reached, each with its reason, up to
// "could not be reached"; `aside` goes between the names and the verb.
function notReached(lost: readonly Lost[], aside = ''): string {
  const why = lost.map(l => l.reason.replace(/^crew: /, '').replace(/\.$/, ''))
  if (lost.length === 1) return `${lost[0]!.name}${aside} could not be reached (${why[0]})`
  const each = lost.map((l, i) => `${l.name} (${why[i]})`)
  return `${each.slice(0, -1).join(', ')} and ${each[each.length - 1]}${aside} could not be reached`
}

/**
 * Why a task went to a worker that existed: the free ones ahead of it, `lost`
 * in the order tried, did not get it. `others` are the free ones after it.
 */
export const pickedNext = (lost: readonly Lost[], others: readonly string[]): string =>
  `the next free worker of that type and model there${alsoFree(others)}, as ${notReached(lost)}`
/** Why a new worker was started: none that was free would do. */
export const NEW_NONE_FREE = 'as no free worker of that type and model was there'
/**
 * Why a new worker was started: the free ones that would do, `idle`, best
 * first, ended their last turn over `warmMin` minutes ago, and one such is
 * reused only when named.
 */
export const newAfterIdle = (idle: readonly string[], warmMin: number): string =>
  `as no free worker of that type and model there finished a task in the last ${warmMin} min, so none has its context cached${alsoFree(idle)}`
/** Why a new worker was started: the call asked for one. */
export const NEW_FRESH = 'as `fresh` asked'
/**
 * Why a new worker was started: the free ones the task was sent to, `lost` in
 * the order tried, did not get it. `untried` are the free ones it was not sent
 * to, as only so many are tried.
 */
export const newAfterLost = (lost: readonly Lost[], untried: readonly string[]): string =>
  `as ${notReached(lost, ', free there,')}${untried.length > 0 ? `, and no more were tried${alsoFree(untried)}` : ''}`

/**
 * What the context of a worker no call named holds, for `given`: the task it
 * last had, how long ago its last turn ended (`ago`, undefined for one that
 * ended none) and the tokens its turns used, as the roster words them. The
 * orchestrator did not choose this worker: it reads here what it got.
 */
export const holds = (lastTask: string, ago: string | undefined, tokens: string): string =>
  `: last task "${lastTask}"${ago === undefined ? '' : `, finished ${ago} ago`}, ${tokens} used`

/**
 * `where` is the worker's repository, or "a worktree of" it; `why` the
 * clause that says how it was picked; `notes` the sentences that follow, each
 * with its leading space, then any heads-up; `held` what `holds` says of a
 * worker no call named, '' for one named.
 */
export const given = (w: Pick<Worker, 'name' | 'address'>, where: string, why: string, notes: string, held = ''): string =>
  `${GIVEN}${w.name} (address "${w.address}") in ${where}, ${why}; context kept${held}.${notes}`

/**
 * What a task given to a worker named while busy adds: it arrived inside the
 * task in flight, whose title the worker keeps.
 */
export const givenWhileBusy = (name: string, inFlight: string): string =>
  ` ${name} is busy: the task reached it as a message in the middle of "${inFlight}", which it may finish first or set aside.`

/** What a task given to a worker named after a failed run adds. */
export const givenAfterFailure = (name: string): string => ` ${name}'s last run failed: if this task builds on that one, have it check what was left undone.`

/** What a task given to a worker whose last run was stopped adds, named or not. */
export const givenAfterStop = (name: string): string => ` ${name}'s last run was stopped: if this task builds on that one, have it check what was left undone.`

/** A `repo` a call gave with a worker that works elsewhere; `where` as `given` takes it. */
export const unappliedRepo = (asked: string, where: string): string => `\`repo\` ${asked} (it works in ${where})`
/** A `subagent_type` a call gave with a worker of another type. */
export const unappliedType = (asked: string, has: string): string => `\`subagent_type\` ${asked} (it is ${has})`
/** A `model` a call gave with a worker on another; `has` is its model's id, or words for it. */
export const unappliedModel = (asked: string, has: string): string => `\`model\` ${asked} (it runs on ${has})`
/** The `fresh` of a call that names its worker. */
export const UNAPPLIED_FRESH = '`fresh` (it is not a new worker)'
/** A worker's model when its spawn asked for none and answered none. */
export const SESSION_MODEL = "the session's model"
/** A worker's model when the crew has no word of it. */
export const OWN_MODEL = 'a model of its own'

/**
 * What a task given to, or held for, a named worker adds when the call asked
 * what the worker is not: each of `items` with what the worker has; '' when
 * there is none.
 */
export const unapplied = (items: readonly string[]): string =>
  items.length === 0 ? '' : ` Not applied, as a named worker stays as it is: ${items.join('; ')}.`

/** `why` is the clause that says why a new worker and not one that existed. */
export const started = (name: string, address: string, id: string | undefined, cwd: string, why: string, headsUp: string): string =>
  `${STARTED}${name} (address "${address}", id ${id ?? '?'}) in ${cwd}, ${why}.${headsUp}`

// The files of a busy worker a heads-up names, the latest; the rest are counted.
const HEADS_UP_FILES = 4

// A busy worker's edits so far, for the heads-up: the latest files by name,
// the earlier ones counted, or that it has made none.
function editsSoFar(files: readonly string[]): string {
  if (files.length === 0) return 'none yet'
  const more = files.length - HEADS_UP_FILES
  return files.slice(-HEADS_UP_FILES).join(', ') + (more > 0 ? ` and ${more} more` : '')
}

/**
 * The lines for the result when other workers are busy in the repository, ''
 * when none is: who, and the files each one's run has edited so far, by its
 * name, as the caller gives them. Only the editing tools are seen, so the
 * second line says what was edited, not what is free.
 */
export function headsUp(busy: readonly string[], edits: ReadonlyMap<string, readonly string[]> = new Map()): string {
  if (busy.length === 0) return ''
  const many = busy.length > 1
  const who = `\nHeads-up: ${busy.join(', ')} ${many ? 'are' : 'is'} working in this repository; keep files apart or wait for ${many ? 'their reports' : 'its report'}.`
  return `${who}\nFiles edited so far: ${busy.map(name => `${name}: ${editsSoFar(edits.get(name) ?? [])}`).join('; ')}.`
}

/**
 * `waiting` counts the tasks held for the worker, this one included; `notes`
 * are the sentences that follow, each with its leading space.
 */
export function heldFor(w: Pick<Worker, 'name' | 'address'>, by: string, waiting: number, notes = ''): string {
  const more = waiting > 1 ? ` ${waiting} tasks held; they go together.` : ''
  return `Held for ${w.name} (address "${w.address}"): ${w.name} is answering ${by}, whose message woke it. It gets this task when that run ends, and reports to you.${more}${notes}`
}

/**
 * A task held until a run ends, as `after` asked: for `to`, or a new worker
 * when it names none, behind the worker `behind` and the task it is on
 * (`inFlight`). `waiting` counts the tasks held behind that run, this one
 * included; `notes` are the sentences that follow, each with its leading
 * space.
 */
export function heldAfter(to: Pick<Worker, 'name' | 'address'> | undefined, behind: string, inFlight: string, waiting: number, notes = ''): string {
  const head = to === undefined ? 'Held for a new worker: it starts with this task' : `Held for ${to.name} (address "${to.address}"): it gets this task`
  const whose = to !== undefined && to.name === behind ? 'its' : `${behind}'s`
  const more = waiting > 1 ? ` ${waiting} tasks held behind ${behind}; they go in order.` : ''
  return `${head} when ${whose} run ends ("${inFlight}"), as a task of its own, and reports to you. If that run fails or is stopped, the task is not given and you are told.${more}${notes}`
}

/** A line for the result of a call whose `after` names a worker that is not busy: nothing waited. */
export const afterOver = (name: string): string => `\nNothing waited: ${name}, named in \`after\`, is not busy.`

/**
 * Where auto mode reviews only the model's own calls, a new worker cannot
 * start when a run ends, with no turn to hand it over in: nothing is held.
 */
export const afterNeedsWorker = (behind: string): string =>
  `crew: nothing held: auto mode reviews only calls you write, so a new worker cannot start on its own when ${behind}'s run ends. Give the task once ${behind} reports, or name a worker for it with \`worker\`.`

/** Why a task that waited for a run was not given: how that run ended, or that its worker is gone with no word of it. */
export const afterEnded = (behind: string, how: 'failed' | 'stopped' | 'gone'): string =>
  how === 'failed' ? `${behind}'s run failed` : how === 'stopped' ? `${behind}'s run was stopped` : `${behind} is gone, and how its run ended is not known`
/** Why a task that waited for a run was not given: the worker it was for is the crew's no more. */
export const AFTER_NO_WORKER = 'the worker it was for is gone'
/** Why a task that waited for a run was not given: its send did not arrive, with the reason. */
export const afterNotReached = (name: string, reason: string): string => `it did not reach ${name}: ${reason.replace(/^crew: /, '').replace(/\.$/, '')}`
/** Why a task that waited for a run was not given: no new worker could start, with the refusal. */
export const afterNotStarted = (deny: string): string => `no worker could start: ${deny.replace(/\.$/, '')}`
/** The refusal of a spawn made with no turn of the orchestrator's to review it in. */
export const AFTER_UNREVIEWED = 'auto mode reviews only calls you write'

// A task that waited for the run of `behind` and was not given, with why.
const notGivenBody = (title: string, behind: string, why: string): string =>
  `task "${title}", held behind ${behind}, was not given: ${why}. Give it again if it still stands.`

/** A tool's word on a task that waited for a run and was not given. */
export const notGiven = (title: string, behind: string, why: string): string => `crew: the ${notGivenBody(title, behind, why)}`

/** The note a user message carries of a task that was not given while no crew tool was called. */
export const notGivenNote = (title: string, behind: string, why: string): string => `[crew] The ${notGivenBody(title, behind, why)}`

/**
 * What delegate answers an agent that calls it: who it reports to, and how it
 * splits its task instead.
 */
export const notForWorkers = (orchName: string, reportsTo: string): string =>
  `crew: delegate is ${orchName}'s tool, not a worker's; nothing started. To split your task, fork yourself once per part (Agent tool, \`subagent_type: "fork"\`) and report the whole; for work beyond it, ask ${reportsTo} in your report.`

/**
 * How delegate's result went, as its row says: the worker it reused, a new
 * one, or a task held: for a woken worker, with whom that one answers, or
 * (`isAfter`) until a run ends, with the worker whose run it is.
 */
export type DelegateOutcome = { kind: 'reused' | 'new'; busy: string[] } | { kind: 'held'; by: string; isAfter?: true }

/** What a delegate result said happened, read back for its row in the conversation. */
export function readDelegate(text: string): DelegateOutcome | undefined {
  const isHeld = /^Held for \S+ \(address [^)]*\): \S+ is answering (\S+?),/.exec(text)
  if (isHeld !== null) return { kind: 'held', by: isHeld[1]! }
  const isAfter = /^Held for (?:a new worker|(\S+) \(address [^)]*\)): it (?:gets|starts with) this task when (?:its|(\S+?)'s) run ends/.exec(text)
  if (isAfter !== null) return { kind: 'held', by: isAfter[2] ?? isAfter[1] ?? '', isAfter: true }
  // A handoff's row is a crew row only once its worker started: a new one.
  if (text.startsWith(HANDED_OVER)) return { kind: 'new', busy: [] }
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
 * plan is followed through to its last step, whether its first call was at
 * step 1 or declared it at step 0.
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
