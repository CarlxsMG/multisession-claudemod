// The crew's part in every spawn: the worker it puts on the list, and what
// its agent hears first, where it works and on which model.
import type { HookFor } from 'claude-code'

import type { ParentLink, Worker } from '../../types'
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
import { takeIntent } from './delegate'
import { ORCH_ID, enlist, say, setJob } from './feed'
import { claimName, findWorker, makeWorker, matesOf, patchWorker, prune, shelve, takenNow, unclaimNames, unshelve } from './workers'

// What an Agent call's model reads after its result when the crew named
// its agent otherwise than the call did, by tool_use_id: the name its card
// and the roster show, and the address SendMessage reaches it by.
const agentCalls = runtime.spawn
const RENAMED_KEEP = 50
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

/** The word for an Agent call whose agent the crew named otherwise, once. */
export function takeRenamed(toolUseId: string): string | undefined {
  const note = agentCalls.renamed.get(toolUseId)
  agentCalls.renamed.delete(toolUseId)
  return note
}

type OnSpawnHook = HookFor<'agent.spawn'>
/**
 * Puts each agent the session starts on the crew's list, with the crew's
 * brief ahead of its prompt, and runs one delegate meant where delegate
 * meant it to.
 */
export async function onSpawn($: Engine, e: Parameters<OnSpawnHook>[1], next: Parameters<OnSpawnHook>[2]) {
  if (e.workflow !== undefined) return next(e)
  if (e.resume !== undefined) {
    // A resumed agent had ended, whatever the crew's record of it says.
    const id = e.resume.agentId
    const was = findWorker([...(await readWorkers($)), ...(await readDropped($))], id)
    await settleRun($, { id, status: endOf(was?.status) })
    const resumed = await next(e)
    await unshelve($, e.resume.agentId)
    await patchWorker($, e.resume.agentId, () => ({ status: 'working' }))
    await beginRun($, e.resume.agentId)
    return resumed
  }
  const look = await readLook($)
  const list = await readWorkers($)
  const sessionCwd = await $.session.cwd()
  // Only a worker `delegate` started, or handed to the orchestrator to
  // start, is the crew's to hand more work to.
  const { key, intent } = await takeIntent($, e.name, e.prompt, e.fork)
  const isCrew = intent !== undefined && !e.fork
  // A worker's own spawn reports to it, and runs where it does.
  const parent = e.parentAgentId !== undefined ? list.find(w => w.id === e.parentAgentId) : undefined
  const reportsTo = parent?.name ?? look.name
  const cwd = e.cwd ?? intent?.cwd ?? parent?.cwd ?? sessionCwd
  // Delegate's own, or one it handed to the orchestrator to start, has the
  // name delegate gave it; any other takes one no other member has, the
  // name its call gave when that fits.
  const claim = intent !== undefined ? undefined : claimName(await takenNow($, list), e.name)
  const name = claim?.name ?? cap(e.name ?? key ?? '')
  // The name its call gave stays its address, unless another member has it.
  const addressOf = (id: string) => (e.name !== undefined && (claim === undefined || claim.isWantedFree) ? e.name : id)
  const inWorktree = new Set(await readWorktrees($))
  // Its own worktree, or the one of the worker that starts it, where it
  // starts too unless the call sends it elsewhere.
  const own = await takeIsolated($, e.tool_use_id)
  const shared = !own && e.cwd === undefined && parent !== undefined && inWorktree.has(parent.id)
  const worktree = own || shared
  // Delegate's workers hear the crew's preamble in either mode; with
  // delegation off, the Agent tool's agents start as they were asked.
  const briefed = isCrew || (await readIsOn($))
  const prompt = !briefed
    ? e.prompt
    : e.fork
      ? forkPreamble(reportsTo, e.parentAgentId === undefined ? gitRules(cwd, name.toLowerCase()) : '') + e.prompt
      : workerPreamble(name, look.name, reportsTo, cwd, matesOf(list, name, cwd), own ? 'own' : shared ? 'parent' : undefined, inWorktree) + e.prompt
  // A crew worker runs on the session's model, even of a type whose own
  // definition names another. The Agent tool's `model` takes an alias only,
  // so the session's id goes as its family; one that names none is left to
  // the agent's definition.
  const inherited = intent !== undefined && !e.model ? modelAlias(e.parentModel) : undefined
  const model = inherited !== undefined ? { model: inherited } : {}
  // One the orchestrator started for delegate runs where delegate meant it
  // to, which its Agent call cannot say, and in the background as
  // delegate's own do.
  const intendedRun = isCrew && intent.task !== undefined ? { background: true, ...(e.cwd === undefined && !samePath(cwd, sessionCwd) ? { cwd } : {}) } : {}
  const started = await next({ ...e, prompt, ...model, ...intendedRun })
  if (started.agentId === undefined) {
    if (claim !== undefined) unclaimNames(name, ...(claim.isWantedFree && e.name !== undefined ? [e.name] : []))
    return started
  }
  const id = started.agentId
  const address = addressOf(id)
  if (e.name !== undefined && name.toLowerCase() !== e.name.toLowerCase()) {
    setKept(agentCalls.renamed, e.tool_use_id, renamedAgent(e.name, name, address), RENAMED_KEEP)
  }
  const now = await $.clock.now()
  const task = e.description || oneLine(e.prompt, 60)
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
      model: started.model ?? '',
      asked: isCrew ? (e.model ?? '') : null,
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
  return started
}
