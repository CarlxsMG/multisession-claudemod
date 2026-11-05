// The delegate tool: the worker a task goes to (a named one, the most recent
// free one of its kind in that repository, or a new one), the send or the
// spawn, and a task held for a worker another one woke.
import type { Takeover, Worker } from '../../types'
import { quiet } from '../engine'
import type { Engine } from '../engine'
import {
  FORK_REFUSED,
  TASK_REQUIRED,
  autoModeHandoff,
  given,
  headsUp,
  heldFor,
  heldMissed,
  heldWentFirst,
  noRepo,
  noWorker,
  notForWorkers,
  notStarted,
  started,
  unreachable,
} from '../prompts/results'
import { heldTasks, taskClose } from '../prompts/worker'
import {
  readDropped,
  readLook,
  readParents,
  readTakeovers,
  readWorkers,
  readWorktrees,
  updateTakeovers,
} from '../state/atoms'
import { fieldOf, rawStringArg, stringArg } from '../util/input'
import { joinPath, samePath } from '../util/path'
import { oneLine } from '../util/text'
import { deliver } from './deliver'
import { ORCH_ID, markCall, setOrch } from './feed'
import { release } from './takeover'
import { ACTIVE, REUSABLE, findWorker, nextName } from './workers'

// The heads-up of the tool's result, from the workers busy in the
// repository; one in a worktree of its own edits apart.
function busyHere(list: readonly Worker[], cwd: string, inWorktree: ReadonlySet<string>, except?: string): string {
  return headsUp(
    list.filter(w => samePath(w.cwd, cwd) && w.id !== except && !inWorktree.has(w.id) && ACTIVE.has(w.status)).map(w => w.name),
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
    type: stringArg(input, 'subagent_type') || 'general-purpose',
    worker: rawStringArg(input, 'worker'),
    isFresh: fieldOf(input, 'fresh') === true,
  }
}

/**
 * The name a new worker takes: one on the shelf is still that worker's
 * address, and one handed to the orchestrator to start is taken.
 */
export async function freeName($: Engine, list: readonly Worker[]): Promise<string> {
  return nextName([...list, ...(await readDropped($))], intended.keys())
}

