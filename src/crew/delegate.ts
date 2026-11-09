// The delegate tool: the worker a task goes to (a named one, the most recent
// free one of its kind in that repository, or a new one), the send or the
// spawn, and a task held for a worker another one woke.
import type { Intent, Takeover, Worker } from '../../types'
import { DEFAULT_TYPE } from '../config'
import { quiet, unrecognized } from '../engine'
import type { Engine } from '../engine'
import {
  FORK_REFUSED,
  OWN_MODEL,
  SESSION_MODEL,
  UNAPPLIED_FRESH,
  NEW_FRESH,
  NEW_NONE_FREE,
  PICKED_NAMED,
  TASK_REQUIRED,
  autoModeHandoff,
  given,
  givenAfterFailure,
  givenWhileBusy,
  headsUp,
  heldFor,
  heldMissed,
  heldWentFirst,
  newAfterLost,
  noModel,
  noRepo,
  noWorker,
  notForWorkers,
  notStarted,
  pickedFree,
  started,
  unapplied,
  unappliedModel,
  unappliedRepo,
  unappliedType,
  unreachable,
} from '../prompts/results'
import { modelAlias } from '../model-label'
import { heldTasks, taskClose } from '../prompts/worker'
import { runtime } from '../runtime'
import { readIntents, readLook, readParents, readTakeovers, readWorkers, readWorktrees, updateIntents, updateTakeovers } from '../state/atoms'
import { appendKept } from '../util/bounded'
import { fieldOf, rawStringArg, stringArg } from '../util/input'
import { joinPath, samePath } from '../util/path'
import { oneLine } from '../util/text'
import { deliver } from './deliver'
import { ORCH_ID, markCall, setOrch } from './feed'
import { release } from './takeover'
import { ACTIVE, REUSABLE, claimName, findWorker, recallWorker, takenNow, unclaimNames } from './workers'

// The heads-up of the tool's result, from the workers busy in the
// repository; one in a worktree of its own edits apart.
function busyHere(list: readonly Worker[], cwd: string, inWorktree: ReadonlySet<string>, except?: string): string {
  return headsUp(list.filter(w => samePath(w.cwd, cwd) && w.id !== except && !inWorktree.has(w.id) && ACTIVE.has(w.status)).map(w => w.name))
}

// The delegate tool's input, every field the model may leave out with its
// default. `worker` stays as sent: a result that names it says it so.
function readDelegateInput(input: object) {
  const task = stringArg(input, 'task')
  return {
    task,
    title: stringArg(input, 'title') || oneLine(task, 48),
    repo: stringArg(input, 'repo'),
    asked: stringArg(input, 'model'),
    askedType: stringArg(input, 'subagent_type'),
    worker: rawStringArg(input, 'worker'),
    isFresh: fieldOf(input, 'fresh') === true,
  }
}

