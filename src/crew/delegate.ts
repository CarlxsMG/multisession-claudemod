// The delegate tool: the worker a task goes to (a named one, the most recent
// free one of its kind in that repository, or a new one), the send or the
// spawn, and a task held for a worker another one woke or until a run ends.
import type { Handed, Intent, Takeover, Waiting, Worker } from '../../types'
import { DEFAULT_TYPE, REUSE_WARM_MIN } from '../config'
import { quiet, unrecognized } from '../engine'
import type { Engine } from '../engine'
import {
  AFTER_UNREVIEWED,
  FORK_REFUSED,
  OWN_MODEL,
  SESSION_MODEL,
  UNAPPLIED_FRESH,
  NEW_FRESH,
  NEW_NONE_FREE,
  PICKED_NAMED,
  SEND_UNSURE,
  TASK_REQUIRED,
  afterNeedsWorker,
  afterOver,
  autoModeHandoff,
  delegatedTo,
  given,
  givenAfterFailure,
  givenAfterStop,
  givenWhileBusy,
  handedModel,
  handedStarted,
  headsUp,
  heldAfter,
  heldDropped,
  heldFor,
  heldLetGo,
  heldMissed,
  heldWentFirst,
  holds,
  newAfterIdle,
  newAfterLost,
  noModel,
  noRepo,
  noWorker,
  notForWorkers,
  notStarted,
  pickedFree,
  pickedNext,
  started,
  unapplied,
  unappliedModel,
  unappliedRepo,
  unappliedType,
  unreachable,
  unsureSend,
} from '../prompts/results'
import type { Lost } from '../prompts/results'
import { modelAlias } from '../model-label'
import { tokensText } from '../prompts/roster'
import { heldTasks, newMates, taskClose } from '../prompts/worker'
import { runtime } from '../runtime'
import {
  readDropped,
  readIntents,
  readLook,
  readParents,
  readTakeovers,
  readWorkers,
  readWorktrees,
  updateIntents,
  updateTakeovers,
  updateWaiting,
} from '../state/atoms'
import { appendKept } from '../util/bounded'
import { fieldOf, rawStringArg, stringArg } from '../util/input'
import { joinPath, samePath, under } from '../util/path'
import { oneLine } from '../util/text'
import { shortTime } from '../util/time'
import { deliver } from './deliver'
import { editsInFlight } from './edits'
import { ORCH_ID, markCall, setOrch } from './feed'
import { release } from './takeover'
import { bareTitle, nameAhead } from './title'
import { spawnTypeOf } from './worker-type'
import { ACTIVE, REUSABLE, claimName, findWorker, recallWorker, takenNow, toldMates, unclaimNames, untoldMatesOf } from './workers'

