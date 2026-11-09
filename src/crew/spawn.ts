// The crew's part in every spawn: the worker it puts on the list, and what
// its agent hears first, where it works and on which model.
import type { HookFor } from 'claude-code'

import type { ParentLink, Worker } from '../../types'
import { DEFAULT_TYPE } from '../config'
import type { Engine } from '../engine'
import { modelAlias } from '../model-label'
import { endOf } from '../progress/runs'
import { beginRun, settleRun } from '../progress/run-store'
import { renamedAgent } from '../prompts/results'
import { forkPreamble, gitRules, workerPreamble } from '../prompts/worker'
import { runtime } from '../runtime'
import {
  readDropped,
  readIsOn,
  readIsolated,
  readLook,
  readWorkers,
  readWorktrees,
  updateIsolated,
  updateParents,
  updateWorkers,
  updateWorktrees,
} from '../state/atoms'
import { appendKept, setKept } from '../util/bounded'
import { samePath } from '../util/path'
import { cap, oneLine } from '../util/text'
import { adoptHanded, keepHandoff, takeIntent } from './delegate'
import { ORCH_ID, enlist, say, setJob } from './feed'
import { bareTitle, namedTitle } from './title'
import { claimName, findWorker, makeWorker, matesOf, patchWorker, prune, shelve, takenNow, unclaimNames, unshelve } from './workers'

// What an Agent call's model reads after its result, by tool_use_id: when
// the crew named its agent otherwise than the call did, the name its card
// and the roster show and the address SendMessage reaches it by; when its
// agent is the worker delegate handed over, what delegate's result would
// have said of it.
const agentCalls = runtime.spawn
const NOTES_KEEP = 50
// The Agent calls that asked for a worktree, by tool_use_id: their agent
// works there, not in the repository the worktree was made from. Kept in
// the state, as a reload may come between a call and its spawn (while the
// person is asked to allow it); the newest, as a call may spawn nothing.
const ISOLATED_KEEP = 50

/** An Agent call asked for a worktree: its agent works there. */
export function noteIsolated($: Engine, toolUseId: string) {
  return updateIsolated($, ids => appendKept(ids, [toolUseId], ISOLATED_KEEP, x => x))
}

/** An Agent call that asked for a worktree spawns nothing. */
export function forgetIsolated($: Engine, toolUseId: string) {
  return updateIsolated($, ids => ids.filter(x => x !== toolUseId))
}

// Whether the Agent call asked for a worktree, which its spawn takes.
async function takeIsolated($: Engine, toolUseId: string): Promise<boolean> {
  if (!(await readIsolated($)).includes(toolUseId)) return false
  await forgetIsolated($, toolUseId)
  return true
}

/** The crew's word for an Agent call on the agent it started, once. */
export function takeNote(toolUseId: string): string | undefined {
  const note = agentCalls.notes.get(toolUseId)
  agentCalls.notes.delete(toolUseId)
  return note
}

type OnSpawnHook = HookFor<'agent.spawn'>
type SpawnEvent = Parameters<OnSpawnHook>[1]

// A resumed agent had ended, whatever the crew's record of it says.
async function settleResumed($: Engine, id: string) {
  const was = findWorker([...(await readWorkers($)), ...(await readDropped($))], id)
  await settleRun($, { id, status: endOf(was?.status) })
}

async function wakeResumed($: Engine, id: string) {
  await unshelve($, id)
  await patchWorker($, id, () => ({ status: 'working' }))
  await beginRun($, id)
}