// The directory a call's `repo` names, against the session's.
async function repoDir($: Engine, sessionCwd: string, repo: string): Promise<string> {
  // Windows has no HOME outside Git Bash: its home is USERPROFILE.
  const home = /^~([\\/]|$)/.test(repo) ? (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || '' : ''
  return joinPath(sessionCwd, home ? home + repo.slice(1) : repo)
}

// The free workers of that type the crew started there, the one that ended
// a turn last first, on the model a new worker would get, the one asked for
// or else the session's, however their own call named it: one asked for none
// is on the session's, and one asked for a model, or that a spawn answered a
// model for, is on that. However long its history: it compacts. A failed
// one is never free. `model` and `session` are aliases, and what a spawn
// answers may be a full id: all go by their family. A session whose model
// names no family has only the workers asked for none.
function freeWorkers(
  list: readonly Worker[],
  woken: ReadonlyMap<string, Takeover>,
  cwd: string,
  type: string,
  model: string,
  session: string | undefined,
): Worker[] {
  const isOn = (w: Worker, family: string | undefined) => family !== undefined && (modelAlias(w.asked ?? '') === family || modelAlias(w.model) === family)
  return list
    .filter(
      w =>
        samePath(w.cwd, cwd) &&
        (w.type || DEFAULT_TYPE) === type &&
        REUSABLE.has(w.status) &&
        !woken.has(w.id) &&
        w.asked !== null &&
        (model === '' ? w.asked === '' || isOn(w, session) : isOn(w, model)),
    )
    .sort((a, b) => lastFree(b) - lastFree(a))
}

// When a free worker last ended a turn: the order of a reuse, which a
// message to it or a sync must not change as they do `updatedAt`. One that
// has ended none goes by when it started.
const lastFree = (w: Worker): number => w.finishedAt ?? w.startedAt

// Where a worker in a worktree of its own works, as a result says it.
const worktreeOf = (cwd: string): string => `a worktree of ${cwd}`

// What a call that names its worker asks that the worker is not, for the
// result: it stays in its directory, of its type and on its model, and is
// never a new one. `where` is its directory as the result says it.
function unappliedTo(
  chosen: Worker,
  where: string,
  { repo, cwd, askedType, asked, isFresh }: { repo: string; cwd: string; askedType: string; asked: string; isFresh: boolean },
): string {
  const alias = asked === '' ? undefined : modelAlias(asked)
  // A haiku request is one for the session's model, as for a new worker.
  const isOnModel =
    alias !== undefined &&
    (modelAlias(chosen.model) === alias || (chosen.asked !== null && modelAlias(chosen.asked) === alias) || (alias === 'haiku' && chosen.asked === ''))
  const has = chosen.model !== '' ? chosen.model : chosen.asked === '' ? SESSION_MODEL : (chosen.asked ?? OWN_MODEL)
  return unapplied([
    ...(repo !== '' && !samePath(cwd, chosen.cwd) ? [unappliedRepo(cwd, where)] : []),
    ...(askedType !== '' && askedType !== (chosen.type || DEFAULT_TYPE) ? [unappliedType(askedType, chosen.type || DEFAULT_TYPE)] : []),
    ...(asked !== '' && !isOnModel ? [unappliedModel(asked, has)] : []),
    ...(isFresh ? [UNAPPLIED_FRESH] : []),
  ])
}

// What a delegate call asks for, read and resolved. `callId`: the main
// conversation's call, which its row names the worker of.
type Asked = { task: string; title: string; cwd: string; sessionCwd: string; type: string; model: string; callId: string | undefined }

// Gives the task to a worker that exists, which any mark on it allows; its
// answer, or why it was lost when the worker could not be reached and was not
// named, which leaves the task to a new worker. `why` is the result's clause
// for how it was picked.
async function giveTask(
  $: Engine,
  chosen: Worker,
  mark: Takeover | undefined,
  { task, title, callId }: Asked,
  isNamed: boolean,
  why: string,
  notes: (where: string) => string,
  list: readonly Worker[],
  inWorktree: ReadonlySet<string>,
): Promise<string | { lost: string }> {
  const look = await readLook($)
  // Tasks held for it that once did not reach it go first, together.
  const before = mark?.held ?? []
  const all = [...before, { task, title }]
  const body = before.length > 0 ? heldTasks(all) : task
  // Only a call that names its worker reaches one that is busy or failed.
  const wasBusy = ACTIVE.has(chosen.status)
  const state = wasBusy ? givenWhileBusy(chosen.name, oneLine(chosen.task, 48)) : chosen.status === 'failed' ? givenAfterFailure(chosen.name) : ''
  // Delegate's own workers always had the crew's preamble; any other agent
  // may not have (a fork, one started with delegation off): it hears it all.
  const sent = await deliver($, {
    id: chosen.id,
    worker: chosen,
    text: `${body}\n\n${taskClose(chosen.asked)}`,
    line: { from: { name: look.name, id: ORCH_ID }, to: chosen.name, text: body, tone: 'orch', isQuietIfLost: true },
    // A busy worker takes the task into the one in flight, whose title
    // stays its own in the pane and the roster.
    patch: w => ({ status: 'working', ...(wasBusy ? {} : { task: title }), tasks: w.tasks + all.length }),
    ...(wasBusy ? {} : { job: title }),
  })
  if (sent.isDelivered && mark !== undefined) await updateTakeovers($, list => list.filter(t => t.id !== chosen.id))
  if (!sent.isDelivered && mark !== undefined) {
    await updateTakeovers($, list => list.map(t => (t.id === chosen.id ? { ...t, held: [...t.held, { task, title }], missed: sent.reason, isTold: true } : t)))
    return heldMissed(chosen, all.length, sent.reason)
  }
  if (sent.isDelivered) {
    await setOrch($, 'delegating', `${title} → ${chosen.name}`)
    await markCall($, callId, chosen.id)
    // It works where it always did: the heads-up is about its repository,
    // and none for one in a worktree of its own.
    const own = inWorktree.has(chosen.id)
    const where = own ? worktreeOf(chosen.cwd) : chosen.cwd
    const warn = own ? '' : busyHere(list, chosen.cwd, inWorktree, chosen.id)
    return given(chosen, where, why, notes(where) + state + (before.length > 0 ? heldWentFirst(before.length) : '') + warn)
  }
  return isNamed ? unreachable(chosen.name, sent.reason) : { lost: sent.reason }
}

// Starts a new worker for the task, under a name free now; `why` is the
// result's clause for why no worker that existed took it.
async function startWorker(
  $: Engine,
  { task, title, cwd, sessionCwd, type, model, callId }: Asked,
  why: string,
  list: readonly Worker[],
  inWorktree: ReadonlySet<string>,
) {
  const { name } = claimName(await takenNow($, list))
  const address = name.toLowerCase()
  await intend($, { address, cwd, type })
  let spawned: Awaited<ReturnType<typeof $.agent.spawn>>
  try {
    spawned = await $.agent.spawn({
      prompt: task,
      description: title,
      name: address,
      subagentType: type,
      ...(!samePath(cwd, sessionCwd) ? { cwd } : {}),
      ...(model !== '' ? { model } : {}),
    })
  } catch (err) {
    // A spawn that throws started nothing: its name is free again.
    await unintend($, address)
    unclaimNames(name)
    throw err
  }
  if (spawned.deny !== undefined) {
    // Where auto mode reviews only the calls in the model's own response (the
    // desktop app's), the Agent call made here has no verdict and is refused
    // however often it is made: the orchestrator's own Agent call is reviewed,
    // and the spawn hook takes its agent as this worker.
    if (UNREVIEWED.test(spawned.deny)) {
      await intend($, { address, cwd, type, task })
      return autoModeHandoff(name, address, title, type, model, cwd)
    }
    // Any other refusal is said as it came; one in auto mode's words may be
    // the unreviewed one, worded anew.
    if (AUTO_MODE.test(spawned.deny)) unrecognized($, 'auto-mode spawn refusal', spawned.deny)
    await unintend($, address)
    unclaimNames(name)
    return notStarted(spawned.deny)
  }
  await setOrch($, 'delegating', `${title} → ${name}`)
  // The spawn hook has put it on the list by its address.
  const id = spawned.agentId ?? (await readWorkers($)).find(w => w.address === address)?.id
  if (id !== undefined) await markCall($, callId, id)
  return started(name, address, spawned.agentId, cwd, why, busyHere(list, cwd, inWorktree))
}

async function delegate($: Engine, input: object, callId?: string): Promise<string> {
  const { task, title, repo, asked, askedType, worker, isFresh } = readDelegateInput(input)
  if (task === '') return TASK_REQUIRED
  // A blank `worker` names no one: the task goes as if it had none.
  const isNamed = worker !== undefined && worker.trim() !== ''
  // A named worker takes the task whatever else the call asks: what would
  // only shape a new worker or a reuse is not checked, and the result notes
  // what the worker is not.
  const type = askedType || DEFAULT_TYPE
  const sessionCwd = await $.session.cwd()
  const cwd = repo === '' ? sessionCwd : await repoDir($, sessionCwd, repo)
  if (!isNamed && repo !== '' && !(await $.fs.exists(cwd))) return noRepo(cwd)
  // The Agent tool's `model` takes an alias only, so a full id goes as its
  // family, for the spawn and for the reuse that compares it with what a
  // worker was asked. A haiku request takes the session's model: a worker
  // runs on the model the user put the session on unless it is asked for
  // another, so on haiku only in a session on haiku.
  const alias = asked === '' ? '' : modelAlias(asked)
  if (!isNamed && alias === undefined) return noModel(asked)
  const model = alias === undefined || alias === 'haiku' ? '' : alias
  // Any type the Agent tool can dispatch, but a fork is that tool's own.
  if (!isNamed && type === 'fork') return FORK_REFUSED
  // The session's model, which a call for none is matched with.
  const session = isNamed || isFresh || model !== '' ? undefined : modelAlias(await $.session.model().catch(() => ''))
  const list = await readWorkers($)
  const inWorktree = new Set(await readWorktrees($))
  const woken = new Map((await readTakeovers($)).map(t => [t.id, t]))

  // The free workers that would do, best first: the first takes the task and
  // the result names the rest.
  const free = isNamed || isFresh ? [] : freeWorkers(list, woken, cwd, type, model, session)
  // One the list let go is still the crew's: named, it comes back from the shelf.
  const chosen = isNamed ? (findWorker(list, worker) ?? (await recallWorker($, worker))) : free[0]
  if (isNamed && chosen === undefined) {
    return noWorker(
      worker,
      list.map(w => w.address),
    )
  }

  const call: Asked = { task, title, cwd, sessionCwd, type, model, callId }
  if (chosen !== undefined) {
    // An agent its worker woke reports to that worker until the run ends: the
    // task waits, and goes from here then.
    const mark = woken.get(chosen.id)
    const notes = (where: string) => (isNamed ? unappliedTo(chosen, where, { repo, cwd, askedType, asked, isFresh }) : '')
    if (mark !== undefined && mark.missed === undefined) {
      return hold($, chosen, mark, task, title, notes(inWorktree.has(chosen.id) ? worktreeOf(chosen.cwd) : chosen.cwd), callId)
    }
    const why = isNamed ? PICKED_NAMED : pickedFree(free.slice(1).map(w => w.name))
    const answer = await giveTask($, chosen, mark, call, isNamed, why, notes, list, inWorktree)
    if (typeof answer === 'string') return answer
    return startWorker($, call, newAfterLost(chosen.name, answer.lost), list, inWorktree)
  }
  return startWorker($, call, isFresh ? NEW_FRESH : NEW_NONE_FREE, list, inWorktree)
}

// Keeps a task for a woken worker until its run ends, and says so.
async function hold($: Engine, worker: Worker, mark: Takeover, task: string, title: string, notes: string, callId?: string): Promise<string> {
  let waiting = 0
  await updateTakeovers($, list =>
    list.map(takeover => {
      if (takeover.id !== worker.id) return takeover
      const held = [...takeover.held, { task, title }]
      waiting = held.length
      return { ...takeover, held }
    }),
  )
  await setOrch($, 'delegating', `${title} → ${worker.name}`)
  await markCall($, callId, worker.id)
  return heldFor(worker, mark.by, waiting, notes)
}

/**
 * The word on held tasks that did not reach their worker, for a tool's
 * result; the marks are told, so no user message carries it again.
 */
export async function tellMissed($: Engine, missed: readonly Takeover[]): Promise<string[]> {
  if (missed.length === 0) return []
  const ids = new Set(missed.map(m => m.id))
  await updateTakeovers($, list => list.map(t => (ids.has(t.id) ? { ...t, isTold: true } : t)))
  const list = await readWorkers($)
  return missed.map(m => {
    const w = list.find(x => x.id === m.id) ?? { name: m.id, address: m.id }
    return heldMissed(w, m.held.length, m.missed ?? '')
  })
}

/** What delegate answers an agent that calls it, from who it reports to. */
export async function refuseWorker($: Engine, agentId: string): Promise<string> {
  const look = await readLook($)
  const reportsTo = (await readParents($)).find(p => p.id === agentId)?.parent ?? look.name
  return notForWorkers(look.name, reportsTo)
}

// Where and as what type delegate meant a new worker to work, by its
// address: the engine may not carry a spawn's `cwd` or type through to its
// own hooks. One delegate handed to the orchestrator to start keeps its
// task, which tells its agent from others if the Agent call names none.
// Kept in the state, as the orchestrator may start it after a reload; the
// newest, as one it never starts stays.
const INTENTS_KEEP = 50

function intend($: Engine, intent: Intent) {
  return updateIntents($, list => appendKept(list, [intent], INTENTS_KEEP, x => x.address))
}

function unintend($: Engine, address: string) {
  return updateIntents($, list => list.filter(x => x.address !== address))
}

/**
 * What delegate meant the agent a spawn starts to be, taken: by the name its
 * call gave, else, for one with no name that is no fork, by its task. `key`
 * is the address it was meant under, and nothing is meant under it any more.
 */
export async function takeIntent(
  $: Engine,
  name: string | undefined,
  prompt: string,
  isFork: boolean,
): Promise<{ key: string | undefined; intent: Intent | undefined }> {
  const list = await readIntents($)
  const key = name?.toLowerCase() ?? (name === undefined && !isFork ? list.find(x => x.task === prompt.trim())?.address : undefined)
  const intent = key !== undefined ? list.find(x => x.address === key) : undefined
  if (intent !== undefined) await unintend($, intent.address)
  return { key, intent }
}

// The refusal of a spawn auto mode had no verdict for: it reviews the calls
// in a model's response, and a plugin's call is in none.
const UNREVIEWED = /\bgave no verdict for\b/
// A refusal in auto mode's words.
const AUTO_MODE = /\bauto[- ]mode\b/i

/**
 * Runs a delegate call once the ones before it are done. Delegate calls in
 * one message may run at once: each waits for the one before, so two never
 * read the same crew and take one name or worker.
 */
export async function delegateInTurn($: Engine, input: object, callId: string): Promise<string> {
  const run = runtime.carried.delegating.then(async () => {
    // Its row reads "→ crew" until the worker is known.
    await markCall($, callId)
    // A woken worker whose run has ended gets what waited for it before
    // this; what did not reach it, the result says.
    const missed = (await quiet($, release($), 'release')) ?? []
    const result = await delegate($, input, callId)
    return [result, ...(await tellMissed($, missed))].join('\n')
  })
  runtime.carried.delegating = run.catch(() => undefined)
  return run
}