// `callId`: the main conversation's call, which its row names the worker of.
async function delegate($: Engine, input: object, callId?: string): Promise<string> {
  const { task, title, repo, asked, type, worker, isFresh } = readDelegateInput(input)
  if (task === '') return TASK_REQUIRED
  const sessionCwd = await $.session.cwd()
  let cwd = sessionCwd
  if (repo !== '') {
    // Windows has no HOME outside Git Bash: its home is USERPROFILE.
    const home = /^~([\\/]|$)/.test(repo)
      ? (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
      : ''
    cwd = joinPath(sessionCwd, home ? home + repo.slice(1) : repo)
    if (!(await $.fs.exists(cwd))) return noRepo(cwd)
  }
  // Workers run on sonnet at the least: a haiku request takes the session's model.
  const model = /haiku/i.test(asked) ? '' : asked
  // Any type the Agent tool can dispatch, but a fork is that tool's own.
  if (type === 'fork') return FORK_REFUSED
  const look = await readLook($)
  const list = await readWorkers($)
  const inWorktree = new Set(await readWorktrees($))
  const woken = new Map((await readTakeovers($)).map(t => [t.id, t]))

  // A blank `worker` names no one: the task goes as if it had none.
  const isNamed = worker !== undefined && worker.trim() !== ''
  let chosen: Worker | undefined
  if (isNamed) {
    chosen = findWorker(list, worker)
    if (chosen === undefined) {
      return noWorker(worker, list.map(w => w.address))
    }
  } else if (!isFresh) {
    // The most recent free worker of that type the crew started there, on
    // the model asked for (none asked for: one started on the session's),
    // however long its history: it compacts. A failed one is never free.
    chosen = list
      .filter(
        w =>
          samePath(w.cwd, cwd) &&
          (w.type || 'general-purpose') === type &&
          REUSABLE.has(w.status) &&
          !woken.has(w.id) &&
          w.asked !== null &&
          (model === '' ? w.asked === '' : w.asked === model || w.model === model),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  }

  // An agent its worker woke reports to that worker until the run ends: the
  // task waits, and goes from here then.
  const mark = chosen !== undefined ? woken.get(chosen.id) : undefined
  if (chosen !== undefined && mark !== undefined && mark.missed === undefined) return hold($, chosen, mark, task, title, callId)

  if (chosen !== undefined) {
    // Tasks held for it that once did not reach it go first, together.
    const before = mark?.held ?? []
    const all = [...before, { task, title }]
    const body = before.length > 0 ? heldTasks(all) : task
    // Delegate's own workers always had the crew's preamble; any other agent
    // may not have (a fork, one started with delegation off): it hears it all.
    const sent = await deliver($, {
      id: chosen.id,
      worker: chosen,
      text: `${body}\n\n${taskClose(chosen.asked)}`,
      line: { from: { name: look.name, id: ORCH_ID }, to: chosen.name, text: body, tone: 'orch', isQuietIfLost: true },
      patch: w => ({ status: 'working', task: title, tasks: w.tasks + all.length }),
      job: title,
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
      const where = own ? `a worktree of ${chosen.cwd}` : chosen.cwd
      const warn = own ? '' : busyHere(list, chosen.cwd, inWorktree, chosen.id)
      return given(chosen, where, (before.length > 0 ? heldWentFirst(before.length) : '') + warn)
    }
    if (isNamed) return unreachable(chosen.name, sent.reason)
  }

  const name = await freeName($, list)
  const address = name.toLowerCase()
  intended.set(address, { cwd, type })
  const spawned = await $.agent.spawn({
    prompt: task,
    description: title,
    name: address,
    subagentType: type,
    ...(!samePath(cwd, sessionCwd) ? { cwd } : {}),
    ...(model !== '' ? { model } : {}),
  })
  if (spawned.deny !== undefined) {
    // Where auto mode reviews only the calls in the model's own response (the
    // desktop app's), the Agent call made here has no verdict and is refused
    // however often it is made: the orchestrator's own Agent call is reviewed,
    // and the spawn hook takes its agent as this worker.
    if (UNREVIEWED.test(spawned.deny)) {
      intended.set(address, { cwd, type, task })
      return autoModeHandoff(name, address, title, type, model, cwd)
    }
    intended.delete(address)
    return notStarted(spawned.deny)
  }
  await setOrch($, 'delegating', `${title} → ${name}`)
  // The spawn hook has put it on the list by its address.
  const id = spawned.agentId ?? (await readWorkers($)).find(w => w.address === address)?.id
  if (id !== undefined) await markCall($, callId, id)
  return started(name, address, spawned.agentId, cwd, busyHere(list, cwd, inWorktree))
}

// Keeps a task for a woken worker until its run ends, and says so.
async function hold($: Engine, worker: Worker, mark: Takeover, task: string, title: string, callId?: string): Promise<string> {
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
  return heldFor(worker, mark.by, waiting)
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

/**
 * Where and as what type delegate meant a new worker to work, by its address:
 * the engine may not carry a spawn's `cwd` or type through to its own hooks.
 * One delegate handed to the orchestrator to start keeps its task, which
 * tells its agent from others if the Agent call names none.
 */
export const intended = new Map<string, { cwd: string; type: string; task?: string }>()

// The refusal of a spawn auto mode had no verdict for: it reviews the calls
// in a model's response, and a plugin's call is in none.
const UNREVIEWED = /\bgave no verdict for\b/

// Delegate calls in one message may run at once: each waits for the one
// before, so two never read the same crew and take one name or worker.
let delegating: Promise<unknown> = Promise.resolve()

/** Runs a delegate call once the ones before it are done. */
export async function delegateInTurn($: Engine, input: object, callId: string): Promise<string> {
  const run = delegating.then(async () => {
    // Its row reads "→ crew" until the worker is known.
    await markCall($, callId)
    // A woken worker whose run has ended gets what waited for it before
    // this; what did not reach it, the result says.
    const missed = (await quiet($, release($), 'release')) ?? []
    const result = await delegate($, input, callId)
    return [result, ...(await tellMissed($, missed))].join('\n')
  })
  delegating = run.catch(() => undefined)
  return run
}