// Who the agent a spawn starts is to the crew: what delegate meant it to be,
// who it reports to, where it runs and its name.
async function identify($: Engine, e: SpawnEvent) {
  const look = await readLook($)
  const list = await readWorkers($)
  const sessionCwd = await $.session.cwd()
  // Only a worker `delegate` started, or handed to the orchestrator to
  // start, is the crew's to hand more work to.
  const intent = await takeIntent($, {
    name: e.name,
    prompt: e.prompt,
    description: e.description,
    type: e.subagentType || DEFAULT_TYPE,
    isFork: e.fork,
    isOrchestrators: e.parentAgentId === undefined,
  })
  const isCrew = intent !== undefined && !e.fork
  // One delegate handed to the orchestrator to start is as its delegate
  // call asked, whatever the Agent call says.
  const handoff = isCrew && intent.task !== undefined ? intent : undefined
  const handed = handoff?.handed
  // A worker's own spawn reports to it, and runs where it does.
  const parent = e.parentAgentId !== undefined ? list.find(w => w.id === e.parentAgentId) : undefined
  const reportsTo = parent?.name ?? look.name
  const cwd = e.cwd ?? intent?.cwd ?? parent?.cwd ?? sessionCwd
  // The crew's names, any of which may stand ahead of the title its call gave.
  const taken = await takenNow($, list)
  // Delegate's own, or one it handed to the orchestrator to start, has the
  // name delegate gave it; any other takes one no other member has, the
  // name its call gave when that fits.
  const claim = intent !== undefined ? undefined : claimName(taken, e.name)
  const name = claim?.name ?? cap(intent?.address ?? '')
  return { look, list, sessionCwd, intent, isCrew, handoff, handed, parent, reportsTo, cwd, claim, name, taken }
}

type Identified = Awaited<ReturnType<typeof identify>>

// What its agent hears first, and whether it works in a worktree.
async function briefFor($: Engine, e: SpawnEvent, who: Identified) {
  const { look, list, isCrew, parent, reportsTo, cwd, name } = who
  const inWorktree = new Set(await readWorktrees($))
  // Its own worktree, or the one of the worker that starts it, where it
  // starts too unless the call sends it elsewhere.
  const own = await takeIsolated($, e.tool_use_id)
  const shared = !own && e.cwd === undefined && parent !== undefined && inWorktree.has(parent.id)
  // Delegate's workers hear the crew's preamble in either mode; with
  // delegation off, the Agent tool's agents start as they were asked.
  const briefed = isCrew || (await readIsOn($))
  const prompt = !briefed
    ? e.prompt
    : e.fork
      ? forkPreamble(reportsTo, e.parentAgentId === undefined ? gitRules(cwd, name.toLowerCase()) : '') + e.prompt
      : workerPreamble(name, look.name, reportsTo, cwd, matesOf(list, name, cwd), own ? 'own' : shared ? 'parent' : undefined, inWorktree) + e.prompt
  return { prompt, worktree: own || shared }
}

// Where and on which model its agent runs, beyond what its call says.
function runOptions(e: SpawnEvent, who: Identified) {
  const { intent, isCrew, handed, cwd, sessionCwd } = who
  // A crew worker runs on the session's model, even of a type whose own
  // definition names another. The Agent tool's `model` takes an alias only,
  // so the session's id goes as its family; one that names none is left to
  // the agent's definition. One handed to the orchestrator runs on the model
  // delegate was asked, which its Agent call may leave out or name otherwise.
  const session = modelAlias(e.parentModel)
  const wanted = handed !== undefined ? handed.asked || session : intent !== undefined && !e.model ? session : undefined
  const model = wanted !== undefined ? { model: wanted } : {}
  // One the orchestrator started for delegate runs where delegate meant it
  // to, which its Agent call cannot say, and in the background as
  // delegate's own do.
  const intendedRun = isCrew && intent?.task !== undefined ? { background: true, ...(e.cwd === undefined && !samePath(cwd, sessionCwd) ? { cwd } : {}) } : {}
  return { ...model, ...intendedRun }
}