// The heads-up of the tool's result, from the workers busy in the
// repository, each with the files its run has edited so far, as seen from
// the repository; one in a worktree of its own edits apart.
async function busyHere($: Engine, list: readonly Worker[], cwd: string, inWorktree: ReadonlySet<string>, except?: string): Promise<string> {
  const busy = list.filter(w => samePath(w.cwd, cwd) && w.id !== except && !inWorktree.has(w.id) && ACTIVE.has(w.status))
  if (busy.length === 0) return ''
  const edits = (await quiet($, editsInFlight($), 'edits')) ?? new Map<string, string[]>()
  return headsUp(
    busy.map(w => w.name),
    new Map(busy.map(w => [w.name, (edits.get(w.id) ?? []).map(path => under(cwd, path))])),
  )
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
    after: rawStringArg(input, 'after'),
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
// model for, is on that. However long its history: it compacts; how long ago
// it last worked is the caller's to weigh (`isWarm`). A failed one is never
// free. `model` and `session` are aliases, and what a spawn
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

// Whether a free worker ended its last turn so lately that its conversation
// is still in the prompt cache: only such a one is reused without being
// named (see `REUSE_WARM_MIN`).
const isWarm = (w: Worker, now: number): boolean => now - lastFree(w) < REUSE_WARM_MIN * 60_000

// What the context of a free worker holds, for the result of a call that
// did not name it.
const holding = (w: Worker, now: number): string =>
  holds(oneLine(w.task, 48), w.finishedAt === undefined ? undefined : shortTime(now - w.finishedAt), tokensText(w.tokens))

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
// answer, or why it was lost when the worker could not be reached, which
// leaves the task to the caller. `why` is the result's clause for how it was
// picked, and `held` what its context holds, for a worker no call named.
async function giveTask(
  $: Engine,
  chosen: Worker,
  mark: Takeover | undefined,
  { task, title, callId }: Asked,
  why: string,
  notes: (where: string) => string,
  list: readonly Worker[],
  inWorktree: ReadonlySet<string>,
  held = '',
): Promise<string | { lost: string }> {
  const look = await readLook($)
  // Tasks held for it that once did not reach it go first, together.
  const before = mark?.held ?? []
  const all = [...before, { task, title }]
  const body = before.length > 0 ? heldTasks(all) : task
  // Only a call that names its worker reaches one that is busy or failed; a
  // stopped one is free to any call, and left as much undone.
  const wasBusy = ACTIVE.has(chosen.status)
  const state = wasBusy
    ? givenWhileBusy(chosen.name, oneLine(chosen.task, 48))
    : chosen.status === 'failed'
      ? givenAfterFailure(chosen.name)
      : chosen.status === 'stopped'
        ? givenAfterStop(chosen.name)
        : ''
  // The teammates there now that neither its preamble nor an earlier task
  // told it of: it reaches them without a look at the roster. Not the agents
  // it started itself, which it knows.
  const started = new Set((await readParents($)).filter(p => p.parent === chosen.name).map(p => p.id))
  const mates = untoldMatesOf(
    list.filter(w => !started.has(w.id)),
    chosen,
  )
  // Delegate's own workers always had the crew's preamble; any other agent
  // may not have (a fork, one started with delegation off): it hears it all.
  const sent = await deliver($, {
    id: chosen.id,
    worker: chosen,
    text: `${body}\n\n${newMates(mates, inWorktree, chosen.mates !== undefined)}${taskClose(chosen.asked)}`,
    line: { from: { name: look.name, id: ORCH_ID }, to: chosen.name, text: body, tone: 'orch', isQuietIfLost: true },
    // A busy worker takes the task into the one in flight, whose title
    // stays its own in the pane and the roster.
    patch: w => ({
      status: 'working',
      ...(wasBusy ? {} : { task: title }),
      tasks: w.tasks + all.length,
      ...(mates.length > 0 ? { mates: toldMates(w, mates) } : {}),
    }),
    ...(wasBusy ? {} : { job: title }),
  })
  if (sent.isDelivered && mark !== undefined) await updateTakeovers($, list => list.filter(t => t.id !== chosen.id))
  if (!sent.isDelivered && mark !== undefined) {
    // Missed again for the same reason, and the engine lists it no more: it
    // is gone, and tasks kept for it would wait for a worker nothing reaches.
    if (mark.missed === sent.reason && !(await isListed($, chosen.id))) {
      await updateTakeovers($, list => list.filter(t => t.id !== chosen.id))
      return heldDropped(
        chosen,
        all.map(h => h.title),
        sent.reason,
      )
    }
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
    const warn = own ? '' : await busyHere($, list, chosen.cwd, inWorktree, chosen.id)
    return given(chosen, where, why, notes(where) + state + (before.length > 0 ? heldWentFirst(before.length) : '') + warn, held)
  }
  return { lost: sent.reason }
}

// Whether the engine still lists the agent; a list that cannot be read
// takes nothing for gone.
async function isListed($: Engine, id: string): Promise<boolean> {
  const infos = await quiet($, $.agent.list(), 'agent list')
  return infos === undefined || infos.some(info => info.id === id)
}

// How many free workers an unnamed task is sent to before a new one starts:
// each send that fails is a round trip the call waits for.
const REUSE_TRIES = 3

// Whether auto mode refused a spawn of delegate's for want of a verdict in
// this session: until the session starts again or leaves that mode, every
// new worker is handed to the orchestrator without the spawn being tried.
const handoffs = runtime.handoffs

// Hands the worker named `name` to the orchestrator to start: what it is
// meant to be waits for its Agent call, and the result spells that call out.
// `isFirst`: the session's first, whose result also says how new workers
// start from here on.
async function handOver($: Engine, { task, title, cwd, type, model, callId }: Asked, name: string, why: string, isFirst: boolean): Promise<string> {
  const address = name.toLowerCase()
  const handed: Handed = { title, asked: model, why, ...(callId !== undefined ? { callId } : {}) }
  await intend($, { address, cwd, type, task, handed })
  return autoModeHandoff(name, address, title, type, model, cwd, isFirst)
}

/**
 * The permission mode the main conversation starts an agent in, as its spawn
 * says it: out of auto mode, delegate's own spawn is tried again.
 */
export function noteSpawnMode(mode: string | undefined) {
  if (mode !== undefined && mode !== 'auto') handoffs.isUnreviewed = false
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
  const asked: Asked = { task, title, cwd, sessionCwd, type, model, callId }
  // The refusal does not change while the session stays in that mode: the
  // spawn is not made again to hear it.
  if (handoffs.isUnreviewed) return handOver($, asked, name, why, false)
  await intend($, { address, cwd, type })
  let spawned: Awaited<ReturnType<typeof $.agent.spawn>>
  try {
    spawned = await $.agent.spawn({
      prompt: task,
      description: title,
      name: address,
      // The type it is to the orchestrator and the crew stays the one asked,
      // which the intent holds and a reuse compares.
      subagentType: spawnTypeOf(type),
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
      handoffs.isUnreviewed = true
      return handOver($, asked, name, why, true)
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
  return started(name, address, spawned.agentId, cwd, why, await busyHere($, list, cwd, inWorktree))
}

/**
 * Takes the agent the orchestrator started as the worker delegate handed
 * over, once it is on the list: the delegate call's row names it, and what
 * its Agent call reads after its result says what delegate's own result
 * would have. `called` is the model the Agent call named.
 */
export async function adoptHanded($: Engine, handed: Handed, worker: Pick<Worker, 'id' | 'name' | 'address' | 'cwd'>, called: string | undefined) {
  await setOrch($, 'delegating', `${handed.title} → ${worker.name}`)
  await markCall($, handed.callId, worker.id)
  const inWorktree = new Set(await readWorktrees($))
  const own = inWorktree.has(worker.id)
  const where = own ? worktreeOf(worker.cwd) : worker.cwd
  const warn = own ? '' : await busyHere($, await readWorkers($), worker.cwd, inWorktree, worker.id)
  // Delegate's model stands, whatever the Agent call named.
  const isOther = called !== undefined && called !== '' && (modelAlias(called) ?? called) !== handed.asked
  const model = isOther ? handedModel(handed.asked === '' ? SESSION_MODEL : handed.asked, called) : ''
  return handedStarted(worker, where, handed.why, model, warn)
}

async function delegate($: Engine, input: object, callId?: string): Promise<string> {
  const { task, title, repo, asked, askedType, worker: called, after, isFresh } = readDelegateInput(input)
  if (task === '') return TASK_REQUIRED
  // A blank `worker` names no one, as a blank `after` does: the task goes as
  // if it had none. A task that waits for a run and asks for no other worker
  // is for the worker whose run it is.
  const isAfter = after !== undefined && after.trim() !== ''
  const worker = called !== undefined && called.trim() !== '' ? called : isAfter && !isFresh ? after : undefined
  const isNamed = worker !== undefined
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
  const list = await readWorkers($)
  const inWorktree = new Set(await readWorktrees($))
  const woken = new Map((await readTakeovers($)).map(t => [t.id, t]))

  const call: Asked = { task, title, cwd, sessionCwd, type, model, callId }
  // The worker whose run the task waits for, while it is busy; one that is
  // not has nothing to wait for, and the result says so.
  const named = isAfter ? (findWorker(list, after) ?? findWorker(await readDropped($), after)) : undefined
  if (isAfter && named === undefined) {
    return noWorker(
      after,
      list.map(w => w.address),
    )
  }
  const behind = named !== undefined && ACTIVE.has(named.status) ? named : undefined
  const noWait = (result: string) =>
    named !== undefined && behind === undefined && delegatedTo(result) !== undefined ? result + afterOver(named.name) : result
  if (isNamed) {
    // One the list let go is still the crew's: named, it comes back from the shelf.
    const chosen = findWorker(list, worker) ?? (await recallWorker($, worker))
    if (chosen === undefined) {
      return noWorker(
        worker,
        list.map(w => w.address),
      )
    }
    // An agent its worker woke reports to that worker until the run ends: the
    // task waits, and goes from here then.
    const mark = woken.get(chosen.id)
    const notes = (where: string) => unappliedTo(chosen, where, { repo, cwd, askedType, asked, isFresh })
    const where = inWorktree.has(chosen.id) ? worktreeOf(chosen.cwd) : chosen.cwd
    // Woken, it gets the task when the run it answers with ends, which is
    // the run a call for it alone waits for.
    if (mark !== undefined && mark.missed === undefined && (behind === undefined || behind.id === chosen.id)) {
      return hold($, chosen, mark, task, title, notes(where), callId)
    }
    if (behind !== undefined) return waitBehind($, behind, chosen, call, notes(where))
    const answer = await giveTask($, chosen, mark, call, PICKED_NAMED, notes, list, inWorktree)
    return typeof answer === 'string' ? noWait(answer) : unreachable(chosen.name, answer.lost)
  }
  // Only `fresh` brings a call with `after` here: a new worker, once that run ends.
  if (behind !== undefined) return handoffs.isUnreviewed ? afterNeedsWorker(behind.name) : waitBehind($, behind, undefined, call, '')

  // The free workers that would do, best first: the task goes to the first
  // it reaches, and the result names the ones it did not reach and the rest.
  // None has a mark, so each is a plain send. One that last worked too long
  // ago to be in the prompt cache is not tried: the result names it among
  // the rest, for a call that wants its context to name it.
  // The session's model, which a call for none is matched with.
  const session = isFresh || model !== '' ? undefined : modelAlias(await $.session.model().catch(() => ''))
  const now = await $.clock.now()
  const able = isFresh ? [] : freeWorkers(list, woken, cwd, type, model, session)
  const free = able.filter(w => isWarm(w, now))
  const cold = able.filter(w => !isWarm(w, now))
  const names = (workers: readonly Worker[]) => workers.map(w => w.name)
  const lost: Lost[] = []
  for (const candidate of free.slice(0, REUSE_TRIES)) {
    const rest = names([...free.slice(lost.length + 1), ...cold])
    const why = lost.length === 0 ? pickedFree(rest) : pickedNext(lost, rest)
    const answer = await giveTask($, candidate, undefined, call, why, () => '', list, inWorktree, holding(candidate, now))
    if (typeof answer === 'string') return answer
    // A send that failed on its way may have arrived: given to another
    // worker too, the task would be done twice.
    if (answer.lost === SEND_UNSURE) return unsureSend(candidate, lost)
    lost.push({ name: candidate.name, reason: answer.lost })
  }
  const why =
    lost.length > 0
      ? newAfterLost(lost, names([...free.slice(lost.length), ...cold]))
      : isFresh
        ? NEW_FRESH
        : cold.length > 0
          ? newAfterIdle(names(cold), REUSE_WARM_MIN)
          : NEW_NONE_FREE
  return noWait(await startWorker($, call, why, list, inWorktree))
}

// The tasks kept until a run ends, the newest: far more than a session holds at once.
const WAITING_KEEP = 50

// Keeps a task until the run of `behind` ends, for `to` or, with none, for a
// new worker as the call asked, and says so.
async function waitBehind($: Engine, behind: Worker, to: Worker | undefined, { task, title, cwd, type, model, callId }: Asked, notes: string): Promise<string> {
  const now = await $.clock.now()
  let waiting = 0
  await updateWaiting($, list => {
    const seq = Math.max(now, ...list.map(w => w.seq + 1))
    const kept: Waiting = {
      seq,
      after: behind.id,
      behind: behind.name,
      to: to?.id ?? null,
      task,
      title,
      cwd,
      type,
      model,
      ...(callId !== undefined ? { callId } : {}),
    }
    const next = appendKept(list, [kept], WAITING_KEEP)
    waiting = next.filter(w => w.after === behind.id && w.missed === undefined).length
    return next
  })
  await setOrch($, 'delegating', to !== undefined ? `${title} → ${to.name}` : title)
  await markCall($, callId, to?.id)
  return heldAfter(to, behind.name, oneLine(behind.task, 48), waiting, notes)
}

/**
 * Starts a new worker for a task that waited for a run, from the timer or
 * from a call of the main conversation. No turn of the orchestrator's is
 * there to hand the worker over in, so where auto mode reviews only the
 * model's own calls none starts. Answers the worker's id, or why none
 * started as `lost`.
 */
export async function startBehind(
  $: Engine,
  asked: Pick<Waiting, 'task' | 'title' | 'cwd' | 'type' | 'model' | 'callId'>,
): Promise<{ id: string | undefined } | { lost: string }> {
  if (handoffs.isUnreviewed) return { lost: AFTER_UNREVIEWED }
  const { name } = claimName(await takenNow($, await readWorkers($)))
  const address = name.toLowerCase()
  const sessionCwd = await $.session.cwd()
  await intend($, { address, cwd: asked.cwd, type: asked.type })
  const giveUp = async (lost: string) => {
    await unintend($, address)
    unclaimNames(name)
    return { lost }
  }
  let spawned: Awaited<ReturnType<typeof $.agent.spawn>>
  try {
    spawned = await $.agent.spawn({
      prompt: asked.task,
      description: asked.title,
      name: address,
      subagentType: asked.type,
      ...(!samePath(asked.cwd, sessionCwd) ? { cwd: asked.cwd } : {}),
      ...(asked.model !== '' ? { model: asked.model } : {}),
    })
  } catch (err) {
    return giveUp(err instanceof Error ? err.message : String(err))
  }
  if (spawned.deny !== undefined) {
    if (!UNREVIEWED.test(spawned.deny)) return giveUp(spawned.deny)
    handoffs.isUnreviewed = true
    return giveUp(AFTER_UNREVIEWED)
  }
  // The spawn hook has put it on the list by its address.
  const id = spawned.agentId ?? (await readWorkers($)).find(w => w.address === address)?.id
  if (id !== undefined) await markCall($, asked.callId, id)
  return { id }
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
 * Lets go of the held tasks that missed their worker and that the call just
 * gave, word for word, to another: that worker has the task now, so the
 * first is not sent it with its next one, and a mark left with no task goes.
 * Answers a line for each worker a task was let go for.
 */
async function letGoElsewhere($: Engine, task: string, result: string): Promise<string[]> {
  const to = delegatedTo(result)
  if (to === undefined) return []
  const isIt = (held: { task: string }) => held.task.trim() === task
  const crew = [...(await readWorkers($)), ...(await readDropped($))]
  const ownerOf = (id: string) => crew.find(w => w.id === id) ?? { name: id, address: id }
  // The mark of the worker that got it is delegate's own to lift.
  const isElsewhere = (mark: Takeover) => mark.missed !== undefined && ownerOf(mark.id).address !== to.address && mark.held.some(isIt)
  const freed = (await readTakeovers($)).filter(isElsewhere)
  if (freed.length === 0) return []
  await updateTakeovers($, marks =>
    marks.flatMap(mark => {
      if (!isElsewhere(mark)) return [mark]
      const held = mark.held.filter(h => !isIt(h))
      return held.length > 0 ? [{ ...mark, held }] : []
    }),
  )
  return freed.map(mark => heldLetGo(ownerOf(mark.id), to.name))
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
// task and what its call asked, which tell its agent from others.
// Kept in the state, as the orchestrator may start it after a reload, and
// until its turn ends: `lapseHandoffs`. The newest, as a turn may end unseen.
const INTENTS_KEEP = 50

function intend($: Engine, intent: Intent) {
  return updateIntents($, list => appendKept(list, [intent], INTENTS_KEEP, x => x.address))
}

function unintend($: Engine, address: string) {
  return updateIntents($, list => list.filter(x => x.address !== address))
}

/**
 * Puts back the intent of a handed-over worker whose Agent call started
 * nothing: the orchestrator may write the call again before its turn ends.
 */
export function keepHandoff($: Engine, intent: Intent) {
  return intend($, intent)
}

/**
 * Lets go of the workers delegate handed to the orchestrator that it did not
 * start: their names are free and nothing is meant under them. Called when
 * the main conversation's turn ends, and only then: every Agent call the
 * turn wrote has spawned by that time, in whichever response it came, so
 * none loses its intent before its spawn reads it.
 */
export async function lapseHandoffs($: Engine) {
  const lapsed = (await readIntents($)).filter(x => x.task !== undefined).map(x => x.address)
  if (lapsed.length === 0) return
  await updateIntents($, list => list.filter(x => !lapsed.includes(x.address)))
  unclaimNames(...lapsed)
}

/** A spawn as `takeIntent` reads it: `isOrchestrators` for one the main conversation's Agent call made. */
export type SpawnCall = { name: string | undefined; prompt: string; description: string; type: string; isFork: boolean; isOrchestrators: boolean }

// The worker handed to the orchestrator that its Agent call starts, which
// may name none (its tool may take no name) and reword what delegate spelt
// out: the one whose name stands ahead of the call's description, as the
// handoff gave it, which tells any number of handoffs apart; else the one
// with that task; else the only one with that title; else, for a call with
// no name, the only one of that type. Two that fit alike are none: a worker
// taken for another would get the wrong name, directory and model.
function handoffFor(pending: readonly Intent[], { name, prompt, description, type }: SpawnCall): Intent | undefined {
  const ahead = nameAhead(description)
  const byName = ahead !== undefined ? pending.find(x => x.address === ahead) : undefined
  if (byName !== undefined) return byName
  const byTask = pending.find(x => x.task === prompt.trim())
  if (byTask !== undefined) return byTask
  const title = bareTitle(description).trim()
  const byTitle = title === '' ? [] : pending.filter(x => x.handed?.title.trim() === title)
  if (byTitle.length > 0) return byTitle.length === 1 ? byTitle[0] : undefined
  const ofType = name === undefined ? pending.filter(x => x.type === type) : []
  return ofType.length === 1 ? ofType[0] : undefined
}

/**
 * What delegate meant the agent a spawn starts to be, taken, so nothing is
 * meant under its address any more: by the name its call gave, else, for the
 * orchestrator's own call that is no fork, the handoff it answers (see
 * `handoffFor`).
 */
export async function takeIntent($: Engine, call: SpawnCall): Promise<Intent | undefined> {
  const list = await readIntents($)
  const named = call.name !== undefined ? list.find(x => x.address === call.name?.toLowerCase()) : undefined
  const intent =
    named ??
    (call.isOrchestrators && !call.isFork
      ? handoffFor(
          list.filter(x => x.task !== undefined),
          call,
        )
      : undefined)
  if (intent !== undefined) await unintend($, intent.address)
  return intent
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
    const freed = (await quiet($, letGoElsewhere($, stringArg(input, 'task'), result), 'let go')) ?? []
    return [result, ...freed, ...(await tellMissed($, missed))].join('\n')
  })
  runtime.carried.delegating = run.catch(() => undefined)
  return run
}