// Puts the started agent on the list and tells what it was given.
async function record($: Engine, e: SpawnEvent, who: Identified, id: string, startedModel: string | undefined, worktree: boolean) {
  const { intent, isCrew, handoff, handed, parent, reportsTo, cwd, claim, name, taken } = who
  // The name its call gave stays its address, unless another member has it:
  // the engine knows the agent by no other, and a hook cannot change it. So
  // a handed-over worker whose call named none is reached by its id.
  const address = e.name !== undefined && (claim === undefined || claim.isWantedFree) ? e.name : id
  // A handed-over worker's own note says its name and address.
  if (e.name !== undefined && handoff === undefined && name.toLowerCase() !== e.name.toLowerCase()) {
    setKept(agentCalls.notes, e.tool_use_id, renamedAgent(e.name, name, address), NOTES_KEEP)
  }
  const now = await $.clock.now()
  const task = bareTitle(e.description, name, taken) || oneLine(e.prompt, 60)
  const out: Worker[] = []
  const saved = await updateWorkers($, current => {
    out.length = 0
    const known = current.find(w => w.id === id)
    const fields = {
      name,
      address,
      task,
      // Spelled as delegate was asked, which its reuse compares with.
      type: intent?.type || e.subagentType || '',
      cwd,
      model: startedModel ?? '',
      // What delegate was asked, which a later reuse compares with: its
      // own spawn passes it on, and one it handed over kept it.
      asked: isCrew ? (handed?.asked ?? e.model ?? '') : null,
    }
    return known !== undefined
      ? current.map(w => (w.id === id ? { ...w, ...fields, status: 'starting' as const } : w))
      : prune([...current, makeWorker({ id, status: 'starting', ...fields }, now)], out)
  })
  await shelve($, out)
  await enlist($, saved)
  // Forks too; the marks of workers gone for good go, those of the shelf stay.
  const kept = new Set([...saved, ...(await readDropped($))].map(w => w.id))
  await updateWorktrees($, ids => [...ids.filter(x => x !== id && kept.has(x)), ...(worktree ? [id] : [])])
  const mine: ParentLink[] = parent ? [{ id, parent: parent.name, fork: e.fork }] : []
  await updateParents($, ps => [...ps.filter(x => x.id !== id && kept.has(x.id)), ...mine])
  await say($, { name: reportsTo, id: parent?.id ?? ORCH_ID }, { name, id }, task, parent ? 'worker' : 'orch')
  await setJob($, id, task)
  await beginRun($, id)
  // The delegate call that handed it over answered before it started: its
  // Agent call hears what that result could not say. A name the crew gave
  // otherwise is none of delegate's, so the two notes never meet.
  if (handed !== undefined) setKept(agentCalls.notes, e.tool_use_id, await adoptHanded($, handed, { id, name, address, cwd }, e.model), NOTES_KEEP)
}

/**
 * Puts each agent the session starts on the crew's list, with the crew's
 * brief ahead of its prompt, and runs one delegate meant where delegate
 * meant it to.
 */
export async function onSpawn($: Engine, e: SpawnEvent, next: Parameters<OnSpawnHook>[2]) {
  if (e.workflow !== undefined) return next(e)
  if (e.resume !== undefined) {
    await settleResumed($, e.resume.agentId)
    const resumed = await next(e)
    await wakeResumed($, e.resume.agentId)
    return resumed
  }
  const who = await identify($, e)
  const { prompt, worktree } = await briefFor($, e, who)
  // Claude Code's own list of agents shows the description: the crew's name
  // ahead of it tells its workers apart there.
  // The model its call named is not one delegate's handed-over worker takes:
  // `runOptions` sets delegate's, or none where the session's has no alias.
  const { model: called, ...unmodelled } = e
  const asked = who.handed !== undefined && called !== undefined ? unmodelled : e
  // One handed to the orchestrator whose Agent call starts nothing is still
  // meant: the call may be written again, and the end of the turn lets go
  // of its name and intent if it is not. Delegate's own spawn is delegate's
  // to give up.
  const { handoff } = who
  let started: Awaited<ReturnType<typeof next>>
  try {
    started = await next({ ...asked, prompt, description: namedTitle(who.name, e.description, who.taken), ...runOptions(e, who) })
  } catch (err) {
    if (handoff !== undefined) await keepHandoff($, handoff)
    throw err
  }
  if (started.agentId === undefined) {
    if (who.claim !== undefined) unclaimNames(who.name, ...(who.claim.isWantedFree && e.name !== undefined ? [e.name] : []))
    if (handoff !== undefined) await keepHandoff($, handoff)
    return started
  }
  await record($, e, who, started.agentId, started.model, worktree)
  return started
}
